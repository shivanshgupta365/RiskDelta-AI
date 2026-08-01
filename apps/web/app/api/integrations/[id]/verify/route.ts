import { resolvePremiumWebApiRoute } from "@/server/premium-route";

export async function POST(request: Request) {
  return resolvePremiumWebApiRoute({ feature: "integrations", method: "POST", request });
}
