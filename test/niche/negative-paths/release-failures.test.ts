import { describe, expect, it } from "vitest";
import {
  evaluateReleasePolicy,
  createPromotionControllerResult,
  assessPromotedReleaseMonitor,
  createPromotedReleaseMonitorDefinition,
} from "../../../src/niche/release/index.js";
import {
  actuateReleaseDecision,
  executeRollback,
} from "../../../src/niche/release/release-controller.js";
import { runMonitorAssessmentCycle } from "../../../src/niche/release/monitor-service.js";
import type {
  ArtifactRef,
  BaselineManifest,
  BenchmarkResultRecord,
  BenchmarkResultSummary,
  CandidateManifest,
  DriftThresholdSet,
} from "../../../src/niche/schema/index.js";
import type { VerifierMetricSummary } from "../../../src/niche/verifier/index.js";
import type { PromotedMonitorDefinition } from "../../../src/niche/release/promoted-monitor.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeBaselineManifest(): BaselineManifest {
  return {
    baseline_manifest_id: "baseline-manifest-v1",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T12:20:00.000Z",
    planner_runtime: {
      component_id: "planner-runtime-v1",
      version: "2026.3.12",
      label: "Planner",
      specialization_lane: "system_specialization",
    },
    provider: "openai",
    model_id: "gpt-5",
    api_mode: "responses",
    provider_release_label: "2026.03",
    api_revision: "2026-03-01",
    capability_snapshot_at: "2026-03-12T12:20:00.000Z",
    provider_metadata_quality: "release_label_only",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "prompt-v1",
    grader_set_version: "grader-set-v1",
    benchmark_suite_id: "repo-ci-suite",
    source_access_manifest_id: "source-access-v1",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_total_tokens: 8000 },
    context_budget: { max_context_tokens: 16000 },
    execution_mode: "benchmark",
    tool_catalog_version: "tool-catalog-v1",
    tool_allowlist: ["exec", "read"],
    tool_contract_version: "tool-contract-v1",
    retrieval_config: { stack: "retrieval-v1" },
    verifier_config: { pack: "verifier-v1" },
  };
}

function makeCandidateManifest(): CandidateManifest {
  return {
    candidate_manifest_id: "candidate-manifest-v1",
    based_on_baseline_manifest_id: "baseline-manifest-v1",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T12:21:00.000Z",
    planner_runtime: {
      component_id: "planner-runtime-v1",
      version: "2026.3.12",
      label: "Planner",
      specialization_lane: "system_specialization",
    },
    provider: "openai",
    model_id: "gpt-5",
    api_mode: "responses",
    provider_release_label: "2026.03",
    api_revision: "2026-03-01",
    capability_snapshot_at: "2026-03-12T12:21:00.000Z",
    provider_metadata_quality: "release_label_only",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "prompt-v2",
    grader_set_version: "grader-set-v1",
    benchmark_suite_id: "repo-ci-suite",
    source_access_manifest_id: "source-access-v1",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_total_tokens: 8000 },
    context_budget: { max_context_tokens: 16000 },
    execution_mode: "benchmark",
    domain_pack_id: "domain-pack-v1",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    tool_catalog_version: "tool-catalog-v1",
    tool_allowlist: ["exec", "read"],
    tool_contract_version: "tool-contract-v1",
    retrieval_config: { stack: "retrieval-v1" },
    verifier_config: { pack: "verifier-v1" },
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
  };
}

