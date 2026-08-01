import { requirePlatformAccess } from "@/server/auth/session";
import { renderPremiumFeaturePage } from "@/server/premium-page";

export default async function RuntimeControlDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const context = await requirePlatformAccess();
  const resolvedParams = await params;

  return renderPremiumFeaturePage({
    feature: "runtime-controls",
    context,
    params: resolvedParams,
    communityTitle: "Runtime control detail is withheld from the source-available edition",
    communityDescription:
      "Module configuration, intervention history, and attached application coverage remain part of the commercial operator surface.",
    forbiddenDescription:
      "Commercial runtime control detail is limited to ADMIN and OWNER members because it exposes configuration, attached coverage, and intervention history.",
  });
}
