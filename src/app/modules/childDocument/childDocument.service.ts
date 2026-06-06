import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { childDocumentSelect } from "./childDocument.select";
import { buildFilterConditions } from "./childDocument.utils";
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
// create ChildDocument
// -------------------------------------------------------
const createChildDocument = async (req: Request) => {
  const userId = req.user!.id;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);
  const addedData = { ...data, ...uploadedFiles, userId };
  const result = await prisma.childDocument.create({
    data: addedData,
    select: childDocumentSelect,
  });
  await CacheInvalidator.onRecordCreate("childDocument");
  return result;
};

// -------------------------------------------------------
// get all ChildDocument
// -------------------------------------------------------
type IChildDocumentFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  childId?: string;
};

const childDocumentSearchAbleFields = ["fileName"];

const getChildDocumentList = async (
  req: Request,
  options: IPaginationOptions,
  filters: IChildDocumentFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("childDocument", {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.ChildDocumentWhereInput[] = [];

    if (searchTerm) {
      andConditions.push({
        OR: childDocumentSearchAbleFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const whereConditions: Prisma.ChildDocumentWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [result, total] = await Promise.all([
      prisma.childDocument.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: childDocumentSelect,
      }),
      prisma.childDocument.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// get ChildDocument by id
// -------------------------------------------------------
const getChildDocumentById = async (req: Request) => {
  const { id } = req.params;
  return cacheOr(
    CacheKeys.single("childDocument", id),
    TTL.MEDIUM,
    async () => {
      const result = await prisma.childDocument.findUnique({
        where: { id },
        select: childDocumentSelect,
      });
      if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, "ChildDocument not found");
      }
      return result;
    },
  );
};

// -------------------------------------------------------
// get my ChildDocument
// -------------------------------------------------------
const getMyChildDocument = async (
  req: Request,
  options: IPaginationOptions,
  filters: IChildDocumentFilterRequest,
) => {
  const userId = req.user!.id;
  const childId = req.params.childId;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.ChildDocumentWhereInput[] = [{ childId }];

  if (searchTerm) {
    andConditions.push({
      OR: childDocumentSearchAbleFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    andConditions.push(...buildFilterConditions(filterData));
  }

  const whereConditions: Prisma.ChildDocumentWhereInput = {
    AND: andConditions,
  };

  // Fix #3: childId included in cache key to prevent cache collision
  // between different children of the same user
  const cacheKey = CacheKeys.myList("childDocument", userId, {
    childId,
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const [result, total] = await Promise.all([
      prisma.childDocument.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: childDocumentSelect,
      }),
      prisma.childDocument.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// update ChildDocument
// -------------------------------------------------------
const updateChildDocument = async (req: Request) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);

  const existingChildDocument = await prisma.childDocument.findUnique({
    where: { id },
  });
  if (!existingChildDocument) {
    throw new ApiError(httpStatus.NOT_FOUND, "ChildDocument not found");
  }

  // Fix #4: use spread like create so new file fields are picked up automatically
  const result = await prisma.childDocument.update({
    where: { id },
    data: { ...data, ...uploadedFiles },
    select: childDocumentSelect,
  });

  await CacheInvalidator.onOwnedRecordUpdate("childDocument", id, userId);
  return result;
};

// -------------------------------------------------------
// toggle status ChildDocument
// -------------------------------------------------------
const toggleStatusChildDocument = async (req: Request) => {
  throw new ApiError(httpStatus.NOT_IMPLEMENTED, "Toggle status is not applicable for ChildDocument");
};

// -------------------------------------------------------
// soft delete ChildDocument
// -------------------------------------------------------
const softDeleteChildDocument = async (req: Request) => {
  throw new ApiError(httpStatus.NOT_IMPLEMENTED, "Soft delete is not applicable for ChildDocument");
};

// -------------------------------------------------------
// hard delete ChildDocument
// -------------------------------------------------------
const deleteChildDocument = async (req: Request) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const existingChildDocument = await prisma.childDocument.findUnique({
    where: { id },
  });
  if (!existingChildDocument) {
    throw new ApiError(httpStatus.NOT_FOUND, "ChildDocument not found");
  }
  const result = await prisma.childDocument.delete({ where: { id } });
  await CacheInvalidator.onRecordDelete("childDocument", id, userId);
  return result;
};

export const childDocumentService = {
  createChildDocument,
  getChildDocumentList,
  getChildDocumentById,
  getMyChildDocument,
  updateChildDocument,
  toggleStatusChildDocument,
  softDeleteChildDocument,
  deleteChildDocument,
};