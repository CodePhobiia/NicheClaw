import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAtomicBenchmark } from "../../../src/niche/benchmark/atomic-runner.js";
import { runEpisodeBenchmark } from "../../../src/niche/benchmark/episode-runner.js";
import {
  markNicheFinalEmission,
  persistPreparedNicheRunArtifacts,
  recordActionProposalForRun,
  recordVerifierDecisionForRun,
  registerPreparedNicheRunTraceContext,
} from "../../../src/niche/runtime/index.js";
import { emitNicheLifecycleEvent } from "../../../src/niche/runtime/lifecycle-events.js";
import type {
  AtomicBenchmarkSuiteRecord,
  PreparedNicheRunSeed,
} from "../../../src/niche/schema/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const runNicheLifecycle = vi.fn(async () => {});
const hookRunnerState = vi.hoisted(() => ({
  enabled: true,
}));

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

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: (hookName: string) => hookName === "niche_lifecycle" && hookRunnerState.enabled,
    runNicheLifecycle,
  }),
}));

beforeEach(() => {
  hookRunnerState.enabled = true;
  runNicheLifecycle.mockReset();
  runNicheLifecycle.mockResolvedValue(undefined);
});

function makeSeed(): PreparedNicheRunSeed {
  return {
    seed_id: "prepared-run-seed-lifecycle",
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
      ontology: { concepts: [{ id: "repo-doc", label: "Repo doc" }], relations: [] },
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
  };
}

function makeBenchmarkSuite(): AtomicBenchmarkSuiteRecord {
  return {
    metadata: {
      benchmark_suite_id: "repo-ci-suite",
      case_kind: "atomic_case",
      mode: "offline_gold",
      split: "gold_eval",
      created_at: "2026-03-12T12:00:00.000Z",
      suite_version: "2026.3.12",
      suite_hash: "0123456789abcdef0123456789abcdef",
      fixture_version: "2026.3.12-fixtures",
      determinism_policy_id: "determinism-v1",
      task_families: ["repo_navigation"],
    },
    cases: [
      {
        eval_case_id: "eval-case-1",
        suite_id: "repo-ci-suite",
        split: "gold_eval",
        task_family: "repo_navigation",
        input: { prompt: "Find the entrypoint." },
        allowed_tools: ["exec"],
        allowed_sources: ["repo-root"],
        grader_spec: {
          grader_refs: ["grader-v1"],
          primary_metric: "task_success",
        },
        pass_conditions: ["correct_entrypoint"],
        hard_fail_conditions: [],
        difficulty: 1,
        seed: "seed-1",
      },
    ],
  };
}

function makeEpisodeBenchmarkSuite() {
  return {
    metadata: {
      benchmark_suite_id: "repo-ci-episode-suite",
      case_kind: "episode_case" as const,
      mode: "offline_gold" as const,
      split: "gold_eval",
      created_at: "2026-03-12T12:00:00.000Z",
      suite_version: "2026.3.12",
      suite_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fixture_version: "2026.3.12-fixtures",
      determinism_policy_id: "determinism-v1",
      task_families: ["repo_navigation"],
    },
    cases: [
      {
        episode_case_id: "episode-case-1",
        suite_id: "repo-ci-episode-suite",
        split: "gold_eval",
        task_family: "repo_navigation",
        initial_state: { branch: "feature/failing-build" },
        allowed_tools: ["exec"],
        allowed_sources: ["repo-root"],
        step_constraints: ["scoped_patch_only"],
        termination_conditions: ["build_passes"],
        grader_spec: {
          grader_refs: ["grader-v1"],
          primary_metric: "task_success",
        },
        hard_fail_conditions: [],
        difficulty: 2,
        seed: "episode-seed-1",
      },
    ],
  };
}

