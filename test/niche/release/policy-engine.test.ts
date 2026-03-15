import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RELEASE_POLICY_THRESHOLDS,
  evaluateReleasePolicy,
  type ReleasePolicyThresholds,
} from "../../../src/niche/release/index.js";
import type {
  BaselineManifest,
  BenchmarkResultRecord,
  CandidateManifest,
} from "../../../src/niche/schema/index.js";
import type { VerifierMetricSummary } from "../../../src/niche/verifier/index.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

const SHARED_MANIFEST_FIELDS = {
  niche_program_id: "repo-ci-specialist",
  created_at: "2026-03-12T10:00:00.000Z",
  planner_runtime: {
    component_id: "planner-v1",
    provider: "anthropic",
    model_id: "claude-sonnet-4-20250514",
    api_mode: "messages",
  },
  provider: "anthropic",
  model_id: "claude-sonnet-4-20250514",
  api_mode: "messages",
  provider_metadata_quality: "exact_snapshot" as const,
  sampling_config: { temperature: 0 },
  prompt_asset_version: "2026.3.12",
  grader_set_version: "grader-v1",
  benchmark_suite_id: "suite-1",
  source_access_manifest_id: "source-access-v1",
  retry_policy: { max_attempts: 1 },
  token_budget: {},
  context_budget: {},
  execution_mode: "standard",
  tool_catalog_version: "catalog-v1",
  tool_allowlist: ["exec"],
  tool_contract_version: "contract-v1",
  retrieval_config: {},
  verifier_config: {},
} as const;

function makeBaselineManifest(overrides?: Partial<BaselineManifest>): BaselineManifest {
  return {
    baseline_manifest_id: "baseline-manifest-v1",
    ...SHARED_MANIFEST_FIELDS,
    ...overrides,
  } as BaselineManifest;
}

function makeCandidateManifest(overrides?: Partial<CandidateManifest>): CandidateManifest {
  return {
    candidate_manifest_id: "candidate-manifest-v1",
    based_on_baseline_manifest_id: "baseline-manifest-v1",
    ...SHARED_MANIFEST_FIELDS,
    domain_pack_id: "pack-v1",
    action_policy_id: "action-v1",
    retrieval_stack_id: "retrieval-v1",
    verifier_pack_id: "verifier-v1",
    optional_student_model_ids: [],
    candidate_recipe: "recipe-v1",
    ...overrides,
  } as CandidateManifest;
}

function makeTaskFamilySummaries(
  count: number,
  caseCountPerFamily: number,
  hardFailRate = 0,
  meanDelta = 0.1,
) {
  const families = [];
  for (let i = 0; i < count; i++) {
    families.push({
      task_family: `family-${i}`,
      case_count: caseCountPerFamily,
      score_mean: 0.9,
      hard_fail_rate: hardFailRate,
      mean_delta: meanDelta,
    });
  }
  return families;
}

