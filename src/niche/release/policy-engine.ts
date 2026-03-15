import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { CalibrationMetrics } from "../benchmark/calibration.js";
import { resolveBenchmarkRecordTemplateManifestIds } from "../benchmark/record-bindings.js";
import {
  type BenchmarkCaseKind,
  BenchmarkResultRecordSchema,
  type BenchmarkResultRecord,
  type BenchmarkResultSummary,
  CandidateReleaseDecisionSchema,
  getManifestComparisonIssues,
  type BaselineManifest,
  type CandidateReleaseDecision,
  type CandidateManifest,
  type ManifestProviderMetadataQuality,
} from "../schema/index.js";
import type { VerifierMetricSummary } from "../verifier/index.js";

export type ReleasePolicyThresholds = {
  min_benchmark_case_count: number;
  min_task_family_count: number;
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
    benchmark_case_count: number;
    benchmark_task_family_count: number;
    benchmark_mean_delta: number;
    benchmark_low_confidence_bound: number;
    shadow_mean_delta: number | null;
    shadow_low_confidence_bound: number | null;
    worst_hard_fail_rate: number;
    regressed_task_families: string[];
    latency_regression: number;
    cost_regression: number;
    false_veto_rate: number;
    override_rate: number;
  };
};

export const DEFAULT_RELEASE_POLICY_THRESHOLDS: ReleasePolicyThresholds = {
  min_benchmark_case_count: 100,
  min_task_family_count: 3,
  min_mean_delta: 0,
  min_confidence_interval_low: 0.001,
  max_false_veto_rate: 0.1,
  max_override_rate: 0.1,
  max_hard_fail_rate: 0.15,
  max_latency_regression: 0.15,
  max_cost_regression: 0.15,
  require_shadow_results_for_promotion: true,
  allow_canary_on_marginal_win: true,
};

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stableSerializeComparableValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeComparableValue(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableSerializeComparableValue(nestedValue)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildEvidenceGroupKey(result: BenchmarkResultSummary): string {
  return [
    result.benchmark_suite_id,
    result.case_kind,
    result.mode,
    result.baseline_arm_id,
    result.candidate_arm_id,
  ].join("|");
}

function assertBenchmarkResultRecord(
  value: BenchmarkResultRecord,
  label: string,
): BenchmarkResultRecord {
  const validation = validateJsonSchemaValue({
    schema: BenchmarkResultRecordSchema,
    cacheKey: "release-policy-benchmark-record",
    value,
  });
  if (!validation.ok) {
    const details = validation.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid ${label}: ${details}`);
  }
  return value;
}

function buildEvidenceFingerprint(result: BenchmarkResultRecord): string {
  return stableSerializeComparableValue({
    benchmark_result_record_id: result.benchmark_result_record_id,
    summary: result.summary,
    baseline_manifest_id: result.baseline_manifest_id,
    candidate_manifest_id: result.candidate_manifest_id,
    suite_hash: result.suite_hash,
    fixture_version: result.fixture_version,
    actual_suite_hash: result.actual_suite_hash,
    actual_fixture_version: result.actual_fixture_version,
    actual_grader_version: result.actual_grader_version,
    case_membership_hash: result.case_membership_hash,
    run_trace_refs: result.run_trace_refs,
    replay_bundle_refs: result.replay_bundle_refs,
    evidence_bundle_ids: result.evidence_bundle_ids,
    arbitration_outcome_summary: result.arbitration_outcome_summary,
  });
}

function isReducedReproducibilityQuality(
  quality: ManifestProviderMetadataQuality | undefined,
): boolean {
  if (!quality) {
    return false;
  }
  return quality === "proxy_resolved" || quality === "opaque_provider";
}

type EvidenceSetAnalysis = {
  caseCount: number;
  distinctResults: BenchmarkResultRecord[];
  blockingReasons: string[];
};

function analyzeEvidenceSet(results: BenchmarkResultRecord[], label: string): EvidenceSetAnalysis {
  const duplicateResultIds = new Set<string>();
  const seenResultIds = new Set<string>();
  const groups = new Map<string, Map<string, BenchmarkResultRecord>>();

  for (const result of results) {
    if (seenResultIds.has(result.summary.benchmark_result_id)) {
      duplicateResultIds.add(result.summary.benchmark_result_id);
      continue;
    }
    seenResultIds.add(result.summary.benchmark_result_id);

    const groupKey = buildEvidenceGroupKey(result.summary);
    const fingerprints = groups.get(groupKey) ?? new Map<string, BenchmarkResultRecord>();
    fingerprints.set(buildEvidenceFingerprint(result), result);
    groups.set(groupKey, fingerprints);
  }

  const blockingReasons: string[] = [];
  if (duplicateResultIds.size > 0) {
    blockingReasons.push(
      `${label} evidence repeats benchmark_result_id values: ${[...duplicateResultIds].toSorted((left, right) => left.localeCompare(right)).join(", ")}.`,
    );
  }

  const distinctResults: BenchmarkResultRecord[] = [];
  let caseCount = 0;
  for (const [groupKey, fingerprints] of groups.entries()) {
    const representatives = [...fingerprints.values()];
    caseCount += Math.max(...representatives.map((result) => result.summary.case_count));
    distinctResults.push(
      representatives.toSorted(
        (left, right) =>
          right.summary.case_count - left.summary.case_count ||
          left.summary.benchmark_result_id.localeCompare(right.summary.benchmark_result_id),
      )[0],
    );

    if (representatives.length > 1) {
      blockingReasons.push(
        `${label} evidence contains multiple non-identical summaries for ${groupKey}, so unique held-out case coverage cannot be proven.`,
      );
    }
  }

  return {
    caseCount,
    distinctResults,
    blockingReasons,
  };
}

function worstHardFailRate(results: BenchmarkResultRecord[]): number {
  return Math.max(
    0,
    ...results.flatMap((result) =>
      result.summary.task_family_summaries.map((summary) => summary.hard_fail_rate),
    ),
  );
}

function summarizeTaskFamilies(results: BenchmarkResultSummary[]): {
  taskFamilyCount: number;
  regressedTaskFamilies: string[];
} {
  const byFamily = new Map<
    string,
    {
      caseCount: number;
      weightedDeltaSum: number;
    }
  >();

  for (const result of results) {
    for (const summary of result.task_family_summaries) {
      const existing = byFamily.get(summary.task_family) ?? {
        caseCount: 0,
        weightedDeltaSum: 0,
      };
      existing.caseCount += summary.case_count;
      existing.weightedDeltaSum += summary.mean_delta * summary.case_count;
      byFamily.set(summary.task_family, existing);
    }
  }

  const regressedTaskFamilies = [...byFamily.entries()]
    .filter(
      ([, summary]) => summary.caseCount > 0 && summary.weightedDeltaSum / summary.caseCount < 0,
    )
    .map(([taskFamily]) => taskFamily)
    .toSorted((left, right) => left.localeCompare(right));

  return {
    taskFamilyCount: byFamily.size,
    regressedTaskFamilies,
  };
}

function summarizeTaskFamiliesFromRecords(results: BenchmarkResultRecord[]): {
  taskFamilyCount: number;
  regressedTaskFamilies: string[];
} {
  return summarizeTaskFamilies(results.map((record) => record.summary));
}

function hasDurableEvidenceBindings(record: BenchmarkResultRecord): boolean {
  return (
    record.run_trace_refs.length > 0 &&
    record.replay_bundle_refs.length > 0 &&
    record.evidence_bundle_ids.length > 0
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
  benchmarkResults: BenchmarkResultRecord[];
  shadowResults?: BenchmarkResultRecord[];
  verifierMetrics: VerifierMetricSummary;
  latencyRegression: number;
  costRegression: number;
  postPromotionMonitorConfigured: boolean;
  preexistingBlockingReasons?: string[];
  requiredCaseKinds?: BenchmarkCaseKind[];
  thresholds?: ReleasePolicyThresholds;
  graderCalibrationRecords?: Array<{
    grader_id: string;
    calibration: CalibrationMetrics;
  }>;
}): ReleasePolicyEvaluation {
  const thresholds = params.thresholds ?? DEFAULT_RELEASE_POLICY_THRESHOLDS;
  const comparisonIssues = getManifestComparisonIssues(
    params.baselineManifest,
    params.candidateManifest,
  );
  const shadowResults = params.shadowResults ?? [];
  const blockingReasons = [
    ...(params.preexistingBlockingReasons ?? []),
    ...comparisonIssues.map((issue) => issue.message),
  ];
  const warnings: string[] = [];
  const benchmarkEvidence = analyzeEvidenceSet(
    params.benchmarkResults.map((result, index) =>
      assertBenchmarkResultRecord(result, `benchmark result record ${index + 1}`),
    ),
    "Benchmark",
  );
  const shadowEvidence = analyzeEvidenceSet(
    shadowResults.map((result, index) =>
      assertBenchmarkResultRecord(result, `shadow result record ${index + 1}`),
    ),
    "Shadow",
  );
  blockingReasons.push(...benchmarkEvidence.blockingReasons, ...shadowEvidence.blockingReasons);

  const requiredCaseKinds = params.requiredCaseKinds ?? ["atomic_case"];

  if (benchmarkEvidence.distinctResults.length === 0) {
    blockingReasons.push("At least one benchmark result is required for release policy.");
  }

  for (const result of [...benchmarkEvidence.distinctResults, ...shadowEvidence.distinctResults]) {
    if (result.summary.benchmark_suite_id !== params.candidateManifest.benchmark_suite_id) {
      blockingReasons.push(
        `Benchmark result ${result.summary.benchmark_result_id} targets suite ${result.summary.benchmark_suite_id}, expected ${params.candidateManifest.benchmark_suite_id}.`,
      );
    }
    const templateManifestIds = resolveBenchmarkRecordTemplateManifestIds(result);
    if (
      templateManifestIds.baselineTemplateManifestId !==
      params.baselineManifest.baseline_manifest_id
    ) {
      blockingReasons.push(
        `Benchmark result ${result.summary.benchmark_result_id} is bound to baseline template manifest ${templateManifestIds.baselineTemplateManifestId}, expected ${params.baselineManifest.baseline_manifest_id}.`,
      );
    }
    if (
      templateManifestIds.candidateTemplateManifestId !==
      params.candidateManifest.candidate_manifest_id
    ) {
      blockingReasons.push(
        `Benchmark result ${result.summary.benchmark_result_id} is bound to candidate template manifest ${templateManifestIds.candidateTemplateManifestId}, expected ${params.candidateManifest.candidate_manifest_id}.`,
      );
    }
    if (!hasDurableEvidenceBindings(result)) {
      blockingReasons.push(
        `Benchmark result ${result.summary.benchmark_result_id} lacks durable run/replay/evidence refs required for promotion.`,
      );
    }
    if (result.summary.invalidated) {
      blockingReasons.push(
        `Benchmark result ${result.summary.benchmark_result_id} is invalidated: ${result.summary.invalidation_reasons.join(", ")}`,
      );
    }
    if (result.summary.contamination_audit_summary.contamination_detected) {
      blockingReasons.push(
        `Benchmark result ${result.summary.benchmark_result_id} is contaminated and cannot gate release.`,
      );
    }
    if (result.arbitration_outcome_summary?.unresolved_blocking_conflicts) {
      blockingReasons.push(
        `Benchmark result ${result.summary.benchmark_result_id} still has unresolved blocking arbitration conflicts.`,
      );
    }
  }

  const reducedReproducibilityResults = [
    ...benchmarkEvidence.distinctResults,
    ...shadowEvidence.distinctResults,
  ]
    .filter(
      (result) =>
        isReducedReproducibilityQuality(result.summary.baseline_provider_metadata_quality) ||
        isReducedReproducibilityQuality(result.summary.candidate_provider_metadata_quality),
    )
    .map((result) => result.summary.benchmark_result_id)
    .toSorted((left, right) => left.localeCompare(right));
  if (reducedReproducibilityResults.length > 0) {
    warnings.push(
      `Reduced reproducibility provider metadata for benchmark results: ${reducedReproducibilityResults.join(", ")}.`,
    );
  }

  if (!params.postPromotionMonitorConfigured) {
    blockingReasons.push("Post-promotion monitoring must be configured before promotion.");
  }

  const benchmarkCaseCount = benchmarkEvidence.caseCount;
  const { taskFamilyCount: benchmarkTaskFamilyCount, regressedTaskFamilies } =
    summarizeTaskFamiliesFromRecords(benchmarkEvidence.distinctResults);
  const benchmarkMeanDelta = average(
    benchmarkEvidence.distinctResults.map(
      (result) => result.summary.paired_delta_summary.mean_delta,
    ),
  );
  const benchmarkLowConfidenceBound = average(
    benchmarkEvidence.distinctResults.map(
      (result) => result.summary.paired_delta_summary.confidence_interval_low,
    ),
  );
  const shadowMeanDelta =
    shadowEvidence.distinctResults.length === 0
      ? null
      : average(
          shadowEvidence.distinctResults.map(
            (result) => result.summary.paired_delta_summary.mean_delta,
          ),
        );
  const shadowLowConfidenceBound =
    shadowEvidence.distinctResults.length === 0
      ? null
      : average(
          shadowEvidence.distinctResults.map(
            (result) => result.summary.paired_delta_summary.confidence_interval_low,
          ),
        );
  const worstObservedHardFailRate = worstHardFailRate([
    ...benchmarkEvidence.distinctResults,
    ...shadowEvidence.distinctResults,
  ]);

  if (benchmarkCaseCount < thresholds.min_benchmark_case_count) {
    blockingReasons.push(
      `Benchmark evidence contains ${benchmarkCaseCount} held-out cases, below the required minimum ${thresholds.min_benchmark_case_count}.`,
    );
  }
  if (benchmarkTaskFamilyCount < thresholds.min_task_family_count) {
    blockingReasons.push(
      `Benchmark evidence covers ${benchmarkTaskFamilyCount} task families, below the required minimum ${thresholds.min_task_family_count}.`,
    );
  }
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
  if (regressedTaskFamilies.length > 0) {
    blockingReasons.push(
      `Task-family regressions detected for: ${regressedTaskFamilies.join(", ")}.`,
    );
  }

  // Grader calibration gate (F-03): uncalibrated graders must not drive promotion
  if (params.graderCalibrationRecords) {
    for (const gc of params.graderCalibrationRecords) {
      if (!gc.calibration.promotionEligible) {
        blockingReasons.push(
          `Grader "${gc.grader_id}" is not promotion-eligible: SME sample count ${gc.calibration.smeSampleCount} below required ${gc.calibration.requiredSmeSampleCount}.`,
        );
      }
    }
  } else {
    warnings.push("No grader calibration records provided; calibration gate not enforced.");
  }

  // Single-cluster dominance rejection (F-05): reject if one family drives the win
  const familySummaries = summarizeTaskFamiliesFromRecords(benchmarkEvidence.distinctResults);
  const positiveFamilyDeltas = benchmarkEvidence.distinctResults
    .flatMap((r) => r.summary.task_family_summaries)
    .reduce((acc, s) => {
      const existing = acc.get(s.task_family) ?? { weighted: 0, count: 0 };
      existing.weighted += s.mean_delta * s.case_count;
      existing.count += s.case_count;
      acc.set(s.task_family, existing);
      return acc;
    }, new Map<string, { weighted: number; count: number }>());
  const positiveFamilies = [...positiveFamilyDeltas.entries()]
    .filter(([, v]) => v.count > 0 && v.weighted / v.count > 0)
    .map(([family, v]) => ({ family, delta: v.weighted / v.count }));
  const totalPositiveDelta = positiveFamilies.reduce((sum, f) => sum + f.delta, 0);
  if (totalPositiveDelta > 0 && positiveFamilies.length > 1) {
    for (const family of positiveFamilies) {
      const dominance = family.delta / totalPositiveDelta;
      if (dominance > 0.7) {
        blockingReasons.push(
          `Task family "${family.family}" contributes ${(dominance * 100).toFixed(0)}% of aggregate positive delta — promotion gain depends on a single cluster.`,
        );
      }
    }
  }

  for (const requiredCaseKind of requiredCaseKinds) {
    const recordsForKind = benchmarkEvidence.distinctResults.filter(
      (result) => result.summary.case_kind === requiredCaseKind,
    );
    if (recordsForKind.length === 0) {
      blockingReasons.push(
        `Required benchmark case kind ${requiredCaseKind} is missing from release evidence.`,
      );
      continue;
    }
    const meanDelta = average(
      recordsForKind.map((result) => result.summary.paired_delta_summary.mean_delta),
    );
    const lowConfidenceBound = average(
      recordsForKind.map((result) => result.summary.paired_delta_summary.confidence_interval_low),
    );
    if (
      meanDelta < thresholds.min_mean_delta ||
      lowConfidenceBound < thresholds.min_confidence_interval_low
    ) {
      blockingReasons.push(
        `Required benchmark case kind ${requiredCaseKind} is not winning strongly enough for promotion.`,
      );
    }
  }

  let recommendedDecision: CandidateReleaseDecision;
  if (blockingReasons.length > 0) {
    recommendedDecision = assertDecision("rejected");
  } else if (
    shadowEvidence.distinctResults.length === 0 &&
    thresholds.require_shadow_results_for_promotion
  ) {
    warnings.push(
      "Shadow results are required before promotion, so the candidate remains in shadow.",
    );
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
      benchmark_case_count: benchmarkCaseCount,
      benchmark_task_family_count: benchmarkTaskFamilyCount,
      benchmark_mean_delta: benchmarkMeanDelta,
      benchmark_low_confidence_bound: benchmarkLowConfidenceBound,
      shadow_mean_delta: shadowMeanDelta,
      shadow_low_confidence_bound: shadowLowConfidenceBound,
      worst_hard_fail_rate: worstObservedHardFailRate,
      regressed_task_families: regressedTaskFamilies,
      latency_regression: params.latencyRegression,
      cost_regression: params.costRegression,
      false_veto_rate: params.verifierMetrics.false_veto_rate,
      override_rate: params.verifierMetrics.override_rate,
    },
  };
}
