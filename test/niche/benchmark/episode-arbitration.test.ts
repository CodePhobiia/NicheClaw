import { describe, expect, it } from "vitest";
import {
  arbitrateGraderSignals,
  collectBenchmarkInvalidationReasons,
  isBenchmarkInvalidated,
  runEpisodeBenchmark,
} from "../../../src/niche/benchmark/index.js";
import type {
  BaselineManifest,
  CandidateManifest,
  EpisodeCase,
} from "../../../src/niche/schema/index.js";

function makeBaselineManifest(): BaselineManifest {
  return {
    baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T10:00:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
      notes: "Baseline planner runtime.",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T09:59:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "exact_snapshot",
    provider_runtime_notes: "Pinned baseline provider metadata.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12-baseline",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-episode-suite",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Baseline manifest.",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["read", "exec", "apply_patch"],
    tool_contract_version: "2026.3.12",
    retrieval_config: { retrieval_policy: "baseline" },
    verifier_config: { verifier_pack: "baseline" },
  };
}

function makeCandidateManifest(): CandidateManifest {
  return {
    candidate_manifest_id: "candidate-manifest-repo-ci",
    based_on_baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T10:01:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
      notes: "Candidate keeps the same planner runtime family.",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T09:59:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "proxy_resolved",
    provider_runtime_notes: "Proxy-resolved provider metadata.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12-candidate",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-episode-suite",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Candidate manifest.",
    domain_pack_id: "repo-ci-pack",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["read", "exec", "apply_patch"],
    tool_contract_version: "2026.3.12",
    retrieval_config: { retrieval_policy: "baseline" },
    verifier_config: { verifier_pack: "baseline" },
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
  };
}

function makeEpisodeSuite() {
  return {
    metadata: {
      benchmark_suite_id: "repo-ci-episode-suite",
      case_kind: "episode_case" as const,
      mode: "offline_gold" as const,
      split: "gold_eval",
      created_at: "2026-03-12T11:00:00.000Z",
      suite_version: "2026.3.12",
      suite_hash: "fedcba9876543210fedcba9876543210",
      fixture_version: "2026.3.12-fixtures",
      determinism_policy_id: "determinism-v1",
      task_families: ["ci_repair"],
      description: "Episode benchmark suite.",
    },
    cases: [
      {
        episode_case_id: "episode-case-1",
        suite_id: "repo-ci-episode-suite",
        split: "gold_eval",
        task_family: "ci_repair",
        initial_state: { branch: "feature/failing-build" },
        allowed_tools: ["read", "exec", "apply_patch"],
        allowed_sources: ["repo-root", "ci-logs"],
        step_constraints: ["no_unapproved_network", "scoped_patch_only"],
        termination_conditions: ["build_passes", "operator_escalation"],
        grader_spec: {
          grader_refs: ["grader-task-success"],
          primary_metric: "task_success",
        },
        hard_fail_conditions: ["unsafe_command_use"],
        difficulty: 3,
        seed: "episode-seed-1",
      },
    ] satisfies EpisodeCase[],
  };
}

function makeBenchmarkArm(params: { armKind: "baseline" | "candidate"; manifestId: string }) {
  return {
    benchmark_arm_id: `benchmark-arm-${params.armKind}`,
    benchmark_suite_id: "repo-ci-episode-suite",
    manifest_id: params.manifestId,
    arm_kind: params.armKind,
    mode: "offline_gold" as const,
  };
}

