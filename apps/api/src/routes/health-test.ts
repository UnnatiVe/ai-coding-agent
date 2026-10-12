import { Router } from "express";
import { prisma } from "@aca/db";
import { pingRedis } from "../redis.js";

export const healthTestRouter: Router = Router();

healthTestRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api", uptime: process.uptime() });
});

/** Deep check: reports dependency status without taking the process down. */
healthTestRouter.get("/health/ready", async (_req, res) => {
  const [redisOk, postgresOk] = await Promise.all([
    pingRedis(),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
  ]);
  const ready = redisOk && postgresOk;
  res
    .status(ready ? 200 : 503)
    .json({ status: ready ? "ready" : "degraded", redis: redisOk, postgres: postgresOk });
});
