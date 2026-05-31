import { Router } from "express";
import validateRequest from "../../middlewares/validateRequest";
import { otpValidation } from "./otp.validation";
import {
  resendOtpController,
  sendOtpController,
  verifyOtpController,
} from "./otp.controller";

const otpRouter = Router();

otpRouter.post(
  "/send",
  validateRequest(otpValidation.sendOtpSchema),
  sendOtpController,
);

otpRouter.post(
  "/verify",
  validateRequest(otpValidation.verifyOtpSchema),
  verifyOtpController,
);

otpRouter.post(
  "/resend",
  validateRequest(otpValidation.resendOtpSchema),
  resendOtpController,
);

export default otpRouter;
