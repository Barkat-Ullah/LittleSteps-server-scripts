import { Job, WorkerOptions, Worker } from "bullmq";
import { bullMQRedisOptions } from "../../lib/redisConnection";

export const createWorker = (
  name: string,
  processor: (job: Job) => Promise<any>,
  options?: WorkerOptions,
) => {
  const worker = new Worker(name, processor, {
    connection: bullMQRedisOptions,
    concurrency: 5, // process up to 5 OTPs concurrently
    limiter: {
      max: 10, // max 10 per second
      duration: 1000,
    },
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
