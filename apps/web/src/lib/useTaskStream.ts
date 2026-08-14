import { useEffect, useRef, useState } from "react";
import { taskEventEnvelopeSchema, type TaskEventEnvelope } from "@aca/shared";
import { API_BASE } from "./api.js";

export type StreamState = "idle" | "connecting" | "live" | "reconnecting" | "done" | "error";

interface TaskStream {
  events: TaskEventEnvelope[];
  state: StreamState;
}

/**
 * Subscribes to `/api/tasks/:id/stream`.
 *
 * EventSource reconnects on its own and replays `Last-Event-ID`, so recovery is
 * the browser's job; this hook only tracks the resume point (in case the server
 * restarts and the connection is rebuilt from scratch), drops duplicate `seq`
 * values, and closes the stream on the server's explicit `done` event so a
 * finished task is not retried forever.
 */
export function useTaskStream(taskId: string | null): TaskStream {
  const [events, setEvents] = useState<TaskEventEnvelope[]>([]);
  const [state, setState] = useState<StreamState>("idle");
  const lastSeq = useRef(-1);

  useEffect(() => {
    if (!taskId) {
      setEvents([]);
      setState("idle");
      return;
    }

    lastSeq.current = -1;
    setEvents([]);
    setState("connecting");

    const source = new EventSource(`${API_BASE}/api/tasks/${taskId}/stream`);

    source.onopen = () => setState("live");

    source.onmessage = (message: MessageEvent<string>) => {
      const parsed = taskEventEnvelopeSchema.safeParse(JSON.parse(message.data));
      if (!parsed.success || parsed.data.seq <= lastSeq.current) return;
      lastSeq.current = parsed.data.seq;
      setEvents((current) => [...current, parsed.data]);
    };

    source.addEventListener("done", () => {
      source.close();
      setState("done");
    });

    source.onerror = () => {
      // readyState CLOSED means EventSource gave up; CONNECTING means it is
      // already backing off and will retry with Last-Event-ID.
      setState(source.readyState === EventSource.CLOSED ? "error" : "reconnecting");
    };

    return () => source.close();
  }, [taskId]);

  return { events, state };
}
