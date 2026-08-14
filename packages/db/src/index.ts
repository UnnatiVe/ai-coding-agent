import { config } from "dotenv";
import { PrismaClient } from "./generated/client/index.js";

// The repo-root .env is the single source of config for every workspace, and
// Prisma resolves DATABASE_URL at client construction time.
config({ path: new URL("../../../.env", import.meta.url).pathname });

export * from "./generated/client/index.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Single client per process; avoids exhausting connections on dev reload. */
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
