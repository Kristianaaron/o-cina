#!/bin/bash
# Stop O-cina backend and infra
set -e

cd "$(dirname "$0")/.."

echo "Stopping O-cina..."
pkill -f "uvicorn app.main:app" 2>/dev/null && echo "Backend stopped" || echo "Backend not running"

echo "Stopping Docker infra..."
docker compose down 2>/dev/null || echo "Docker infra stopped"

echo "Done."
