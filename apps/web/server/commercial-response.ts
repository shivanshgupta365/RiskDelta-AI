import { NextResponse } from "next/server";
import type { CommercialFeatureId } from "@riskdelta/types";

export function commercialFeatureResponse(feature: CommercialFeatureId, status = 403) {
  return NextResponse.json(
    {
      code: "commercial_feature_unavailable",
      error: `${feature} is reserved for the RiskDelta commercial edition.`,
      edition: "community-source-available",
      feature,
    },
    { status },
  );
}

export function premiumFeatureForbiddenResponse(feature: CommercialFeatureId, status = 403) {
  return NextResponse.json(
    {
      code: "forbidden",
      error: `${feature} requires ADMIN or OWNER access in the RiskDelta commercial edition.`,
      feature,
    },
    { status },
  );
}

export function premiumModuleUnavailableResponse(feature: CommercialFeatureId, status = 503) {
  return NextResponse.json(
    {
      code: "premium_module_unavailable",
      error: `${feature} is enabled for this build, but no private premium module is mounted.`,
      feature,
    },
    { status },
  );
}
