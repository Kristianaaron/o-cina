# O-cina (Open Officina) — Agent Command Center

Visual orchestration layer for heterogeneous AI agents. Framework-agnostic. MIT licensed.

**Phases 0–3 complete.** Backend operational with workflow engine, guardrails, semantic memory, and session management.

## Architecture

```
Frontend (React + Vite) → Backend (FastAPI) → Agents (Hermes, Pi, Claude Code, Codex, custom)
                  ↕
              Redis + Celery (task queue)
              ChromaDB (semantic memory)
              SQLite (structured data)
```

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- Redis (optional for task queue)

### Backend

```bash
cd backend
python -m venv ../.venv
source ../.venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8002
```

### Frontend

```bash
cd frontend
npm install
npm run dev  # dev server on :3001
# or
npx vite build  # production build → dist/
```

### Or just run

```bash
# Project includes startup scripts
chmod +x run
./run
```

## API

Docs at `http://localhost:8002/docs` (Swagger UI) when server is running.

Key endpoints:
- `GET /health` — Health check
- `GET /api/v1/agents` — List agents
- `POST /api/v1/agents/register` — Register new agent
- `POST /api/v1/workflows` — Create workflow DAG
- `POST /api/v1/workflows/{id}/execute` — Run workflow
- `GET /api/v1/projects` — List projects
- `POST /api/v1/projects/{id}/memories/search` — Semantic search
- `GET /api/v1/sessions/{id}/messages` — Session messages

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

## Project Structure

```
backend/
  app/
    engine/       # Workflow engine, guardrails, process manager
    routers/      # FastAPI routers (agents, workflows, projects, memory, sessions)
    models.py     # SQLAlchemy models
    schemas.py    # Pydantic schemas
    memory_store.py  # ChromaDB integration
  alembic/        # Migrations
  tests/          # Backend tests

frontend/
  src/
    api/          # API clients
    pages/        # Page components
    components/   # Shared components
    lib/          # Redux store, utilities
  e2e/            # Playwright E2E tests

.env.example      # Environment config template
README.md         # This file
```

## Testing

```bash
# Backend
cd backend
pytest tests/ -v --cov=app

# Frontend
cd frontend
npx vitest run --config vite.config.test.js

# E2E (requires running backend)
npx playwright test e2e/
```

## Phases Completed

- **Phase 0** — Foundation: Skeleton, data model, API, CI/CD
- **Phase 1** — Registry & Lifecycle: Process mgmt, adapters, discovery, TTL
- **Phase 2** — Workflow Builder: DAG engine, guardrails, message routing
- **Phase 3** — Projects & Memory: Workspace, semantic search, sessions
- **Phase 4** — Polish & Launch: Tests, CI, error handling, production config

## License

MIT
