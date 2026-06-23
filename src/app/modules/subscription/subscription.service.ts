import httpStatus from "http-status";
import { PaymentStatus, Prisma } from "@prisma/client";
import { Request } from "express";
import { IPaginationOptions } from "../../../interfaces/pagination";
import { paginationHelper } from "../../../shared/pagination";
import prisma from "../../../shared/prisma";
import ApiError from "../../../error/ApiErrors";
import { toStringArray, getOrCreateStripeCustomer } from "./subscription.utils";
import { subscriptionQueue } from "../../../helpers/queue/queueFactory";
import Stripe from "stripe";
import { stripe } from "../../../lib/stripe";

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
      isLifeTime: true,
      features: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.subscription.count({ where: whereConditions });
  const totalUser = await prisma.user.count();

  return { meta: { total, page, limit, totalUser }, data: result };
};

// ─── BUY SUBSCRIPTION IN APP (SYNC STRIPE CALL - NO QUEUE) ───────────────────
const buySubscriptionInApp = async (req: Request) => {
  const userId = req.user!.id;
  const { subscriptionId, paymentMethodId } = req.body;

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

  // Attach payment method if provided
  if (paymentMethodId) {
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: stripeCustomerId,
    });
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }

  // Create payment record BEFORE Stripe call → webhook race safe
  const pendingPayment = await prisma.payment.create({
    data: {
      userId,
      subscriptionId: plan.id,
      amount: plan.amount,
      currency: "usd",
      status: "PENDING",
      stripeCustomerId,
    },
  });

  if (plan.isLifeTime) {
    // ── Lifetime: PaymentIntent ──────────────────────────────────────────
    const paymentIntent = await stripe.paymentIntents.create({
      amount: plan.amount * 100,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
      metadata: {
        userId,
        subscriptionId: plan.id,
        isLifeTime: "true",
        paymentId: pendingPayment.id,
      },
    });

    // Update payment record with Stripe info
    await prisma.payment.update({
      where: { id: pendingPayment.id },
      data: { stripePaymentId: paymentIntent.id },
    });
  } else {
    // ── Recurring: Subscription ──────────────────────────────────────────
    if (!plan.stripePriceId)
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Stripe price not configured for this plan",
      );

    const stripeSubscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan.stripePriceId }],
      default_payment_method: paymentMethodId,
      payment_behavior: "default_incomplete",
      metadata: {
        userId,
        subscriptionId: plan.id,
        isLifeTime: "false",
        paymentId: pendingPayment.id,
      },
    });

    // Update payment record with Stripe info
    await prisma.payment.update({
      where: { id: pendingPayment.id },
      data: { stripeSessionId: stripeSubscription.id },
    });
  }

  return {
    success: true,
    message: "Subscription payment initiated successfully.",
    paymentId: pendingPayment.id,
  };
};

// ─── BUY SUBSCRIPTION BY LINK (HIGH TRAFFIC OPTIMIZED) ───────────────────────
// subscription.service.ts

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
    `${user?.userDetails?.firstName ?? ""} ${user?.userDetails?.lastName ?? ""}`.trim(),
  );

  // ✅ Stripe call synchronous — client এখনই URL পাবে
  const successUrl = `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${process.env.CLIENT_URL}/cancel`;

  let session: Stripe.Checkout.Session;

  if (plan.isLifeTime) {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: plan.amount * 100,
            product_data: { name: plan.title ?? "Lifetime Plan" },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: { userId, subscriptionId: plan.id, isLifeTime: "true" },
      },
      metadata: { userId, subscriptionId: plan.id, isLifeTime: "true" },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  } else {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: plan.stripePriceId!, quantity: 1 }],
      subscription_data: {
        metadata: { userId, subscriptionId: plan.id, isLifeTime: "false" },
      },
      metadata: { userId, subscriptionId: plan.id, isLifeTime: "false" },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  await prisma.payment.create({
    data: {
      userId,
      subscriptionId: plan.id,
      amount: plan.amount,
      currency: "usd",
      status: "PENDING",
      stripeSessionId: session.id,
      stripeCustomerId,
    },
  });

  return {
    success: true,
    checkoutUrl: session.url,
    sessionId: session.id,
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

// ─── NOT YET IMPLEMENTED ─────────────────────────────────────────────────────

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
  if (data.isLifeTime !== undefined) updateData.isLifeTime = data.isLifeTime;
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
  // Soft cancel: set endDate to now instead of hard-deleting — keeps audit trail
  const result = await prisma.userSubscription.update({
    where: { id: currentPlan.id },
    data: { endDate: new Date() },
  });
  return { message: "Plan cancelled successfully", plan: result };
};

export const subscriptionService = {
  getSubscriptionList,
  getSubscriptionById,
  updateSubscription,
  deleteSubscription,
  cancelPlan,
  updateInAppPurchasePlanData,
  getMyPlan,
  buySubscriptionInApp,
  buySubscriptionByLink,
};
