import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";
import { readRequiredJsonFileStrict } from "../../niche/json.js";
import {
  BaselineManifestSchema,
  BenchmarkResultSummarySchema,
  CandidateManifestSchema,
  PromotedReleaseMonitorSchema,
  getManifestComparisonIssues,
  type BaselineManifest,
  type BenchmarkResultSummary,
  type CandidateManifest,
} from "../../niche/schema/index.js";
import {
  AtomicBenchmarkSuiteRecordSchema,
  EpisodeBenchmarkSuiteRecordSchema,
} from "../../niche/benchmark/index.js";
import { evaluateReleasePolicy, type PromotedMonitorDefinition } from "../../niche/release/index.js";
import type { ReleasePolicyEvaluation } from "../../niche/release/policy-engine.js";
import type { VerifierMetricSummary } from "../../niche/verifier/index.js";

export type NicheCompareOptions = {
  baselineManifestPath: string;
  candidateManifestPath: string;
  suitePath?: string;
  benchmarkResultPaths?: string[];
  shadowResultPaths?: string[];
  verifierMetricsPath?: string;
  monitorDefinitionPath?: string;
  latencyRegression?: number;
  costRegression?: number;
  json?: boolean;
};

export type NicheCompareResult = {
  baseline_manifest_id: string;
  candidate_manifest_id: string;
  comparison_issues: ReturnType<typeof getManifestComparisonIssues>;
  manifests_comparable: boolean;
  provider_metadata_quality: {
    baseline: string;
    candidate: string;
  };
  suite?: {
    benchmark_suite_id: string;
    case_kind: "atomic_case" | "episode_case";
    mode: string;
    suite_hash: string;
    fixture_version: string;
  };
  benchmark_summary?: {
    benchmark_result_ids: string[];
    shadow_result_ids: string[];
    invalidated_count: number;
    contaminated_result_ids: string[];
    mean_delta: number;
    low_confidence_bound: number;
  };
  release_policy?: ReleasePolicyEvaluation;
  promoted_monitor?: PromotedMonitorDefinition;
};

