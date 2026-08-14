# AI Coding Agent

A learning project: an AI agent that takes a software-engineering task, reads a GitHub
repository, edits code through controlled tools, runs tests in an isolated sandbox, and
iterates until the task is done — streaming its progress to a web UI.

> **Status: Phase 1 — monorepo scaffold.** Infrastructure, typed contracts and a running
> dev loop only. The LLM, the agent loop, the tool registry and the Docker sandbox are
> not implemented yet.

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
pnpm db:push         # create tables (dev only; migrations come later)
pnpm dev             # api :3001, web :5173, worker (queue consumer)
```

Then open http://localhost:5173 — the page reports the API health status.

Useful checks:

```bash
curl localhost:3001/api/health         # { "status": "ok", ... }
curl localhost:3001/api/health/ready   # deep check, includes Redis
pnpm lint && pnpm typecheck && pnpm build
```

## Workspace layout

```
ai-coding-agent/
├─ apps/
│  ├─ web/       React + Vite frontend (task UI, run timeline, log stream)
│  ├─ api/       Express REST API + SSE hub; enqueues runs, never runs them
│  └─ worker/    BullMQ consumer; will host the agent loop and sandbox
├─ packages/
│  ├─ shared/    Zod schemas + types shared by all three apps (events, contracts)
│  └─ db/        Prisma schema and the shared PrismaClient
├─ docker-compose.yml   Postgres 16 + Redis 7
├─ eslint.config.js     Flat ESLint config (TS + Prettier)
└─ tsconfig.base.json   Strict TS options every package extends
```

### What each workspace is for

| Workspace         | Purpose                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | The only thing the user touches. Submits tasks, renders the run timeline, live logs and diffs. Talks to the API over REST and (from Phase 3) SSE. Vite proxies `/api` to the backend in dev.                                            |
| `apps/api`        | Thin HTTP layer: validates requests, persists runs, pushes jobs onto the queue, and relays run events to browsers over SSE. Deliberately holds **no** agent logic — an HTTP request must never block on a multi-minute run.             |
| `apps/worker`     | Where the agent actually lives. A separate process (and later a separate container with Docker socket access) that consumes queue jobs, drives the LLM loop, executes tools inside the sandbox, and publishes progress events to Redis. |
| `packages/shared` | One source of truth for cross-process contracts: the `RunEvent` union, request schemas, queue name, channel naming. Zod gives runtime validation and static types from a single definition.                                             |
| `packages/db`     | Prisma schema plus a singleton client, so API and worker read/write the same models without duplicating setup.                                                                                                                          |

## Architecture (Phase 1 slice)

```
browser (web:5173)
   │ REST /api/*        (Vite dev proxy)
   ▼
api (:3001) ──enqueue──► Redis / BullMQ ──job──► worker
   │                        ▲                      │
   └── SSE (Phase 3) ◄──────┴── run events ────────┘
   │
   └──► Postgres (runs, run events)  ◄── worker
```

## Scripts

| Command                                                     | Description                                          |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                                                  | Runs web, api and worker in parallel with hot reload |
| `pnpm build`                                                | Builds every workspace                               |
| `pnpm typecheck`                                            | Type-checks every workspace                          |
| `pnpm lint`                                                 | ESLint across the repo (zero warnings allowed)       |
| `pnpm format`                                               | Prettier write                                       |
| `pnpm infra:up` / `infra:down`                              | Start/stop Postgres and Redis                        |
| `pnpm db:generate` / `db:push` / `--filter @aca/db migrate` | Prisma client, dev schema sync, migrations           |

## Environment

All apps read the single root `.env` (see `.env.example`). Only `VITE_*` variables are
exposed to the browser. `.env` is git-ignored; never commit real credentials.

## Roadmap

| Phase | Content                                                               |
| ----- | --------------------------------------------------------------------- |
| 1     | Monorepo scaffold, TS/lint config, Postgres + Redis, health checks ✅ |
| 2     | Data model + queue wiring: real `POST /api/runs` → job → worker       |
| 3     | Event streaming end to end (Redis pub/sub → SSE → live timeline)      |
| 4     | Docker sandbox: per-run container, resource limits, filesystem jail   |
| 5     | GitHub App: OAuth, installation tokens, clone, branch management      |
| 6     | Tool registry (read-only tools) with zod-validated arguments          |
| 7     | Agent loop v1 with step/token budgets                                 |
| 8     | Mutation tools and diff review UI                                     |
| 9     | Test execution and the error-recovery loop                            |
| 10    | Commit, push, and pull-request creation behind human approval         |
| 11    | Hardening: prompt-injection defences, secret redaction, audit log     |
| 12    | Evaluation on a fixed task set, polish, docs                          |
