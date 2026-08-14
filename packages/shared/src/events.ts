import { z } from "zod";
import { jsonValueSchema, taskStatusSchema } from "./types.js";

/**
 * Events streamed from the worker to the browser
 * (worker -> Postgres + Redis pub/sub -> API -> SSE).
 * Phase 2 emits `task.status` and `log`; the rest are declared up front so the
 * agent loop and the frontend timeline are written against one contract.
 */
export const taskEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.status"), status: taskStatusSchema }),
  z.object({
    type: z.literal("log"),
    level: z.enum(["debug", "info", "warn", "error"]),
    message: z.string(),
  }),
  z.object({ type: z.literal("step.start"), stepIndex: z.number().int() }),
  z.object({ type: z.literal("llm.delta"), text: z.string() }),
  z.object({
    type: z.literal("tool.call"),
    id: z.string(),
    name: z.string(),
    args: jsonValueSchema,
  }),
  z.object({ type: z.literal("tool.stdout"), id: z.string(), chunk: z.string() }),
  z.object({
    type: z.literal("tool.result"),
    id: z.string(),
    ok: z.boolean(),
    summary: z.string(),
  }),
  z.object({ type: z.literal("diff"), path: z.string(), patch: z.string() }),
  z.object({
    type: z.literal("usage"),
    inputTokens: z.number(),
    outputTokens: z.number(),
    usd: z.number(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type TaskEventPayload = z.infer<typeof taskEventSchema>;
export type TaskEventType = TaskEventPayload["type"];

/** What the worker publishes and the browser consumes; `seq` gives ordering. */
export const taskEventEnvelopeSchema = z.object({
  taskId: z.string(),
  seq: z.number().int().nonnegative(),
  at: z.string(),
  event: taskEventSchema,
});

export type TaskEventEnvelope = z.infer<typeof taskEventEnvelopeSchema>;
