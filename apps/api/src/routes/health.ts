import { Router } from "express";
import { pingRedis } from "../redis.js";

export const healthRouter: Router = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api", uptime: process.uptime() });
});

/** Deep check: reports dependency status without failing the process. */
healthRouter.get("/health/ready", async (_req, res) => {
  const redisOk = await pingRedis();
  res.status(redisOk ? 200 : 503).json({ status: redisOk ? "ready" : "degraded", redis: redisOk });
});
