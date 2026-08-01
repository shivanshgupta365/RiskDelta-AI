import dotenv from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/server/auth/password";
import { buildTraceEvaluation, buildToolCallRecords } from "@/server/risk/engine";
import { generatePolicyDsl } from "@/server/policies/dsl";
import { createApiKeyRecord } from "@/server/enforcement/api-keys";
import type { PolicyEditorInput } from "@/lib/types";
import {
  defaultPolicyTemplates,
  integrationBlueprints,
  quickstartPresets,
  runtimeControlBlueprints,
  seedTraceInputs,
} from "@/server/services/catalog";
import { slugify } from "@/lib/utils";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env"), override: false });

const prisma = new PrismaClient();

function maskApiKey(rawKey: string) {
  const visibleSuffix = rawKey.slice(-4);
  return `****${visibleSuffix}`;
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.incidentEvent.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.riskAssessment.deleteMany();
  await prisma.riskEvent.deleteMany();
  await prisma.policyMatch.deleteMany();
  await prisma.policyRun.deleteMany();
  await prisma.traceEvent.deleteMany();
  await prisma.traceToolCall.deleteMany();
  await prisma.traceSession.deleteMany();
  await prisma.trace.deleteMany();
  await prisma.application.deleteMany();
  await prisma.environment.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.projectRuntimeControl.deleteMany();
  await prisma.runtimeControl.deleteMany();
  await prisma.projectPolicy.deleteMany();
  await prisma.policyVersion.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.project.deleteMany();
  await prisma.onboardingState.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.session.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hashPassword(process.env.DEMO_USER_PASSWORD ?? "RiskDeltaDemo123!");

  const owner = await prisma.user.create({
    data: {
      fullName: "Amelia Reed",
      email: process.env.DEMO_USER_EMAIL ?? "founder@riskdelta.dev",
      companyName: "Northstar Dynamics",
      passwordHash,
    },
  });

  const analysts = await Promise.all(
    [
      {
        fullName: "Jonas Patel",
        email: "jonas@riskdelta.dev",
        companyName: "Northstar Dynamics",
        passwordHash,
      },
      {
        fullName: "Mira Chen",
        email: "mira@riskdelta.dev",
        companyName: "Northstar Dynamics",
        passwordHash,
      },
    ].map((data) => prisma.user.create({ data })),
  );

  const publicDemoUser = await prisma.user.create({
    data: {
      fullName: "RiskDelta Demo Viewer",
      email: process.env.PUBLIC_DEMO_USER_EMAIL ?? "demo@riskdelta.dev",
      companyName: "Northstar Dynamics",
      passwordHash,
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: "Northstar Dynamics",
      slug: "northstar-dynamics",
      tier: "Enterprise",
      domain: "northstardynamics.ai",
    },
  });

  await prisma.membership.createMany({
    data: [
      { userId: owner.id, organizationId: org.id, role: "OWNER" },
      ...analysts.map((user) => ({ userId: user.id, organizationId: org.id, role: "OPERATOR" })),
      { userId: publicDemoUser.id, organizationId: org.id, role: "VIEWER" },
    ],
  });

  const projects = await Promise.all(
    [
      ["Support Copilot", "production", "Next.js", "OpenAI", "CRITICAL", "Connected"],
      ["Finance Ops Agent", "production", "Custom Agent", "OpenAI", "HIGH", "Connected"],
      ["Claims Review QA", "staging", "LangChain", "Anthropic", "MEDIUM", "Pending"],
      ["Developer Assistant", "development", "Vercel AI SDK", "Gemini", "LOW", "Connected"],
    ].map(([name, environment, framework, provider, riskStatus, integrationStatus]) =>
      prisma.project.create({
        data: {
          organizationId: org.id,
          name,
          slug: slugify(name),
          description: `${name} protected by RiskDelta runtime controls.`,
          environment,
          framework,
          provider,
          ownerName: owner.fullName,
          riskStatus,
          integrationStatus,
          monitoringEnabled: true,
          lastActivity: new Date(),
        },
      }),
    ),
  );

  const environments = await Promise.all(
    projects.map((project) =>
      prisma.environment.create({
        data: {
          organizationId: org.id,
          projectId: project.id,
          name: `${project.name} ${project.environment}`,
          slug: `${project.slug}-${project.environment}`,
          stage: project.environment.toUpperCase(),
        },
      }),
    ),
  );

  const applications = await Promise.all(
    projects.map((project, index) =>
      prisma.application.create({
        data: {
          organizationId: org.id,
          projectId: project.id,
          environmentId: environments[index]?.id,
          name: project.name,
          slug: project.slug,
          framework: project.framework,
          provider: project.provider,
          status: "ACTIVE",
        },
      }),
    ),
  );

  const policyIds: string[] = [];
  for (const template of defaultPolicyTemplates) {
    const policy = await prisma.policy.create({
      data: {
        organizationId: org.id,
        name: template.name,
        slug: slugify(template.name),
        description: template.description,
        category: template.category,
        severity: template.severity,
        scope: template.scope,
        mode: template.mode,
        tags: template.tags,
        status: template.mode === "ENFORCE" ? "Active" : "Simulate",
      },
    });

    policyIds.push(policy.id);

    await prisma.policyVersion.create({
      data: {
        policyId: policy.id,
        version: 1,
        isActive: true,
        definition: template,
        dsl: generatePolicyDsl(template),
      },
    });

    for (const project of projects.slice(0, 3)) {
      await prisma.projectPolicy.create({
        data: {
          projectId: project.id,
          policyId: policy.id,
        },
      });
    }
  }

  const runtimeControlIds: string[] = [];
  for (const control of runtimeControlBlueprints) {
    const runtimeControl = await prisma.runtimeControl.create({
      data: {
        organizationId: org.id,
        name: control.name,
        slug: control.slug,
        moduleKey: control.moduleKey,
        status: control.status,
        summary: control.summary,
        config: control.config,
        recentActions: [...control.recentActions],
      },
    });
    runtimeControlIds.push(runtimeControl.id);

    for (const project of projects) {
      await prisma.projectRuntimeControl.create({
        data: {
          projectId: project.id,
          runtimeControlId: runtimeControl.id,
        },
      });
    }
  }

  for (const integration of integrationBlueprints) {
    await prisma.integration.create({
      data: {
        organizationId: org.id,
        projectId: projects[0]?.id ?? null,
        name: integration.name,
        slug: integration.slug,
        category: integration.category,
        provider: integration.provider,
        connectionState: integration.state,
        config: {
          source: integration.category,
          preset: integration.provider,
        },
        setupSteps: ["Connect credentials", "Scope to project", "Send a test trace"],
        logsHint: "Mock connector logs visible after test run.",
        lastCheckedAt: new Date(),
      },
    });
  }

  const { apiKey, rawKey } = await prisma.$transaction((tx) =>
    createApiKeyRecord({
      tx,
      organizationId: org.id,
      userId: owner.id,
      name: "Seed ingest key",
      scopes: ["traces:write", "traces:read", "policies:read"],
    }),
  );

  await prisma.onboardingState.create({
    data: {
      userId: owner.id,
      organizationId: org.id,
      projectId: projects[0].id,
      currentStep: 5,
      completed: true,
      selectedIntegrationType: quickstartPresets[0].integrationType,
      selectedAiStack: "OpenAI",
      framework: projects[0].framework,
      environment: projects[0].environment,
    },
  });

  await prisma.onboardingState.create({
    data: {
      userId: publicDemoUser.id,
      organizationId: org.id,
      projectId: projects[0].id,
      currentStep: 5,
      completed: true,
      selectedIntegrationType: quickstartPresets[0].integrationType,
      selectedAiStack: "OpenAI",
      framework: projects[0].framework,
      environment: projects[0].environment,
    },
  });

  const policyVersions = await prisma.policyVersion.findMany({
    where: {
      policy: {
        organizationId: org.id,
      },
      isActive: true,
    },
  });

  const policyDefinitions = policyVersions.map((version) => version.definition as unknown as PolicyEditorInput);

  const tracesToSeed = Array.from({ length: 60 }).map((_, index) => {
    const preset = seedTraceInputs[index % seedTraceInputs.length];
    const project = projects[index % projects.length];
    return {
      ...preset,
      projectId: project.id,
      requestId: `${preset.requestId}_${index + 1}`,
      actor: index % 2 === 0 ? owner.fullName : "RiskDelta Bot",
      desiredTargets: [...preset.desiredTargets],
    };
  });

  for (const request of tracesToSeed) {
    const environment = environments.find((item) => item.projectId === request.projectId);
    const application = applications.find((item) => item.projectId === request.projectId);
    const evaluation = buildTraceEvaluation({
      request,
      policies: policyDefinitions,
    });

    const traceSession = await prisma.traceSession.create({
      data: {
        organizationId: org.id,
        projectId: request.projectId,
        environmentId: environment?.id,
        applicationId: application?.id,
        externalId: `session_${request.requestId}`,
        actor: request.actor,
        status: evaluation.verdict === "BLOCK" ? "BLOCKED" : "COMPLETED",
        endedAt: new Date(),
      },
    });

    const trace = await prisma.trace.create({
      data: {
        externalId: `trace_seed_${request.requestId}`,
        organizationId: org.id,
        projectId: request.projectId,
        environmentId: environment?.id,
        applicationId: application?.id,
        traceSessionId: traceSession.id,
        requestId: request.requestId,
        environment: request.environment,
        channel: request.channel,
        provider: request.provider,
        model: request.model,
        prompt: request.prompt,
        promptPreview: request.prompt.slice(0, 220),
        context: request.context,
        response: evaluation.outputPreview,
        responsePreview: evaluation.outputPreview.slice(0, 220),
        actor: request.actor,
        ip: request.ip,
        country: request.country,
        sessionId: request.sessionId,
        toolSummary: request.toolUsage.tools.join(", "),
        desiredTargets: request.desiredTargets,
        tags: Array.from(new Set(evaluation.signals.map((signal) => signal.key.split(".")[0]))),
        riskScore: evaluation.riskScore,
        confidence: evaluation.confidence,
        severity: evaluation.severity,
        verdict: evaluation.verdict,
        blocked: evaluation.verdict === "BLOCK",
        redacted: evaluation.verdict === "TRANSFORM",
        selectedModel: evaluation.selectedModel,
        explainability: evaluation.explainability,
        dimensionScores: evaluation.dimensionScores,
        runtimeActions: evaluation.runtimeActions,
        signals: evaluation.signals,
      },
    });

    await prisma.traceEvent.createMany({
      data: [
        {
          organizationId: org.id,
          traceSessionId: traceSession.id,
          eventType: "PROMPT_CAPTURED",
          payload: {
            prompt: request.prompt,
            actor: request.actor,
          },
        },
        {
          organizationId: org.id,
          traceSessionId: traceSession.id,
          eventType: "RISK_EVALUATED",
          payload: {
            score: evaluation.riskScore,
            verdict: evaluation.verdict,
            severity: evaluation.severity,
          },
        },
      ],
    });

    await prisma.traceToolCall.createMany({
      data: buildToolCallRecords(request, evaluation).map((toolCall) => ({
        traceId: trace.id,
        ...toolCall,
      })),
    });

    for (const version of policyVersions) {
      const run = await prisma.policyRun.create({
        data: {
          traceId: trace.id,
          policyVersionId: version.id,
          mode: "ENFORCE",
          outcome: evaluation.matchedRules.length > 0 ? "MATCHED" : "NO_MATCH",
        },
      });

      if (evaluation.matchedRules.length > 0) {
        await prisma.policyMatch.createMany({
          data: evaluation.matchedRules.map((match) => ({
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

    await prisma.riskEvent.createMany({
      data: evaluation.dimensionScores.map((dimension) => ({
        traceId: trace.id,
        dimensionKey: dimension.key,
        title: dimension.label,
        severity: evaluation.severity,
        score: dimension.score,
        confidence: evaluation.confidence,
        explanation: dimension.explanation,
      })),
    });

    await prisma.riskAssessment.create({
      data: {
        organizationId: org.id,
        traceId: trace.id,
        traceSessionId: traceSession.id,
        score: evaluation.riskScore,
        confidence: evaluation.confidence,
        severity: evaluation.severity,
        verdict: evaluation.verdict,
        explainability: evaluation.explainability,
        factors: evaluation.dimensionScores,
      },
    });

    if (evaluation.incidentRecommended && (await prisma.incident.count({ where: { organizationId: org.id } })) < 8) {
      const incident = await prisma.incident.create({
        data: {
          organizationId: org.id,
          projectId: request.projectId,
          traceId: trace.id,
          title: evaluation.incidentTitle ?? "Critical runtime event",
          slug: `${slugify(evaluation.incidentTitle ?? trace.requestId)}-${Date.now().toString().slice(-4)}-${Math.random().toString(16).slice(2, 6)}`,
          severity: evaluation.severity,
          status: "OPEN",
          summary: evaluation.explainability,
          rootCause: evaluation.signals[0]?.description ?? "Elevated runtime risk detected.",
          remediationNotes: "Review trace context, tighten affected policies, and rotate exposed secrets if needed.",
          triggerSource: "SentinelX escalation",
          assigneeName: "Jonas Patel",
          timeline: [
            { at: new Date().toISOString(), title: "Trace captured", detail: trace.requestId },
            { at: new Date().toISOString(), title: "Controls fired", detail: evaluation.runtimeActions.map((action) => action.control).join(", ") },
            { at: new Date().toISOString(), title: "Incident opened", detail: evaluation.explainability },
          ],
        },
      });

      await prisma.incidentEvent.createMany({
        data: [
          {
            incidentId: incident.id,
            eventType: "INCIDENT_OPENED",
            message: "Incident opened from runtime critical verdict.",
            metadata: {
              traceId: trace.id,
              requestId: request.requestId,
            },
          },
          {
            incidentId: incident.id,
            eventType: "POLICY_MATCHED",
            message: "Policy engine produced critical intervention signals.",
            metadata: {
              matchedRules: evaluation.matchedRules.map((rule) => rule.id),
            },
          },
        ],
      });
    }
  }

  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: org.id,
        actorName: owner.fullName,
        action: "seed.completed",
        targetType: "Organization",
        targetId: org.id,
        metadata: {
          projects: projects.length,
          apiKeyPrefix: apiKey.prefix,
          seedApiKeyMasked: maskApiKey(rawKey),
          extraUsers: analysts.length + 1,
        },
      },
    ],
  });

  console.log("Seeded RiskDelta");
  console.log(`Demo user: ${owner.email}`);
  console.log(`Public demo viewer: ${publicDemoUser.email}`);
  console.log("Demo password: [redacted] (configure DEMO_USER_PASSWORD in local env)");
  console.log(`Seed API key: [redacted], suffix=${rawKey.slice(-4)} (rotate after first use)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
