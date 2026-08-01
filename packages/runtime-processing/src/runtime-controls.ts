type RuntimeVerdict = "ALLOW" | "TRANSFORM" | "BLOCK" | "REVIEW";
type RuntimeSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type RuntimeControlContext = {
  verdict: RuntimeVerdict;
  severity: RuntimeSeverity;
  policyMatched: boolean;
  riskyToolCalls: number;
  containsSensitiveData: boolean;
  destinationCount: number;
  selectedModel?: string | null;
};

export type RuntimeControlExecution = {
  name: "PromptShield" | "DataGuard" | "ModelSwitch" | "AgentFence" | "SentinelX";
  slug: string;
  moduleKey: string;
  status: string;
  summary: string;
  action: string;
  recentAction: string;
  config: Record<string, unknown>;
};

export function executeRuntimeControls(context: RuntimeControlContext): RuntimeControlExecution[] {
  const now = new Date().toISOString();

  const promptShield: RuntimeControlExecution = {
    name: "PromptShield",
    slug: "promptshield",
    moduleKey: "promptshield",
    status: context.severity === "CRITICAL" ? "ESCALATED" : "ACTIVE",
    summary:
      context.severity === "CRITICAL"
        ? "Prompt intent exceeded critical threshold and triggered escalation."
        : "Prompt stream stayed within active boundary checks.",
    action: context.severity === "CRITICAL" ? "Escalate prompt risk" : "Monitor prompt",
    recentAction:
      context.severity === "CRITICAL"
        ? `${now} Escalated prompt for critical runtime intent`
        : `${now} Prompt remained inside baseline envelope`,
    config: {
      detectionThreshold: 0.68,
      strictMode: context.severity === "CRITICAL",
    },
  };

  const dataGuardNeedsRedaction = context.verdict === "TRANSFORM" || context.containsSensitiveData;
  const dataGuard: RuntimeControlExecution = {
    name: "DataGuard",
    slug: "dataguard",
    moduleKey: "dataguard",
    status: dataGuardNeedsRedaction ? "ENFORCED" : "ACTIVE",
    summary: dataGuardNeedsRedaction
      ? "Sensitive output profile triggered mandatory redaction path."
      : "No redaction required for this trace.",
    action: dataGuardNeedsRedaction ? "Redact output" : "Inspect output",
    recentAction: dataGuardNeedsRedaction
      ? `${now} Redacted sensitive output before release`
      : `${now} Evaluated output with no sanitation changes`,
    config: {
      redactionMode: "mask",
      detectors: ["email", "phone", "token"],
    },
  };

  const switchedModel = Boolean(context.selectedModel);
  const modelSwitch: RuntimeControlExecution = {
    name: "ModelSwitch",
    slug: "modelswitch",
    moduleKey: "modelswitch",
    status: switchedModel ? "ENFORCED" : "ACTIVE",
    summary: switchedModel
      ? `Elevated risk moved execution to ${context.selectedModel}.`
      : "Primary model lane remained stable.",
    action: switchedModel ? "Route to safer model profile" : "Keep model",
    recentAction: switchedModel
      ? `${now} Routed trace to ${context.selectedModel}`
      : `${now} Kept primary model profile`,
    config: {
      fallbackModel: "gpt-4.1-mini-safe",
      threshold: 0.58,
    },
  };

  const agentFenceActive = context.riskyToolCalls > 0 || context.destinationCount > 0;
  const agentFence: RuntimeControlExecution = {
    name: "AgentFence",
    slug: "agentfence",
    moduleKey: "agentfence",
    status: agentFenceActive ? "ENFORCED" : "ACTIVE",
    summary: agentFenceActive
      ? `${context.riskyToolCalls} high-risk tool path(s) constrained for outbound safety.`
      : "No high-risk tool surface detected.",
    action: agentFenceActive ? "Constrain high-risk tools" : "Tool surface stable",
    recentAction: agentFenceActive
      ? `${now} Applied tool boundary constraints`
      : `${now} No boundary constraints required`,
    config: {
      restrictedTools: ["browser", "filesystem", "shell", "terminal", "http", "webhook"],
      outboundPolicy: "allowlist",
    },
  };

  const sentinelEscalated = context.verdict === "BLOCK" || context.severity === "CRITICAL";
  const sentinelX: RuntimeControlExecution = {
    name: "SentinelX",
    slug: "sentinelx",
    moduleKey: "sentinelx",
    status: sentinelEscalated ? "ESCALATED" : context.verdict === "REVIEW" ? "ENFORCED" : "ACTIVE",
    summary: context.policyMatched
      ? "Policy and runtime signals converged on final verdict."
      : "Final verdict issued from risk posture without direct policy match.",
    action: context.verdict,
    recentAction: sentinelEscalated
      ? `${now} Opened escalation path for critical verdict`
      : `${now} Issued ${context.verdict} verdict`,
    config: {
      incidentThreshold: 0.84,
      reviewThreshold: 0.61,
    },
  };

  return [promptShield, dataGuard, modelSwitch, agentFence, sentinelX];
}
