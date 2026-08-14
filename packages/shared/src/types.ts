import { z } from "zod";

/** Anything that survives a round trip through a Postgres `Json` column. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

/** Lifecycle of a task, mirrors the `TaskStatus` enum in the Prisma schema. */
export const taskStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** Lifecycle of a single agent attempt, mirrors Prisma's `AgentRunStatus`. */
export const agentRunStatusSchema = z.enum(["running", "succeeded", "failed", "aborted"]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const repoFullNameSchema = z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo");

/** Payload accepted by `POST /api/tasks`. */
export const createTaskRequestSchema = z.object({
  repoFullName: repoFullNameSchema,
  prompt: z.string().min(10).max(4000),
  baseBranch: z.string().min(1).max(255).default("main"),
});
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

export interface TaskSummary {
  id: string;
  repoFullName: string;
  prompt: string;
  baseBranch: string;
  status: TaskStatus;
  branchName: string | null;
  prUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}
