const BASE = import.meta.env.VITE_API_URL ?? "";

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export interface HealthResponse {
  status: string;
  service: string;
  uptime: number;
}
