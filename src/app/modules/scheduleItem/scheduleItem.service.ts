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
// Dedicated select for list views — avoids fetching unused relations
// Only fetches what the list response actually needs.
// ─────────────────────────────────────────────────────────────────────────────
const scheduleItemListSelect = {
  ...scheduleItemSelect,
  children: {
    where: { isDeleted: false },
    select: { id: true, fullName: true, image: true },
  },
  userCompletedActivities: {
    select: { isCompleted: true },
    orderBy: { completedAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.ScheduleItemSelect;

/**
 * Build the shared date + day filter used in both list and monthly queries.
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

  const accessId = (req as any).accessId;
  const uploadedFiles = await handleFileUploads(files);

  // ── Provider validation  ──
  if (data.providerId) {
    const provider = await prisma.noteProvider.findUnique({
      where: { id: data.providerId },
      select: { id: true },
    });

    if (!provider) {
      throw new ApiError(httpStatus.NOT_FOUND, "Provider not found");
    }
  }

  // ── Child validation ──
  if (!data.isForAllChild && data.childIds?.length) {
    const validChildren = await prisma.children.findMany({
      where: {
        id: { in: data.childIds },
        creatorId: accessId,
        isDeleted: false,
      },
      select: { id: true },
    });

    const validIds = validChildren.map((c) => c.id);
    const invalidIds = (data.childIds as string[]).filter(
      (id) => !validIds.includes(id),
    );

    if (invalidIds.length > 0) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        `Invalid child IDs: ${invalidIds.join(", ")}. These children do not exist or belong to another user.`,
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
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "No children found for this user to assign.",
      );
    }

    finalChildIds = myChildren.map((c) => c.id);
  }

  const result = await prisma.scheduleItem.create({
    data: {
      userId: accessId,
      childIds: finalChildIds,
      children: { connect: finalChildIds.map((id) => ({ id })) },
      providerId: data.providerId ?? null,
      itemType: data.itemType,
      title: data.title,
      description: data.description ?? null,
      image: uploadedFiles.image ?? null,
      link: data.link ?? null,
      fileUrl: data.fileUrl ?? null,
      notes: data.notes ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      duration: data.duration ? Number(data.duration) : null,
      daysPWeek: data.daysPWeek ? Number(data.daysPWeek) : null,
      days: data.days ?? [],
      isAddedCalender: data.isAddedCalender ?? false,
      isForAllChild: data.isForAllChild ?? false,
      eventCategory: data.eventCategory ?? null,
      location: data.location ?? null,
      weeks: data.weeks ? Number(data.weeks) : null,
      reminderTime: data.reminderTime ? Number(data.reminderTime) : null,
      repeatType: data.repeatType ?? "None",
      repeatEndDate: data.repeatEndDate ? new Date(data.repeatEndDate) : null,
      stage: data.stage ?? null,
      activityType: data.activityType ?? null,
      skill: data.skill ?? [],
      materials: data.materials ?? null,
      howToDoIt: data.howToDoIt ?? null,
      whatItHelpsWith: data.whatItHelpsWith ?? null,
    },
    select: scheduleItemSelect,
  });

  await CacheInvalidator.onRecordCreate("scheduleItem");

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
// Uses dedicated list select to avoid over-fetching (user + provider
// are not needed here since the list is already scoped to the current user).
// ─────────────────────────────────────────────────────────────────────────────

const getScheduleItemListByDate = async (
  req: Request,
  options: IPaginationOptions,
  filters: IScheduleItemFilterRequest,
) => {
  const userId = req.user!.id;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { date, childId, searchTerm, status, itemType } = filters;

  const accessId = (req as any).accessId;

  const filterDateStr: string = date ?? toUTCDateKey(new Date());

  const andConditions: Prisma.ScheduleItemWhereInput[] = [
    { userId: accessId },
    { isDeleted: false },
    buildDateAndDayFilter(filterDateStr),
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

  if (itemType && Object.values(ItemType).includes(itemType as ItemType)) {
    andConditions.push({ itemType: itemType as ItemType });
  }

  const where: Prisma.ScheduleItemWhereInput = { AND: andConditions };

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
    // Fetch only what's needed for the list view — no user/provider relations
    const items = await prisma.scheduleItem.findMany({
      skip,
      take: limit,
      where,
      orderBy: { startDate: "asc" },
      select: scheduleItemListSelect,
    });

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

    const total = await prisma.scheduleItem.count({ where });

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

    const data = filtered.map((item) => ({
      ...item,
      isCompleted: item.userCompletedActivities?.[0]?.isCompleted ?? false,
      userCompletedActivities: undefined,
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
// Optimized: iterates each item's actual date range instead of full 31 days.
// ─────────────────────────────────────────────────────────────────────────────

const getMonthlyScheduleItems = async (req: Request) => {
  const userId = req.user!.id;
  const { month } = req.query; // "YYYY-MM"

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

  const accessId = (req as any).accessId;

  const monthStartStr = `${yearStr}-${monthStr.padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const monthEndStr = `${yearStr}-${monthStr.padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const monthStart = toUTCStartOfDay(monthStartStr);
  const monthEnd = toUTCEndOfDay(monthEndStr);

  const cacheKey = CacheKeys.myList("scheduleItem:monthly", accessId, {
    month,
  });

  return cacheOr(cacheKey, TTL.MEDIUM, async () => {
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

    // Pre-compute day names for each date string to avoid repeated parsing
    const dayNameCache = new Map<string, string>();

    const itemsByDate = new Map<
      string,
      { categories: string[]; types: string[] }
    >();

    // Optimized: for each item, iterate only its date range within the month
    for (const item of itemsThisMonth) {
      if (!item.startDate || !item.endDate) continue;

      const itemStartKey = toUTCDateKey(item.startDate);
      const itemEndKey = toUTCDateKey(item.endDate);

      // Clamp to month boundaries
      const rangeStart =
        itemStartKey > monthStartStr ? itemStartKey : monthStartStr;
      const rangeEnd = itemEndKey < monthEndStr ? itemEndKey : monthEndStr;

      if (rangeStart > rangeEnd) continue;

      // Convert start/end to Date objects for iteration
      const [sY, sM, sD] = rangeStart.split("-").map(Number);
      const [eY, eM, eD] = rangeEnd.split("-").map(Number);

      const iterDate = new Date(Date.UTC(sY, sM - 1, sD));
      const endDateObj = new Date(Date.UTC(eY, eM - 1, eD));

      while (iterDate <= endDateObj) {
        const dateStr = toUTCDateKey(iterDate);

        // Layer 2: day name check (cache to avoid repeated string ops)
        if (item.days.length > 0) {
          let dayName = dayNameCache.get(dateStr);
          if (!dayName) {
            dayName = getDayNameFromDateStr(dateStr);
            dayNameCache.set(dateStr, dayName);
          }
          if (!item.days.includes(dayName)) {
            iterDate.setUTCDate(iterDate.getUTCDate() + 1);
            continue;
          }
        }

        // Layer 3: frequency check
        if (
          !isWithinFrequencyLimit(
            {
              days: item.days,
              daysPWeek: item.daysPWeek,
              startDate: item.startDate,
              endDate: item.endDate,
            },
            dateStr,
          )
        ) {
          iterDate.setUTCDate(iterDate.getUTCDate() + 1);
          continue;
        }

        const entry = itemsByDate.get(dateStr) ?? { categories: [], types: [] };
        if (
          item.eventCategory &&
          !entry.categories.includes(item.eventCategory)
        ) {
          entry.categories.push(item.eventCategory);
        }
        if (!entry.types.includes(item.itemType)) {
          entry.types.push(item.itemType);
        }
        itemsByDate.set(dateStr, entry);

        iterDate.setUTCDate(iterDate.getUTCDate() + 1);
      }
    }

    // Generate all date strings for the response
    const allDatesInMonth: string[] = [];
    const current = new Date(Date.UTC(year, monthIndex, 1));
    while (current <= monthEnd) {
      allDatesInMonth.push(toUTCDateKey(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

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
// GET BY ID — uses full select with all relations
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
          select: {
            id: true,
            role: true,
            userDetails: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                files: true,
              },
            },
          },
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
// GET MY LIST (user-scoped, no date filter)
// ─────────────────────────────────────────────────────────────────────────────

const getMyScheduleItem = async (
  req: Request,
  options: IPaginationOptions,
  filters: IScheduleItemFilterRequest,
) => {
  const userId = req.user!.id;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const accessId = (req as any).accessId;

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

  const accessId = (req as any).accessId;
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
// TOGGLE STATUS (Pending ↔ Completed)
// ─────────────────────────────────────────────────────────────────────────────

const toggleStatusScheduleItem = async (req: Request) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const accessId = (req as any).accessId;

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
  const accessId = (req as any).accessId;

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
  const accessId = (req as any).accessId;

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
