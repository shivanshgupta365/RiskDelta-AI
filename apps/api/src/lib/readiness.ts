import { Redis } from "ioredis";
import { loadApiEnv } from "@riskdelta/config";
import { prisma } from "../db/prisma.js";

const env = loadApiEnv();

export async function getApiReadiness() {
  const checks: {
    database: boolean;
    redis: boolean | "disabled";
  } = {
    database: false,
    redis: env.RUNTIME_PROCESSING_MODE === "sync" ? "disabled" : false,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  if (env.RUNTIME_PROCESSING_MODE === "queue" && env.REDIS_URL) {
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
  }

  return {
    ok: checks.database && (checks.redis === true || checks.redis === "disabled"),
    service: "riskdelta-api",
    processingMode: env.RUNTIME_PROCESSING_MODE,
    timestamp: new Date().toISOString(),
    checks,
  };
}
