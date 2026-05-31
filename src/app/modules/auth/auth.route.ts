import { Router } from "express";
import validateRequest from "../../middlewares/validateRequest";
import {
  changePasswordController,
  forgotPasswordController,
  loginController,
  registerController,
  resendOtpController,
  resetPasswordController,
  verifyEmailOtpController,
  logoutController,
} from "./auth.controller";
import { authValidation } from "./auth.validation";
import {
  facebookAuthCallback,
  facebookAuthRedirect,
  googleAuthCallback,
  googleAuthRedirect,
} from "./passport";
import auth from "../../middlewares/auth";
import otpRouter from "../otp/otp.route";
import { userRole } from "@prisma/client";

const authRouter = Router();

authRouter.post(
  "/register",
  validateRequest(authValidation.registerSchema),
  registerController,
);

authRouter.post(
  "/verify-email-otp",
  validateRequest(authValidation.verifyEmailOtpSchema),
  verifyEmailOtpController,
);
authRouter.post(
  "/resend-otp",
  validateRequest(authValidation.resendOtpSchema),
  resendOtpController,
);

authRouter.post(
  "/login",
  validateRequest(authValidation.loginSchema),
  loginController,
);

authRouter.post(
  "/forgot-password",
  validateRequest(authValidation.forgotPasswordSchema),
  forgotPasswordController,
);

authRouter.post(
  "/reset-password",
  validateRequest(authValidation.resetPasswordSchema),
  resetPasswordController,
);

authRouter.post(
  "/change-password",
  auth(userRole.USER, userRole.ADMIN),
  validateRequest(authValidation.changePasswordSchema),
  changePasswordController,
);

authRouter.post(
  "/logout",
  auth(userRole.USER, userRole.ADMIN),
  logoutController,
);

authRouter.use("/otp", otpRouter);

authRouter.get("/social-login/google", googleAuthRedirect);
authRouter.get("/social-login/google/callback", googleAuthCallback);

authRouter.get("/social-login/facebook", facebookAuthRedirect);
authRouter.get("/social-login/facebook/callback", facebookAuthCallback);

export default authRouter;
