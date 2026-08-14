# AI Coding Agent

A learning project: an AI agent that takes a software-engineering task, reads a GitHub
repository, edits code through controlled tools, runs tests in an isolated sandbox, and
iterates until the task is done — streaming its progress to a web UI.

> **Status: Phase 3 — live streaming.** Worker progress travels over Redis pub/sub and
> SSE into a live timeline in the browser, with replay and reconnection. The task
> pipeline still ends in `failed` on purpose: the LLM, the agent loop, the tool registry
> and the Docker sandbox are not implemented yet.

## Requirements

- Node.js >= 20
- pnpm 9 (`corepack enable` or `npm i -g pnpm@9`)
- Docker + Docker Compose (for Postgres and Redis)

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm infra:up        # postgres + redis
pnpm db:generate     # generate the Prisma client
pnpm db:migrate      # apply migrations to the dev database
pnpm dev             # api :3001, web :5173, worker (queue consumer)
```

Then open http://localhost:5173 — submit a task and watch its timeline stream in live.

### Database migrations

Prisma reads the root `.env` through `dotenv-cli`, so these work from anywhere in the repo:

| Command            | When                                                               |
| ------------------ | ------------------------------------------------------------------ |
| `pnpm db:generate` | After changing `schema.prisma`, to regenerate the typed client     |
| `pnpm db:migrate`  | Dev: create and apply a migration                                  |
| `pnpm db:deploy`   | CI/production: apply committed migrations, never generate new ones |
| `pnpm db:reset`    | Drop the dev database and replay every migration from scratch      |
| `pnpm db:studio`   | Browse the data in Prisma Studio                                   |

Migrations live in `packages/db/prisma/migrations` and are committed.

### Verifying the queue

```bash
curl localhost:3001/api/health/ready       # {"status":"ready","redis":true,"postgres":true}
curl -X POST localhost:3001/api/dev/ping   # smoke job; worker logs "ping job processed"
pnpm queue:ping                            # same job, from the CLI

curl -X POST localhost:3001/api/tasks -H 'content-type: application/json' \
  -d '{"repoFullName":"owner/repo","prompt":"Add a health check endpoint"}'
curl localhost:3001/api/tasks/<id>         # queued -> running -> failed (no agent yet)
curl localhost:3001/api/tasks/<id>/events  # durable event log, ?after=<seq> to resume
curl -N localhost:3001/api/tasks/<id>/stream            # live SSE timeline
curl -N -H 'Last-Event-ID: 4' .../stream                # resume after seq 4

pnpm lint && pnpm typecheck && pnpm build
```

## Data model

| Model        | Why it exists                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`       | Owns tasks. Carries `githubId`/`login` so the Phase 5 OAuth session slots in without a schema change.                                             |
| `Repository` | Cached repo metadata (owner, default branch, GitHub App `installationId`) so a task references a row, not a raw string.                           |
| `Task`       | One user request and its lifecycle (`queued → running → succeeded/failed/cancelled`), plus the BullMQ `jobId` and the resulting branch/PR.        |
| `TaskEvent`  | Append-only progress log with a per-task `seq`. Written **before** publishing to Redis, so a reconnecting browser can replay from `?after=<seq>`. |
| `AgentRun`   | One attempt at a task. Separating it from `Task` makes retries, model choice and token/cost accounting natural.                                   |
| `ToolCall`   | Audit trail of every tool the agent invokes (args, result, duration) — needed for debugging and for the Phase 11 security review.                 |

## Streaming

Progress reaches the browser over Redis pub/sub and Server-Sent Events:

- The worker persists each `TaskEvent` and then `PUBLISH`es it to `task:<taskId>`.
- The API holds **one** Redis subscriber connection for the whole process
  (`apps/api/src/events/hub.ts`) and fans each channel out to the SSE responses watching
  that task — one Redis `SUBSCRIBE` per task, not per browser tab.
- `GET /api/tasks/:id/stream` subscribes _first_, then replays persisted events from the
  resume point, buffering anything that arrives in between; every write is filtered by
  `seq`, so no gap and no duplicate.
- The resume point is the `Last-Event-ID` header (EventSource sends it automatically on
  reconnect) or `?after=<seq>`. A `: ping` comment every 15s keeps proxies from closing
  an idle stream, and a terminal status ends the stream with `event: done` so the browser
  stops reconnecting to a finished task.

SSE rather than WebSockets: this traffic is one-way, EventSource gives reconnection and
event ids for free, and it is plain HTTP — no second protocol to proxy, authenticate or
scale.

## Queue

One BullMQ queue, `agent-tasks`, backed by Redis:

- The API is a **producer** only. `POST /api/tasks` writes the `Task` row first, then adds
  a `task.run` job with the deterministic id `task-<taskId>`, so a double submit is a no-op.
