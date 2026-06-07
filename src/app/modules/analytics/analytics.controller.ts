import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { AnalyticsPeriod, analyticsService } from "./analytics.service";
import ApiError from "../../../error/ApiErrors";

const getAnalyticsByPeriodData = catchAsync(
  async (req: Request, res: Response) => {
    const { childId } = req.params;
    const { period, date } = req.query;

    if (!date || typeof date !== "string") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "date query param is required (YYYY-MM-DD)",
      );
    }

    const result = await analyticsService.getAnalyticsByPeriod(
      childId,
      req.user!.id,
      (period as AnalyticsPeriod) ?? "week",
      date,
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Behavior log retrieved successfully",
      data: result,
    });
  },
);

const getAnalyticsArticleByPeriodData = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const period = (req.query.period as "week" | "month") || "week";

    const result = await analyticsService.getAnalyticsArticleByPeriod(
      userId,
      period as AnalyticsPeriod,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Behavior log retrieved successfully",
      data: result,
    });
  },
);
export const analyticsController = {
  getAnalyticsByPeriodData,
  getAnalyticsArticleByPeriodData,
};