function makeBenchmarkResult(params: {
  resultId: string;
  meanDelta: number;
  lowBound: number;
  hardFailRate?: number;
}): BenchmarkResultSummary {
  return {
    benchmark_result_id: params.resultId,
    benchmark_suite_id: "repo-ci-suite",
    case_kind: "atomic_case",
    mode: "offline_gold",
    baseline_arm_id: "baseline-manifest-v1",
    candidate_arm_id: "candidate-manifest-v1",
    baseline_provider_metadata_quality: "release_label_only",
    candidate_provider_metadata_quality: "release_label_only",
    primary_metric: "task-success",
    case_count: 120,
    paired_delta_summary: {
      mean_delta: params.meanDelta,
      median_delta: params.meanDelta,
      p10_delta: params.meanDelta - 0.02,
      p90_delta: params.meanDelta + 0.02,
      confidence_interval_low: params.lowBound,
      confidence_interval_high: params.meanDelta + 0.03,
    },
    task_family_summaries: [
      {
        task_family: "repo-ci-verification",
        case_count: 40,
        score_mean: 0.82,
        hard_fail_rate: params.hardFailRate ?? 0.02,
        mean_delta: params.meanDelta,
      },
      {
        task_family: "repo-navigation",
        case_count: 40,
        score_mean: 0.8,
        hard_fail_rate: params.hardFailRate ?? 0.02,
        mean_delta: params.meanDelta,
      },
      {
        task_family: "repair-loop",
        case_count: 40,
        score_mean: 0.84,
        hard_fail_rate: params.hardFailRate ?? 0.02,
        mean_delta: params.meanDelta,
      },
    ],
    contamination_audit_summary: {
      contamination_detected: false,
      audited_case_count: 120,
      notes: "No contamination detected.",
    },
    invalidated: false,
    invalidation_reasons: [],
  };
}

function makeBenchmarkRecord(
  summary: BenchmarkResultSummary,
  overrides: Partial<BenchmarkResultRecord> = {},
): BenchmarkResultRecord {
  return {
    benchmark_result_record_id: `record-${summary.benchmark_result_id}`,
    summary,
    baseline_manifest_id: "baseline-manifest-v1",
    candidate_manifest_id: "candidate-manifest-v1",
    suite_hash: "0123456789abcdef0123456789abcdef",
    fixture_version: "2026.3.12-fixtures",
    actual_suite_hash: "0123456789abcdef0123456789abcdef",
    actual_fixture_version: "2026.3.12-fixtures",
    actual_grader_version: "grader-v1",
    case_membership_hash: "fedcba9876543210fedcba9876543210",
    run_trace_refs: ["run-trace-1"],
    replay_bundle_refs: ["replay-bundle-1"],
    evidence_bundle_ids: ["evidence-bundle-1"],
    arbitration_outcome_summary: {
      arbitration_policy_id: "arbitration-v1",
      unresolved_blocking_conflicts: false,
      unresolved_conflict_count: 0,
      blocking_conflict_types: [],
    },
    created_at: "2026-03-12T12:22:00.000Z",
    ...overrides,
  };
}

function makeVerifierMetrics(
  overrides: Partial<VerifierMetricSummary> = {},
): VerifierMetricSummary {
  return {
    sample_count: 50,
    true_positive_rate: 0.2,
    false_positive_rate: 0.04,
    false_veto_rate: 0.02,
    pass_through_rate: 0.74,
    override_rate: 0.04,
    mean_latency_added_ms: 35,
    mean_cost_added: 0.02,
    total_cost_added: 1,
    counts: {
      true_positive: 10,
      false_positive: 2,
      false_veto: 1,
      pass_through: 37,
      overrides: 2,
    },
    ...overrides,
  };
}

function makeArtifactRef(id: string): ArtifactRef {
  return {
    artifact_id: id,
    artifact_type: "release_bundle",
    version: "2026.3.12",
    content_hash: "0123456789abcdef0123456789abcdef",
    rights_state: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
    },
    created_at: "2026-03-12T12:22:00.000Z",
  };
}

function makeDriftThresholds(overrides: Partial<DriftThresholdSet> = {}): DriftThresholdSet {
  return {
    task_success_drift: 0.1,
    task_family_drift: 0.1,
    verifier_false_veto_drift: 0.1,
    grader_disagreement_drift: 0.1,
    source_freshness_decay: 0.1,
    latency_cost_drift: 0.1,
    hard_fail_drift: 0.1,
    ...overrides,
  };
}

