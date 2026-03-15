import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FollowupRun, QueueSettings } from "../../../src/auto-reply/reply/queue.js";
import { createMockTypingController } from "../../../src/auto-reply/reply/test-helpers.js";
import type { TemplateContext } from "../../../src/auto-reply/templating.js";
import {
  saveSessionStore,
  loadSessionStore,
  type SessionEntry,
} from "../../../src/config/sessions.js";
import type {
  ActiveNicheStackRecord,
  PreparedNicheRunSeed,
} from "../../../src/niche/schema/index.js";
import {
  setActiveNicheRouteOverlay,
  upsertActiveNicheStackRecord,
  writeReadinessReport,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const runEmbeddedPiAgentMock = vi.fn();
const runWithModelFallbackMock = vi.fn();

vi.mock("../../../src/agents/model-fallback.js", () => ({
  runWithModelFallback: (params: {
    provider: string;
    model: string;
    run: (provider: string, model: string) => Promise<unknown>;
  }) => runWithModelFallbackMock(params),
}));

vi.mock("../../../src/agents/pi-embedded.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/agents/pi-embedded.js")>(
    "../../../src/agents/pi-embedded.js",
  );
  return {
    ...actual,
    queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
    runEmbeddedPiAgent: (params: unknown) => runEmbeddedPiAgentMock(params),
  };
});

vi.mock("../../../src/auto-reply/reply/queue.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/auto-reply/reply/queue.js")>(
    "../../../src/auto-reply/reply/queue.js",
  );
  return {
    ...actual,
    enqueueFollowupRun: vi.fn(),
    scheduleFollowupDrain: vi.fn(),
  };
});

const { runReplyAgent } = await import("../../../src/auto-reply/reply/agent-runner.js");

function makeReadyReadinessReport(nicheProgramId: string) {
  return {
    readiness_report_id: `${nicheProgramId}-readiness`,
    niche_program_id: nicheProgramId,
    status: "ready",
    dimension_scores: {
      source_quality: { score: 95, rationale: "Runtime inputs are ready." },
      source_coverage: { score: 94, rationale: "Coverage is sufficient." },
      contradiction_rate: { score: 3, rationale: "Contradictions are low." },
      freshness: { score: 93, rationale: "Inputs are current." },
      rights_sufficiency: { score: 97, rationale: "Rights are approved." },
      task_observability: { score: 95, rationale: "Runtime behavior is observable." },
      benchmarkability: { score: 94, rationale: "The niche remains benchmarkable." },
      measurable_success_criteria: { score: 92, rationale: "Success is measurable." },
      tool_availability: { score: 96, rationale: "Required tools are available." },
    },
    hard_blockers: [],
    warnings: [],
    recommended_next_actions: [],
    generated_at: "2026-03-13T09:00:00.000Z",
  };
}

