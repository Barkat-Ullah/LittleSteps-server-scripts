import { Worker, Job } from "bullmq";
import { NotifyType, userRole } from "@prisma/client";
import prisma from "../../shared/prisma";
import { createNotification } from "../../utils/notify";
import redis, { bullMQRedisOptions } from "../../lib/redisConnection";

// src/utils/getAdminId.ts

const ADMIN_ID_CACHE_KEY = "system:adminId";
const ADMIN_ID_TTL = 60 * 60 * 6; // 6 ঘণ্টা

export async function getAdminId(): Promise<string | null> {
  // ✅ Cache check
  const cached = await redis.get(ADMIN_ID_CACHE_KEY);
  if (cached) return cached;

  // Cache miss — DB থেকে আনো
  const admin = await prisma.user.findFirst({
    where: { role: userRole.ADMIN },
    select: { id: true },
  });

  if (!admin) return null;

  await redis.set(ADMIN_ID_CACHE_KEY, admin.id, "EX", ADMIN_ID_TTL);

  return admin.id;
}

export const subscriptionWorker = new Worker(
  "subscription-processing",
  async (job: Job) => {
    console.log(
      `[Queue Worker] Running task: ${job.name} for Job ID: ${job.id}`,
    );

    switch (job.name) {
      case "send-subscription-notifications": {
        const {
          userId,
          amount,
          planTitle,
          planDuration,
          paymentId,
          userFullName,
        } = job.data;

        const adminId = await getAdminId();

        const planLabel = `${planTitle} (${planDuration})`;

        await createNotification({
          receiverId: userId,
          senderId: adminId,
          title: "Payment Successful 🎉",
          body: `Your ${planLabel} subscription has been activated. Amount charged: $${amount}.`,
          referenceId: paymentId,
          type: NotifyType.Payment,
        });

        if (adminId) {
          await createNotification({
            receiverId: adminId,
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
    concurrency: 10,
  },
);
