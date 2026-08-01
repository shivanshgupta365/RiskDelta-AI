import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../db/prisma.js";
import { writeAuditLog } from "../../audit/audit-log.js";
import {
  requireAuth,
  requireRoleForOrganization,
  requireScopes,
  type AuthContext,
} from "../../auth/context.js";
import { generateApiKeyValue, getApiKeyParts, hashApiKey } from "../../utils/api-keys.js";

const projectCreateSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(3).default("Runtime protected application"),
  environment: z.string().default("production"),
  framework: z.string().default("Custom"),
  provider: z.string().default("OpenAI"),
});

const environmentCreateSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  stage: z.string().default("PRODUCTION"),
  projectId: z.string().optional(),
});

const applicationCreateSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  projectId: z.string().min(1),
  environmentId: z.string().optional(),
  framework: z.string().optional(),
  provider: z.string().optional(),
  status: z.string().default("ACTIVE"),
});

const apiKeyCreateSchema = z.object({
  name: z.string().min(2),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().optional(),
});

const apiKeyRotateSchema = z.object({
  name: z.string().min(2).optional(),
  scopes: z.array(z.string()).min(1).optional(),
  expiresAt: z.string().datetime().optional(),
});

function actor(auth: AuthContext) {
  return auth.actorName;
}

async function assertOrganizationExists(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  return org;
}

