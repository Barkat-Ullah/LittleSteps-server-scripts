import { z } from "zod";

const commonQuerySchema = z.record(z.string(), z.string());
const commonParamsSchema = z.record(z.string(), z.string());

const identifierSchema = z.string().min(1, "Identifier is required");
const otpSchema = z
  .string()
  .min(4, "OTP must be 4 digits")
  .max(6, "OTP is too long")
  .regex(/^[0-9]+$/, "OTP must be numeric");

const otpPurposeSchema = z.enum(["EMAIL_VERIFICATION", "PASSWORD_RESET"]);
const otpChannelSchema = z.enum(["email", "sms"]).optional();

const sendOtpSchema = z.object({
  body: z
    .object({
      identifier: identifierSchema,
      purpose: otpPurposeSchema,
      channel: otpChannelSchema,
    })
    .strict(),
  query: commonQuerySchema,
  params: commonParamsSchema,
});

const verifyOtpSchema = z.object({
  body: z
    .object({
      identifier: identifierSchema,
      purpose: otpPurposeSchema,
      otp: otpSchema,
    })
    .strict(),
  query: commonQuerySchema,
  params: commonParamsSchema,
});

const resendOtpSchema = z.object({
  body: z
    .object({
      identifier: identifierSchema,
      purpose: otpPurposeSchema,
      channel: otpChannelSchema,
    })
    .strict(),
  query: commonQuerySchema,
  params: commonParamsSchema,
});

export const otpValidation = {
  sendOtpSchema,
  verifyOtpSchema,
  resendOtpSchema,
};
