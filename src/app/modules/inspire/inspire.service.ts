import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { inspireSelect } from "./inspire.select";
import { buildFilterConditions } from "./inspire.utils";
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
// create Inspire
// -------------------------------------------------------
const createInspire = async (req: Request) => {
  const userId = req.user!.id;
  const data = req.body;

  const addedData = { ...data };
  const result = await prisma.inspire.create({
    data: addedData,
    select: inspireSelect,
  });
  await CacheInvalidator.onRecordCreate("inspire");
  return result;
};

// -------------------------------------------------------
// get all Inspire
// -------------------------------------------------------
type IInspireFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  status?: string;
};

const inspireSearchAbleFields = ["fullName", "email"];

const getInspireList = async (
  req: Request,
  options: IPaginationOptions,
  filters: IInspireFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("inspire", {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.InspireWhereInput[] = [];

    if (searchTerm) {
      andConditions.push({
        OR: inspireSearchAbleFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const whereConditions: Prisma.InspireWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [result, total] = await Promise.all([
      prisma.inspire.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: inspireSelect,
      }),
      prisma.inspire.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// get Inspire by id
// -------------------------------------------------------
const getInspireById = async (req: Request) => {
  const { id } = req.params;
  return cacheOr(CacheKeys.single("inspire", id), TTL.MEDIUM, async () => {
    const result = await prisma.inspire.findUnique({
      where: { id },
      select: inspireSelect,
    });
    if (!result) {
      throw new ApiError(httpStatus.NOT_FOUND, "Inspire not found");
    }
    return result;
  });
};

// -------------------------------------------------------
// get my Inspire
// -------------------------------------------------------
const getMyInspire = async (
  req: Request,
  options: IPaginationOptions,
  filters: IInspireFilterRequest,
) => {
  const userId = req.user!.id;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.InspireWhereInput[] = [];

  if (searchTerm) {
    andConditions.push({
      OR: inspireSearchAbleFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    andConditions.push(...buildFilterConditions(filterData));
  }

  const whereConditions: Prisma.InspireWhereInput = { AND: andConditions };

  const cacheKey = CacheKeys.myList("inspire", userId, {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const [result, total] = await Promise.all([
      prisma.inspire.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: inspireSelect,
      }),
      prisma.inspire.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// update Inspire
// -------------------------------------------------------
const updateInspire = async (req: Request) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const data = req.body;
  const existingInspire = await prisma.inspire.findUnique({ where: { id } });
  if (!existingInspire) {
    throw new ApiError(httpStatus.NOT_FOUND, "Inspire not found");
  }

  const result = await prisma.inspire.update({
    where: { id },
    data: {
      text: data.text ?? (existingInspire as any).text,
      date: data.date ?? (existingInspire as any).date,
      status: data.status ?? (existingInspire as any).status,
      type: data.type ?? (existingInspire as any).type,
    },
    select: inspireSelect,
  });

  await CacheInvalidator.onOwnedRecordUpdate("inspire", id, userId);
  return result;
};

// -------------------------------------------------------
// toggle status Inspire
// -------------------------------------------------------
const toggleStatusInspire = async (req: Request) => {};

// -------------------------------------------------------
// soft delete Inspire
// -------------------------------------------------------
const softDeleteInspire = async (req: Request) => {};

// -------------------------------------------------------
// hard delete Inspire
// -------------------------------------------------------
const deleteInspire = async (req: Request) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const existingInspire = await prisma.inspire.findUnique({ where: { id } });
  if (!existingInspire) {
    throw new ApiError(httpStatus.NOT_FOUND, "Inspire not found");
  }
  const result = await prisma.inspire.delete({ where: { id } });
  await CacheInvalidator.onRecordDelete("inspire", id, userId);
  return result;
};

export const inspireService = {
  createInspire,
  getInspireList,
  getInspireById,
  getMyInspire,
  updateInspire,
  toggleStatusInspire,
  softDeleteInspire,
  deleteInspire,
};
