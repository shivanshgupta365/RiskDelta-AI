import type { Prisma, PrismaClient } from "@prisma/client";
import {
  evaluatePolicies,
  evaluatePolicyDefinition,
  PolicyDefinitionSchema,
} from "@riskdelta/policy-engine";
import { scoreRisk } from "@riskdelta/risk-engine";
import { executeRuntimeControls } from "./runtime-controls";

export type RuntimeProcessingJob = {
  traceId: string;
  traceSessionId: string;
  organizationId: string;
  prompt: string;
  toolCalls: string[];
  destinationCount: number;
  containsSensitiveData: boolean;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function incidentTitle(args: {
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  verdict: "ALLOW" | "TRANSFORM" | "BLOCK" | "REVIEW";
  requestId: string;
  topSignal?: string;
}) {
  if (args.severity === "CRITICAL" || args.verdict === "BLOCK") {
    return `Critical runtime escalation for ${args.requestId}`;
  }
  if (args.verdict === "REVIEW") {
    return `Runtime review required for ${args.requestId}`;
  }
  if (args.topSignal) {
    return `Runtime anomaly detected: ${args.topSignal.replace(/[._]/g, " ")}`;
  }
  return `Runtime incident for ${args.requestId}`;
}

function policySignals(args: {
  prompt: string;
  toolCalls: string[];
  destinationCount: number;
  factors: Array<{ key: string; score: number; detail: string }>;
}) {
  const baseSignals = args.factors.map((factor) => ({
    key: factor.key,
    weight: factor.score,
    description: factor.detail,
  }));

  const hasExfilIntent = /export|exfil|upload|without notifying|silent/i.test(args.prompt);
  if (hasExfilIntent) {
    baseSignals.push({
      key: "agent.tool_exfil",
      weight: 0.68,
      description: "Prompt intent suggests silent outbound transfer.",
    });
  }

  if (args.destinationCount > 0) {
    baseSignals.push({
      key: "runtime.external_call",
      weight: 0.55,
      description: "Outbound target present in requested workflow.",
    });
  }

  if (args.toolCalls.length > 0) {
    baseSignals.push({
      key: "agent.autonomy",
      weight: Math.min(1, 0.24 + args.toolCalls.length * 0.12),
      description: "Tool-enabled runtime path detected.",
    });
  }

  return baseSignals;
}

export async function processRuntimeTrace({
  payload,
  prisma,
  jobId = `sync_${Date.now()}`,
  actorName = "riskdelta-worker",
}: {
  payload: Partial<RuntimeProcessingJob>;
  prisma: PrismaClient;
  jobId?: string;
  actorName?: string;
}) {
  const traceId = payload.traceId;
  const traceSessionId = payload.traceSessionId;
  const organizationId = payload.organizationId;

  if (!traceId || !traceSessionId || !organizationId) {
    throw new Error("Invalid runtime job payload");
  }

  const prompt = payload.prompt ?? "";
  const toolCalls = payload.toolCalls ?? [];
  const destinationCount = payload.destinationCount ?? 0;
  const sensitive = payload.containsSensitiveData ?? false;

  const risk = scoreRisk({
    prompt,
    toolCalls,
    destinationCount,
    containsSensitiveData: sensitive,
  });

  const policy = evaluatePolicies({
    riskScore: risk.score,
    toolCalls,
  });

  const signals = policySignals({
    prompt,
    toolCalls,
    destinationCount,
    factors: risk.factors,
  });

  const activePolicyVersions = await prisma.policyVersion.findMany({
    where: {
      isActive: true,
      policy: {
        organizationId,
      },
    },
    include: {
      policy: true,
    },
    orderBy: [{ policyId: "asc" }, { version: "desc" }],
  });

  const policyEvaluations = activePolicyVersions
    .map((version) => {
      const parsed = PolicyDefinitionSchema.safeParse(version.definition);
      if (!parsed.success) return null;
      const evaluated = evaluatePolicyDefinition({
        definition: parsed.data,
        signals,
        riskScore: risk.score,
        metadata: {
          environment: "runtime",
          provider: "runtime",
          channel: toolCalls.length > 0 ? "agent" : "api",
        },
      });
      return {
        version,
        definition: parsed.data,
        evaluated,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const enforceActions = policyEvaluations.flatMap((entry) =>
    entry.version.policy.mode === "ENFORCE" ? entry.evaluated.actions : [],
  );
  const simulateMatches = policyEvaluations.flatMap((entry) =>
    entry.version.policy.mode === "SIMULATE" ? entry.evaluated.matches : [],
  );

  const riskyToolCalls = toolCalls.filter((tool) =>
    ["browser", "filesystem", "shell", "terminal", "http", "webhook"].some((token) =>
      tool.toLowerCase().includes(token),
    ),
  ).length;

  let finalVerdict = policy.verdict;
  if (enforceActions.includes("BLOCK")) {
    finalVerdict = "BLOCK";
  } else if (enforceActions.includes("REDACT")) {
    finalVerdict = "TRANSFORM";
  } else if (enforceActions.includes("REQUIRE_APPROVAL") || enforceActions.includes("ALERT")) {
    finalVerdict = "REVIEW";
  }

  const policyMatched = policy.matched || enforceActions.length > 0 || simulateMatches.length > 0;
  const confidence = clamp(0.45 + risk.score * 0.5 + (policyMatched ? 0.05 : 0));
  const controlExecutions = executeRuntimeControls({
    verdict: finalVerdict,
    severity: risk.severity,
    policyMatched,
    riskyToolCalls,
    containsSensitiveData: sensitive,
    destinationCount,
    selectedModel: enforceActions.includes("FALLBACK_MODEL") ? "gpt-4.1-mini-safe" : null,
  });
  const actions = controlExecutions.map((execution) => ({
    control: execution.name,
    action: execution.action,
    summary: execution.summary,
  }));

  const dimensionScores = risk.factors.map((factor) => ({
    key: factor.key,
    label: factor.key.replace(/[._]/g, " "),
    score: factor.score,
    weight: factor.weight,
    explanation: factor.detail,
  }));

  const explainability = `${risk.explainability} ${policy.reason}`;

  try {
    const trace = await prisma.trace.findFirst({
      where: {
        id: traceId,
        organizationId,
      },
      select: {
        id: true,
        projectId: true,
        requestId: true,
        tags: true,
      },
    });

    if (!trace) {
      throw new Error(`Trace not found for runtime job: ${traceId}`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.riskEvent.deleteMany({
        where: { traceId: trace.id },
      });

      const existingRuns = await tx.policyRun.findMany({
        where: { traceId: trace.id },
        select: { id: true },
      });
      if (existingRuns.length > 0) {
        await tx.policyMatch.deleteMany({
          where: {
            policyRunId: {
              in: existingRuns.map((run) => run.id),
            },
          },
        });
        await tx.policyRun.deleteMany({
          where: {
            id: {
              in: existingRuns.map((run) => run.id),
            },
          },
        });
      }

      await tx.trace.update({
        where: { id: trace.id },
        data: {
          riskScore: risk.score,
          confidence,
          severity: risk.severity,
          verdict: finalVerdict,
          blocked: finalVerdict === "BLOCK",
          redacted: finalVerdict === "TRANSFORM",
          selectedModel: enforceActions.includes("FALLBACK_MODEL") ? "gpt-4.1-mini-safe" : null,
          explainability,
          dimensionScores: dimensionScores,
          runtimeActions: actions,
          signals,
          tags: Array.from(
            new Set([
              ...trace.tags,
              "processed",
              finalVerdict.toLowerCase(),
              risk.severity.toLowerCase(),
            ]),
          ),
        },
      });

      await tx.riskEvent.createMany({
        data: risk.factors.map((factor) => ({
          traceId: trace.id,
          dimensionKey: factor.key,
          title: factor.key.replace(/[._]/g, " "),
          severity: risk.severity,
          score: factor.score,
          confidence,
          explanation: factor.detail,
        })),
      });

      await tx.riskAssessment.create({
        data: {
          organizationId,
          traceId: trace.id,
          traceSessionId,
          score: risk.score,
          confidence,
          severity: risk.severity,
          verdict: finalVerdict,
          explainability,
          factors: {
            riskFactors: risk.factors,
            policySignals: signals,
          },
        },
      });

      await tx.traceToolCall.updateMany({
        where: {
          traceId: trace.id,
        },
        data: {
          status:
            finalVerdict === "BLOCK"
              ? "BLOCKED"
              : finalVerdict === "TRANSFORM"
                ? "SANITIZED"
                : "ALLOWED",
          blocked: finalVerdict === "BLOCK",
        },
      });

      for (const evaluation of policyEvaluations) {
        const run = await tx.policyRun.create({
          data: {
            traceId: trace.id,
            policyVersionId: evaluation.version.id,
            mode: evaluation.version.policy.mode,
            outcome: evaluation.evaluated.matches.length > 0 ? "MATCHED" : "NO_MATCH",
          },
        });

        if (evaluation.evaluated.matches.length > 0) {
          await tx.policyMatch.createMany({
            data: evaluation.evaluated.matches.map((match) => ({
              policyRunId: run.id,
              ruleId: match.id,
              title: match.title,
              action: match.action,
              weight: match.weight,
              condition: match.condition,
            })),
          });
        }
      }

      for (const control of controlExecutions) {
        const existingControl = await tx.runtimeControl.findFirst({
          where: {
            organizationId,
            slug: control.slug,
          },
        });

        const mergedRecentActions = Array.from(
          new Set([control.recentAction, ...(existingControl?.recentActions ?? [])]),
        ).slice(0, 12);

        const runtimeControl = existingControl
          ? await tx.runtimeControl.update({
              where: { id: existingControl.id },
              data: {
                name: control.name,
                moduleKey: control.moduleKey,
                status: control.status,
                summary: control.summary,
                config: control.config as Prisma.InputJsonValue,
                recentActions: mergedRecentActions,
              },
            })
          : await tx.runtimeControl.create({
              data: {
                organizationId,
                name: control.name,
                slug: control.slug,
                moduleKey: control.moduleKey,
                status: control.status,
                summary: control.summary,
                config: control.config as Prisma.InputJsonValue,
                recentActions: mergedRecentActions,
              },
            });

        await tx.projectRuntimeControl.upsert({
          where: {
            projectId_runtimeControlId: {
              projectId: trace.projectId,
              runtimeControlId: runtimeControl.id,
            },
          },
          update: {},
          create: {
            projectId: trace.projectId,
            runtimeControlId: runtimeControl.id,
          },
        });
      }

      const matchedRuleCount = policyEvaluations.reduce(
        (sum, entry) => sum + entry.evaluated.matches.length,
        0,
      );

      const shouldOpenIncident =
        finalVerdict === "BLOCK" ||
        risk.severity === "CRITICAL" ||
        enforceActions.includes("ALERT") ||
        enforceActions.includes("REQUIRE_APPROVAL");

      let incidentId: string | null = null;
      if (shouldOpenIncident) {
        const existingIncident = await tx.incident.findUnique({
          where: { traceId: trace.id },
        });

        const timelineEntry = {
          at: new Date().toISOString(),
          title: "Runtime processing completed",
          detail: `Verdict ${finalVerdict} with score ${risk.score.toFixed(2)} and ${matchedRuleCount} matched rule(s).`,
        };

        const existingTimeline = Array.isArray(existingIncident?.timeline)
          ? (existingIncident.timeline as Array<{ at: string; title: string; detail: string }>)
          : [];
        const timeline = [...existingTimeline, timelineEntry].slice(-20);

        if (existingIncident) {
          const updatedIncident = await tx.incident.update({
            where: { id: existingIncident.id },
            data: {
              severity: risk.severity,
              status:
                existingIncident.status === "RESOLVED" ? "INVESTIGATING" : existingIncident.status,
              summary: explainability,
              rootCause: signals[0]?.description ?? existingIncident.rootCause,
              remediationNotes:
                finalVerdict === "BLOCK"
                  ? "Review trace evidence, tighten policy scope, and validate outbound controls."
                  : existingIncident.remediationNotes,
              triggerSource:
                controlExecutions.find((item) => item.name === "SentinelX")?.summary ??
                existingIncident.triggerSource,
              timeline,
            },
          });
          incidentId = updatedIncident.id;
        } else {
          const createdIncident = await tx.incident.create({
            data: {
              organizationId,
              projectId: trace.projectId,
              traceId: trace.id,
              title: incidentTitle({
                severity: risk.severity,
                verdict: finalVerdict,
                requestId: trace.requestId,
                topSignal: signals[0]?.key,
              }),
              slug: `${slugify(trace.requestId)}-${Date.now().toString().slice(-4)}`,
              severity: risk.severity,
              status: "OPEN",
              summary: explainability,
              rootCause:
                signals[0]?.description ??
                "Runtime risk concentration crossed the incident threshold.",
              remediationNotes:
                "Inspect linked trace evidence, confirm policy coverage, and re-run with tighter runtime boundaries.",
              triggerSource:
                controlExecutions.find((item) => item.name === "SentinelX")?.summary ??
                "SentinelX triggered escalation",
              assigneeName: null,
              timeline,
            },
          });
          incidentId = createdIncident.id;
        }

        if (incidentId) {
          await tx.incidentEvent.createMany({
            data: [
              {
                incidentId,
                eventType: "TRACE_LINKED",
                message: `Trace ${trace.requestId} linked to incident pipeline`,
                metadata: {
                  traceId: trace.id,
                  traceSessionId,
                  verdict: finalVerdict,
                  severity: risk.severity,
                },
              },
              {
                incidentId,
                eventType: "POLICY_CHAIN_EVALUATED",
                message: `${matchedRuleCount} policy rule(s) matched during runtime evaluation`,
                metadata: {
                  traceId: trace.id,
                  matchedRules: matchedRuleCount,
                  policyEvaluated: policyEvaluations.length,
                },
              },
              {
                incidentId,
                eventType: "RUNTIME_CONTROLS_APPLIED",
                message: `${controlExecutions.length} runtime control module(s) applied`,
                metadata: {
                  traceId: trace.id,
                  controls: controlExecutions.map((entry) => ({
                    name: entry.name,
                    action: entry.action,
                    status: entry.status,
                  })),
                },
              },
              {
                incidentId,
                eventType: "INCIDENT_ESCALATED",
                message: `Incident escalated with verdict ${finalVerdict}`,
                metadata: {
                  traceId: trace.id,
                  verdict: finalVerdict,
                  score: risk.score,
                },
              },
            ],
          });
        }
      }

      await tx.traceEvent.createMany({
        data: [
          {
            organizationId,
            traceSessionId,
            eventType: "RISK_ASSESSED",
            payload: {
              traceId: trace.id,
              score: risk.score,
              severity: risk.severity,
              confidence,
            },
          },
          {
            organizationId,
            traceSessionId,
            eventType: "POLICY_EVALUATED",
            payload: {
              traceId: trace.id,
              matched: policyMatched,
              matchedCount: matchedRuleCount,
              verdict: finalVerdict,
              reason: policy.reason,
            },
          },
          {
            organizationId,
            traceSessionId,
            eventType: "RUNTIME_CONTROLS_APPLIED",
            payload: {
              traceId: trace.id,
              actions,
              controls: controlExecutions.map((entry) => ({
                name: entry.name,
                status: entry.status,
                action: entry.action,
              })),
            },
          },
          ...(incidentId
            ? [
                {
                  organizationId,
                  traceSessionId,
                  eventType: "INCIDENT_OPENED",
                  payload: {
                    traceId: trace.id,
                    incidentId,
                    severity: risk.severity,
                    verdict: finalVerdict,
                  },
                },
              ]
            : []),
          {
            organizationId,
            traceSessionId,
            eventType: "PROCESSING_COMPLETED",
            payload: {
              traceId: trace.id,
              jobId,
            },
          },
        ],
      });

      await tx.traceSession.update({
        where: { id: traceSessionId },
        data: {
          status: finalVerdict === "BLOCK" ? "BLOCKED" : "CLOSED",
          endedAt: new Date(),
        },
      });

      await tx.project.update({
        where: { id: trace.projectId },
        data: {
          lastActivity: new Date(),
          riskStatus: risk.severity,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorName,
          action: "trace.processed",
          targetType: "Trace",
          targetId: trace.id,
          metadata: {
            jobId,
            verdict: finalVerdict,
            score: risk.score,
            severity: risk.severity,
            policyEvaluated: policyEvaluations.length,
            incidentOpened: shouldOpenIncident,
          },
        },
      });
    });
  } catch (error) {
    await prisma.traceEvent.create({
      data: {
        organizationId,
        traceSessionId,
        eventType: "PROCESSING_FAILED",
        payload: {
          traceId,
          jobId,
          reason: error instanceof Error ? error.message : "Unknown error",
        },
      },
    });

    throw error;
  }

  return {
    risk,
    policy: {
      ...policy,
      matched: policyMatched,
      verdict: finalVerdict,
    },
    processedAt: new Date().toISOString(),
  };
}

export { executeRuntimeControls } from "./runtime-controls";
