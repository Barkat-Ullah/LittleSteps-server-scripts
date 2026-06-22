import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { taskSelect } from "./task.select";
import { buildFilterConditions } from "./task.utils";
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
// create Task
// -------------------------------------------------------
const createTask = async (req: Request) => {
  const userId = req.user!.id;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);
  const addedData = { ...data, ...uploadedFiles, userId };
  const result = await prisma.task.create({
    data: addedData,
    select: taskSelect,
  });
  await CacheInvalidator.onRecordCreate("task");
  return result;
};

// -------------------------------------------------------
// get all Task
// -------------------------------------------------------
type ITaskFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  status?: string;
};

const taskSearchAbleFields = ["title", "description"];

const getTaskList = async (
  req: Request,
  options: IPaginationOptions,
  filters: ITaskFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("task", {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.TaskWhereInput[] = [];

    if (searchTerm) {
      andConditions.push({
        OR: taskSearchAbleFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const whereConditions: Prisma.TaskWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [result, total] = await Promise.all([
      prisma.task.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: taskSelect,
      }),
      prisma.task.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// get Task by id
// -------------------------------------------------------
const getTaskById = async (req: Request) => {
  const { id } = req.params;
  return cacheOr(CacheKeys.single("task", id), TTL.MEDIUM, async () => {
    const result = await prisma.task.findUnique({
      where: { id },
      select: taskSelect,
    });
    if (!result) {
      throw new ApiError(httpStatus.NOT_FOUND, "Task not found");
    }
    return result;
  });
};

// -------------------------------------------------------
// get my Task
// -------------------------------------------------------
const getMyTask = async (
  req: Request,
  options: IPaginationOptions,
  filters: ITaskFilterRequest,
) => {
  const userId = req.user!.id;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.TaskWhereInput[] = [{ userId }];

  if (searchTerm) {
    andConditions.push({
      OR: taskSearchAbleFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    andConditions.push(...buildFilterConditions(filterData));
  }

  const whereConditions: Prisma.TaskWhereInput = { AND: andConditions };

  const cacheKey = CacheKeys.myList("task", userId, {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const [result, total] = await Promise.all([
      prisma.task.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: taskSelect,
      }),
      prisma.task.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// update Task
// -------------------------------------------------------
const updateTask = async (req: Request) => {
  const { id } = req.params;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);

  const existingTask = await prisma.task.findUnique({ where: { id } });
  if (!existingTask) {
    throw new ApiError(httpStatus.NOT_FOUND, "Task not found");
  }

  const result = await prisma.task.update({
    where: { id },
    data: {
      userId: data.userId ?? (existingTask as any).userId,
      title: data.title ?? (existingTask as any).title,
      description: data.description ?? (existingTask as any).description,
      files: uploadedFiles.image ?? (existingTask as any).files,
      status: data.status ?? (existingTask as any).status,
      isDeleted: data.isDeleted ?? (existingTask as any).isDeleted,
    },
    select: taskSelect,
  });

  await CacheInvalidator.onOwnedRecordUpdate("task", id, result.userId);
  return result;
};

// -------------------------------------------------------
// toggle status Task
// -------------------------------------------------------
const toggleStatusTask = async (req: Request) => {
  const { id } = req.params;
  const existingTask = await prisma.task.findUnique({ where: { id } });
  if (!existingTask) {
    throw new ApiError(httpStatus.NOT_FOUND, "Task not found");
  }

  // TODO: define your status enum toggle logic below
  // Example for enum: { ACTIVE -> INACTIVE, INACTIVE -> ACTIVE }
  const currentStatus = (existingTask as any).status;
  // const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const result = await prisma.task.update({
    where: { id },
    data: { status: currentStatus /* replace with newStatus */ },
    select: taskSelect,
  });

  await CacheInvalidator.onOwnedRecordUpdate(
    "task",
    id,
    (existingTask as any).userId,
  );
  return result;
};

// -------------------------------------------------------
// soft delete Task
// -------------------------------------------------------
const softDeleteTask = async (req: Request) => {
  const { id } = req.params;
  const existingTask = await prisma.task.findUnique({
    where: { id, isDeleted: false },
  });
  if (!existingTask) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Task not found or Task is already deleted",
    );
  }

  const result = await prisma.task.update({
    where: { id },
    data: { isDeleted: true },
    select: taskSelect,
  });
  await CacheInvalidator.onRecordDelete(
    "task",
    id,
    (existingTask as any).userId,
  );
  return result;
};

// -------------------------------------------------------
// hard delete Task
// -------------------------------------------------------
const deleteTask = async (req: Request) => {
  const { id } = req.params;
  const existingTask = await prisma.task.findUnique({ where: { id } });
  if (!existingTask) {
    throw new ApiError(httpStatus.NOT_FOUND, "Task not found");
  }
  const result = await prisma.task.delete({ where: { id } });
  await CacheInvalidator.onRecordDelete(
    "task",
    id,
    (existingTask as any).userId,
  );
  return result;
};

export const taskService = {
  createTask,
  getTaskList,
  getTaskById,
  getMyTask,
  updateTask,
  toggleStatusTask,
  softDeleteTask,
  deleteTask,
};
