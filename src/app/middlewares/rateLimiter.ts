import type { Request, RequestHandler } from "express";

import httpStatus from "http-status";

import { redis } from "../../lib/redisConnection";

// Example logger (replace with Winston/Pino in production)
const logger = {
  warn: (msg: string) => console.warn(msg),
  info: (msg: string) => console.info(msg),
};

// Centralized rate limit configs
const RATE_LIMITS = {
  GLOBAL: { windowMs: 15 * 60 * 1000, max: 100 }, // 15 min, 100 requests
  PASSWORD: { windowMs: 5 * 60 * 1000, max: 5 }, // 5 min, 5 attempts
  AUTH: { windowMs: 15 * 60 * 1000, max: 10 }, // 15 min, 10 attempts
  FORGOT_PASSWORD: { windowMs: 60 * 60 * 1000, max: 3 }, // 1 hour, 3 attempts
  API: { windowMs: 15 * 60 * 1000, max: 200 }, // 15 min, 200 requests
  UPLOAD: { windowMs: 60 * 60 * 1000, max: 50 }, // 1 hour, 50 uploads
  PAYMENT: { windowMs: 15 * 60 * 1000, max: 20 }, // 15 min, 20 payments
};

const getWaitTime = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minutes`;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitRequest = Request & {
  user?: unknown;
};

const getClientIp = (req: RateLimitRequest) => {
  const forwarded = req.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  const realIp = req.get("x-real-ip");
  return realIp || req.ip || "unknown";
};

const buckets = new Map<string, RateLimitEntry>();

const pttlSafe = async (key: string): Promise<number | null> => {
  try {
    const ttl = await redis.pttl(key);
    return typeof ttl === "number" && ttl > 0 ? ttl : null;
  } catch {
    return null;
  }
};

const incrWithExpiry = async (
  key: string,
  windowMs: number,
): Promise<number | null> => {
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, windowMs);
    }
    return count;
  } catch {
    return null;
  }
};

// 🔧 Helper to build a limiter with clean responses
const createLimiter = (
  name: string,
  { windowMs, max }: { windowMs: number; max: number },
  keyGenerator?: (req: RateLimitRequest) => string,
): RequestHandler => {
  return async (req, res, next) => {
    const ip = getClientIp(req);
    const idPart = keyGenerator ? keyGenerator(req) : `${name}:${ip}`;
    const key = `rate:${name}:${idPart}`;

    // Prefer Redis-based limiter (works across multiple instances).
    const count = await incrWithExpiry(key, windowMs);
    if (count !== null) {
      if (count > max) {
        const waitMs = (await pttlSafe(key)) ?? windowMs;
        const waitTime = getWaitTime(waitMs);
        const retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));

        logger.warn(
          `🚫 [${name.toUpperCase()}] Rate limit exceeded - IP: ${ip}, URL: ${req.path}`,
        );

        res.setHeader("Retry-After", String(retryAfterSeconds));
        return res.status(httpStatus.TOO_MANY_REQUESTS).json({
          success: false,
          message: `Too many ${name} requests. Please try again in ${waitTime}.`,
          data: {
            retryAfter: waitTime,
            maxAttempts: max,
            windowMs,
            type: `${name}_limit`,
          },
        });
      }

      next();
      return;
    }

    // Fallback to in-memory limiter if Redis is unavailable.
    const now = Date.now();

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existing.count >= max) {
      const waitMs = existing.resetAt - now;
      const waitTime = getWaitTime(waitMs);
      const retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));

      logger.warn(
        `🚫 [${name.toUpperCase()}] Rate limit exceeded - IP: ${ip}, URL: ${req.path}`,
      );

      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(httpStatus.TOO_MANY_REQUESTS).json({
        success: false,
        message: `Too many ${name} requests. Please try again in ${waitTime}.`,
        data: {
          retryAfter: waitTime,
          maxAttempts: max,
          windowMs,
          type: `${name}_limit`,
        },
      });
    }

    existing.count += 1;
    buckets.set(key, existing);
    next();
  };
};

// 🌍 Global limiter (applies to all routes)
export const globalLimiter = createLimiter("global", RATE_LIMITS.GLOBAL);

// 🔒 Password change limiter
export const changePasswordLimiter = createLimiter(
  "password change",
  RATE_LIMITS.PASSWORD,
  (req) => `${getClientIp(req)}-${(req as any).user?.id || "unknown"}`,
);

// 🔐 Auth limiter (login/signup)
export const authLimiter = createLimiter("auth", RATE_LIMITS.AUTH, (req) => {
  return `${getClientIp(req)}-${req.path}`;
});

// 🔓 Forgot password limiter
export const forgotPasswordLimiter = createLimiter(
  "forgot password",
  RATE_LIMITS.FORGOT_PASSWORD,
  (req) => `forgot-${getClientIp(req)}`,
);

// 🔌 API limiter
export const apiLimiter = createLimiter("api", RATE_LIMITS.API);

// 📁 File upload limiter
export const uploadLimiter = createLimiter("upload", RATE_LIMITS.UPLOAD);

// 💳 Payment limiter
export const paymentLimiter = createLimiter("payment", RATE_LIMITS.PAYMENT);

// 📊 Export rate limit info for admin dashboard
export const getRateLimitInfo = () => {
  return {
    global: {
      ...RATE_LIMITS.GLOBAL,
      description: "100 requests per 15 minutes",
    },
    passwordChange: {
      ...RATE_LIMITS.PASSWORD,
      description: "5 password changes per 5 minutes",
    },
    auth: {
      ...RATE_LIMITS.AUTH,
      description: "10 auth attempts per 15 minutes",
    },
    forgotPassword: {
      ...RATE_LIMITS.FORGOT_PASSWORD,
      description: "3 forgot password requests per hour",
    },
    api: { ...RATE_LIMITS.API, description: "200 API requests per 15 minutes" },
    upload: { ...RATE_LIMITS.UPLOAD, description: "50 file uploads per hour" },
    payment: {
      ...RATE_LIMITS.PAYMENT,
      description: "20 payment attempts per 15 minutes",
    },
  };
};
