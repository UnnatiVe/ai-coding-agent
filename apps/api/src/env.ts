import { config } from "dotenv";
import { z } from "zod";
import { fileURLToPath } from "url";

// Load the repo-root .env so every app shares one file in development.
// Use fileURLToPath so the path is correct on Windows (avoids a leading '/').
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATABASE_URL: z.string().optional(),
});

export const env = schema.parse(process.env);

export const corsOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
