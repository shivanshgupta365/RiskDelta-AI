import { pathToFileURL } from "node:url";
import { COMMERCIAL_EDITION, type CommercialFeatureId } from "@riskdelta/types";
import { loadApiEnv } from "@riskdelta/config";
import type { PremiumApiContext } from "../auth/premium-access";

type ApiRouteHandler = (request: unknown, reply: unknown) => Promise<unknown> | unknown;
type PremiumApiResolver = (args: {
  feature: CommercialFeatureId;
  method: string;
  url: string;
  context: PremiumApiContext;
}) => Promise<ApiRouteHandler | null> | ApiRouteHandler | null;

type PremiumApiModule = {
  resolveApiHandler?: PremiumApiResolver;
};

let cachedModulePromise: Promise<PremiumApiModule | null> | null = null;

async function loadPremiumApiModule() {
  const env = loadApiEnv();
  if (env.RISKDELTA_EDITION !== COMMERCIAL_EDITION) return null;
  if (!env.RISKDELTA_PREMIUM_MODULE_PATH) return null;

  if (!cachedModulePromise) {
    cachedModulePromise = import(pathToFileURL(env.RISKDELTA_PREMIUM_MODULE_PATH).href)
      .then((module) => module as PremiumApiModule)
      .catch((error) => {
        console.error("[api] failed to load premium module", error);
        return null;
      });
  }

  return cachedModulePromise;
}

export async function resolvePremiumApiHandler(args: {
  feature: CommercialFeatureId;
  method: string;
  url: string;
  context: PremiumApiContext;
}) {
  const module = await loadPremiumApiModule();
  if (!module?.resolveApiHandler) return null;
  return module.resolveApiHandler(args);
}
