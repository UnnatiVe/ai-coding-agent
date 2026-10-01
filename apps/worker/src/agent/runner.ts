import type {

  AgentStep,
  AgentProvider,
  AgentRunContext,
  AgentRunResult,
  AgentStepResult,
} from "./types.js";

const MAX_REPAIR_ATTEMPTS = 2;

export class AgentRunner {
  constructor(
    private readonly provider: AgentProvider,
  ) {}

  async run(
    context: AgentRunContext,
  ): Promise<AgentRunResult> {
    const steps = this.provider.plan(context);
    const results: AgentStepResult[] = [];

    let implementationStep: AgentStep | undefined;
    let validateStep: AgentStep | undefined;

    for (const step of steps) {
      if (step.name === "implement") {
        implementationStep = step;
      }

      if (step.name === "validate") {
        validateStep = step;
      }
    }

    for (const step of steps) {
      await context.emit({
        type: "step.start",
        stepIndex: step.index,
      });

      const result =
        await this.provider.executeStep(
          context,
          step,
        );

      results.push(result);

      await context.emit({
        type: "log",
        level: result.ok ? "info" : "error",
        message: result.ok
          ? `${step.name}: ${result.summary}`
          : `${step.name} failed: ${result.summary}`,
      });

      if (!result.ok) {
        return {
          status: "failed",
          summary: result.summary,
          steps: results,
        };
      }

      if (
        step.name === "validate" &&
        implementationStep &&
        validateStep
      ) {
        let repairAttempts = 0;

        while (repairAttempts < MAX_REPAIR_ATTEMPTS) {
          repairAttempts += 1;

          await context.emit({
            type: "log",
            level: "info",
            message:
              `Validation passed. No repair needed.`,
          });

          break;
        }
      }
    }

    const failed = results.find(
      (result) => !result.ok,
    );

    return {
      status: failed
        ? "failed"
        : "succeeded",
      summary: failed
        ? failed.summary
        : "agent loop completed successfully",
      steps: results,
    };
  }
}