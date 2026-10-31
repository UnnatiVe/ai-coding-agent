import type { AgentProvider, AgentRunContext, AgentStep, AgentStepResult } from "../types.js";
import { executeWorkspaceTool, type WorkspaceToolCall } from "../../workspace/tool-executor.js";
import { checkRequestedPath } from "./path-guard.js";
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

function extractRequestedEditPaths(prompt: string): string[] {
  const paths: string[] = [];

  const pattern =
    /\b(?:create|add|write|generate)\s+(?:only\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|([a-zA-Z0-9_.-]+(?:[\\/][a-zA-Z0-9_.-]+)*\.[a-zA-Z0-9]+))/gi;

  for (const match of prompt.matchAll(pattern)) {
    const rawCandidate = match[1] ?? match[2] ?? match[3] ?? match[4];

    if (!rawCandidate) {
      continue;
    }

    const candidate = rawCandidate.trim().replace(/\\/g, "/");

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

export class OllamaAgentProvider implements AgentProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OllamaProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.model = config.model ?? DEFAULT_OLLAMA_MODEL;
  }

  async repair(context: AgentRunContext, feedback: string): Promise<AgentStepResult> {
    try {
      const diffBeforeRepair = await context.git.diff();

      const result = await this.runImplementStep(
        context,
        {
          index: 1,
          name: "implement",
          description: [
            "Repair the existing implementation based on verifier feedback.",
            "Inspect the actual current file before editing.",
            `Verifier feedback: ${feedback}`,
            "Make only the minimal change needed to satisfy the verifier.",
            "Use readFile and replaceInFile for the existing file.",
            "Do not use writeFile during repair.",
            "Do not add unrelated functionality.",
          ].join("\n"),
        },
        feedback,
      );

      const diffAfterRepair = await context.git.diff();
      if (diffAfterRepair === diffBeforeRepair) {
        return {
          stepIndex: 1,
          name: "repair",
          summary: "Repair did not produce any Git changes. " + `Agent output: ${result}`,
          ok: false,
        };
      }

      return {
        stepIndex: 1,
        name: "repair",
        summary: result,
        ok: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "local Ollama repair request failed";

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

  async executeStep(context: AgentRunContext, step: AgentStep): Promise<AgentStepResult> {
    try {
      const result = await this.runOllamaStep(context, step);

      return {
        stepIndex: step.index,
        name: step.name,
        summary: result,
        ok: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "local Ollama request failed";

      return {
        stepIndex: step.index,
        name: step.name,
        summary: `Ollama request failed for ${step.name}: ${message}`,
        ok: false,
      };
    }
  }

  private async runOllamaStep(context: AgentRunContext, step: AgentStep): Promise<string> {
    if (step.name !== "implement") {
      return this.runTextStep(context, step);
    }

    return this.runImplementStep(context, step);
  }

  private async runTextStep(context: AgentRunContext, step: AgentStep): Promise<string> {
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
    const MAX_TOOL_ROUNDS = 8;

    const messages: OllamaMessage[] = [
      {
        role: "system",
        content: [
          "You are Forge, a local autonomous coding agent working in a controlled repository.",
          "Inspect the actual repository before changing files. Never invent filenames, paths, APIs, or file contents.",
          "Available workspace tools are ONLY listFiles, readFile, writeFile, and replaceInFile. Never call mkdir, createDirectory, runCommand, or any tool not explicitly available.",
          "Use listFiles to discover paths and readFile to inspect existing files.",
          "When the task explicitly says to create a new file at a specified path, do not call readFile on that target path. Check the parent directory with listFiles at most once if needed, then call writeFile with the exact requested relative path and complete file content.",
          "Never finish implementation after only listing or reading files. A file-creation task is not complete until writeFile succeeds for the requested file. After a successful edit, stop and let Forge run automatic validation. Never call mkdir.",
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
const requestedEditPaths = extractRequestedEditPaths(context.prompt);


const successfulEditPaths = new Set<string>();
let allowRepairEdits = false;
for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
  const allRequestedFilesEdited =
    requestedEditPaths.length > 0 &&
    requestedEditPaths.every((path) => successfulEditPaths.has(path));


 if (allRequestedFilesEdited && !allowRepairEdits) {

    const scripts = await context.tools.getScripts();
    const validationCommand = selectValidationCommand(scripts);

    if (!validationCommand) {
      return [
        "All explicitly requested files were edited successfully.",
        "No supported validation script was found.",
        "Workspace tool calls:",
        ...toolSummaries,
      ].join("\n");
    }

    const validationResult = await executeWorkspaceTool(context.tools, {
      name: "runCommand",
      arguments: { command: validationCommand },
    });

    if (validationResult.ok) {
      toolSummaries.push(
        `Automatic validation passed: ${validationCommand}`,
      );

      return [
        "Implementation and validation completed successfully.",
        "Workspace tool calls:",
        ...toolSummaries,
      ].join("\n");
    }
  allowRepairEdits = true;

    messages.push({
      role: "user",
      content: [
        `Automatic validation failed: ${validationCommand}`,
        validationResult.error ?? "Unknown validation error",
        "Inspect the error and repair the actual problem.",
        "Do not run validation yourself.",
      ].join("\n"),
    });
  }

  const response = await this.chat(messages, true);

      if (!response.message) {
        throw new Error("Ollama returned no message");
      }

      const assistantMessage = response.message;

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
                    arguments: normalizeToolArguments(parsed.arguments as Record<string, unknown>),
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

const allRequestedFilesEdited =
  requestedEditPaths.length > 0 &&
  requestedEditPaths.every((path) => successfulEditPaths.has(path));

if (requestedEditPaths.length > 0 && !allRequestedFilesEdited) {
  throw new Error(
    `Agent stopped before editing all requested files. Missing: ${
      requestedEditPaths
        .filter((path) => !successfulEditPaths.has(path))
        .join(", ")
    }`,
  );
}

if (requestedEditPaths.length > 0 && allowRepairEdits) {
  throw new Error(
    "Automatic validation failed and the agent stopped without completing a repair.",
  );
}

        const scripts = await context.tools.getScripts();
        const validationCommand = selectValidationCommand(scripts);

        if (!validationCommand) {
          return [
            content || "Implementation tool loop finished.",
            "No supported validation script was found.",
            "Workspace tool calls:",
            ...toolSummaries,
          ].join("\n");
        }

        const validationResult = await executeWorkspaceTool(context.tools, {
          name: "runCommand",
          arguments: { command: validationCommand },
        });
        if (validationResult.ok) {
          toolSummaries.push(
            `Automatic validation passed: ${validationCommand}`,
          );

          return [
            content || "Implementation and validation completed successfully.",
            "Workspace tool calls:",
            ...toolSummaries,
          ].join("\n");
        }
        allowRepairEdits = true;
        messages.push({
          role: "assistant",
          content: assistantMessage.content ?? "",
        });

        messages.push({
          role: "user",
          content: [
            `Automatic validation failed: ${validationCommand}`,
            validationResult.error ?? "Unknown validation error",
            "Inspect the error and repair the actual problem.",
            "Do not run validation yourself.",
            "Do not claim the task is complete until validation passes.",
          ].join("\n"),
        });


        continue;
      }

      messages.push({
        role: "assistant",
        content: assistantMessage.content ?? "",
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const name = toolCall.function.name;

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

        const relativePath = call.arguments.relativePath;
        const isFileEdit =
          name === "writeFile" || name === "replaceInFile";

        const pathGuardResult =
          isFileEdit && typeof relativePath === "string"
            ? checkRequestedPath(context.prompt, relativePath)
            : { allowed: true as const };

        const normalizedEditPath =
          typeof relativePath === "string"
            ? relativePath.split("\\").join("/")
            : "";

       if (
  isFileEdit &&
  normalizedEditPath &&
  successfulEditPaths.has(normalizedEditPath) &&
  !allowRepairEdits
) {
          result = {
            ok: false,
            error:
              `File "${normalizedEditPath}" was already edited successfully. ` +
              "Do not repeat the same edit. Work on any other requested files.",
          };
        } else if (!pathGuardResult.allowed) {
          result = {
            ok: false,
            error:
              pathGuardResult.error ??
              "The task does not permit editing this file.",
          };
        } else {
          result = await executeWorkspaceTool(context.tools, call);
        }
        if (!result.ok) {
          consecutiveFailedToolCalls += 1;

          const errorMessage =
            result.error ?? "Unknown workspace tool error";

          messages.push({
            role: "tool",
            content: JSON.stringify(result),
          });

          messages.push({
            role: "user",
            content: [
              `Tool ${name} failed: ${errorMessage}`,
              "Do not repeat the same failed operation.",
              name === "replaceInFile"
                ? errorMessage.includes("does not exist")
                  ? "If the requested new file does not exist, create it with writeFile using complete content."
                  : "Read the existing file and copy the exact unique text before retrying."
                : name === "readFile"
                  ? "Check the path and inspect the repository before retrying."
                  : name === "writeFile"
                    ? "If the target already exists, use replaceInFile instead."
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
if (isFileEdit) {
  consecutiveFailedToolCalls = 0;
}

successfulToolCalls += 1;

       if (isFileEdit && normalizedEditPath) {
  successfulEditPaths.add(normalizedEditPath);
  allowRepairEdits = false;

}
        toolSummaries.push(`${name}: succeeded`);

        messages.push({
          role: "tool",
          content: JSON.stringify(result),
        });
      }
    }

    throw new Error(
      [
        `Agent reached the ${MAX_TOOL_ROUNDS}-round limit before finishing implementation.`,
        "Successful workspace tool calls:",
        ...(toolSummaries.length > 0 ? toolSummaries : ["No successful tool calls recorded."]),
        `Successful tool call count: ${successfulToolCalls}`,
        `Requested edit paths: ${requestedEditPaths.join(", ") || "none"}`,
        `Successful edit paths: ${[...successfulEditPaths].join(", ") || "none"}`,
      ].join("\n"),
    );

  }
  private async chat(messages: OllamaMessage[], enableTools: boolean): Promise<OllamaResponse> {
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
                relativePath: {
                  type: "string",
                  description: "Relative path; use '.' for the repository root.",
                },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "readFile",
            description:
              "Read an existing UTF-8 file. Always do this before editing an existing file.",
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
            description:
              "Replace one exact, unique text block in an existing file. Copy oldText directly from readFile.",
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
        `Ollama request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      );
    }

    const data = (await res.json()) as OllamaResponse;

    if (data.error) {
      throw new Error(`Ollama error: ${data.error}`);
    }

    return data;
  }
}

function normalizeToolArguments(value: Record<string, unknown>): Record<string, unknown> {
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
