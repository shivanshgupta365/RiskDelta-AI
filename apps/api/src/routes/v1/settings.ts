import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  requireAuth,
  requireRoleForOrganization,
  requireScopes,
  type AuthContext,
} from "../../auth/context.js";
import { prisma } from "../../db/prisma.js";
import { writeAuditLog } from "../../audit/audit-log.js";
import { generateApiKeyValue, getApiKeyParts, hashApiKey } from "../../utils/api-keys.js";

type SettingsQuery = { orgId?: string; limit?: number };

const organizationUpdateSchema = z.object({
  name: z.string().min(2),
  tier: z.string().min(2),
  domain: z.string().optional().nullable(),
});

const apiKeyCreateSchema = z.object({
  name: z.string().min(2),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().optional(),
});

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolveOrganizationId(auth: AuthContext, request: FastifyRequest, query: SettingsQuery) {
  if (auth.kind === "api_key") return auth.organizationId;
  const fromHeader = headerValue(request, "x-riskdelta-organization-id");
  return query.orgId ?? fromHeader ?? null;
}

function docsFoundation() {
  return {
    sections: [
      {
        id: "trace-model",
        title: "Trace Model",
        summary: "Capture prompt, tools, output, policy chain, risk factors, and runtime actions in one chronology.",
      },
      {
        id: "policy-execution",
        title: "Policy Execution",
        summary: "Deterministic SIMULATE/ENFORCE evaluation with versioned rules and matched conditions.",
      },
      {
        id: "incident-chain",
        title: "Incident Chain",
        summary: "Escalations preserve linked traces, control actions, and timeline events for operator review.",
      },
    ],
  };
}

export async function registerSettingsRoutes(app: FastifyInstance) {
  app.get("/settings/foundation", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!requireScopes(auth, ["settings:read"], reply)) return;

    const query = (request.query ?? {}) as SettingsQuery;
    const organizationId = resolveOrganizationId(auth, request, query);
    if (!organizationId) {
      return reply.status(400).send({ error: "orgId (query or header) is required for session auth" });
    }
    if (!requireRoleForOrganization(auth, organizationId, "VIEWER", reply)) return;

    const [organization, members, apiKeys, auditLogs] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId } }),
      prisma.membership.findMany({
        where: { organizationId },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.apiKey.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: Math.max(5, Math.min(query.limit ?? 12, 100)),
      }),
    ]);

    return { organization, members, apiKeys, auditLogs, docs: docsFoundation() };
  });

  app.patch("/settings/organization", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!requireScopes(auth, ["settings:write"], reply)) return;
    if (auth.kind !== "session") {
      return reply.status(403).send({ error: "Session auth required for organization updates" });
    }

    const query = (request.query ?? {}) as SettingsQuery;
    const organizationId = resolveOrganizationId(auth, request, query);
    if (!organizationId) {
      return reply.status(400).send({ error: "orgId (query or header) is required for session auth" });
    }
    if (!requireRoleForOrganization(auth, organizationId, "ADMIN", reply)) return;

    const parsed = organizationUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid organization payload", issues: parsed.error.flatten() });
    }

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: parsed.data.name,
        tier: parsed.data.tier,
        domain: parsed.data.domain ?? null,
      },
    });

    await writeAuditLog({
      organizationId,
      actorName: auth.actorName,
      action: "organization.updated",
      targetType: "Organization",
      targetId: organization.id,
      metadata: {
        name: organization.name,
        tier: organization.tier,
        domain: organization.domain,
      },
    });

    return { organization };
  });

  app.get("/settings/api-keys", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!requireScopes(auth, ["api_keys:read"], reply)) return;

    const query = (request.query ?? {}) as SettingsQuery;
    const organizationId = resolveOrganizationId(auth, request, query);
    if (!organizationId) {
      return reply.status(400).send({ error: "orgId (query or header) is required for session auth" });
    }
    if (!requireRoleForOrganization(auth, organizationId, "VIEWER", reply)) return;

    const apiKeys = await prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastFour: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });

    return { apiKeys };
  });

  app.post("/settings/api-keys", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!requireScopes(auth, ["api_keys:write"], reply)) return;
    if (auth.kind !== "session") {
      return reply.status(403).send({ error: "Session auth required for key management" });
    }

    const query = (request.query ?? {}) as SettingsQuery;
    const organizationId = resolveOrganizationId(auth, request, query);
    if (!organizationId) {
      return reply.status(400).send({ error: "orgId (query or header) is required for session auth" });
    }
    if (!requireRoleForOrganization(auth, organizationId, "ADMIN", reply)) return;

    const parsed = apiKeyCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid API key payload", issues: parsed.error.flatten() });
    }

    const rawKey = generateApiKeyValue();
    const parts = getApiKeyParts(rawKey);
    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId,
        userId: auth.userId,
        name: parsed.data.name,
        prefix: parts.prefix,
        lastFour: parts.lastFour,
        secretHash: hashApiKey(rawKey),
        scopes: parsed.data.scopes,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastFour: true,
        scopes: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    await writeAuditLog({
      organizationId,
      actorName: auth.actorName,
      action: "api_key.created",
      targetType: "ApiKey",
      targetId: apiKey.id,
      metadata: {
        prefix: apiKey.prefix,
        scopes: apiKey.scopes,
      },
    });

    return reply.status(201).send({
      apiKey,
      token: rawKey,
      revealOnce: true,
    });
  });

  app.get("/audit", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!requireScopes(auth, ["audit:read"], reply)) return;

    const query = (request.query ?? {}) as SettingsQuery;
    const organizationId = resolveOrganizationId(auth, request, query);
    if (!organizationId) {
      return reply.status(400).send({ error: "orgId (query or header) is required for session auth" });
    }
    if (!requireRoleForOrganization(auth, organizationId, "VIEWER", reply)) return;

    const logs = await prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: Math.max(10, Math.min(query.limit ?? 100, 250)),
    });

    return { logs };
  });

  app.get("/docs/foundation", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    if (!requireScopes(auth, ["settings:read", "audit:read"], reply)) return;

    const query = (request.query ?? {}) as SettingsQuery;
    const organizationId = resolveOrganizationId(auth, request, query);
    if (!organizationId) {
      return reply.status(400).send({ error: "orgId (query or header) is required for session auth" });
    }
    if (!requireRoleForOrganization(auth, organizationId, "VIEWER", reply)) return;

    const latestAudit = await prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      ...docsFoundation(),
      latestAudit,
    };
  });
}
