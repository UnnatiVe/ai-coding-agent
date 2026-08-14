import { Redis } from "ioredis";
import { env } from "./env.js";

/** BullMQ requires `maxRetriesPerRequest: null` on its blocking connection. */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
