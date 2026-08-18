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

  async executeStep(context: AgentRunContext, step: AgentStep): Promise<AgentStepResult> {
    const systemMessage = [
      "This is an analysis-only phase of an AI coding agent.",
      "Do not claim that files were modified, committed, pushed, or that a PR was created.",
      "This step is limited to reasoning and reporting only.",
      "Respond with a concise summary for the current step.",
    ].join(" ");

    const userMessage = [
      `Repository: ${context.repoFullName}`,
      `Base branch: ${context.baseBranch}`,
      `Prompt: ${context.prompt}`,
      `Current step name: ${step.name}`,
      `Current step description: ${step.description}`,
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

      const summary = data.message?.content?.trim() || `completed ${step.name} for ${context.taskId}`;

      return {
        stepIndex: step.index,
        name: step.name,
        summary,
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
}
