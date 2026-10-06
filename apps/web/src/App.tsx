import { useEffect, useRef, useState } from "react";
import type { TaskEventEnvelope, TaskSummary } from "@aca/shared";
import {
  createTask,
  getJson,
  getReady,
  type ReadyResponse,
} from "./lib/api.js";

const BASE = import.meta.env.VITE_API_URL ?? "";

function isTaskStatusEvent(
  event: TaskEventEnvelope["event"],
): event is Extract<
  TaskEventEnvelope["event"],
  { type: "task.status" }
> {
  return event.type === "task.status";
}

function parseRepoFullName(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    return "";
  }

  const bare = trimmed
    .replace(/^https?:\/\//, "")
    .replace(/^git@github.com:/, "");

  const withoutGit = bare.replace(/\.git$/, "");

  const cleaned = withoutGit
    .replace(/^github\.com\//, "")
    .replace(/^\/+|\/+$/g, "");

  return cleaned;
}

function formatStatus(status: string): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "succeeded":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "running":
      return "status-running";
    case "succeeded":
      return "status-success";
    case "failed":
      return "status-failed";
    default:
      return "status-neutral";
  }
}

export function App() {
  const [ready, setReady] = useState<ReadyResponse | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TaskEventEnvelope[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    repoUrl: "",
    prompt: "",
    baseBranch: "main",
  });

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

    const source = new EventSource(
      `${BASE}/api/tasks/${taskId}/events?stream=1`,
    );

    eventSourceRef.current = source;

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as TaskEventEnvelope;

        setTimeline((current) => [...current, payload]);

        const taskEvent = payload.event;

        if (isTaskStatusEvent(taskEvent)) {
          setTasks((current) =>
            current.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    status: taskEvent.status,
                  }
                : task,
            ),
          );
        }
      } catch {
        // Ignore malformed stream payloads.
      }
    };

    source.onerror = () => {
      source.close();
      eventSourceRef.current = null;
    };
  };

  useEffect(() => {
    getReady()
      .then(setReady)
      .catch((e: unknown) => {
        setError(
          e instanceof Error
            ? e.message
            : String(e),
        );
      });

    void fetchTasks();

    return () => {
      stopStream();
    };
  }, []);

  useEffect(() => {
    if (!selectedTaskId) {
      setTimeline([]);
      stopStream();
      return;
    }

    const taskId = selectedTaskId;

    setTimeline([]);
    connectToTaskStream(taskId);

    return () => {
      stopStream();
    };
  }, [selectedTaskId]);

  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? null;

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setFormError(null);
    setCreating(true);

    const repoFullName = parseRepoFullName(form.repoUrl);

    if (!repoFullName || !repoFullName.includes("/")) {
      setFormError(
        "Enter a GitHub repository URL or owner/repository.",
      );
      setCreating(false);
      return;
    }

    if (!form.prompt.trim()) {
      setFormError("Describe what you want Forge to build.");
      setCreating(false);
      return;
    }

    try {
      const createdTask = await createTask({
        repoFullName,
        prompt: form.prompt.trim(),
        baseBranch: form.baseBranch.trim() || "main",
      });

      setTasks((current) => [
        createdTask,
        ...current,
      ]);

      setSelectedTaskId(createdTask.id);
      setTimeline([]);

      setForm({
        repoUrl: "",
        prompt: "",
        baseBranch: "main",
      });
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Task creation failed.",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F</div>

          <div>
            <div className="brand-name">Forge</div>
            <div className="brand-subtitle">
              AI Coding Agent
            </div>
          </div>
        </div>

        <button
          className="new-task-button"
          onClick={() => {
            setSelectedTaskId(null);
            setTimeline([]);
          }}
        >
          <span>+</span>
          New task
        </button>

        <div className="sidebar-section">
          <div className="sidebar-label">
            TASKS
          </div>

          <div className="task-list">
            {tasks.length === 0 ? (
              <div className="empty-sidebar">
                No tasks yet
              </div>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  className={`task-item ${
                    selectedTaskId === task.id
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setSelectedTaskId(task.id)
                  }
                >
                  <div className="task-item-title">
                    {task.repoFullName}
                  </div>

                  <div className="task-item-meta">
                    <span
                      className={`mini-status ${statusClass(
                        task.status,
                      )}`}
                    />

                    {formatStatus(task.status)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="connection">
            <span
              className={`connection-dot ${
                ready
                  ? "connected"
                  : "disconnected"
              }`}
            />

            <span>
              {ready
                ? "Local agent connected"
                : "Connecting..."}
            </span>
          </div>

          <div className="provider">
            Ollama · qwen2.5-coder
          </div>
        </div>
      </aside>

      {/* Main */}

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              LOCAL AI DEVELOPMENT
            </div>

            <h1>
              {selectedTask
                ? "Task details"
                : "Build with Forge"}
            </h1>
          </div>

          <div className="system-status">
            <span
              className={`system-dot ${
                ready
                  ? "connected"
                  : "disconnected"
              }`}
            />

            {ready
              ? "Ollama connected"
              : "Ollama unavailable"}
          </div>
        </header>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        {!selectedTask ? (
          <section className="workspace">
            <div className="hero">
              <div className="hero-badge">
                LOCAL · PRIVATE · OPEN SOURCE
              </div>

              <h2>
                Tell Forge what to build.
              </h2>

              <p>
                Give Forge a GitHub repository and a
                coding task. Forge will work inside an
                isolated workspace using your local
                Ollama model.
              </p>
            </div>

            <form
              className="task-form"
              onSubmit={handleSubmit}
            >
              <div className="form-section">
                <label>
                  Repository

                  <input
                    value={form.repoUrl}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        repoUrl:
                          event.target.value,
                      })
                    }
                    placeholder="https://github.com/owner/repository"
                  />
                </label>

                <label>
                  Base branch

                  <input
                    value={form.baseBranch}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        baseBranch:
                          event.target.value,
                      })
                    }
                    placeholder="main"
                  />
                </label>
              </div>

              <label>
                What should Forge do?

                <textarea
                  value={form.prompt}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      prompt:
                        event.target.value,
                    })
                  }
                  placeholder="Example: Add a dark mode toggle to the React dashboard and persist the user's preference."
                />
              </label>

              {formError && (
                <div className="form-error">
                  {formError}
                </div>
              )}

              <div className="form-actions">
                <div className="form-hint">
                  Forge will create an isolated task
                  workspace.
                </div>

                <button
                  type="submit"
                  disabled={creating}
                >
                  {creating
                    ? "Starting Forge..."
                    : "Run with Forge →"}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <section className="workspace">
            <div className="task-header-card">
              <div>
                <div className="repo-name">
                  {selectedTask.repoFullName}
                </div>

                <h2>
                  {selectedTask.prompt ??
                    "Coding task"}
                </h2>
              </div>

              <div
                className={`large-status ${statusClass(
                  selectedTask.status,
                )}`}
              >
                <span className="status-dot" />
                {formatStatus(
                  selectedTask.status,
                )}
              </div>
            </div>

            <div className="progress-card">
              <div className="section-title">
                Agent activity
              </div>

              {timeline.length === 0 ? (
                <div className="activity-empty">
                  Waiting for Forge to start...
                </div>
              ) : (
                <div className="timeline">
                  {timeline.map((item, index) => {
                    const event = item.event;

                    let title = "Agent activity";
                    let description = "";

                    if (event.type === "log") {
                      title = event.level === "error"
                        ? "Error"
                        : "Forge";
                      description = event.message;
                    } else if (
                      event.type === "step.start"
                    ) {
                      title = `Step ${event.stepIndex + 1}`;
                      description =
                        "Agent started a new step.";
                    } else if (
                      event.type === "task.status"
                    ) {
                      title = "Task status";
                      description =
                        `Task is now ${formatStatus(
                          event.status,
                        )}.`;
                    }

                    return (
                      <div
                        className="timeline-item"
                        key={`${item.seq}-${index}`}
                      >
                        <div className="timeline-line">
                          <div className="timeline-dot" />
                        </div>

                        <div className="timeline-content">
                          <div className="timeline-title">
                            {title}
                          </div>

                          <div className="timeline-description">
                            {description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="details-grid">
              <div className="detail-card">
                <div className="detail-label">
                  Repository
                </div>

                <div className="detail-value">
                  {selectedTask.repoFullName}
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-label">
                  Base branch
                </div>

                <div className="detail-value">
                  {selectedTask.baseBranch}
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-label">
                  Task ID
                </div>

                <div className="detail-value mono">
                  {selectedTask.id}
                </div>
              </div>
            </div>
          </section>
        )}
        <footer className="app-footer">
  © 2026 Forge · Built by Unnati Verma · All rights reserved.
</footer>
      </main>
    </div>
  );
}