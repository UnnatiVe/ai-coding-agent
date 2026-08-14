import { closeQueue, enqueuePing } from "../queue/producer.js";
import { logger } from "../logger.js";

/** `pnpm --filter @aca/api queue:ping` - enqueues one smoke job and exits. */
const jobId = await enqueuePing(process.argv[2] ?? "ping");
logger.info({ jobId }, "ping job enqueued");
await closeQueue();
