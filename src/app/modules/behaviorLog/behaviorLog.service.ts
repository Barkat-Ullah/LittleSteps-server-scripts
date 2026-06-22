import { Request } from "express";
import httpStatus from "http-status";
import prisma from "../../../shared/prisma";
import ApiError from "../../../error/ApiErrors";
import {
  cacheOr,
  CacheKeys,
  invalidateKeys,
  invalidatePattern,
  TTL,
} from "../../../lib/redisConnection";

const createMultipleEntries = async (
  payload: {
    childId: string;
    selectedBehaviors: { behavior: string; date: string }[];
  },
  accessId: string,
) => {
  const { childId, selectedBehaviors } = payload;

  const child = await prisma.children.findFirst({
    where: { id: childId, creatorId: accessId, isDeleted: false },
  });

  if (!child) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You do not have access to this child",
    );
  }

  const entriesToCreate = selectedBehaviors.map((item) => ({
    childId,
    behavior: item.behavior.trim(),
    logDate: new Date(item.date),
  }));

  const createdEntries = await prisma.behaviorLog.createMany({
    data: entriesToCreate,
  });

  // Extract unique YYYY-MM-DD dates from the payload (client-supplied, timezone-safe)
  const uniqueDates = [
    ...new Set(selectedBehaviors.map((item) => item.date.split("T")[0])),
  ];

  // Invalidate only the exact cache keys that were written to
  await Promise.all(
    uniqueDates.map((date) =>
      invalidateKeys(
        CacheKeys.myList("behaviorLog", accessId, { childId, date }),
      ),
    ),
  );

  // Also bust analytics cache since new logs affect analytics totals
  await invalidatePattern(CacheKeys.myListPattern("analytics", accessId));

  return {
    count: createdEntries.count,
    message: `${createdEntries.count} behavior entries logged`,
  };
};

const getBehaviorLogByChild = async (req: Request) => {
  const userId = req.user!.id;
  const { childId } = req.params;
  const { date } = req.query; // "2025-06-07"

  if (!date || typeof date !== "string") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "date query param is required (YYYY-MM-DD)",
    );
  }

  const accessId = (req as any).accessId;

  const child = await prisma.children.findFirst({
    where: { id: childId, creatorId: accessId, isDeleted: false },
  });

  if (!child) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You do not have access to this child",
    );
  }

  // Build day boundaries from client-supplied ISO date (timezone-safe)
  const startDay = new Date(`${date}T00:00:00.000Z`);
  const endDay = new Date(`${date}T23:59:59.999Z`);

  const cacheKey = CacheKeys.myList("behaviorLog", accessId, { childId, date });

  const log = await cacheOr(cacheKey, TTL.SHORT, () =>
    prisma.behaviorLog.findMany({
      where: {
        childId,
        logDate: { gte: startDay, lte: endDay },
      },
      select: {
        id: true,
        childId: true,
        behavior: true,
        logDate: true,
      },
      orderBy: { logDate: "desc" },
    }),
  );

  return log;
};

export const behaviorLogService = {
  createMultipleEntries,
  getBehaviorLogByChild,
};