import { Router, type Response } from "express";
import { prisma } from "@aca/db";
import { taskEventSchema, type TaskEventEnvelope } from "@aca/shared";
import { taskEventHub } from "../events/hub.js";
import { logger } from "../logger.js";

export const streamRouter: Router = Router();

/** Below any sane proxy timeout; also detects half-open sockets. */
const HEARTBEAT_MS = 15_000;
/** Advisory reconnect delay handed to EventSource. */
const RETRY_MS = 2_000;

/**
 * Sent as unnamed `message` events on purpose: the discriminated union already
 * carries `event.type`, and a named SSE event would force every client to
 * register one listener per event type. `id` is what the browser echoes back as
 * `Last-Event-ID` after a dropped connection.
 */
function writeEvent(res: Response, envelope: TaskEventEnvelope): void {
  res.write(`id: ${envelope.seq}\n`);
  res.write(`data: ${JSON.stringify(envelope)}\n\n`);
}

function isTerminal(envelope: TaskEventEnvelope): boolean {
  const { event } = envelope;
  return (
    event.type === "task.status" &&
    (event.status === "succeeded" || event.status === "failed" || event.status === "cancelled")
  );
}

/**
 * Live task timeline.
 *
 * Resume point is `Last-Event-ID` (sent automatically by EventSource on
 * reconnect) or `?after=<seq>`. The subscription is opened *before* the replay
 * query so nothing can slip through the gap between the two; live events that
 * arrive during the replay are buffered and then flushed, and every write is
 * filtered by `seq` so a client never sees a duplicate or an out-of-order event.
 */
streamRouter.get("/tasks/:id/stream", async (req, res, next) => {
  const taskId = req.params.id;

  try {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) {
      res.status(404).json({ error: "not_found" });
      return;
    }
  } catch (err) {
    next(err);
    return;
  }

  const headerId = Number(req.get("last-event-id"));
  const queryId = Number(req.query.after);
  const resumeFrom = Number.isFinite(headerId) ? headerId : Number.isFinite(queryId) ? queryId : -1;

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    // Tell nginx and friends not to buffer the response into oblivion.
    "x-accel-buffering": "no",
  });
  res.write(`retry: ${RETRY_MS}\n\n`);

  let lastSeq = resumeFrom;
  let replaying = true;
  const buffered: TaskEventEnvelope[] = [];

  const send = (envelope: TaskEventEnvelope): void => {
    if (envelope.seq <= lastSeq) return;
    lastSeq = envelope.seq;
    writeEvent(res, envelope);
    if (isTerminal(envelope)) close("completed");
  };

  const unsubscribe = taskEventHub.subscribe(taskId, (envelope) => {
    if (replaying) buffered.push(envelope);
    else send(envelope);
  });

  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  let closed = false;
  function close(reason: string): void {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    // `event: done` tells the browser this is an intentional end, so it closes
    // instead of reconnecting forever to a finished task.
    if (reason === "completed") res.write("event: done\ndata: {}\n\n");
    res.end();
  }

  req.on("close", () => close("client_disconnect"));

  try {
    const rows = await prisma.taskEvent.findMany({
      where: { taskId, seq: { gt: resumeFrom } },
      orderBy: { seq: "asc" },
      take: 1000,
    });
    for (const row of rows) {
      const event = taskEventSchema.safeParse(row.payload);
      if (!event.success) continue;
      send({ taskId, seq: row.seq, at: row.at.toISOString(), event: event.data });
    }
  } catch (err) {
    logger.error({ err, taskId }, "failed to replay task events");
    close("replay_error");
    return;
  }

  replaying = false;
  for (const envelope of buffered) send(envelope);
});
