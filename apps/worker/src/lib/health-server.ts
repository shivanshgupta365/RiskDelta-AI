import { createServer } from "node:http";
import Redis from "ioredis";
import { loadWorkerEnv } from "@riskdelta/config";
import { prisma } from "../db/prisma";

const env = loadWorkerEnv();

async function getReadiness() {
  const checks = {
    database: false,
    redis: false,
    processorReady: false,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();
    checks.redis = (await redis.ping()) === "PONG";
  } catch {
    checks.redis = false;
  } finally {
    redis.disconnect();
  }

  checks.processorReady = healthState.processorReady;

  return {
    ok: checks.database && checks.redis && checks.processorReady,
    service: "riskdelta-worker",
    timestamp: new Date().toISOString(),
    checks,
  };
}

export const healthState = {
  processorReady: false,
};

export function startWorkerHealthServer() {
  const server = createServer(async (request, response) => {
    if (!request.url) {
      response.statusCode = 404;
      response.end();
      return;
    }

    if (request.url === "/healthz") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          ok: true,
          service: "riskdelta-worker",
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    if (request.url === "/readyz") {
      const payload = await getReadiness();
      response.statusCode = payload.ok ? 200 : 503;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(payload));
      return;
    }

    response.statusCode = 404;
    response.end();
  });

  server.listen(env.WORKER_HEALTH_PORT, "0.0.0.0", () => {
    console.info(`[worker] health server listening on ${env.WORKER_HEALTH_PORT}`);
  });

  return server;
}
