import httpStatus from "http-status";
import crypto from "node:crypto";
import { addSeconds } from "date-fns";
import { userRole, UserStatus } from "@prisma/client";
import ApiError from "../../../error/ApiErrors";
import prisma, { insecurePrisma } from "../../../shared/prisma";
import { redis, TTL, blacklistToken } from "../../../lib/redisConnection";
import { jwtHelpers } from "../../../helpers/jwtHelpers";
import { config } from "../../../config";
import { comparePassword, hashPassword } from "../../../utils/passwordHelpers";
import { OTP_EXPIRE_DURATION_MINUTES } from "../../../const";
import {
  sendOtpService,
  verifyOtpService,
  resendOtpService,
} from "../otp/otp.service";
import type {
  AuthTokens,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailOtpInput,
} from "./auth.interface";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isUniqueConstraintError = (error: unknown) =>
  Boolean((error as any)?.code === "P2002");

const getJwtSecret = () => {
  const secret = config.jwt.jwt_secret;
  if (!secret)
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Server misconfigured: JWT_SECRET is not set",
    );
  return secret;
};

const getRefreshSecret = () => {
  const secret = config.jwt.refresh_token_secret;
  if (!secret)
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Server misconfigured: REFRESH_TOKEN_SECRET is not set",
    );
  return secret;
};

const resolveExpiresIn = (value: unknown, fallback: string) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
};

const parseExpiresInSeconds = (expiresIn: string): number | null => {
  const raw = expiresIn.trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = raw.match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult =
    unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return n * mult;
};

const sha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

// ─────────────────────────────────────────────────────────────────────────────
// issueTokensAndSession
// ─────────────────────────────────────────────────────────────────────────────

// export const issueTokensAndSession = async (
//   user: { id: string; email: string; role: userRole; status?: UserStatus },
//   meta: {
//     deviceId: string;
//     deviceType?: string;
//     userAgent?: string;
//     ipAddress?: string;
//   },
// ): Promise<AuthTokens> => {
//   const accessExpiresIn = resolveExpiresIn(config.jwt.expires_in, "15m");
//   const refreshExpiresIn = resolveExpiresIn(
//     config.jwt.refresh_token_expires_in,
//     "30d",
//   );

//   const refreshSeconds = parseExpiresInSeconds(refreshExpiresIn);
//   if (!refreshSeconds)
//     throw new ApiError(
//       httpStatus.INTERNAL_SERVER_ERROR,
//       "Server misconfigured: REFRESH_TOKEN_EXPIRES_IN must be like '30d' or seconds",
//     );

//   const session = await prisma.userSession.create({
//     data: {
//       userId: user.id,
//       refreshToken: "__PENDING__",
//       deviceId: meta.deviceId,
//       deviceType: meta.deviceType,
//       userAgent: meta.userAgent,
//       ipAddress: meta.ipAddress,
//       expiresAt: addSeconds(new Date(), refreshSeconds),
//     },
//   });

//   const accessToken = jwtHelpers.createToken(
//     { id: user.id, email: user.email, role: user.role, sessionId: session.id },
//     getJwtSecret(),
//     accessExpiresIn,
//   );

//   const refreshToken = jwtHelpers.createToken(
//     { sessionId: session.id, userId: user.id },
//     getRefreshSecret(),
//     refreshExpiresIn,
//   );

//   // session update fail হলে zombie session cleanup
//   try {
//     await prisma.userSession.update({
//       where: { id: session.id },
//       data: { refreshToken: sha256(`${session.id}:${refreshToken}`) },
//     });
//   } catch (err) {
//     await prisma.userSession.delete({ where: { id: session.id } });
//     throw new ApiError(
//       httpStatus.INTERNAL_SERVER_ERROR,
//       "Session creation failed, please try again",
//     );
//   }

//   // user profile cache
//   await redis.setex(
//     `user:${user.id}`,
//     TTL.SHORT,
//     JSON.stringify({
//       id: user.id,
//       email: user.email,
//       role: user.role,
//       status: user.status ?? UserStatus.ACTIVE,
//     }),
//   );

//   return { accessToken, refreshToken, sessionId: session.id };
// };

