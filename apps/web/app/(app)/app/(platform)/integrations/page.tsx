import { requirePlatformAccess } from "@/server/auth/session";
import { renderPremiumFeaturePage } from "@/server/premium-page";

export default async function IntegrationsPage() {
  const context = await requirePlatformAccess();

  return renderPremiumFeaturePage({
    feature: "integrations",
    context,
    communityTitle: "Managed integrations are commercial-only",
    communityDescription:
      "The source-available repo keeps SDK and direct API ingestion public. Enterprise connectors, verification flows, and managed provider attachments are withheld from this branch.",
    forbiddenDescription:
      "Commercial integrations are limited to ADMIN and OWNER members because they manage provider attachments, verification flows, and enterprise connector state.",
  });
}
