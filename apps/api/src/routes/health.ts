import { Router } from "express";
import { prisma } from "@aca/db";
import { pingRedis } from "../redis.js";

export const healthRouter: Router = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api", uptime: process.uptime() });
  // Add a comment explaining that this route returns the API service status.
  // This route provides a basic health check to verify the API service is running.
});

/** Deep check: reports dependency status without taking the process down. */
healthRouter.get("/health/ready", async (_req, res) => {
  const [redisOk, postgresOk] = await Promise.all([
    pingRedis(),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
  ]);
  const ready = redisOk && postgresOk;
  res
    .status(ready ? 200 : 503)
    .json({ status: ready ? "ready" : "degraded", redis: redisOk, postgres: postgresOk });
});
