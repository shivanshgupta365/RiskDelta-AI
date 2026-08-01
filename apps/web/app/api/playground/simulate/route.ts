import { NextResponse } from "next/server";
import { getApiPlatformContext } from "@/server/auth/api-context";
import { ingestTrace } from "@/server/services/trace-service";
import { hasMinimumRole } from "@/server/auth/rbac";

export async function POST(request: Request) {
  const context = await getApiPlatformContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(context.membership?.role, "OPERATOR")) {
    return NextResponse.json({ error: "Operator access required" }, { status: 403 });
  }

  try {
    const trace = await ingestTrace({
      organizationId: context.organization.id,
      input: await request.json(),
    });
    return NextResponse.json({ trace });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to simulate request" }, { status: 400 });
  }
}
