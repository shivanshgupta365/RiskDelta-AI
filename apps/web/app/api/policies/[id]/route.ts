import { resolvePremiumWebApiRoute } from "@/server/premium-route";

export async function GET(request: Request) {
  return resolvePremiumWebApiRoute({ feature: "policies", method: "GET", request });
}

export async function PATCH(request: Request) {
  return resolvePremiumWebApiRoute({ feature: "policies", method: "PATCH", request });
}
