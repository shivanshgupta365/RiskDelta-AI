import type { CommercialFeatureId } from "@riskdelta/types";
import { CommercialFeatureNotice } from "@/components/commercial/commercial-feature-notice";
import { PremiumPermissionNotice } from "@/components/commercial/premium-permission-notice";
import { premiumFeatureAccessTitle, resolvePremiumWebAccess } from "@/server/premium-access";
import { renderPremiumPage } from "@/server/premium-module";
import type { getAuthContext } from "@/server/auth/session";

type WebAuthContext = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;

export async function renderPremiumFeaturePage({
  feature,
  context,
  communityTitle,
  communityDescription,
  forbiddenDescription,
  params,
}: {
  feature: CommercialFeatureId;
  context: WebAuthContext;
  communityTitle: string;
  communityDescription: string;
  forbiddenDescription: string;
  params?: Record<string, string | string[] | undefined>;
}) {
  const access = resolvePremiumWebAccess(context);

  if (!access.decision.allowed) {
    if (access.decision.reason === "community_build") {
      return (
        <CommercialFeatureNotice
          feature={feature}
          title={communityTitle}
          description={communityDescription}
        />
      );
    }

    return (
      <PremiumPermissionNotice
        title={premiumFeatureAccessTitle(feature)}
        description={forbiddenDescription}
      />
    );
  }

  const rendered = await renderPremiumPage({
    feature,
    context: access.premiumContext,
    params,
  });

  if (rendered) {
    return rendered;
  }

  return (
    <PremiumPermissionNotice
      title="Premium module is not mounted"
      description="This workspace allows commercial admin access, but the private premium page module is not attached to this deployment yet."
    />
  );
}
