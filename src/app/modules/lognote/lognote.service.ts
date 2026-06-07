import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { lognoteSelect } from "./lognote.select";
import { buildFilterConditions } from "./lognote.utils";
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
// create Lognote
// -------------------------------------------------------
const createLognote = async (req: Request) => {
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);
  const addedData = { ...data, ...uploadedFiles };
  const result = await prisma.lognote.create({
    data: addedData,
    select: lognoteSelect,
  });
  await CacheInvalidator.onRecordCreate("lognote");
  return result;
};

// -------------------------------------------------------
// get all Lognote
// -------------------------------------------------------
type ILognoteFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
};

const lognoteSearchAbleFields = ["title", "type", "description"];

const getLognoteList = async (
  req: Request,
  options: IPaginationOptions,
  filters: ILognoteFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("lognote", {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.LognoteWhereInput[] = [];

    if (searchTerm) {
      andConditions.push({
        OR: lognoteSearchAbleFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const whereConditions: Prisma.LognoteWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [result, total] = await Promise.all([
      prisma.lognote.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: lognoteSelect,
      }),
      prisma.lognote.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// get Lognote by id
// -------------------------------------------------------
const getLognoteById = async (req: Request) => {
  const { id } = req.params;
  return cacheOr(CacheKeys.single("lognote", id), TTL.MEDIUM, async () => {
    const result = await prisma.lognote.findUnique({
      where: { id },
      select: lognoteSelect,
    });
    if (!result) {
      throw new ApiError(httpStatus.NOT_FOUND, "Lognote not found");
    }
    return result;
  });
};

// -------------------------------------------------------
// get my Lognote
// -------------------------------------------------------
const getMyLognote = async (
  req: Request,
  options: IPaginationOptions,
  filters: ILognoteFilterRequest,
) => {
  const userId = req.user!.id;
  const childId = req.params.childId;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.LognoteWhereInput[] = [{ childId }];

  if (searchTerm) {
    andConditions.push({
      OR: lognoteSearchAbleFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    andConditions.push(...buildFilterConditions(filterData));
  }

  const whereConditions: Prisma.LognoteWhereInput = { AND: andConditions };

  const cacheKey = CacheKeys.myList("lognote", userId, {
    childId,
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const [result, total] = await Promise.all([
      prisma.lognote.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: lognoteSelect,
      }),
      prisma.lognote.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// update Lognote
// -------------------------------------------------------
const updateLognote = async (req: Request) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);

  const existingLognote = await prisma.lognote.findUnique({ where: { id } });
  if (!existingLognote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Lognote not found");
  }

  const result = await prisma.lognote.update({
    where: { id },
    data: {
      childId: data.childId ?? (existingLognote as any).childId,
      title: data.title ?? (existingLognote as any).title,
      type: data.type ?? (existingLognote as any).type,
      description: data.description ?? (existingLognote as any).description,
      files: uploadedFiles.files ?? (existingLognote as any).files,
    },
    select: lognoteSelect,
  });

  await CacheInvalidator.onOwnedRecordUpdate("lognote", id, userId);
  return result;
};

// -------------------------------------------------------
// toggle status Lognote
// -------------------------------------------------------
const toggleStatusLognote = async (req: Request) => {
  // const { id } = req.params;
  // const existingLognote = await prisma.lognote.findUnique({ where: { id } });
  // if (!existingLognote) {
  //   throw new ApiError(httpStatus.NOT_FOUND, "Lognote not found");
  // }
  // // TODO: define your status enum toggle logic below
  // // Example for enum: { ACTIVE -> INACTIVE, INACTIVE -> ACTIVE }
  // const currentStatus = (existingLognote as any).status;
  // // const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  // const result = await prisma.lognote.update({
  //   where: { id },
  //   data: { status: currentStatus /* replace with newStatus */ },
  //   select: lognoteSelect,
  // });
  // await CacheInvalidator.onOwnedRecordUpdate(
  //   "lognote",
  //   id,
  //   (existingLognote as any).userId,
  // );
  // return result;
};

// -------------------------------------------------------
// soft delete Lognote
// -------------------------------------------------------
const softDeleteLognote = async (req: Request) => {
  // const { id } = req.params;
  // const existingLognote = await prisma.lognote.findUnique({
  //   where: { id, isDeleted: false },
  // });
  // if (!existingLognote) {
  //   throw new ApiError(
  //     httpStatus.NOT_FOUND,
  //     "Lognote not found or Lognote is already deleted",
  //   );
  // }
  // const result = await prisma.lognote.update({
  //   where: { id },
  //   data: { isDeleted: true },
  //   select: lognoteSelect,
  // });
  // await CacheInvalidator.onRecordDelete(
  //   "lognote",
  //   id,
  //   (existingLognote as any).userId,
  // );
  // return result;
};

// -------------------------------------------------------
// hard delete Lognote
// -------------------------------------------------------
const deleteLognote = async (req: Request) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const existingLognote = await prisma.lognote.findUnique({ where: { id } });
  if (!existingLognote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Lognote not found");
  }
  const result = await prisma.lognote.delete({ where: { id } });
  await CacheInvalidator.onRecordDelete("lognote", id, userId);
  return result;
};

export const lognoteService = {
  createLognote,
  getLognoteList,
  getLognoteById,
  getMyLognote,
  updateLognote,
  toggleStatusLognote,
  softDeleteLognote,
  deleteLognote,
};
