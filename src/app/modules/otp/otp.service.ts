import crypto from "node:crypto";
import httpStatus from "http-status";
import ApiError from "../../../error/ApiErrors";
import { redis } from "../../../lib/redisConnection";
import { generateOTP } from "../../../utils/generateOtp";
import { otpQueue } from "../../../helpers/queue";
import emailSender from "../../../helpers/emailSender/emailSender";
import { sendSmsOtp } from "../../../helpers/phoneSmsSender/messageSender";
import { config } from "../../../config";
import prisma from "../../../shared/prisma";
import type {
  OtpChannel,
  OtpPurpose,
  PendingSignup,
  ResendOtpInput,
  SendOtpInput,
  StoredOtpPayload,
  VerifyOtpInput,
} from "./otp.interface";
import {
  OTP_EXPIRE_DURATION_MINUTES,
  SESSION_EXPIRE_DURATION_MINUTES,
} from "../../../const";
import { otpEmail } from "../../../email/otpEmail";

const normalizeIdentifier = (value: string) => value.trim().toLowerCase();

const otpKey = (purpose: OtpPurpose, identifier: string) =>
  `otp:${purpose.toLowerCase()}:${normalizeIdentifier(identifier)}`;

const sha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

const computeOtpHash = (identifier: string, otp: string) => {
  const pepper = config.jwt.jwt_secret;
  if (!pepper) throw new Error("Server misconfigured: JWT_SECRET is not set");
  return sha256(`${normalizeIdentifier(identifier)}:${otp}:${pepper}`);
};

const getQueueName = (purpose: OtpPurpose) => {
  switch (purpose) {
    case "EMAIL_VERIFICATION":
      return "send-email-verification-otp";
    case "PASSWORD_RESET":
      return "send-password-reset-otp";
    default:
      return "send-password-reset-otp";
  }
};

const getChannelType = (channel?: OtpChannel) => channel ?? "email";

const storeOtp = async (
  key: string,
  payload: StoredOtpPayload,
  ttlSeconds: number,
) => {
  await redis.set(key, JSON.stringify(payload), "EX", ttlSeconds);
};

const readOtp = async (key: string): Promise<StoredOtpPayload | null> => {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredOtpPayload;
  } catch {
    return null;
  }
};

const clearOtp = async (key: string) => {
  await redis.del(key);
};

const saveOtpSession = async (payload: {
  identifier: string;
  purpose: OtpPurpose;
  otpHash: string;
  otpExpiresAt: string;
  signup?: PendingSignup;
}) => {
  const normalizedIdentifier = normalizeIdentifier(payload.identifier);
  await prisma.pendingOtpSession.upsert({
    where: {
      identifier_purpose: {
        identifier: normalizedIdentifier,
        purpose: payload.purpose,
      },
    },
    create: {
      identifier: normalizedIdentifier,
      purpose: payload.purpose,
      otpHash: payload.otpHash,
      otpExpiresAt: new Date(payload.otpExpiresAt),
      signupData: payload.signup ?? undefined,
    },
    update: {
      otpHash: payload.otpHash,
      otpExpiresAt: new Date(payload.otpExpiresAt),
      signupData: payload.signup ?? undefined,
    },
  });
};

const readOtpSession = async (
  identifier: string,
  purpose: OtpPurpose,
): Promise<StoredOtpPayload | null> => {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const session = await prisma.pendingOtpSession.findUnique({
    where: {
      identifier_purpose: {
        identifier: normalizedIdentifier,
        purpose,
      },
    },
  });

  if (!session) return null;

  return {
    otpHash: session.otpHash,
    createdAt: session.createdAt.toISOString(),
    otpExpiresAt: session.otpExpiresAt.toISOString(),
    signup: (session.signupData as PendingSignup) ?? undefined,
  };
};

const clearOtpSession = async (identifier: string, purpose: OtpPurpose) => {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  await prisma.pendingOtpSession.deleteMany({
    where: {
      identifier: normalizedIdentifier,
      purpose,
    },
  });
};

const directSendOtp = async (
  identifier: string,
  otp: string,
  type: OtpChannel,
) => {
  try {
    if (type === "sms") {
      await sendSmsOtp(identifier, otp);
    } else {
      const otpHtml = otpEmail(otp);
      await emailSender("OTP Verification", identifier, otpHtml);
    }
  } catch (emailError) {
    console.error("🚨 Critical: Direct OTP delivery failed", emailError);
  }
};

// ==================== SERVICES ====================

