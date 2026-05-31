import httpStatus from "http-status";
import { subscriptionService } from "./subscription.service";
import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pick from "../../../shared/pick";

// create Subscription
const createSubscription = catchAsync(async (req: Request, res: Response) => {
  const result = await subscriptionService.createSubscription(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Subscription created successfully",
    data: result,
  });
});

const buySubscriptionOnLink = catchAsync(
  async (req: Request, res: Response) => {
    const result = await subscriptionService.buySubscriptionByLink(req);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Subscription purchase successful",
      data: result,
    });
  },
);
const buySubscriptionOnApp = catchAsync(async (req: Request, res: Response) => {
  const result = await subscriptionService.buySubscriptionInApp(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription purchase successful",
    data: result,
  });
});

// get all Subscription
const subscriptionFilterableFields = ["searchTerm", "id", "createdAt", "tier"];
const getSubscriptionList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const filters = pick(req.query, subscriptionFilterableFields);
  const result = await subscriptionService.getSubscriptionList(
    options,
    filters,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription list retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});

// get all UserSubscription
const userSubscriptionFilterableFields = ["searchTerm", "id", "createdAt"];
const getUserSubscriptionList = catchAsync(
  async (req: Request, res: Response) => {
    const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
    const filters = pick(req.query, userSubscriptionFilterableFields);
    const result = await subscriptionService.getUserSubscriptionList(req);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "UserSubscription list retrieved successfully",
      data: result,
    });
  },
);

const getMyPlan = catchAsync(async (req: Request, res: Response) => {
  const result = await subscriptionService.getMyPlan(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My Subscription details retrieved successfully",
    data: result,
  });
});

const cancelMyPlan = catchAsync(async (req: Request, res: Response) => {
  const result = await subscriptionService.cancelPlan(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result.plan,
  });
});

const inAppSubscription = catchAsync(async (req: Request, res: Response) => {
  const result = await subscriptionService.updateInAppPurchasePlanData(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

// get Subscription by id
const getSubscriptionById = catchAsync(async (req: Request, res: Response) => {
  const result = await subscriptionService.getSubscriptionById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription details retrieved successfully",
    data: result,
  });
});

// update Subscription
const updateSubscription = catchAsync(async (req: Request, res: Response) => {
  const result = await subscriptionService.updateSubscription(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription updated successfully",
    data: result,
  });
});

// delete Subscription
const deleteSubscription = catchAsync(async (req: Request, res: Response) => {
  const result = await subscriptionService.deleteSubscription(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription deleted successfully",
    data: result,
  });
});

export const subscriptionController = {
  createSubscription,
  getSubscriptionList,
  getSubscriptionById,
  updateSubscription,
  deleteSubscription,
  getMyPlan,
  inAppSubscription,
  cancelMyPlan,
  getUserSubscriptionList,
  buySubscriptionOnLink,
  buySubscriptionOnApp,
};
