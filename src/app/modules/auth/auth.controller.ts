import type { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { setAuthCookies } from "./auth.cookies";
import { clearAuthCookies } from "./auth.cookies";
import {
  forgotPasswordService,
  loginService,
  registerService,
  resetPasswordService,
  verifyEmailOtpService,
  changePasswordService,
  resendResetOtpService,
  logoutService,
} from "./auth.service";

export const registerController = catchAsync(
  async (req: Request, res: Response) => {
    const body = req.body;
    const result = await registerService(body);
    return sendResponse(res, {
      statusCode: 201,
      success: true,
      message: "OTP sent to email. Please verify to complete registration",
      data: result,
    });
  },
);

export const verifyEmailOtpController = catchAsync(
  async (req: Request, res: Response) => {
    const body = req.body;
    const result = await verifyEmailOtpService(body);
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Email verified successfully",
      data: result,
    });
  },
);

export const resendOtpController = catchAsync(
  async (req: Request, res: Response) => {
    const body = req.body;
    const result = await resendResetOtpService(body);
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "OTP sent to email",
      data: result,
    });
  },
);

export const loginController = catchAsync(
  async (req: Request, res: Response) => {
    const body = req.body;

    // Fill device metadata from headers when not provided.
    if (!body.deviceId) {
      body.deviceId = req.get("x-device-id") ?? undefined;
    }
    if (!body.userAgent) {
      body.userAgent = req.get("user-agent") ?? undefined;
    }
    if (!body.ipAddress) {
      body.ipAddress = req.get("x-forwarded-for") ?? undefined;
    }

    const result = await loginService(body);

    // Store tokens in secure HttpOnly cookies for browser clients.
    setAuthCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      sessionId: result.sessionId,
    });

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Login successful",
      data: result,
    });
  },
);

export const forgotPasswordController = catchAsync(
  async (req: Request, res: Response) => {
    const body = req.body;
    const result = await forgotPasswordService(body);
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "If the email exists, an OTP has been sent",
      data: result,
    });
  },
);

export const resetPasswordController = catchAsync(
  async (req: Request, res: Response) => {
    const body = req.body;
    const result = await resetPasswordService(body);
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Password reset successfully",
      data: result,
    });
  },
);

export const changePasswordController = catchAsync(
  async (req: Request, res: Response) => {
    const body = req.body;
    const userId = req.user!.id; // Auth middleware guarantees req.user is set
    const result = await changePasswordService(body, userId);
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Password changed successfully",
      data: result,
    });
  },
);

export const logoutController = catchAsync(
  async (req: Request, res: Response) => {
    const accessToken = req.get("authorization") ?? req.cookies?.accessToken;
    const sessionId = req.cookies?.sessionId ?? req.body?.sessionId;
    const userId = req.user!.id;

    await logoutService({ userId, sessionId, accessToken });

    clearAuthCookies(res);

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Logged out successfully",
    });
  },
);
