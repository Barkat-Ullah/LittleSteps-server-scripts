import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { healthCareNoteSelect } from "./healthCareNote.select";
import { buildFilterConditions } from "./healthCareNote.utils";
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
// create HealthCareNote
// -------------------------------------------------------
const createHealthCareNote = async (req: Request) => {
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);
  const addedData = { ...data, ...uploadedFiles,  };
  const result = await prisma.healthCareNote.create({
    data: addedData,
    select: healthCareNoteSelect,
  });
  await CacheInvalidator.onRecordCreate("healthCareNote");
  return result;
};

// -------------------------------------------------------
// get all HealthCareNote
// -------------------------------------------------------
type IHealthCareNoteFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  status?: string;
};

const healthCareNoteSearchAbleFields = ["title", "description"];

const getHealthCareNoteList = async (
  req: Request,
  options: IPaginationOptions,
  filters: IHealthCareNoteFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("healthCareNote", {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.HealthCareNoteWhereInput[] = [];

    if (searchTerm) {
      andConditions.push({
        OR: healthCareNoteSearchAbleFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const whereConditions: Prisma.HealthCareNoteWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [result, total] = await Promise.all([
      prisma.healthCareNote.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: healthCareNoteSelect,
      }),
      prisma.healthCareNote.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// get HealthCareNote by id
// -------------------------------------------------------
const getHealthCareNoteById = async (req: Request) => {
  const { id } = req.params;
  return cacheOr(
    CacheKeys.single("healthCareNote", id),
    TTL.MEDIUM,
    async () => {
      const result = await prisma.healthCareNote.findUnique({
        where: { id },
        select: healthCareNoteSelect,
      });
      if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, "HealthCareNote not found");
      }
      return result;
    },
  );
};

// -------------------------------------------------------
// get my HealthCareNote
// -------------------------------------------------------
const getMyHealthCareNote = async (
  req: Request,
  options: IPaginationOptions,
  filters: IHealthCareNoteFilterRequest,
) => {
  const userId = req.user!.id;
  const childId = req.params.childId;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.HealthCareNoteWhereInput[] = [{ childId }];

  if (searchTerm) {
    andConditions.push({
      OR: healthCareNoteSearchAbleFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    andConditions.push(...buildFilterConditions(filterData));
  }

  const whereConditions: Prisma.HealthCareNoteWhereInput = {
    AND: andConditions,
  };

  const cacheKey = CacheKeys.myList("healthCareNote", userId, {
    childId,
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const [result, total] = await Promise.all([
      prisma.healthCareNote.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: healthCareNoteSelect,
      }),
      prisma.healthCareNote.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// update HealthCareNote
// -------------------------------------------------------
const updateHealthCareNote = async (req: Request) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);

  const existingHealthCareNote = await prisma.healthCareNote.findUnique({
    where: { id },
  });
  if (!existingHealthCareNote) {
    throw new ApiError(httpStatus.NOT_FOUND, "HealthCareNote not found");
  }

  const result = await prisma.healthCareNote.update({
    where: { id },
    data: {
      childId: data.childId ?? (existingHealthCareNote as any).childId,
      title: data.title ?? (existingHealthCareNote as any).title,
      description:
        data.description ?? (existingHealthCareNote as any).description,
      note: data.note ?? (existingHealthCareNote as any).note,
      files: uploadedFiles.files ?? (existingHealthCareNote as any).files,
    },
    select: healthCareNoteSelect,
  });

  await CacheInvalidator.onOwnedRecordUpdate("healthCareNote", id, userId);
  return result;
};

// -------------------------------------------------------
// toggle status HealthCareNote
// -------------------------------------------------------
const toggleStatusHealthCareNote = async (req: Request) => {
  // const { id } = req.params;
  // const existingHealthCareNote = await prisma.healthCareNote.findUnique({
  //   where: { id },
  // });
  // if (!existingHealthCareNote) {
  //   throw new ApiError(httpStatus.NOT_FOUND, "HealthCareNote not found");
  // }
  // // TODO: define your status enum toggle logic below
  // // Example for enum: { ACTIVE -> INACTIVE, INACTIVE -> ACTIVE }
  // const currentStatus = (existingHealthCareNote as any).status;
  // // const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  // const result = await prisma.healthCareNote.update({
  //   where: { id },
  //   data: { status: currentStatus /* replace with newStatus */ },
  //   select: healthCareNoteSelect,
  // });
  // await CacheInvalidator.onOwnedRecordUpdate(
  //   "healthCareNote",
  //   id,
  //   (existingHealthCareNote as any).userId,
  // );
  // return result;
};

// -------------------------------------------------------
// soft delete HealthCareNote
// -------------------------------------------------------
const softDeleteHealthCareNote = async (req: Request) => {
  // const { id } = req.params;
  // const existingHealthCareNote = await prisma.healthCareNote.findUnique({
  //   where: { id, isDeleted: false },
  // });
  // if (!existingHealthCareNote) {
  //   throw new ApiError(
  //     httpStatus.NOT_FOUND,
  //     "HealthCareNote not found or HealthCareNote is already deleted",
  //   );
  // }
  // const result = await prisma.healthCareNote.update({
  //   where: { id },
  //   data: { isDeleted: true },
  //   select: healthCareNoteSelect,
  // });
  // await CacheInvalidator.onRecordDelete(
  //   "healthCareNote",
  //   id,
  //   (existingHealthCareNote as any).userId,
  // );
  // return result;
};

// -------------------------------------------------------
// hard delete HealthCareNote
// -------------------------------------------------------
const deleteHealthCareNote = async (req: Request) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const existingHealthCareNote = await prisma.healthCareNote.findUnique({
    where: { id },
  });
  if (!existingHealthCareNote) {
    throw new ApiError(httpStatus.NOT_FOUND, "HealthCareNote not found");
  }
  const result = await prisma.healthCareNote.delete({ where: { id } });
  await CacheInvalidator.onRecordDelete("healthCareNote", id, userId);
  return result;
};

export const healthCareNoteService = {
  createHealthCareNote,
  getHealthCareNoteList,
  getHealthCareNoteById,
  getMyHealthCareNote,
  updateHealthCareNote,
  toggleStatusHealthCareNote,
  softDeleteHealthCareNote,
  deleteHealthCareNote,
};
