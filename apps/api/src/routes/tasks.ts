import { Router } from "express";
import { prisma } from "@aca/db";
import { createTaskRequestSchema } from "@aca/shared";
import { createTask, getTask, listTasks } from "../services/tasks.js";
import { enqueuePing } from "../queue/producer.js";
import { env } from "../env.js";

export const tasksRouter: Router = Router();

tasksRouter.get("/tasks", async (_req, res, next) => {
  try {
    res.json({ tasks: await listTasks() });
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/tasks", async (req, res, next) => {
  const parsed = createTaskRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }
  try {
    res.status(202).json({ task: await createTask(parsed.data) });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/tasks/:id", async (req, res, next) => {
  try {
    const task = await getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

/** Replayable progress log. Phase 3 turns this into an SSE stream. */
tasksRouter.get("/tasks/:id/events", async (req, res, next) => {
  try {
    const after = Number(req.query.after ?? -1);
    const events = await prisma.taskEvent.findMany({
      where: { taskId: req.params.id, seq: { gt: Number.isFinite(after) ? after : -1 } },
      orderBy: { seq: "asc" },
      take: 500,
    });
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

/** Development-only smoke job; the worker logs it and does nothing else. */
tasksRouter.post("/dev/ping", async (_req, res, next) => {
  if (env.NODE_ENV === "production") {
    res.status(404).json({ error: "not_found" });
    return;
  }
  try {
    res.status(202).json({ jobId: await enqueuePing() });
  } catch (err) {
    next(err);
  }
});
