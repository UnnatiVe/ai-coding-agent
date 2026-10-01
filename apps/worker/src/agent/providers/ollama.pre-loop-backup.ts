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

export class OllamaAgentProvider implements AgentProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OllamaProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.model = config.model ?? DEFAULT_OLLAMA_MODEL;
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
  ): Promise<string> {
    const messages: OllamaMessage[] = [
      {
        role: "system",
        content: [
          "You are Forge, a local autonomous coding agent.",
          "You are currently implementing a coding task.",
          "You are operating inside a controlled repository workspace.",
          "",
          "Available tools:",
          "- listFiles(relativePath): list files and directories.",
          "- readFile(relativePath): read a UTF-8 file.",
          "- writeFile(relativePath, content): create or overwrite a UTF-8 file.",
          "",
          "Always use relative paths.",
          "Never access paths outside the workspace.",
          "Use the workspace tools to perform the actual requested changes.",
          "Do not merely describe a change when you can perform it.",
          "After successfully performing the requested change, briefly report what you did.",
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
          "",
          "Implement the requested task now.",
        ].join("\n"),
      },
    ];

    const response = await this.chat(messages, true);

    if (!response.message) {
      throw new Error("Ollama returned no message");
    }

    const assistantMessage = response.message;

    let toolCalls = assistantMessage.tool_calls ?? [];

    if (toolCalls.length === 0 && assistantMessage.content?.trim()) {
      try {
        const parsed = JSON.parse(assistantMessage.content);

        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.name === "string" &&
          parsed.arguments &&
          typeof parsed.arguments === "object"
        ) {
          toolCalls = [
            {
              function: {
                name: parsed.name,
                arguments: normalizeToolArguments(parsed.arguments),
              },
            },
          ];
        }
      } catch {
        // Normal text response.
      }
    }

    if (toolCalls.length === 0) {
      return (
        assistantMessage.content?.trim() ||
        `completed ${step.name} for ${context.taskId}`
      );
    }

    const results: string[] = [];

    for (const toolCall of toolCalls) {
      const name = toolCall.function.name;

      if (
        name !== "listFiles" &&
        name !== "readFile" &&
        name !== "writeFile"
      ) {
        throw new Error(`Unsupported workspace tool: ${name}`);
      }

      const call: WorkspaceToolCall = {
        name,
        arguments: toolCall.function.arguments,
      };

      const toolResult = await executeWorkspaceTool(
        context.tools,
        call,
      );

      results.push(
        `${name}: ${JSON.stringify(toolResult)}`,
      );

      if (!toolResult.ok) {
        throw new Error(
          `${name} failed: ${toolResult.error ?? "unknown error"}`,
        );
      }
    }

    return results.join("\n");
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
        {
          type: "function",
          function: {
            name: "getScripts",
            description: "List available package scripts for validation.",
            parameters: {
              type: "object",
              properties: {},
            },
          },
        },
        {
          type: "function",
          function: {
            name: "runCommand",
            description: "Run an allowed project validation command, such as typecheck, test, lint, or build.",
            parameters: {
              type: "object",
              properties: {
                command: { type: "string" },
              },
              required: ["command"],
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
        `Ollama request failed: ${res.status} ${res.statusText}${
          text ? ` - ${text}` : ""
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

