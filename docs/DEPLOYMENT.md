# Deployment

RiskDelta is deployable on a single cloud VM with four processes:

- `web` (`apps/web`)
- `api` (`apps/api`)
- `worker` (`apps/worker`)
- `caddy` (TLS + reverse proxy)

Recommended managed dependencies:

- PostgreSQL
- Redis
- S3-compatible object storage

## Files

- Production compose: [`docker-compose.prod.yml`](../docker-compose.prod.yml)
- Reverse proxy: [`deploy/Caddyfile`](../deploy/Caddyfile)
- VM release script: [`scripts/release-vm.sh`](../scripts/release-vm.sh)
- Production env template: [`deploy/env/production.example`](../deploy/env/production.example)
- Staging env template: [`deploy/env/staging.example`](../deploy/env/staging.example)

## VM topology

- Caddy terminates TLS on `:80` and `:443`
- `web` serves all public/authenticated UI routes
- `api` serves `/v1/*`, `/healthz`, `/readyz`
- `worker` consumes BullMQ jobs and exposes health on `:4101`

Route split:

- `/v1/*` -> `api:4100`
- everything else -> `web:3000`

## Environment setup

1. Copy [`deploy/env/production.example`](../deploy/env/production.example) to `.env` on the VM.
2. Set real values for:
   - `PUBLIC_DOMAIN`
   - `NEXT_PUBLIC_APP_URL`
   - `GHCR_REPOSITORY`
   - `IMAGE_TAG`
   - `DATABASE_URL`
   - `REDIS_URL`
   - `AUTH_SECRET`
   - `ENCRYPTION_KEY`
   - object storage credentials
3. Keep `RISKDELTA_EDITION=community-source-available` for the public/community build.
4. Only set `RISKDELTA_PREMIUM_MODULE_PATH` when mounting a private premium adapter on the VM.

## Deploy

If images are private in GHCR, authenticate first:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
```

1. Build/pull images.
2. Run DB migrations.
3. Start `api`.
4. Start `worker`.
5. Start `web` and `caddy`.

The scripted path is:

```bash
./scripts/release-vm.sh
```

## Health and readiness

- Web liveness: `GET /api/healthz`
- Web readiness: `GET /api/readyz`
- API liveness: `GET /healthz`
- API readiness: `GET /readyz`
- Worker liveness: `GET http://worker-host:4101/healthz`
- Worker readiness: `GET http://worker-host:4101/readyz`

Readiness meaning:

- `web`: can reach API readiness endpoint
- `api`: database + Redis reachable
- `worker`: database + Redis reachable and BullMQ processor ready

## Premium/private adapter contract

The community repo stays fail-closed by default. Private YC/demo builds can attach a premium adapter via:

- `RISKDELTA_PREMIUM_MODULE_PATH=/absolute/path/to/private-module.mjs`

Expected exports are shown in [`deploy/premium-adapter.example.mjs`](../deploy/premium-adapter.example.mjs).

This keeps route contracts stable while leaving premium implementation outside the public tree.
