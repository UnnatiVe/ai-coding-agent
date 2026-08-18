import { config } from "dotenv";
import { z } from "zod";
import { fileURLToPath } from "url";

// Use fileURLToPath so the path is correct on Windows (avoids a leading '/').
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const agentProviderSchema = z.enum(["stub", "ollama"]);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  AGENT_PROVIDER: agentProviderSchema.default("stub"),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5-coder:3b"),
});

export const env = schema.parse(process.env);
