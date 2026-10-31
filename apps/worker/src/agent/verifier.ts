import type { AgentRunContext } from "./types.js";

export interface VerificationResult {
  ok: boolean;
  summary: string;
}

function normalizePath(value: string): string {
  return value.split("\\").join("/");
}

function extractExplicitPaths(prompt: string): string[] {
  const paths: string[] = [];
  const pathPattern =
    /\b(?:create|add|write|generate)\s+(?:only\s+)?[`"'“”]?([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)[`"'“”]?/gi;

  for (const match of prompt.matchAll(pathPattern)) {
    const candidate = normalizePath(match[1]!.trim());

    if (
      candidate.includes("/") &&
      candidate.includes(".") &&
      !paths.includes(candidate)
    ) {
      paths.push(candidate);
    }
  }

  return paths;
}
function extractNamedRouter(prompt: string): string | null {
  const match = prompt.match(
    /\bnamed\s+[`"'“”]?([A-Za-z_$][\w$]*)/i,
  );

  return match?.[1] ?? null;
}

function extractRequestedMessage(prompt: string): string | null {
  const keyIndex = prompt.indexOf('"message"');
  if (keyIndex < 0) return null;

  const colon = prompt.indexOf(":", keyIndex + 9);
  if (colon < 0) return null;

  const quote = prompt.indexOf('"', colon + 1);
  if (quote < 0) return null;

  const endQuote = prompt.indexOf('"', quote + 1);
  if (endQuote < 0) return null;

  return prompt.slice(quote + 1, endQuote);
}

async function verifyFileContent(
  context: AgentRunContext,
  requestedPath: string,
): Promise<VerificationResult | null> {
  const prompt = context.prompt;
  const content = await context.tools.readFile(requestedPath);
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes("express router")) {
    const routerName = extractNamedRouter(prompt);

    if (routerName) {
      const exports = [
        `export const ${routerName}`,
        `export let ${routerName}`,
        `export var ${routerName}`,
        `export { ${routerName} }`,
        `export {${routerName}}`,

      ];

      if (!exports.some((declaration) => content.includes(declaration))) {
        return {
          ok: false,
          summary: `Verification failed: "${requestedPath}" does not export the requested router "${routerName}".`,
        };
      }
    }
  }

  const getIndex = prompt.indexOf("GET ");
  if (getIndex >= 0) {
    const routeStart = getIndex + 4;
    let routeEnd = routeStart;

    while (
      routeEnd < prompt.length &&
      ![" ", "\t", "\r", "\n", "`", "'", '"'].includes(prompt[routeEnd]!)
    ) {
      routeEnd++;
    }

    const route = prompt.slice(routeStart, routeEnd);

    if (route) {
      const compactContent = content.split(/\s+/).join("").toLowerCase();
      const doubleQuotedRoute = `.get("${route.toLowerCase()}"`;
      const singleQuotedRoute = `.get('${route.toLowerCase()}'`;

      if (
        !compactContent.includes(doubleQuotedRoute) &&
        !compactContent.includes(singleQuotedRoute)
      ) {
        return {
          ok: false,
          summary: `Verification failed: "${requestedPath}" does not contain the requested GET ${route} route.`,
        };
      }
    }
  }

  if (/HTTP 200/i.test(prompt)) {
    const statusCalls = [
      ...content.matchAll(/\.status\s*\(\s*([^)]*)\s*\)/g),
    ].map((match) => match[1]?.trim() ?? "");

    const hasDynamicOrInvalidStatus = statusCalls.some(
      (status) => !/^200$/.test(status),
    );

    if (
      hasDynamicOrInvalidStatus ||
      (statusCalls.length === 0 && !/\.json\s*\(/.test(content))
    ) {
      return {
        ok: false,
        summary: `Verification failed: "${requestedPath}" must return HTTP 200.`,
      };
    }
  }

  if (
    /"status"\s*:\s*"ok"/i.test(prompt) &&
    !/\bstatus\s*:\s*["']ok["']/.test(content)
  ) {
    return {
      ok: false,
      summary: `Verification failed: "${requestedPath}" does not contain the requested JSON status "ok".`,
    };
  }

  const requestedMessage = extractRequestedMessage(prompt);

  if (requestedMessage && !content.includes(requestedMessage)) {
    return {
      ok: false,
      summary: `Verification failed: "${requestedPath}" does not contain the requested JSON message "${requestedMessage}".`,
    };
  }

  return null;
}

export async function verifyTaskResult(
  context: AgentRunContext,
): Promise<VerificationResult> {
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
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
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
        summary: `Verification failed: requested file "${requestedPath}" was not changed.`,
      };
    }

    try {
      const result = await verifyFileContent(context, requestedPath);
      if (result) return result;
    } catch (error) {
      return {
        ok: false,
        summary:
          `Verification failed: could not read requested file "${requestedPath}": ` +
          `${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  const lowerPrompt = prompt.toLowerCase();

  if (
    lowerPrompt.includes("do not modify") &&
    lowerPrompt.includes("existing files")
  ) {
    const unexpectedChanges = changedPaths.filter(
      (filePath) => !explicitPaths.includes(filePath),
    );

    if (unexpectedChanges.length > 0) {
      return {
        ok: false,
        summary:
          "Verification failed: the task says not to modify existing files, " +
          `but these paths changed: ${unexpectedChanges.join(", ")}`,
      };
    }
  }

  return {
    ok: true,
    summary: "Task result passed deterministic verification.",
  };
}