function makeSeedTemplate(params: {
  activeStackId: string;
  manifestId: string;
  nicheProgramId: string;
}): PreparedNicheRunSeed {
  return {
    seed_id: `template-${params.activeStackId}`,
    prepared_at: "2026-03-13T09:00:00.000Z",
    mode: "live",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: params.manifestId,
    readiness_report_id: `${params.nicheProgramId}-readiness`,
    niche_program_id: params.nicheProgramId,
    domain_pack_id: `${params.nicheProgramId}-pack`,
    domain_pack: {
      domain_pack_id: `${params.nicheProgramId}-pack`,
      niche_program_id: params.nicheProgramId,
      version: "2026.3.13",
      ontology: {
        concepts: [{ id: "repo-doc", label: "Repo doc" }],
        relations: [],
      },
      task_taxonomy: [
        {
          task_family_id: "repo-ci-verification",
          label: "Repo CI verification",
          benchmarkable: true,
          required_capabilities: ["evidence_grounding"],
        },
      ],
      terminology_map: {},
      constraints: [
        {
          constraint_id: "must-ground-output",
          category: "grounding",
          rule: "must_ground_in_evidence",
          severity: "moderate",
        },
      ],
      tool_contracts: [
        {
          tool_name: "exec",
          intent_summary: "Run repo commands.",
          required_arguments: ["command"],
          optional_arguments: [],
          failure_modes: [],
        },
      ],
      evidence_source_registry: [
        {
          source_id: "repo-doc",
          source_kind: "repos",
          title: "Repository",
          access_pattern: "read",
        },
      ],
      failure_taxonomy: [
        {
          failure_id: "missing_evidence",
          label: "Missing evidence",
          description: "The answer is not grounded.",
          severity: "high",
          detection_hints: ["unsupported claim"],
        },
      ],
      verifier_defaults: {
        required_checks: ["evidence_grounding"],
        blocking_failure_ids: [],
        output_requirements: ["grounded_response"],
        escalation_policy: "Escalate low-confidence responses.",
      },
      benchmark_seed_specs: [
        {
          seed_id: "seed-1",
          task_family_id: "repo-ci-verification",
          prompt: "Investigate the failing benchmark case.",
          source_refs: ["repo-doc"],
          pass_conditions: ["grounded_response"],
          hard_fail_conditions: [],
        },
      ],
    },
    source_access_manifest: {
      source_access_manifest_id: `${params.nicheProgramId}-source-access`,
      allowed_tools: ["exec"],
      allowed_retrieval_indices: ["repo-doc"],
      allowed_live_sources: [],
      disallowed_sources: [],
      sandbox_policy: "workspace-only",
      network_policy: "deny",
      approval_policy: "never",
    },
    action_policy_runtime: {
      allowed_tools: ["exec"],
      required_arguments_by_tool: {
        exec: ["command"],
      },
    },
    verifier_pack_config: {
      verifier_pack_id: `${params.nicheProgramId}-verifier-pack`,
      version: "2026.3.13",
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: [],
      output_requirements: ["grounded_response"],
      escalation_policy: "Escalate low-confidence responses.",
      min_confidence: 0.6,
      max_allowed_ungrounded_claims: 0,
      require_evidence_bundles: true,
    },
    planner_version_id: "planner-primary-v1",
    action_policy_version_id: "action-policy-v1",
    verifier_pack_version_id: "verifier-pack-v1",
    retrieval_stack_version_id: "retrieval-stack-v1",
    grader_set_version_id: "grader-set-v1",
    runtime_snapshot_id: `${params.activeStackId}-runtime`,
    context_bundle_id: `${params.activeStackId}-context`,
    determinism_policy_id: `${params.activeStackId}-determinism`,
    random_seed: `seed-${params.activeStackId}`,
    replayability_status: "non_replayable",
    determinism_notes: `Runtime template for ${params.activeStackId}.`,
    artifact_refs: [],
    evidence_bundle_refs: [],
  };
}

function makeActiveStackRecord(params: {
  activeStackId: string;
  manifestId: string;
  nicheProgramId: string;
}): ActiveNicheStackRecord {
  return {
    active_stack_id: params.activeStackId,
    niche_program_id: params.nicheProgramId,
    candidate_manifest_id: params.manifestId,
    registered_at: "2026-03-13T09:00:00.000Z",
    release_mode: "live",
    run_seed_template: makeSeedTemplate({
      activeStackId: params.activeStackId,
      manifestId: params.manifestId,
      nicheProgramId: params.nicheProgramId,
    }),
  };
}

