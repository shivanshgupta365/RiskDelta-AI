import type { FastifyInstance, FastifyRequest } from "fastify";
import { loadApiEnv } from "@riskdelta/config";
import { processRuntimeTrace, type RuntimeProcessingJob } from "@riskdelta/runtime-processing";
import { IngestTraceRequestSchema } from "@riskdelta/types";
import { createId } from "@riskdelta/shared";
import { prisma } from "../../db/prisma";
import {
  canAccessOrganization,
  requireAuth,
  requireRoleForOrganization,
  requireScopes,
  type AuthContext,
} from "../../auth/context";
import { writeAuditLog } from "../../audit/audit-log";

const env = loadApiEnv();

type TraceQuery = {
  orgId?: string;
  query?: string;
  verdict?: string;
  provider?: string;
  environment?: string;
  severity?: string;
  limit?: number;
};

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolveOrganizationId(auth: AuthContext, request: FastifyRequest, query: TraceQuery) {
  if (auth.kind === "api_key") return auth.organizationId;
  const fromHeader = headerValue(request, "x-riskdelta-organization-id");
  return query.orgId ?? fromHeader ?? null;
}

function containsSensitiveData(payload: unknown) {
  const text = JSON.stringify(payload ?? {});
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s().-]{8,}\d|sk-[A-Za-z0-9_-]{12,}/i.test(text);
}

function normalizedEnvironment(environment: string) {
  return environment.trim().toLowerCase();
}

function traceSessionExternalId(organizationId: string, sessionId: string) {
  return `${organizationId}:${sessionId}`;
}

