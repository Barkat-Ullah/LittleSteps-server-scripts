import prisma from "../../../shared/prisma";
import { cacheOr, CacheKeys, TTL } from "../../../lib/redisConnection";

export type AnalyticsPeriod = "week" | "month";

const getAnalyticsByPeriod = async (
  childId: string,
  accessId: string,
  period: AnalyticsPeriod = "week",
  referenceDate: string, // client sends "YYYY-MM-DD" in their local timezone
) => {
  // Parse client date in UTC to avoid server timezone drift
  const [year, month, day] = referenceDate.split("-").map(Number);

  let startDate: Date;
  let endDate: Date;

  if (period === "week") {
    // Build a UTC date from client's reference, then find Sunday of that week
    const ref = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = ref.getUTCDay(); // 0=Sun, 6=Sat

    startDate = new Date(
      Date.UTC(year, month - 1, day - dayOfWeek, 0, 0, 0, 0),
    );
    endDate = new Date(
      Date.UTC(year, month - 1, day - dayOfWeek + 6, 23, 59, 59, 999),
    );
  } else {
    // First and last day of the month the referenceDate falls in
    startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // day 0 of next month = last day of this month
  }

  const cacheKey = CacheKeys.myList("analytics", accessId, {
    childId,
    period,
    referenceDate, // e.g. "2025-06-07" — week/month boundaries are derived from this
  });

  const result = await cacheOr(
    cacheKey,
    TTL.SHORT, // 5 min — analytics can change as new behavior logs are added
    async () => {
      const [potty, foods, positive, calm] = await Promise.all([
        getPottyProgress(childId, startDate, endDate),
        getNewFoodsThisWeek(childId, startDate, endDate),
        getPositiveMoments(childId, startDate, endDate),
        getCalmStack(childId, startDate, endDate),
      ]);

      return {
        period,
        range: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        potty,
        foods,
        positive,
        calm,
      };
    },
  );

  return result;
};

//TODO :i will do it lated
const getAnalyticsArticleByPeriod = async (
  userId: string,
  period: AnalyticsPeriod = "week",
) => {};

const getPottyProgress = async (childId: string, start: Date, end: Date) => {
  const SUCCESS_BEHAVIORS = [
    "#1 in potty",
    "#2 in potty",
    "Used Potty Unassisted",
    "Potty Trained / Used Potty",
  ];

  const ATTEMPT_BEHAVIORS = [
    "Potty Attempted",
    "Indicated Need for Toilet",
    "Initiated Potty Use",
    "Sat on potty",
  ];

  const entries = await prisma.behaviorLog.findMany({
    where: {
      childId,
      logDate: { gte: start, lte: end },
      behavior: {
        in: [...SUCCESS_BEHAVIORS, ...ATTEMPT_BEHAVIORS],
      },
    },
  });

  const successes = entries.filter((e) =>
    SUCCESS_BEHAVIORS.includes(e.behavior),
  ).length;
  const attempts = entries.filter((e) =>
    ATTEMPT_BEHAVIORS.includes(e.behavior),
  ).length;
  const totalAttempts = successes + attempts;

  const percentage = `${totalAttempts > 0 ? Math.round((successes / totalAttempts) * 100) : 0}%`;

  return {
    percentage,
    successes,
    attempts: totalAttempts,
  };
};

const getNewFoodsThisWeek = async (childId: string, start: Date, end: Date) => {
  const entries = await prisma.behaviorLog.findMany({
    where: {
      childId,
      logDate: { gte: start, lte: end },
      behavior: { startsWith: "Tried " },
    },
  });

  const foods = new Set<string>();
  entries.forEach((e) => {
    const food = e.behavior.replace("Tried ", "").trim();
    if (food) foods.add(food);
  });

  const foodList = entries.map((e) => ({
    food: e.behavior.replace("Tried ", "").trim(),
    // Use UTC weekday to avoid server timezone affecting the day label
    day: e.logDate.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    }),
  }));

  return {
    count: foods.size,
    foods: Array.from(foods),
    list: foodList,
  };
};
const getPositiveMoments = async (childId: string, start: Date, end: Date) => {
  const positiveBehaviors = [
    "Comfortable during care",
    "Cooperated with routine",
    "Indicated need for change",
  ];

  const entries = await prisma.behaviorLog.findMany({
    where: {
      childId,
      logDate: { gte: start, lte: end },
      behavior: { in: positiveBehaviors },
    },
  });

  const counts: Record<string, number> = {};
  entries.forEach((e) => {
    counts[e.behavior] = (counts[e.behavior] || 0) + 1;
  });

  const totalPositive = entries.length;

  return {
    total: totalPositive,
    breakdown: counts,
  };
};

const getCalmStack = async (childId: string, start: Date, end: Date) => {
  const count = await prisma.behaviorLog.count({
    where: {
      childId,
      logDate: {
        gte: start,
        lte: end,
      },
      behavior: {
        startsWith: "Calm ",
      },
    },
  });

  return {
    totalCalm: count,
  };
};

export const analyticsService = {
  getAnalyticsByPeriod,
  getAnalyticsArticleByPeriod,
};