export const issueTokensAndSession = async (
  user: { id: string; email: string; role: userRole; status?: UserStatus },
  meta: {
    deviceId: string;
    deviceType?: string;
    userAgent?: string;
    ipAddress?: string;
  },
): Promise<AuthTokens> => {
  const accessExpiresIn = resolveExpiresIn(config.jwt.expires_in, "15m");
  const refreshExpiresIn = resolveExpiresIn(
    config.jwt.refresh_token_expires_in,
    "30d",
  );

  const refreshSeconds = parseExpiresInSeconds(refreshExpiresIn);
  if (!refreshSeconds)
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Server misconfigured: REFRESH_TOKEN_EXPIRES_IN must be like '30d' or seconds",
    );

  // 🆔 ফাইলের উপরে থাকা 'crypto' মডিউল সরাসরি ব্যবহার করে ২৪ ক্যারেক্টারের অবজেক্ট আইডি জেনারেট করা হচ্ছে
  const generatedSessionId = crypto.randomBytes(12).toString("hex");

  // 🔑 আগে থেকেই টোকেন দুটো তৈরি করে নেওয়া হচ্ছে
  const accessToken = jwtHelpers.createToken(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      sessionId: generatedSessionId,
    },
    getJwtSecret(),
    accessExpiresIn,
  );

  const refreshToken = jwtHelpers.createToken(
    { sessionId: generatedSessionId, userId: user.id },
    getRefreshSecret(),
    refreshExpiresIn,
  );

  // 🎯 সিঙ্গেল রাইটে ডাটাবেজে সেশন ক্রিয়েট হবে
  const session = await prisma.userSession.create({
    data: {
      id: generatedSessionId,
      userId: user.id,
      refreshToken: sha256(`${generatedSessionId}:${refreshToken}`),
      deviceId: meta.deviceId,
      deviceType: meta.deviceType,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt: addSeconds(new Date(), refreshSeconds),
    },
  });

  // user profile cache
  await redis.setex(
    `user:${user.id}`,
    TTL.SHORT,
    JSON.stringify({
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status ?? UserStatus.ACTIVE,
    }),
  );
  
  await redis.setex(
    `session:${generatedSessionId}`,
    TTL.SHORT,
    "valid",
  );

  return { accessToken, refreshToken, sessionId: session.id };
};
// ─────────────────────────────────────────────────────────────────────────────
// REGISTRATION FLOW
// Step 1: register   → OTP email পাঠাও
// Step 2: verifyEmailOtp → OTP check করো, user তৈরি করো
// Step 3: resendEmailVerificationOtp → OTP আবার পাঠাও
// ─────────────────────────────────────────────────────────────────────────────

export const registerService = async (payload: RegisterInput) => {
  const email = normalizeEmail(payload.email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing)
    throw new ApiError(
      httpStatus.CONFLICT,
      "User with this email already exists",
    );

  const passwordHash = await hashPassword(payload.password);

  return sendOtpService({
    identifier: email,
    purpose: "EMAIL_VERIFICATION",
    channel: "email",
    signup: {
      email,
      passwordHash,
      firstName: payload.firstName,
      lastName: payload.lastName,
    },
  });
};

export const verifyEmailOtpService = async (payload: VerifyEmailOtpInput) => {
  const email = normalizeEmail(payload.email);
  const stored = await verifyOtpService({
    identifier: email,
    purpose: "EMAIL_VERIFICATION",
    otp: payload.otp,
  });

  if (!stored.signup)
    throw new ApiError(httpStatus.BAD_REQUEST, "OTP expired or not found");

  let created: { id: string; email: string };
  try {
    created = await prisma.user.create({
      data: {
        email,
        password: stored.signup.passwordHash,
        role: userRole.USER,
        provider: "EMAIL_PASSWORD",
        userDetails: {
          create: {
            firstName: stored.signup.firstName,
            lastName: stored.signup.lastName,
          },
        },
      },
      select: { id: true, email: true },
    });
  } catch (error) {
    if (isUniqueConstraintError(error))
      throw new ApiError(
        httpStatus.CONFLICT,
        "User with this email already exists",
      );
    throw error;
  }

  return { id: created.id, email: created.email };
};

