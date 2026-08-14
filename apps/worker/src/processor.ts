import type { Job } from "bullmq";
import { JOB_PING, JOB_RUN_TASK } from "@aca/shared";
import type { Redis } from "ioredis";
import { handlePing } from "./jobs/ping.js";
import { handleRunTask } from "./jobs/runTask.js";
import { logger } from "./logger.js";

/** Routes a job to its handler by job name. */
export function createProcessor(publisher: Redis) {
  return async function processJob(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_RUN_TASK:
        return handleRunTask(publisher, job.data, job.attemptsMade + 1);
      case JOB_PING:
        return handlePing(job.data);
      default:
        // Unknown names are dropped rather than retried forever.
        logger.warn({ jobName: job.name, jobId: job.id }, "unknown job name, ignoring");
    }
  };
}
