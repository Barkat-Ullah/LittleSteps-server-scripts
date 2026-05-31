import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  toUTCEndOfDay,
  toUTCEndOfMonth,
  toUTCStartOfDay,
  toUTCStartOfMonth,
} from "../../../utils/utcDate";
import prisma from "../../../shared/prisma";
import { redis } from "../../../lib/redisConnection";
import { stripe } from "../../../lib/stripe";

const acquireLock = async (
  key: string,
  ttl = 20000,
  retryDelay = 200,
  maxRetries = 15,
): Promise<string> => {
  const token = randomUUID();
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const result = await redis.set(key, token, "PX", ttl, "NX");
    if (result === "OK") return token;
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }
  throw new Error("Unable to acquire Stripe customer creation lock");
};

const releaseLock = async (key: string, token: string): Promise<void> => {
  const lua = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    end
    return 0
  `;
  await redis.eval(lua, 1, key, token);
};

export const buildFilterConditions = (
  filterData: Record<string, any>,
): Prisma.SubscriptionWhereInput[] => {
  const conditions: Prisma.SubscriptionWhereInput[] = [];

  Object.keys(filterData).forEach((key) => {
    const value = filterData[key];
    if (value === "" || value === null || value === undefined) return;

    if (key === "createdAt") {
      const parts = (value as string).split("-");

      if (parts.length === 2) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        conditions.push({
          createdAt: {
            gte: toUTCStartOfMonth(year, month),
            lte: toUTCEndOfMonth(year, month),
          },
        });
      } else if (parts.length === 3) {
        conditions.push({
          createdAt: {
            gte: toUTCStartOfDay(value),
            lte: toUTCEndOfDay(value),
          },
        });
      }
      return;
    }

    if (["status"].includes(key)) {
      conditions.push({
        [key]: { in: Array.isArray(value) ? value : [value] },
      });
      return;
    }

    if (["isDeleted"].includes(key)) {
      conditions.push({ [key]: value === "true" });
      return;
    }

    if (key.includes(".")) {
      const [relation, field] = key.split(".");
      conditions.push({ [relation]: { some: { [field]: value } } });
      return;
    }

    conditions.push({ [key]: value });
  });

  return conditions;
};

export const getOrCreateStripeCustomer = async (
  userId: string,
  email: string,
  fullName: string,
): Promise<string> => {
  const lockKey = `stripeCustomerLock:${userId}`;
  const lockToken = await acquireLock(lockKey);

  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (existing?.stripeCustomerId) {
      return existing.stripeCustomerId;
    }

    const customer = await stripe.customers.create({
      email,
      name: fullName,
      metadata: { userId },
    });

    const updateResult = await prisma.user.updateMany({
      where: { id: userId, stripeCustomerId: null },
      data: { stripeCustomerId: customer.id },
    });

    if (updateResult.count === 1) {
      return customer.id;
    }

    await stripe.customers.del(customer.id).catch(() => {});

    const reloaded = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (reloaded?.stripeCustomerId) {
      return reloaded.stripeCustomerId;
    }

    throw new Error("Unable to persist Stripe customer ID for user");
  } finally {
    await releaseLock(lockKey, lockToken);
  }
};

export const toStringArray = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") {
    // try parse JSON string: '["a","b"]'
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch (_) {
      // not a JSON array string
    }
    // fallback: comma separated
    return val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};
