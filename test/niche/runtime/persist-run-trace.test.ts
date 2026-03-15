import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuardDecision } from "../../../src/niche/action-policy/index.js";
import { mediateNicheToolCall } from "../../../src/niche/runtime/action-mediator.js";
import {
  clearAllNicheRunTraceContextsForTest,
  markNicheFinalEmission,
  maybeRunNicheVerifierGate,
  persistPreparedNicheRunFailureArtifacts,
  recordActionProposalForRun,
  recordToolExecutionResult,
  recordToolExecutionStart,
  registerPreparedNicheRunTraceContext,
  snapshotNicheRunTraceContext,
} from "../../../src/niche/runtime/index.js";
import { persistPreparedNicheRunArtifacts } from "../../../src/niche/runtime/persist-run-trace.js";
import type { PreparedNicheRunSeed } from "../../../src/niche/schema/index.js";
import { getReplayBundle, getRunTrace } from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

vi.mock("../../../src/config/config.js", () => ({
  loadConfig: () => ({
    models: {
      providers: {
        openai: {
          models: [
            {
              id: "gpt-5",
              cost: {
                input: 1,
                output: 2,
                cacheRead: 0,
                cacheWrite: 0,
              },
            },
          ],
        },
      },
    },
  }),
}));

function makeSeed(overrides: Partial<PreparedNicheRunSeed> = {}): PreparedNicheRunSeed {
  return {
    seed_id: "prepared-run-seed-1234",
    prepared_at: "2026-03-12T12:00:00.000Z",
    mode: "benchmark",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: "candidate-manifest-repo-ci",
    readiness_report_id: "repo-ci-specialist-readiness",
    niche_program_id: "repo-ci-specialist",
    domain_pack_id: "repo-ci-pack",
    domain_pack: {
      domain_pack_id: "repo-ci-pack",
      niche_program_id: "repo-ci-specialist",
      version: "2026.3.12",
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
          failure_modes: ["missing_evidence"],
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
        blocking_failure_ids: ["missing_evidence"],
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
      source_access_manifest_id: "source-access-repo-ci",
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
      max_retry_attempts: 2,
    },
    verifier_pack_config: {
      verifier_pack_id: "verifier-pack-repo-ci",
      version: "2026.3.12",
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: ["missing_evidence"],
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
    runtime_snapshot_id: "runtime-snapshot-v1",
    context_bundle_id: "context-bundle-v1",
    determinism_policy_id: "determinism-v1",
    random_seed: "seed-1",
    replayability_status: "non_replayable",
    determinism_notes: "Explicit local seeded run.",
    artifact_refs: [],
    evidence_bundle_refs: [
      {
        evidence_bundle_id: "evidence-bundle-1",
        source_refs: [{ source_id: "repo-doc", source_hash_or_ref: "repo@abc123" }],
        retrieval_query: "repo ci verification",
        reranker_output: ["repo-doc"],
        delivered_evidence: ["Repo doc confirms the benchmark fix."],
      },
    ],
    ...overrides,
  };
}

function makeAllowedDecision(): GuardDecision {
  return {
    allowed: true,
    code: "allowed",
    reason: "tool allowed",
    violations: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAllNicheRunTraceContextsForTest();
});

describe("prepared Niche run runtime seam persistence", () => {
  it("seeded registration activates the mediator path", () => {
    registerPreparedNicheRunTraceContext({
      runId: "seeded-run",
      seed: makeSeed({
        mode: "candidate",
      }),
    });

    const mediation = mediateNicheToolCall({
      runId: "seeded-run",
      toolCallId: "tool-call-1",
      toolName: "exec",
      rawParams: { command: "pnpm lint" },
    });

    expect(mediation?.blocked).toBe(false);
    expect(snapshotNicheRunTraceContext("seeded-run")?.actionProposals).toHaveLength(1);
  });

  it("records planner and verifier phase timing for prepared runs", () => {
    const seed = makeSeed();
    registerPreparedNicheRunTraceContext({
      runId: "run-phase-timing",
      seed,
    });

    const result = maybeRunNicheVerifierGate({
      runId: "run-phase-timing",
      payloads: [{ text: "Repo doc confirms grounded_response." }],
      checkedAt: "2026-03-12T12:00:02.000Z",
    });

    const snapshot = snapshotNicheRunTraceContext("run-phase-timing");
    expect(result).not.toBeNull();
    expect(snapshot?.phaseState.plannerStartedAt).toBeDefined();
    expect(snapshot?.phaseState.plannerFinishedAt).toBeDefined();
    expect(snapshot?.phaseState.verifierStartedAt).toBe("2026-03-12T12:00:02.000Z");
    expect(snapshot?.phaseState.verifierFinishedAt).toBeDefined();
  });

  it("persists a RunTrace for seeded runs and clears context after success", async () => {
    await withTempHome(async () => {
      const seed = makeSeed({
        active_stack_id: "active-stack-live",
        resolution_source: "agent_default",
        resolved_release_mode: "live",
      });
      registerPreparedNicheRunTraceContext({
        runId: "run-trace-1",
        seed,
      });
      recordActionProposalForRun("run-trace-1", makeAllowedDecision(), {
        proposal_id: "proposal-1",
        selected_tool: "exec",
        selected_reason: "Need to reproduce the failure.",
        guard_decision: "allowed",
        selector_score: 1,
        candidate_rankings: [],
        attempt_index: 0,
      });
      recordToolExecutionStart({
        runId: "run-trace-1",
        toolCallId: "tool-call-1",
        toolName: "exec",
        args: { command: "pnpm test:niche" },
      });
      recordToolExecutionResult({
        runId: "run-trace-1",
        toolCallId: "tool-call-1",
        toolName: "exec",
        result: { ok: true, output: "tests passed" },
        isError: false,
      });
      maybeRunNicheVerifierGate({
        runId: "run-trace-1",
        payloads: [{ text: "Repo doc confirms grounded_response." }],
        checkedAt: "2026-03-12T12:00:03.000Z",
      });
      markNicheFinalEmission("run-trace-1", "2026-03-12T12:00:04.000Z");

      const persisted = persistPreparedNicheRunArtifacts({
        runId: "run-trace-1",
        nicheRunSeed: seed,
        sessionId: "session-123",
        sessionKey: "agent:main:session-123",
        transcriptPath: "agents/main/sessions/session-123.jsonl",
        resultMeta: {
          durationMs: 4000,
          agentMeta: {
            sessionId: "session-123",
            provider: "openai",
            model: "gpt-5",
            usage: {
              input: 100,
              output: 50,
              total: 150,
            },
          },
        },
        deliveredPayloads: [{ text: "Repo doc confirms grounded_response." }],
        emittedToUser: true,
        deliveredAt: "2026-03-12T12:00:04.000Z",
      });

      expect(persisted).not.toBeNull();
      expect(getRunTrace(persisted!.trace_id, process.env)).toMatchObject({
        run_id: "run-trace-1",
        active_stack_id: "active-stack-live",
        resolved_stack_source: "agent_default",
        resolved_release_mode: "live",
        readiness_report_id: "repo-ci-specialist-readiness",
        final_output: {
          emitted_to_user: true,
        },
        phase_timestamps: {
          final_emission_at: "2026-03-12T12:00:04.000Z",
        },
      });
      expect(snapshotNicheRunTraceContext("run-trace-1")).toBeUndefined();
    });
  });

  it("creates replay bundles only when the seed carries replay-capable benchmark metadata", async () => {
    await withTempHome(async () => {
      const replayableSeed = makeSeed({
        replayability_status: "replayable",
        benchmark_suite_id: "repo-ci-suite",
        benchmark_arm_id: "candidate-arm",
        benchmark_case_ref: {
          case_kind: "atomic_case",
          case_id: "eval-case-1",
        },
        suite_hash: "fedcba9876543210fedcba9876543210",
        fixture_version: "2026.3.12",
        environment_snapshot: {
          environment_hash: "0123456789abcdef0123456789abcdef",
          platform: process.platform,
          notes: "Frozen benchmark host snapshot.",
        },
      });
      registerPreparedNicheRunTraceContext({
        runId: "run-trace-2",
        seed: replayableSeed,
      });
      recordActionProposalForRun("run-trace-2", makeAllowedDecision(), {
        proposal_id: "proposal-1",
        selected_tool: "exec",
        selected_reason: "Need to reproduce the failure.",
        guard_decision: "allowed",
        selector_score: 1,
        candidate_rankings: [],
        attempt_index: 0,
      });
      recordToolExecutionStart({
        runId: "run-trace-2",
        toolCallId: "tool-call-1",
        toolName: "exec",
        args: { command: "pnpm test:niche" },
      });
      recordToolExecutionResult({
        runId: "run-trace-2",
        toolCallId: "tool-call-1",
        toolName: "exec",
        result: { ok: true, output: "tests passed" },
        isError: false,
      });
      maybeRunNicheVerifierGate({
        runId: "run-trace-2",
        payloads: [{ text: "Repo doc confirms grounded_response." }],
        checkedAt: "2026-03-12T12:00:03.000Z",
      });
      markNicheFinalEmission("run-trace-2", "2026-03-12T12:00:04.000Z");

      const persisted = persistPreparedNicheRunArtifacts({
        runId: "run-trace-2",
        nicheRunSeed: replayableSeed,
        sessionId: "session-123",
        resultMeta: {
          durationMs: 4000,
          agentMeta: {
            sessionId: "session-123",
            provider: "openai",
            model: "gpt-5",
            usage: {
              input: 100,
              output: 50,
              total: 150,
            },
          },
        },
        deliveredPayloads: [{ text: "Repo doc confirms grounded_response." }],
        emittedToUser: false,
        deliveredAt: "2026-03-12T12:00:04.000Z",
      });

      expect(persisted?.replay_bundle_id).toBeDefined();
      expect(getReplayBundle(persisted!.replay_bundle_id!, process.env)).toMatchObject({
        benchmark_suite_id: "repo-ci-suite",
        replayability_status: "replayable",
      });
    });
  });

  it("persists no-output runs instead of dropping the terminal trace", async () => {
    await withTempHome(async () => {
      const seed = makeSeed();
      registerPreparedNicheRunTraceContext({
        runId: "run-trace-no-output",
        seed,
      });
      recordActionProposalForRun("run-trace-no-output", makeAllowedDecision(), {
        proposal_id: "proposal-1",
        selected_tool: "exec",
        selected_reason: "Need to inspect the repo state.",
        guard_decision: "allowed",
        selector_score: 1,
        candidate_rankings: [],
        attempt_index: 0,
      });
      recordToolExecutionStart({
        runId: "run-trace-no-output",
        toolCallId: "tool-call-1",
        toolName: "exec",
        args: { command: "pnpm test:niche" },
      });
      recordToolExecutionResult({
        runId: "run-trace-no-output",
        toolCallId: "tool-call-1",
        toolName: "exec",
        result: { ok: true, output: "tests passed" },
        isError: false,
      });
      markNicheFinalEmission("run-trace-no-output", "2026-03-12T12:00:04.000Z");

      const persisted = persistPreparedNicheRunArtifacts({
        runId: "run-trace-no-output",
        nicheRunSeed: seed,
        sessionId: "session-123",
        resultMeta: {
          durationMs: 4000,
          agentMeta: {
            sessionId: "session-123",
            provider: "openai",
            model: "gpt-5",
            usage: {
              input: 100,
              output: 0,
              total: 100,
            },
          },
        },
        deliveredPayloads: [],
        emittedToUser: false,
        deliveredAt: "2026-03-12T12:00:04.000Z",
      });

      expect(persisted).not.toBeNull();
      const trace = getRunTrace(persisted!.trace_id, process.env);
      expect(trace).toMatchObject({
        run_id: "run-trace-no-output",
        terminal_status: "no_output",
      });
      expect(trace?.final_output).toBeUndefined();
    });
  });

  it("records suppressed output when the verifier replaces delivery payloads", async () => {
    await withTempHome(async () => {
      const seed = makeSeed();
      registerPreparedNicheRunTraceContext({
        runId: "run-trace-withheld",
        seed,
      });
      recordActionProposalForRun("run-trace-withheld", makeAllowedDecision(), {
        proposal_id: "proposal-1",
        selected_tool: "exec",
        selected_reason: "Need to inspect the repo state.",
        guard_decision: "allowed",
        selector_score: 1,
        candidate_rankings: [],
        attempt_index: 0,
      });
      recordToolExecutionStart({
        runId: "run-trace-withheld",
        toolCallId: "tool-call-1",
        toolName: "exec",
        args: { command: "pnpm test:niche" },
      });
      recordToolExecutionResult({
        runId: "run-trace-withheld",
        toolCallId: "tool-call-1",
        toolName: "exec",
        result: { ok: true, output: "tests passed" },
        isError: false,
      });
      markNicheFinalEmission("run-trace-withheld", "2026-03-12T12:00:04.000Z");

      const persisted = persistPreparedNicheRunArtifacts({
        runId: "run-trace-withheld",
        nicheRunSeed: seed,
        sessionId: "session-123",
        resultMeta: {
          durationMs: 4000,
          agentMeta: {
            sessionId: "session-123",
            provider: "openai",
            model: "gpt-5",
            usage: {
              input: 100,
              output: 12,
              total: 112,
            },
          },
        },
        deliveredPayloads: [{ text: "Verifier requested repair before delivery." }],
        originalPayloads: [{ text: "Ungrounded final answer." }],
        suppressedOriginalOutput: true,
        emittedToUser: false,
        deliveredAt: "2026-03-12T12:00:04.000Z",
      });

      expect(persisted).not.toBeNull();
      expect(getRunTrace(persisted!.trace_id, process.env)).toMatchObject({
        run_id: "run-trace-withheld",
        terminal_status: "withheld",
        suppressed_output: {
          content_summary: "Ungrounded final answer.",
        },
      });
    });
  });

  it("persists failed traces without usage or cost when a seeded run throws before delivery", async () => {
    await withTempHome(async () => {
      const seed = makeSeed();
      registerPreparedNicheRunTraceContext({
        runId: "run-trace-pre-delivery-failure",
        seed,
      });

      const persisted = persistPreparedNicheRunFailureArtifacts({
        runId: "run-trace-pre-delivery-failure",
        nicheRunSeed: seed,
        sessionId: "session-123",
        resultMeta: {
          durationMs: 250,
          agentMeta: {
            sessionId: "session-123",
            provider: "openai",
            model: "gpt-5",
          },
        },
        terminal_status: "failed",
        failure_labels: ["exception_before_delivery"],
        deliveredAt: "2026-03-12T12:00:04.000Z",
      });

      expect(persisted).not.toBeNull();
      const trace = getRunTrace(persisted!.trace_id, process.env);
      expect(trace).toMatchObject({
        run_id: "run-trace-pre-delivery-failure",
        terminal_status: "failed",
        usage_unavailable_reason: "Run failed before model usage was available.",
        cost_unavailable_reason: "Run failed before model cost was available.",
      });
      expect(trace?.usage).toBeUndefined();
      expect(trace?.cost).toBeUndefined();
      expect(trace?.failure_labels).toEqual(
        expect.arrayContaining(["exception_before_delivery", "failed"]),
      );
      expect(snapshotNicheRunTraceContext("run-trace-pre-delivery-failure")).toBeUndefined();
    });
  });

  it("persists aborted traces without usage or cost when a seeded run is cancelled early", async () => {
    await withTempHome(async () => {
      const seed = makeSeed();
      registerPreparedNicheRunTraceContext({
        runId: "run-trace-pre-delivery-abort",
        seed,
      });

      const persisted = persistPreparedNicheRunFailureArtifacts({
        runId: "run-trace-pre-delivery-abort",
        nicheRunSeed: seed,
        sessionId: "session-123",
        resultMeta: {
          durationMs: 125,
          aborted: true,
          agentMeta: {
            sessionId: "session-123",
            provider: "openai",
            model: "gpt-5",
          },
        },
        terminal_status: "aborted",
        failure_labels: ["delivery_aborted"],
        deliveredAt: "2026-03-12T12:00:04.000Z",
      });

      expect(persisted).not.toBeNull();
      const trace = getRunTrace(persisted!.trace_id, process.env);
      expect(trace).toMatchObject({
        run_id: "run-trace-pre-delivery-abort",
        terminal_status: "aborted",
        usage_unavailable_reason: "Run aborted before model usage was available.",
        cost_unavailable_reason: "Run aborted before model cost was available.",
      });
      expect(trace?.usage).toBeUndefined();
      expect(trace?.cost).toBeUndefined();
      expect(trace?.failure_labels).toEqual(
        expect.arrayContaining(["aborted", "delivery_aborted"]),
      );
      expect(snapshotNicheRunTraceContext("run-trace-pre-delivery-abort")).toBeUndefined();
    });
  });

  it("clears context after persistence failures too", async () => {
    await withTempHome(async () => {
      const seed = makeSeed();
      registerPreparedNicheRunTraceContext({
        runId: "run-trace-fail",
        seed,
      });
      recordActionProposalForRun("run-trace-fail", makeAllowedDecision(), {
        proposal_id: "proposal-1",
        selected_tool: "exec",
        selected_reason: "Need to reproduce the failure.",
        guard_decision: "allowed",
        selector_score: 1,
        candidate_rankings: [],
        attempt_index: 0,
      });
      recordToolExecutionStart({
        runId: "run-trace-fail",
        toolCallId: "tool-call-1",
        toolName: "exec",
        args: { command: "pnpm test:niche" },
      });
      recordToolExecutionResult({
        runId: "run-trace-fail",
        toolCallId: "tool-call-1",
        toolName: "exec",
        result: { ok: true, output: "tests passed" },
        isError: false,
      });
      maybeRunNicheVerifierGate({
        runId: "run-trace-fail",
        payloads: [{ text: "Repo doc confirms grounded_response." }],
        checkedAt: "2026-03-12T12:00:03.000Z",
      });
      markNicheFinalEmission("run-trace-fail", "2026-03-12T12:00:04.000Z");

      expect(() =>
        persistPreparedNicheRunArtifacts({
          runId: "run-trace-fail",
          nicheRunSeed: seed,
          sessionId: "session-123",
          resultMeta: {
            durationMs: 4000,
          },
          deliveredPayloads: [{ text: "Repo doc confirms grounded_response." }],
          emittedToUser: false,
          deliveredAt: "2026-03-12T12:00:04.000Z",
        }),
      ).toThrow(/agentMeta\.usage/u);
      expect(snapshotNicheRunTraceContext("run-trace-fail")).toBeUndefined();
    });
  });
});
