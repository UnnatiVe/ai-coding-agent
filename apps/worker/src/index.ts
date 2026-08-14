import { Worker } from "bullmq";
import { prisma } from "@aca/db";
import { TASK_QUEUE } from "@aca/shared";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { createProcessor } from "./processor.js";
import { createRedisConnection } from "./queue.js";

// Separate connections: BullMQ blocks on its own, publishing must not wait.
const connection = createRedisConnection();
const publisher = createRedisConnection();

const worker = new Worker(TASK_QUEUE, createProcessor(publisher), {
  connection,
  concurrency: env.WORKER_CONCURRENCY,
});

worker.on("ready", () => logger.info(`worker ready, listening on queue "${TASK_QUEUE}"`));
worker.on("completed", (job) => logger.info({ jobId: job.id, name: job.name }, "job completed"));
worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
worker.on("error", (err) => logger.error({ err }, "worker error"));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, draining worker`);
    void worker
      .close()
      .then(() => Promise.allSettled([connection.quit(), publisher.quit(), prisma.$disconnect()]))
      .then(() => process.exit(0));
  });
}
