import prisma from "../../../shared/prisma";
import { cacheOr, CacheKeys, TTL } from "../../../lib/redisConnection";

export type AnalyticsPeriod = "week" | "month";
// ─── Types ───────────────────────────────────────────────────────────────────

type LogEntry = { behavior: string; logDate: Date };

// ─── Potty ───────────────────────────────────────────────────────────────────

const SUCCESS_BEHAVIORS = new Set([
  "#1 in potty",
  "#2 in potty",
  "Used Potty Unassisted",
  "Potty Trained / Used Potty",
]);

const ATTEMPT_BEHAVIORS = new Set([
  "Potty Attempted",
  "Indicated Need for Toilet",
  "Initiated Potty Use",
  "Sat on potty",
]);

function computePottyProgress(logs: LogEntry[]) {
  const relevant = logs.filter(
    (e) =>
      SUCCESS_BEHAVIORS.has(e.behavior) || ATTEMPT_BEHAVIORS.has(e.behavior),
  );

  const successes = relevant.filter((e) =>
    SUCCESS_BEHAVIORS.has(e.behavior),
  ).length;
  const attempts = relevant.filter((e) =>
    ATTEMPT_BEHAVIORS.has(e.behavior),
  ).length;
  const totalAttempts = successes + attempts;

  return {
    percentage: `${totalAttempts > 0 ? Math.round((successes / totalAttempts) * 100) : 0}%`,
    successes,
    attempts: totalAttempts,
  };
}

// ─── Foods ───────────────────────────────────────────────────────────────────

function computeNewFoods(logs: LogEntry[]) {
  const foodLogs = logs.filter((e) => e.behavior.startsWith("Tried "));

  const foods = new Set<string>();
  const list = foodLogs.map((e) => {
    const food = e.behavior.replace("Tried ", "").trim();
    foods.add(food);
    return {
      food,
      day: e.logDate.toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "UTC",
      }),
    };
  });

  return {
    count: foods.size,
    foods: Array.from(foods),
    list,
  };
}

// ─── Positive Moments ────────────────────────────────────────────────────────

const POSITIVE_BEHAVIORS = new Set([
  "Comfortable during care",
  "Cooperated with routine",
  "Indicated need for change",
]);

function computePositiveMoments(logs: LogEntry[]) {
  const relevant = logs.filter((e) => POSITIVE_BEHAVIORS.has(e.behavior));

  const counts: Record<string, number> = {};
  relevant.forEach((e) => {
    counts[e.behavior] = (counts[e.behavior] || 0) + 1;
  });

  return {
    total: relevant.length,
    breakdown: counts,
  };
}

// ─── Calm ────────────────────────────────────────────────────────────────────

function computeCalmStack(logs: LogEntry[]) {
  return {
    totalCalm: logs.filter((e) => e.behavior.startsWith("Calm ")).length,
  };
}

const getAnalyticsByPeriod = async (
  childId: string,
  accessId: string,
  period: AnalyticsPeriod = "week",
  referenceDate: string,
) => {
  const [year, month, day] = referenceDate.split("-").map(Number);

  let startDate: Date;
  let endDate: Date;

  if (period === "week") {
    const ref = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = ref.getUTCDay();
    startDate = new Date(
      Date.UTC(year, month - 1, day - dayOfWeek, 0, 0, 0, 0),
    );
    endDate = new Date(
      Date.UTC(year, month - 1, day - dayOfWeek + 6, 23, 59, 59, 999),
    );
  } else {
    startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  }

  const cacheKey = CacheKeys.myList("analytics", accessId, {
    childId,
    period,
    referenceDate,
  });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    // ✅ একটাই query — সব relevant behavior logs একসাথে আনো
    const allLogs = await prisma.behaviorLog.findMany({
      where: {
        childId,
        logDate: { gte: startDate, lte: endDate },
      },
      select: {
        behavior: true,
        logDate: true,
      },
    });

    // ✅ এরপর in-memory partition — আলাদা DB call নেই
    return {
      period,
      range: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      potty: computePottyProgress(allLogs),
      foods: computeNewFoods(allLogs),
      positive: computePositiveMoments(allLogs),
      calm: computeCalmStack(allLogs),
    };
  });
};

