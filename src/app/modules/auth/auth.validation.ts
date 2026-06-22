import { z } from "zod";

const commonQuerySchema = z.record(z.string(), z.string());

const emailSchema = z.string().email();

const otpSchema = z
  .string()
  .min(4, "OTP must be 4 digits")
  .max(6, "OTP is too long")
  .regex(/^\d+$/, "OTP must be numeric");

const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters");

const registerSchema = z.object({
  body: z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: emailSchema,
      password: passwordSchema,
    })
    .strict(),
  query: commonQuerySchema,
  params: z.record(z.string(), z.string()),
});

const verifyEmailOtpSchema = z.object({
  body: z
    .object({
      email: emailSchema,
      otp: otpSchema,
    })
    .strict(),
  query: commonQuerySchema,
  params: z.record(z.string(), z.string()),
});

const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    deviceId: z.string().min(1).optional(),
    deviceType: z.string().min(1).optional(),
    userAgent: z.string().min(1).optional(),
    ipAddress: z.string().min(1).optional(),
  })
  .strict();

const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

const resetPasswordSchema = z
  .object({
    email: emailSchema,
    otp: otpSchema,
    newPassword: passwordSchema,
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
  })
  .strict();

const resendOtpSchema = z.object({
  email: emailSchema,
});

export const authValidation = {
  registerSchema,
  verifyEmailOtpSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
};
