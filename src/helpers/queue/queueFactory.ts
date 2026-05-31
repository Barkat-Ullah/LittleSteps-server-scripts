import { Queue, QueueOptions } from "bullmq";
import { bullMQRedisOptions } from "../../lib/redisConnection";

export const createQueue = (name: string, options?: QueueOptions) => {
  return new Queue(name, {
    connection: bullMQRedisOptions,
    defaultJobOptions: {
      attempts: 3, // 3 attempts
      backoff: { type: "exponential", delay: 1000 }, // 1s, 2s, 4s - exponential backoff
      removeOnComplete: 50, // keep last 50 completed jobs
      removeOnFail: 25, // keep last 25 failed jobs
    },
    ...options,
  });
};

export const subscriptionQueue = new Queue("subscription-processing", {
  connection: bullMQRedisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
