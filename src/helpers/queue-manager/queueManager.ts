import { redis } from "../../lib/redisConnection";
import { cleanQueue } from "../cleanQueue/cleanOtpQueue";
import { mailQueue, otpQueue } from "../queue"; 
import { emailWorker } from "../worker/emailWorker";
import { otpWorker } from "../worker/otpWorker";

let cleanerInterval: NodeJS.Timeout | null = null;

export const initializeQueueSystem = () => {

  if (cleanerInterval) clearInterval(cleanerInterval);

  (async function startOtpCleaner() {
    try {
      await cleanQueue(otpQueue);
      console.log("✅ queue cleaned (startup)");
    } catch (err) {
      console.error("❌ queue cleaner (startup) failed:", err);
    }

    const HOUR = 60 * 60 * 1000;
    cleanerInterval = setInterval(async () => {
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


export const setupGracefulShutdown = () => {
  const shutdown = async (signal: any) => {
    console.log(`🚨 Received ${signal}. Shutting down gracefully...`);

    if (cleanerInterval) clearInterval(cleanerInterval);

    try {

      await Promise.all([
        otpQueue.close(),
        mailQueue.close(),
        // notificationQueue.close(),
      ]);
      console.log("✅ All queues closed successfully.");
      
      await redis.quit();
      console.log("✅ Redis connection closed gracefully.");
      
    } catch (err: any) {
      console.error(`❌ Error during graceful shutdown: ${err.message}`);
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};