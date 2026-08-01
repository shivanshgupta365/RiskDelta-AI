import { pathToFileURL } from "node:url";
import { COMMERCIAL_EDITION, type CommercialFeatureId } from "@riskdelta/types";
import { loadWebEnv } from "@riskdelta/config";
import type { NextResponse } from "next/server";
import type { ReactNode } from "react";
import type { PremiumWebContext } from "@/server/premium-access";

type WebApiRouteHandler = (request: Request) => Promise<NextResponse> | NextResponse;
type PremiumWebResolver = (args: {
  feature: CommercialFeatureId;
  method: string;
  request: Request;
  context: PremiumWebContext;
}) => Promise<WebApiRouteHandler | null> | WebApiRouteHandler | null;

type PremiumPageResolver = (args: {
  feature: CommercialFeatureId;
  context: PremiumWebContext;
  params?: Record<string, string | string[] | undefined>;
}) => Promise<ReactNode | null> | ReactNode | null;

type PremiumWebModule = {
  resolveWebApiHandler?: PremiumWebResolver;
  renderPremiumPage?: PremiumPageResolver;
};

let cachedModulePromise: Promise<PremiumWebModule | null> | null = null;

async function loadPremiumWebModule() {
  const env = loadWebEnv();
  if (env.RISKDELTA_EDITION !== COMMERCIAL_EDITION) return null;
  if (!env.RISKDELTA_PREMIUM_MODULE_PATH) return null;

  if (!cachedModulePromise) {
    cachedModulePromise = import(pathToFileURL(env.RISKDELTA_PREMIUM_MODULE_PATH).href)
      .then((module) => module as PremiumWebModule)
      .catch((error) => {
        console.error("[web] failed to load premium module", error);
        return null;
      });
  }

  return cachedModulePromise;
}

export async function resolvePremiumWebApiHandler(args: {
  feature: CommercialFeatureId;
  method: string;
  request: Request;
  context: PremiumWebContext;
}) {
  const premiumModule = await loadPremiumWebModule();
  if (!premiumModule?.resolveWebApiHandler) return null;
  return premiumModule.resolveWebApiHandler(args);
}

export async function renderPremiumPage(args: {
  feature: CommercialFeatureId;
  context: PremiumWebContext;
  params?: Record<string, string | string[] | undefined>;
}) {
  const premiumModule = await loadPremiumWebModule();
  if (!premiumModule?.renderPremiumPage) return null;
  return premiumModule.renderPremiumPage(args);
}
