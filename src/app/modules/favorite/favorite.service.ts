import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { favoriteSelect } from "./favorite.select";
import { buildFilterConditions } from "./favorite.utils";
import prisma from "../../../shared/prisma";
import { IPaginationOptions } from "../../../interfaces/pagination";
import { paginationHelper } from "../../../shared/pagination";
import ApiError from "../../../error/ApiErrors";
import {
  CacheInvalidator,
  CacheKeys,
  TTL,
  cacheOr,
  invalidateKeys,
} from "../../../lib/redisConnection";

// ─────────────────────────────────────────────────────────────────────────────
// Toggle Favorite
// ─────────────────────────────────────────────────────────────────────────────

const createFavorite = async (req: Request) => {
  const userId = req.user!.id;
  const { taskId } = req.params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, userId: true, title: true },
  });
  if (!task) throw new ApiError(httpStatus.NOT_FOUND, "Task not found");

  const existingFavorite = await prisma.favorite.findFirst({
    where: { userId, taskId },
  });

  if (existingFavorite) {
    // ── Remove from favorites ──
    await prisma.favorite.delete({ where: { id: existingFavorite.id } });

    // Cache invalidate
    await Promise.allSettled([
      invalidateKeys(CacheKeys.single("favorite", existingFavorite.id)),
      CacheInvalidator.onOwnedRecordUpdate("favorite", existingFavorite.id, userId),
      invalidateKeys(`favorite:check:${userId}:${taskId}`),
    ]);
    return {
      taskId,
      isFavorite: false,
      message: "Removed from favorites",
    };
  }

  // ── Add to favorites ──
  const newFavorite = await prisma.favorite.create({
    data: { userId, taskId, isFavorite: true },
    select: favoriteSelect,
  });

  // Cache invalidate
  await Promise.allSettled([
    CacheInvalidator.onRecordCreate("favorite"),
    invalidateKeys(`favorite:check:${userId}:${taskId}`),
  ]);

  return {
    taskId,
    isFavorite: true,
    data: newFavorite,
    message: "Added to favorites",
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Get All Favorites
// ─────────────────────────────────────────────────────────────────────────────

type IFavoriteFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
};

const favoriteSearchAbleFields = ["taskId", "userId"];

const getFavoriteList = async (
  req: Request,
  options: IPaginationOptions,
  filters: IFavoriteFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const cacheKey = CacheKeys.list("favorite", { page, limit, searchTerm, ...filterData });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const andConditions: Prisma.favoriteWhereInput[] = [];

    if (searchTerm) {
      andConditions.push({
        OR: favoriteSearchAbleFields.map((field) => ({
          [field]: { contains: searchTerm, mode: "insensitive" },
        })),
      });
    }

    if (Object.keys(filterData).length) {
      andConditions.push(...buildFilterConditions(filterData));
    }

    const whereConditions: Prisma.favoriteWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [result, total] = await Promise.all([
      prisma.favorite.findMany({
        skip,
        take: limit,
        where: whereConditions,
        orderBy: { createdAt: "desc" },
        select: favoriteSelect,
      }),
      prisma.favorite.count({ where: whereConditions }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Get Favorite by ID
// ─────────────────────────────────────────────────────────────────────────────

const getFavoriteById = async (req: Request) => {
  const { id } = req.params;
  return cacheOr(CacheKeys.single("favorite", id), TTL.MEDIUM, async () => {
    const result = await prisma.favorite.findUnique({
      where: { id },
      select: favoriteSelect,
    });
    if (!result) throw new ApiError(httpStatus.NOT_FOUND, "Favorite not found");
    return result;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Get My Favorites
// ─────────────────────────────────────────────────────────────────────────────

const getMyFavorite = async (
  req: Request,
  options: IPaginationOptions,
  filters: IFavoriteFilterRequest,
) => {
  const userId = req.user!.id;
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.favoriteWhereInput[] = [{ userId }];

  if (searchTerm) {
    andConditions.push({
      OR: favoriteSearchAbleFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    andConditions.push(...buildFilterConditions(filterData));
  }

  const cacheKey = CacheKeys.myList("favorite", userId, {
    page,
    limit,
    searchTerm,
    ...filterData,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const [result, total] = await Promise.all([
      prisma.favorite.findMany({
        skip,
        take: limit,
        where: { AND: andConditions },
        orderBy: { createdAt: "desc" },
        select: favoriteSelect,
      }),
      prisma.favorite.count({ where: { AND: andConditions } }),
    ]);

    return { meta: { total, page, limit }, data: result };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Check if favorited
// ─────────────────────────────────────────────────────────────────────────────

const checkIsFavorite = async (req: Request) => {
  const userId = req.user!.id;
  const { taskId } = req.params;

  const cacheKey = `favorite:check:${userId}:${taskId}`;

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const favorite = await prisma.favorite.findFirst({
      where: { userId, taskId },
      select: { id: true, isFavorite: true },
    });
    return { taskId, isFavorite: !!favorite };
  });
};

export const favoriteService = {
  createFavorite,
  getFavoriteList,
  getFavoriteById,
  getMyFavorite,
  checkIsFavorite,
};