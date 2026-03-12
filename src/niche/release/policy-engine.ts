import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import {
  CandidateReleaseDecisionSchema,
  getManifestComparisonIssues,
  type BaselineManifest,
  type BenchmarkResultSummary,
  type CandidateReleaseDecision,
  type CandidateManifest,
} from "../schema/index.js";
import type { VerifierMetricSummary } from "../verifier/index.js";

export type ReleasePolicyThresholds = {
  min_mean_delta: number;
  min_confidence_interval_low: number;
  max_false_veto_rate: number;
  max_override_rate: number;
  max_hard_fail_rate: number;
  max_latency_regression: number;
  max_cost_regression: number;
  require_shadow_results_for_promotion: boolean;
  allow_canary_on_marginal_win: boolean;
};

export type ReleasePolicyEvaluation = {
  recommended_decision: CandidateReleaseDecision;
  blocking_reasons: string[];
  warnings: string[];
  comparison_issues: ReturnType<typeof getManifestComparisonIssues>;
  aggregated_metrics: {
    benchmark_mean_delta: number;
    benchmark_low_confidence_bound: number;
    shadow_mean_delta: number | null;
    shadow_low_confidence_bound: number | null;
    worst_hard_fail_rate: number;
    latency_regression: number;
    cost_regression: number;
    false_veto_rate: number;
    override_rate: number;
  };
};

export const DEFAULT_RELEASE_POLICY_THRESHOLDS: ReleasePolicyThresholds = {
  min_mean_delta: 0,
  min_confidence_interval_low: 0,
  max_false_veto_rate: 0.1,
  max_override_rate: 0.1,
  max_hard_fail_rate: 0.15,
  max_latency_regression: 0.15,
  max_cost_regression: 0.15,
  require_shadow_results_for_promotion: true,
  allow_canary_on_marginal_win: true,
};

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function worstHardFailRate(results: BenchmarkResultSummary[]): number {
  return Math.max(
    0,
    ...results.flatMap((result) =>
      result.task_family_summaries.map((summary) => summary.hard_fail_rate),
    ),
  );
}

