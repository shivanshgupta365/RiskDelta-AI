import dotenv from "dotenv";
import { resolve } from "path";
import { runtimeProcessor } from "./workers/runtime-processor";
import { healthState, startWorkerHealthServer } from "./lib/health-server";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env"), override: false });

const healthServer = startWorkerHealthServer();

runtimeProcessor.on("ready", () => {
  healthState.processorReady = true;
  console.info("[worker] runtime-jobs processor ready");
});

runtimeProcessor.on("completed", (job) => {
  console.info(`[worker] job completed: ${job.id}`);
});

runtimeProcessor.on("failed", (job, error) => {
  console.error(`[worker] job failed: ${job?.id}`, error);
});

async function shutdown(signal: string) {
  console.info(`[worker] received ${signal}, shutting down`);
  healthState.processorReady = false;
  await runtimeProcessor.close();
  healthServer.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