export async function registerTraceRoutes(app: FastifyInstance) {
  app.post(
    "/ingest/traces",
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      if (!requireScopes(auth, ["traces:write"], reply)) return;

      const parsed = IngestTraceRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid trace payload",
          issues: parsed.error.flatten(),
        });
      }

      const project = await prisma.project.findUnique({
        where: { id: parsed.data.projectId },
        select: { id: true, organizationId: true, name: true, slug: true },
      });

      if (!project) {
        return reply.status(404).send({ error: "Project not found" });
      }

      if (!canAccessOrganization(auth, project.organizationId)) {
        return reply.status(403).send({ error: "Project is outside auth scope" });
      }

      if (!requireRoleForOrganization(auth, project.organizationId, "OPERATOR", reply)) return;

      const environmentName = normalizedEnvironment(parsed.data.environment);
      const metadata = parsed.data.metadata ?? {};
      const desiredTargets = Array.isArray(metadata.desiredTargets)
        ? metadata.desiredTargets.filter((value): value is string => typeof value === "string")
        : [];

      const environment = await prisma.environment.findFirst({
        where: {
          organizationId: project.organizationId,
          AND: [
            {
              OR: [
                { projectId: project.id },
                { projectId: null },
              ],
            },
            {
              OR: [
                { slug: environmentName },
                { name: { equals: environmentName, mode: "insensitive" } },
                { stage: environmentName.toUpperCase() },
              ],
            },
          ],
        },
        select: { id: true },
      });

      const applicationIdFromMetadata = typeof metadata.applicationId === "string" ? metadata.applicationId : null;
      const application = applicationIdFromMetadata
        ? await prisma.application.findFirst({
            where: {
              id: applicationIdFromMetadata,
              organizationId: project.organizationId,
            },
            select: { id: true },
          })
        : null;

      const session = await prisma.traceSession.upsert({
        where: {
          externalId: traceSessionExternalId(project.organizationId, parsed.data.sessionId),
        },
        update: {
          status: "OPEN",
          actor: parsed.data.actor,
          projectId: project.id,
          environmentId: environment?.id ?? null,
          applicationId: application?.id ?? null,
        },
        create: {
          externalId: traceSessionExternalId(project.organizationId, parsed.data.sessionId),
          organizationId: project.organizationId,
          projectId: project.id,
          environmentId: environment?.id ?? null,
          applicationId: application?.id ?? null,
          actor: parsed.data.actor,
          status: "OPEN",
          startedAt: new Date(),
        },
      });

      const toolNames = parsed.data.toolUsage?.tools ?? [];
      const channel =
        typeof metadata.channel === "string" && metadata.channel.length > 0 ? metadata.channel : "api";
      const context =
        typeof metadata.context === "string" && metadata.context.length > 0 ? metadata.context : "";
      const ip = typeof metadata.ip === "string" && metadata.ip.length > 0 ? metadata.ip : "0.0.0.0";
      const country = typeof metadata.country === "string" && metadata.country.length > 0 ? metadata.country : "unknown";

      const trace = await prisma.trace.create({
        data: {
          externalId: createId("trace"),
          organizationId: project.organizationId,
          projectId: project.id,
          environmentId: environment?.id ?? null,
          applicationId: application?.id ?? null,
          traceSessionId: session.id,
          requestId: parsed.data.requestId,
          environment: environmentName,
          channel,
          provider: parsed.data.provider,
          model: parsed.data.model,
          prompt: parsed.data.prompt,
          promptPreview: parsed.data.prompt.slice(0, 220),
          context,
          response: parsed.data.responsePreview ?? "",
          responsePreview: (parsed.data.responsePreview ?? "").slice(0, 220),
          actor: parsed.data.actor,
          ip,
          country,
          sessionId: parsed.data.sessionId,
          toolSummary: toolNames.join(", "),
          desiredTargets,
          tags: [env.RUNTIME_PROCESSING_MODE === "queue" ? "queued" : "processing", "ingested"],
          riskScore: 0,
          confidence: 0,
          severity: "LOW",
          verdict: "REVIEW",
          blocked: false,
          redacted: false,
          selectedModel: null,
          explainability:
            env.RUNTIME_PROCESSING_MODE === "queue"
              ? "Queued for async runtime evaluation."
              : "Processing synchronous runtime evaluation.",
          dimensionScores: [],
          runtimeActions: [],
          signals: [],
          toolCalls: {
            create: toolNames.map((tool, index) => ({
              name: tool,
              target: desiredTargets[index] ?? "internal://tool",
              status: "QUEUED",
              blocked: false,
              details: {},
            })),
          },
        },
      });

      await prisma.traceEvent.create({
        data: {
          organizationId: project.organizationId,
          traceSessionId: session.id,
          eventType: "INGEST_RECEIVED",
          payload: {
            traceId: trace.id,
            requestId: trace.requestId,
            provider: trace.provider,
            model: trace.model,
            toolCount: toolNames.length,
          },
        },
      });

      const runtimePayload: RuntimeProcessingJob = {
        traceId: trace.id,
        traceSessionId: session.id,
        organizationId: project.organizationId,
        prompt: parsed.data.prompt,
        toolCalls: toolNames,
        destinationCount: desiredTargets.length,
        containsSensitiveData: containsSensitiveData({
          prompt: parsed.data.prompt,
          responsePreview: parsed.data.responsePreview,
          metadata: parsed.data.metadata,
        }),
      };

      let queueJobId: string | null = null;
      let finalVerdict = trace.verdict;
      let finalSeverity = trace.severity;

      if (env.RUNTIME_PROCESSING_MODE === "sync") {
        const processingId = createId("sync");
        await prisma.traceEvent.create({
          data: {
            organizationId: project.organizationId,
            traceSessionId: session.id,
            eventType: "RUNTIME_PROCESSING_STARTED",
            payload: {
              traceId: trace.id,
              processingId,
              mode: "sync",
            },
          },
        });

        const result = await processRuntimeTrace({
          payload: runtimePayload,
          prisma,
          jobId: processingId,
          actorName: "riskdelta-api",
        });
        finalVerdict = result.policy.verdict;
        finalSeverity = result.risk.severity;
      } else {
        const { runtimeJobQueue } = await import("../../queues/runtime-jobs");
        const runtimeJob = await runtimeJobQueue.add("process-trace", runtimePayload, {
          attempts: 3,
          removeOnComplete: 1000,
          removeOnFail: 2000,
          backoff: {
            type: "exponential",
            delay: 1500,
          },
        });
        queueJobId = runtimeJob.id ? String(runtimeJob.id) : null;

        await prisma.traceEvent.create({
          data: {
            organizationId: project.organizationId,
            traceSessionId: session.id,
            eventType: "RUNTIME_JOB_QUEUED",
            payload: {
              traceId: trace.id,
              jobId: queueJobId,
            },
          },
        });
      }

      await writeAuditLog({
        organizationId: project.organizationId,
        actorName: auth.actorName,
        action: "trace.ingested",
        targetType: "Trace",
        targetId: trace.id,
        metadata: {
          projectId: project.id,
          requestId: trace.requestId,
          processingMode: env.RUNTIME_PROCESSING_MODE,
          queueJobId,
        },
      });

      return reply.status(202).send({
        accepted: true,
        processingMode: env.RUNTIME_PROCESSING_MODE,
        queueJobId,
        trace: {
          id: trace.id,
          requestId: trace.requestId,
          organizationId: trace.organizationId,
          projectId: trace.projectId,
          traceSessionId: session.id,
          verdict: finalVerdict,
          severity: finalSeverity,
          createdAt: trace.createdAt,
        },
      });
    },
  );

  app.get("/traces", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!requireScopes(auth, ["traces:read"], reply)) return;

    const query = (request.query ?? {}) as TraceQuery;
    const organizationId = resolveOrganizationId(auth, request, query);
    if (!organizationId) {
      return reply.status(400).send({ error: "orgId (query or header) is required for session auth" });
    }

    if (!requireRoleForOrganization(auth, organizationId, "VIEWER", reply)) return;

    const limit = Math.max(1, Math.min(query.limit ?? 50, 100));
    const traces = await prisma.trace.findMany({
      where: {
        organizationId,
        verdict: query.verdict ?? undefined,
        provider: query.provider ?? undefined,
        environment: query.environment ?? undefined,
        severity: query.severity ?? undefined,
        OR: query.query
          ? [
              { requestId: { contains: query.query, mode: "insensitive" } },
              { promptPreview: { contains: query.query, mode: "insensitive" } },
              { actor: { contains: query.query, mode: "insensitive" } },
              { project: { name: { contains: query.query, mode: "insensitive" } } },
            ]
          : undefined,
      },
      include: {
        project: true,
        incident: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return { traces };
  });

  app.get("/traces/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!requireScopes(auth, ["traces:read"], reply)) return;

    const params = request.params as { id: string };
    const query = (request.query ?? {}) as TraceQuery;
    const organizationId = resolveOrganizationId(auth, request, query);
    if (!organizationId) {
      return reply.status(400).send({ error: "orgId (query or header) is required for session auth" });
    }

    if (!requireRoleForOrganization(auth, organizationId, "VIEWER", reply)) return;

    const trace = await prisma.trace.findFirst({
      where: {
        id: params.id,
        organizationId,
      },
      include: {
        project: true,
        toolCalls: true,
        riskEvents: true,
        incident: true,
        policyRuns: {
          include: {
            policyVersion: {
              include: {
                policy: true,
              },
            },
            matches: true,
          },
        },
        traceSessionRef: {
          include: {
            events: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!trace) {
      return reply.status(404).send({ error: "Trace not found" });
    }

    return { trace };
  });
}
