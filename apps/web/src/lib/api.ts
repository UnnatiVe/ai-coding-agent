const BASE = import.meta.env.VITE_API_URL ?? "";

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
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
  const res = await fetch(`${BASE}/api/health/ready`);
  if (!res.ok && res.status !== 503) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as ReadyResponse;
}
