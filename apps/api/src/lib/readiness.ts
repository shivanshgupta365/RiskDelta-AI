import Redis from "ioredis";
import { loadApiEnv } from "@riskdelta/config";
import { prisma } from "../db/prisma";

const env = loadApiEnv();

export async function getApiReadiness() {
  const checks = {
    database: false,
    redis: false,
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

  return {
    ok: checks.database && checks.redis,
    service: "riskdelta-api",
    timestamp: new Date().toISOString(),
    checks,
  };
}
