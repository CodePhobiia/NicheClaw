import { describe, expect, it } from "vitest";
import {
  CandidateReleaseSchema,
  PromotedReleaseMonitorSchema,
  type ArtifactRef,
  type BaselineManifest,
  type BenchmarkResultSummary,
  type CandidateManifest,
} from "../../../src/niche/schema/index.js";
import { validateJsonSchemaValue } from "../../../src/plugins/schema-validator.js";
import {
  assessPromotedReleaseMonitor,
  createPromotedReleaseMonitorDefinition,
  createPromotionControllerResult,
  evaluateReleasePolicy,
} from "../../../src/niche/release/index.js";
import type { VerifierMetricSummary } from "../../../src/niche/verifier/index.js";

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
    retry_policy: {
      max_attempts: 1,
    },
    token_budget: {
      max_total_tokens: 8000,
    },
    context_budget: {
      max_context_tokens: 16000,
    },
    execution_mode: "benchmark",
    tool_catalog_version: "tool-catalog-v1",
    tool_allowlist: ["exec", "read"],
    tool_contract_version: "tool-contract-v1",
    retrieval_config: {
      stack: "retrieval-v1",
    },
    verifier_config: {
      pack: "verifier-v1",
    },
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
    grader_set_version: "grader-set-v2",
    benchmark_suite_id: "repo-ci-suite",
    source_access_manifest_id: "source-access-v1",
    retry_policy: {
      max_attempts: 1,
    },
    token_budget: {
      max_total_tokens: 8000,
    },
    context_budget: {
      max_context_tokens: 16000,
    },
    execution_mode: "benchmark",
    domain_pack_id: "domain-pack-v1",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
  };
}

function makeBenchmarkResult(params: {
  resultId: string;
  meanDelta: number;
  lowBound: number;
  hardFailRate?: number;
  invalidated?: boolean;
  contaminationDetected?: boolean;
  suiteId?: string;
}): BenchmarkResultSummary {
  return {
    benchmark_result_id: params.resultId,
    benchmark_suite_id: params.suiteId ?? "repo-ci-suite",
    case_kind: "atomic_case",
    mode: "offline_gold",
    baseline_arm_id: "baseline-manifest-v1",
    candidate_arm_id: "candidate-manifest-v1",
    provider_metadata_quality: "release_label_only",
    primary_metric: "task_success",
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
        case_count: 120,
        score_mean: 0.82,
        hard_fail_rate: params.hardFailRate ?? 0.02,
      },
    ],
    contamination_audit_summary: {
      contamination_detected: params.contaminationDetected ?? false,
      audited_case_count: 120,
      notes: "No contamination detected.",
    },
    invalidated: params.invalidated ?? false,
    invalidation_reasons: params.invalidated ? ["suite drift"] : [],
  };
}

