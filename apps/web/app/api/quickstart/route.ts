import { NextResponse } from "next/server";
import { getApiPlatformContext } from "@/server/auth/api-context";
import { hasMinimumRole } from "@/server/auth/rbac";
import { getQuickstartDataForOrganization, verifyQuickstart } from "@/server/services/quickstart-service";

export async function GET(request: Request) {
  const context = await getApiPlatformContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const preset = searchParams.get("preset");
  const interactive = searchParams.get("interactive") === "1";

  const data = await getQuickstartDataForOrganization({
    organizationId: context.organization.id,
  });

  if (!interactive) {
    return NextResponse.json(data);
  }

  const selectedPreset = data.presets.find((item) => item.integrationType === preset) ?? data.presets[0] ?? null;
  return NextResponse.json({
    ...data,
    selectedPreset,
  });
}

export async function POST(request: Request) {
  const context = await getApiPlatformContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(context.membership?.role, "OPERATOR")) {
    return NextResponse.json({ error: "Operator access required" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      projectId?: string;
      integrationType?: "sdk" | "api" | "plugnplay";
      status?: "SUCCESS" | "WARNING" | "FAILED";
      notes?: string;
    };
    const projectId = body.projectId ?? context.projects[0]?.id;
    if (!projectId) {
      return NextResponse.json({ error: "Project is required for quickstart verification" }, { status: 400 });
    }
    return NextResponse.json(
      await verifyQuickstart({
        organizationId: context.organization.id,
        projectId,
        integrationType: body.integrationType ?? "sdk",
        status: body.status ?? "SUCCESS",
        notes: body.notes,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify quickstart" },
      { status: 400 },
    );
  }
}
