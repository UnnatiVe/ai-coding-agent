import { z } from "zod";
import { runStatusSchema } from "./types.js";

/**
 * Events streamed from the worker to the browser (worker -> Redis -> API -> SSE).
 * Phase 1 only emits `run.status` and `log`; the rest are declared so the
 * frontend timeline and the agent loop agree on one contract from day one.
 */
export const runEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run.status"), status: runStatusSchema }),
  z.object({
    type: z.literal("log"),
    level: z.enum(["debug", "info", "warn", "error"]),
    message: z.string(),
  }),
  z.object({ type: z.literal("step.start"), stepIndex: z.number().int() }),
  z.object({ type: z.literal("llm.delta"), text: z.string() }),
  z.object({ type: z.literal("tool.call"), id: z.string(), name: z.string(), args: z.unknown() }),
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

export type RunEvent = z.infer<typeof runEventSchema>;

/** Envelope persisted/published for every event so consumers can order them. */
export const runEventEnvelopeSchema = z.object({
  runId: z.string(),
  seq: z.number().int().nonnegative(),
  at: z.string(),
  event: runEventSchema,
});

export type RunEventEnvelope = z.infer<typeof runEventEnvelopeSchema>;