export const resendEmailVerificationOtpService = async (payload: {
  email: string;
}) => {
  const email = normalizeEmail(payload.email);

  return resendOtpService({
    identifier: email,
    purpose: "EMAIL_VERIFICATION",
    channel: "email",
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────

export const loginService = async (payload: LoginInput) => {
  const email = normalizeEmail(payload.email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password: true,
      role: true,
      provider: true,
      status: true,
    },
  });

  if (!user || !user.password)
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid credentials");

  const ok = await comparePassword(payload.password, user.password);
  if (!ok) throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid credentials");

  // Suspended user login block করো
  if (user.status === UserStatus.SUSPENDED)
    throw new ApiError(httpStatus.FORBIDDEN, "Your account has been suspended");

  const deviceId =
    payload.deviceId?.trim() ||
    crypto.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const tokens = await issueTokensAndSession(
    { id: user.id, email: user.email, role: user.role, status: user.status },
    {
      deviceId,
      deviceType: payload.deviceType,
      userAgent: payload.userAgent,
      ipAddress: payload.ipAddress,
    },
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      provider: user.provider,
    },
    ...tokens,
    deviceId,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD FLOW
// Step 1: forgotPassword        → OTP email পাঠাও
// Step 2: resetPassword         → OTP দিয়ে password update করো
// Step 3: resendResetOtp        → OTP আবার পাঠাও
// ─────────────────────────────────────────────────────────────────────────────

export const forgotPasswordService = async (payload: ForgotPasswordInput) => {
  const email = normalizeEmail(payload.email);
  const user = await prisma.user.findUnique({ where: { email } });

  // User না পেলেও success return — enumeration attack avoid করতে
  if (!user) return { email, otpExpiresInMinutes: OTP_EXPIRE_DURATION_MINUTES };

  return sendOtpService({
    identifier: email,
    purpose: "PASSWORD_RESET",
    channel: "email",
  });
};

export const resetPasswordService = async (payload: ResetPasswordInput) => {
  const email = normalizeEmail(payload.email);
  await verifyOtpService({
    identifier: email,
    purpose: "PASSWORD_RESET",
    otp: payload.otp,
  });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found");

  const newHash = await hashPassword(payload.newPassword);

  await Promise.all([
    prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: newHash },
      }),
      prisma.userSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]),
    redis.del(`user:${user.id}`).catch(() => {}),
  ]);

  return { email };
};

export const resendResetOtpService = async (payload: { email: string }) => {
  const email = normalizeEmail(payload.email);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { email, otpExpiresInMinutes: OTP_EXPIRE_DURATION_MINUTES };

  return resendOtpService({
    identifier: email,
    purpose: "PASSWORD_RESET",
    channel: "email",
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE PASSWORD (logged-in user)
// ─────────────────────────────────────────────────────────────────────────────

export const changePasswordService = async (
  payload: { currentPassword: string; newPassword: string },
  userId: string,
) => {
  const userData = await insecurePrisma.user.findFirst({
    where: { id: userId, status: UserStatus.ACTIVE },
  });

  if (!userData) throw new ApiError(httpStatus.UNAUTHORIZED, "User not found");

  const isCorrectPassword = await comparePassword(
    payload.currentPassword,
    userData.password as string,
  );
  if (!isCorrectPassword)
    throw new ApiError(httpStatus.BAD_REQUEST, "Current password is incorrect");

  const hashedPassword = await hashPassword(payload.newPassword);

  await Promise.all([
    prisma.user.update({
      where: { id: userData.id },
      data: { password: hashedPassword },
    }),
    // ✅ সব active session revoke করো
    prisma.userSession.updateMany({
      where: { userId: userData.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    // ✅ cache clear করো
    redis.del(`user:${userData.id}`).catch(() => {}),
  ]);

  return { message: "Password changed successfully!" };
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────────────────────

export const logoutService = async (params: {
  userId: string;
  sessionId?: string | null;
  accessToken?: string | null;
}) => {
  const { userId, sessionId, accessToken } = params;

  // Session revoke করো
  if (sessionId) {
    await prisma.userSession.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
  }

  // Cache delete করো
  await redis.del(`user:${userId}`).catch(() => {});

  // Access token blacklist করো
  if (accessToken) {
    const raw = accessToken.replace(/^bearer /i, "").trim();
    try {
      const decoded = jwtHelpers.verifyToken(raw, getJwtSecret());
      const exp = (decoded as any)?.exp;
      const now = Math.floor(Date.now() / 1000);
      let ttl = TTL.TOKEN;
      if (typeof exp === "number") {
        const seconds = exp - now;
        if (seconds > 0) ttl = Math.min(seconds, TTL.TOKEN);
      }
      await blacklistToken(raw, ttl);
    } catch {
      // Token already expired হলেও blacklist করো default TTL দিয়ে
      await blacklistToken(raw, TTL.TOKEN).catch(() => {});
    }
  }
};
