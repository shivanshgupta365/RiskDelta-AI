import { Queue } from "bullmq";
import { loadApiEnv } from "@riskdelta/config";

const env = loadApiEnv();
if (!env.REDIS_URL) {
  throw new Error("REDIS_URL is required to initialize the runtime job queue");
}
const redis = new URL(env.REDIS_URL);

export type RuntimeProcessingJob = {
  traceId: string;
  traceSessionId: string;
  organizationId: string;
  prompt: string;
  toolCalls: string[];
  destinationCount: number;
  containsSensitiveData: boolean;
};

export const runtimeJobQueue = new Queue<RuntimeProcessingJob>("runtime-jobs", {
  connection: {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    password: redis.password || undefined,
  },
});
