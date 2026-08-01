import { requirePlatformAccess } from "@/server/auth/session";
import { renderPremiumFeaturePage } from "@/server/premium-page";

export default async function IncidentsPage() {
  const context = await requirePlatformAccess();

  return renderPremiumFeaturePage({
    feature: "incidents",
    context,
    communityTitle: "Incident workflow is reserved for the commercial edition",
    communityDescription:
      "The source-available branch preserves the trace evidence chain, but investigation queueing, remediation workflows, and case management are intentionally withheld.",
    forbiddenDescription:
      "Commercial incident queues are limited to ADMIN and OWNER members because they control remediation workflow, escalation ownership, and timeline updates.",
  });
}
