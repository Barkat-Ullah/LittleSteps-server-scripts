// controllers/webhook.controller.ts
import { DurationType } from "@prisma/client";
import { Request, Response } from "express";
import Stripe from "stripe";
import prisma from "../shared/prisma";
import { stripe } from "./stripe";

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

const activateSubscription = async (
  userId: string,
  subscriptionId: string,
  amount: number,
  duration: DurationType,
) => {
  const startDate = new Date();
  const endDate = calcEndDate(duration);

  await prisma.$transaction([
    prisma.userSubscription.upsert({
      where: { userId_subscriptionId: { userId, subscriptionId } },
      update: { startDate, endDate, amount },
      create: { userId, subscriptionId, amount, startDate, endDate },
    }),
    // prisma.user.update({
    //   where: { id: userId },
    //   data: { plan: PLanType.Paid },
    // }),
  ]);
};

// const deactivateUser = async (userId: string) => {
//   await prisma.user.update({
//     where: { id: userId },
//     data: { plan: PLanType.Free },
//   });
// };

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

// ─── Webhook Handler ──────────────────────────────────────────────────────────

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

  console.log(`🔔 Webhook received: ${event.type}`);

  try {
    switch (event.type) {
      // 1. One-time Payment (Lifetime/Diamond)
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { userId, subscriptionId, isLifeTime } = pi.metadata;

        if (!userId || !subscriptionId || isLifeTime !== "true") break;

        const plan = await prisma.subscription.findUnique({
          where: { id: subscriptionId },
        });
        if (!plan) break;

        const cardDetails = await getCardDetails(pi.id);

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

        console.log(
          `✅ Lifetime activated for ${userId}. DB Rows updated: ${updateResult.count}`,
        );
        break;
      }
      // 2. Subscription Payments (Gold/Platinum)
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

        // basil: no invoice.payment_intent — extract from invoice.payments array
        const paymentIntentId = (() => {
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
        })();

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
          console.log(
            `✅ Subscription activated for ${userId}. Rows: ${updateResult.count}`,
          );
        } else {
          await prisma.payment.create({
            data: {
              userId,
              subscriptionId,
              amount: amountPaid,
              currency: "usd",
              status: "SUCCESS",
              stripePaymentId: paymentIntentId ?? undefined,
              stripeSessionId: `renewal_${stripeSubId}_${Date.now()}`,
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
          console.log(`🔄 Subscription renewed for ${userId}`);
        }
        break;
      }

      // invoice.finalized
      case "invoice.finalized": {
        const invoice = event.data.object as unknown as BasilInvoice;

        const stripeSubId = invoice.subscription;
        if (!stripeSubId) break;

        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
        const { userId, subscriptionId } = stripeSub.metadata;
        if (!userId) break;

        const paymentIntentId = (() => {
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
        })();

        const updateResult = await prisma.payment.updateMany({
          where: { stripeSessionId: stripeSubId, userId },
          data: {
            status: "SUCCESS",
            stripePaymentId: paymentIntentId ?? undefined,
            stripeCustomerId: invoice.customer ?? undefined,
          },
        });
        console.log(`⚡ Finalized update. Rows: ${updateResult.count}`);

        const plan = await prisma.subscription.findUnique({
          where: { id: subscriptionId },
        });
        if (plan) {
          await activateSubscription(
            userId,
            subscriptionId,
            (invoice.amount_due ?? 0) / 100,
            plan.duration,
          );
        }
        break;
      }

      // invoice.payment_failed
      case "invoice.payment_failed": {
        const invoice = event.data.object as unknown as BasilInvoice;

        const stripeSubId = invoice.subscription;
        if (!stripeSubId) break;

        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
        const { userId } = stripeSub.metadata;

        if (userId) {
          await prisma.payment.updateMany({
            where: { stripeSessionId: stripeSubId, userId, status: "PENDING" },
            data: { status: "FAILED" },
          });
          console.log(`❌ Payment failed for user: ${userId}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { userId } = sub.metadata;
        if (userId) {
          //   await deactivateUser(userId);
          console.log(`🚫 Subscription cancelled for user: ${userId}`);
        }
        break;
      }

      default:
        console.log(`⏭ Unhandled event: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("❌ Webhook processing error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
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

// ─── Webhook Handler ──────────────────────────────────────────────────────────

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

  console.log(`🔔 Webhook received: ${event.type}`);

  try {
    switch (event.type) {
      // ──────────────────────────────────────────────────────────────────────
      // 1. Checkout Session Completed
      //    Handles BOTH lifetime (one-time) and subscription (first payment).
      //    This is the SINGLE source of truth for payment success on checkout.
      //    Do NOT rely on invoice.payment_succeeded for subscription_create
      //    because it fires BEFORE this event — causing a race condition.
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

        // Extract payment intent ID if available on session
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

          console.log(
            `✅ Lifetime activated for ${userId}. Rows updated: ${updateResult.count}`,
          );
          break;
        }

        // ── Recurring subscription (first payment) ───────────────────────
        // invoice.payment_succeeded fires BEFORE this event for subscription_create,
        // so we handle everything here and skip it there.
        const stripeSubId =
          typeof session.subscription === "string"
            ? session.subscription
            : ((session.subscription as any)?.id ?? null);

        if (!stripeSubId) {
          console.error("❌ No subscription ID on session:", session.id);
          break;
        }

        // Update PENDING record: mark SUCCESS + swap session ID to sub ID
        const updateResult = await prisma.payment.updateMany({
          where: { stripeSessionId: session.id, userId },
          data: {
            status: "SUCCESS",
            stripeSessionId: session.id, // ✅ cs_xxx ই রাখো, replace করো না
            stripeSubscriptionId: stripeSubId, // ✅ sub_xxx আলাদা field এ রাখো
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

        // ✅ Skip first payment — handled by checkout.session.completed
        if (invoice.billing_reason === "subscription_create") {
          console.log(
            "⏭ Skipping subscription_create invoice — already handled by checkout.session.completed",
          );
          break;
        }

        // Only process renewals
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

        // Renewal — create a fresh payment record
        await prisma.payment.create({
          data: {
            userId,
            subscriptionId,
            amount: amountPaid,
            currency: "usd",
            status: "SUCCESS",
            stripePaymentId: paymentIntentId ?? undefined,
            stripeSessionId: `renewal_${stripeSubId}_${Date.now()}`,
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
              OR: [{ stripeSessionId: stripeSubId }],
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
          //   await deactivateUser(userId);
          console.log(`🚫 Subscription cancelled for user: ${userId}`);
        }
        break;
      }

      default:
        console.log(`⏭ Unhandled event: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("❌ Webhook processing error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
