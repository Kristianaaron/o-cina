#!/usr/bin/env bash
# Start O-cina backend (and optional Docker infra)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${OC_PORT:-${O_CINA_PORT:-${BACKEND_PORT:-8002}}}"
HOST="${OC_HOST:-${BACKEND_HOST:-127.0.0.1}}"

echo "Starting O-cina infrastructure (optional)..."
if command -v docker >/dev/null 2>&1; then
  docker compose up -d redis 2>/dev/null || echo "Note: Docker Redis skipped"
else
  echo "Note: Docker not available — Redis/Celery optional features disabled"
fi

mkdir -p "$HOME/.o-cina/data" "$HOME/.o-cina/logs" "$HOME/.o-cina/data/chroma"

if [[ ! -x "$ROOT/.venv/bin/uvicorn" ]]; then
  echo "Virtualenv missing. Run: python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt" >&2
  exit 1
fi

# Apply migrations if alembic is available
if [[ -x "$ROOT/.venv/bin/alembic" ]]; then
  (
    cd "$ROOT/backend"
    DATABASE_URL="${DATABASE_URL:-sqlite:///$HOME/.o-cina/data/center.db}" \
      "$ROOT/.venv/bin/alembic" -c alembic.ini upgrade head || true
  )
fi

echo "Starting backend on ${HOST}:${PORT}..."
cd "$ROOT/backend"
export PYTHONPATH=.
exec "$ROOT/.venv/bin/uvicorn" app.main:app \
  --host "$HOST" \
  --port "$PORT" \
  --reload
