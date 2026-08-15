import { prisma } from "@aca/db";
import { runTaskJobSchema } from "@aca/shared";
import type { Redis } from "ioredis";
import { emitTaskEvent } from "../events.js";
import { logger } from "../logger.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Phase 3 simulated pipeline: the task still has no LLM or sandbox, but it now
 * proceeds through a deterministic lifecycle and emits progress events.
 */
export async function handleRunTask(publisher: Redis, raw: unknown, attempt: number) {
  const { taskId } = runTaskJobSchema.parse(raw);

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    logger.warn({ taskId }, "task not found, dropping job");
    return;
  }

  try {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "running",
        startedAt: task.startedAt ?? new Date(),
      },
    });
    await emitTaskEvent(publisher, taskId, { type: "task.status", status: "running" });
    await emitTaskEvent(publisher, taskId, {
      type: "log",
      level: "info",
      message: "task accepted and started in the simulated workflow",
    });

    const agentRun = await prisma.agentRun.upsert({
      where: { taskId_attempt: { taskId, attempt } },
      update: { status: "running", error: null, finishedAt: null },
      create: { taskId, attempt, status: "running" },
    });

    await wait(600);
    await emitTaskEvent(publisher, taskId, {
      type: "log",
      level: "info",
      message: "simulating repository review and validation steps",
    });

    await wait(600);
    await emitTaskEvent(publisher, taskId, {
      type: "log",
      level: "info",
      message: "simulated task completed successfully",
    });

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "succeeded", finishedAt: new Date() },
    });
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "succeeded",
        error: null,
        finishedAt: new Date(),
      },
    });
    await emitTaskEvent(publisher, taskId, { type: "task.status", status: "succeeded" });

    logger.info({ taskId, attempt }, "task processed successfully (simulated pipeline)");
  } catch (error) {
    const message = error instanceof Error ? error.message : "task processing failed";

    await prisma.agentRun.upsert({
      where: { taskId_attempt: { taskId, attempt } },
      update: { status: "failed", error: message, finishedAt: new Date() },
      create: { taskId, attempt, status: "failed", error: message, finishedAt: new Date() },
    });
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "failed", error: message, finishedAt: new Date() },
    });
    await emitTaskEvent(publisher, taskId, {
      type: "log",
      level: "error",
      message,
    });
    await emitTaskEvent(publisher, taskId, { type: "task.status", status: "failed" });

    logger.error({ taskId, attempt, err: error }, "task processing failed");
    throw error;
  }
}
