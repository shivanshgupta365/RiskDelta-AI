import { requirePlatformAccess } from "@/server/auth/session";
import { renderPremiumFeaturePage } from "@/server/premium-page";

export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requirePlatformAccess();
  const resolvedParams = await params;

  return renderPremiumFeaturePage({
    feature: "policies",
    context,
    params: resolvedParams,
    communityTitle: "Policy detail is not included in the source-available branch",
    communityDescription:
      "Rule DSL, simulation history, and application attachment workflows remain part of the commercial edition.",
    forbiddenDescription:
      "Commercial policy detail is available only to ADMIN and OWNER members because it exposes rule logic, simulation history, and application attachment workflows.",
  });
}
