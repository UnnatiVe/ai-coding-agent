import { z } from "zod";

/**
 * A single BullMQ queue carries every kind of background job; the job *name*
 * selects the handler. One queue keeps ordering, metrics and concurrency
 * limits in one place, which is what we want while the worker is a single
 * process.
 */
export const TASK_QUEUE = "agent-tasks";

export const JOB_RUN_TASK = "task.run";
export const JOB_PING = "test.ping";

export const runTaskJobSchema = z.object({ taskId: z.string().min(1) });
export type RunTaskJob = z.infer<typeof runTaskJobSchema>;

/** Minimal end-to-end smoke job: proves producer -> Redis -> worker works. */
export const pingJobSchema = z.object({
  message: z.string().default("ping"),
  sentAt: z.string(),
});
export type PingJob = z.infer<typeof pingJobSchema>;

export type JobPayloadMap = {
  [JOB_RUN_TASK]: RunTaskJob;
  [JOB_PING]: PingJob;
};

export type JobName = keyof JobPayloadMap;
export type JobPayload = JobPayloadMap[JobName];

/** Redis pub/sub channel carrying `TaskEvent`s for one task (consumed by SSE in Phase 3). */
export const taskChannel = (taskId: string): string => `task:${taskId}`;

/**
 * Shared retry policy. Agent work is expensive and side-effecting, so a failed
 * task is retried at most once, with a delay, rather than hammering the LLM.
 */
export const defaultJobOptions = {
  attempts: 2,
  backoff: { type: "exponential" as const, delay: 10_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};
