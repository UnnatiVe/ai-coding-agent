import { Redis } from "ioredis";
import { env } from "./env.js";

/**
 * Lazily connected so the API still boots (and /health still answers) when
 * Redis is down — it reports degraded instead of crash-looping.
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
});

redis.on("error", () => {
  /* handled by the health check; avoids unhandled error events */
});

export async function pingRedis(): Promise<boolean> {
  try {
    if (redis.status === "wait" || redis.status === "end") await redis.connect();
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}
