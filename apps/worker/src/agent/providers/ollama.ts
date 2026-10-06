import type {
  AgentProvider,
  AgentRunContext,
  AgentStep,
  AgentStepResult,
} from "../types.js";
import {
  executeWorkspaceTool,
  type WorkspaceToolCall,
} from "../../workspace/tool-executor.js";

const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:3b";

export interface OllamaProviderConfig {
  baseUrl: string;
  model?: string;
}

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: Record<string, unknown>;
    };
  }>;
}

interface OllamaResponse {
  message?: OllamaMessage;
  error?: string;
}
function selectValidationCommand(scripts: string[]): string | null {
  const preferredScripts = ["typecheck", "test", "lint", "build"];

  for (const script of preferredScripts) {
    if (scripts.includes(script)) {
      return `pnpm run ${script}`;
    }
  }

  return null;
}

export class OllamaAgentProvider implements AgentProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OllamaProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.model = config.model ?? DEFAULT_OLLAMA_MODEL;
  }

  async repair(
    context: AgentRunContext,
    feedback: string,
  ): Promise<AgentStepResult> {
    try {
      const result = await this.runImplementStep(
        context,
        {
          index: 1,
          name: "implement",
          description: [
            "Repair the existing implementation based on verifier feedback.",
            "Inspect the actual current file before editing.",
            `Verifier feedback: ${feedback}`,
            "",
            "This is a minimal repair attempt.",
            "The requested file already exists.",
            "NEVER use writeFile during this repair.",
            "Use readFile first, then use replaceInFile with exact text copied from readFile.",
            "Fix only the specific problem reported by the verifier.",
            "Do not remove code that already satisfies the task.",
            "Do not rewrite working code unnecessarily.",
            "Do not create unrelated functionality.",
            "",
            "The verifier accepts an Express router export only when the file contains either:",
            "export default router;",
            "or",
            "export { router };",
            "Follow the existing Express router typing pattern in this repository exactly.",
            "In apps/api/src/routes/tasks.ts, the established pattern is: export const tasksRouter: Router = Router();",
            "Do not use Router<...>(), Router<Request, Response>(), or invented generic type parameters.",
            "If the TypeScript error mentions Router inference or TS2742, use the repository pattern above instead of adding generic type parameters.",
            "For this task, keep the existing GET / endpoint and its requested JSON response.",
            "After making the minimal repair, stop and let Forge run validation and verification.",
          ].join("\n"),
        },
        feedback,
      );

      return {
        stepIndex: 1,
        name: "repair",
        summary: result,
        ok: true,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "local Ollama repair request failed";

      return {
        stepIndex: 1,
        name: "repair",
        summary: `Ollama repair failed: ${message}`,
        ok: false,
      };
    }
  }



  plan(_context: AgentRunContext): AgentStep[] {
    return [
      {
        index: 0,
        name: "plan",
        description: "Understand the task and plan the required changes.",
      },
      {
        index: 1,
        name: "implement",
        description: "Inspect and modify the repository using workspace tools.",
      },
      {
        index: 2,
        name: "review",
        description: "Review the implemented changes against the task.",
      },
      {
        index: 3,
        name: "validate",
        description: "Verify that the requested changes were actually completed.",
      },
    ];
  }

  async executeStep(
    context: AgentRunContext,
    step: AgentStep,
  ): Promise<AgentStepResult> {
    try {
      const result = await this.runOllamaStep(context, step);

      return {
        stepIndex: step.index,
        name: step.name,
        summary: result,
        ok: true,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "local Ollama request failed";

      return {
        stepIndex: step.index,
        name: step.name,
        summary: `Ollama request failed for ${step.name}: ${message}`,
        ok: false,
      };
    }
  }

  private async runOllamaStep(
    context: AgentRunContext,
    step: AgentStep,
  ): Promise<string> {
    if (step.name !== "implement") {
      return this.runTextStep(context, step);
    }

    return this.runImplementStep(context, step);
  }

  private async runTextStep(
    context: AgentRunContext,
    step: AgentStep,
  ): Promise<string> {
    const messages: OllamaMessage[] = [
      {
        role: "system",
        content: [
          "You are Forge, a local autonomous coding agent.",
          `You are currently performing the ${step.name} step.`,
          "This step is analysis-only.",
          "Do not use tools.",
          "Do not modify files.",
          "Do not claim that files were modified.",
          "Give a short and useful result for this step.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Repository: ${context.repoFullName}`,
          `Base branch: ${context.baseBranch}`,
          `Task: ${context.prompt}`,
          `Step: ${step.name}`,
          `Objective: ${step.description}`,
        ].join("\n"),
      },
    ];

    const response = await this.chat(messages, false);

    const content = response.message?.content?.trim();

    if (!content) {
      return `completed ${step.name} for ${context.taskId}`;
    }

    return content;
  }

  private async runImplementStep(
    context: AgentRunContext,
    step: AgentStep,
    repairFeedback?: string,
  ): Promise<string> {
    const MAX_TOOL_ROUNDS = 12;

    const messages: OllamaMessage[] = [
      {
        role: "system",
        content: [
          "You are Forge, a local autonomous coding agent working in a controlled repository.",
          "Inspect the actual repository before changing files. Never invent filenames, paths, APIs, or file contents.",
          "Use listFiles to discover paths and readFile to inspect existing files.",
          "For an existing file, use replaceInFile with exact text copied from readFile.",
          "Use writeFile only to create a genuinely new file. Never overwrite an existing file.",
          "For TypeScript errors, do not invent generic type parameters, type annotations, imports, or APIs.",
          "Inspect similar working files in the repository and follow their exact established TypeScript pattern.",
          "IMPORTANT EXPRESS ROUTER RULE:",
          "When creating or repairing an Express router, NEVER use Router<...> with generic type parameters.",
          "NEVER use Router<Request, Response>, Router<express.Request, express.Response>, or any other invented Router generic.",
          "If TypeScript reports TS2742 for an inferred router variable, use the repository's established pattern:",
          "export const router: Router = Router();",
          'The Router import must come from "express".',
          "Make the smallest possible change that fixes the reported error.",
          "If validation reports a type error, make the smallest possible change that directly addresses that error.",
          "Never repeat the same failed edit after validation has shown that edit is incorrect.",
          "Dependencies are already installed by Forge. NEVER run npm install, npm i, pnpm install, pnpm i, yarn install, yarn add, or any other dependency installation command.",
          "Forge automatically selects and runs validation after a successful file edit. Do not call getScripts or runCommand for validation yourself.",
          "If Forge reports a validation failure, inspect the reported error and repair the actual problem using the appropriate file-editing tool.",
          "After repairing the file, stop and let Forge automatically rerun validation.",
          "Do not repeatedly run validation commands yourself. Do not call runCommand unless the task explicitly requires a non-validation command.",
          "Only claim work that tools actually confirm.",
          "If you cannot complete the task, explain what prevented completion.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Repository: ${context.repoFullName}`,
          `Base branch: ${context.baseBranch}`,
          `Task: ${context.prompt}`,
          `Objective: ${step.description}`,
          ...(repairFeedback
            ? [
              "",
              "This is a repair attempt.",
              `Verifier feedback: ${repairFeedback}`,
              "Inspect the current implementation and repair the actual problem.",
              "Do not create unrelated code or copy unrelated functionality from existing files.",
            ]
            : []),
          "",
          "Begin by listing the repository root and inspecting the relevant existing files.",
          "Then implement the requested change using the available tools.",
        ].join("\n"),
      },
    ];

    let successfulToolCalls = 0;
    let consecutiveFailedToolCalls = 0;

    const toolSummaries: string[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await this.chat(messages, true);

      if (!response.message) {
        throw new Error("Ollama returned no message");
      }

      const assistantMessage = response.message;

      console.log(
        `[implement round ${round + 1}] assistant content:`,
        assistantMessage.content,
      );

      console.log(
        `[implement round ${round + 1}] tool calls:`,
        JSON.stringify(assistantMessage.tool_calls ?? []),
      );
      let toolCalls = assistantMessage.tool_calls ?? [];

      if (toolCalls.length === 0 && assistantMessage.content?.trim()) {
        const rawContent = assistantMessage.content.trim();

        try {
          const cleanedContent = rawContent
            .replace(/```(?:json)?/gi, "")
            .replace(/```/g, "")
            .trim();

          const parsedToolCalls: typeof toolCalls = [];
          const jsonObjects = cleanedContent.match(/\{[\s\S]*?\}(?=\s*\{|\s*$)/g) ?? [];

          for (const jsonObject of jsonObjects) {
            try {
              const parsed = JSON.parse(jsonObject);

              if (
                parsed &&
                typeof parsed === "object" &&
                typeof parsed.name === "string" &&
                parsed.arguments &&
                typeof parsed.arguments === "object"
              ) {
                parsedToolCalls.push({
                  function: {
                    name: parsed.name,
                    arguments: normalizeToolArguments(
                      parsed.arguments as Record<string, unknown>,
                    ),
                  },
                });

              }
            } catch {
              // Ignore malformed JSON fragments and continue parsing.
            }
          }

          if (parsedToolCalls.length > 0) {
            toolCalls = parsedToolCalls;
          }
        } catch {
          // The response was normal text rather than a JSON tool call.
        }
      }

      if (toolCalls.length === 0) {
        const content = assistantMessage.content?.trim();

        if (successfulToolCalls === 0) {
          throw new Error(
            `Agent made no workspace tool calls. Response: ${content || "(empty response)"}`,
          );
        }



        return [
          content || "Implementation tool loop finished.",
          "Workspace tool calls:",
          ...toolSummaries,
        ].join("\n");
      }

      messages.push({
        role: "assistant",
        content: assistantMessage.content ?? "",
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const name = toolCall.function.name;
        console.log(
          `[tool ${name}] arguments:`,
          JSON.stringify(toolCall.function.arguments ?? {}),
        );
        const allowedNames = [
          "listFiles",
          "readFile",
          "writeFile",
          "replaceInFile",
        ];

        if (!allowedNames.includes(name)) {
          consecutiveFailedToolCalls += 1;

          const errorMessage = `Unsupported workspace tool: ${name}`;
          messages.push({
            role: "user",
            content: `${errorMessage}. Use only the advertised workspace tools.`,
          });

          if (consecutiveFailedToolCalls >= 3) {
            throw new Error(errorMessage);
          }

          continue;
        }

        const call: WorkspaceToolCall = {
          name: name as WorkspaceToolCall["name"],
          arguments: normalizeToolArguments(
            toolCall.function.arguments ?? {},
          ),
        };

        let result: Awaited<ReturnType<typeof executeWorkspaceTool>>;

        const explicitRequestedPaths = [
          ...context.prompt.matchAll(
            /(?:file|path)\s+(?:named\s+|at\s+)?[`'"]([^`'"]+)[`'"]/gi,
          ),
        ]
          .map((match) => match[1])
          .filter((value): value is string => Boolean(value))
          .map((value) => value.replace(/\\/g, "/"));

        const taskDisallowsExistingFileChanges =
          /do not modify any existing files/i.test(context.prompt);

        if (
          taskDisallowsExistingFileChanges &&
          name === "replaceInFile" &&
          typeof call.arguments.relativePath === "string"
        ) {
          const targetPath = call.arguments.relativePath.replace(/\\/g, "/");

          if (!explicitRequestedPaths.includes(targetPath)) {
            result = {
              ok: false,
              error:
                `The task explicitly says not to modify existing files. ` +
                `You attempted to modify "${targetPath}", which is not the ` +
                "requested new file. Read existing files if needed, but do " +
                "not edit them. Use writeFile for the requested new file.",
            };
          } else {
            result = await executeWorkspaceTool(context.tools, call);
          }
        } else if (
          name === "runCommand" &&
          typeof call.arguments.command === "string" &&
          /^(?:npm|pnpm|yarn)\s+(?:install|i)(?:\s|$)/i.test(
            call.arguments.command.trim(),
          )
        ) {
          result = {
            ok: false,
            error:
              "Dependency installation is already handled by Forge. " +
              "Do not run npm install, npm i, pnpm install, pnpm i, " +
              "yarn install, or any other dependency installation command. " +
              "Continue by inspecting and implementing the requested task.",
          };
        } else if (name === "replaceInFile") {
          const relativePath = call.arguments.relativePath;

          if (typeof relativePath === "string") {
            let fileExists = true;

            try {
              await context.tools.readFile(relativePath);
            } catch {
              fileExists = false;
            }

            if (!fileExists) {
              const newText = call.arguments.newText;

              if (typeof newText === "string") {
                const writeResult = await executeWorkspaceTool(context.tools, {
                  name: "writeFile",
                  arguments: {
                    relativePath,
                    content: newText,
                  },
                });

                result = writeResult.ok
                  ? {
                    ok: true,
                    result:
                      `Created new file "${relativePath}" using writeFile because ` +
                      "the requested file did not exist. Do not call another file-editing " +
                      "tool for this file.",
                  }
                  : writeResult;
              } else {
                result = {
                  ok: false,
                  error:
                    `Cannot use replaceInFile because "${relativePath}" does not exist. ` +
                    "Use writeFile to create it with the complete file content.",
                };
              }
            } else {
              result = await executeWorkspaceTool(context.tools, call);
            }
          } else {
            result = await executeWorkspaceTool(context.tools, call);
          }
        } else {
          result = await executeWorkspaceTool(context.tools, call);
        }
        if (!result.ok) {
          consecutiveFailedToolCalls += 1;
          const errorMessage = result.error ?? "Unknown tool error";

          messages.push({
            role: "user",
            content: [
              `Tool ${name} failed: ${errorMessage}`,
              "Do not claim this operation succeeded.",
              name === "replaceInFile"
                ? errorMessage.includes("does not exist")
                  ? "The target file does not exist. Use writeFile to create it. Do not call replaceInFile again for this path."
                  : "Read the existing file again and copy the exact unique text before retrying."
                : name === "readFile"
                  ? errorMessage.includes("ENOENT") ||
                    errorMessage.includes("no such file or directory")
                    ? "The requested file does not exist yet. If this is the new file requested by the task, create it with writeFile using the complete file content. Do not call readFile again for the missing file."
                    : "Check the path and inspect the repository before retrying readFile."
                  : name === "writeFile"
                    ? "If the target exists, use replaceInFile instead."
                    : "Correct the arguments or choose an appropriate tool.",
            ].join("\n"),
          });

          if (consecutiveFailedToolCalls >= 3) {
            throw new Error(
              `Agent stopped after repeated tool failures. Last error: ${errorMessage}`,
            );
          }

          continue;
        }
        consecutiveFailedToolCalls = 0;
        successfulToolCalls += 1;



        toolSummaries.push(`${name}: succeeded`);
        if (name === "writeFile" || name === "replaceInFile") {
  return [
    "Implementation file edit completed.",
    "Workspace tool calls:",
    ...toolSummaries,
  ].join("\n");
}

        messages.push({
          role: "tool",
          content: JSON.stringify(result),
        });


      }
    }

    throw new Error(
      `Agent reached the ${MAX_TOOL_ROUNDS}-round limit before finishing implementation.`,
    );
  }
  private async chat(
    messages: OllamaMessage[],
    enableTools: boolean,
  ): Promise<OllamaResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      stream: false,
      messages,
      options: {
        temperature: 0.2,
      },
    };

    if (enableTools) {
      body.tools = [
        {
          type: "function",
          function: {
            name: "listFiles",
            description: "List repository files and directories.",
            parameters: {
              type: "object",
              properties: {
                relativePath: { type: "string", description: "Relative path; use '.' for the repository root." },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "readFile",
            description: "Read an existing UTF-8 file. Always do this before editing an existing file.",
            parameters: {
              type: "object",
              properties: {
                relativePath: { type: "string" },
              },
              required: ["relativePath"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "writeFile",
            description: "Create a new file only. Do not use this to overwrite an existing file.",
            parameters: {
              type: "object",
              properties: {
                relativePath: { type: "string" },
                content: { type: "string" },
              },
              required: ["relativePath", "content"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "replaceInFile",
            description: "Replace one exact, unique text block in an existing file. Copy oldText directly from readFile.",
            parameters: {
              type: "object",
              properties: {
                relativePath: { type: "string" },
                oldText: { type: "string" },
                newText: { type: "string" },
              },
              required: ["relativePath", "oldText", "newText"],
            },
          },
        },

      ];
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();

      throw new Error(
        `Ollama request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""
        }`,
      );
    }

    const data = (await res.json()) as OllamaResponse;

    if (data.error) {
      throw new Error(`Ollama error: ${data.error}`);
    }

    return data;
  }
}

function normalizeToolArguments(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, valueItem] of Object.entries(value)) {
    if (
      valueItem &&
      typeof valueItem === "object" &&
      "content" in valueItem &&
      typeof (valueItem as { content?: unknown }).content === "string"
    ) {
      normalized[key] = (valueItem as { content: string }).content;
    } else {
      normalized[key] = valueItem;
    }
  }

  return normalized;
}
