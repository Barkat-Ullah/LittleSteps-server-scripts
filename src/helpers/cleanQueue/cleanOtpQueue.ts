import { Queue } from "bullmq";

export const cleanQueue = async (queue: Queue) => {
  try {
    // Clean up jobs older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    await Promise.all([
      queue.clean(oneHourAgo, 100, "completed"),
      queue.clean(oneHourAgo, 100, "failed"),
      queue.clean(oneHourAgo, 100, "delayed"),
    ]);

    console.log("🧹 OTP queue cleaned successfully");
  } catch (error) {
    console.error("❌ Failed to clean OTP queue:", error);
  }
};
