import test from "node:test";
import assert from "node:assert/strict";
import type { AgentRunContext } from "../src/agent/types.js";
import { verifyTaskResult } from "../src/agent/verifier.js";

const requestedPath = "apps/api/src/routes/health-test.ts";
const protectedPath = "apps/api/src/routes/health.ts";

const prompt =
  'Create only `apps/api/src/routes/health-test.ts`. Export an Express router named `healthTestRouter`. ' +
  'GET / returns HTTP 200 JSON { "status": "ok", "message": "Health test successful" }. ' +
  'Do not modify other existing files, especially `apps/api/src/routes/health.ts`.';

const correctContent = `
import { Router } from "express";

export const healthTestRouter: Router = Router();

healthTestRouter.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Health test successful",
  });
});
`;

function makeContext(
  changedPaths: string[],
  files: Record<string, string>,
): AgentRunContext {
  return {
    taskId: "verifier-test",
    attempt: 1,
    repoFullName: "test/repo",
    prompt,
    baseBranch: "main",
    workspace: {} as AgentRunContext["workspace"],
    tools: {
      readFile: async (path: string) => {
        if (!(path in files)) throw new Error(`Missing test file: ${path}`);
        return files[path]!;
      },
    } as AgentRunContext["tools"],
    git: {
      status: async () => ({
        isClean: changedPaths.length === 0,
        output: changedPaths.map((path) => ` M ${path}`).join("\n"),
      }),
    } as unknown as AgentRunContext["git"],
    emit: async () => {},
  };
}

test("accepts the requested route and JSON message", async () => {
  const result = await verifyTaskResult(
    makeContext([requestedPath], { [requestedPath]: correctContent }),
  );
  assert.equal(result.ok, true, result.summary);
});

test("rejects the wrong GET route", async () => {
  const wrongRoute = correctContent.replace('get("/"', 'get("/health"');
  const result = await verifyTaskResult(
    makeContext([requestedPath], { [requestedPath]: wrongRoute }),
  );
  assert.equal(result.ok, false, result.summary);
});

test("rejects an incorrect JSON message", async () => {
  const wrongMessage = correctContent.replace(
    'message: "Health test successful",',
    'message: "Something else",',
  );
  const result = await verifyTaskResult(
    makeContext([requestedPath], { [requestedPath]: wrongMessage }),
  );
  assert.equal(result.ok, false, result.summary);
});

test("rejects a missing JSON message field", async () => {
  const missingMessage = correctContent.replace(
    'message: "Health test successful",',
    "",
  );
  const result = await verifyTaskResult(
    makeContext([requestedPath], { [requestedPath]: missingMessage }),
  );
  assert.equal(result.ok, false, result.summary);
});

test("rejects changes to the protected health.ts file", async () => {
  const result = await verifyTaskResult(
    makeContext(
      [requestedPath, protectedPath],
      {
        [requestedPath]: correctContent,
        [protectedPath]: 'export const changed = true;',
      },
    ),
  );
  assert.equal(result.ok, false, result.summary);
});



test("rejects a missing Express router export", async () => {
  const missingExport = correctContent.replace(
    "export const healthTestRouter: Router = Router();",
    "const healthTestRouter: Router = Router();",
  );

  const result = await verifyTaskResult(
    makeContext([requestedPath], { [requestedPath]: missingExport }),
  );

  assert.equal(result.ok, false, result.summary);
});

test("rejects an incorrect HTTP status code", async () => {
  const wrongStatus = correctContent.replace(
    "res.status(200)",
    "res.status(500)",
  );
  const result = await verifyTaskResult(
    makeContext([requestedPath], { [requestedPath]: wrongStatus }),
  );
  assert.equal(result.ok, false, result.summary);
});

test("rejects an incorrect JSON status value", async () => {
  const wrongJsonStatus = correctContent.replace(
    'status: "ok",',
    'status: "error",',
  );
  const result = await verifyTaskResult(
    makeContext([requestedPath], { [requestedPath]: wrongJsonStatus }),
  );
  assert.equal(result.ok, false, result.summary);
});

test("accepts implicit HTTP 200 when using res.json directly", async () => {
  const implicit200 = correctContent.replace(
    "res.status(200).json({",
    "res.json({",
  );

  const result = await verifyTaskResult(
    makeContext([requestedPath], { [requestedPath]: implicit200 }),
  );

  assert.equal(result.ok, true, result.summary);
});

test("verifies all explicitly requested files", async () => {
  const secondPath = "apps/api/src/routes/health-ready.ts";
  const multiPathPrompt =
    'Create `apps/api/src/routes/health-test.ts` and create `' +
    secondPath +
    '`. Export an Express router named `healthTestRouter`. ' +
    'GET / returns HTTP 200 JSON { "status": "ok", "message": "Health test successful" }. ' +
    'Do not modify other existing files.';

  const context = makeContext(
    [requestedPath, secondPath],
    {
      [requestedPath]: correctContent,
      [secondPath]: correctContent,
    },
  );

  context.prompt = multiPathPrompt;

  const result = await verifyTaskResult(context);

  assert.equal(result.ok, true, result.summary);
});
test("accepts a plain-text requested path and router name", async () => {
  const plainTextPrompt =
    'Create only apps/api/src/routes/health-test.ts as an Express router named healthTestRouter. ' +
    'Implement GET / returning HTTP 200 JSON with "status": "ok" and "message": "Health test successful". ' +
    'Do not modify existing files.';

  const context = makeContext(
    [requestedPath],
    { [requestedPath]: correctContent },
  );

  context.prompt = plainTextPrompt;

  const result = await verifyTaskResult(context);

  assert.equal(result.ok, true, result.summary);
});

test("rejects default export when a named router export is requested", async () => {
  const defaultExport = correctContent
    .replace(
      "export const healthTestRouter: Router = Router();",
      "const healthTestRouter: Router = Router();",
    )
    .concat("\nexport default healthTestRouter;\n");

  const context = makeContext(
    [requestedPath],
    { [requestedPath]: defaultExport },
  );

  context.prompt =
    'Create only apps/api/src/routes/health-test.ts as an Express router named healthTestRouter. ' +
    'Implement GET / returning HTTP 200 JSON with "status": "ok" and "message": "Health test successful". ' +
    'Do not modify existing files.';

  const result = await verifyTaskResult(context);

  assert.equal(result.ok, false, result.summary);
});

test("rejects a dynamic HTTP status when HTTP 200 is explicitly required", async () => {
  const dynamicStatus = correctContent.replace(
    "res.status(200)",
    "res.status(statusCode)",
  );

  const result = await verifyTaskResult(
    makeContext([requestedPath], { [requestedPath]: dynamicStatus }),
  );

  assert.equal(result.ok, false, result.summary);
});