export async function registerPhase2Routes(app: FastifyInstance) {
  app.get("/auth/me", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    if (auth.kind === "api_key") {
      return {
        kind: auth.kind,
        actorName: auth.actorName,
        organizationId: auth.organizationId,
        scopes: auth.scopes,
      };
    }

    return {
      kind: auth.kind,
      actorName: auth.actorName,
      userId: auth.userId,
      memberships: auth.memberships,
    };
  });

  app.get("/orgs", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    if (auth.kind === "api_key") {
      const org = await prisma.organization.findUnique({
        where: { id: auth.organizationId },
        select: { id: true, name: true, slug: true, tier: true, domain: true },
      });
      return { organizations: org ? [org] : [] };
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: auth.userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      organizations: memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        tier: membership.organization.tier,
        domain: membership.organization.domain,
        role: membership.role,
      })),
    };
  });

  app.get("/orgs/:orgId/projects", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const { orgId } = request.params as { orgId: string };

    if (!requireRoleForOrganization(auth, orgId, "VIEWER", reply)) return;
    if (!requireScopes(auth, ["projects:read"], reply)) return;

    const projects = await prisma.project.findMany({
      where: { organizationId: orgId },
      orderBy: [{ environment: "asc" }, { name: "asc" }],
    });

    return { projects };
  });

  app.post("/orgs/:orgId/projects", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const { orgId } = request.params as { orgId: string };
    const parsed = projectCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", issues: parsed.error.flatten() });
    }

    if (!requireRoleForOrganization(auth, orgId, "OPERATOR", reply)) return;
    if (!requireScopes(auth, ["projects:write"], reply)) return;
    if (!(await assertOrganizationExists(orgId))) {
      return reply.status(404).send({ error: "Organization not found" });
    }

    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        name: parsed.data.name,
        slug: parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: parsed.data.description,
        environment: parsed.data.environment,
        framework: parsed.data.framework,
        provider: parsed.data.provider,
        ownerName: actor(auth),
        riskStatus: "LOW",
        integrationStatus: "Pending",
        monitoringEnabled: true,
      },
    });

    await writeAuditLog({
      organizationId: orgId,
      actorName: actor(auth),
      action: "project.created",
      targetType: "Project",
      targetId: project.id,
      metadata: {
        name: project.name,
        environment: project.environment,
      },
    });

    return reply.status(201).send({ project });
  });

  app.get("/orgs/:orgId/environments", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const { orgId } = request.params as { orgId: string };

    if (!requireRoleForOrganization(auth, orgId, "VIEWER", reply)) return;
    if (!requireScopes(auth, ["projects:read"], reply)) return;

    const environments = await prisma.environment.findMany({
      where: { organizationId: orgId },
      orderBy: [{ stage: "asc" }, { name: "asc" }],
    });

    return { environments };
  });

  app.post("/orgs/:orgId/environments", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const { orgId } = request.params as { orgId: string };
    const parsed = environmentCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", issues: parsed.error.flatten() });
    }

    if (!requireRoleForOrganization(auth, orgId, "OPERATOR", reply)) return;
    if (!requireScopes(auth, ["projects:write"], reply)) return;

    const environment = await prisma.environment.create({
      data: {
        organizationId: orgId,
        projectId: parsed.data.projectId,
        name: parsed.data.name,
        slug: parsed.data.slug,
        stage: parsed.data.stage,
      },
    });

    await writeAuditLog({
      organizationId: orgId,
      actorName: actor(auth),
      action: "environment.created",
      targetType: "Environment",
      targetId: environment.id,
      metadata: {
        name: environment.name,
        stage: environment.stage,
      },
    });

    return reply.status(201).send({ environment });
  });

  app.get("/orgs/:orgId/applications", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const { orgId } = request.params as { orgId: string };

    if (!requireRoleForOrganization(auth, orgId, "VIEWER", reply)) return;
    if (!requireScopes(auth, ["applications:read"], reply)) return;

    const applications = await prisma.application.findMany({
      where: { organizationId: orgId },
      include: {
        project: { select: { id: true, name: true } },
        environment: { select: { id: true, name: true, stage: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return { applications };
  });

  app.post("/orgs/:orgId/applications", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const { orgId } = request.params as { orgId: string };
    const parsed = applicationCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", issues: parsed.error.flatten() });
    }

    if (!requireRoleForOrganization(auth, orgId, "OPERATOR", reply)) return;
    if (!requireScopes(auth, ["applications:write"], reply)) return;

    const application = await prisma.application.create({
      data: {
        organizationId: orgId,
        projectId: parsed.data.projectId,
        environmentId: parsed.data.environmentId,
        name: parsed.data.name,
        slug: parsed.data.slug,
        framework: parsed.data.framework,
        provider: parsed.data.provider,
        status: parsed.data.status,
      },
    });

    await writeAuditLog({
      organizationId: orgId,
      actorName: actor(auth),
      action: "application.created",
      targetType: "Application",
      targetId: application.id,
      metadata: {
        name: application.name,
        projectId: application.projectId,
      },
    });

    return reply.status(201).send({ application });
  });

  app.get("/orgs/:orgId/api-keys", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const { orgId } = request.params as { orgId: string };

    if (auth.kind !== "session") {
      return reply.status(403).send({ error: "Session auth required for key management" });
    }

    if (!requireRoleForOrganization(auth, orgId, "ADMIN", reply)) return;

    const apiKeys = await prisma.apiKey.findMany({
      where: { organizationId: orgId },
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

  app.post("/orgs/:orgId/api-keys", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const { orgId } = request.params as { orgId: string };
    const parsed = apiKeyCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", issues: parsed.error.flatten() });
    }

    if (auth.kind !== "session") {
      return reply.status(403).send({ error: "Session auth required for key management" });
    }

    if (!requireRoleForOrganization(auth, orgId, "ADMIN", reply)) return;

    const rawKey = generateApiKeyValue();
    const parts = getApiKeyParts(rawKey);
    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId: orgId,
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
      organizationId: orgId,
      actorName: actor(auth),
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

  app.post("/orgs/:orgId/api-keys/:apiKeyId/revoke", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const { orgId, apiKeyId } = request.params as { orgId: string; apiKeyId: string };

    if (auth.kind !== "session") {
      return reply.status(403).send({ error: "Session auth required for key management" });
    }

    if (!requireRoleForOrganization(auth, orgId, "ADMIN", reply)) return;

    const apiKey = await prisma.apiKey.findFirst({
      where: { id: apiKeyId, organizationId: orgId },
    });

    if (!apiKey) {
      return reply.status(404).send({ error: "API key not found" });
    }

    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { revokedAt: new Date() },
    });

    await writeAuditLog({
      organizationId: orgId,
      actorName: actor(auth),
      action: "api_key.revoked",
      targetType: "ApiKey",
      targetId: apiKey.id,
      metadata: { prefix: apiKey.prefix },
    });

    return { revoked: true, apiKeyId: apiKey.id };
  });

  app.post("/orgs/:orgId/api-keys/:apiKeyId/rotate", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const { orgId, apiKeyId } = request.params as { orgId: string; apiKeyId: string };
    const parsed = apiKeyRotateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", issues: parsed.error.flatten() });
    }

    if (auth.kind !== "session") {
      return reply.status(403).send({ error: "Session auth required for key management" });
    }

    if (!requireRoleForOrganization(auth, orgId, "ADMIN", reply)) return;

    const previous = await prisma.apiKey.findFirst({
      where: { id: apiKeyId, organizationId: orgId },
    });

    if (!previous) {
      return reply.status(404).send({ error: "API key not found" });
    }

    const rawKey = generateApiKeyValue();
    const parts = getApiKeyParts(rawKey);

    const result = await prisma.$transaction(async (tx) => {
      await tx.apiKey.update({
        where: { id: previous.id },
        data: { revokedAt: new Date() },
      });

      return tx.apiKey.create({
        data: {
          organizationId: previous.organizationId,
          userId: auth.userId,
          name: parsed.data.name ?? previous.name,
          prefix: parts.prefix,
          lastFour: parts.lastFour,
          secretHash: hashApiKey(rawKey),
          scopes: parsed.data.scopes ?? previous.scopes,
          expiresAt: parsed.data.expiresAt
            ? new Date(parsed.data.expiresAt)
            : previous.expiresAt ?? null,
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
    });

    await writeAuditLog({
      organizationId: orgId,
      actorName: actor(auth),
      action: "api_key.rotated",
      targetType: "ApiKey",
      targetId: result.id,
      metadata: {
        rotatedFromId: previous.id,
        prefix: result.prefix,
      },
    });

    return {
      apiKey: result,
      token: rawKey,
      revealOnce: true,
    };
  });

  app.get("/orgs/:orgId/audit-logs", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const { orgId } = request.params as { orgId: string };

    if (!requireRoleForOrganization(auth, orgId, "VIEWER", reply)) return;
    if (!requireScopes(auth, ["audit:read"], reply)) return;

    const logs = await prisma.auditLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return { logs };
  });
}
