import type { Provider, userRole } from "@prisma/client";

export type RegisterInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type VerifyEmailOtpInput = {
  email: string;
  otp: string;
};

export type LoginInput = {
  email: string;
  password: string;
  deviceId?: string;
  deviceType?: string;
  userAgent?: string;
  ipAddress?: string;
};

export type ForgotPasswordInput = {
  email: string;
};

export type VerifyResetOtpInput = {
  email: string;
  otp: string;
};

export type ResetPasswordInput = {
  email: string;
  otp: string;
  newPassword: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
};

export type JwtAccessPayload = {
  id: string;
  email: string;
  role: userRole;
  sessionId: string;
};

export type JwtRefreshPayload = {
  sessionId: string;
  userId: string;
};

export type SocialProvider = Extract<Provider, "GOOGLE" | "FACEBOOK">;
