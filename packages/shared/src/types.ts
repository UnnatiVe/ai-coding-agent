import { z } from "zod";

/** Lifecycle of a single agent run. */
export const runStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export type RunStatus = z.infer<typeof runStatusSchema>;

/** Payload accepted by `POST /api/runs`. */
export const createRunRequestSchema = z.object({
  repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo"),
  task: z.string().min(10).max(4000),
  baseBranch: z.string().min(1).max(255).default("main"),
});
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export interface RunSummary {
  id: string;
  repoFullName: string;
  task: string;
  baseBranch: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
}

/** Name of the BullMQ queue shared by the API (producer) and worker (consumer). */
export const RUN_QUEUE = "agent-runs";

/** Redis pub/sub channel carrying `RunEvent`s for a given run. */
export const runChannel = (runId: string): string => `run:${runId}`;

export interface RunJobData {
  runId: string;
}
