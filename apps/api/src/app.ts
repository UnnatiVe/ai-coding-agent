import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { corsOrigins } from "./env.js";
import { logger } from "./logger.js";
import { healthRouter } from "./routes/health.js";
import { runsRouter } from "./routes/runs.js";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.use("/api", healthRouter);
  app.use("/api", runsRouter);

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));

  return app;
}
