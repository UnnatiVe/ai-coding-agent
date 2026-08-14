import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  // Redaction matters as soon as GitHub tokens flow through Phase 2.
  redact: ["req.headers.authorization", "req.headers.cookie", "*.token", "*.password"],
});
