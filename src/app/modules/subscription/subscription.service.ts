import httpStatus from "http-status";
import { PaymentStatus, Prisma } from "@prisma/client";
import { Request } from "express";
import { IPaginationOptions } from "../../../interfaces/pagination";
import { paginationHelper } from "../../../shared/pagination";
import prisma from "../../../shared/prisma";
import ApiError from "../../../error/ApiErrors";
import { toStringArray, getOrCreateStripeCustomer } from "./subscription.utils";
import { subscriptionQueue } from "../../../helpers/queue/queueFactory";

// ─── GET ALL SUBSCRIPTIONS ───────────────────────────────────────────────────
type ISubscriptionFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
};

const subscriptionSearchAbleFields = ["title"];

const getSubscriptionList = async (
  options: IPaginationOptions,
  filters: ISubscriptionFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.SubscriptionWhereInput[] = [{ isDeleted: false }];

  if (searchTerm) {
    andConditions.push({
      OR: subscriptionSearchAbleFields.map((field) => ({
        [field]: { contains: searchTerm, mode: "insensitive" },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    Object.keys(filterData).forEach((key) => {
      const value = (filterData as any)[key];
      if (value === "" || value === null || value === undefined) return;

      if (key === "createdAt" && value) {
        const parts = (value as string).split("-");
        if (parts.length === 2) {
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          const start = new Date(year, month, 1, 0, 0, 0, 0);
          const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
          andConditions.push({
            createdAt: { gte: start.toISOString(), lte: end.toISOString() },
          });
        } else {
          const start = new Date(value);
          start.setHours(0, 0, 0, 0);
          const end = new Date(value);
          end.setHours(23, 59, 59, 999);
          andConditions.push({
            createdAt: { gte: start.toISOString(), lte: end.toISOString() },
          });
        }
        return;
      }
      if (key.includes(".")) {
        const [relation, field] = key.split(".");
        andConditions.push({ [relation]: { some: { [field]: value } } });
        return;
      }
      andConditions.push({ [key]: value } as any);
    });
  }

  const whereConditions: Prisma.SubscriptionWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.subscription.findMany({
    skip,
    take: limit,
    where: whereConditions,
    select: {
      id: true,
      title: true,
      amount: true,
      duration: true,
      isDeleted: true,
      features: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.subscription.count({ where: whereConditions });
  const totalUser = await prisma.user.count();

  return { meta: { total, page, limit, totalUser }, data: result };
};

// ─── BUY SUBSCRIPTION IN APP (HIGH TRAFFIC OPTIMIZED) ────────────────────────
const buySubscriptionInApp = async (req: Request) => {
  const userId = req.user!.id;
  const { subscriptionId, paymentMethodId } = req.body;

  const plan = await prisma.subscription.findFirst({
    where: { id: subscriptionId, isDeleted: false },
  });
  if (!plan)
    throw new ApiError(httpStatus.NOT_FOUND, "Subscription plan not found");
  if (!plan.stripePriceId)
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Stripe price not configured for this plan",
    );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      userDetails: { select: { firstName: true, lastName: true } },
    },
  });
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found");

  const stripeCustomerId = await getOrCreateStripeCustomer(
    user.id,
    user.email,
    `${user?.userDetails?.firstName} ${user?.userDetails?.lastName}` as string,
  );

  const job = await subscriptionQueue.add("process-in-app-purchase", {
    userId,
    subscriptionId,
    paymentMethodId,
    stripeCustomerId,
    plan,
  });

  return {
    success: true,
    message: "Your subscription payment is queueing for processing safely.",
    jobId: job.id,
  };
};

// ─── BUY SUBSCRIPTION BY LINK (HIGH TRAFFIC OPTIMIZED) ───────────────────────
const buySubscriptionByLink = async (req: Request) => {
  const userId = req.user!.id;
  const { subscriptionId } = req.body;

  const plan = await prisma.subscription.findFirst({
    where: { id: subscriptionId, isDeleted: false },
  });
  if (!plan)
    throw new ApiError(httpStatus.NOT_FOUND, "Subscription plan not found");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      userDetails: { select: { firstName: true, lastName: true } },
    },
  });
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found");

  const stripeCustomerId = await getOrCreateStripeCustomer(
    user.id,
    user.email,
    `${user?.userDetails?.firstName} ${user?.userDetails?.lastName}` as string,
  );

  const job = await subscriptionQueue.add("generate-checkout-link", {
    userId,
    subscriptionId,
    stripeCustomerId,
    plan,
  });

  return {
    success: true,
    message: "Initiating checkout process...",
    jobId: job.id,
  };
};

// ─── UPDATE IN APP PURCHASE PLAN (WEBHOOK / DIRECT CALLBACK SAFE) ─────────────
const updateInAppPurchasePlanData = async (req: Request) => {
  const userId = req.user!.id;
  const {
    subscriptionId,
    amount,
    subscriptionStart,
    subscriptionEnd,
    currency = "usd",
  } = req.body;

  if (!subscriptionId || !amount || !subscriptionStart || !subscriptionEnd) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Missing required fields");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription)
    throw new ApiError(httpStatus.NOT_FOUND, "Subscription not found");

  const resolvedEndDate = new Date(subscriptionEnd);

  const result = await prisma.$transaction(async (tx) => {
    const currentUser = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        userDetails: { select: { firstName: true, lastName: true } },
      },
    });
    if (!currentUser)
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");

    const updatedSubscription = await tx.userSubscription.upsert({
      where: { userId_subscriptionId: { userId, subscriptionId } },
      create: {
        userId,
        subscriptionId,
        amount,
        startDate: new Date(subscriptionStart),
        endDate: resolvedEndDate,
      },
      update: {
        startDate: new Date(subscriptionStart),
        endDate: resolvedEndDate,
        amount,
      },
    });

    const payment = await tx.payment.create({
      data: {
        userId,
        subscriptionId,
        amount,
        currency,
        status: PaymentStatus.SUCCESS,
      },
    });

    return { updatedSubscription, payment, currentUser };
  });

  await subscriptionQueue.add("send-subscription-notifications", {
    userId,
    amount,
    planTitle: subscription.title,
    planDuration: subscription.duration,
    paymentId: result.payment.id,
    userFullName: `${result?.currentUser?.userDetails?.firstName} ${result?.currentUser?.userDetails?.lastName}`,
  });

  return {
    message: "Subscription updated successfully!",
    subscription: result.updatedSubscription,
  };
};