export const sendOtpService = async (payload: SendOtpInput) => {
  const otp = generateOTP();
  const otpHash = computeOtpHash(payload.identifier, otp);
  const now = new Date();
  const otpExpiresAt = new Date(
    now.getTime() + OTP_EXPIRE_DURATION_MINUTES * 60 * 1000,
  ).toISOString();
  const key = otpKey(payload.purpose, payload.identifier);

  // কোপাইলট ফিক্স ১: ডাটাবেজ ডাউন থাকলেও যেন ওটিপি রিকোয়েস্ট ফেইল না করে
  try {
    await saveOtpSession({
      identifier: payload.identifier,
      purpose: payload.purpose,
      otpHash,
      otpExpiresAt,
      signup: payload.signup,
    });
  } catch (dbError) {
    console.error("🚨 Database write failed during sendOtp. Continuing with Redis cache.", dbError);
  }

  let redisOk = true;
  try {
    await storeOtp(
      key,
      {
        otpHash,
        createdAt: now.toISOString(),
        otpExpiresAt,
        signup: payload.signup,
      },
      SESSION_EXPIRE_DURATION_MINUTES * 60,
    );
  } catch (redisError) {
    redisOk = false;
    console.error("🚨 Redis is DOWN. Relying on DB fallback.", redisError);
  }

  const channelType = getChannelType(payload.channel);
  let deliveryFallback = false;

  try {
    await otpQueue.add(
      getQueueName(payload.purpose),
      {
        otpCode: otp,
        identifier: payload.identifier,
        type: channelType,
      },
      { removeOnComplete: 25, removeOnFail: 25 },
    );
  } catch (queueError) {
    deliveryFallback = true; // কোপাইলট ফিক্স ৩: কিউ ফেইল ফ্ল্যাগ
    console.error("🚨 OTP queue failed. Fallback to direct delivery.", queueError);
    await directSendOtp(payload.identifier, otp, channelType);
  }

  return {
    identifier: payload.identifier,
    otpExpiresInMinutes: OTP_EXPIRE_DURATION_MINUTES,
    isFallback: !redisOk,
    deliveryFallback, 
  };
};

export const verifyOtpService = async (payload: VerifyOtpInput) => {
  const key = otpKey(payload.purpose, payload.identifier);

  let stored: StoredOtpPayload | null = null;
  try {
    stored = await readOtp(key);
  } catch (redisError) {
    console.error("🚨 Redis read failed on verify. Falling back to DB.", redisError);
  }

  if (!stored) {
    stored = await readOtpSession(payload.identifier, payload.purpose);
  }

  if (!stored)
    throw new ApiError(httpStatus.BAD_REQUEST, "Session expired. Start over.");

  // কোপাইলট ফিক্স ২: নট-নাল অ্যাসারশন (!) রিমুভ করে সেফ ডেট চ্যাকিং
  if (!stored.otpExpiresAt || new Date() > new Date(stored.otpExpiresAt)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "OTP has expired. Please click Resend OTP.",
    );
  }

  const incomingHash = computeOtpHash(payload.identifier, payload.otp);
  if (incomingHash !== stored.otpHash)
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid OTP");

  await clearOtp(key).catch(() => {});
  await clearOtpSession(payload.identifier, payload.purpose).catch(() => {});
  return stored;
};

export const resendOtpService = async (payload: ResendOtpInput) => {
  const key = otpKey(payload.purpose, payload.identifier);
  let stored: StoredOtpPayload | null = null;

  let redisOk = true;
  try {
    stored = await readOtp(key);
  } catch (redisError) {
    redisOk = false;
    console.error("🚨 Redis read failed on resend.", redisError);
  }

  if (!stored) {
    stored = await readOtpSession(payload.identifier, payload.purpose);
  }

  if (!stored)
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Session expired. Please start the registration/reset flow again.",
    );

  const otp = generateOTP();
  const otpHash = computeOtpHash(payload.identifier, otp);

  const now = new Date();
  const otpExpiresAt = new Date(
    now.getTime() + OTP_EXPIRE_DURATION_MINUTES * 60 * 1000,
  ).toISOString();

  try {
    await saveOtpSession({
      identifier: payload.identifier,
      purpose: payload.purpose,
      otpHash,
      otpExpiresAt,
      signup: stored.signup,
    });
  } catch (dbError) {
    console.error("🚨 Database write failed during resendOtp.", dbError);
  }

  try {
    await storeOtp(
      key,
      {
        ...stored,
        otpHash,
        createdAt: now.toISOString(),
        otpExpiresAt,
      },
      SESSION_EXPIRE_DURATION_MINUTES * 60,
    );
  } catch (redisError) {
    redisOk = false;
    console.error("🚨 Redis store failed during resend. Continuing with DB data.", redisError);
  }

  const channelType = getChannelType(payload.channel);
  let deliveryFallback = false;

  try {
    await otpQueue.add(
      getQueueName(payload.purpose),
      {
        otpCode: otp,
        identifier: payload.identifier,
        type: channelType,
      },
      { removeOnComplete: 25, removeOnFail: 25 },
    );
  } catch (queueError) {
    deliveryFallback = true;
    console.error("🚨 OTP queue failed during resend. Direct sending.", queueError);
    await directSendOtp(payload.identifier, otp, channelType);
  }

  return {
    identifier: payload.identifier,
    otpExpiresInMinutes: OTP_EXPIRE_DURATION_MINUTES,
    isFallback: !redisOk,
    deliveryFallback,
  };
};