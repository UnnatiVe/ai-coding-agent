import type { AgentProvider, AgentRunContext, AgentStep, AgentStepResult } from "../types.js";

const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:3b";

export interface OllamaProviderConfig {
  baseUrl: string;
  model?: string;
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
      { index: 0, name: "plan", description: "Plan the work required for this task." },
      { index: 1, name: "review", description: "Review the repository and task requirements." },
      { index: 2, name: "validate", description: "Validate the deterministic result before completion." },
    ];
  }

async executeStep(
  context: AgentRunContext,
  step: AgentStep,
): Promise<AgentStepResult> {
  const systemMessage = [
    "You are the local coding agent running inside a controlled task workspace.",
    "You can inspect and modify files only through the workspace tools provided by the application.",
    "Available tools:",
    "- listFiles(relativePath): list files and directories inside the workspace.",
    "- readFile(relativePath): read a UTF-8 file inside the workspace.",
    "- writeFile(relativePath, content): write a UTF-8 file inside the workspace.",
    "Never access paths outside the workspace.",
    "Do not claim that files were modified, committed, pushed, or that a PR was created unless the application explicitly confirms it.",
    "For this phase, reason about the task and report the actions that should be taken.",
  ].join(" ");

  const userMessage = [
    `Repository: ${context.repoFullName}`,
    `Base branch: ${context.baseBranch}`,
    `Prompt: ${context.prompt}`,
    `Current step name: ${step.name}`,
    `Current step description: ${step.description}`,
    `Workspace root: ${context.workspace.rootPath}`,
    "Workspace tools are available to the application for controlled file operations.",
    "Provide a short textual result for this step and keep it analysis-only.",
  ].join("\n");

  try {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage },
        ],
        options: { temperature: 0.2 },
      }),
    });

    if (!res.ok) {
      const text = await res.text();

      return {
        stepIndex: step.index,
        name: step.name,
        summary: `Ollama request failed for ${step.name}: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
        ok: false,
      };
    }

    const data = (await res.json()) as {
      message?: { content?: string };
      error?: string;
    };

    if (data.error) {
      return {
        stepIndex: step.index,
        name: step.name,
        summary: `Ollama request failed for ${step.name}: ${data.error}`,
        ok: false,
      };
    }

    const summary =
      data.message?.content?.trim() ||
      `completed ${step.name} for ${context.taskId}`;

    return {
      stepIndex: step.index,
      name: step.name,
      summary,
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
}
