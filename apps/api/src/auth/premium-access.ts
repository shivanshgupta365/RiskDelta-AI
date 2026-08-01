import type { FastifyRequest } from "fastify";
import type { RiskDeltaEdition } from "@riskdelta/types";
import { loadApiEnv } from "@riskdelta/config";
import { resolvePremiumAccessDecision, type PremiumAccessDecision } from "@riskdelta/shared";
import type { AuthContext } from "./context";

export type PremiumApiContext = {
  authKind: "session" | "api_key";
  userId: string | null;
  apiKeyId: string | null;
  actorName: string;
  organizationId: string | null;
  membershipRole: string | null;
  edition: RiskDeltaEdition;
};

function requestedOrganizationId(request: FastifyRequest) {
  const header = request.headers["x-riskdelta-organization-id"];
  if (typeof header === "string" && header.trim().length > 0) return header.trim();
  if (Array.isArray(header) && header[0]) return header[0];
  return null;
}

export function resolvePremiumApiAccess({
  auth,
  request,
}: {
  auth: AuthContext | null;
  request: FastifyRequest;
}): {
  decision: PremiumAccessDecision;
  premiumContext: PremiumApiContext | null;
} {
  const env = loadApiEnv();
  const edition = env.RISKDELTA_EDITION;

  if (!auth) {
    return {
      decision: resolvePremiumAccessDecision({
        edition,
        isAuthenticated: false,
        isOnboarded: false,
      }),
      premiumContext: null,
    };
  }

  if (auth.kind === "api_key") {
    return {
      decision: resolvePremiumAccessDecision({
        edition,
        isAuthenticated: true,
        isOnboarded: true,
        role: null,
        minimumRole: "ADMIN",
      }),
      premiumContext: {
        authKind: "api_key",
        userId: null,
        apiKeyId: auth.apiKeyId,
        actorName: auth.actorName,
        organizationId: auth.organizationId,
        membershipRole: null,
        edition,
      },
    };
  }

  const scopedOrganizationId = requestedOrganizationId(request) ?? auth.organizationIds[0] ?? null;
  const membership = scopedOrganizationId
    ? auth.memberships.find((entry) => entry.organizationId === scopedOrganizationId) ?? null
    : null;

  return {
    decision: resolvePremiumAccessDecision({
      edition,
      isAuthenticated: true,
      isOnboarded: Boolean(scopedOrganizationId && membership),
      role: membership?.role ?? null,
      minimumRole: "ADMIN",
    }),
    premiumContext: {
      authKind: "session",
      userId: auth.userId,
      apiKeyId: null,
      actorName: auth.actorName,
      organizationId: scopedOrganizationId,
      membershipRole: membership?.role ?? null,
      edition,
    },
  };
}
