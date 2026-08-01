import { requirePlatformAccess } from "@/server/auth/session";
import { renderPremiumFeaturePage } from "@/server/premium-page";

export default async function RiskPage() {
  const context = await requirePlatformAccess();

  return renderPremiumFeaturePage({
    feature: "risk-workbench",
    context,
    communityTitle: "The dedicated risk workstation is commercial-only",
    communityDescription:
      "The public branch still computes community-safe runtime metadata for traces, but the premium scoring workbench and explainability surfaces are not shipped here.",
    forbiddenDescription:
      "Commercial risk workstation views are limited to ADMIN and OWNER members because they expose deeper factor analysis and scoring workflows beyond the public TraceVault baseline.",
  });
}
