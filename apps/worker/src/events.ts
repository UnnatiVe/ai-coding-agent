import { prisma } from "@aca/db";
import { taskChannel, type TaskEventPayload } from "@aca/shared";
import type { Redis } from "ioredis";

/**
 * Persist first, then publish. The database row is the source of truth a
 * reconnecting client replays from; the Redis message is a best-effort nudge
 * for listeners that are currently attached (SSE lands in Phase 3).
 */
export async function emitTaskEvent(
  publisher: Redis,
  taskId: string,
  event: TaskEventPayload,
): Promise<void> {
  const last = await prisma.taskEvent.findFirst({
    where: { taskId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  const seq = (last?.seq ?? -1) + 1;

  const row = await prisma.taskEvent.create({
    data: { taskId, seq, type: event.type, payload: event },
  });

  await publisher.publish(
    taskChannel(taskId),
    JSON.stringify({ taskId, seq, at: row.at.toISOString(), event }),
  );
}
