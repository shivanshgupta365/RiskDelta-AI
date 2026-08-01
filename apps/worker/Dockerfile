FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

FROM base AS builder

COPY . .
RUN cp .env.example .env
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @riskdelta/worker build

FROM base AS runner

ENV NODE_ENV="production"

COPY --from=builder /app /app

WORKDIR /app/apps/worker

EXPOSE 4101

CMD ["node", "dist/index.js"]
