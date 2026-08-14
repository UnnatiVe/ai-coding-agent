import { Queue } from "bullmq";
import {
  defaultJobOptions,
  JOB_PING,
  JOB_RUN_TASK,
  TASK_QUEUE,
  type PingJob,
  type RunTaskJob,
} from "@aca/shared";
import { queueConnection } from "./connection.js";

export const taskQueue = new Queue(TASK_QUEUE, {
  connection: queueConnection,
  defaultJobOptions,
});

/**
 * Job id is derived from the task so re-submitting the same task is a no-op.
 * BullMQ forbids `:` in custom ids because it delimits its Redis key namespace.
 */
export async function enqueueTask(payload: RunTaskJob): Promise<string> {
  const jobId = `task-${payload.taskId}`;
  const job = await taskQueue.add(JOB_RUN_TASK, payload, { jobId });
  return job.id ?? jobId;
}

export async function enqueuePing(message = "ping"): Promise<string> {
  const payload: PingJob = { message, sentAt: new Date().toISOString() };
  const job = await taskQueue.add(JOB_PING, payload, { attempts: 1 });
  return job.id ?? "";
}

export async function closeQueue(): Promise<void> {
  await taskQueue.close();
  await queueConnection.quit();
}
