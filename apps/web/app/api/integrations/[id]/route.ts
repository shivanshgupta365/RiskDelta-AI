import { resolvePremiumWebApiRoute } from "@/server/premium-route";

export async function PATCH(request: Request) {
  return resolvePremiumWebApiRoute({ feature: "integrations", method: "PATCH", request });
}
