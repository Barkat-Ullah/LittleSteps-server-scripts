import { Job, WorkerOptions, Worker } from "bullmq";
import { bullMQRedisOptions } from "../../lib/redisConnection";

const workerDefaults: Record<string, Partial<WorkerOptions>> = {
  "otp-queue": {
    concurrency: 8,
    limiter: {
      max: 20,
      duration: 1000,
    },
  },
  "mail-queue": {
    concurrency: 3,
    limiter: {
      max: 6,
      duration: 1000,
    },
  },
  "subscription-processing": {
    concurrency: 4,
  },
};

export const createWorker = (
  name: string,
  processor: (job: Job) => Promise<any>,
  options?: WorkerOptions,
) => {
  const defaults = workerDefaults[name] ?? {};

  const worker = new Worker(name, processor, {
    connection: bullMQRedisOptions,
    ...defaults,
    ...options,
  });

  // Worker event handling
  worker.on("completed", (job) => {
    console.log(`✅ ${name} job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ ${name} job ${job?.id} failed:`, err);
  });

  worker.on("stalled", (jobId) => {
    console.warn(`⚠️ ${name} job ${jobId} stalled`);
  });

  return worker;
};
