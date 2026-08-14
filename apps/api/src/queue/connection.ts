import { Redis } from "ioredis";
import { env } from "../env.js";

/**
 * Dedicated connection for BullMQ. `maxRetriesPerRequest: null` is required by
 * BullMQ, and is deliberately not shared with the health-check client.
 */
export const queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
