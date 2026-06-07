import httpStatus from "http-status";
import { ItemStatus, ItemType, Prisma } from "@prisma/client";
import { Request } from "express";
import { scheduleItemSelect } from "./scheduleItem.select";
import { buildFilterConditions } from "./scheduleItem.utils";
import { handleFileUploads } from "../../../utils/handleFile";
import prisma from "../../../shared/prisma";
import { IPaginationOptions } from "../../../interfaces/pagination";
import { paginationHelper } from "../../../shared/pagination";
import ApiError from "../../../error/ApiErrors";
import {
  CacheInvalidator,
  CacheKeys,
  TTL,
  cacheOr,
  invalidatePattern,
} from "../../../lib/redisConnection";

import {
  getDayNameFromDateStr,
  isWithinFrequencyLimit,
  toUTCDateKey,
  toUTCEndOfDay,
  toUTCStartOfDay,
} from "../../../utils/utcDate";
import { getEffectiveAccessId } from "../../../helpers/careGiverAccessor";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type IScheduleItemFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  status?: string;
  itemType?: string;
  date?: string;
  childId?: string;
};

const scheduleItemSearchableFields = ["title", "description"];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve accessId:
 *  - CAREGIVER → their creator's id
 *  - USER / ADMIN → their own id
 */
async function resolveAccessId(userId: string): Promise<string> {
  return getEffectiveAccessId(userId);
}

/**
 * Build the shared date + day filter used in both list and monthly queries.
 * Mirrors the 3-layer filter from the original event service exactly.
 *
 * Layer 1 — date range: startDate <= filterDate <= endDate
 * Layer 2 — day name:   days[] contains filterDayName OR days[] is empty
 */
function buildDateAndDayFilter(
  filterDateStr: string,
): Prisma.ScheduleItemWhereInput {
  return {
    startDate: { lte: toUTCEndOfDay(filterDateStr) },
    endDate: { gte: toUTCStartOfDay(filterDateStr) },
    OR: [
      { days: { has: getDayNameFromDateStr(filterDateStr) } },
      { days: { isEmpty: true } },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

const createScheduleItem = async (req: Request) => {
  const userId = req.user!.id;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const accessId = await resolveAccessId(userId);
  const uploadedFiles = await handleFileUploads(files);

  // ── Provider validation (result check করা হচ্ছে এখন) ──
  if (data.providerId) {
    const provider = await prisma.noteProvider.findUnique({
      where: { id: data.providerId },
      select: { id: true },
    });

    if (!provider) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Provider not found');
    }
  }

  // ── Child validation ──
  if (!data.isForAllChild && data.childIds?.length) {
    const validChildren = await prisma.children.findMany({
      where: { id: { in: data.childIds }, creatorId: accessId, isDeleted: false },
      select: { id: true },
    });

    const validIds = validChildren.map((c) => c.id);
    const invalidIds = (data.childIds as string[]).filter(
      (id) => !validIds.includes(id),
    );

    if (invalidIds.length > 0) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        `Invalid child IDs: ${invalidIds.join(', ')}. These children do not exist or belong to another user.`,
      );
    }
  }

  // ── Resolve all children if isForAllChild ──
  let finalChildIds: string[] = data.childIds ?? [];

  if (data.isForAllChild) {
    const myChildren = await prisma.children.findMany({
      where: { creatorId: accessId, isDeleted: false },
      select: { id: true },
    });

    if (myChildren.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'No children found for this user to assign.');
    }

    finalChildIds = myChildren.map((c) => c.id);
  }

  // ── Create — explicitly list every field, never blind spread ──
  const result = await prisma.scheduleItem.create({
    data: {
      // ownership
      userId:       accessId,
      // relations
      childIds:     finalChildIds,
      children:     { connect: finalChildIds.map((id) => ({ id })) },
      providerId:   data.providerId ?? null,          // ← explicit
      // shared
      itemType:     data.itemType,
      title:        data.title,
      description:  data.description   ?? null,
      image:        uploadedFiles.image ?? null,
      link:         data.link           ?? null,
      fileUrl:      data.fileUrl        ?? null,
      notes:        data.notes          ?? null,
      startDate:    data.startDate      ? new Date(data.startDate) : null,
      endDate:      data.endDate        ? new Date(data.endDate)   : null,
      startTime:    data.startTime      ?? null,
      endTime:      data.endTime        ?? null,
      duration:     data.duration       ? Number(data.duration)    : null,
      daysPWeek:    data.daysPWeek      ? Number(data.daysPWeek)   : null,
      days:         data.days           ?? [],
      isAddedCalender: data.isAddedCalender ?? false,
      isForAllChild:   data.isForAllChild   ?? false,
      // event-specific
      eventCategory:  data.eventCategory  ?? null,
      location:       data.location       ?? null,
      weeks:          data.weeks          ? Number(data.weeks) : null,
      reminderTime:   data.reminderTime   ? Number(data.reminderTime) : null,
      repeatType:     data.repeatType     ?? 'None',
      repeatEndDate:  data.repeatEndDate  ? new Date(data.repeatEndDate) : null,
      // activity-specific
      stage:           data.stage           ?? null,
      activityType:    data.activityType    ?? null,
      skill:           data.skill           ?? [],
      materials:       data.materials       ?? null,
      howToDoIt:       data.howToDoIt       ?? null,
      whatItHelpsWith: data.whatItHelpsWith ?? null,
    },
    select: scheduleItemSelect,
  });

  await CacheInvalidator.onRecordCreate('scheduleItem');

  return result;
};
// ─────────────────────────────────────────────────────────────────────────────
// GET LIST (admin / global)
// ─────────────────────────────────────────────────────────────────────────────

