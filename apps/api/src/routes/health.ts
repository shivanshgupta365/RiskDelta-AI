import type { FastifyInstance } from "fastify";
import { getApiReadiness } from "../lib/readiness.js";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/healthz", async () => ({
    ok: true,
    service: "riskdelta-api",
    timestamp: new Date().toISOString(),
  }));

  app.get("/readyz", async (_request, reply) => {
    const readiness = await getApiReadiness();
    return reply.status(readiness.ok ? 200 : 503).send(readiness);
  });
}
