#!/bin/bash
# Start O-cina backend and infra
set -e

cd "$(dirname "$0")/.."

echo "Starting O-cina infrastructure..."
docker compose up -d redis chromadb 2>/dev/null || echo "Note: Docker infra skipped (containers may not be running)"

echo "Starting backend on port ${O_CINA_PORT:-8766}..."
cd backend
PYTHONPATH=. ../.venv/bin/uvicorn app.main:app \
  --host 127.0.0.1 \
  --port "${O_CINA_PORT:-8766}" \
  --reload
