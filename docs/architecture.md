# O-cina Architecture

## Overview

O-cina is an expanded terminal multiplexer for AI coding agents. A local FastAPI
backend owns agent processes, their PTYs, workflows and memory; a React frontend
renders the pane multiplexer, node view and management pages on top of the API.

## Components

- **Backend** — FastAPI + SQLAlchemy 2 + Alembic on SQLite
  - `routers/terminal.py` — PTY hub: one PTY per agent, shared by every
    WebSocket client (panes, agent page) and by GUI prompt injection
  - `engine/process_manager.py` — sandboxed spawn (own session, scrubbed env,
    `RLIMIT_*` limits), logs, metrics
  - `engine/workflow_engine.py` + `engine/guardrails.py` — DAG execution with
    loop detection, timeouts, approval gates and token/cost budgets
  - `engine/discovery.py` — detects installed harnesses
  - `adapters/` — harness adapters (Hermes built in); unknown harnesses get a
    login shell in their PTY
  - `memory_store.py` / `memory_context.py` — ChromaDB project memory, injected
    into prompts as `<memory_bank>` context
  - `routers/events.py` — SSE event stream
- **Frontend** — React 18 + Vite + Tailwind + Redux Toolkit + xterm.js
  - `components/panes/` — multiplexer UI and the layout canvas
  - `lib/terminalLayout.js` — n-ary split tree, layout solver (tree → pixel
    rects), push-through resize, dock/swap
  - `lib/commands.jsx` + `components/CommandPalette.jsx` — ⌘K registry
  - `pages/dashboard/` — node view (force layout, depth model, line HUD)
- **Optional** — Redis + Celery (heartbeat reaper, periodic jobs)

## Directories

- `backend/` — FastAPI app, models, routers, adapters, engine, migrations, tests
- `frontend/` — React app
- `cli/` — `o-cina` command-line client
- `e2e/` — Playwright tests
- `proto/` — agent protocol notes
- `scripts/` — start / stop / migrate

## Ports

- Backend API: 8002 (`OC_PORT`)
- Frontend dev: 3001
- Redis: 6379

## On-demand

No background daemons. Start with `./run` (backend) and `npm run dev`
(frontend); stop with Ctrl+C or `scripts/stop.sh`.
