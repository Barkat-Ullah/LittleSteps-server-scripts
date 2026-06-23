// controllers/webhook.controller.ts
import { DurationType } from "@prisma/client";
import { Request, Response } from "express";
import Stripe from "stripe";
import prisma from "../shared/prisma";
import { stripe } from "./stripe";
import redis from "./redisConnection";
import { subscriptionQueue } from "../helpers/queue/queueFactory";
import { getAdminId } from "../helpers/worker/suscription.worker";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ✅ Helper — duplicate webhook protection
const withIdempotency = async (
  eventId: string,
  handler: () => Promise<void>,
): Promise<void> => {
  const key = `webhook:processed:${eventId}`;

  // Already processed? Skip
  const already = await redis.get(key);
  if (already) {
    console.log(`⏭ Duplicate webhook skipped: ${eventId}`);
    return;
  }

  await handler();

  // Mark as processed — 24 hours (Stripe retry window)
  await redis.set(key, "1", "EX", 60 * 60 * 24);
};

type BasilInvoicePaymentEntry = {
  payment: {
    type: string;
    payment_intent?: string | Stripe.PaymentIntent;
  };
};

// ✅ subscription is always a string ID in webhook events, never an expanded object
type BasilInvoice = {
  id: string;
  object: "invoice";
  subscription?: string | null; // ← string only, no Stripe.Subscription object
  customer?: string | null; // ← string only, no Stripe.Customer object
  amount_paid?: number;
  amount_due?: number;
  billing_reason?: string | null;
  status?: string | null;
  payments?: { data: BasilInvoicePaymentEntry[] };
};

const calcEndDate = (duration: DurationType): Date => {
  const now = new Date();
  switch (duration) {
    case DurationType.Monthly:
      return new Date(now.setMonth(now.getMonth() + 1));
    case DurationType.Yearly:
      return new Date(now.setFullYear(now.getFullYear() + 1));
    default:
      return now;
  }
};

/**
 * Check if a user's subscription period end is still in the future.
 * Used to deduplicate when both invoice.payment_succeeded and invoice.finalized fire.
 */
const isSubscriptionActive = async (
  userId: string,
  subscriptionId: string,
): Promise<boolean> => {
  const existing = await prisma.userSubscription.findUnique({
    where: { userId_subscriptionId: { userId, subscriptionId } },
    select: { endDate: true },
  });
  return existing ? existing.endDate > new Date() : false;
};

const activateSubscription = async (
  userId: string,
  subscriptionId: string,
  amount: number,
  duration: DurationType,
) => {
  // Guard: skip if subscription end date is already in the future
  if (await isSubscriptionActive(userId, subscriptionId)) {
    console.log(
      `⏭ Subscription already active for ${userId} — skipping duplicate`,
    );
    return;
  }

  const startDate = new Date();
  const endDate = calcEndDate(duration);

  await prisma.$transaction([
    prisma.userSubscription.upsert({
      where: { userId_subscriptionId: { userId, subscriptionId } },
      update: { startDate, endDate, amount },
      create: { userId, subscriptionId, amount, startDate, endDate },
    }),
  ]);
};

const getCardDetails = async (paymentIntentId: string) => {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["payment_method"],
    });
    const pm = pi.payment_method as Stripe.PaymentMethod | null;
    return {
      paymentMethodType: pm?.type ?? undefined,
      cardBrand: pm?.card?.brand ?? undefined,
      cardLast4: pm?.card?.last4 ?? undefined,
      cardExpMonth: pm?.card?.exp_month ?? undefined,
      cardExpYear: pm?.card?.exp_year ?? undefined,
    };
  } catch (error) {
    console.warn("⚠️ Could not fetch card details:", error);
    return {};
  }
};

/**
 * Queue payment success notification (fires after payment is confirmed by Stripe).
 * This is the ONLY place notifications are queued — not from the service layer.
 */
const queuePaymentNotification = async (
  userId: string,
  amount: number,
  planTitle: string,
  planDuration: DurationType,
  paymentId: string,
  adminId: string | null,
): Promise<void> => {
  try {
    // Fetch user name for notification text
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        userDetails: { select: { firstName: true, lastName: true } },
      },
    });
    const userFullName = user?.userDetails
      ? `${user.userDetails.firstName ?? ""} ${user.userDetails.lastName ?? ""}`.trim()
      : "User";

    await subscriptionQueue.add("send-subscription-notifications", {
      userId,
      amount,
      planTitle,
      planDuration,
      paymentId,
      userFullName,
    });
  } catch (err: any) {
    console.error("⚠️ Failed to queue notification:", err.message);
  }
};

/**
 * Extract PaymentIntent ID from the Basil invoice.payments array.
 */
