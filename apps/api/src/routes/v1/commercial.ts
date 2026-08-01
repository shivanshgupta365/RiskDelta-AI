import type { FastifyInstance, HTTPMethods } from "fastify";
import type { CommercialFeatureId } from "@riskdelta/types";
import { resolvePremiumApiAccess } from "../../auth/premium-access";
import { resolveAuthContext } from "../../auth/context";
import { resolvePremiumApiHandler } from "../../lib/premium-module";

type CommercialRoute = {
  method: HTTPMethods;
  url: string;
};

export function registerCommercialPlaceholderRoutes(
  app: FastifyInstance,
  feature: CommercialFeatureId,
  routes: CommercialRoute[],
) {
  for (const route of routes) {
    app.route({
      method: route.method,
      url: route.url,
      handler: async (request, reply) => {
        const auth = await resolveAuthContext(request);
        const access = resolvePremiumApiAccess({ auth, request });
        const decision = access.decision;

        if (decision.allowed === false) {
          if (decision.reason === "unauthenticated") {
            return reply.status(401).send({ error: "Unauthorized" });
          }

          if (decision.reason === "community_build") {
            return reply.status(403).send({
              code: "commercial_feature_unavailable",
              error: `${feature} is reserved for the RiskDelta commercial edition.`,
              edition: "community-source-available",
              feature,
            });
          }

          return reply.status(403).send({
            code: "forbidden",
            error: `${feature} requires ADMIN or OWNER access in the RiskDelta commercial edition.`,
            feature,
          });
        }

        const premiumHandler = await resolvePremiumApiHandler({
          feature,
          method: route.method,
          url: route.url,
          context: access.premiumContext!,
        });

        if (!premiumHandler) {
          return reply.status(503).send({
            code: "premium_module_unavailable",
            error: `${feature} is enabled for this build, but no private premium module is mounted.`,
            feature,
          });
        }

        return premiumHandler(request, reply);
      },
    });
  }
}
