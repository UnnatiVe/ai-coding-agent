import { prisma } from "@aca/db";
import { runTaskJobSchema } from "@aca/shared";
import type { Redis } from "ioredis";
import { emitTaskEvent } from "../events.js";
import { logger } from "../logger.js";

/**
 * Phase 2 skeleton of the real pipeline. It owns the task lifecycle
 * (queued -> running -> terminal) and records an `AgentRun` attempt, but the
 * body that will clone the repo, start the sandbox and drive the LLM loop is
 * not implemented yet, so every task ends as `failed` with `not_implemented`.
 */
export async function handleRunTask(publisher: Redis, raw: unknown, attempt: number) {
  const { taskId } = runTaskJobSchema.parse(raw);

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    logger.warn({ taskId }, "task not found, dropping job");
    return;
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "running", startedAt: task.startedAt ?? new Date() },
  });
  await emitTaskEvent(publisher, taskId, { type: "task.status", status: "running" });

  const agentRun = await prisma.agentRun.upsert({
    where: { taskId_attempt: { taskId, attempt } },
    update: { status: "running", error: null, finishedAt: null },
    create: { taskId, attempt, status: "running" },
  });

  const message = "agent loop not implemented yet (Phase 7)";
  await emitTaskEvent(publisher, taskId, { type: "log", level: "warn", message });

  await prisma.agentRun.update({
    where: { id: agentRun.id },
    data: { status: "failed", error: message, finishedAt: new Date() },
  });
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "failed", error: message, finishedAt: new Date() },
  });
  await emitTaskEvent(publisher, taskId, { type: "task.status", status: "failed" });

  logger.info({ taskId, attempt }, "task processed (no-op pipeline)");
}
