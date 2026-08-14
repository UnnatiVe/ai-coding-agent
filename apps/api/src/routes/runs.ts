import { Router } from "express";
import { createRunRequestSchema } from "@aca/shared";

export const runsRouter: Router = Router();

/**
 * Phase 1 stubs: the contract the frontend codes against. Phase 2 replaces the
 * bodies with Prisma persistence + BullMQ enqueue, and adds the SSE stream.
 */
runsRouter.get("/runs", (_req, res) => {
  res.json({ runs: [] });
});

runsRouter.post("/runs", (req, res) => {
  const parsed = createRunRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }
  res.status(501).json({ error: "not_implemented", message: "Run execution lands in Phase 2." });
});
