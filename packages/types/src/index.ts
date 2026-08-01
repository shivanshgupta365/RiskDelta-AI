import { z } from "zod";

export const RuntimeVerdictSchema = z.enum(["ALLOW", "TRANSFORM", "BLOCK", "REVIEW"]);
export const RuntimeSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const RiskDeltaEditionSchema = z.enum(["community-source-available", "commercial"]);
export const PremiumAccessBlockedReasonSchema = z.enum([
  "unauthenticated",
  "not_onboarded",
  "insufficient_role",
  "community_build",
]);

export const COMMUNITY_SOURCE_AVAILABLE_EDITION = "community-source-available";
export const COMMERCIAL_EDITION = "commercial";

export const commercialFeatureIds = [
  "policies",
  "runtime-controls",
  "risk-workbench",
  "incidents",
  "integrations",
] as const;

export const IngestTraceRequestSchema = z.object({
  requestId: z.string().min(1),
  projectId: z.string().min(1),
  environment: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  responsePreview: z.string().optional(),
  actor: z.string().min(1),
  sessionId: z.string().min(1),
  toolUsage: z
    .object({
      enabled: z.boolean(),
      tools: z.array(z.string()).default([]),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type IngestTraceRequest = z.infer<typeof IngestTraceRequestSchema>;
export type RuntimeVerdict = z.infer<typeof RuntimeVerdictSchema>;
export type RuntimeSeverity = z.infer<typeof RuntimeSeveritySchema>;
export type RiskDeltaEdition = z.infer<typeof RiskDeltaEditionSchema>;
export type CommercialFeatureId = (typeof commercialFeatureIds)[number];
export type PremiumAccessBlockedReason = z.infer<typeof PremiumAccessBlockedReasonSchema>;

export const InteractiveRouteStateSchema = z.object({
  topic: z.string().optional(),
  journey: z.string().optional(),
  chip: z.string().optional(),
  mode: z.string().optional(),
  flowStep: z.string().optional(),
  surface: z.string().optional(),
  profile: z.string().optional(),
  factor: z.string().optional(),
  stage: z.string().optional(),
  assurance: z.string().optional(),
  group: z.string().optional(),
  integration: z.string().optional(),
  preset: z.string().optional(),
  step: z.string().optional(),
  result: z.string().optional(),
  section: z.string().optional(),
  selected: z.string().optional(),
});

export const MarketingRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string().optional(),
  tone: z.enum(["neutral", "subtle", "elevated", "critical", "warning", "accent"]).optional(),
});

export const PublicMarketingPageSchema = z.object({
  page: z.enum(["docs-preview", "integrations", "pricing", "security"]),
  rows: z.array(MarketingRowSchema),
  updatedAt: z.string(),
});

export type InteractiveRouteState = z.infer<typeof InteractiveRouteStateSchema>;
export type MarketingRow = z.infer<typeof MarketingRowSchema>;
export type PublicMarketingPagePayload = z.infer<typeof PublicMarketingPageSchema>;