const getScheduleItemList = async (
  req: Request,
  options: IPaginationOptions,
  filters: IScheduleItemFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("scheduleItem", {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.ScheduleItemWhereInput[] = [
      { isDeleted: false },
    ];

    if (searchTerm) {
      andConditions.push({
        OR: scheduleItemSearchableFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const where: Prisma.ScheduleItemWhereInput = { AND: andConditions };

    const [result, total] = await Promise.all([
      prisma.scheduleItem.findMany({
        skip,
        take: limit,
        where,
        orderBy: { createdAt: "desc" },
        select: scheduleItemSelect,
      }),
      prisma.scheduleItem.count({ where }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET BY DATE — unified event + activity list for a given date
// Mirrors getEventListForAllChildOrSingleChildByDateIntoDb exactly
// ─────────────────────────────────────────────────────────────────────────────

const getScheduleItemListByDate = async (
  req: Request,
  options: IPaginationOptions,
  filters: IScheduleItemFilterRequest,
) => {
  const userId = req.user!.id;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { date, childId, searchTerm, status, itemType } = filters;

  // ----------------------------------------------------------
  // STEP 1: Resolve accessId
  // ----------------------------------------------------------
  const accessId = await resolveAccessId(userId);

  // ----------------------------------------------------------
  // STEP 2: Resolve filter date (client-supplied ISO "YYYY-MM-DD")
  // If not provided, fall back to today's UTC date string.
  // Client should always send this to avoid timezone issues.
  // ----------------------------------------------------------
  const filterDateStr: string = date ?? toUTCDateKey(new Date());
  // const filterDayName = getDayNameFromDateStr(filterDateStr);

  // ----------------------------------------------------------
  // STEP 3: Build WHERE conditions
  // ----------------------------------------------------------
  const andConditions: Prisma.ScheduleItemWhereInput[] = [
    { userId: accessId },
    { isDeleted: false },
    // Layer 1 + 2: date range and day name filter
    buildDateAndDayFilter(filterDateStr),
    // Must have at least one child or be for all children
    {
      OR: [
        { isForAllChild: true },
        { children: { some: { isDeleted: false } } },
      ],
    },
  ];

  if (childId) {
    andConditions.push({
      childIds: { has: childId },
      isForAllChild: false,
      children: { some: { id: childId, isDeleted: false } },
    });
  }

  if (searchTerm) {
    andConditions.push({
      OR: scheduleItemSearchableFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  if (status) {
    const validStatuses = (Array.isArray(status) ? status : [status]).filter(
      (s): s is ItemStatus =>
        Object.values(ItemStatus).includes(s as ItemStatus),
    );
    if (validStatuses.length > 0) {
      andConditions.push({ status: { in: validStatuses } });
    }
  }

  // Filter by itemType (Event | Activity) if provided
  if (itemType && Object.values(ItemType).includes(itemType as ItemType)) {
    andConditions.push({ itemType: itemType as ItemType });
  }

  const where: Prisma.ScheduleItemWhereInput = { AND: andConditions };

  // Cache key scoped to user + date + filters
  const cacheKey = CacheKeys.myList("scheduleItem:byDate", accessId, {
    filterDateStr,
    childId,
    searchTerm,
    status,
    itemType,
    page,
    limit,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    // ----------------------------------------------------------
    // STEP 4: Fetch items
    // ----------------------------------------------------------
    const items = await prisma.scheduleItem.findMany({
      skip,
      take: limit,
      where,
      orderBy: { startDate: "asc" },
      select: {
        ...scheduleItemSelect,
        children: {
          where: { isDeleted: false },
          select: { id: true, fullName: true, image: true },
        },
        user: {
          select: { id: true, fullName: true, image: true, role: true },
        },
        userCompletedActivities: {
          select: { isCompleted: true },
          orderBy: { completedAt: "desc" },
          take: 1,
        },
        provider: {
          select: { id: true, fullName: true },
        },
      },
    });

    // ----------------------------------------------------------
    // STEP 5: Layer 3 — in-memory daysPWeek frequency filter
    // (Same logic as existing event service; Prisma can't do this)
    // ----------------------------------------------------------
    const filtered = items.filter((item) =>
      isWithinFrequencyLimit(
        {
          days: item.days,
          daysPWeek: item.daysPWeek,
          startDate: item.startDate,
          endDate: item.endDate,
        },
        filterDateStr,
      ),
    );

    // ----------------------------------------------------------
    // STEP 6: Count for pagination meta
    // ----------------------------------------------------------
    const total = await prisma.scheduleItem.count({ where });

    // ----------------------------------------------------------
    // STEP 7: Count today's completed items (UTC today)
    // ----------------------------------------------------------
    const todayStr = toUTCDateKey(new Date());
    const completedToday = await prisma.scheduleItem.count({
      where: {
        userId: accessId,
        isDeleted: false,
        status: ItemStatus.Completed,
        startDate: { lte: toUTCEndOfDay(todayStr) },
        endDate: { gte: toUTCStartOfDay(todayStr) },
        OR: [
          { days: { has: getDayNameFromDateStr(todayStr) } },
          { days: { isEmpty: true } },
        ],
      },
    });

    // ----------------------------------------------------------
    // STEP 8: Shape the unified response
    // ----------------------------------------------------------
    const data = filtered.map((item) => ({
      ...item,
      // Flatten completion status from the relation
      isCompleted: item.userCompletedActivities?.[0]?.isCompleted ?? false,
      userCompletedActivities: undefined,
      // Expose child as single (first) or array depending on consumer preference
      child: (item.children as any)?.[0] ?? null,
    }));

    return {
      meta: { total, page, limit, completedToday },
      data,
    };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MONTHLY — dot indicators for calendar view
// Mirrors getCurrentMonthEvent exactly
// ─────────────────────────────────────────────────────────────────────────────

const getMonthlyScheduleItems = async (req: Request) => {
  const userId = req.user!.id;
  const { month } = req.query; // "YYYY-MM"

  // ----------------------------------------------------------
  // STEP 1: Validate month format
  // ----------------------------------------------------------
  if (!month || typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Invalid or missing "month" parameter. Use YYYY-MM format.',
    );
  }

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;

  if (isNaN(year) || isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid year or month value.");
  }

  // ----------------------------------------------------------
  // STEP 2: Resolve accessId
  // ----------------------------------------------------------
  const accessId = await resolveAccessId(userId);

  // ----------------------------------------------------------
  // STEP 3: Build UTC month boundaries from the "YYYY-MM" string
  // (never use server new Date() — derive from the param)
  // ----------------------------------------------------------
  const monthStartStr = `${yearStr}-${monthStr.padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const monthEndStr = `${yearStr}-${monthStr.padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const monthStart = toUTCStartOfDay(monthStartStr);
  const monthEnd = toUTCEndOfDay(monthEndStr);

  const cacheKey = CacheKeys.myList("scheduleItem:monthly", accessId, {
    month,
  });

  return cacheOr(cacheKey, TTL.MEDIUM, async () => {
    // ----------------------------------------------------------
    // STEP 4: Fetch all items overlapping this month
    // ----------------------------------------------------------
    const itemsThisMonth = await prisma.scheduleItem.findMany({
      where: {
        userId: accessId,
        isDeleted: false,
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
        OR: [
          { isForAllChild: true },
          { children: { some: { isDeleted: false } } },
        ],
      },
      select: {
        startDate: true,
        endDate: true,
        days: true,
        daysPWeek: true,
        eventCategory: true,
        itemType: true,
      },
      orderBy: { startDate: "asc" },
    });

    // ----------------------------------------------------------
    // STEP 5: Generate all date strings in this month
    // ----------------------------------------------------------
    const allDatesInMonth: string[] = [];
    const current = new Date(Date.UTC(year, monthIndex, 1));

    while (current <= monthEnd) {
      allDatesInMonth.push(toUTCDateKey(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    // ----------------------------------------------------------
    // STEP 6: Per-date 3-layer filter (same as event service)
    // ----------------------------------------------------------
    const itemsByDate = new Map<
      string,
      { categories: string[]; types: string[] }
    >();

    for (const dateStr of allDatesInMonth) {
      const dayName = getDayNameFromDateStr(dateStr);
      const categories: string[] = [];
      const types: string[] = [];

      for (const item of itemsThisMonth) {
        if (!item.startDate || !item.endDate) continue;

        // Layer 1: date within item range
        const itemStartKey = toUTCDateKey(item.startDate);
        const itemEndKey = toUTCDateKey(item.endDate);
        if (dateStr < itemStartKey || dateStr > itemEndKey) continue;

        // Layer 2: day name matches
        if (item.days.length > 0 && !item.days.includes(dayName)) continue;

        // Layer 3: daysPWeek frequency
        const withinLimit = isWithinFrequencyLimit(
          {
            days: item.days,
            daysPWeek: item.daysPWeek,
            startDate: item.startDate,
            endDate: item.endDate,
          },
          dateStr,
        );
        if (!withinLimit) continue;

        if (item.eventCategory) categories.push(item.eventCategory);
        types.push(item.itemType);
      }

      if (categories.length > 0 || types.length > 0) {
        itemsByDate.set(dateStr, { categories, types });
      }
    }

    // ----------------------------------------------------------
    // STEP 7: Build response array
    // ----------------------------------------------------------
    const monthlyData = allDatesInMonth.map((dateStr) => {
      const entry = itemsByDate.get(dateStr);
      return {
        date: dateStr,
        hasItems: !!entry,
        categories: entry?.categories ?? [],
        types: entry?.types ?? [],
      };
    });

    return {
      month,
      daysInMonth: allDatesInMonth.length,
      data: monthlyData,
    };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET BY ID
// ─────────────────────────────────────────────────────────────────────────────

const getScheduleItemById = async (req: Request) => {
  const { id } = req.params;

  return cacheOr(CacheKeys.single("scheduleItem", id), TTL.MEDIUM, async () => {
    const result = await prisma.scheduleItem.findUnique({
      where: { id, isDeleted: false },
      select: {
        ...scheduleItemSelect,
        children: {
          where: { isDeleted: false },
          select: { id: true, fullName: true, image: true, dateOfBirth: true },
        },
        provider: {
          select: {
            id: true,
            fullName: true,
          },
        },
        user: {
          select: { id: true, fullName: true, image: true, role: true },
        },
      },
    });

    if (!result) {
      throw new ApiError(httpStatus.NOT_FOUND, "ScheduleItem not found");
    }

    return result;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY LIST (user-scoped, no date filter — for management screens)
// ─────────────────────────────────────────────────────────────────────────────

const getMyScheduleItem = async (
  req: Request,
  options: IPaginationOptions,
  filters: IScheduleItemFilterRequest,
) => {
  const userId = req.user!.id;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const accessId = await resolveAccessId(userId);

  const cacheKey = CacheKeys.myList("scheduleItem", accessId, {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.ScheduleItemWhereInput[] = [
      { userId: accessId },
      { isDeleted: false },
    ];

    if (searchTerm) {
      andConditions.push({
        OR: scheduleItemSearchableFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const where: Prisma.ScheduleItemWhereInput = { AND: andConditions };

    const [result, total] = await Promise.all([
      prisma.scheduleItem.findMany({
        skip,
        take: limit,
        where,
        orderBy: { createdAt: "desc" },
        select: scheduleItemSelect,
      }),
      prisma.scheduleItem.count({ where }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

const updateScheduleItem = async (req: Request) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const accessId = await resolveAccessId(userId);
  const uploadedFiles = await handleFileUploads(files);

  const existing = await prisma.scheduleItem.findUnique({
    where: { id, isDeleted: false },
  });

  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "ScheduleItem not found");
  }

  if (existing.userId !== accessId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You do not have permission to update this item",
    );
  }

  // Resolve updated childIds
  let childUpdateClause: { connect: { id: string }[] } | undefined;

  if (data.isForAllChild === true) {
    const myChildren = await prisma.children.findMany({
      where: { creatorId: accessId, isDeleted: false },
      select: { id: true },
    });

    if (myChildren.length === 0) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "No children found for this user.",
      );
    }

    childUpdateClause = { connect: myChildren.map((c) => ({ id: c.id })) };
  } else if (data.childIds?.length) {
    const validChildren = await prisma.children.findMany({
      where: {
        id: { in: data.childIds },
        isDeleted: false,
        creatorId: accessId,
      },
      select: { id: true },
    });

    const validIds = validChildren.map((c) => c.id);
    const invalidIds = (data.childIds as string[]).filter(
      (cid) => !validIds.includes(cid),
    );

    if (invalidIds.length > 0) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        `Invalid child IDs: ${invalidIds.join(", ")}. These children do not exist or belong to another user.`,
      );
    }

    childUpdateClause = { connect: validIds.map((cid) => ({ id: cid })) };
  }

  // Build update payload — only include fields present in the request body
  const updateData: Prisma.ScheduleItemUpdateInput = {
    ...(data.itemType !== undefined && { itemType: data.itemType }),
    ...(data.title !== undefined && { title: data.title }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.link !== undefined && { link: data.link }),
    ...(data.fileUrl !== undefined && { fileUrl: data.fileUrl }),
    ...(data.notes !== undefined && { notes: data.notes }),
    ...(data.startDate !== undefined && {
      startDate: new Date(data.startDate),
    }),
    ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
    ...(data.startTime !== undefined && { startTime: data.startTime }),
    ...(data.endTime !== undefined && { endTime: data.endTime }),
    ...(data.duration !== undefined && { duration: Number(data.duration) }),
    ...(data.daysPWeek !== undefined && { daysPWeek: Number(data.daysPWeek) }),
    ...(data.days !== undefined && { days: data.days }),
    ...(data.isAddedCalender !== undefined && {
      isAddedCalender: data.isAddedCalender,
    }),
    ...(data.isForAllChild !== undefined && {
      isForAllChild: data.isForAllChild,
    }),
    ...(data.eventCategory !== undefined && {
      eventCategory: data.eventCategory,
    }),
    ...(data.location !== undefined && { location: data.location }),
    ...(data.weeks !== undefined && { weeks: Number(data.weeks) }),
    ...(data.reminderTime !== undefined && {
      reminderTime: Number(data.reminderTime),
    }),
    ...(data.repeatType !== undefined && { repeatType: data.repeatType }),
    ...(data.repeatEndDate !== undefined && {
      repeatEndDate: new Date(data.repeatEndDate),
    }),
    ...(data.stage !== undefined && { stage: data.stage }),
    ...(data.activityType !== undefined && { activityType: data.activityType }),
    ...(data.skill !== undefined && { skill: data.skill }),
    ...(data.materials !== undefined && { materials: data.materials }),
    ...(data.howToDoIt !== undefined && { howToDoIt: data.howToDoIt }),
    ...(data.whatItHelpsWith !== undefined && {
      whatItHelpsWith: data.whatItHelpsWith,
    }),
    ...(data.providerId !== undefined && {
      providerId: data.providerId ?? null,
    }),
    ...(uploadedFiles.image && { image: uploadedFiles.image }),
    ...(childUpdateClause && { children: childUpdateClause }),
  };

  const result = await prisma.scheduleItem.update({
    where: { id },
    data: updateData,
    select: scheduleItemSelect,
  });

  // Invalidate: single record + all lists for this user
  await CacheInvalidator.onOwnedRecordUpdate("scheduleItem", id, accessId);
  // Also bust date-based and monthly caches for this user
  await Promise.all([
    invalidatePattern(CacheKeys.myListPattern("scheduleItem:byDate", accessId)),
    invalidatePattern(
      CacheKeys.myListPattern("scheduleItem:monthly", accessId),
    ),
  ]);

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE STATUS (Pending ↔ Completed)
// ─────────────────────────────────────────────────────────────────────────────

const toggleStatusScheduleItem = async (req: Request) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const accessId = await resolveAccessId(userId);

  const existing = await prisma.scheduleItem.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, status: true, userId: true },
  });

  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "ScheduleItem not found");
  }

  if (existing.userId !== accessId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You do not have permission to update this item",
    );
  }

  const newStatus =
    existing.status === ItemStatus.Completed
      ? ItemStatus.Pending
      : ItemStatus.Completed;

  const result = await prisma.scheduleItem.update({
    where: { id },
    data: { status: newStatus },
    select: scheduleItemSelect,
  });

  // Invalidate single record + user's list caches
  await CacheInvalidator.onOwnedRecordUpdate("scheduleItem", id, accessId);
  await Promise.all([
    invalidatePattern(CacheKeys.myListPattern("scheduleItem:byDate", accessId)),
    invalidatePattern(
      CacheKeys.myListPattern("scheduleItem:monthly", accessId),
    ),
  ]);

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// SOFT DELETE
// ─────────────────────────────────────────────────────────────────────────────

const softDeleteScheduleItem = async (req: Request) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const accessId = await resolveAccessId(userId);

  const existing = await prisma.scheduleItem.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, userId: true },
  });

  if (!existing) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "ScheduleItem not found or already deleted",
    );
  }

  if (existing.userId !== accessId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You do not have permission to delete this item",
    );
  }

  const result = await prisma.scheduleItem.update({
    where: { id },
    data: { isDeleted: true },
    select: scheduleItemSelect,
  });

  await CacheInvalidator.onRecordDelete("scheduleItem", id, accessId);
  await Promise.all([
    invalidatePattern(CacheKeys.myListPattern("scheduleItem:byDate", accessId)),
    invalidatePattern(
      CacheKeys.myListPattern("scheduleItem:monthly", accessId),
    ),
  ]);

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// HARD DELETE
// ─────────────────────────────────────────────────────────────────────────────

const deleteScheduleItem = async (req: Request) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const accessId = await resolveAccessId(userId);

  const existing = await prisma.scheduleItem.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });

  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "ScheduleItem not found");
  }

  if (existing.userId !== accessId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You do not have permission to delete this item",
    );
  }

  const result = await prisma.scheduleItem.delete({ where: { id } });

  await CacheInvalidator.onRecordDelete("scheduleItem", id, accessId);
  await Promise.all([
    invalidatePattern(CacheKeys.myListPattern("scheduleItem:byDate", accessId)),
    invalidatePattern(
      CacheKeys.myListPattern("scheduleItem:monthly", accessId),
    ),
  ]);

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export const scheduleItemService = {
  createScheduleItem,
  getScheduleItemList,
  getScheduleItemListByDate,
  getMonthlyScheduleItems,
  getScheduleItemById,
  getMyScheduleItem,
  updateScheduleItem,
  toggleStatusScheduleItem,
  softDeleteScheduleItem,
  deleteScheduleItem,
};
