import { resolvePremiumWebApiRoute } from "@/server/premium-route";

export async function GET(request: Request) {
  return resolvePremiumWebApiRoute({ feature: "runtime-controls", method: "GET", request });
}