function makeBenchmarkResult(
  overrides?: Partial<{
    benchmark_result_id: string;
    case_count: number;
    mean_delta: number;
    confidence_interval_low: number;
    confidence_interval_high: number;
    task_family_count: number;
    hard_fail_rate: number;
    task_family_mean_delta: number;
    invalidated: boolean;
    contamination_detected: boolean;
    baseline_provider_metadata_quality: string;
    candidate_provider_metadata_quality: string;
  }>,
): BenchmarkResultRecord {
  const resultId = overrides?.benchmark_result_id ?? "result-1";
  const caseCount = overrides?.case_count ?? 120;
  const taskFamilyCount = overrides?.task_family_count ?? 4;
  const casesPerFamily = Math.ceil(caseCount / taskFamilyCount);
  const meanDelta = overrides?.mean_delta ?? 0.15;
  const ciLow = overrides?.confidence_interval_low ?? 0.05;
  const ciHigh = overrides?.confidence_interval_high ?? 0.25;
  const hardFailRate = overrides?.hard_fail_rate ?? 0.02;
  const familyMeanDelta = overrides?.task_family_mean_delta ?? 0.1;

  return {
    benchmark_result_record_id: `record-${resultId}`,
    summary: {
      benchmark_result_id: resultId,
      benchmark_suite_id: "suite-1",
      case_kind: "atomic_case",
      mode: "offline_gold",
      baseline_arm_id: "baseline-arm",
      candidate_arm_id: "candidate-arm",
      baseline_provider_metadata_quality:
        (overrides?.baseline_provider_metadata_quality as "exact_snapshot") ?? "exact_snapshot",
      candidate_provider_metadata_quality:
        (overrides?.candidate_provider_metadata_quality as "exact_snapshot") ?? "exact_snapshot",
      primary_metric: "task_success",
      case_count: caseCount,
      paired_delta_summary: {
        mean_delta: meanDelta,
        median_delta: meanDelta,
        p10_delta: ciLow,
        p90_delta: ciHigh,
        confidence_interval_low: ciLow,
        confidence_interval_high: ciHigh,
      },
      task_family_summaries: makeTaskFamilySummaries(
        taskFamilyCount,
        casesPerFamily,
        hardFailRate,
        familyMeanDelta,
      ),
      contamination_audit_summary: {
        contamination_detected: overrides?.contamination_detected ?? false,
        audited_case_count: caseCount,
      },
      invalidated: overrides?.invalidated ?? false,
      invalidation_reasons: [],
    },
    baseline_manifest_id: "baseline-manifest-v1",
    candidate_manifest_id: "candidate-manifest-v1",
    baseline_template_manifest_id: "baseline-manifest-v1",
    candidate_template_manifest_id: "candidate-manifest-v1",
    suite_hash: "0123456789abcdef0123456789abcdef",
    fixture_version: "fixture-v1",
    actual_suite_hash: "0123456789abcdef0123456789abcdef",
    actual_fixture_version: "fixture-v1",
    case_membership_hash: "0123456789abcdef0123456789abcdef",
    run_trace_refs: ["trace-ref-1"],
    replay_bundle_refs: ["replay-ref-1"],
    evidence_bundle_ids: ["evidence-ref-1"],
    arbitration_outcome_summary: {
      arbitration_policy_id: "arb-policy-v1",
      unresolved_blocking_conflicts: false,
      unresolved_conflict_count: 0,
      blocking_conflict_types: [],
    },
    created_at: "2026-03-12T12:00:00.000Z",
  };
}

function makeVerifierMetrics(
  overrides?: Partial<VerifierMetricSummary>,
): VerifierMetricSummary {
  return {
    sample_count: 100,
    true_positive_rate: 0.9,
    false_positive_rate: 0.02,
    false_veto_rate: 0.02,
    pass_through_rate: 0.88,
    override_rate: 0.02,
    mean_latency_added_ms: 50,
    mean_cost_added: 0.001,
    total_cost_added: 0.1,
    counts: {
      true_positive: 90,
      false_positive: 2,
      false_veto: 2,
      pass_through: 88,
      overrides: 2,
    },
    ...overrides,
  };
}

function makePassingShadowResults(): BenchmarkResultRecord[] {
  return [
    makeBenchmarkResult({
      benchmark_result_id: "shadow-result-1",
      mean_delta: 0.1,
      confidence_interval_low: 0.02,
      confidence_interval_high: 0.2,
    }),
  ];
}

/**
 * A baseline policy evaluation call with all thresholds met, used as a starting
 * point for individual test modifications.
 */
function evaluateCleanPass(overrides?: {
  benchmarkResults?: BenchmarkResultRecord[];
  shadowResults?: BenchmarkResultRecord[];
  verifierMetrics?: VerifierMetricSummary;
  latencyRegression?: number;
  costRegression?: number;
  thresholds?: ReleasePolicyThresholds;
  postPromotionMonitorConfigured?: boolean;
  preexistingBlockingReasons?: string[];
  graderCalibrationRecords?: Array<{
    grader_id: string;
    calibration: {
      promotionEligible: boolean;
      smeSampleCount: number;
      requiredSmeSampleCount: number;
      cohensKappa: number;
      krippendorffsAlpha: number;
    };
  }>;
}) {
  return evaluateReleasePolicy({
    baselineManifest: makeBaselineManifest(),
    candidateManifest: makeCandidateManifest(),
    benchmarkResults: overrides?.benchmarkResults ?? [makeBenchmarkResult()],
    shadowResults: overrides?.shadowResults ?? makePassingShadowResults(),
    verifierMetrics: overrides?.verifierMetrics ?? makeVerifierMetrics(),
    latencyRegression: overrides?.latencyRegression ?? 0.05,
    costRegression: overrides?.costRegression ?? 0.05,
    postPromotionMonitorConfigured: overrides?.postPromotionMonitorConfigured ?? true,
    thresholds: overrides?.thresholds ?? DEFAULT_RELEASE_POLICY_THRESHOLDS,
    preexistingBlockingReasons: overrides?.preexistingBlockingReasons,
    graderCalibrationRecords: overrides?.graderCalibrationRecords ?? [
      {
        grader_id: "grader-v1",
        calibration: {
          promotionEligible: true,
          smeSampleCount: 50,
          requiredSmeSampleCount: 30,
          cohensKappa: 0.8,
          krippendorffsAlpha: 0.8,
        },
      },
    ],
  });
}

