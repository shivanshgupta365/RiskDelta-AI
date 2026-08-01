import type { CommercialFeatureId } from "@riskdelta/types";
import { getApiContext } from "@/server/auth/api-context";
import {
  commercialFeatureResponse,
  premiumFeatureForbiddenResponse,
  premiumModuleUnavailableResponse,
} from "@/server/commercial-response";
import { resolvePremiumWebAccess } from "@/server/premium-access";
import { resolvePremiumWebApiHandler } from "@/server/premium-module";

export async function resolvePremiumWebApiRoute({
  feature,
  method,
  request,
}: {
  feature: CommercialFeatureId;
  method: string;
  request: Request;
}) {
  const context = await getApiContext();
  if (!context) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const access = resolvePremiumWebAccess(context);

  if (!access.decision.allowed) {
    if (access.decision.reason === "community_build") {
      return commercialFeatureResponse(feature);
    }

    return premiumFeatureForbiddenResponse(feature);
  }

  const handler = await resolvePremiumWebApiHandler({
    feature,
    method,
    request,
    context: access.premiumContext,
  });

  if (!handler) {
    return premiumModuleUnavailableResponse(feature);
  }

  return handler(request);
}
