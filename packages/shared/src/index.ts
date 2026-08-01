import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import {
  COMMERCIAL_EDITION,
  type PremiumAccessBlockedReason,
  type RiskDeltaEdition,
} from "@riskdelta/types";

export function createId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function nowIso() {
  return new Date().toISOString();
}

function deriveKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string, secret: string) {
  const iv = randomBytes(12);
  const key = deriveKey(secret);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptSecret(ciphertext: string, secret: string) {
  const buffer = Buffer.from(ciphertext, "base64url");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const payload = buffer.subarray(28);
  const key = deriveKey(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
}

export const ROLE_RANK = {
  VIEWER: 10,
  OPERATOR: 20,
  ADMIN: 30,
  OWNER: 40,
} as const;

export type Role = keyof typeof ROLE_RANK;

export function normalizeRole(role: string | null | undefined): Role {
  const candidate = String(role ?? "VIEWER").toUpperCase();
  if (candidate in ROLE_RANK) {
    return candidate as Role;
  }

  return "VIEWER";
}

export function hasMinimumRole(actual: string | null | undefined, required: Role) {
  return ROLE_RANK[normalizeRole(actual)] >= ROLE_RANK[required];
}

export type PremiumAccessDecision =
  | {
      allowed: true;
      minimumRole: Role;
      role: Role;
      edition: RiskDeltaEdition;
    }
  | {
      allowed: false;
      reason: PremiumAccessBlockedReason;
      minimumRole: Role;
      role: Role | null;
      edition: RiskDeltaEdition;
    };

export function resolvePremiumAccessDecision({
  edition,
  isAuthenticated,
  isOnboarded,
  role,
  minimumRole = "ADMIN",
}: {
  edition: RiskDeltaEdition;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  role?: string | null;
  minimumRole?: Role;
}): PremiumAccessDecision {
  const normalizedRole = role ? normalizeRole(role) : null;

  if (!isAuthenticated) {
    return {
      allowed: false,
      reason: "unauthenticated",
      minimumRole,
      role: normalizedRole,
      edition,
    };
  }

  if (!isOnboarded) {
    return {
      allowed: false,
      reason: "not_onboarded",
      minimumRole,
      role: normalizedRole,
      edition,
    };
  }

  if (edition !== COMMERCIAL_EDITION) {
    return {
      allowed: false,
      reason: "community_build",
      minimumRole,
      role: normalizedRole,
      edition,
    };
  }

  if (!normalizedRole || !hasMinimumRole(normalizedRole, minimumRole)) {
    return {
      allowed: false,
      reason: "insufficient_role",
      minimumRole,
      role: normalizedRole,
      edition,
    };
  }

  return {
    allowed: true,
    minimumRole,
    role: normalizedRole,
    edition,
  };
}
