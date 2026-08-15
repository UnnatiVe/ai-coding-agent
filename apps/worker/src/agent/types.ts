import type { TaskEventPayload } from "@aca/shared";

export type AgentStatus = "succeeded" | "failed";

export interface AgentRunContext {
  taskId: string;
  attempt: number;
  repoFullName: string;
  prompt: string;
  baseBranch: string;
  emit: (payload: TaskEventPayload) => Promise<void>;
}

export interface AgentStep {
  index: number;
  name: string;
  description: string;
}

export interface AgentStepResult {
  stepIndex: number;
  name: string;
  summary: string;
  ok: boolean;
}

export interface AgentRunResult {
  status: AgentStatus;
  summary: string;
  steps: AgentStepResult[];
}

export interface AgentProvider {
  plan(context: AgentRunContext): AgentStep[];
  executeStep(context: AgentRunContext, step: AgentStep): Promise<AgentStepResult>;
}
