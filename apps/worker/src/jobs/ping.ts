import { pingJobSchema } from "@aca/shared";
import { logger } from "../logger.js";

/** Smoke job: validates the payload and logs the queue latency. */
export async function handlePing(raw: unknown): Promise<void> {
  const { message, sentAt } = pingJobSchema.parse(raw);
  logger.info(
    { message, latencyMs: Date.now() - new Date(sentAt).getTime() },
    "ping job processed",
  );
}
