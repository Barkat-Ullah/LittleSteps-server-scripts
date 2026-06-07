import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { preferenceSensoryNoteSelect } from "./preferenceSensoryNote.select";
import { buildFilterConditions } from "./preferenceSensoryNote.utils";
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
} from "../../../lib/redisConnection";

// -------------------------------------------------------
// create PreferenceSensoryNote
// -------------------------------------------------------
const createPreferenceSensoryNote = async (req: Request) => {
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);
  const addedData = { ...data, image: uploadedFiles.image };
  const result = await prisma.preferenceSensoryNote.create({
    data: addedData,
    select: preferenceSensoryNoteSelect,
  });
  await CacheInvalidator.onRecordCreate("preferenceSensoryNote");
  return result;
};

// -------------------------------------------------------
// get all PreferenceSensoryNote
// -------------------------------------------------------
type IPreferenceSensoryNoteFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  status?: string;
};

const preferenceSensoryNoteSearchAbleFields = ["title", "description"];

const getPreferenceSensoryNoteList = async (
  req: Request,
  options: IPaginationOptions,
  filters: IPreferenceSensoryNoteFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("preferenceSensoryNote", {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.PreferenceSensoryNoteWhereInput[] = [];

    if (searchTerm) {
      andConditions.push({
        OR: preferenceSensoryNoteSearchAbleFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const whereConditions: Prisma.PreferenceSensoryNoteWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [result, total] = await Promise.all([
      prisma.preferenceSensoryNote.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: preferenceSensoryNoteSelect,
      }),
      prisma.preferenceSensoryNote.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// get PreferenceSensoryNote by id
// -------------------------------------------------------
const getPreferenceSensoryNoteById = async (req: Request) => {
  const { id } = req.params;
  return cacheOr(
    CacheKeys.single("preferenceSensoryNote", id),
    TTL.MEDIUM,
    async () => {
      const result = await prisma.preferenceSensoryNote.findUnique({
        where: { id },
        select: preferenceSensoryNoteSelect,
      });
      if (!result) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          "PreferenceSensoryNote not found",
        );
      }
      return result;
    },
  );
};

// -------------------------------------------------------
// get my PreferenceSensoryNote
// -------------------------------------------------------
const getMyPreferenceSensoryNote = async (
  req: Request,
  options: IPaginationOptions,
  filters: IPreferenceSensoryNoteFilterRequest,
) => {
  const userId = req.user!.id;
  const childId = req.params.childId;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.PreferenceSensoryNoteWhereInput[] = [{ childId }];

  if (searchTerm) {
    andConditions.push({
      OR: preferenceSensoryNoteSearchAbleFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    andConditions.push(...buildFilterConditions(filterData));
  }

  const whereConditions: Prisma.PreferenceSensoryNoteWhereInput = {
    AND: andConditions,
  };

  const cacheKey = CacheKeys.myList("preferenceSensoryNote", userId, {
    childId,
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const [result, total] = await Promise.all([
      prisma.preferenceSensoryNote.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: preferenceSensoryNoteSelect,
      }),
      prisma.preferenceSensoryNote.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// update PreferenceSensoryNote
// -------------------------------------------------------
const updatePreferenceSensoryNote = async (req: Request) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);

  const existingPreferenceSensoryNote =
    await prisma.preferenceSensoryNote.findUnique({ where: { id } });
  if (!existingPreferenceSensoryNote) {
    throw new ApiError(httpStatus.NOT_FOUND, "PreferenceSensoryNote not found");
  }

  const result = await prisma.preferenceSensoryNote.update({
    where: { id },
    data: {
      title: data.title ?? (existingPreferenceSensoryNote as any).title,
      description:
        data.description ?? (existingPreferenceSensoryNote as any).description,
      helps: data.helps ?? (existingPreferenceSensoryNote as any).helps,
      avoid: data.avoid ?? (existingPreferenceSensoryNote as any).avoid,
      image:
        uploadedFiles.image ?? (existingPreferenceSensoryNote as any).image,
      category:
        data.category ?? (existingPreferenceSensoryNote as any).category,
    },
    select: preferenceSensoryNoteSelect,
  });

  await CacheInvalidator.onOwnedRecordUpdate(
    "preferenceSensoryNote",
    id,
    userId,
  );
  return result;
};

// -------------------------------------------------------
// toggle status PreferenceSensoryNote
// -------------------------------------------------------
const toggleStatusPreferenceSensoryNote = async (req: Request) => {
  // const { id } = req.params;
  // const existingPreferenceSensoryNote =
  //   await prisma.preferenceSensoryNote.findUnique({ where: { id } });
  // if (!existingPreferenceSensoryNote) {
  //   throw new ApiError(httpStatus.NOT_FOUND, "PreferenceSensoryNote not found");
  // }
  // // TODO: define your status enum toggle logic below
  // // Example for enum: { ACTIVE -> INACTIVE, INACTIVE -> ACTIVE }
  // const currentStatus = (existingPreferenceSensoryNote as any).status;
  // // const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  // const result = await prisma.preferenceSensoryNote.update({
  //   where: { id },
  //   data: { status: currentStatus /* replace with newStatus */ },
  //   select: preferenceSensoryNoteSelect,
  // });
  // await CacheInvalidator.onOwnedRecordUpdate(
  //   "preferenceSensoryNote",
  //   id,
  //   (existingPreferenceSensoryNote as any).userId,
  // );
  // return result;
};

// -------------------------------------------------------
// soft delete PreferenceSensoryNote
// -------------------------------------------------------
const softDeletePreferenceSensoryNote = async (req: Request) => {
  // const { id } = req.params;
  // const existingPreferenceSensoryNote =
  //   await prisma.preferenceSensoryNote.findUnique({
  //     where: { id, isDeleted: false },
  //   });
  // if (!existingPreferenceSensoryNote) {
  //   throw new ApiError(
  //     httpStatus.NOT_FOUND,
  //     "PreferenceSensoryNote not found or PreferenceSensoryNote is already deleted",
  //   );
  // }
  // const result = await prisma.preferenceSensoryNote.update({
  //   where: { id },
  //   data: { isDeleted: true },
  //   select: preferenceSensoryNoteSelect,
  // });
  // await CacheInvalidator.onRecordDelete(
  //   "preferenceSensoryNote",
  //   id,
  //   (existingPreferenceSensoryNote as any).userId,
  // );
  // return result;
};

// -------------------------------------------------------
// hard delete PreferenceSensoryNote
// -------------------------------------------------------
const deletePreferenceSensoryNote = async (req: Request) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const existingPreferenceSensoryNote =
    await prisma.preferenceSensoryNote.findUnique({ where: { id } });
  if (!existingPreferenceSensoryNote) {
    throw new ApiError(httpStatus.NOT_FOUND, "PreferenceSensoryNote not found");
  }
  const result = await prisma.preferenceSensoryNote.delete({ where: { id } });
  await CacheInvalidator.onRecordDelete("preferenceSensoryNote", id, userId);
  return result;
};

export const preferenceSensoryNoteService = {
  createPreferenceSensoryNote,
  getPreferenceSensoryNoteList,
  getPreferenceSensoryNoteById,
  getMyPreferenceSensoryNote,
  updatePreferenceSensoryNote,
  toggleStatusPreferenceSensoryNote,
  softDeletePreferenceSensoryNote,
  deletePreferenceSensoryNote,
};