- The worker is the **consumer**. It routes by job name (`task.run`, `test.ping`), runs
  `WORKER_CONCURRENCY` jobs in parallel and retries with exponential backoff.
- Progress is written to `TaskEvent` and published to the Redis channel `task:<taskId>`;
  Phase 3 turns that channel into the SSE stream.

## Workspace layout

```
ai-coding-agent/
├─ apps/
│  ├─ web/       React + Vite frontend (task UI, run timeline, log stream)
│  ├─ api/       Express REST API + SSE hub; enqueues tasks, never runs them
│  └─ worker/    BullMQ consumer; will host the agent loop and sandbox
├─ packages/
│  ├─ shared/    Zod schemas + types shared by all three apps (events, contracts)
│  └─ db/        Prisma schema, migrations and the shared PrismaClient
├─ docker-compose.yml   Postgres 16 + Redis 7
├─ eslint.config.js     Flat ESLint config (TS + Prettier)
└─ tsconfig.base.json   Strict TS options every package extends
```

### What each workspace is for

| Workspace         | Purpose                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | The only thing the user touches. Submits tasks, renders the run timeline, live logs and diffs. Talks to the API over REST and (from Phase 3) SSE. Vite proxies `/api` to the backend in dev.                                            |
| `apps/api`        | Thin HTTP layer: validates requests, persists tasks, pushes jobs onto the queue, and relays task events to browsers over SSE. Deliberately holds **no** agent logic — an HTTP request must never block on a multi-minute run.           |
| `apps/worker`     | Where the agent actually lives. A separate process (and later a separate container with Docker socket access) that consumes queue jobs, drives the LLM loop, executes tools inside the sandbox, and publishes progress events to Redis. |
| `packages/shared` | One source of truth for cross-process contracts: the task-event union, request schemas, job payloads, queue and channel names. Zod gives runtime validation and static types from a single definition.                                  |
| `packages/db`     | Prisma schema plus a singleton client, so API and worker read/write the same models without duplicating setup.                                                                                                                          |

## Architecture (Phase 2 slice)

```
browser (web:5173)
   │ REST /api/*        (Vite dev proxy)
   ▼
api (:3001) ──enqueue task.run──► Redis / BullMQ ──job──► worker
   │                                 ▲                      │
   └── SSE /stream ◄────────────────┴── task:<id> pub/sub ──┤
   │                                                         │
   └──► Postgres (User, Repository, Task, TaskEvent,  ◄──────┘
        AgentRun, ToolCall)
```

The eventual full flow: the API validates the request, persists a `Task` and enqueues
`task.run`. The worker picks the job up, marks the task `running` and opens an `AgentRun`;
from Phase 7 it drives the LLM loop, where each step records a `ToolCall`, executes it in
the sandbox and emits a `TaskEvent` that the API relays to the browser. The run finishes
by setting the terminal status, branch and PR URL.

## Scripts

| Command                                         | Description                                          |
| ----------------------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                                      | Runs web, api and worker in parallel with hot reload |
| `pnpm build`                                    | Builds every workspace                               |
| `pnpm typecheck`                                | Type-checks every workspace                          |
| `pnpm lint`                                     | ESLint across the repo (zero warnings allowed)       |
| `pnpm format`                                   | Prettier write                                       |
| `pnpm infra:up` / `infra:down`                  | Start/stop Postgres and Redis                        |
| `pnpm db:generate` / `db:migrate` / `db:deploy` | Prisma client and migrations                         |
| `pnpm queue:ping`                               | Enqueue a smoke job for the worker                   |

## Environment

All apps read the single root `.env` (see `.env.example`). Only `VITE_*` variables are
exposed to the browser. `.env` is git-ignored; never commit real credentials.

## Roadmap

| Phase | Content                                                               |
| ----- | --------------------------------------------------------------------- |
| 1     | Monorepo scaffold, TS/lint config, Postgres + Redis, health checks ✅ |
| 2     | Data model + queue wiring: `POST /api/tasks` → job → worker ✅        |
| 3     | Event streaming end to end (Redis pub/sub → SSE → live timeline) ✅   |
| 4     | Docker sandbox: per-run container, resource limits, filesystem jail   |
| 5     | GitHub App: OAuth, installation tokens, clone, branch management      |
| 6     | Tool registry (read-only tools) with zod-validated arguments          |
| 7     | Agent loop v1 with step/token budgets                                 |
| 8     | Mutation tools and diff review UI                                     |
| 9     | Test execution and the error-recovery loop                            |
| 10    | Commit, push, and pull-request creation behind human approval         |
| 11    | Hardening: prompt-injection defences, secret redaction, audit log     |
| 12    | Evaluation on a fixed task set, polish, docs                          |
