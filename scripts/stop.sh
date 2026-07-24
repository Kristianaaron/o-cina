#!/usr/bin/env bash
# Stop O-cina backend and optional Docker infra
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Stopping O-cina..."
if pgrep -f "uvicorn app.main:app" >/dev/null 2>&1; then
  pkill -f "uvicorn app.main:app" 2>/dev/null || true
  echo "Backend stopped"
else
  echo "Backend not running"
fi

if command -v docker >/dev/null 2>&1; then
  echo "Stopping Docker infra..."
  docker compose down 2>/dev/null || true
fi

echo "Done."
