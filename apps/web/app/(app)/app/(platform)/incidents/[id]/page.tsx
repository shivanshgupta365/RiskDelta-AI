import { requirePlatformAccess } from "@/server/auth/session";
import { renderPremiumFeaturePage } from "@/server/premium-page";

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requirePlatformAccess();
  const resolvedParams = await params;

  return renderPremiumFeaturePage({
    feature: "incidents",
    context,
    params: resolvedParams,
    communityTitle: "Incident detail is not included in the public source-available repo",
    communityDescription:
      "Linked remediation, operator ownership, and incident timelines stay in the commercial edition.",
    forbiddenDescription:
      "Commercial incident detail is limited to ADMIN and OWNER members because it exposes operator ownership, remediation state, and incident timelines.",
  });
}
