import type { AgentRunContext } from "./types.js";

export interface VerificationResult {
  ok: boolean;
  summary: string;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
function extractExplicitPaths(prompt: string): string[] {
  const paths = [...prompt.matchAll(/(?:file|path)\s+(?:named\s+|at\s+)?[`'"]([^`'"]+)[`'"]/gi)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\\/g, "/"));

  const unquotedPaths = [
    ...prompt.matchAll(
      /(?:file|path)\s+(?:named\s+|at\s+)?((?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+)/gi,
    ),
  ]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\\/g, "/"));

  return [...new Set([...paths, ...unquotedPaths])];
}

function extractRequestedMessage(prompt: string): string | null {
  const match = prompt.match(/JSON response\s+\{\s*["']message["']\s*:\s*["']([^"']+)["']\s*\}/i);

  return match?.[1] ?? null;
}

async function verifyFileContent(
  context: AgentRunContext,
  requestedPath: string,
): Promise<VerificationResult | null> {
  const prompt = context.prompt;
  const content = await context.tools.readFile(requestedPath);

  if (/exports an Express router/i.test(prompt)) {
    const hasRouterExport =
      /export\s+(?:default\s+)?router\b/.test(content) ||
      /export\s+(?:const|let|var)\s+\w*router\b/i.test(content) ||
      /export\s*\{\s*\w*router\s*\}/i.test(content);
    if (!hasRouterExport) {
      return {
        ok: false,
        summary:
          `Verification failed: "${requestedPath}" does not export the ` +
          "Express router requested by the task.",
      };
    }
  }

  if (/GET\s+[`'"]?\/[`'"]?\s+endpoint/i.test(prompt)) {
    const hasGetRoot = /\.get\(\s*["']\/["']/.test(content);

    if (!hasGetRoot) {
      return {
        ok: false,
        summary:
          `Verification failed: "${requestedPath}" does not contain ` +
          "the requested GET / endpoint.",
      };
    }
  }

  const requestedMessage = extractRequestedMessage(prompt);

  if (requestedMessage !== null) {
    if (!content.includes(requestedMessage)) {
      return {
        ok: false,
        summary:
          `Verification failed: "${requestedPath}" does not contain ` +
          `the requested JSON message "${requestedMessage}".`,
      };
    }
  }

  return null;
}

export async function verifyTaskResult(context: AgentRunContext): Promise<VerificationResult> {
  const status = await context.git.status();

  if (status.isClean) {
    return {
      ok: false,
      summary: "Verification failed: the task produced no Git changes.",
    };
  }

  const prompt = context.prompt;
  const explicitPaths = extractExplicitPaths(prompt);

  const changedPaths = status.output
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("##"))
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((line) => {
      const path = line.includes(" -> ") ? line.split(" -> ")[1] : line;

      return path ? normalizePath(path) : "";
    })
    .filter(Boolean);

  for (const requestedPath of explicitPaths) {
    if (!changedPaths.includes(requestedPath)) {
      return {
        ok: false,
        summary: `Verification failed: requested file "${requestedPath}" ` + "was not changed.",
      };
    }

    try {
      const contentVerification = await verifyFileContent(context, requestedPath);

      if (contentVerification) {
        return contentVerification;
      }
    } catch (error) {
      return {
        ok: false,
        summary:
          `Verification failed: could not read requested file ` +
          `"${requestedPath}": ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (/do not modify any existing files/i.test(prompt)) {
    const existingFileChanges = changedPaths.filter(
      (filePath) => !explicitPaths.includes(filePath),
    );

    if (existingFileChanges.length > 0) {
      return {
        ok: false,
        summary:
          "Verification failed: the task says not to modify existing files, " +
          `but these paths changed: ${existingFileChanges.join(", ")}`,
      };
    }
  }

  return {
    ok: true,
    summary: "Task result passed deterministic verification.",
  };
}
