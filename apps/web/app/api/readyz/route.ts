import { NextResponse } from "next/server";
import { loadWebEnv } from "@riskdelta/config";

export async function GET() {
  const env = loadWebEnv();

  try {
    const response = await fetch(`${env.RISKDELTA_API_URL}/readyz`, {
      cache: "no-store",
      headers: {
        "x-request-id": `web-ready-${Date.now()}`,
      },
    });

    const payload = await response.json().catch(() => null);
    const ok = response.ok;

    return NextResponse.json(
      {
        ok,
        service: "riskdelta-web",
        api: payload ?? { ok: false },
        timestamp: new Date().toISOString(),
      },
      { status: ok ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "riskdelta-web",
        error: error instanceof Error ? error.message : "API readiness check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
