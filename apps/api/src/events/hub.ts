import { Redis } from "ioredis";
import { taskChannel, taskEventEnvelopeSchema, type TaskEventEnvelope } from "@aca/shared";
import { env } from "../env.js";
import { logger } from "../logger.js";

export type TaskEventListener = (envelope: TaskEventEnvelope) => void;

/**
 * Fans one Redis subscriber connection out to every SSE response.
 *
 * A connection in subscriber mode can issue nothing but (un)subscribe commands,
 * so this owns its own client, separate from the queue and health clients. One
 * Redis `SUBSCRIBE` per task — not per browser — keeps N tabs on the same task
 * to a single channel, and the channel is dropped once the last one leaves.
 */
class TaskEventHub {
  private readonly subscriber: Redis;
  private readonly listeners = new Map<string, Set<TaskEventListener>>();

  constructor(redisUrl: string) {
    this.subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.subscriber.on("error", (err: Error) => logger.error({ err }, "event subscriber error"));
    this.subscriber.on("message", (channel, message) => this.dispatch(channel, message));
  }

  private dispatch(channel: string, message: string): void {
    const parsed = taskEventEnvelopeSchema.safeParse(JSON.parse(message));
    if (!parsed.success) {
      logger.warn({ channel }, "dropping malformed task event");
      return;
    }
    for (const listener of this.listeners.get(channel) ?? []) listener(parsed.data);
  }

  /** Returns an unsubscribe function; callers must invoke it when the client goes away. */
  subscribe(taskId: string, listener: TaskEventListener): () => void {
    const channel = taskChannel(taskId);
    const existing = this.listeners.get(channel);

    if (existing) {
      existing.add(listener);
    } else {
      this.listeners.set(channel, new Set([listener]));
      void this.subscriber.subscribe(channel);
    }

    return () => {
      const set = this.listeners.get(channel);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(channel);
        void this.subscriber.unsubscribe(channel);
      }
    };
  }

  async close(): Promise<void> {
    this.listeners.clear();
    await this.subscriber.quit();
  }
}

export const taskEventHub = new TaskEventHub(env.REDIS_URL);