function validateValue<T>(
  schema: Record<string, unknown>,
  cacheKey: string,
  value: T,
  label: string,
): T {
  const validation = validateJsonSchemaValue({
    schema,
    cacheKey,
    value,
  });
  if (validation.ok) {
    return value;
  }
  const details = validation.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid ${label}: ${details}`);
}

function assertVerifierMetricSummary(value: unknown, label: string): VerifierMetricSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  const candidate = value as Partial<VerifierMetricSummary>;
  if (
    typeof candidate.sample_count !== "number" ||
    typeof candidate.false_veto_rate !== "number" ||
    typeof candidate.override_rate !== "number" ||
    typeof candidate.false_positive_rate !== "number" ||
    typeof candidate.pass_through_rate !== "number" ||
    typeof candidate.true_positive_rate !== "number" ||
    typeof candidate.mean_latency_added_ms !== "number" ||
    typeof candidate.mean_cost_added !== "number" ||
    typeof candidate.total_cost_added !== "number" ||
    !candidate.counts
  ) {
    throw new Error(`Invalid ${label}: missing required verifier metric fields.`);
  }
  return {
    sample_count: candidate.sample_count,
    true_positive_rate: candidate.true_positive_rate,
    false_positive_rate: candidate.false_positive_rate,
    false_veto_rate: candidate.false_veto_rate,
    pass_through_rate: candidate.pass_through_rate,
    override_rate: candidate.override_rate,
    mean_latency_added_ms: candidate.mean_latency_added_ms,
    mean_cost_added: candidate.mean_cost_added,
    total_cost_added: candidate.total_cost_added,
    counts: candidate.counts,
  };
}

function assertPromotedMonitorDefinition(
  value: unknown,
  label: string,
): PromotedMonitorDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  const candidate = value as Partial<PromotedMonitorDefinition>;
  if (!candidate.monitor || !candidate.cadence_defaults) {
    throw new Error(`Invalid ${label}: missing monitor or cadence_defaults.`);
  }
  const monitor = validateValue(
    PromotedReleaseMonitorSchema,
    "niche-cli-compare-monitor",
    candidate.monitor,
    `${label} monitor`,
  );
  const cadence = candidate.cadence_defaults;
  if (
    typeof cadence.shadow_recheck_interval_hours !== "number" ||
    typeof cadence.evaluation_window_size !== "number" ||
    typeof cadence.alert_hysteresis_windows !== "number" ||
    typeof cadence.rollback_cooldown_hours !== "number"
  ) {
    throw new Error(`Invalid ${label}: cadence defaults must be numeric.`);
  }
  return {
    monitor,
    cadence_defaults: {
      shadow_recheck_interval_hours: cadence.shadow_recheck_interval_hours,
      evaluation_window_size: cadence.evaluation_window_size,
      alert_hysteresis_windows: cadence.alert_hysteresis_windows,
      rollback_cooldown_hours: cadence.rollback_cooldown_hours,
    },
  };
}

function loadBenchmarkSummaries(pathnames: string[] | undefined): BenchmarkResultSummary[] {
  const resolved = pathnames ?? [];
  return resolved.map((pathname) =>
    validateValue(
      BenchmarkResultSummarySchema,
      `niche-cli-compare-benchmark-${pathname}`,
      readRequiredJsonFileStrict(pathname) as BenchmarkResultSummary,
      `benchmark result ${pathname}`,
    ),
  );
}

function loadSuiteMetadata(pathname: string): NicheCompareResult["suite"] {
  const raw = readRequiredJsonFileStrict(pathname) as {
    metadata?: { case_kind?: string };
  };
  if (raw.metadata?.case_kind === "episode_case") {
    const record = validateValue(
      EpisodeBenchmarkSuiteRecordSchema,
      "niche-cli-compare-episode-suite",
      raw,
      `episode suite ${pathname}`,
    );
    return {
      benchmark_suite_id: record.metadata.benchmark_suite_id,
      case_kind: record.metadata.case_kind,
      mode: record.metadata.mode,
      suite_hash: record.metadata.suite_hash,
      fixture_version: record.metadata.fixture_version,
    };
  }
  const record = validateValue(
    AtomicBenchmarkSuiteRecordSchema,
    "niche-cli-compare-atomic-suite",
    raw,
    `atomic suite ${pathname}`,
  );
  return {
    benchmark_suite_id: record.metadata.benchmark_suite_id,
    case_kind: record.metadata.case_kind,
    mode: record.metadata.mode,
    suite_hash: record.metadata.suite_hash,
    fixture_version: record.metadata.fixture_version,
  };
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatCompareSummary(result: NicheCompareResult): string {
  const lines = [
    `Baseline manifest: ${result.baseline_manifest_id}`,
    `Candidate manifest: ${result.candidate_manifest_id}`,
    `Comparable: ${result.manifests_comparable ? "yes" : "no"}`,
    `Provider metadata quality: baseline=${result.provider_metadata_quality.baseline}, candidate=${result.provider_metadata_quality.candidate}`,
  ];
  if (result.comparison_issues.length > 0) {
    lines.push(`Comparison issues: ${result.comparison_issues.map((issue) => issue.message).join("; ")}`);
  }
  if (result.suite) {
    lines.push(`Suite: ${result.suite.benchmark_suite_id}`);
    lines.push(`Suite hash: ${result.suite.suite_hash}`);
    lines.push(`Fixture version: ${result.suite.fixture_version}`);
  }
  if (result.benchmark_summary) {
    lines.push(`Benchmark mean delta: ${result.benchmark_summary.mean_delta.toFixed(4)}`);
    lines.push(`Benchmark low confidence bound: ${result.benchmark_summary.low_confidence_bound.toFixed(4)}`);
  }
  if (result.release_policy) {
    lines.push(`Release decision: ${result.release_policy.recommended_decision}`);
    if (result.release_policy.warnings.length > 0) {
      lines.push(`Release warnings: ${result.release_policy.warnings.join("; ")}`);
    }
  }
  if (result.promoted_monitor) {
    lines.push(
      `Monitor cadence: shadow_recheck=${result.promoted_monitor.cadence_defaults.shadow_recheck_interval_hours}h, window=${result.promoted_monitor.cadence_defaults.evaluation_window_size}, hysteresis=${result.promoted_monitor.cadence_defaults.alert_hysteresis_windows}, rollback_cooldown=${result.promoted_monitor.cadence_defaults.rollback_cooldown_hours}h`,
    );
  }
  return lines.join("\n");
}

export async function nicheCompareCommand(
  opts: NicheCompareOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NicheCompareResult> {
  const baselineManifest = validateValue(
    BaselineManifestSchema,
    "niche-cli-compare-baseline-manifest",
    readRequiredJsonFileStrict(opts.baselineManifestPath) as BaselineManifest,
    "baseline manifest",
  );
  const candidateManifest = validateValue(
    CandidateManifestSchema,
    "niche-cli-compare-candidate-manifest",
    readRequiredJsonFileStrict(opts.candidateManifestPath) as CandidateManifest,
    "candidate manifest",
  );
  const benchmarkResults = loadBenchmarkSummaries(opts.benchmarkResultPaths);
  const shadowResults = loadBenchmarkSummaries(opts.shadowResultPaths);
  const comparisonIssues = getManifestComparisonIssues(baselineManifest, candidateManifest);
  const suite = opts.suitePath ? loadSuiteMetadata(opts.suitePath) : undefined;
  const promotedMonitor = opts.monitorDefinitionPath
    ? assertPromotedMonitorDefinition(
        readRequiredJsonFileStrict(opts.monitorDefinitionPath),
        "promoted monitor definition",
      )
    : undefined;

  let releasePolicy: ReleasePolicyEvaluation | undefined;
  if (
    benchmarkResults.length > 0 &&
    opts.verifierMetricsPath &&
    promotedMonitor
  ) {
    releasePolicy = evaluateReleasePolicy({
      baselineManifest,
      candidateManifest,
        benchmarkResults,
        shadowResults,
        verifierMetrics: assertVerifierMetricSummary(
          readRequiredJsonFileStrict(opts.verifierMetricsPath),
          "verifier metrics",
        ),
      latencyRegression: opts.latencyRegression ?? 0,
      costRegression: opts.costRegression ?? 0,
      postPromotionMonitorConfigured: true,
    });
  }

  const result: NicheCompareResult = {
    baseline_manifest_id: baselineManifest.baseline_manifest_id,
    candidate_manifest_id: candidateManifest.candidate_manifest_id,
    comparison_issues: comparisonIssues,
    manifests_comparable: comparisonIssues.length === 0,
    provider_metadata_quality: {
      baseline: baselineManifest.provider_metadata_quality,
      candidate: candidateManifest.provider_metadata_quality,
    },
    suite,
    benchmark_summary:
      benchmarkResults.length === 0
        ? undefined
        : {
            benchmark_result_ids: benchmarkResults.map((result) => result.benchmark_result_id),
            shadow_result_ids: shadowResults.map((result) => result.benchmark_result_id),
            invalidated_count: [...benchmarkResults, ...shadowResults].filter(
              (result) => result.invalidated,
            ).length,
            contaminated_result_ids: [...benchmarkResults, ...shadowResults]
              .filter((result) => result.contamination_audit_summary.contamination_detected)
              .map((result) => result.benchmark_result_id),
            mean_delta: average(
              benchmarkResults.map((result) => result.paired_delta_summary.mean_delta),
            ),
            low_confidence_bound: average(
              benchmarkResults.map(
                (result) => result.paired_delta_summary.confidence_interval_low,
              ),
            ),
          },
    release_policy: releasePolicy,
    promoted_monitor: promotedMonitor,
  };

  runtime.log(opts.json ? JSON.stringify(result, null, 2) : formatCompareSummary(result));
  return result;
}