function makeMonitorDefinition(): PromotedMonitorDefinition {
  return createPromotedReleaseMonitorDefinition({
    promotedReleaseId: "promoted-release-v1",
    baselineManifestId: "baseline-manifest-v1",
    candidateManifestId: "candidate-manifest-v1",
    driftThresholds: makeDriftThresholds(),
    verifierDriftThresholds: makeDriftThresholds(),
    graderDriftThresholds: makeDriftThresholds(),
    cadenceDefaults: {
      alert_hysteresis_windows: 2,
      rollback_cooldown_hours: 24,
    },
  });
}

describe("evaluateReleasePolicy negative paths", () => {
  it("blocks release with zero benchmark results", () => {
    const policy = evaluateReleasePolicy({
      baselineManifest: makeBaselineManifest(),
      candidateManifest: makeCandidateManifest(),
      benchmarkResults: [],
      verifierMetrics: makeVerifierMetrics(),
      latencyRegression: 0.0,
      costRegression: 0.0,
      postPromotionMonitorConfigured: true,
    });

    expect(policy.recommended_decision).toBe("rejected");
    expect(policy.blocking_reasons.length).toBeGreaterThan(0);
    expect(
      policy.blocking_reasons.some((reason) =>
        reason.includes("At least one benchmark result is required"),
      ),
    ).toBe(true);
  });

  it("blocks release when hard fail rate is 100%", () => {
    const policy = evaluateReleasePolicy({
      baselineManifest: makeBaselineManifest(),
      candidateManifest: makeCandidateManifest(),
      benchmarkResults: [
        makeBenchmarkRecord(
          makeBenchmarkResult({
            resultId: "high-fail-result",
            meanDelta: 0.08,
            lowBound: 0.03,
            hardFailRate: 1.0,
          }),
        ),
      ],
      verifierMetrics: makeVerifierMetrics(),
      latencyRegression: 0.0,
      costRegression: 0.0,
      postPromotionMonitorConfigured: true,
    });

    expect(policy.recommended_decision).toBe("rejected");
    expect(
      policy.blocking_reasons.some((reason) => reason.includes("Hard-fail rate")),
    ).toBe(true);
  });
});

describe("actuateReleaseDecision negative paths", () => {
  it("does not actuate when decision is rejected", async () => {
    await withTempHome(async () => {
      const policy = evaluateReleasePolicy({
        baselineManifest: makeBaselineManifest(),
        candidateManifest: makeCandidateManifest(),
        benchmarkResults: [],
        verifierMetrics: makeVerifierMetrics(),
        latencyRegression: 0.0,
        costRegression: 0.0,
        postPromotionMonitorConfigured: true,
      });

      const promotionResult = createPromotionControllerResult({
        candidateReleaseId: "rejected-release",
        nicheProgramId: "repo-ci-specialist",
        baselineReleaseId: "baseline-release-v1",
        baselineManifest: makeBaselineManifest(),
        candidateManifest: makeCandidateManifest(),
        componentArtifactRefs: [makeArtifactRef("release-bundle-v1")],
        benchmarkResults: [
          makeBenchmarkResult({ resultId: "result-1", meanDelta: 0.0, lowBound: -0.01 }),
        ],
        approvedBy: ["operator"],
        rollbackTarget: "baseline-release-v1",
        policyEvaluation: policy,
      });

      const result = actuateReleaseDecision({
        promotionResult,
        stackRecord: {
          active_stack_id: "stack-rejected",
          niche_program_id: "repo-ci-specialist",
          candidate_manifest_id: "candidate-manifest-v1",
          registered_at: "2026-03-12T12:22:00.000Z",
          release_mode: "shadow",
          run_seed_template: {} as never,
        },
        agentId: "main",
        env: process.env,
      });

      expect(result.actuated).toBe(false);
      expect(result.decision).toBe("rejected");
      expect(result.active_stack_id).toBeNull();
      expect(result.release_mode).toBeNull();
    });
  });
});

