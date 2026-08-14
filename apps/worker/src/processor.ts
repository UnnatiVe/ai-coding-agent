import type { Job } from "bullmq";
import type { RunJobData } from "@aca/shared";
import { logger } from "./logger.js";

/**
 * Phase 1 placeholder. Phase 2 replaces this with: acquire GitHub installation
 * token -> clone repo -> start sandbox container -> run the agent loop,
 * publishing `RunEvent`s to Redis as it goes.
 */
export async function processRun(job: Job<RunJobData>): Promise<void> {
  logger.info({ runId: job.data.runId }, "received run job (no-op in Phase 1)");
}
