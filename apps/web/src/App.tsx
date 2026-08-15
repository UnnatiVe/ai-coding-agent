import { useEffect, useRef, useState } from "react";
import type { TaskEventEnvelope, TaskSummary } from "@aca/shared";
import { createTask, getJson, getReady, type ReadyResponse } from "./lib/api.js";

const BASE = import.meta.env.VITE_API_URL ?? "";

function isTaskStatusEvent(event: TaskEventEnvelope["event"]): event is Extract<TaskEventEnvelope["event"], { type: "task.status" }> {
  return event.type === "task.status";
}

function parseRepoFullName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const bare = trimmed.replace(/^https?:\/\//, "").replace(/^git@github.com:/, "");
  const withoutGit = bare.replace(/\.git$/, "");
  const cleaned = withoutGit.replace(/^github\.com\//, "").replace(/^\/+|\/+$/g, "");

  if (/^[\w.-]+\/[\w.-]+$/.test(cleaned)) {
    return cleaned;
  }

  return cleaned;
}

export function App() {
  const [ready, setReady] = useState<ReadyResponse | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TaskEventEnvelope[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ repoUrl: "https://github.com/owner/repo", prompt: "", baseBranch: "main" });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchTasks = async () => {
    try {
      const list = await getJson<{ tasks: TaskSummary[] }>("/api/tasks");
      setTasks(list.tasks);
      if (!selectedTaskId && list.tasks[0]) {
        setSelectedTaskId(list.tasks[0].id);
      }
    } catch {
      setTasks([]);
    }
  };

  const stopStream = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  };

  const connectToTaskStream = (taskId: string) => {
    stopStream();
    const source = new EventSource(`${BASE}/api/tasks/${taskId}/events?stream=1`);
    eventSourceRef.current = source;

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as TaskEventEnvelope;
        setTimeline((current) => [...current, payload]);

        const taskEvent = payload.event;
        if (isTaskStatusEvent(taskEvent)) {
          setTasks((current) =>
            current.map((task) =>
              task.id === taskId ? { ...task, status: taskEvent.status } : task,
            ),
          );
          setSelectedTaskId(taskId);
        }
      } catch {
        // Ignore malformed stream payloads; the server writes valid JSON envelopes.
      }
    };

    source.onerror = () => {
      source.close();
      eventSourceRef.current = null;
    };
  };

  useEffect(() => {
    // Independent requests: a degraded dependency must not blank out the task list.
    getReady()
      .then(setReady)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    void fetchTasks();

    return () => {
      stopStream();
    };
  }, []);

  useEffect(() => {
    const task = tasks.find((item) => item.id === selectedTaskId) ?? null;
    if (!task) {
      setTimeline([]);
      return;
    }

    void getJson<{ events: Array<{ seq: number; payload: TaskEventEnvelope["event"] }> }>(
      `/api/tasks/${task.id}/events?after=-1`,
    )
      .then((payload) => {
        setTimeline(
          payload.events.map((item) => ({
            taskId: task.id,
            seq: item.seq,
            at: new Date().toISOString(),
            event: item.payload,
          })),
        );
      })
      .catch(() => setTimeline([]));

    connectToTaskStream(task.id);
  }, [selectedTaskId, tasks]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setCreating(true);

    const repoFullName = parseRepoFullName(form.repoUrl);
    if (!repoFullName || !repoFullName.includes("/")) {
      setFormError("Repository URL must be a GitHub URL or owner/repo value.");
      setCreating(false);
      return;
    }

    if (!form.prompt.trim()) {
      setFormError("A prompt is required.");
      setCreating(false);
      return;
    }

    try {
      const createdTask = await createTask({
        repoFullName,
        prompt: form.prompt.trim(),
        baseBranch: form.baseBranch.trim() || "main",
      });

      setTasks((current) => [createdTask, ...current]);
      setSelectedTaskId(createdTask.id);
      setTimeline([]);
      setForm({ repoUrl: "https://github.com/owner/repo", prompt: "", baseBranch: "main" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Task creation failed.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main>
      <h1>AI Coding Agent</h1>
      <p className="muted">Phase 3 — live task lifecycle simulation. No agent yet.</p>

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
        <h2>New task</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Repository URL
            <input
              type="text"
              value={form.repoUrl}
              onChange={(event) => setForm((current) => ({ ...current, repoUrl: event.target.value }))}
              placeholder="https://github.com/owner/repo"
            />
          </label>

          <label>
            Prompt
            <textarea
              value={form.prompt}
              onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
              placeholder="Describe the task to simulate"
              rows={4}
            />
          </label>

          <label>
            Base branch
            <input
              type="text"
              value={form.baseBranch}
              onChange={(event) => setForm((current) => ({ ...current, baseBranch: event.target.value }))}
              placeholder="main"
            />
          </label>

          <button type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create task"}
          </button>
          {formError ? <p className="bad">{formError}</p> : null}
        </form>
      </div>

      <div className="card">
        <div className="status">Tasks ({tasks.length})</div>
        {tasks.length === 0 ? (
          <p className="muted">No tasks yet.</p>
        ) : (
          <ul>
            {tasks.map((task) => (
              <li key={task.id} className={task.id === selectedTaskId ? "status active" : "status"}>
                <button type="button" onClick={() => setSelectedTaskId(task.id)}>
                  <span className="muted">{task.repoFullName}</span> — {task.status}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedTask ? (
        <div className="card">
          <h2>Task details</h2>
          <p>
            <strong>{selectedTask.repoFullName}</strong>
          </p>
          <p>{selectedTask.prompt}</p>
          <p>Status: {selectedTask.status}</p>
          <p>Branch: {selectedTask.baseBranch}</p>

          <h3>Live timeline</h3>
          {timeline.length === 0 ? <p className="muted">Waiting for task events…</p> : (
            <ul>
              {timeline.map((event) => (
                <li key={`${event.taskId}:${event.seq}`}>
                  <span className="muted">{event.seq}</span> — {event.event.type === "task.status"
                    ? `status: ${event.event.status}`
                    : event.event.type === "log"
                      ? event.event.message
                      : `${event.event.type}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </main>
  );
}
