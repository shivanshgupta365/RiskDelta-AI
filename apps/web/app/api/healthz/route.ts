import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "riskdelta-web",
    timestamp: new Date().toISOString(),
  });
}
