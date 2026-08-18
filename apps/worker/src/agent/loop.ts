import { prisma } from "@aca/db";
import type { TaskEventPayload } from "@aca/shared";
import type { Redis } from "ioredis";
import { env } from "../env.js";
import { emitTaskEvent } from "../events.js";
import { logger } from "../logger.js";
import { OllamaAgentProvider } from "./providers/ollama.js";
import { StubAgentProvider } from "./providers/stub.js";
import { AgentRunner } from "./runner.js";
import type { AgentProvider, AgentRunContext } from "./types.js";

function createDefaultProvider(): AgentProvider {
  if (env.AGENT_PROVIDER === "ollama") {
    return new OllamaAgentProvider({ baseUrl: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL });
  }

  return new StubAgentProvider();
}

export async function runAgentLoop(
  publisher: Redis,
  taskId: string,
  attempt: number,
  provider: AgentProvider = createDefaultProvider(),
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { repository: true },
  });

  if (!task) {
    logger.warn({ taskId }, "task not found, dropping agent loop");
    return;
  }

  const emit = async (payload: TaskEventPayload) => {
    await emitTaskEvent(publisher, taskId, payload);
  };

  const runContext: AgentRunContext = {
    taskId,
    attempt,
    repoFullName: task.repository.fullName,
    prompt: task.prompt,
    baseBranch: task.baseBranch,
    emit,
  };

  const agentRun = await prisma.agentRun.upsert({
    where: { taskId_attempt: { taskId, attempt } },
    update: { status: "running", error: null, finishedAt: null },
    create: { taskId, attempt, status: "running" },
  });

  try {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "running",
        startedAt: task.startedAt ?? new Date(),
        error: null,
      },
    });
    await emit({ type: "task.status", status: "running" });
    await emit({
      type: "log",
      level: "info",
      message: `agent loop started for ${task.repository.fullName}`,
    });

    const runner = new AgentRunner(provider);
    const result = await runner.run(runContext);

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: result.status === "succeeded" ? "succeeded" : "failed",
        finishedAt: new Date(),
        error: result.status === "failed" ? result.summary : null,
      },
    });

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: result.status,
        error: result.status === "failed" ? result.summary : null,
        finishedAt: new Date(),
      },
    });

    await emit({
      type: "log",
      level: result.status === "succeeded" ? "info" : "error",
      message: result.summary,
    });
    await emit({ type: "task.status", status: result.status });

    logger.info({ taskId, attempt }, "agent loop completed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent loop failed";

    await prisma.agentRun.upsert({
      where: { taskId_attempt: { taskId, attempt } },
      update: { status: "failed", error: message, finishedAt: new Date() },
      create: { taskId, attempt, status: "failed", error: message, finishedAt: new Date() },
    });
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "failed", error: message, finishedAt: new Date() },
    });
    await emit({ type: "log", level: "error", message });
    await emit({ type: "task.status", status: "failed" });

    logger.error({ taskId, attempt, err: error }, "agent loop failed");
    throw error;
  }
}
