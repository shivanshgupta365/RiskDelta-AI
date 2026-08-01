FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED="1"

RUN corepack enable

WORKDIR /app

FROM base AS builder

COPY . .
RUN cp .env.example .env
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @riskdelta/web build

FROM base AS runner

ENV NODE_ENV="production"
ENV HOSTNAME="0.0.0.0"
ENV PORT="3000"
ENV NEXT_TELEMETRY_DISABLED="1"

COPY --from=builder /app/apps/web/.next/standalone /app
COPY --from=builder /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=builder /app/apps/web/public /app/apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
