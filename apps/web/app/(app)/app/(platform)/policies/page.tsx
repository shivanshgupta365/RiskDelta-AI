import { requirePlatformAccess } from "@/server/auth/session";
import { renderPremiumFeaturePage } from "@/server/premium-page";

export default async function PoliciesPage() {
  const context = await requirePlatformAccess();

  return renderPremiumFeaturePage({
    feature: "policies",
    context,
    communityTitle: "Policy authoring is reserved for the commercial edition",
    communityDescription:
      "The public source-available repo keeps trace ingestion, TraceVault, and Quickstart runnable. Deterministic policy inventory, simulation, and rule editing are withheld from this branch.",
    forbiddenDescription:
      "This deployment can expose commercial policy workflows, but only ADMIN and OWNER members can view or modify policy inventory, simulations, and rule editing surfaces.",
  });
}
