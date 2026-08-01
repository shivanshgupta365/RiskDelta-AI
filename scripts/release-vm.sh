#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

echo "[riskdelta] pulling/building production images"
docker compose -f "$COMPOSE_FILE" pull web api worker caddy

echo "[riskdelta] running prisma migrations"
docker compose -f "$COMPOSE_FILE" run --rm api sh -lc 'cd /app/apps/web && pnpm exec prisma migrate deploy'

echo "[riskdelta] deploying api"
docker compose -f "$COMPOSE_FILE" up -d --no-build api

echo "[riskdelta] deploying worker"
docker compose -f "$COMPOSE_FILE" up -d --no-build worker

echo "[riskdelta] deploying web and reverse proxy"
docker compose -f "$COMPOSE_FILE" up -d --no-build web caddy

echo "[riskdelta] waiting for service health"
docker compose -f "$COMPOSE_FILE" ps
