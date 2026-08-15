import type { AgentProvider, AgentRunContext, AgentRunResult, AgentStepResult } from "./types.js";

export class AgentRunner {
  constructor(private readonly provider: AgentProvider) {}

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const steps = this.provider.plan(context);
    const results: AgentStepResult[] = [];

    for (const step of steps) {
      await context.emit({ type: "step.start", stepIndex: step.index });
      const result = await this.provider.executeStep(context, step);
      results.push(result);

      await context.emit({
        type: "log",
        level: result.ok ? "info" : "error",
        message: result.ok ? `${step.name}: ${result.summary}` : `${step.name} failed: ${result.summary}`,
      });
    }

    const failed = results.find((result) => !result.ok);
    return {
      status: failed ? "failed" : "succeeded",
      summary: failed ? failed.summary : "agent loop completed successfully",
      steps: results,
    };
  }
}
