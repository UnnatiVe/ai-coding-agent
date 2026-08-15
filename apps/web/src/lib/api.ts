import type { TaskSummary } from "@aca/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function createTask(payload: {
  repoFullName: string;
  prompt: string;
  baseBranch?: string;
}): Promise<TaskSummary> {
  const res = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  const json = (await res.json()) as { task: TaskSummary };
  return json.task;
}

export interface ReadyResponse {
  status: string;
  redis: boolean;
  postgres: boolean;
}

/** A degraded readiness check answers 503 with a body: that body is the interesting part. */
export async function getReady(): Promise<ReadyResponse> {
  const res = await fetch(`${BASE}/api/health/ready`);
  if (!res.ok && res.status !== 503) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as ReadyResponse;
}
