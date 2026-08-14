import { prisma } from "@aca/db";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { taskEventHub } from "./events/hub.js";
import { closeQueue } from "./queue/producer.js";

const server = createApp().listen(env.API_PORT, () => {
  logger.info(`api listening on http://localhost:${env.API_PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      void Promise.allSettled([closeQueue(), taskEventHub.close(), prisma.$disconnect()]).then(() =>
        process.exit(0),
      );
    });
  });
}
