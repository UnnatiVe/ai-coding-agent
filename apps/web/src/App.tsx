import { useCallback, useEffect, useState } from "react";
import type { TaskSummary } from "@aca/shared";
import { createTask, getReady, listTasks, type ReadyResponse } from "./lib/api.js";
import { useTaskStream } from "./lib/useTaskStream.js";
import { TaskTimeline } from "./components/TaskTimeline.js";

const DEFAULT_REPO = "UnnatiVe/ai-coding-agent";

/**
 * Phase 3 shell: submit a task, then watch it progress live over SSE.
 * The diff viewer and PR review UI arrive with the agent loop.
 */
export function App() {
  const [ready, setReady] = useState<ReadyResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repoFullName, setRepoFullName] = useState(DEFAULT_REPO);
  const [prompt, setPrompt] = useState("Add a health check endpoint to the API");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { events, state } = useTaskStream(selectedId);

  const refreshTasks = useCallback(() => {
    listTasks()
      .then(setTasks)
      .catch(() => setTasks([]));
  }, []);

  useEffect(() => {
    // Independent requests: a degraded dependency must not blank out the task list.
    getReady()
      .then(setReady)
      .catch((e: unknown) => setHealthError(e instanceof Error ? e.message : String(e)));
    refreshTasks();
  }, [refreshTasks]);

  // The list holds terminal state, so refresh it once the stream reports the end.
  useEffect(() => {
    if (state === "done") refreshTasks();
  }, [state, refreshTasks]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const task = await createTask({ repoFullName, prompt, baseBranch: "main" });
      setSelectedId(task.id);
      setTasks((current) => [task, ...current]);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>AI Coding Agent</h1>
      <p className="muted">Phase 3 — live task timeline over Redis pub/sub and SSE.</p>

      <div className="card">
        <div className="status">
          {ready ? (
            <>
              API: <span className="ok">{ready.status}</span> · Postgres:{" "}
              <span className={ready.postgres ? "ok" : "bad"}>{String(ready.postgres)}</span> ·
              Redis: <span className={ready.redis ? "ok" : "bad"}>{String(ready.redis)}</span>
            </>
          ) : healthError ? (
            <span className="bad">API unreachable — {healthError}</span>
          ) : (
            <span className="muted">checking…</span>
          )}
        </div>
      </div>

      <form className="card" onSubmit={submit}>
        <label htmlFor="repo">Repository</label>
        <input
          id="repo"
          value={repoFullName}
          onChange={(e) => setRepoFullName(e.target.value)}
          placeholder="owner/repo"
        />
        <label htmlFor="prompt">Task</label>
        <textarea
          id="prompt"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the change you want"
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Run task"}
        </button>
        {submitError && <p className="bad status">{submitError}</p>}
      </form>

      <div className="card">
        <div className="status">Tasks ({tasks.length})</div>
        {tasks.length === 0 ? (
          <p className="muted">No tasks yet.</p>
        ) : (
          <ul className="tasks">
            {tasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  className={`task ${task.id === selectedId ? "selected" : ""}`}
                  onClick={() => setSelectedId(task.id)}
                >
                  <span className="muted">{task.repoFullName}</span> ·{" "}
                  <span className={task.status === "failed" ? "bad" : "ok"}>{task.status}</span> ·{" "}
                  {task.prompt}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TaskTimeline events={events} state={state} />
    </main>
  );
}
