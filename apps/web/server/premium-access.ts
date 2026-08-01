import type { CommercialFeatureId, RiskDeltaEdition } from "@riskdelta/types";
import { loadWebEnv } from "@riskdelta/config";
import { resolvePremiumAccessDecision, type PremiumAccessDecision } from "@riskdelta/shared";
import type { getAuthContext } from "@/server/auth/session";

type WebAuthContext = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;

export type PremiumWebContext = {
  authKind: "session";
  userId: string;
  actorName: string;
  organizationId: string;
  membershipRole: string | null;
  edition: RiskDeltaEdition;
};

export function resolvePremiumWebAccess(context: WebAuthContext): {
  decision: PremiumAccessDecision;
  premiumContext: PremiumWebContext;
} {
  const env = loadWebEnv();
  const edition = env.RISKDELTA_EDITION;
  const role = context.membership?.role ?? null;

  return {
    decision: resolvePremiumAccessDecision({
      edition,
      isAuthenticated: true,
      isOnboarded: Boolean(context.onboardingState?.completed && context.organization),
      role,
      minimumRole: "ADMIN",
    }),
    premiumContext: {
      authKind: "session",
      userId: context.user.id,
      actorName: context.user.fullName,
      organizationId: context.organization!.id,
      membershipRole: role,
      edition,
    },
  };
}

export function premiumFeatureAccessTitle(feature: CommercialFeatureId) {
  switch (feature) {
    case "policies":
      return "Policy authoring requires commercial admin access";
    case "runtime-controls":
      return "Runtime controls require commercial admin access";
    case "risk-workbench":
      return "Risk workstation requires commercial admin access";
    case "incidents":
      return "Incidents require commercial admin access";
    case "integrations":
      return "Integrations require commercial admin access";
  }
}