describe("release policy engine", () => {
  it("recommends promoted when all thresholds are met", () => {
    const result = evaluateCleanPass();

    expect(result.recommended_decision).toBe("promoted");
    expect(result.blocking_reasons).toHaveLength(0);
    expect(result.aggregated_metrics.benchmark_case_count).toBe(120);
    expect(result.aggregated_metrics.benchmark_task_family_count).toBe(4);
    expect(result.aggregated_metrics.benchmark_mean_delta).toBeGreaterThan(0);
    expect(result.aggregated_metrics.benchmark_low_confidence_bound).toBeGreaterThan(0);
  });

  it("blocks when benchmark case count is below minimum", () => {
    const result = evaluateCleanPass({
      benchmarkResults: [makeBenchmarkResult({ case_count: 50 })],
    });

    expect(result.recommended_decision).toBe("rejected");
    expect(result.blocking_reasons.some((r) => r.includes("held-out cases"))).toBe(true);
    expect(result.aggregated_metrics.benchmark_case_count).toBe(50);
  });

  it("blocks when task family count is below minimum", () => {
    const result = evaluateCleanPass({
      benchmarkResults: [
        makeBenchmarkResult({
          task_family_count: 2,
          case_count: 120,
        }),
      ],
    });

    expect(result.recommended_decision).toBe("rejected");
    expect(result.blocking_reasons.some((r) => r.includes("task families"))).toBe(true);
    expect(result.aggregated_metrics.benchmark_task_family_count).toBe(2);
  });

  it("blocks when mean delta is below threshold", () => {
    const result = evaluateCleanPass({
      benchmarkResults: [
        makeBenchmarkResult({
          mean_delta: -0.05,
          task_family_mean_delta: -0.05,
        }),
      ],
    });

    expect(result.recommended_decision).toBe("rejected");
    expect(result.blocking_reasons.some((r) => r.includes("mean delta"))).toBe(true);
  });

  it("blocks when confidence interval low bound is below threshold", () => {
    const result = evaluateCleanPass({
      benchmarkResults: [
        makeBenchmarkResult({
          mean_delta: 0.1,
          confidence_interval_low: -0.01,
        }),
      ],
    });

    expect(result.recommended_decision).toBe("rejected");
    expect(result.blocking_reasons.some((r) => r.includes("lower confidence bound"))).toBe(true);
  });

  it("blocks when hard fail rate exceeds maximum", () => {
    const result = evaluateCleanPass({
      benchmarkResults: [
        makeBenchmarkResult({
          hard_fail_rate: 0.2,
        }),
      ],
    });

    expect(result.recommended_decision).toBe("rejected");
    expect(result.blocking_reasons.some((r) => r.includes("Hard-fail rate"))).toBe(true);
    expect(result.aggregated_metrics.worst_hard_fail_rate).toBeGreaterThan(
      DEFAULT_RELEASE_POLICY_THRESHOLDS.max_hard_fail_rate,
    );
  });

  it("blocks when latency regression exceeds maximum", () => {
    const result = evaluateCleanPass({
      latencyRegression: 0.25,
    });

    expect(result.recommended_decision).toBe("rejected");
    expect(result.blocking_reasons.some((r) => r.includes("Latency regression"))).toBe(true);
  });

  it("blocks when cost regression exceeds maximum", () => {
    const result = evaluateCleanPass({
      costRegression: 0.25,
    });

    expect(result.recommended_decision).toBe("rejected");
    expect(result.blocking_reasons.some((r) => r.includes("Cost regression"))).toBe(true);
  });

  it("recommends shadow when shadow results are required but not provided", () => {
    const result = evaluateCleanPass({
      shadowResults: [],
      thresholds: {
        ...DEFAULT_RELEASE_POLICY_THRESHOLDS,
        require_shadow_results_for_promotion: true,
      },
    });

    expect(result.recommended_decision).toBe("shadow");
    expect(result.blocking_reasons).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("Shadow results are required"))).toBe(true);
  });

  it("accumulates multiple blocking reasons", () => {
    const result = evaluateCleanPass({
      benchmarkResults: [
        makeBenchmarkResult({
          case_count: 50,
          task_family_count: 2,
          mean_delta: -0.05,
          task_family_mean_delta: -0.05,
        }),
      ],
      latencyRegression: 0.25,
      costRegression: 0.25,
    });

    expect(result.recommended_decision).toBe("rejected");
    // Should have at least: case count, task family count, mean delta, latency, cost
    expect(result.blocking_reasons.length).toBeGreaterThanOrEqual(4);
    expect(result.blocking_reasons.some((r) => r.includes("held-out cases"))).toBe(true);
    expect(result.blocking_reasons.some((r) => r.includes("task families"))).toBe(true);
    expect(result.blocking_reasons.some((r) => r.includes("Latency regression"))).toBe(true);
    expect(result.blocking_reasons.some((r) => r.includes("Cost regression"))).toBe(true);
  });

  it("recommends canary when shadow evidence is only marginal and canary is allowed", () => {
    // Shadow mean_delta >= 0 but low confidence bound < 0 results in marginal
    const result = evaluateCleanPass({
      shadowResults: [
        makeBenchmarkResult({
          benchmark_result_id: "shadow-marginal",
          mean_delta: 0.01,
          confidence_interval_low: -0.02,
          confidence_interval_high: 0.04,
        }),
      ],
      thresholds: {
        ...DEFAULT_RELEASE_POLICY_THRESHOLDS,
        require_shadow_results_for_promotion: true,
        allow_canary_on_marginal_win: true,
      },
    });

    expect(result.recommended_decision).toBe("canary");
    expect(result.blocking_reasons).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("marginal"))).toBe(true);
  });

  it("blocks when false veto rate exceeds threshold", () => {
    const result = evaluateCleanPass({
      verifierMetrics: makeVerifierMetrics({
        false_veto_rate: 0.2,
      }),
    });

    expect(result.recommended_decision).toBe("rejected");
    expect(result.blocking_reasons.some((r) => r.includes("false-veto rate"))).toBe(true);
    expect(result.aggregated_metrics.false_veto_rate).toBe(0.2);
  });

  it("aggregated metrics reflect input values", () => {
    const result = evaluateCleanPass({
      latencyRegression: 0.07,
      costRegression: 0.03,
      verifierMetrics: makeVerifierMetrics({
        false_veto_rate: 0.05,
        override_rate: 0.04,
      }),
    });

    expect(result.aggregated_metrics.latency_regression).toBe(0.07);
    expect(result.aggregated_metrics.cost_regression).toBe(0.03);
    expect(result.aggregated_metrics.false_veto_rate).toBe(0.05);
    expect(result.aggregated_metrics.override_rate).toBe(0.04);
  });

  it("blocks when override rate exceeds threshold", () => {
    const result = evaluateCleanPass({
      verifierMetrics: makeVerifierMetrics({
        override_rate: 0.2,
      }),
    });

    expect(result.recommended_decision).toBe("rejected");
    expect(result.blocking_reasons.some((r) => r.includes("override rate"))).toBe(true);
  });

  it("blocks when post-promotion monitoring is not configured", () => {
    const result = evaluateCleanPass({
      postPromotionMonitorConfigured: false,
    });

    expect(result.recommended_decision).toBe("rejected");
    expect(
      result.blocking_reasons.some((r) => r.includes("Post-promotion monitoring")),
    ).toBe(true);
  });

  it("includes preexisting blocking reasons", () => {
    const result = evaluateCleanPass({
      preexistingBlockingReasons: ["Manual hold: awaiting operator review"],
    });

    expect(result.recommended_decision).toBe("rejected");
    expect(
      result.blocking_reasons.some((r) => r.includes("Manual hold")),
    ).toBe(true);
  });
});
