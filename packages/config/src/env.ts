import { z } from "zod";
import { RiskDeltaEditionSchema } from "@riskdelta/types";

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().min(1).optional(),
);

const optionalPositiveInteger = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  RISKDELTA_EDITION: RiskDeltaEditionSchema.default("community-source-available"),
  RISKDELTA_PREMIUM_MODULE_PATH: optionalNonEmptyString,
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  MINIO_ENDPOINT: optionalNonEmptyString,
  MINIO_PORT: optionalPositiveInteger,
  MINIO_ACCESS_KEY: optionalNonEmptyString,
  MINIO_SECRET_KEY: optionalNonEmptyString,
  MINIO_BUCKET: optionalNonEmptyString,
  MINIO_USE_SSL: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

const webSchema = baseSchema.extend({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_RISKDELTA_EDITION: RiskDeltaEditionSchema.default("community-source-available"),
  RISKDELTA_API_URL: z.string().url().default("http://localhost:4100"),
  DEMO_USER_EMAIL: z.string().email().optional(),
  DEMO_USER_PASSWORD: z.string().min(10).optional(),
  PUBLIC_DEMO_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  PUBLIC_DEMO_USER_EMAIL: z.string().email().optional(),
});

const apiSchema = baseSchema
  .extend({
    RUNTIME_PROCESSING_MODE: z.enum(["sync", "queue"]).default("queue"),
    REDIS_URL: optionalNonEmptyString,
    API_HOST: z.string().default("0.0.0.0"),
    API_PORT: z.coerce.number().int().positive().default(4100),
    WEB_APP_ORIGIN: z.string().url(),
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(200),
    API_RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  })
  .superRefine((value, context) => {
    if (value.RUNTIME_PROCESSING_MODE === "queue" && !value.REDIS_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "REDIS_URL is required when RUNTIME_PROCESSING_MODE=queue",
      });
    }
  });

const workerSchema = baseSchema.extend({
  REDIS_URL: z.string().min(1),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4101),
});

function parse<T extends z.ZodTypeAny>(schema: T, source: Record<string, string | undefined>) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration\n${issues.join("\n")}`);
  }

  return result.data;
}

export function loadWebEnv(source = process.env) {
  return parse(webSchema, source);
}

export function loadApiEnv(source = process.env) {
  return parse(apiSchema, source);
}

export function loadWorkerEnv(source = process.env) {
  return parse(workerSchema, source);
}

export type WebEnv = ReturnType<typeof loadWebEnv>;
export type ApiEnv = ReturnType<typeof loadApiEnv>;
export type WorkerEnv = ReturnType<typeof loadWorkerEnv>;