function makeVerifierMetrics(overrides: Partial<VerifierMetricSummary> = {}): VerifierMetricSummary {
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

describe("release engine and promoted monitor", () => {
  it("promotes a candidate with strong benchmark and shadow evidence", () => {
    const policy = evaluateReleasePolicy({
      baselineManifest: makeBaselineManifest(),
      candidateManifest: makeCandidateManifest(),
      benchmarkResults: [makeBenchmarkResult({ resultId: "benchmark-1", meanDelta: 0.08, lowBound: 0.03 })],
      shadowResults: [makeBenchmarkResult({ resultId: "shadow-1", meanDelta: 0.04, lowBound: 0.01 })],
      verifierMetrics: makeVerifierMetrics(),
      latencyRegression: 0.05,
      costRegression: 0.04,
      postPromotionMonitorConfigured: true,
    });

    const promotion = createPromotionControllerResult({
      candidateReleaseId: "candidate-release-v1",
      nicheProgramId: "repo-ci-specialist",
      baselineReleaseId: "baseline-release-v1",
      baselineManifest: makeBaselineManifest(),
      candidateManifest: makeCandidateManifest(),
      componentArtifactRefs: [makeArtifactRef("release-bundle-v1")],
      benchmarkResults: [makeBenchmarkResult({ resultId: "benchmark-1", meanDelta: 0.08, lowBound: 0.03 })],
      shadowResults: [makeBenchmarkResult({ resultId: "shadow-1", meanDelta: 0.04, lowBound: 0.01 })],
      approvedBy: ["release-operator"],
      rollbackTarget: "baseline-release-v1",
      policyEvaluation: policy,
    });

    expect(policy.recommended_decision).toBe("promoted");
    expect(promotion.decision).toBe("promoted");
    expect(
      validateJsonSchemaValue({
        schema: CandidateReleaseSchema,
        cacheKey: "candidate-release",
        value: promotion.candidate_release,
      }).ok,
    ).toBe(true);
  });

  it("rejects a candidate when benchmark evidence is invalid", () => {
    const policy = evaluateReleasePolicy({
      baselineManifest: makeBaselineManifest(),
      candidateManifest: makeCandidateManifest(),
      benchmarkResults: [
        makeBenchmarkResult({
          resultId: "benchmark-invalid",
          meanDelta: 0.08,
          lowBound: 0.03,
          invalidated: true,
        }),
      ],
      verifierMetrics: makeVerifierMetrics(),
      latencyRegression: 0.05,
      costRegression: 0.04,
      postPromotionMonitorConfigured: true,
    });

    expect(policy.recommended_decision).toBe("rejected");
    expect(policy.blocking_reasons[0]).toContain("invalidated");
  });

  it("rejects benchmark evidence from the wrong suite instead of trusting it", () => {
    const policy = evaluateReleasePolicy({
      baselineManifest: makeBaselineManifest(),
      candidateManifest: makeCandidateManifest(),
      benchmarkResults: [
        makeBenchmarkResult({
          resultId: "benchmark-wrong-suite",
          meanDelta: 0.08,
          lowBound: 0.03,
          suiteId: "other-suite",
        }),
      ],
      verifierMetrics: makeVerifierMetrics(),
      latencyRegression: 0.05,
      costRegression: 0.04,
      postPromotionMonitorConfigured: true,
    });

    expect(policy.recommended_decision).toBe("rejected");
    expect(policy.blocking_reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("targets suite other-suite"),
      ]),
    );
  });

  it("keeps a winning candidate in shadow when shadow evidence is still missing", () => {
    const policy = evaluateReleasePolicy({
      baselineManifest: makeBaselineManifest(),
      candidateManifest: makeCandidateManifest(),
      benchmarkResults: [makeBenchmarkResult({ resultId: "benchmark-2", meanDelta: 0.05, lowBound: 0.01 })],
      verifierMetrics: makeVerifierMetrics(),
      latencyRegression: 0.05,
      costRegression: 0.04,
      postPromotionMonitorConfigured: true,
    });

    expect(policy.recommended_decision).toBe("shadow");
    expect(policy.warnings[0]).toContain("Shadow results");
  });

  it("routes a marginal shadow win into canary instead of full promotion", () => {
    const policy = evaluateReleasePolicy({
      baselineManifest: makeBaselineManifest(),
      candidateManifest: makeCandidateManifest(),
      benchmarkResults: [makeBenchmarkResult({ resultId: "benchmark-3", meanDelta: 0.06, lowBound: 0.02 })],
      shadowResults: [makeBenchmarkResult({ resultId: "shadow-2", meanDelta: 0.01, lowBound: -0.01 })],
      verifierMetrics: makeVerifierMetrics(),
      latencyRegression: 0.05,
      costRegression: 0.04,
      postPromotionMonitorConfigured: true,
    });

    expect(policy.recommended_decision).toBe("canary");
  });

  it("models promoted-monitor defaults and triggers rollback on sustained drift", () => {
    const monitorDefinition = createPromotedReleaseMonitorDefinition({
      promotedReleaseId: "candidate-release-v1",
      baselineManifestId: "baseline-manifest-v1",
      candidateManifestId: "candidate-manifest-v1",
      driftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
      verifierDriftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
      graderDriftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
    });
    const assessment = assessPromotedReleaseMonitor({
      definition: monitorDefinition,
      observation: {
        observed_drift: {
          task_success_drift: 0.06,
          task_family_drift: 0.04,
          verifier_false_veto_drift: 0.03,
          grader_disagreement_drift: 0.01,
          source_freshness_decay: 0.1,
          latency_cost_drift: 0.08,
          hard_fail_drift: 0.01,
        },
        consecutive_breach_windows: 2,
        hours_since_last_rollback: 30,
      },
    });

    expect(monitorDefinition.cadence_defaults.shadow_recheck_interval_hours).toBe(24);
    expect(monitorDefinition.cadence_defaults.alert_hysteresis_windows).toBe(2);
    expect(monitorDefinition.cadence_defaults.rollback_cooldown_hours).toBe(24);
    expect(
      validateJsonSchemaValue({
        schema: PromotedReleaseMonitorSchema,
        cacheKey: "promoted-monitor",
        value: monitorDefinition.monitor,
      }).ok,
    ).toBe(true);
    expect(assessment.should_rollback).toBe(true);
    expect(assessment.breached_dimensions).toContain("task_success_drift");
    expect(assessment.breached_dimensions).toContain("verifier_false_veto_drift");
  });
});
