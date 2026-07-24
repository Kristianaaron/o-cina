# O-cina Codebase Fixes

## Round 2 — Mac/Linux hardening (Jul 2026)

Critical and high-priority fixes for cross-platform boot and functional correctness:

### P0 — Boot / cross-platform
- Removed hardcoded `/home/kristianaaron/...` paths from `alembic.ini` and `scripts/migrate.sh`
- Unified data dirs under `~/.o-cina/{data,logs,chroma}` (was split across `~/o-cina` and Linux home)
- Aligned default port to **8002** (`OC_PORT` / `BACKEND_PORT` / `O_CINA_PORT`)
- Added missing `./run` bootstrap script (Python 3.11+ detection; prefers 3.12)
- Process manager: `start_new_session=True`, Homebrew PATH, macOS-safe RLIMIT skip, fixed `from_pid()` recovery (psutil had no `.poll()`)

### P1 — Functional
- Alembic `002` no longer recreates tables already in `001` (fresh migrate works)
- Workflow adapter dispatch uses `get_adapter()`; base `dispatch()` raises `NotImplementedError` for clean fallback
- Hermes `default_skills` no longer shadows itself with a recursive method
- Workflow PATCH handles nodes/edges independently (no `TypeError` when edges is `None`)
- Celery beat task names match registered task names
- Process reaper logs the real dead PID before clearing it
- SSE `emit_event` is sync and wired from agent start/stop + workflow completion
- Frontend: `/workflows/new` create flow, Vite proxies `/health` + WS, no hardcoded `:8002`
- Test infra: session-scoped DB cleanup; pytest/httpx/ruff in requirements; CI on `master`

### Still open (intentional / later)
- Auth helpers exist but routes remain open for local dev — do not bind `0.0.0.0` without auth
- Prompt endpoint still queues a pending task (no live agent chat completion yet)
- Docker Chroma service is optional/profiled; API uses local PersistentClient
- Fan-out workflow nodes still execute sequentially

## Round 1 — Jun 11, 2026

Summary of earlier changes across 15 files (BackgroundTasks→asyncio, SSE rewrite, model consolidation, etc.). Some claims in that pass did not match the code and were corrected above.
