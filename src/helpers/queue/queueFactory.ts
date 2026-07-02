import { Queue, QueueOptions } from "bullmq";
import { bullMQRedisOptions } from "../../lib/redisConnection";

const queueDefaults: Record<
  string,
  Partial<QueueOptions> & {
    defaultJobOptions?: QueueOptions["defaultJobOptions"];
  }
> = {
  "otp-queue": {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 25,
      removeOnFail: 25,
    },
  },
  "mail-queue": {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: 25,
      removeOnFail: 25,
    },
  },
  "subscription-processing": {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  },
};

export const createQueue = (name: string, options?: QueueOptions) => {
  const defaults = queueDefaults[name] ?? {};

  return new Queue(name, {
    connection: bullMQRedisOptions,
    defaultJobOptions: defaults.defaultJobOptions,
    ...defaults,
    ...options,
  });
};

export const subscriptionQueue = createQueue("subscription-processing");