function assertDecision(decision: CandidateReleaseDecision): CandidateReleaseDecision {
  const validation = validateJsonSchemaValue({
    schema: CandidateReleaseDecisionSchema,
    cacheKey: "release-policy-decision",
    value: decision,
  });
  if (!validation.ok) {
    const details = validation.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid release decision: ${details}`);
  }
  return decision;
}

export function evaluateReleasePolicy(params: {
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  benchmarkResults: BenchmarkResultSummary[];
  shadowResults?: BenchmarkResultSummary[];
  verifierMetrics: VerifierMetricSummary;
  latencyRegression: number;
  costRegression: number;
  postPromotionMonitorConfigured: boolean;
  thresholds?: ReleasePolicyThresholds;
}): ReleasePolicyEvaluation {
  const thresholds = params.thresholds ?? DEFAULT_RELEASE_POLICY_THRESHOLDS;
  const comparisonIssues = getManifestComparisonIssues(
    params.baselineManifest,
    params.candidateManifest,
  );
  const shadowResults = params.shadowResults ?? [];
  const blockingReasons = comparisonIssues.map((issue) => issue.message);
  const warnings: string[] = [];

  if (params.benchmarkResults.length === 0) {
    blockingReasons.push("At least one benchmark result is required for release policy.");
  }

  for (const result of [...params.benchmarkResults, ...shadowResults]) {
    if (result.benchmark_suite_id !== params.candidateManifest.benchmark_suite_id) {
      blockingReasons.push(
        `Benchmark result ${result.benchmark_result_id} targets suite ${result.benchmark_suite_id}, expected ${params.candidateManifest.benchmark_suite_id}.`,
      );
    }
    if (result.invalidated) {
      blockingReasons.push(
        `Benchmark result ${result.benchmark_result_id} is invalidated: ${result.invalidation_reasons.join(", ")}`,
      );
    }
    if (result.contamination_audit_summary.contamination_detected) {
      blockingReasons.push(
        `Benchmark result ${result.benchmark_result_id} is contaminated and cannot gate release.`,
      );
    }
  }

  if (!params.postPromotionMonitorConfigured) {
    blockingReasons.push("Post-promotion monitoring must be configured before promotion.");
  }

  const benchmarkMeanDelta = average(
    params.benchmarkResults.map((result) => result.paired_delta_summary.mean_delta),
  );
  const benchmarkLowConfidenceBound = average(
    params.benchmarkResults.map(
      (result) => result.paired_delta_summary.confidence_interval_low,
    ),
  );
  const shadowMeanDelta =
    shadowResults.length === 0
      ? null
      : average(shadowResults.map((result) => result.paired_delta_summary.mean_delta));
  const shadowLowConfidenceBound =
    shadowResults.length === 0
      ? null
      : average(
          shadowResults.map((result) => result.paired_delta_summary.confidence_interval_low),
        );
  const worstObservedHardFailRate = worstHardFailRate([
    ...params.benchmarkResults,
    ...shadowResults,
  ]);

  if (benchmarkMeanDelta < thresholds.min_mean_delta) {
    blockingReasons.push(
      `Benchmark mean delta ${benchmarkMeanDelta.toFixed(4)} is below the required minimum ${thresholds.min_mean_delta.toFixed(4)}.`,
    );
  }
  if (benchmarkLowConfidenceBound < thresholds.min_confidence_interval_low) {
    blockingReasons.push(
      `Benchmark lower confidence bound ${benchmarkLowConfidenceBound.toFixed(4)} is below the required minimum ${thresholds.min_confidence_interval_low.toFixed(4)}.`,
    );
  }
  if (params.verifierMetrics.false_veto_rate > thresholds.max_false_veto_rate) {
    blockingReasons.push(
      `Verifier false-veto rate ${params.verifierMetrics.false_veto_rate.toFixed(4)} exceeds the threshold ${thresholds.max_false_veto_rate.toFixed(4)}.`,
    );
  }
  if (params.verifierMetrics.override_rate > thresholds.max_override_rate) {
    blockingReasons.push(
      `Operator override rate ${params.verifierMetrics.override_rate.toFixed(4)} exceeds the threshold ${thresholds.max_override_rate.toFixed(4)}.`,
    );
  }
  if (worstObservedHardFailRate > thresholds.max_hard_fail_rate) {
    blockingReasons.push(
      `Hard-fail rate ${worstObservedHardFailRate.toFixed(4)} exceeds the threshold ${thresholds.max_hard_fail_rate.toFixed(4)}.`,
    );
  }
  if (params.latencyRegression > thresholds.max_latency_regression) {
    blockingReasons.push(
      `Latency regression ${params.latencyRegression.toFixed(4)} exceeds the threshold ${thresholds.max_latency_regression.toFixed(4)}.`,
    );
  }
  if (params.costRegression > thresholds.max_cost_regression) {
    blockingReasons.push(
      `Cost regression ${params.costRegression.toFixed(4)} exceeds the threshold ${thresholds.max_cost_regression.toFixed(4)}.`,
    );
  }

  let recommendedDecision: CandidateReleaseDecision;
  if (blockingReasons.length > 0) {
    recommendedDecision = assertDecision("rejected");
  } else if (shadowResults.length === 0 && thresholds.require_shadow_results_for_promotion) {
    warnings.push("Shadow results are required before promotion, so the candidate remains in shadow.");
    recommendedDecision = assertDecision("shadow");
  } else if (
    shadowMeanDelta !== null &&
    shadowLowConfidenceBound !== null &&
    shadowMeanDelta > 0 &&
    shadowLowConfidenceBound >= 0
  ) {
    recommendedDecision = assertDecision("promoted");
  } else if (
    thresholds.allow_canary_on_marginal_win &&
    shadowMeanDelta !== null &&
    shadowMeanDelta >= 0
  ) {
    warnings.push("Shadow evidence is only marginal, so the candidate should enter canary.");
    recommendedDecision = assertDecision("canary");
  } else if (thresholds.require_shadow_results_for_promotion) {
    warnings.push("Candidate won offline benchmarks but still needs stronger shadow evidence.");
    recommendedDecision = assertDecision("shadow");
  } else {
    recommendedDecision = assertDecision("canary");
  }

  return {
    recommended_decision: recommendedDecision,
    blocking_reasons: blockingReasons,
    warnings,
    comparison_issues: comparisonIssues,
    aggregated_metrics: {
      benchmark_mean_delta: benchmarkMeanDelta,
      benchmark_low_confidence_bound: benchmarkLowConfidenceBound,
      shadow_mean_delta: shadowMeanDelta,
      shadow_low_confidence_bound: shadowLowConfidenceBound,
      worst_hard_fail_rate: worstObservedHardFailRate,
      latency_regression: params.latencyRegression,
      cost_regression: params.costRegression,
      false_veto_rate: params.verifierMetrics.false_veto_rate,
      override_rate: params.verifierMetrics.override_rate,
    },
  };
}
