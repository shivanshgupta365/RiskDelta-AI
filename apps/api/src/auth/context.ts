import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db/prisma.js";
import { hashApiKey } from "../utils/api-keys.js";
import { hasMinimumRole, type Role } from "./rbac.js";

type SessionAuthContext = {
  kind: "session";
  userId: string;
  actorName: string;
  organizationIds: string[];
  memberships: Array<{ organizationId: string; role: string }>;
};

type ApiKeyAuthContext = {
  kind: "api_key";
  apiKeyId: string;
  actorName: string;
  organizationId: string;
  scopes: string[];
};

export type AuthContext = SessionAuthContext | ApiKeyAuthContext;

function getCookieValue(rawCookie: string | undefined, key: string) {
  if (!rawCookie) return null;
  const pair = rawCookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${key}=`));

  if (!pair) return null;
  return decodeURIComponent(pair.split("=").slice(1).join("="));
}

function getAuthToken(request: FastifyRequest) {
  const authHeader = request.headers.authorization;
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const cookieToken = getCookieValue(request.headers.cookie, "riskdelta_session");
  if (cookieToken) return cookieToken;

  return null;
}

export async function resolveAuthContext(request: FastifyRequest): Promise<AuthContext | null> {
  const token = getAuthToken(request);
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    include: {
      user: {
        include: {
          memberships: true,
        },
      },
    },
  });

  if (session && session.expiresAt > new Date()) {
    return {
      kind: "session",
      userId: session.userId,
      actorName: session.user.fullName,
      organizationIds: session.user.memberships.map((membership) => membership.organizationId),
      memberships: session.user.memberships.map((membership) => ({
        organizationId: membership.organizationId,
        role: membership.role,
      })),
    };
  }

  const secretHash = hashApiKey(token);
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      secretHash,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  if (!apiKey) {
    return null;
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    kind: "api_key",
    apiKeyId: apiKey.id,
    organizationId: apiKey.organizationId,
    scopes: apiKey.scopes,
    actorName: `api-key:${apiKey.prefix}`,
  };
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const auth = await resolveAuthContext(request);
  if (!auth) {
    reply.status(401).send({ error: "Unauthorized" });
    return null;
  }

  return auth;
}

export function canAccessOrganization(auth: AuthContext, organizationId: string) {
  if (auth.kind === "api_key") {
    return auth.organizationId === organizationId;
  }

  return auth.organizationIds.includes(organizationId);
}

export function requireRoleForOrganization(
  auth: AuthContext,
  organizationId: string,
  requiredRole: Role,
  reply: FastifyReply,
) {
  if (!canAccessOrganization(auth, organizationId)) {
    reply.status(403).send({ error: "Forbidden for organization scope" });
    return false;
  }

  if (auth.kind === "api_key") {
    return true;
  }

  const membership = auth.memberships.find((entry) => entry.organizationId === organizationId);
  if (!membership || !hasMinimumRole(membership.role, requiredRole)) {
    reply.status(403).send({ error: `Requires ${requiredRole} role` });
    return false;
  }

  return true;
}

export function requireScopes(
  auth: AuthContext,
  scopes: string[],
  reply: FastifyReply,
) {
  if (auth.kind === "session") return true;
  const missing = scopes.filter((scope) => !auth.scopes.includes(scope));
  if (missing.length > 0) {
    reply.status(403).send({ error: "Missing API key scopes", missingScopes: missing });
    return false;
  }

  return true;
}
