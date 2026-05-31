// queueManager.js

import { redis } from "../../lib/redisConnection";
import { cleanQueue } from "../cleanQueue/cleanOtpQueue";
import { mailQueue, otpQueue } from "../queue";
import { emailWorker } from "../worker/emailWorker";
import { otpWorker } from "../worker/otpWorker";

export const initializeQueueSystem = () => {
  (async function startOtpCleaner() {
    try {
      await cleanQueue(otpQueue);
      console.log("✅ queue cleaned (startup)");
    } catch (err) {
      console.error("❌ queue cleaner (startup) failed:", err);
    }

    const HOUR = 60 * 60 * 1000;
    setInterval(async () => {
      try {
        await cleanQueue(otpQueue);
        console.log("✅ queue cleaned (scheduled)");
      } catch (err) {
        console.error("❌ queue cleaner (scheduled) error:", err);
      }
    }, HOUR);
  })();

  return {
    otpWorker,
    emailWorker,
  };
};

// Function to check status of all queues
export const getQueueStatus = async () => {
  try {
    const [otpStats, mailStats] = await Promise.all([
      otpQueue.getJobCounts(),
      mailQueue.getJobCounts(),
    ]);

    return {
      otpQueue: otpStats,
      mailQueue: mailStats,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ Failed to get queue status:", error);
    throw error;
  }
};

// Graceful shutdown handling
export const setupGracefulShutdown = () => {
  const shutdown = async (signal: any) => {
    console.log(`🚨 Received ${signal}. Shutting down gracefully...`);

    // Stop accepting new jobs
    await otpQueue.close();
    await mailQueue.close();
    // await notificationQueue.close();

    // Close Redis connection
    await redis.quit();

    console.log("✅ All queues and connections closed gracefully");
    process.exit(0);
  };

  // Shutdown signal handling
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};
