#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

DATA_DIR="${OCINA_DATA_DIR:-$HOME/.o-cina/data}"
mkdir -p "$DATA_DIR"

# Portable default — works on macOS and Linux (no hardcoded /home/...)
export DATABASE_URL="${DATABASE_URL:-sqlite:///${DATA_DIR}/center.db}"

if [[ -x "$ROOT/.venv/bin/alembic" ]]; then
  "$ROOT/.venv/bin/alembic" -c alembic.ini upgrade head
elif command -v alembic >/dev/null 2>&1; then
  alembic -c alembic.ini upgrade head
else
  echo "alembic not found. Activate the venv or: pip install -r requirements.txt" >&2
  exit 1
fi

echo "O-cina: Migrations applied ($DATABASE_URL)"
