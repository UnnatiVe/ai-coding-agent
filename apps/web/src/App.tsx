import { useEffect, useState } from "react";
import type { TaskSummary } from "@aca/shared";
import { getJson, getReady, type ReadyResponse } from "./lib/api.js";

/**
 * Phase 2 shell: proves browser -> Vite proxy -> Express -> Postgres/Redis.
 * The task form, live timeline and diff viewer arrive in later phases.
 */
export function App() {
  const [ready, setReady] = useState<ReadyResponse | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Independent requests: a degraded dependency must not blank out the task list.
    getReady()
      .then(setReady)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    getJson<{ tasks: TaskSummary[] }>("/api/tasks")
      .then((list) => setTasks(list.tasks))
      .catch(() => setTasks([]));
  }, []);

  return (
    <main>
      <h1>AI Coding Agent</h1>
      <p className="muted">Phase 2 — database and queue infrastructure. No agent yet.</p>

      <div className="card">
        <div className="status">
          {ready ? (
            <>
              API: <span className="ok">{ready.status}</span> · Postgres:{" "}
              <span className={ready.postgres ? "ok" : "bad"}>{String(ready.postgres)}</span> ·
              Redis: <span className={ready.redis ? "ok" : "bad"}>{String(ready.redis)}</span>
            </>
          ) : error ? (
            <span className="bad">API unreachable — {error}</span>
          ) : (
            <span className="muted">checking…</span>
          )}
        </div>
      </div>

      <div className="card">
        <div className="status">Tasks ({tasks.length})</div>
        {tasks.length === 0 ? (
          <p className="muted">No tasks yet.</p>
        ) : (
          <ul>
            {tasks.map((task) => (
              <li key={task.id} className="status">
                <span className="muted">{task.repoFullName}</span> — {task.status}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
