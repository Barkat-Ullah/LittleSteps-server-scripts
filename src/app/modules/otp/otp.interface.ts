export type OtpPurpose = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export type OtpChannel = "email" | "sms";

export type PendingSignup = {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
};

export type StoredOtpPayload = {
  otpHash: string;
  createdAt: string;
  metadata?: Record<string, string>;
  otpExpiresAt?: string;
  signup?: PendingSignup;
};

export type SendOtpInput = {
  identifier: string;
  purpose: OtpPurpose;
  channel?: OtpChannel;
  signup?: PendingSignup;
};

export type VerifyOtpInput = {
  identifier: string;
  purpose: OtpPurpose;
  otp: string;
};

export type ResendOtpInput = {
  identifier: string;
  purpose: OtpPurpose;
  channel?: OtpChannel;
};
