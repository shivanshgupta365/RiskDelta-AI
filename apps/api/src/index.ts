import dotenv from "dotenv";
import { resolve } from "path";
import { randomUUID } from "crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { loadApiEnv } from "@riskdelta/config";
import { registerHealthRoutes } from "./routes/health.js";
import { registerV1Routes } from "./routes/v1/index.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env"), override: false });

function parseAllowedOrigins(env: ReturnType<typeof loadApiEnv>) {
  const configured = (env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin: string) => origin.trim())
    .filter(Boolean);
  const allowlist = new Set([env.WEB_APP_ORIGIN, ...configured]);
  return [...allowlist];
}

async function bootstrap() {
  const env = loadApiEnv();
  const allowedOrigins = parseAllowedOrigins(env);
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers['set-cookie']",
          "request.headers.authorization",
          "request.headers.cookie",
        ],
        censor: "[REDACTED]",
      },
    },
    disableRequestLogging: true,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
    genReqId: (request) => {
      const value = request.headers["x-request-id"];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
      if (Array.isArray(value) && value[0]) return value[0];
      return randomUUID();
    },
    bodyLimit: 1024 * 1024,
    ajv: {
      customOptions: {
        allErrors: true,
        removeAdditional: false,
        coerceTypes: true,
        useDefaults: true,
      },
    },
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const allowed = allowedOrigins.includes(origin);
      callback(allowed ? null : new Error("CORS origin denied"), allowed);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization", "x-riskdelta-organization-id", "x-request-id"],
  });

  await app.register(rateLimit, {
    max: env.API_RATE_LIMIT_MAX,
    timeWindow: env.API_RATE_LIMIT_WINDOW,
    allowList: ["127.0.0.1", "::1"],
  });

  app.addHook("onRequest", async (request) => {
    (request as { _startedAt?: bigint })._startedAt = process.hrtime.bigint();
    request.log.info({
      event: "request.start",
      method: request.method,
      url: request.url,
      requestId: request.id,
      ip: request.ip,
    });
  });

  app.addHook("preValidation", async (request, reply) => {
    if (!["POST", "PUT", "PATCH"].includes(request.method)) return;
    const contentType = request.headers["content-type"] ?? "";
    if (typeof contentType === "string" && contentType.length > 0 && !contentType.includes("application/json")) {
      return reply.status(415).send({ error: "Unsupported media type. Use application/json." });
    }
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAt = (request as { _startedAt?: bigint })._startedAt;
    const elapsedMs = startedAt ? Number(process.hrtime.bigint() - startedAt) / 1_000_000 : null;
    request.log.info({
      event: "request.end",
      method: request.method,
      url: request.url,
      requestId: request.id,
      statusCode: reply.statusCode,
      elapsedMs,
    });
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof (error as { statusCode?: number }).statusCode === "number" &&
      (error as { statusCode: number }).statusCode >= 400
        ? (error as { statusCode: number }).statusCode
        : 500;
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unhandled error";
    request.log.error({
      event: "request.error",
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode,
      message,
    });
    reply.status(statusCode).send({
      error: statusCode === 500 ? "Internal server error" : message,
      requestId: request.id,
    });
  });

  await registerHealthRoutes(app);
  await app.register(async (v1) => {
    await registerV1Routes(v1);
  }, { prefix: "/v1" });

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info({
    event: "server.started",
    port: env.API_PORT,
    host: env.API_HOST,
    allowedOrigins,
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
