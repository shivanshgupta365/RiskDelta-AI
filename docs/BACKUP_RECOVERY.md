# Backup and Recovery

RiskDelta's public deploy baseline depends on three stateful systems:

- PostgreSQL
- Redis
- S3-compatible object storage

## Backup policy

### PostgreSQL

- Daily snapshot backup
- PITR enabled where the provider supports it
- Verify restore monthly against staging

### Redis

- Treat BullMQ state as reconstructible but still enable managed snapshots
- Recovery objective is queue continuity, not Redis-as-source-of-truth

### Object storage

- Versioning enabled on the evidence bucket
- Lifecycle rules for expired artifacts
- Cross-region replication if customer evidence retention requires it

## Restore order

1. Restore PostgreSQL
2. Restore object storage bucket
3. Restore Redis only if required
4. Run `pnpm exec prisma migrate deploy`
5. Start API
6. Start worker
7. Start web

## Failure-mode expectations

### Worker down

- Ingest can continue if API and DB are healthy
- Queue backlog grows in Redis
- Recover by restarting worker; BullMQ resumes pending jobs

### API down

- Web server stays up but API-backed platform routes degrade
- Readiness fails for `web` because it cannot reach API

### Object storage down

- Evidence/artifact writes should be treated as degraded
- Trace metadata path can remain available, but artifact-heavy features should fail explicitly

### Queue backlog growth

- Scale worker replicas or raise concurrency
- Inspect queue depth and oldest pending job age

## Recovery validation

After a restore:

1. `curl https://<domain>/api/readyz`
2. `curl https://<domain>/readyz`
3. Sign in with demo operator
4. Run [`scripts/smoke-prod.sh`](../scripts/smoke-prod.sh)
