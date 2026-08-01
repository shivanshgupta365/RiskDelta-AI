import type { FastifyInstance } from "fastify";
import { scoreRisk } from "@riskdelta/risk-engine";
import { evaluatePolicies } from "@riskdelta/policy-engine";
import { registerPhase2Routes } from "./phase2.js";
import { registerPolicyRoutes } from "./policies.js";
import { registerRiskRoutes } from "./risk.js";
import { registerIncidentRoutes } from "./incidents.js";
import { registerRuntimeControlRoutes } from "./runtime-controls.js";
import { registerIntegrationRoutes } from "./integrations.js";
import { registerQuickstartRoutes } from "./quickstart.js";
import { registerSettingsRoutes } from "./settings.js";
import { registerTraceRoutes } from "./traces.js";

export async function registerV1Routes(app: FastifyInstance) {
  app.get("/", async () => ({
    service: "riskdelta-api",
    version: "v1",
    status: "ok",
  }));

  app.get("/health", async () => ({
    ok: true,
    version: "v1",
    timestamp: new Date().toISOString(),
  }));

  app.post("/risk/evaluate", async (request, reply) => {
    const body = request.body as {
      prompt?: string;
      toolCalls?: string[];
      destinationCount?: number;
      containsSensitiveData?: boolean;
    };

    if (!body?.prompt) {
      return reply.status(400).send({ error: "prompt is required" });
    }

    const risk = scoreRisk({
      prompt: body.prompt,
      toolCalls: body.toolCalls ?? [],
      destinationCount: body.destinationCount,
      containsSensitiveData: body.containsSensitiveData,
    });

    const policy = evaluatePolicies({
      riskScore: risk.score,
      toolCalls: body.toolCalls ?? [],
    });

    return {
      risk,
      policy,
    };
  });

  await registerPhase2Routes(app);
  await registerPolicyRoutes(app);
  await registerRiskRoutes(app);
  await registerIncidentRoutes(app);
  await registerRuntimeControlRoutes(app);
  await registerIntegrationRoutes(app);
  await registerQuickstartRoutes(app);
  await registerSettingsRoutes(app);
  await registerTraceRoutes(app);
}
