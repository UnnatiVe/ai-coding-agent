import { prisma } from "@aca/db";
import { runTaskJobSchema } from "@aca/shared";
import type { Redis } from "ioredis";
import { runAgentLoop } from "../agent/loop.js";
import { logger } from "../logger.js";

/**
 * Thin worker/job boundary: the queue decides which job runs, and the agent loop
 * owns the deterministic steps and task-state transitions.
 */
export async function handleRunTask(publisher: Redis, raw: unknown, attempt: number) {
  const { taskId } = runTaskJobSchema.parse(raw);

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    logger.warn({ taskId }, "task not found, dropping job");
    return;
  }

  await runAgentLoop(publisher, taskId, attempt);
}
