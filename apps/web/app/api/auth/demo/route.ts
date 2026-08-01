import { NextResponse } from "next/server";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/env";

export async function POST() {
  if (!env.PUBLIC_DEMO_ENABLED) {
    return NextResponse.json({ error: "Public demo access is disabled" }, { status: 404 });
  }

  if (!env.PUBLIC_DEMO_USER_EMAIL) {
    return NextResponse.json({ error: "Public demo user is not configured" }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { email: env.PUBLIC_DEMO_USER_EMAIL },
    include: {
      onboardingState: true,
      memberships: {
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!user?.onboardingState?.completed || user.memberships[0]?.role !== "VIEWER") {
    return NextResponse.json({ error: "Public demo is not ready" }, { status: 503 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true, redirectTo: "/app/overview" });
}
