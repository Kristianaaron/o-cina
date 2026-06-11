# O-cina Architecture

## Overview
Multi-agent orchestration platform for managing AI coding agents, building workflows,
and monitoring execution.

## Components
- **Backend**: FastAPI + SQLAlchemy + SQLite
- **Frontend**: React + Vite + Tailwind + @xyflow/react + Redux Toolkit
- **Message Broker**: Redis (via Docker)
- **Task Queue**: Celery (via Docker)
- **Semantic Search**: ChromaDB (via Docker)

## Directories
- backend/ — FastAPI app, models, routers, adapters, engine
- frontend/ — React app, components, pages, store
- proto/ — Protocol specs
- docs/ — Architecture, API, adapter guides
- scripts/ — start.sh, stop.sh, migrate.sh
- sandbox/ — Isolated execution environment

## Ports
- Backend API: 8000
- Frontend dev: 3000
- Redis: 6379
- ChromaDB: 8001

## On-demand
No background daemons. Services started via scripts, stopped with Ctrl+C or stop.sh.
