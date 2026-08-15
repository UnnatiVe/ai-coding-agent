import type { AgentProvider, AgentRunContext, AgentStep, AgentStepResult } from "../types.js";

export class StubAgentProvider implements AgentProvider {
  plan(_context: AgentRunContext): AgentStep[] {
    return [
      { index: 0, name: "plan", description: "Plan the work required for this task." },
      { index: 1, name: "review", description: "Review the repository and task requirements." },
      { index: 2, name: "validate", description: "Validate the deterministic result before completion." },
    ];
  }

  async executeStep(context: AgentRunContext, step: AgentStep): Promise<AgentStepResult> {
    const summaryByStep: Record<string, string> = {
      plan: `planned a deterministic workflow for ${context.repoFullName} on ${context.baseBranch}`,
      review: `reviewed task requirements for "${context.prompt.slice(0, 96)}${context.prompt.length > 96 ? "…" : ""}"`,
      validate: `validated the task result for ${context.taskId} and confirmed the workflow is complete`,
    };

    const summary = summaryByStep[step.name] ?? `completed ${step.name} for ${context.taskId}`;

    return {
      stepIndex: step.index,
      name: step.name,
      summary,
      ok: true,
    };
  }
}