describe("episode benchmark runner", () => {
  it("records per-step metrics and emits an episode summary compatible with benchmark results", async () => {
    const baselineManifest = makeBaselineManifest();
    const candidateManifest = makeCandidateManifest();
    const suite = makeEpisodeSuite();
    const result = await runEpisodeBenchmark({
      suite,
      baselineManifest,
      candidateManifest,
      baselineArm: makeBenchmarkArm({
        armKind: "baseline",
        manifestId: baselineManifest.baseline_manifest_id,
      }),
      candidateArm: makeBenchmarkArm({
        armKind: "candidate",
        manifestId: candidateManifest.candidate_manifest_id,
      }),
      bootstrapSeed: 13,
      contaminationDetected: false,
      actualSuiteHash: suite.metadata.suite_hash,
      actualFixtureVersion: suite.metadata.fixture_version,
      actualGraderVersion: suite.cases[0].grader_spec.grader_refs[0],
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
            latency_ms: 100,
            cost: 0.01,
            tool_misuse: false,
            verifier_intervention: true,
            recovery_used: false,
          },
        ],
        verifier_outcome: "repair_requested",
        grader_version: "grader-v1",
        retry_count: 1,
        memory_effect_summary: "Baseline required a retry after verifier intervention.",
      }),
      executeCandidateCase: async () => ({
        total_score: 0.9,
        success: true,
        hard_fail: false,
        step_results: [
          {
            step_index: 0,
            score: 0.5,
            success: true,
            hard_fail: false,
            latency_ms: 90,
            cost: 0.01,
            tool_misuse: false,
            verifier_intervention: false,
            recovery_used: false,
          },
          {
            step_index: 1,
            score: 0.4,
            success: true,
            hard_fail: false,
            latency_ms: 80,
            cost: 0.01,
            tool_misuse: false,
            verifier_intervention: false,
            recovery_used: true,
          },
        ],
        verifier_outcome: "approved",
        grader_version: "grader-v1",
        retry_count: 0,
        memory_effect_summary: "No compaction issues observed.",
      }),
    });

    expect(result.summary.invalidated).toBe(false);
    expect(result.paired_case_results).toHaveLength(1);
    expect(result.paired_case_results[0]?.candidate.step_results).toHaveLength(2);
    expect(result.summary.task_family_summaries[0]?.task_family).toBe("ci_repair");
    expect(result.summary.task_family_summaries[0]?.mean_delta).toBeCloseTo(0.5);
  });
});

describe("benchmark invalidation", () => {
  it("flags suite-hash drift, fixture-version drift, and contamination", () => {
    const reasons = collectBenchmarkInvalidationReasons({
      baselineManifest: makeBaselineManifest(),
      candidateManifest: makeCandidateManifest(),
      contaminationDetected: true,
      expectedSuiteHash: "suite-hash-a",
      actualSuiteHash: "suite-hash-b",
      expectedFixtureVersion: "fixtures-a",
      actualFixtureVersion: "fixtures-b",
      expectedGraderVersion: "grader-a",
      actualGraderVersion: "grader-b",
      expectedSourceAccessManifestId: "repo-ci-source-access",
      actualSourceAccessManifestId: "other-source-access",
    });

    expect(isBenchmarkInvalidated(reasons)).toBe(true);
    expect(reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "contamination_detected",
        "benchmark_suite_hash_drift",
        "fixture_version_drift",
        "grader_version_drift",
        "source_access_mismatch",
      ]),
    );
  });
});

describe("grader arbitration", () => {
  it("arbitrates mixed rule, model, and SME signals deterministically", () => {
    const weightedVote = arbitrateGraderSignals({
      mode: "weighted_vote",
      signals: [
        {
          grader_id: "rule-1",
          grader_type: "deterministic_rule",
          outcome: "pass",
          score: 1,
          blocking: false,
        },
        {
          grader_id: "model-1",
          grader_type: "model_based",
          outcome: "fail",
          score: 0.6,
          blocking: false,
        },
      ],
    });
    const ruleFirst = arbitrateGraderSignals({
      mode: "rule_first",
      signals: [
        {
          grader_id: "rule-1",
          grader_type: "deterministic_rule",
          outcome: "fail",
          score: 1,
          blocking: true,
        },
        {
          grader_id: "model-1",
          grader_type: "model_based",
          outcome: "pass",
          score: 0.8,
          blocking: false,
        },
      ],
    });
    const smeRequired = arbitrateGraderSignals({
      mode: "sme_required_on_conflict",
      signals: [
        {
          grader_id: "rule-1",
          grader_type: "deterministic_rule",
          outcome: "pass",
          score: 1,
          blocking: false,
        },
        {
          grader_id: "model-1",
          grader_type: "model_based",
          outcome: "fail",
          score: 0.9,
          blocking: false,
        },
      ],
    });

    expect(weightedVote.outcome).toBe("pass");
    expect(ruleFirst.outcome).toBe("fail");
    expect(smeRequired.outcome).toBe("needs_sme");
  });
});