const extractPaymentIntentId = (invoice: BasilInvoice): string | null => {
  const entries = invoice.payments?.data ?? [];
  for (const entry of entries) {
    if (
      entry.payment?.type === "payment_intent" &&
      entry.payment.payment_intent
    ) {
      const pi = entry.payment.payment_intent;
      return typeof pi === "string" ? pi : pi.id;
    }
  }
  return null;
};

// ─── Webhook Handler: In-App (PaymentIntent / Subscription API) ───────────────

export const stripeWebhookForInApp = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sig = req.headers["stripe-signature"] as string;
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err: any) {
    console.error("❌ Webhook signature failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  console.log(`🔔 In-App Webhook received: ${event.type}`);

  try {
    await withIdempotency(event.id, async () => {
      switch (event.type) {
        // ──────────────────────────────────────────────────────────────────
        // 1. One-time Payment (Lifetime/Diamond)
        // ──────────────────────────────────────────────────────────────────
        case "payment_intent.succeeded": {
          const pi = event.data.object as Stripe.PaymentIntent;
          const { userId, subscriptionId, isLifeTime } = pi.metadata;

          if (!userId || !subscriptionId || isLifeTime !== "true") break;

          const plan = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
          });
          if (!plan) break;

          const cardDetails = await getCardDetails(pi.id);

          // Activate subscription (deduplicate-safe with isSubscriptionActive)
          await activateSubscription(
            userId,
            subscriptionId,
            pi.amount / 100,
            plan.duration,
          );

          const updateResult = await prisma.payment.updateMany({
            where: { stripePaymentId: pi.id, userId },
            data: {
              status: "SUCCESS",
              amount: pi.amount / 100,
              stripeCustomerId: (pi.customer as string) ?? undefined,
              ...cardDetails,
            },
          });

          // Notify user + admin about successful lifetime payment
          const inAppAdminId = await getAdminId();
          await queuePaymentNotification(
            userId,
            pi.amount / 100,
            plan.title,
            plan.duration,
            pi.metadata.paymentId ?? "",
            inAppAdminId,
          );

          console.log(
            `✅ Lifetime activated for ${userId}. DB Rows updated: ${updateResult.count}`,
          );
          break;
        }

        // ──────────────────────────────────────────────────────────────────
        // 2. Subscription Payments (Recurring)
        //    invoice.payment_succeeded is the SOLE source of truth for InApp.
        //    invoice.finalized will be skipped to avoid double-activation.
        // ──────────────────────────────────────────────────────────────────
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as unknown as BasilInvoice;

          if (
            invoice.billing_reason !== "subscription_create" &&
            invoice.billing_reason !== "subscription_cycle"
          ) {
            break;
          }

          const stripeSubId = invoice.subscription;
          if (!stripeSubId) break;

          const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
          const { userId, subscriptionId } = stripeSub.metadata;

          if (!userId || !subscriptionId) {
            console.error("❌ Missing metadata on subscription:", stripeSubId);
            break;
          }

          const plan = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
          });
          if (!plan) break;

          const paymentIntentId = extractPaymentIntentId(invoice);

          const cardDetails = paymentIntentId
            ? await getCardDetails(paymentIntentId)
            : {};
          const amountPaid = (invoice.amount_paid ?? 0) / 100;
          const customerId = invoice.customer ?? undefined;

          if (invoice.billing_reason === "subscription_create") {
            const updateResult = await prisma.payment.updateMany({
              where: { stripeSessionId: stripeSubId, userId },
              data: {
                status: "SUCCESS",
                amount: amountPaid,
                stripePaymentId: paymentIntentId ?? undefined,
                stripeSubscriptionId: stripeSubId, // ✅ store sub_xxx (Issue 7)
                stripeCustomerId: customerId,
                ...cardDetails,
              },
            });
            await activateSubscription(
              userId,
              subscriptionId,
              amountPaid,
              plan.duration,
            );

            const inAppAdminId1 = await getAdminId();
            await queuePaymentNotification(
              userId,
              amountPaid,
              plan.title,
              plan.duration,
              (await prisma.payment.findFirst({
                where: { stripeSessionId: stripeSubId, userId },
                select: { id: true },
              }))?.id ?? "",
              inAppAdminId1,
            );

            console.log(
              `✅ Subscription activated for ${userId}. Rows: ${updateResult.count}`,
            );
          } else {
            // Renewal — create a fresh payment record
            const renewalSessionId = `renewal_${stripeSubId}_${Date.now()}`;
            const renewalPayment = await prisma.payment.create({
              data: {
                userId,
                subscriptionId,
                amount: amountPaid,
                currency: "usd",
                status: "SUCCESS",
                stripePaymentId: paymentIntentId ?? undefined,
                stripeSubscriptionId: stripeSubId, // ✅ store sub_xxx on renewal too
                stripeSessionId: renewalSessionId,
                stripeCustomerId: customerId,
                ...cardDetails,
              },
            });
            await activateSubscription(
              userId,
              subscriptionId,
              amountPaid,
              plan.duration,
            );

            const inAppAdminId2 = await getAdminId();
            await queuePaymentNotification(
              userId,
              amountPaid,
              plan.title,
              plan.duration,
              renewalPayment.id,
              inAppAdminId2,
            );

            console.log(`🔄 Subscription renewed for ${userId}`);
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────────
        // 3. invoice.finalized — SKIPPED (redundant with invoice.payment_succeeded)
        //    Keeping both would cause double activation. payment_succeeded is
        //    the authoritative event for subscription lifecycle.
        // ──────────────────────────────────────────────────────────────────
        case "invoice.finalized": {
          console.log(
            "⏭ Skipping invoice.finalized — handled by invoice.payment_succeeded",
          );
          break;
        }

        // ──────────────────────────────────────────────────────────────────
        // 4. Invoice Payment Failed
        // ──────────────────────────────────────────────────────────────────
        case "invoice.payment_failed": {
          const invoice = event.data.object as unknown as BasilInvoice;

          const stripeSubId = invoice.subscription;
          if (!stripeSubId) break;

          const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
          const { userId } = stripeSub.metadata;

          if (userId) {
            await prisma.payment.updateMany({
              where: {
                userId,
                status: "PENDING",
                stripeSubscriptionId: stripeSubId, // ✅ fixed: sub_xxx → stripeSubscriptionId
              },
              data: { status: "FAILED" },
            });
            console.log(`❌ Payment failed for user: ${userId}`);
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────────
        // 5. Subscription Deleted
        // ──────────────────────────────────────────────────────────────────
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const { userId } = sub.metadata;
          if (userId) {
            console.log(`🚫 Subscription cancelled for user: ${userId}`);
          }
          break;
        }

        default:
          console.log(`⏭ Unhandled event: ${event.type}`);
      }
    });

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("❌ Webhook processing error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── Webhook Handler: Link (Checkout Sessions) ───────────────────────────────

export const stripeWebhookForLink = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sig = req.headers["stripe-signature"] as string;
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err: any) {
    console.error("❌ Webhook signature failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  console.log(`🔔 Link Webhook received: ${event.type}`);

  try {
    await withIdempotency(event.id, async () => {
      switch (event.type) {
        // ──────────────────────────────────────────────────────────────────────
        // 1. Checkout Session Completed
        //    SINGLE source of truth for payment success on checkout.
        //    invoice.payment_succeeded with subscription_create is SKIPPED.
        // ──────────────────────────────────────────────────────────────────────
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const { userId, subscriptionId, isLifeTime } = session.metadata ?? {};

          if (!userId || !subscriptionId) {
            console.error("❌ Missing metadata on checkout session:", session.id);
            break;
          }

          const plan = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
          });
          if (!plan) {
            console.error("❌ Plan not found:", subscriptionId);
            break;
          }

          const customerId = (session.customer as string) ?? undefined;

          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : ((session.payment_intent as any)?.id ?? null);

          const cardDetails = paymentIntentId
            ? await getCardDetails(paymentIntentId)
            : {};

          const amountPaid = (session.amount_total ?? plan.amount * 100) / 100;

          // ── Lifetime (one-time payment) ──────────────────────────────────
          if (isLifeTime === "true") {
            const updateResult = await prisma.payment.updateMany({
              where: { stripeSessionId: session.id, userId },
              data: {
                status: "SUCCESS",
                amount: amountPaid,
                stripePaymentId: paymentIntentId ?? undefined,
                stripeCustomerId: customerId,
                ...cardDetails,
              },
            });

            await activateSubscription(
              userId,
              subscriptionId,
              amountPaid,
              plan.duration,
            );

            const linkAdminId1 = await getAdminId();
            await queuePaymentNotification(
              userId,
              amountPaid,
              plan.title,
              plan.duration,
              session.id,
              linkAdminId1,
            );

            console.log(
              `✅ Lifetime activated for ${userId}. Rows updated: ${updateResult.count}`,
            );
            break;
          }

          // ── Recurring subscription (first payment) ───────────────────────
          const stripeSubId =
            typeof session.subscription === "string"
              ? session.subscription
              : ((session.subscription as any)?.id ?? null);

          if (!stripeSubId) {
            console.error("❌ No subscription ID on session:", session.id);
            break;
          }

          const updateResult = await prisma.payment.updateMany({
            where: { stripeSessionId: session.id, userId },
            data: {
              status: "SUCCESS",
              stripeSessionId: session.id,
              stripeSubscriptionId: stripeSubId,
              stripeCustomerId: customerId,
              amount: amountPaid,
              stripePaymentId: paymentIntentId ?? undefined,
              ...cardDetails,
            },
          });

          await activateSubscription(
            userId,
            subscriptionId,
            amountPaid,
            plan.duration,
          );

          const linkAdminId2 = await getAdminId();
          await queuePaymentNotification(
            userId,
            amountPaid,
            plan.title,
            plan.duration,
            session.id,
            linkAdminId2,
          );

          console.log(
            `✅ Subscription activated for ${userId}. Session → Sub: ${session.id} → ${stripeSubId}. Rows: ${updateResult.count}`,
          );
          break;
        }

        // ──────────────────────────────────────────────────────────────────────
        // 2. Checkout Session Expired (user closed without paying)
        // ──────────────────────────────────────────────────────────────────────
        case "checkout.session.expired": {
          const session = event.data.object as Stripe.Checkout.Session;
          const { userId } = session.metadata ?? {};

          if (userId) {
            await prisma.payment.updateMany({
              where: { stripeSessionId: session.id, userId, status: "PENDING" },
              data: { status: "FAILED" },
            });
            console.log(`⏰ Checkout session expired for user: ${userId}`);
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────────────
        // 3. Invoice Payment Succeeded
        //    SKIP subscription_create — already handled by checkout.session.completed.
        //    ONLY handle subscription_cycle (renewals).
        // ──────────────────────────────────────────────────────────────────────
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as unknown as BasilInvoice;

          if (invoice.billing_reason === "subscription_create") {
            console.log(
              "⏭ Skipping subscription_create invoice — already handled by checkout.session.completed",
            );
            break;
          }

          if (invoice.billing_reason !== "subscription_cycle") {
            console.log(
              `⏭ Skipping invoice billing_reason: ${invoice.billing_reason}`,
            );
            break;
          }

          const stripeSubId = invoice.subscription;
          if (!stripeSubId) break;

          const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
          const { userId, subscriptionId } = stripeSub.metadata;

          if (!userId || !subscriptionId) {
            console.error("❌ Missing metadata on subscription:", stripeSubId);
            break;
          }

          const plan = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
          });
          if (!plan) break;

          const paymentIntentId = extractPaymentIntentId(invoice);
          const cardDetails = paymentIntentId
            ? await getCardDetails(paymentIntentId)
            : {};
          const amountPaid = (invoice.amount_paid ?? 0) / 100;
          const customerId = invoice.customer ?? undefined;

          const renewalSessionId = `renewal_${stripeSubId}_${Date.now()}`;
          const renewalPayment = await prisma.payment.create({
            data: {
              userId,
              subscriptionId,
              amount: amountPaid,
              currency: "usd",
              status: "SUCCESS",
              stripePaymentId: paymentIntentId ?? undefined,
              stripeSubscriptionId: stripeSubId,
              stripeSessionId: renewalSessionId,
              stripeCustomerId: customerId,
              ...cardDetails,
            },
          });

          await activateSubscription(
            userId,
            subscriptionId,
            amountPaid,
            plan.duration,
          );

          const linkAdminId3 = await getAdminId();
          await queuePaymentNotification(
            userId,
            amountPaid,
            plan.title,
            plan.duration,
            renewalPayment.id,
            linkAdminId3,
          );

          console.log(`🔄 Subscription renewed for ${userId}`);
          break;
        }

        // ──────────────────────────────────────────────────────────────────────
        // 4. Invoice Payment Failed
        // ──────────────────────────────────────────────────────────────────────
        case "invoice.payment_failed": {
          const invoice = event.data.object as unknown as BasilInvoice;

          const stripeSubId = invoice.subscription;
          if (!stripeSubId) break;

          const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
          const { userId } = stripeSub.metadata;

          if (userId) {
            await prisma.payment.updateMany({
              where: {
                userId,
                status: "PENDING",
                stripeSubscriptionId: stripeSubId, // ✅ fixed: sub_xxx → stripeSubscriptionId
              },
              data: { status: "FAILED" },
            });
            console.log(`❌ Invoice payment failed for user: ${userId}`);
          }
          break;
        }

        // ──────────────────────────────────────────────────────────────────────
        // 5. Subscription Cancelled
        // ──────────────────────────────────────────────────────────────────────
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const { userId } = sub.metadata;

          if (userId) {
            console.log(`🚫 Subscription cancelled for user: ${userId}`);
          }
          break;
        }

        default:
          console.log(`⏭ Unhandled event: ${event.type}`);
      }
    });

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("❌ Webhook processing error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};