function makeFollowupRun(): FollowupRun {
  return {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    originatingChannel: "telegram",
    originatingTo: "chat:123",
    originatingAccountId: "primary",
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: "main",
      messageProvider: "telegram",
      agentAccountId: "primary",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: {},
      skillsSnapshot: {},
      provider: "openai",
      model: "gpt-5",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;
}

function makeSessionContext(): TemplateContext {
  return {
    Provider: "telegram",
    Surface: "telegram",
    OriginatingChannel: "telegram",
    OriginatingTo: "chat:123",
    AccountId: "primary",
    MessageSid: "msg",
  } as unknown as TemplateContext;
}

beforeEach(() => {
  runEmbeddedPiAgentMock.mockReset();
  runWithModelFallbackMock.mockReset();
  runWithModelFallbackMock.mockImplementation(
    async ({
      provider,
      model,
      run,
    }: {
      provider: string;
      model: string;
      run: (provider: string, model: string) => Promise<unknown>;
    }) => ({
      result: await run(provider, model),
      provider,
      model,
    }),
  );
});

describe("reply runtime active Niche stacks", () => {
  it("activates a route overlay stack for inbound reply runs and persists the resolved source", async () => {
    await withTempHome(async (home) => {
      const storePath = path.join(home, "sessions.json");
      const sessionKey = "main";
      const sessionEntry: SessionEntry = {
        sessionId: "session",
        updatedAt: Date.now(),
      };
      await saveSessionStore(storePath, { [sessionKey]: sessionEntry });
      writeReadinessReport(makeReadyReadinessReport("repo-ci-route"), process.env);
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "active-stack-route",
          manifestId: "candidate-manifest-route",
          nicheProgramId: "repo-ci-route",
        }),
        process.env,
      );
      setActiveNicheRouteOverlay(
        {
          overlay_id: "telegram-primary",
          agent_id: "main",
          active_stack_id: "active-stack-route",
          updated_at: "2026-03-13T09:01:00.000Z",
          channel: "telegram",
          account_id: "primary",
          to: "chat:123",
        },
        process.env,
      );
      runEmbeddedPiAgentMock.mockResolvedValue({
        payloads: [{ text: "ok" }],
        meta: {
          agentMeta: {
            provider: "openai",
            model: "gpt-5",
          },
        },
      });

      const sessionStore = { [sessionKey]: sessionEntry };
      await runReplyAgent({
        commandBody: "hello",
        followupRun: makeFollowupRun(),
        queueKey: sessionKey,
        resolvedQueue: { mode: "interrupt" } as QueueSettings,
        shouldSteer: false,
        shouldFollowup: false,
        isActive: false,
        isStreaming: false,
        typing: createMockTypingController(),
        sessionCtx: makeSessionContext(),
        sessionEntry,
        sessionStore,
        sessionKey,
        storePath,
        defaultModel: "openai/gpt-5",
        resolvedVerboseLevel: "off",
        isNewSession: false,
        blockStreamingEnabled: false,
        resolvedBlockStreamingBreak: "message_end",
        shouldInjectGroupIntro: false,
        typingMode: "instant",
      });

      expect(runEmbeddedPiAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nicheRunSeed: expect.objectContaining({
            active_stack_id: "active-stack-route",
            resolution_source: "route_override",
            baseline_or_candidate_manifest_id: "candidate-manifest-route",
          }),
        }),
      );

      const persisted = loadSessionStore(storePath, { skipCache: true });
      expect(persisted[sessionKey]?.niche).toEqual(
        expect.objectContaining({
          lastResolvedStackId: "active-stack-route",
          lastResolvedSource: "route_override",
          lastResolvedCandidateManifestId: "candidate-manifest-route",
          lastResolvedNicheProgramId: "repo-ci-route",
        }),
      );
    });
  });

  it("lets a session override win over the inbound route overlay in reply runs", async () => {
    await withTempHome(async (home) => {
      const storePath = path.join(home, "sessions.json");
      const sessionKey = "main";
      const sessionEntry: SessionEntry = {
        sessionId: "session",
        updatedAt: Date.now(),
        niche: {
          sessionOverrideStackId: "active-stack-session",
        },
      };
      await saveSessionStore(storePath, { [sessionKey]: sessionEntry });
      writeReadinessReport(makeReadyReadinessReport("repo-ci-route"), process.env);
      writeReadinessReport(makeReadyReadinessReport("repo-ci-session"), process.env);
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "active-stack-route",
          manifestId: "candidate-manifest-route",
          nicheProgramId: "repo-ci-route",
        }),
        process.env,
      );
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "active-stack-session",
          manifestId: "candidate-manifest-session",
          nicheProgramId: "repo-ci-session",
        }),
        process.env,
      );
      setActiveNicheRouteOverlay(
        {
          overlay_id: "telegram-primary",
          agent_id: "main",
          active_stack_id: "active-stack-route",
          updated_at: "2026-03-13T09:01:00.000Z",
          channel: "telegram",
          account_id: "primary",
          to: "chat:123",
        },
        process.env,
      );
      runEmbeddedPiAgentMock.mockResolvedValue({
        payloads: [{ text: "ok" }],
        meta: {
          agentMeta: {
            provider: "openai",
            model: "gpt-5",
          },
        },
      });

      const sessionStore = { [sessionKey]: sessionEntry };
      await runReplyAgent({
        commandBody: "hello",
        followupRun: makeFollowupRun(),
        queueKey: sessionKey,
        resolvedQueue: { mode: "interrupt" } as QueueSettings,
        shouldSteer: false,
        shouldFollowup: false,
        isActive: false,
        isStreaming: false,
        typing: createMockTypingController(),
        sessionCtx: makeSessionContext(),
        sessionEntry,
        sessionStore,
        sessionKey,
        storePath,
        defaultModel: "openai/gpt-5",
        resolvedVerboseLevel: "off",
        isNewSession: false,
        blockStreamingEnabled: false,
        resolvedBlockStreamingBreak: "message_end",
        shouldInjectGroupIntro: false,
        typingMode: "instant",
      });

      expect(runEmbeddedPiAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nicheRunSeed: expect.objectContaining({
            active_stack_id: "active-stack-session",
            resolution_source: "session_override",
            baseline_or_candidate_manifest_id: "candidate-manifest-session",
          }),
        }),
      );

      expect(sessionStore[sessionKey]?.niche).toEqual(
        expect.objectContaining({
          sessionOverrideStackId: "active-stack-session",
          lastResolvedStackId: "active-stack-session",
          lastResolvedSource: "session_override",
        }),
      );
    });
  });
});