// ─── OTHER AUXILIARY SERVICES ────────────────────────────────────────────────
const createSubscription = async (req: Request) => {
  console.log("");
};
const getUserSubscriptionList = async (req: Request) => {
  console.log("");
};

const getSubscriptionById = async (req: Request) => {
  const { id } = req.params;
  const result = await prisma.subscription.findUnique({ where: { id } });
  if (!result)
    throw new ApiError(httpStatus.NOT_FOUND, "Subscription not found");
  return result;
};

const updateSubscription = async (req: Request) => {
  const { id } = req.params;
  const data = req.body;
  const existing = await prisma.subscription.findUnique({ where: { id } });
  if (!existing)
    throw new ApiError(httpStatus.NOT_FOUND, "Subscription not found");

  const incomingFeatures = data.feature ?? data.features ?? null;
  let featuresToSave: string[] = incomingFeatures
    ? toStringArray(incomingFeatures)
    : [];

  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.amount !== undefined) updateData.amount = parseFloat(data.amount);
  if (data.duration !== undefined) updateData.duration = data.duration;
  if (featuresToSave.length > 0) updateData.features = featuresToSave;

  return await prisma.subscription.update({ where: { id }, data: updateData });
};

const deleteSubscription = async (req: Request) => {
  const { id } = req.params;
  return await prisma.subscription.update({
    where: { id },
    data: { isDeleted: true },
  });
};

const getMyPlan = async (req: Request) => {
  const plan = await prisma.userSubscription.findFirst({
    where: { userId: req.user!.id },
    include: { subscription: true },
    orderBy: { createdAt: "desc" },
  });
  if (!plan) throw new ApiError(404, "You do not have any active plan");
  return plan;
};

const cancelPlan = async (req: Request) => {
  const currentPlan = await prisma.userSubscription.findFirst({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });
  if (!currentPlan)
    throw new ApiError(httpStatus.NOT_FOUND, "No active plan found");
  const result = await prisma.userSubscription.delete({
    where: { id: currentPlan.id },
  });
  return { message: "Plan cancelled successfully", plan: result };
};

export const subscriptionService = {
  createSubscription,
  getSubscriptionList,
  getSubscriptionById,
  updateSubscription,
  deleteSubscription,
  cancelPlan,
  updateInAppPurchasePlanData,
  getMyPlan,
  getUserSubscriptionList,
  buySubscriptionInApp,
  buySubscriptionByLink,
};
