import httpStatus from "http-status";
import { behaviorLogService } from "./behaviorLog.service";
import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";

// create BehaviorLog
const updateBehaviorLog = catchAsync(async (req: Request, res: Response) => {
  const { childId, selectedBehaviors } = req.body;

  // [{ behavior: string, date: string }]

  const result = await behaviorLogService.createMultipleEntries(
    {
      childId,
      selectedBehaviors,
    },
    (req as any).accessId,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: result.message || "BehaviorLog created successfully",
    data: result,
  });
});

// get BehaviorLog by id
const getBehaviorLogByChild = catchAsync(
  async (req: Request, res: Response) => {
    const result = await behaviorLogService.getBehaviorLogByChild(req);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "BehaviorLog details retrieved successfully",
      data: result,
    });
  },
);

export const behaviorLogController = {
  updateBehaviorLog,
  getBehaviorLogByChild,
};