describe("executeRollback negative paths", () => {
  it("returns rolled_back: false for non-existent stack", async () => {
    await withTempHome(async () => {
      const result = executeRollback({
        activeStackId: "nonexistent-stack",
        agentId: "main",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        reason: "Test rollback for missing stack.",
        env: process.env,
      });

      expect(result.rolled_back).toBe(false);
      expect(result.previous_stack_id).toBe("nonexistent-stack");
      expect(result.reason).toMatch(/not found/);
    });
  });
});

describe("runMonitorAssessmentCycle negative paths", () => {
  it("returns skipped_reason for non-existent stack", async () => {
    await withTempHome(async () => {
      const result = runMonitorAssessmentCycle({
        definition: makeMonitorDefinition(),
        agentId: "main",
        activeStackId: "nonexistent-stack",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        collectObservation: () => null,
        env: process.env,
      });

      expect(result.assessment).toBeNull();
      expect(result.rollback).toBeNull();
      expect(result.skipped_reason).toMatch(/not found/);
    });
  });
});

describe("assessPromotedReleaseMonitor negative paths", () => {
  it("returns should_rollback: true when all dimensions are breached", () => {
    const definition = makeMonitorDefinition();

    const assessment = assessPromotedReleaseMonitor({
      definition,
      observation: {
        observed_drift: {
          task_success_drift: 0.5,
          task_family_drift: 0.5,
          verifier_false_veto_drift: 0.5,
          grader_disagreement_drift: 0.5,
          source_freshness_decay: 0.5,
          latency_cost_drift: 0.5,
          hard_fail_drift: 0.5,
        },
        consecutive_breach_windows: 5,
      },
    });

    expect(assessment.should_rollback).toBe(true);
    expect(assessment.breached_dimensions.length).toBeGreaterThan(0);
    expect(assessment.cooldown_active).toBe(false);
  });

  it("returns should_rollback: false when no dimensions are breached", () => {
    const definition = makeMonitorDefinition();

    const assessment = assessPromotedReleaseMonitor({
      definition,
      observation: {
        observed_drift: {
          task_success_drift: 0.0,
          task_family_drift: 0.0,
          verifier_false_veto_drift: 0.0,
          grader_disagreement_drift: 0.0,
          source_freshness_decay: 0.0,
          latency_cost_drift: 0.0,
          hard_fail_drift: 0.0,
        },
        consecutive_breach_windows: 0,
      },
    });

    expect(assessment.should_rollback).toBe(false);
    expect(assessment.breached_dimensions).toEqual([]);
  });
});

describe("createPromotionControllerResult negative paths", () => {
  it("returns rejected decision when policy has blocking reasons", () => {
    const policy = evaluateReleasePolicy({
      baselineManifest: makeBaselineManifest(),
      candidateManifest: makeCandidateManifest(),
      benchmarkResults: [],
      verifierMetrics: makeVerifierMetrics(),
      latencyRegression: 0.0,
      costRegression: 0.0,
      postPromotionMonitorConfigured: true,
    });

    const result = createPromotionControllerResult({
      candidateReleaseId: "blocked-release",
      nicheProgramId: "repo-ci-specialist",
      baselineReleaseId: "baseline-release-v1",
      baselineManifest: makeBaselineManifest(),
      candidateManifest: makeCandidateManifest(),
      componentArtifactRefs: [makeArtifactRef("release-bundle-v1")],
      benchmarkResults: [
        makeBenchmarkResult({ resultId: "result-1", meanDelta: 0.0, lowBound: -0.01 }),
      ],
      approvedBy: ["operator"],
      rollbackTarget: "baseline-release-v1",
      policyEvaluation: policy,
    });

    expect(result.decision).toBe("rejected");
    expect(result.candidate_release.decision).toBe("rejected");
    expect(result.reason).toBeTruthy();
  });
});
