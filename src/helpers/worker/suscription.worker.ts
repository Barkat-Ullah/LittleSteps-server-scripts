import { Worker, Job } from "bullmq";
import { NotifyType, userRole } from "@prisma/client";
import { stripe } from "../../lib/stripe";
import prisma from "../../shared/prisma";
import { createNotification } from "../../utils/notify";
import { bullMQRedisOptions } from "../../lib/redisConnection";

export const subscriptionWorker = new Worker(
  "subscription-processing",
  async (job: Job) => {
    console.log(
      `[Queue Worker] Running task: ${job.name} for Job ID: ${job.id}`,
    );

    switch (job.name) {
      case "process-in-app-purchase": {
        const {
          userId,
          subscriptionId,
          paymentMethodId,
          stripeCustomerId,
          plan,
        } = job.data;

        if (paymentMethodId) {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: stripeCustomerId,
          });
          await stripe.customers.update(stripeCustomerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
          });
        }

        if (plan.isLifeTime) {
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
            metadata: { userId, subscriptionId: plan.id, isLifeTime: "true" },
          });

          await prisma.payment.create({
            data: {
              userId,
              subscriptionId: plan.id,
              amount: plan.amount,
              currency: "usd",
              status: "PENDING",
              stripePaymentId: paymentIntent.id,
              stripeCustomerId,
            },
          });
        } else {
          const stripeSubscription = await stripe.subscriptions.create({
            customer: stripeCustomerId,
            items: [{ price: plan.stripePriceId }],
            default_payment_method: paymentMethodId,
            payment_behavior: "default_incomplete",
            metadata: { userId, subscriptionId: plan.id, isLifeTime: "false" },
          });

          await prisma.payment.create({
            data: {
              userId,
              subscriptionId: plan.id,
              amount: plan.amount,
              currency: "usd",
              status: "PENDING",
              stripeSessionId: stripeSubscription.id,
              stripeCustomerId,
            },
          });
        }
        break;
      }

      case "generate-checkout-link": {
        const { userId, subscriptionId, stripeCustomerId, plan } = job.data;
        const successUrl = `https://h2supplements-backend.vercel.app/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `https://h2supplements-backend.vercel.app/cancel`;

        let session;
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
            line_items: [{ price: plan.stripePriceId, quantity: 1 }],
            subscription_data: {
              metadata: {
                userId,
                subscriptionId: plan.id,
                isLifeTime: "false",
              },
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

        // ফ্রন্টএন্ডে বা ট্র্যাকিং ডেটায় সেশন ইউআরএল পুশ করার জন্য জবের প্রগ্রেস বা রিটার্ন ডেটা সেট করা যেতে পারে।
        await job.updateProgress({ url: session.url });
        break;
      }

      case "send-subscription-notifications": {
        const {
          userId,
          amount,
          planTitle,
          planDuration,
          paymentId,
          userFullName,
        } = job.data;

        const admin = await prisma.user.findFirst({
          where: { role: userRole.ADMIN },
          select: { id: true },
        });

        const planLabel = `${planTitle} (${planDuration})`;

        // ইউজারকে পুশ নোটিফিকেশন/ইন-অ্যাপ নোটিফিকেশন পাঠানো
        await createNotification({
          receiverId: userId,
          senderId: admin?.id ?? null,
          title: "Payment Successful 🎉",
          body: `Your ${planLabel} subscription has been activated. Amount charged: $${amount}.`,
          referenceId: paymentId,
          type: NotifyType.Payment,
        });

        // অ্যাডমিনকে নোটিফাই করা
        if (admin) {
          await createNotification({
            receiverId: admin.id,
            senderId: userId,
            title: "New Subscription Payment",
            body: `${userFullName} has subscribed to ${planLabel} for $${amount}.`,
            referenceId: paymentId,
            type: NotifyType.Payment,
          });
        }
        break;
      }
    }
  },
  {
    connection: bullMQRedisOptions,
    concurrency: 10, // ⚡ থ্রোটল কন্ট্রোল: একসাথে সর্বোচ্চ ১০টি স্ট্রাইপ রিকোয়েস্ট প্যারালালি প্রসেস হবে।
  },
);
