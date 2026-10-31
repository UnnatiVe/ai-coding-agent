
import test from "node:test";
import assert from "node:assert/strict";
import { checkRequestedPath } from "../src/agent/providers/path-guard.js";

const prompt =
  'Create only `apps/api/src/routes/health-test.ts`. ' +
  "Do not modify other existing files, especially " +
  "`apps/api/src/routes/health.ts`.";

test("allows the explicitly requested file", () => {
  const result = checkRequestedPath(
    prompt,
    "apps/api/src/routes/health-test.ts",
  );

  assert.equal(result.allowed, true);
});

test("blocks a different existing file", () => {
  const result = checkRequestedPath(
    prompt,
    "apps/api/src/routes/health.ts",
  );

  assert.equal(result.allowed, false);
  assert.match(result.error ?? "", /health\.ts/);
});

test("normalizes Windows path separators", () => {
  const result = checkRequestedPath(
    prompt,
    "apps\\api\\src\\routes\\health-test.ts",
  );

  assert.equal(result.allowed, true);
});

test("does not restrict paths for an ordinary prompt", () => {
  const result = checkRequestedPath(
    "Explain how Express routers work.",
    "apps/api/src/routes/health.ts",
  );

  assert.equal(result.allowed, true);
});

test("supports a simple fallback create prompt", () => {
  const result = checkRequestedPath(
    "Please create `apps/api/src/routes/example.ts`.",
    "apps/api/src/routes/example.ts",
  );

  assert.equal(result.allowed, true);
});

test("blocks a protected file with a dot-slash path", () => {
  const result = checkRequestedPath(
    prompt,
    "./apps/api/src/routes/health.ts",
  );

  assert.equal(result.allowed, false);
});

test("blocks a protected file with a traversal path", () => {
  const result = checkRequestedPath(
    prompt,
    "apps/api/src/routes/../routes/health.ts",
  );

  assert.equal(result.allowed, false);
});

test("blocks an absolute path to a protected file", () => {
  const result = checkRequestedPath(
    prompt,
    "C:\\fake-workspace\\apps\\api\\src\\routes\\health.ts",
  );

  assert.equal(result.allowed, false);
});
test("allows an explicitly requested plain-text path", () => {
  const result = checkRequestedPath(
    "Create only apps/api/src/routes/forge-e2e-smoke.ts as an Express router.",
    "apps/api/src/routes/forge-e2e-smoke.ts",
  );

  assert.equal(result.allowed, true);
});

test("blocks a different path for a plain-text create-only prompt", () => {
  const result = checkRequestedPath(
    "Create only apps/api/src/routes/forge-e2e-smoke.ts as an Express router.",
    "apps/api/src/routes/health.ts",
  );

  assert.equal(result.allowed, false);
});