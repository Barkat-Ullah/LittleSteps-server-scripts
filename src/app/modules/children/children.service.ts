import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { childrenSelect } from "./children.select";
import { buildFilterConditions } from "./children.utils";
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
// create Children
// -------------------------------------------------------
const createChildren = async (req: Request) => {
  const userId = req.user!.id;
  const data = req.body;
  const addedData = { ...data, creatorId: userId };
  const result = await prisma.children.create({
    data: addedData,
    select: childrenSelect,
  });
  await CacheInvalidator.onRecordCreate("children");
  return result;
};

// -------------------------------------------------------
// get all Children
// -------------------------------------------------------
type IChildrenFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  status?: string;
};

const childrenSearchAbleFields = ["fullName", "email"];

const getChildrenList = async (
  req: Request,
  options: IPaginationOptions,
  filters: IChildrenFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("children", {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.ChildrenWhereInput[] = [];

    if (searchTerm) {
      andConditions.push({
        OR: childrenSearchAbleFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const whereConditions: Prisma.ChildrenWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [result, total] = await Promise.all([
      prisma.children.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: childrenSelect,
      }),
      prisma.children.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// get Children by id
// -------------------------------------------------------
const getChildrenById = async (req: Request) => {
  const { id } = req.params;
  return cacheOr(CacheKeys.single("children", id), TTL.MEDIUM, async () => {
    const result = await prisma.children.findUnique({
      where: { id },
      select: childrenSelect,
    });
    if (!result) {
      throw new ApiError(httpStatus.NOT_FOUND, "Children not found");
    }
    return result;
  });
};

// -------------------------------------------------------
// get my Children
// -------------------------------------------------------
const getMyChildren = async (
  req: Request,
  options: IPaginationOptions,
  filters: IChildrenFilterRequest,
) => {
  const creatorId = req.user!.id;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.ChildrenWhereInput[] = [{ creatorId }];

  if (searchTerm) {
    andConditions.push({
      OR: childrenSearchAbleFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    andConditions.push(...buildFilterConditions(filterData));
  }

  const whereConditions: Prisma.ChildrenWhereInput = { AND: andConditions };

  const cacheKey = CacheKeys.myList("children", creatorId, {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const [result, total] = await Promise.all([
      prisma.children.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: childrenSelect,
      }),
      prisma.children.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// update Children
// -------------------------------------------------------
const updateChildren = async (req: Request) => {
  const { id } = req.params;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);

  const existingChildren = await prisma.children.findUnique({ where: { id } });
  if (!existingChildren) {
    throw new ApiError(httpStatus.NOT_FOUND, "Children not found");
  }

  const result = await prisma.children.update({
    where: { id },
    data: {
      fullName: data.fullName ?? (existingChildren as any).fullName,
      dateOfBirth: data.dateOfBirth ?? (existingChildren as any).dateOfBirth,
      personalizationType:
        data.personalizationType ??
        (existingChildren as any).personalizationType,
      learningStage:
        data.learningStage ?? (existingChildren as any).learningStage,
      ageGroup: data.ageGroup ?? (existingChildren as any).ageGroup,
      supportReceived:
        data.supportReceived ?? (existingChildren as any).supportReceived,
      communication:
        data.communication ?? (existingChildren as any).communication,
      toileting: data.toileting ?? (existingChildren as any).toileting,
      diagnoses: data.diagnoses ?? (existingChildren as any).diagnoses,
      image: uploadedFiles.image ?? (existingChildren as any).image,
    },
    select: childrenSelect,
  });

  await CacheInvalidator.onOwnedRecordUpdate("children", id, result.creatorId);
  return result;
};

// -------------------------------------------------------
// toggle status Children
// -------------------------------------------------------
const toggleStatusChildren = async (req: Request) => {};

// -------------------------------------------------------
// soft delete Children
// -------------------------------------------------------
const softDeleteChildren = async (req: Request) => {
  const { id } = req.params;
  const existingChildren = await prisma.children.findUnique({
    where: { id, isDeleted: false },
  });
  if (!existingChildren) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Children not found or Children is already deleted",
    );
  }

  const result = await prisma.children.update({
    where: { id },
    data: { isDeleted: true },
    select: childrenSelect,
  });
  await CacheInvalidator.onRecordDelete(
    "children",
    id,
    (existingChildren as any).creatorId,
  );
  return result;
};

// -------------------------------------------------------
// hard delete Children
// -------------------------------------------------------
const deleteChildren = async (req: Request) => {
  const { id } = req.params;
  const existingChildren = await prisma.children.findUnique({ where: { id } });
  if (!existingChildren) {
    throw new ApiError(httpStatus.NOT_FOUND, "Children not found");
  }
  const result = await prisma.children.delete({ where: { id } });
  await CacheInvalidator.onRecordDelete(
    "children",
    id,
    (existingChildren as any).creatorId,
  );
  return result;
};

export const childrenService = {
  createChildren,
  getChildrenList,
  getChildrenById,
  getMyChildren,
  updateChildren,
  toggleStatusChildren,
  softDeleteChildren,
  deleteChildren,
};
