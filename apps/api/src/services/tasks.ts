import { prisma, type Prisma } from "@aca/db";
import type { CreateTaskRequest, TaskSummary } from "@aca/shared";
import { enqueueTask } from "../queue/producer.js";

const taskWithRepo = { include: { repository: true } } satisfies Prisma.TaskDefaultArgs;
type TaskWithRepo = Prisma.TaskGetPayload<typeof taskWithRepo>;

export function toTaskSummary(task: TaskWithRepo): TaskSummary {
  return {
    id: task.id,
    repoFullName: task.repository.fullName,
    prompt: task.prompt,
    baseBranch: task.baseBranch,
    status: task.status,
    branchName: task.branchName,
    prUrl: task.prUrl,
    error: task.error,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    startedAt: task.startedAt?.toISOString() ?? null,
    finishedAt: task.finishedAt?.toISOString() ?? null,
  };
}

/**
 * Placeholder identity. Replaced by the GitHub OAuth session user in Phase 5;
 * every task already carries a userId so that swap needs no schema change.
 */
const DEV_USER_LOGIN = "local-dev";

export async function getOrCreateDevUser() {
  return prisma.user.upsert({
    where: { login: DEV_USER_LOGIN },
    update: {},
    create: { login: DEV_USER_LOGIN, name: "Local Developer" },
  });
}

async function getOrCreateRepository(fullName: string, addedById: string) {
  const [owner = "", name = ""] = fullName.split("/");
  return prisma.repository.upsert({
    where: { fullName },
    update: {},
    create: { fullName, owner, name, addedById },
  });
}

export async function createTask(input: CreateTaskRequest): Promise<TaskSummary> {
  const user = await getOrCreateDevUser();
  const repository = await getOrCreateRepository(input.repoFullName, user.id);

  const task = await prisma.task.create({
    data: {
      userId: user.id,
      repositoryId: repository.id,
      prompt: input.prompt,
      baseBranch: input.baseBranch,
    },
    ...taskWithRepo,
  });

  // Enqueue after the row exists, so the worker can never see a missing task.
  try {
    const jobId = await enqueueTask({ taskId: task.id });
    const withJob = await prisma.task.update({
      where: { id: task.id },
      data: { jobId },
      ...taskWithRepo,
    });
    return toTaskSummary(withJob);
  } catch (err) {
    // Without a job nothing will ever pick the task up: fail it now instead of
    // leaving a row stuck in `queued`.
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "failed", error: "could not enqueue task", finishedAt: new Date() },
    });
    throw err;
  }
}

export async function listTasks(limit = 50): Promise<TaskSummary[]> {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    ...taskWithRepo,
  });
  return tasks.map(toTaskSummary);
}

export async function getTask(id: string): Promise<TaskSummary | null> {
  const task = await prisma.task.findUnique({ where: { id }, ...taskWithRepo });
  return task ? toTaskSummary(task) : null;
}
