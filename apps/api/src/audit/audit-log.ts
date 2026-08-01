import { prisma } from "../db/prisma.js";
import type { Prisma } from "@prisma/client";

export async function writeAuditLog(input: {
  organizationId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorName: input.actorName,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
    },
  });
}
