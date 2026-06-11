#!/usr/bin/env bash
set -e
cd $(dirname "$0")/../backend
export DATABASE_URL=${DATABASE_URL:-sqlite:////home/kristianaaron/.o-cina/data/center.db}
alembic -c alembic.ini upgrade head
echo "O-cina: Migrations applied"
