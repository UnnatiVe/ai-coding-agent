# Forge — AI-Powered Coding Agent

Forge ek AI-powered coding agent hai jo natural-language software tasks ko code changes aur GitHub pull requests me badalta hai. Yeh ek web interface aur API ko ek asynchronous worker se jodta hai, jo local hosted LLM, controlled file-editing tools aur automated verification ka upyog karta hai.

> **Project Status:** Working prototype. Frontend aur API deployed hain; agent worker local Ollama inference ka use karta hai aur tasks process karne ke liye ise developer ki machine par chalna zaroori hai.

## 🌐 Live Demo

- **Frontend:** [https://ai-coding-agent-green.vercel.app](https://ai-coding-agent-green.vercel.app)
- **API:** [https://ai-coding-agent-msqz.onrender.com](https://ai-coding-agent-msqz.onrender.com)
- **Source Code:** [https://github.com/UnnatiVe/ai-coding-agent](https://github.com/UnnatiVe/ai-coding-agent)

## ✨ Key Features

- **Natural Language Input:** Web interface ke jariye natural language me coding tasks submit karein.
- **GitHub Integration:** GitHub repository ko connect karein aur tasks ko asynchronously process karein.
- **Local LLM Inference:** Local aur zero-inference-cost model execution ke liye Ollama ke jariye **Qwen 2.5 Coder 3B** ka upyog karein.
- **Controlled Agent Interface:** Agent ko char tools ka access milta hai:
  - `listFiles` — Repository files ko inspect karne ke liye.
  - `readFile` — File ke contents ko read karne ke liye.
  - `writeFile` — Nayi files create karne ke liye.
  - `replaceInFile` — Targeted edits (badlav) karne ke liye.
- **Automated Verification:** Changes ko validate karne ke liye TypeScript type-checking jaise automated checks chalayein.
- **Task Tracking:** Application ke jariye task progress aur results ko track karein.
- **Automated PR Generation:** Kam poora hone par Git branch banayein aur GitHub pull request generate karein.

## 🛠️ Tech Stack

| Area | Technologies |
|---|---|
| **Frontend** | React, TypeScript, Vite |
| **Backend** | Node.js, Express, REST APIs |
| **Database** | PostgreSQL, Prisma, Neon |
| **Queue** | Redis, BullMQ, Upstash |
| **AI** | Ollama, Qwen 2.5 Coder 3B |
| **GitHub Integration** | GitHub API, branches aur pull requests |
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

API incoming requests aur task persistence ko sambhalti hai. BullMQ background jobs ko manage karta hai, jabki worker repository operations aur AI-assisted code changes ko perform karta hai. Local worker inference ke liye Ollama ke sath communicate karta hai.

## 🚀 Run Locally

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop (local PostgreSQL aur Redis ke liye, agar hosted services use nahi kar rahe hain)
- Ollama
- Application ke liye zaroori GitHub credentials/configuration

### Setup

1. **Repository ko clone karein aur dependencies install karein:**
   ```bash
   git clone https://github.com.git
   cd ai-coding-agent
   pnpm install
   ```

2. **Environment Variables:**
   Root me `.env.example` ka use karke ek `.env` file banayein aur zaroori database, Redis, GitHub aur application variables configure karein.

3. **AI Model pull karein:**
   Worker dwara use kiye jaane wale model ko pull karein:
   ```bash
   ollama pull qwen2.5-coder:3b
   ```

4. **Infrastructure start karein (Local Docker use karne par):**
   ```bash
   pnpm infra:up
   ```

5. **Database setup karein:**
   Prisma client generate karein aur database migrations apply karein:
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

6. **Application start karein:**
   ```bash
   pnpm dev
   ```
   Ab local web application ko `http://localhost:5173` par open karein.

> ⚠️ **Worker Availability:** Deployed frontend aur API local Ollama worker ko running nahi rakhte hain. AI tasks ko execute karne ke liye, worker ko host karne wali machine ka on hona, connected hona aur Ollama aur worker process ka chalna zaroori hai.

## 💻 Useful Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Web app, API, aur worker ko ek sath chalane ke liye |
| `pnpm build` | Workspaces ko build karne ke liye |
| `pnpm typecheck` | Workspaces ki type-check karne ke liye |
| `pnpm lint` | ESLint chalane ke liye |
| `pnpm infra:up` | Local PostgreSQL aur Redis ko start karne ke liye |
| `pnpm infra:down` | Local infrastructure ko stop karne ke liye |
| `pnpm db:generate` | Prisma client generate karne ke liye |
| `pnpm db:migrate` | Development migrations apply karne ke liye |

## 🔒 Security & Project Scope

Forge ek learning aur portfolio project hai, yeh production-ready multi-user coding platform nahi hai. Pull requests ko merge karne se pehle generate kiye gaye changes ko dhyan se review karein, aur aisi repositories ka use na karein jisme sensitive credentials ya data ho. Apne secrets ko hamesha environment variables me rakhein; kabhi bhi asli `.env` file ko commit na karein.

## ✍️ Author

**Unnati Verma**  
[GitHub](https://github.com)
```


