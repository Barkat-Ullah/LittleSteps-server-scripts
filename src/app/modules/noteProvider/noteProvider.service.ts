import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { noteProviderSelect } from "./noteProvider.select";
import { buildFilterConditions } from "./noteProvider.utils";
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
import { child } from "winston";

// -------------------------------------------------------
// create NoteProvider
// -------------------------------------------------------
const createNoteProvider = async (req: Request) => {
  const data = req.body;
  const addedData = { ...data };
  const result = await prisma.noteProvider.create({
    data: addedData,
    select: noteProviderSelect,
  });
  await CacheInvalidator.onRecordCreate("noteProvider");
  return result;
};

// -------------------------------------------------------
// get all NoteProvider
// -------------------------------------------------------
type INoteProviderFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  status?: string;
};

const noteProviderSearchAbleFields = ["fullName", "email"];

const getNoteProviderList = async (
  req: Request,
  options: IPaginationOptions,
  filters: INoteProviderFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("noteProvider", {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.NoteProviderWhereInput[] = [];

    if (searchTerm) {
      andConditions.push({
        OR: noteProviderSearchAbleFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const whereConditions: Prisma.NoteProviderWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [result, total] = await Promise.all([
      prisma.noteProvider.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: noteProviderSelect,
      }),
      prisma.noteProvider.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// get NoteProvider by id
// -------------------------------------------------------
const getNoteProviderById = async (req: Request) => {
  const { id } = req.params;
  return cacheOr(CacheKeys.single("noteProvider", id), TTL.MEDIUM, async () => {
    const result = await prisma.noteProvider.findUnique({
      where: { id },
      select: noteProviderSelect,
    });
    if (!result) {
      throw new ApiError(httpStatus.NOT_FOUND, "NoteProvider not found");
    }
    return result;
  });
};

// -------------------------------------------------------
// get my NoteProvider
// -------------------------------------------------------
const getMyNoteProvider = async (
  req: Request,
  options: IPaginationOptions,
  filters: INoteProviderFilterRequest,
) => {
  const userId = req.user!.id;
  const childId = req.params.childId;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.NoteProviderWhereInput[] = [{ childId }];

  if (searchTerm) {
    andConditions.push({
      OR: noteProviderSearchAbleFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    andConditions.push(...buildFilterConditions(filterData));
  }

  const whereConditions: Prisma.NoteProviderWhereInput = { AND: andConditions };

  const cacheKey = CacheKeys.myList("noteProvider", userId, {
    childId,
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const [result, total] = await Promise.all([
      prisma.noteProvider.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: noteProviderSelect,
      }),
      prisma.noteProvider.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// -------------------------------------------------------
// update NoteProvider
// -------------------------------------------------------
const updateNoteProvider = async (req: Request) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const existingNoteProvider = await prisma.noteProvider.findUnique({
    where: { id },
  });
  if (!existingNoteProvider) {
    throw new ApiError(httpStatus.NOT_FOUND, "NoteProvider not found");
  }

  const result = await prisma.noteProvider.update({
    where: { id },
    data: {
      childId: data.childId ?? (existingNoteProvider as any).childId,
      fullName: data.fullName ?? (existingNoteProvider as any).fullName,
      specialty: data.specialty ?? (existingNoteProvider as any).specialty,
      phone: data.phone ?? (existingNoteProvider as any).phone,
      email: data.email ?? (existingNoteProvider as any).email,
      address: data.address ?? (existingNoteProvider as any).address,
      notes: data.notes ?? (existingNoteProvider as any).notes,
      status: data.status ?? (existingNoteProvider as any).status,
    },
    select: noteProviderSelect,
  });

  await CacheInvalidator.onOwnedRecordUpdate("noteProvider", id, userId);
  return result;
};

// -------------------------------------------------------
// toggle status NoteProvider
// -------------------------------------------------------
const toggleStatusNoteProvider = async (req: Request) => {};

// -------------------------------------------------------
// soft delete NoteProvider
// -------------------------------------------------------
const softDeleteNoteProvider = async (req: Request) => {};

// -------------------------------------------------------
// hard delete NoteProvider
// -------------------------------------------------------
const deleteNoteProvider = async (req: Request) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const existingNoteProvider = await prisma.noteProvider.findUnique({
    where: { id },
  });
  if (!existingNoteProvider) {
    throw new ApiError(httpStatus.NOT_FOUND, "NoteProvider not found");
  }
  const result = await prisma.noteProvider.delete({ where: { id } });
  await CacheInvalidator.onRecordDelete("noteProvider", id, userId);
  return result;
};

export const noteProviderService = {
  createNoteProvider,
  getNoteProviderList,
  getNoteProviderById,
  getMyNoteProvider,
  updateNoteProvider,
  toggleStatusNoteProvider,
  softDeleteNoteProvider,
  deleteNoteProvider,
};
