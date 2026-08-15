import { Router } from "express";
import { prisma } from "@aca/db";
import { taskChannel, createTaskRequestSchema } from "@aca/shared";
import { createTask, getTask, listTasks } from "../services/tasks.js";
import { enqueuePing } from "../queue/producer.js";
import { env } from "../env.js";
import { Redis } from "ioredis";

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

/** Replayable progress log. When requested as SSE, keep the connection open and stream live updates. */
tasksRouter.get("/tasks/:id/events", async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const after = Number(req.query.after ?? -1);
    const acceptHeader = req.headers.accept ?? "";
    const stream = req.query.stream === "1" || acceptHeader.includes("text/event-stream");

    if (!stream) {
      const events = await prisma.taskEvent.findMany({
        where: { taskId, seq: { gt: Number.isFinite(after) ? after : -1 } },
        orderBy: { seq: "asc" },
        take: 500,
      });
      res.json({ events });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const replay = await prisma.taskEvent.findMany({
      where: { taskId, seq: { gt: Number.isFinite(after) ? after : -1 } },
      orderBy: { seq: "asc" },
      take: 500,
    });

    for (const entry of replay) {
      const payload = {
        taskId,
        seq: entry.seq,
        at: entry.at.toISOString(),
        event: entry.payload,
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    const channel = taskChannel(taskId);
    const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    const onMessage = (_channel: string, message: string) => {
      if (_channel !== channel) return;
      res.write(`data: ${message}\n\n`);
    };

    await subscriber.subscribe(channel);
    subscriber.on("message", onMessage);

    res.write(": connected\n\n");

    const close = async () => {
      subscriber.off("message", onMessage);
      try {
        await subscriber.unsubscribe(channel);
      } catch {
        // no-op: the client disconnect is enough to stop the stream
      }
      await subscriber.quit();
    };

    req.on("close", () => {
      void close();
    });
    req.on("end", () => {
      void close();
    });
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