//TODO :i will do it lated
const getAnalyticsArticleByPeriod = async (
  userId: string,
  period: AnalyticsPeriod = "week",
) => {};

// const getPottyProgress = async (childId: string, start: Date, end: Date) => {
//   const SUCCESS_BEHAVIORS = [
//     "#1 in potty",
//     "#2 in potty",
//     "Used Potty Unassisted",
//     "Potty Trained / Used Potty",
//   ];

//   const ATTEMPT_BEHAVIORS = [
//     "Potty Attempted",
//     "Indicated Need for Toilet",
//     "Initiated Potty Use",
//     "Sat on potty",
//   ];

//   const entries = await prisma.behaviorLog.findMany({
//     where: {
//       childId,
//       logDate: { gte: start, lte: end },
//       behavior: {
//         in: [...SUCCESS_BEHAVIORS, ...ATTEMPT_BEHAVIORS],
//       },
//     },
//   });

//   const successes = entries.filter((e) =>
//     SUCCESS_BEHAVIORS.includes(e.behavior),
//   ).length;
//   const attempts = entries.filter((e) =>
//     ATTEMPT_BEHAVIORS.includes(e.behavior),
//   ).length;
//   const totalAttempts = successes + attempts;

//   const percentage = `${totalAttempts > 0 ? Math.round((successes / totalAttempts) * 100) : 0}%`;

//   return {
//     percentage,
//     successes,
//     attempts: totalAttempts,
//   };
// };

// const getNewFoodsThisWeek = async (childId: string, start: Date, end: Date) => {
//   const entries = await prisma.behaviorLog.findMany({
//     where: {
//       childId,
//       logDate: { gte: start, lte: end },
//       behavior: { startsWith: "Tried " },
//     },
//   });

//   const foods = new Set<string>();
//   entries.forEach((e) => {
//     const food = e.behavior.replace("Tried ", "").trim();
//     if (food) foods.add(food);
//   });

//   const foodList = entries.map((e) => ({
//     food: e.behavior.replace("Tried ", "").trim(),
//     // Use UTC weekday to avoid server timezone affecting the day label
//     day: e.logDate.toLocaleDateString("en-US", {
//       weekday: "long",
//       timeZone: "UTC",
//     }),
//   }));

//   return {
//     count: foods.size,
//     foods: Array.from(foods),
//     list: foodList,
//   };
// };

// const getPositiveMoments = async (childId: string, start: Date, end: Date) => {
//   const positiveBehaviors = [
//     "Comfortable during care",
//     "Cooperated with routine",
//     "Indicated need for change",
//   ];

//   const entries = await prisma.behaviorLog.findMany({
//     where: {
//       childId,
//       logDate: { gte: start, lte: end },
//       behavior: { in: positiveBehaviors },
//     },
//   });

//   const counts: Record<string, number> = {};
//   entries.forEach((e) => {
//     counts[e.behavior] = (counts[e.behavior] || 0) + 1;
//   });

//   const totalPositive = entries.length;

//   return {
//     total: totalPositive,
//     breakdown: counts,
//   };
// };

// const getCalmStack = async (childId: string, start: Date, end: Date) => {
//   const count = await prisma.behaviorLog.count({
//     where: {
//       childId,
//       logDate: {
//         gte: start,
//         lte: end,
//       },
//       behavior: {
//         startsWith: "Calm ",
//       },
//     },
//   });

//   return {
//     totalCalm: count,
//   };
// };

export const analyticsService = {
  getAnalyticsByPeriod,
  getAnalyticsArticleByPeriod,
};
