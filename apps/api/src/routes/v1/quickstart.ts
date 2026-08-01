import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { loadApiEnv } from "@riskdelta/config";
import { COMMERCIAL_EDITION } from "@riskdelta/types";
import {
  requireAuth,
  requireRoleForOrganization,
  requireScopes,
  type AuthContext,
} from "../../auth/context.js";
import { prisma } from "../../db/prisma.js";
import { writeAuditLog } from "../../audit/audit-log.js";

const env = loadApiEnv();

type QuickstartQuery = { orgId?: string };

const verifyQuickstartSchema = z.object({
  projectId: z.string().min(1),
  integrationType: z.enum(["sdk", "api", "plugnplay"]),
  status: z.enum(["SUCCESS", "WARNING", "FAILED"]).default("SUCCESS"),
  notes: z.string().optional(),
});

const quickstartPresets = [
  {
    label: "SDK",
    integrationType: "sdk",
    heading: "Install the SDK",
    install: "pnpm add @riskdelta/sdk-node",
    snippet:
      "import { RiskDeltaClient } from '@riskdelta/sdk-node';\nconst client = new RiskDeltaClient({ apiKey: process.env.RISKDELTA_API_KEY! });",
    verification: [
      "Create a .env with organization and API key prefix.",
      "Send one test trace through SDK instrumentation.",
      "Open TraceVault and confirm policy/risk events are visible.",
    ],
    expectedResults: ["Trace persisted", "Risk verdict generated", "Incidents open on escalation"],
  },
  {
    label: "API",
    integrationType: "api",
    heading: "Use the ingestion API",
    install: "curl and service credentials",
    snippet:
      "curl -X POST \"$RISKDELTA_BASE_URL/v1/ingest/traces\" -H \"Authorization: Bearer $RISKDELTA_API_KEY\" -H \"Content-Type: application/json\" -d '{\"requestId\":\"req_1\"}'",
    verification: [
      "Use API key with traces:write scope.",
      "POST a sample trace to /v1/ingest/traces.",
      "Confirm trace and risk summary on /app/tracevault.",
    ],
    expectedResults: ["Trace accepted", "Runtime pipeline completes", "Runtime controls and policy matches visible"],
  },
  {
    label: "Connectors",
    integrationType: "plugnplay",
    heading: "Configure connectors",
    install: "Configure provider credentials in Integrations.",
    snippet:
      "POST /v1/integrations with provider config and encrypted secret material.",
    verification: [
      "Create integration entry and attach to project.",
      "Run /v1/integrations/:id/verify hook.",
      "Confirm connection state changes to CONNECTED.",
    ],
    expectedResults: ["Integration verified", "Audit record emitted", "Quickstart status updated"],
  },
] as const;

function availableQuickstartPresets() {
  if (process.env.RISKDELTA_EDITION === COMMERCIAL_EDITION) {
    return quickstartPresets;
  }

  return quickstartPresets.filter((preset) => preset.integrationType !== "plugnplay");
}

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolveOrganizationId(auth: AuthContext, request: FastifyRequest, query: QuickstartQuery) {
  if (auth.kind === "api_key") return auth.organizationId;
  const fromHeader = headerValue(request, "x-riskdelta-organization-id");
  return query.orgId ?? fromHeader ?? null;
}

export async function registerQuickstartRoutes(app: FastifyInstance) {
  app.get("/quickstart", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!requireScopes(auth, ["projects:read"], reply)) return;

    const query = (request.query ?? {}) as QuickstartQuery;
    const organizationId = resolveOrganizationId(auth, request, query);
    if (!organizationId) {
      return reply.status(400).send({ error: "orgId (query or header) is required for session auth" });
    }
    if (!requireRoleForOrganization(auth, organizationId, "VIEWER", reply)) return;

    const [organization, project, apiKey] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId } }),
      prisma.project.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.apiKey.findFirst({
        where: { organizationId, revokedAt: null },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    if (!organization || !project) {
      return reply.status(404).send({ error: "Organization or project not found for quickstart payload" });
    }

    return {
      env: {
        RISKDELTA_BASE_URL: env.RISKDELTA_API_URL.replace(/\/$/, ""),
        RISKDELTA_PROJECT_ID: project.slug,
        RISKDELTA_API_KEY: `${apiKey?.prefix ?? "rd_demo"}…`,
        RISKDELTA_ORG: organization.name,
      },
      presets: availableQuickstartPresets(),
      endpoints: [
        { method: "POST", path: "/v1/ingest/traces", purpose: "Ingest runtime traces" },
        { method: "GET", path: "/v1/traces", purpose: "List normalized traces" },
      ],
    };
  });

  app.post("/quickstart/verify", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!requireScopes(auth, ["projects:write"], reply)) return;

    const query = (request.query ?? {}) as QuickstartQuery;
    const organizationId = resolveOrganizationId(auth, request, query);
    if (!organizationId) {
      return reply.status(400).send({ error: "orgId (query or header) is required for session auth" });
    }
    if (!requireRoleForOrganization(auth, organizationId, "OPERATOR", reply)) return;

    const parsed = verifyQuickstartSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid quickstart verification payload", issues: parsed.error.flatten() });
    }

    const project = await prisma.project.findFirst({
      where: {
        id: parsed.data.projectId,
        organizationId,
      },
    });
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }

    await writeAuditLog({
      organizationId,
      actorName: auth.actorName,
      action: "quickstart.verified",
      targetType: "Project",
      targetId: project.id,
      metadata: {
        integrationType: parsed.data.integrationType,
        status: parsed.data.status,
        notes: parsed.data.notes ?? null,
      },
    });

    await prisma.traceEvent.create({
      data: {
        organizationId,
        traceSessionId: (await prisma.traceSession.findFirst({
          where: { organizationId, projectId: project.id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        }))?.id ??
          (await prisma.traceSession.create({
            data: {
              organizationId,
              projectId: project.id,
              externalId: `quickstart_${Date.now().toString(36)}`,
              status: "OPEN",
            },
            select: { id: true },
          })).id,
        eventType: "QUICKSTART_VERIFIED",
        payload: {
          projectId: project.id,
          integrationType: parsed.data.integrationType,
          status: parsed.data.status,
          notes: parsed.data.notes ?? null,
        },
      },
    });

    return {
      ok: true,
      message: "Quickstart verification hook recorded.",
    };
  });
}
