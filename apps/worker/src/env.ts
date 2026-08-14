import { config } from "dotenv";
import { z } from "zod";
import { fileURLToPath } from "url";

// Use fileURLToPath so the path is correct on Windows (avoids a leading '/').
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
});

export const env = schema.parse(process.env);
