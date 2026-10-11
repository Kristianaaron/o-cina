# O-cina (Open Officina) — Agent Command Center

Visual orchestration layer for heterogeneous AI agents. Framework-agnostic. MIT licensed.

Works on **macOS and Linux**.

**Panes** is the built-in terminal multiplexer: named workspaces, fluid resizable agent PTYs (dividers push neighbours, panes glide when the layout changes), and attention rings on agents that need you. Open it from the command-center toggle or `/?view=panes`.

| Keys | Action |
|------|--------|
| `⌘K` / `Ctrl+K` | Command palette (everywhere) |
| `⌥D` / `⌥⇧D` | Split right / down |
| `⌥W` | Close pane |
| `⌥Z` | Zoom / restore pane |
| `⌥⇧←→↑↓` | Push the focused pane's border |
| `⌥=` | Even out pane sizes (or double-click a divider) |
| Drag a pane header | Dock it beside another pane, or drop in the middle to swap |
| `⌥]` / `⌥[` | Next / previous pane |
| `⌥N`, `⌥1–9` | New / switch workspace |

## Architecture

```
Frontend (React + Vite) → Backend (FastAPI) → Agents (Hermes, Claude Code, Codex, custom)
                  ↕
              Redis + Celery (task queue, optional)
              ChromaDB (local semantic memory under ~/.o-cina)
              SQLite (structured data under ~/.o-cina)
```

## Quick Start

### Prerequisites

- Python 3.11+ (3.12 recommended)
- Node.js 20+
- Redis (optional — needed for Celery heartbeat/reaper tasks)

### One-command backend

```bash
chmod +x run scripts/*.sh
./run
```

This creates `.venv`, installs backend deps, migrates the DB, and starts the API on `http://127.0.0.1:8002`.

### Manual backend

```bash
cd backend
python3 -m venv ../.venv
source ../.venv/bin/activate
pip install -r requirements.txt
../scripts/migrate.sh
python -m uvicorn app.main:app --host 127.0.0.1 --port 8002
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3001 — proxies /api and /health to :8002
```

Production build (served by FastAPI under `/static`):

```bash
cd frontend && npm run build
# copy dist → backend/static if you want the backend to serve the UI
```

### Optional Docker infra

```bash
docker compose up -d redis          # Redis only
docker compose --profile full up -d # Redis + Celery worker (+ optional Chroma image)
```

> The backend uses a **local** Chroma PersistentClient at `~/.o-cina/data/chroma` by default. The Compose `chromadb` service is optional and not wired into the API yet.

## Data directories (macOS + Linux)

| Path | Purpose |
|------|---------|
| `~/.o-cina/data/center.db` | SQLite database |
| `~/.o-cina/data/chroma` | ChromaDB collections |
| `~/.o-cina/logs` | Agent process logs |

Override with `DATABASE_URL`, `CHROMA_PERSIST_DIR`, `OCINA_LOG_DIR`.

## Ports

| Service | Default |
|---------|---------|
| Backend API | `8002` (`OC_PORT` / `BACKEND_PORT`) |
| Frontend Vite | `3001` |
| Redis | `6379` |

## API

Docs at `http://localhost:8002/docs` when the server is running.

Key endpoints:

- `GET /health` — Health check
- `GET /api/v1/agents` — List agents
- `POST /api/v1/agents/register` — Register new agent
- `POST /api/v1/workflows` — Create workflow DAG
- `POST /api/v1/workflows/{id}/execute` — Run workflow
- `GET /api/v1/projects` — List projects
- `POST /api/v1/projects/{id}/memories/search` — Semantic search
- `GET /api/v1/events` — SSE event stream

## Auth note

`app/auth.py` provides API-key helpers, but routes are open by default for local development. Do **not** bind the API to `0.0.0.0` on an untrusted network without enabling auth.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy 2.0, Alembic |
| Queue | Redis + Celery |
| Vector Store | ChromaDB (all-MiniLM-L6-v2 embeddings) |
| Frontend | React 18, Vite, Tailwind CSS |
| Workflow Graph | @xyflow/react |
| Frontend State | Redux Toolkit |
| Tests | pytest (backend), Vitest + RTL (frontend), Playwright (E2E) |

## Testing

```bash
# Backend
source .venv/bin/activate
cd backend && pytest tests/ -v

# Frontend
cd frontend && npm test
```

## CLI

```bash
pip install -e .
o-cina --help
# or
./bin/o-cina --help
```

## Project Structure

```
backend/
  app/
    engine/       # Workflow engine, guardrails, process manager
    routers/      # FastAPI routers
    adapters/     # Harness adapters (Hermes, …)
    models.py     # SQLAlchemy models
    schemas.py    # Pydantic schemas
    memory_store.py
  alembic/        # Migrations
  tests/
frontend/
  src/
    api/
    pages/
    components/
e2e/              # Playwright E2E tests
scripts/          # start / stop / migrate
run               # bootstrap + start
```
