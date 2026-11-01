# Forge — AI-Powered Coding Agent

Forge is an AI-powered coding agent that turns natural-language software tasks into code changes and GitHub pull requests. It connects a web interface and API to an asynchronous worker that uses a locally hosted LLM, controlled file-editing tools, and automated verification.

> **Project Status:** Working prototype. The frontend and API are deployed; the agent worker uses local Ollama inference and must be running on the developer's machine to process tasks.

## 🌐 Live Demo

- **Frontend:** [https://ai-coding-agent-green.vercel.app](https://ai-coding-agent-green.vercel.app)
- **API:** [https://ai-coding-agent-msqz.onrender.com](https://ai-coding-agent-msqz.onrender.com)
- **Source Code:** [https://github.com/UnnatiVe/ai-coding-agent](https://github.com/UnnatiVe/ai-coding-agent)

## ✨ Key Features

- **Natural Language Input:** Submit coding tasks in natural language through a web interface.
- **GitHub Integration:** Connect a GitHub repository and process tasks asynchronously.
- **Local LLM Inference:** Use **Qwen 2.5 Coder 3B** through **Ollama** for local, zero-inference-cost model execution.
- **Controlled Agent Interface:** Give the agent access to a four-tool interface:
  - `listFiles` — Inspect repository files.
  - `readFile` — Read file contents.
  - `writeFile` — Create new files.
  - `replaceInFile` — Make targeted edits.
- **Automated Verification:** Run automated checks such as TypeScript type-checking to validate changes.
- **Task Tracking:** Track task progress and results through the application.
- **Automated PR Generation:** Create a Git branch and generate a GitHub pull request for completed work.

## 🛠️ Tech Stack

| Area | Technologies |
|---|---|
| **Frontend** | React, TypeScript, Vite |
| **Backend** | Node.js, Express, REST APIs |
| **Database** | PostgreSQL, Prisma, Neon |
| **Queue** | Redis, BullMQ, Upstash |
| **AI** | Ollama, Qwen 2.5 Coder 3B |
| **GitHub Integration** | GitHub API, branches, and pull requests |
| **Deployment** | Vercel (frontend), Render (API) |

## 📐 Architecture

```text
Web UI (Vercel)
     |
     | REST API
     v
API (Render) --------> PostgreSQL (Neon)
     |
     | enqueue task
     v
Redis / BullMQ (Upstash)
     |
     | consume task
     v
Local Worker
     |
     +----> Ollama / Qwen 2.5 Coder 3B
     |
     +----> Repository tools and verification
     |
     +----> Git branch / commit / pull request
```

The API handles incoming requests and task persistence. BullMQ manages background jobs, while the worker performs repository operations and AI-assisted code changes. The local worker communicates with Ollama for inference.

## 🚀 Run Locally

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop (for local PostgreSQL and Redis, if not using hosted services)
- Ollama
- GitHub credentials/configuration required by the application

### Setup

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com
   cd ai-coding-agent
   pnpm install
   ```

2. **Environment Variables:**
   Create a root `.env` file using `.env.example` and configure the required database, Redis, GitHub, and application variables.

3. **Pull the AI Model:**
   Pull the model used by the worker:
   ```bash
   ollama pull qwen2.5-coder:3b
   ```

4. **Start local infrastructure (if using Docker setup):**
   ```bash
   pnpm infra:up
   ```

5. **Set up the Database:**
   Generate the Prisma client and apply database migrations:
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

6. **Start the Application:**
   ```bash
   pnpm dev
   ```
   Open the local web application at `http://localhost:5173`.

> ⚠️ **Worker Availability:** The deployed frontend and API do not keep the local Ollama worker running. For AI tasks to execute, the machine hosting the worker must be turned on, connected, and actively running Ollama along with the worker process.

## 💻 Useful Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Run the web app, API, and worker concurrently |
| `pnpm build` | Build the workspaces |
| `pnpm typecheck` | Type-check the workspaces |
| `pnpm lint` | Run ESLint |
| `pnpm infra:up` | Start local PostgreSQL and Redis infrastructure |
| `pnpm infra:down` | Stop local infrastructure |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Apply development migrations |

## 🔒 Security & Project Scope

Forge is a learning and portfolio project; it is not a production-ready, multi-user coding platform. Review all generated changes thoroughly before merging pull requests, and do not connect repositories containing sensitive data or active credentials. Always keep your secrets inside environment variables and never commit your real `.env` file.

## ✍️ Author

**Unnati Verma**  
[GitHub](https://github.com/UnnatiVe)



