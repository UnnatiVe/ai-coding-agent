import test from "node:test";
import assert from "node:assert/strict";
import { OllamaAgentProvider } from "../src/agent/providers/ollama.js";
import type { AgentRunContext } from "../src/agent/types.ts";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function createContext(
  prompt: string,
  calls: Array<{ name: string; relativePath?: string }>,
): AgentRunContext {
  const workspace = {
    taskId: "ollama-path-guard-test",
    rootPath: "C:\\fake-workspace",
  };

  const tools = {
    workspace,
    listFiles: async () => [],
    readFile: async (relativePath: string) => {
      if (relativePath === "apps/api/src/routes/health.ts") {
        return 'export const healthRouter = Router();';
      }
      throw new Error("ENOENT: file not found");
    },
    writeFile: async (relativePath: string) => {
      calls.push({ name: "writeFile", relativePath });
    },
    replaceInFile: async (relativePath: string) => {
      calls.push({ name: "replaceInFile", relativePath });
    },
    getScripts: async () => [],
  };

  const git = {
    init: async () => {},
    clone: async () => {},
    status: async () => ({ isClean: true, changedFiles: [] }),
    createBranch: async () => {},
    diff: async () => "",
    commit: async () => "",
    push: async () => "",
  };

  return {
    taskId: "ollama-path-guard-test",
    attempt: 1,
    repoFullName: "test/repository",
    prompt,
    baseBranch: "main",
    workspace,
    tools,
    git,
    emit: async () => {},
  } as unknown as AgentRunContext;
}

async function withFakeOllama(
  toolName: string,
  relativePath: string,
  run: () => Promise<void>,
  repeatToolCall = false,
) {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = (async () => {
    requestCount += 1;
    const message =
    requestCount === 1 || repeatToolCall
        ? {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                function: {
                  name: toolName,
                  arguments: {
                    relativePath,
                    content: "test content",
                    oldText: "original content",
                    newText: "modified content",
                  },
                },
              },
            ],
          }
        : {
            role: "assistant",
            content: "Implementation completed.",
            tool_calls: [],
          };
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ message }),
    } as Response;
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
test("provider permits creating a plain-text explicitly requested file", async () => {
  const calls: Array<{ name: string; relativePath?: string }> = [];

  await withFakeOllama(
    "writeFile",
    "apps/api/src/routes/forge-e2e-smoke.ts",
    async () => {
      const provider = new OllamaAgentProvider({
        baseUrl: "http://127.0.0.1:11434",
      });

      const result = await provider.executeStep(
        createContext(
          "Create only apps/api/src/routes/forge-e2e-smoke.ts as an Express router. Implement GET /.",
          calls,
        ),
        {
          index: 1,
          name: "implement",
          description: "Create the requested file",
        },
      );

      assert.equal(result.ok, true, result.summary);
      assert.deepEqual(calls, [
        {
          name: "writeFile",
          relativePath: "apps/api/src/routes/forge-e2e-smoke.ts",
        },
      ]);
    },
  );
});
test("provider blocks writing to a different existing file", async () => {
  const calls: Array<{ name: string; relativePath?: string }> = [];

  await withFakeOllama(
    "writeFile",
    "apps/api/src/routes/health.ts",
    async () => {
      const provider = new OllamaAgentProvider({
        baseUrl: "http://127.0.0.1:11434",
      });

      const result = await provider.executeStep(
        createContext(
          "Create only `apps/api/src/routes/health-test.ts`. Do not modify other existing files.",
          calls,
        ),
        {
          index: 1,
          name: "implement",
          description: "Create the requested file",
        },
      );

      assert.equal(result.ok, false);
      assert.match(result.summary, /only permits editing explicitly requested files/i);
      assert.equal(
        calls.some((call) => call.relativePath === "apps/api/src/routes/health.ts"),
        false,
      );
    },
    true,
  );
});

test("provider blocks replacing a different existing file", async () => {
  const calls: Array<{ name: string; relativePath?: string }> = [];

  await withFakeOllama(
    "replaceInFile",
    "apps/api/src/routes/health.ts",
    async () => {
      const provider = new OllamaAgentProvider({
        baseUrl: "http://127.0.0.1:11434",
      });

      const result = await provider.executeStep(
        createContext(
          "Create only `apps/api/src/routes/health-test.ts`. Do not modify other existing files.",
          calls,
        ),
        {
          index: 1,
          name: "implement",
          description: "Create the requested file",
        },
      );

      assert.equal(result.ok, false);
      assert.match(result.summary, /only permits editing explicitly requested files/i);
      assert.equal(
        calls.some((call) => call.relativePath === "apps/api/src/routes/health.ts"),
        false,
      );
    },
      true,
  );
});


