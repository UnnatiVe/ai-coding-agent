import { prisma } from "@aca/db";
import type { TaskEventPayload } from "@aca/shared";
import type { Redis } from "ioredis";

import { env } from "../env.js";
import { emitTaskEvent } from "../events.js";
import { logger } from "../logger.js";
import { createGitService } from "../git/service.js";
import { createPullRequest } from "../git/pr.js";
import { createWorkspaceTools } from "../workspace/tools.js";
import { createTaskWorkspace } from "../workspace/workspace.js";
import { executeCommand } from "../workspace/command-executor.js";

import { OllamaAgentProvider } from "./providers/ollama.js";
import { StubAgentProvider } from "./providers/stub.js";
import { AgentRunner } from "./runner.js";
import { verifyTaskResult } from "./verifier.js";

import type {
  AgentProvider,
  AgentRunContext,
} from "./types.js";

function createDefaultProvider(): AgentProvider {
  if (env.AGENT_PROVIDER === "ollama") {
    return new OllamaAgentProvider({
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_MODEL,
    });
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
    logger.warn(
      { taskId },
      "task not found, dropping agent loop",
    );
    return;
  }

  const emit = async (payload: TaskEventPayload) => {
    await emitTaskEvent(publisher, taskId, payload);
  };

  const workspace = await createTaskWorkspace(taskId);
  const tools = createWorkspaceTools(workspace);
  const git = createGitService(workspace);

  const runContext: AgentRunContext = {
    taskId,
    attempt,
    repoFullName: task.repository.fullName,
    prompt: task.prompt,
    baseBranch: task.baseBranch,
    workspace,
    tools,
    git,
    emit,
  };

  const agentRun = await prisma.agentRun.upsert({
    where: {
      taskId_attempt: {
        taskId,
        attempt,
      },
    },
    update: {
      status: "running",
      error: null,
      finishedAt: null,
    },
    create: {
      taskId,
      attempt,
      status: "running",
    },
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

    await emit({
      type: "task.status",
      status: "running",
    });

    await emit({
      type: "log",
      level: "info",
      message: `agent loop started for ${task.repository.fullName}`,
    });

    // Clone the actual GitHub repository into the task workspace.
    const remoteUrl = `https://github.com/${task.repository.fullName}.git`;

    await git.clone(
      remoteUrl,
      task.baseBranch,
    );

    await emit({
      type: "log",
      level: "info",
      message: `cloned ${task.repository.fullName} branch ${task.baseBranch}`,
    });

    // Install repository dependencies.
    await emit({
      type: "log",
      level: "info",
      message: "installing repository dependencies",
    });

    const installResult = await executeCommand(
      workspace,
      "install",
    );

    if (!installResult.ok) {
      await emit({
        type: "log",
        level: "error",
        message: [
          "Failed to install repository dependencies",
          installResult.stdout,
          installResult.stderr,
        ]
          .filter(Boolean)
          .join("\n"),
      });

      throw new Error(
        [
          "Failed to install repository dependencies",
          installResult.stdout,
          installResult.stderr,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    await emit({
      type: "log",
      level: "info",
      message: "repository dependencies installed",
    });

    // Generate Prisma client.
    await emit({
      type: "log",
      level: "info",
      message: "generating Prisma client",
    });

    const generateResult = await executeCommand(
      workspace,
      "generate",
    );

    if (!generateResult.ok) {
      await emit({
        type: "log",
        level: "error",
        message: [
          "Failed to generate Prisma client",
          generateResult.stdout,
          generateResult.stderr,
        ]
          .filter(Boolean)
          .join("\n"),
      });

      throw new Error(
        [
          "Failed to generate Prisma client",
          generateResult.stdout,
          generateResult.stderr,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    await emit({
      type: "log",
      level: "info",
      message: "Prisma client generated",
    });

    // Create an isolated branch for this task.
    const branchName = `task/${taskId}`;

    await git.createBranch(branchName);

    await prisma.task.update({
      where: { id: taskId },
      data: {
        branchName,
      },
    });

    await emit({
      type: "log",
      level: "info",
      message: `created Git branch ${branchName}`,
    });

    // Run the autonomous agent.
    const runner = new AgentRunner(provider);
    const result = await runner.run(runContext);

    // Commit, push and create PR if the agent succeeded.
   if (result.status === "succeeded") {
  let verification = await verifyTaskResult(runContext);
  let repairAttempts = 0;
  const maxRepairAttempts = 2;

  await emit({
    type: "log",
    level: verification.ok ? "info" : "error",
    message: verification.summary,
  });

  while (!verification.ok && repairAttempts < maxRepairAttempts) {
    repairAttempts += 1;

    await emit({
      type: "log",
      level: "info",
      message:
        `Deterministic verification failed. Starting repair attempt ` +
        `${repairAttempts}/${maxRepairAttempts}.`,
    });

    const repairResult = await provider.repair(
      runContext,
      verification.summary,
    );

    await emit({
      type: "log",
      level: repairResult.ok ? "info" : "error",
      message: repairResult.ok
        ? `Repair attempt ${repairAttempts} completed: ${repairResult.summary}`
        : `Repair attempt ${repairAttempts} failed: ${repairResult.summary}`,
    });

    if (!repairResult.ok) {
      throw new Error(repairResult.summary);
    }

    verification = await verifyTaskResult(runContext);

    await emit({
      type: "log",
      level: verification.ok ? "info" : "error",
      message: verification.summary,
    });
  }

  if (!verification.ok) {
    throw new Error(
      `Task failed after ${maxRepairAttempts} repair attempts: ` +
        verification.summary,
    );
  }
      const diff = await git.diff();

      await emit({
        type: "log",
        level: "info",
        message: diff
          ? `Git changes detected:\n${diff}`
          : "No Git changes detected",
      });

      const status = await git.status();

      if (!status.isClean) {
        const commitMessage = `feat: complete task ${taskId}`;

        const commitOutput = await git.commit(
          commitMessage,
        );

        await emit({
          type: "log",
          level: "info",
          message: `Git commit created: ${commitOutput}`,
        });

        const pushOutput = await git.push(
          branchName,
        );

        await emit({
          type: "log",
          level: "info",
          message: `Git branch pushed: ${pushOutput}`,
        });

        const prUrl = await createPullRequest({
          repoFullName: task.repository.fullName,
          baseBranch: task.baseBranch,
          headBranch: branchName,
          title: `feat: complete task ${taskId}`,
          body: [
            "## Summary",
            "",
            task.prompt,
            "",
            "Created automatically by Forge.",
          ].join("\n"),
        });

        await prisma.task.update({
          where: { id: taskId },
          data: {
            prUrl,
          },
        });

        await emit({
          type: "log",
          level: "info",
          message: `GitHub Pull Request created: ${prUrl}`,
        });
      }
    }

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status:
          result.status === "succeeded"
            ? "succeeded"
            : "failed",
        finishedAt: new Date(),
        error:
          result.status === "failed"
            ? result.summary
            : null,
      },
    });

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: result.status,
        error:
          result.status === "failed"
            ? result.summary
            : null,
        finishedAt: new Date(),
      },
    });

    await emit({
      type: "log",
      level:
        result.status === "succeeded"
          ? "info"
          : "error",
      message: result.summary,
    });

    await emit({
      type: "task.status",
      status: result.status,
    });

    logger.info(
      { taskId, attempt },
      "agent loop completed",
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "agent loop failed";

    await prisma.agentRun.upsert({
      where: {
        taskId_attempt: {
          taskId,
          attempt,
        },
      },
      update: {
        status: "failed",
        error: message,
        finishedAt: new Date(),
      },
      create: {
        taskId,
        attempt,
        status: "failed",
        error: message,
        finishedAt: new Date(),
      },
    });

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: message,
        finishedAt: new Date(),
      },
    });

    await emit({
      type: "log",
      level: "error",
      message,
    });

    await emit({
      type: "task.status",
      status: "failed",
    });

    logger.error(
      { taskId, attempt, err: error },
      "agent loop failed",
    );

    throw error;
  }
}