describe("niche lifecycle emission", () => {
  it("validates lifecycle payloads even when no niche_lifecycle hook is registered", () => {
    hookRunnerState.enabled = false;

    expect(() =>
      emitNicheLifecycleEvent({
        event_type: "candidate_promoted",
        run_id: "run-1",
        niche_program_id: "repo-ci-specialist",
        payload: {
          candidate_release_id: "candidate-release-v1",
        },
      } as never),
    ).toThrow(/rollback_target/u);
  });

  it("absorbs hook-runner dispatch failures inside the emitter", async () => {
    runNicheLifecycle.mockRejectedValueOnce(new Error("hook exploded"));

    await expect(
      emitNicheLifecycleEvent({
        event_type: "planner_proposed",
        run_id: "run-1",
        niche_program_id: "repo-ci-specialist",
        candidate_manifest_id: "candidate-manifest-repo-ci",
        payload: {
          selected_manifest_id: "candidate-manifest-repo-ci",
          planner_runtime_component_id: "planner-primary-v1",
        },
      }),
    ).resolves.toBeUndefined();

    expect(runNicheLifecycle).toHaveBeenCalledTimes(1);
  });

  it("emits planner, action, verifier, and trace lifecycle events from the seeded runtime path", async () => {
    await withTempHome(async () => {
      const seed = makeSeed();
      registerPreparedNicheRunTraceContext({
        runId: "run-lifecycle-1",
        seed,
      });
      recordActionProposalForRun(
        "run-lifecycle-1",
        {
          allowed: true,
          code: "allowed",
          reason: "tool allowed",
          violations: [],
        },
        {
          proposal_id: "proposal-1",
          selected_tool: "exec",
          selected_reason: "Need to reproduce the failure.",
          guard_decision: "allowed",
          selector_score: 1,
          candidate_rankings: [],
          attempt_index: 0,
        },
      );
      recordVerifierDecisionForRun("run-lifecycle-1", {
        decision_id: "verifier-1",
        verifier_pack_id: "verifier-pack-repo-ci",
        verifier_pack_version: "2026.3.12",
        run_id: "run-lifecycle-1",
        niche_program_id: "repo-ci-specialist",
        outcome: "approved",
        rationale: "Output is grounded in evidence.",
        findings: [],
        checked_at: "2026-03-12T12:00:03.000Z",
        model_confidence: 0.9,
        evidence_support_ratio: 1,
        effective_confidence: 0.9,
        confidence_threshold: 0.6,
        latency_added_ms: 12,
        cost_added: 0.01,
      });
      markNicheFinalEmission("run-lifecycle-1", "2026-03-12T12:00:04.000Z");

      persistPreparedNicheRunArtifacts({
        runId: "run-lifecycle-1",
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
              output: 50,
              total: 150,
            },
          },
        },
        deliveredPayloads: [{ text: "Repo doc confirms grounded_response." }],
        emittedToUser: false,
        deliveredAt: "2026-03-12T12:00:04.000Z",
      });

      await vi.waitFor(() => {
        const eventTypes = runNicheLifecycle.mock.calls.map(([event]) => event.event_type);
        expect(eventTypes).toEqual(
          expect.arrayContaining([
            "planner_proposed",
            "action_proposed",
            "action_validated",
            "verifier_decision",
            "run_trace_persisted",
          ]),
        );
      });
    });
  });

  it("emits benchmark case lifecycle events from the benchmark runner", async () => {
    const suite = makeBenchmarkSuite();
    await runAtomicBenchmark({
      suite,
      contaminationDetected: false,
      actualSuiteHash: suite.metadata.suite_hash,
      actualFixtureVersion: suite.metadata.fixture_version,
      actualGraderVersion: suite.cases[0].grader_spec.grader_refs[0],
      baselineManifest: {
        baseline_manifest_id: "baseline-manifest-repo-ci",
        niche_program_id: "repo-ci-specialist",
        created_at: "2026-03-12T12:00:00.000Z",
        planner_runtime: {
          component_id: "planner-primary",
          provider: "openai",
          model_id: "gpt-5",
          api_mode: "responses",
        },
        provider: "openai",
        model_id: "gpt-5",
        model_snapshot_id: "gpt-5-2026-03-10",
        api_mode: "responses",
        provider_release_label: "gpt-5-2026-03-10",
        api_revision: "v1",
        capability_snapshot_at: "2026-03-12T11:59:00.000Z",
        provider_metadata_quality: "exact_snapshot",
        sampling_config: { temperature: 0.2 },
        prompt_asset_version: "prompt-v1",
        grader_set_version: "grader-set-v1",
        benchmark_suite_id: "repo-ci-suite",
        source_access_manifest_id: "source-access-repo-ci",
        retry_policy: { max_attempts: 1 },
        token_budget: { max_total_tokens: 8000 },
        context_budget: { max_context_tokens: 16000 },
        execution_mode: "benchmark",
        tool_catalog_version: "tool-catalog-v1",
        tool_allowlist: ["exec"],
        tool_contract_version: "tool-contract-v1",
        retrieval_config: { policy: "baseline" },
        verifier_config: { pack: "baseline" },
      },
      candidateManifest: {
        candidate_manifest_id: "candidate-manifest-repo-ci",
        based_on_baseline_manifest_id: "baseline-manifest-repo-ci",
        niche_program_id: "repo-ci-specialist",
        created_at: "2026-03-12T12:01:00.000Z",
        planner_runtime: {
          component_id: "planner-primary",
          provider: "openai",
          model_id: "gpt-5",
          api_mode: "responses",
        },
        provider: "openai",
        model_id: "gpt-5",
        model_snapshot_id: "gpt-5-2026-03-10",
        api_mode: "responses",
        provider_release_label: "gpt-5-2026-03-10",
        api_revision: "v1",
        capability_snapshot_at: "2026-03-12T11:59:00.000Z",
        provider_metadata_quality: "exact_snapshot",
        sampling_config: { temperature: 0.2 },
        prompt_asset_version: "prompt-v2",
        grader_set_version: "grader-set-v1",
        benchmark_suite_id: "repo-ci-suite",
        source_access_manifest_id: "source-access-repo-ci",
        retry_policy: { max_attempts: 1 },
        token_budget: { max_total_tokens: 8000 },
        context_budget: { max_context_tokens: 16000 },
        execution_mode: "benchmark",
        domain_pack_id: "domain-pack-v1",
        action_policy_id: "action-policy-v1",
        retrieval_stack_id: "retrieval-stack-v1",
        verifier_pack_id: "verifier-pack-v1",
        tool_catalog_version: "tool-catalog-v1",
        tool_allowlist: ["exec"],
        tool_contract_version: "tool-contract-v1",
        retrieval_config: { policy: "baseline" },
        verifier_config: { pack: "baseline" },
        optional_student_model_ids: [],
        candidate_recipe: "candidate-recipe-v1",
      },
      baselineArm: {
        benchmark_arm_id: "baseline-arm",
        benchmark_suite_id: "repo-ci-suite",
        manifest_id: "baseline-manifest-repo-ci",
        arm_kind: "baseline",
        mode: "offline_gold",
      },
      candidateArm: {
        benchmark_arm_id: "candidate-arm",
        benchmark_suite_id: "repo-ci-suite",
        manifest_id: "candidate-manifest-repo-ci",
        arm_kind: "candidate",
        mode: "offline_gold",
      },
      executeBaselineCase: async () => ({
        score: 0.4,
        hard_fail: false,
        latency_ms: 10,
        cost: 0.01,
        verifier_outcome: "approved",
        grader_version: "grader-v1",
      }),
      executeCandidateCase: async () => ({
        score: 0.9,
        hard_fail: false,
        latency_ms: 8,
        cost: 0.01,
        verifier_outcome: "approved",
        grader_version: "grader-v1",
      }),
    });

    await vi.waitFor(() => {
      const eventTypes = runNicheLifecycle.mock.calls.map(([event]) => event.event_type);
      expect(eventTypes).toEqual(
        expect.arrayContaining(["benchmark_case_started", "benchmark_case_finished"]),
      );
    });
  });

  it("emits episode benchmark lifecycle events from the benchmark runner", async () => {
    const episodeSuite = makeEpisodeBenchmarkSuite();
    await runEpisodeBenchmark({
      suite: episodeSuite,
      contaminationDetected: false,
      actualSuiteHash: episodeSuite.metadata.suite_hash,
      actualFixtureVersion: episodeSuite.metadata.fixture_version,
      actualGraderVersion: episodeSuite.cases[0].grader_spec.grader_refs[0],
      baselineManifest: {
        baseline_manifest_id: "baseline-manifest-repo-ci",
        niche_program_id: "repo-ci-specialist",
        created_at: "2026-03-12T12:00:00.000Z",
        planner_runtime: {
          component_id: "planner-primary",
          provider: "openai",
          model_id: "gpt-5",
          api_mode: "responses",
        },
        provider: "openai",
        model_id: "gpt-5",
        model_snapshot_id: "gpt-5-2026-03-10",
        api_mode: "responses",
        provider_release_label: "gpt-5-2026-03-10",
        api_revision: "v1",
        capability_snapshot_at: "2026-03-12T11:59:00.000Z",
        provider_metadata_quality: "exact_snapshot",
        sampling_config: { temperature: 0.2 },
        prompt_asset_version: "prompt-v1",
        grader_set_version: "grader-set-v1",
        benchmark_suite_id: "repo-ci-episode-suite",
        source_access_manifest_id: "source-access-repo-ci",
        retry_policy: { max_attempts: 1 },
        token_budget: { max_total_tokens: 8000 },
        context_budget: { max_context_tokens: 16000 },
        execution_mode: "benchmark",
        tool_catalog_version: "tool-catalog-v1",
        tool_allowlist: ["exec"],
        tool_contract_version: "tool-contract-v1",
        retrieval_config: { policy: "baseline" },
        verifier_config: { pack: "baseline" },
      },
      candidateManifest: {
        candidate_manifest_id: "candidate-manifest-repo-ci",
        based_on_baseline_manifest_id: "baseline-manifest-repo-ci",
        niche_program_id: "repo-ci-specialist",
        created_at: "2026-03-12T12:01:00.000Z",
        planner_runtime: {
          component_id: "planner-primary",
          provider: "openai",
          model_id: "gpt-5",
          api_mode: "responses",
        },
        provider: "openai",
        model_id: "gpt-5",
        model_snapshot_id: "gpt-5-2026-03-10",
        api_mode: "responses",
        provider_release_label: "gpt-5-2026-03-10",
        api_revision: "v1",
        capability_snapshot_at: "2026-03-12T11:59:00.000Z",
        provider_metadata_quality: "exact_snapshot",
        sampling_config: { temperature: 0.2 },
        prompt_asset_version: "prompt-v2",
        grader_set_version: "grader-set-v1",
        benchmark_suite_id: "repo-ci-episode-suite",
        source_access_manifest_id: "source-access-repo-ci",
        retry_policy: { max_attempts: 1 },
        token_budget: { max_total_tokens: 8000 },
        context_budget: { max_context_tokens: 16000 },
        execution_mode: "benchmark",
        domain_pack_id: "domain-pack-v1",
        action_policy_id: "action-policy-v1",
        retrieval_stack_id: "retrieval-stack-v1",
        verifier_pack_id: "verifier-pack-v1",
        tool_catalog_version: "tool-catalog-v1",
        tool_allowlist: ["exec"],
        tool_contract_version: "tool-contract-v1",
        retrieval_config: { policy: "baseline" },
        verifier_config: { pack: "baseline" },
        optional_student_model_ids: [],
        candidate_recipe: "candidate-recipe-v1",
      },
      baselineArm: {
        benchmark_arm_id: "baseline-arm",
        benchmark_suite_id: "repo-ci-episode-suite",
        manifest_id: "baseline-manifest-repo-ci",
        arm_kind: "baseline",
        mode: "offline_gold",
      },
      candidateArm: {
        benchmark_arm_id: "candidate-arm",
        benchmark_suite_id: "repo-ci-episode-suite",
        manifest_id: "candidate-manifest-repo-ci",
        arm_kind: "candidate",
        mode: "offline_gold",
      },
      executeBaselineCase: async () => ({
        total_score: 0.4,
        success: false,
        hard_fail: false,
        step_results: [
          {
            step_index: 0,
            score: 0.4,
            success: false,
            hard_fail: false,
            latency_ms: 10,
            cost: 0.01,
            tool_misuse: false,
            verifier_intervention: false,
            recovery_used: false,
          },
        ],
        verifier_outcome: "repair_requested",
        grader_version: "grader-v1",
        retry_count: 1,
      }),
      executeCandidateCase: async () => ({
        total_score: 0.8,
        success: true,
        hard_fail: false,
        step_results: [
          {
            step_index: 0,
            score: 0.8,
            success: true,
            hard_fail: false,
            latency_ms: 9,
            cost: 0.01,
            tool_misuse: false,
            verifier_intervention: false,
            recovery_used: false,
          },
        ],
        verifier_outcome: "approved",
        grader_version: "grader-v1",
        retry_count: 0,
      }),
    });

    await vi.waitFor(() => {
      const eventTypes = runNicheLifecycle.mock.calls.map(([event]) => event.event_type);
      expect(eventTypes).toEqual(
        expect.arrayContaining(["benchmark_case_started", "benchmark_case_finished"]),
      );
    });
  });
});
