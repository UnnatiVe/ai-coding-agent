import type { TaskEventEnvelope } from "@aca/shared";
import type { StreamState } from "../lib/useTaskStream.js";

const STREAM_LABEL: Record<StreamState, string> = {
  idle: "no task selected",
  connecting: "connecting…",
  live: "live",
  reconnecting: "reconnecting…",
  done: "stream closed (task finished)",
  error: "disconnected",
};

function describe(envelope: TaskEventEnvelope): string {
  const { event } = envelope;
  switch (event.type) {
    case "task.status":
      return `status → ${event.status}`;
    case "log":
      return `[${event.level}] ${event.message}`;
    case "step.start":
      return `step ${event.stepIndex}`;
    case "llm.delta":
      return event.text;
    case "tool.call":
      return `tool ${event.name}(${JSON.stringify(event.args)})`;
    case "tool.stdout":
      return event.chunk;
    case "tool.result":
      return `tool ${event.id} ${event.ok ? "ok" : "failed"} — ${event.summary}`;
    case "diff":
      return `diff ${event.path}`;
    case "usage":
      return `${event.inputTokens} in / ${event.outputTokens} out ($${event.usd.toFixed(4)})`;
    case "error":
      return `error: ${event.message}`;
  }
}

export function TaskTimeline({
  events,
  state,
}: {
  events: TaskEventEnvelope[];
  state: StreamState;
}) {
  return (
    <div className="card">
      <div className="status">
        Timeline <span className={`stream stream-${state}`}>{STREAM_LABEL[state]}</span>
      </div>
      {events.length === 0 ? (
        <p className="muted">No events yet.</p>
      ) : (
        <ol className="timeline">
          {events.map((envelope) => (
            <li key={envelope.seq} className="status">
              <span className="muted">#{envelope.seq}</span>{" "}
              <span className={`kind kind-${envelope.event.type.replace(".", "-")}`}>
                {envelope.event.type}
              </span>{" "}
              {describe(envelope)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
