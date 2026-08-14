import type { CreateTaskRequest, TaskSummary } from "@aca/shared";

export const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export interface ReadyResponse {
  status: string;
  redis: boolean;
  postgres: boolean;
}

/** A degraded readiness check answers 503 with a body: that body is the interesting part. */
export async function getReady(): Promise<ReadyResponse> {
  const res = await fetch(`${API_BASE}/api/health/ready`);
  if (!res.ok && res.status !== 503) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as ReadyResponse;
}

export async function listTasks(): Promise<TaskSummary[]> {
  const { tasks } = await getJson<{ tasks: TaskSummary[] }>("/api/tasks");
  return tasks;
}

export async function getTask(id: string): Promise<TaskSummary> {
  const { task } = await getJson<{ task: TaskSummary }>(`/api/tasks/${id}`);
  return task;
}

export async function createTask(input: CreateTaskRequest): Promise<TaskSummary> {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const { task } = (await res.json()) as { task: TaskSummary };
  return task;
}
