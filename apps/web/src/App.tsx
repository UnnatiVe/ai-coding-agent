import { useEffect, useState } from "react";
import { getJson, type HealthResponse } from "./lib/api.js";

/**
 * Phase 1 shell: proves the browser -> Vite proxy -> Express path works.
 * The task form, run timeline and diff viewer arrive in later phases.
 */
export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<HealthResponse>("/api/health")
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main>
      <h1>AI Coding Agent</h1>
      <p className="muted">Phase 1 — monorepo scaffold. No agent yet.</p>

      <div className="card">
        <div className="status">
          API:{" "}
          {health ? (
            <span className="ok">ok (uptime {health.uptime.toFixed(1)}s)</span>
          ) : error ? (
            <span className="bad">unreachable — {error}</span>
          ) : (
            <span className="muted">checking…</span>
          )}
        </div>
      </div>
    </main>
  );
}