test("provider stops repeating writes after creating the requested file", async () => {
  const calls: Array<{ name: string; relativePath?: string }> = [];

  await withFakeOllama(
    "writeFile",
    "apps/api/src/routes/health-test.ts",
    async () => {
      const provider = new OllamaAgentProvider({
        baseUrl: "http://127.0.0.1:11434",
      });

      const result = await provider.executeStep(
        createContext(
          "Create only `apps/api/src/routes/health-test.ts`. Do not modify other existing files.",
          calls,
        ),
        {
          index: 1,
          name: "implement",
          description: "Create the requested file",
        },
      );

      assert.equal(result.ok, true, result.summary);
      assert.equal(
        calls.filter((call) => call.name === "writeFile").length,
        1,
        "The provider should not repeat a successful write",
      );
    },
    true,
  );
});
test("provider rejects completion when requested file was never edited", async () => {
  const calls: Array<{ name: string; relativePath?: string }> = [];

  await withFakeOllama(
    "readFile",
    "apps/api/src/routes/health.ts",
    async () => {
      const provider = new OllamaAgentProvider({
        baseUrl: "http://127.0.0.1:11434",
      });

      const result = await provider.executeStep(
        createContext(
          "Create only `apps/api/src/routes/health-test.ts`. Do not modify other existing files.",
          calls,
        ),
        {
          index: 1,
          name: "implement",
          description: "Create the requested file",
        },
      );

      assert.equal(result.ok, false);
      assert.match(
        result.summary,
        /stopped before editing all requested files/i,
      );
    },
  );
});
test("provider rejects completion when validation fails and no repair is made", async () => {
  const calls: Array<{ name: string; relativePath?: string }> = [];
  const tempRoot = await mkdtemp(
    join(tmpdir(), "forge-validation-failure-"),
  );

  try {
    await writeFile(
      join(tempRoot, "package.json"),
      JSON.stringify({
        scripts: {
          typecheck: 'node -e "process.exit(1)"',
        },
      }),
      "utf8",
    );

    await withFakeOllama(
      "writeFile",
      "apps/api/src/routes/health-test.ts",
      async () => {
        const provider = new OllamaAgentProvider({
          baseUrl: "http://127.0.0.1:11434",
        });

        const context = createContext(
          "Create only `apps/api/src/routes/health-test.ts`. Do not modify other existing files.",
          calls,
        );

        context.workspace.rootPath = tempRoot;
        context.tools.getScripts = async () => ["typecheck"];

        const result = await provider.executeStep(context, {
          index: 1,
          name: "implement",
          description: "Create the requested file",
        });

        assert.equal(result.ok, false);
        assert.match(
          result.summary,
          /validation failed and the agent stopped without completing a repair/i,
        );
      },
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function withFakeOllamaSequence(
  messages: Array<Record<string, unknown>>,
  run: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = (async () => {
    const message = messages[requestCount];

    if (!message) {
      throw new Error(
        `Unexpected Ollama request number ${requestCount + 1}`,
      );
    }

    requestCount += 1;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ message }),
    } as Response;
  }) as typeof fetch;

  try {
    await run();
    assert.equal(
      requestCount,
      messages.length,
      "All expected Ollama responses should be consumed",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("provider repairs validation failure and succeeds after validation passes", async () => {
  const calls: Array<{ name: string; relativePath?: string }> = [];
  const tempRoot = await mkdtemp(
    join(tmpdir(), "forge-validation-repair-"),
  );

  try {
    await writeFile(
      join(tempRoot, "package.json"),
      JSON.stringify({
        scripts: {
          typecheck: "node validate.cjs",
        },
      }),
      "utf8",
    );

    await writeFile(
      join(tempRoot, "validate.cjs"),
      [
        'const fs = require("node:fs");',
        'const counterFile = ".validation-count";',
        'let count = 0;',
        'if (fs.existsSync(counterFile)) {',
        '  count = Number(fs.readFileSync(counterFile, "utf8"));',
        '}',
        'fs.writeFileSync(counterFile, String(count + 1));',
        'if (count === 0) process.exit(1);',
      ].join("\n"),
      "utf8",
    );

    const relativePath = "apps/api/src/routes/health-test.ts";

    await withFakeOllamaSequence(
      [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              function: {
                name: "writeFile",
                arguments: {
                  relativePath,
                  content: "initial implementation",
                },
              },
            },
          ],
        },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              function: {
                name: "replaceInFile",
                arguments: {
                  relativePath,
                  oldText: "initial implementation",
                  newText: "repaired implementation",
                },
              },
            },
          ],
        },
      ],
      async () => {
        const provider = new OllamaAgentProvider({
          baseUrl: "http://127.0.0.1:11434",
        });

        const context = createContext(
          "Create only `apps/api/src/routes/health-test.ts`. Do not modify other existing files.",
          calls,
        );

        context.workspace.rootPath = tempRoot;
        context.tools.getScripts = async () => ["typecheck"];

        const result = await provider.executeStep(context, {
          index: 1,
          name: "implement",
          description: "Create and validate the requested file",
        });

        assert.equal(result.ok, true, result.summary);

        assert.deepEqual(
          calls.map((call) => call.name),
          ["writeFile", "replaceInFile"],
        );

        const validationCount = await readFile(
          join(tempRoot, ".validation-count"),
          "utf8",
        );

        assert.equal(
          validationCount,
          "2",
          "Validation should run once before repair and once after repair",
        );
      },
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
