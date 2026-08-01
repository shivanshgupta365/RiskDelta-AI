# Repository Scope

This repository publishes the RiskDelta community/source-available baseline under `BUSL-1.1`.

## Classification

### Public Source-Available
- `apps/web`
  - Public marketing routes
  - Authentication routes
  - Community-safe console surfaces:
    - Overview
    - TraceVault
    - Applications
    - Docs
    - Quickstart
- `apps/api`
  - Versioned Fastify API bootstrap
  - Health, auth, ingestion, traces, docs foundation, quickstart, projects, and community-safe read flows
- `apps/worker`
  - BullMQ worker bootstrap and community-safe processors
- `packages/ui`
  - Shared RiskDelta UI primitives
- `packages/types`
  - Shared contracts, enums, and edition markers
- `packages/config`
  - Shared env validation and typed config
- `packages/shared`
  - Shared utilities and constants
- `packages/policy-engine`
  - Source-available baseline DSL/evaluation contracts
- `packages/risk-engine`
  - Source-available baseline scoring contracts
- `packages/sdk-node`
  - Public ingest SDK

### Commercial Placeholder
- `apps/web/app/(app)/app/(platform)/policies/**`
- `apps/web/app/(app)/app/(platform)/runtime-controls/**`
- `apps/web/app/(app)/app/(platform)/risk/**`
- `apps/web/app/(app)/app/(platform)/incidents/**`
- `apps/web/app/(app)/app/(platform)/integrations/**`
- `apps/web/components/commercial/**`
- `apps/web/server/services/commercial-edition.ts`
- `apps/api/src/routes/v1/commercial.ts`

These areas preserve public interfaces and disabled entrypoints, but withhold premium operator workflows and enterprise-specific implementation.

Private deployments can mount a premium adapter through `RISKDELTA_PREMIUM_MODULE_PATH` without changing the public route contracts.

### Internal Do Not Publish
- Hosted secrets
- Commercial connectors/provider credentials
- Enterprise policy packs and heuristics
- Premium incident workflows
- Private orchestration/runbooks
- Trademark-sensitive brand kit beyond the public product assets

## Boundary Rules

- Public routes and packages must remain runnable without commercial-only code paths.
- Commercial features must fail closed with explicit placeholder UX or `403 commercial_feature_unavailable` API responses.
- Premium/private deployments must attach private implementation through the adapter boundary rather than patching public route contracts in place.
- Secrets, credentials, signing material, and private hosted logic must never be committed here.
