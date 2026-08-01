import { requirePlatformAccess } from "@/server/auth/session";
import { renderPremiumFeaturePage } from "@/server/premium-page";

export default async function RuntimeControlsPage() {
  const context = await requirePlatformAccess();

  return renderPremiumFeaturePage({
    feature: "runtime-controls",
    context,
    communityTitle: "Managed runtime controls are commercial-only in this repo",
    communityDescription:
      "PromptShield, DataGuard, ModelSwitch, AgentFence, and SentinelX stay documented as extension points here, but their managed operator surfaces are withheld from the public branch.",
    forbiddenDescription:
      "Commercial runtime controls are restricted to ADMIN and OWNER members because they govern intervention behavior, module configuration, and execution history.",
  });
}
