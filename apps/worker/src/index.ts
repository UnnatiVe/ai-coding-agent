import { Worker } from "bullmq";
import { RUN_QUEUE, type RunJobData } from "@aca/shared";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { createRedisConnection } from "./queue.js";
import { processRun } from "./processor.js";

const connection = createRedisConnection();

const worker = new Worker<RunJobData>(RUN_QUEUE, processRun, {
  connection,
  concurrency: env.WORKER_CONCURRENCY,
});

worker.on("ready", () => logger.info(`worker ready, listening on queue "${RUN_QUEUE}"`));
worker.on("completed", (job) => logger.info({ jobId: job.id }, "job completed"));
worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));
worker.on("error", (err) => logger.error({ err }, "worker error"));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    logger.info(`${signal} received, draining worker`);
    await worker.close();
    await connection.quit();
    process.exit(0);
  });
}
