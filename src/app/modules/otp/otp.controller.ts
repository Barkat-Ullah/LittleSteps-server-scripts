import type { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import {
  resendOtpService,
  sendOtpService,
  verifyOtpService,
} from "./otp.service";

export const sendOtpController = catchAsync(
  async (req: Request, res: Response) => {
    const body = req.body;
    const result = await sendOtpService(body);
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "OTP has been sent",
      data: result,
    });
  },
);

export const verifyOtpController = catchAsync(
  async (req: Request, res: Response) => {
    const body = req.body;
    await verifyOtpService(body);
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "OTP verified successfully",
    });
  },
);

export const resendOtpController = catchAsync(
  async (req: Request, res: Response) => {
    const body = req.body;
    const result = await resendOtpService(body);
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "OTP resent successfully",
      data: result,
    });
  },
);
