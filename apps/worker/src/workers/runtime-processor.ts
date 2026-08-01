import dotenv from "dotenv";
import { resolve } from "path";
import { Worker } from "bullmq";
import { loadWorkerEnv } from "@riskdelta/config";
import { processRuntimeTrace, type RuntimeProcessingJob } from "@riskdelta/runtime-processing";
import { prisma } from "../db/prisma";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env"), override: false });

const env = loadWorkerEnv();
const redis = new URL(env.REDIS_URL);

export const runtimeProcessor = new Worker<RuntimeProcessingJob>(
  "runtime-jobs",
  async (job) =>
    processRuntimeTrace({
      payload: job.data,
      prisma,
      jobId: typeof job.id === "string" ? job.id : String(job.id ?? ""),
    }),
  {
    connection: {
      host: redis.hostname,
      port: Number(redis.port || 6379),
      password: redis.password || undefined,
    },
    concurrency: env.WORKER_CONCURRENCY,
  },
);
