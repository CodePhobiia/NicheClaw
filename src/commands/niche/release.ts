import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";
import { readRequiredJsonFileStrict } from "../../niche/json.js";
import {
  ArtifactRefSchema,
  BaselineManifestSchema,
  BenchmarkResultSummarySchema,
  CandidateManifestSchema,
  PromotedReleaseMonitorSchema,
  type ArtifactRef,
  type BaselineManifest,
  type BenchmarkResultSummary,
  type CandidateManifest,
} from "../../niche/schema/index.js";
import {
  assessPromotedReleaseMonitor,
  createPromotionControllerResult,
  evaluateReleasePolicy,
  type PromotedMonitorAssessment,
  type PromotedMonitorDefinition,
  type PromotedMonitorObservation,
  type ReleasePolicyEvaluation,
} from "../../niche/release/index.js";
import type { PromotionControllerResult } from "../../niche/release/promotion-controller.js";
import type { VerifierMetricSummary } from "../../niche/verifier/index.js";

export type NicheReleaseOptions = {
  baselineManifestPath: string;
  candidateManifestPath: string;
  benchmarkResultPaths: string[];
  shadowResultPaths?: string[];
  verifierMetricsPath: string;
  monitorDefinitionPath: string;
  componentArtifactRefPaths: string[];
  candidateReleaseId?: string;
  baselineReleaseId?: string;
  rollbackTarget?: string;
  approvedBy?: string[];
  latencyRegression?: number;
  costRegression?: number;
  monitorObservationPath?: string;
  json?: boolean;
};

export type NicheReleaseResult = {
  policy_evaluation: ReleasePolicyEvaluation;
  promotion_controller: PromotionControllerResult;
  promoted_monitor: PromotedMonitorDefinition;
  monitor_assessment?: PromotedMonitorAssessment;
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
    "niche-cli-release-monitor",
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

function assertPromotedMonitorObservation(
  value: unknown,
  label: string,
): PromotedMonitorObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  const candidate = value as Partial<PromotedMonitorObservation>;
  if (
    !candidate.observed_drift ||
    typeof candidate.consecutive_breach_windows !== "number"
  ) {
    throw new Error(`Invalid ${label}: missing observed_drift or consecutive_breach_windows.`);
  }
  return {
    observed_drift: candidate.observed_drift,
    consecutive_breach_windows: candidate.consecutive_breach_windows,
    hours_since_last_rollback: candidate.hours_since_last_rollback,
  };
}

function loadBenchmarkSummaries(
  pathnames: string[],
  label: string,
  options: { allowEmpty?: boolean } = {},
): BenchmarkResultSummary[] {
  if (pathnames.length === 0) {
    if (options.allowEmpty) {
      return [];
    }
    throw new Error(`At least one ${label} is required.`);
  }
  return pathnames.map((pathname) =>
    validateValue(
      BenchmarkResultSummarySchema,
      `niche-cli-release-benchmark-${label}-${pathname}`,
      readRequiredJsonFileStrict(pathname) as BenchmarkResultSummary,
      `${label} ${pathname}`,
    ),
  );
}

function loadArtifactRefs(pathnames: string[]): ArtifactRef[] {
  if (pathnames.length === 0) {
    throw new Error("At least one --component-artifact-ref is required.");
  }
  return pathnames.map((pathname) =>
    validateValue(
      ArtifactRefSchema,
      `niche-cli-release-component-ref-${pathname}`,
      readRequiredJsonFileStrict(pathname) as ArtifactRef,
      `component artifact ref ${pathname}`,
    ),
  );
}

function formatReleaseSummary(result: NicheReleaseResult): string {
  const lines = [
    `Release decision: ${result.promotion_controller.decision}`,
    `Reason: ${result.promotion_controller.reason}`,
    `Benchmark mean delta: ${result.policy_evaluation.aggregated_metrics.benchmark_mean_delta.toFixed(4)}`,
    `Benchmark low confidence bound: ${result.policy_evaluation.aggregated_metrics.benchmark_low_confidence_bound.toFixed(4)}`,
    `False-veto rate: ${result.policy_evaluation.aggregated_metrics.false_veto_rate.toFixed(4)}`,
    `Override rate: ${result.policy_evaluation.aggregated_metrics.override_rate.toFixed(4)}`,
    `Shadow recheck interval (hours): ${result.promoted_monitor.cadence_defaults.shadow_recheck_interval_hours}`,
  ];
  if (result.policy_evaluation.warnings.length > 0) {
    lines.push(`Warnings: ${result.policy_evaluation.warnings.join("; ")}`);
  }
  if (result.monitor_assessment) {
    lines.push(
      `Rollback now: ${result.monitor_assessment.should_rollback ? "yes" : "no"}`,
    );
  }
  return lines.join("\n");
}

export async function nicheReleaseCommand(
  opts: NicheReleaseOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NicheReleaseResult> {
  const baselineManifest = validateValue(
    BaselineManifestSchema,
    "niche-cli-release-baseline-manifest",
    readRequiredJsonFileStrict(opts.baselineManifestPath) as BaselineManifest,
    "baseline manifest",
  );
  const candidateManifest = validateValue(
    CandidateManifestSchema,
    "niche-cli-release-candidate-manifest",
    readRequiredJsonFileStrict(opts.candidateManifestPath) as CandidateManifest,
    "candidate manifest",
  );
  const benchmarkResults = loadBenchmarkSummaries(opts.benchmarkResultPaths, "benchmark result");
  const shadowResults = loadBenchmarkSummaries(opts.shadowResultPaths ?? [], "shadow result", {
    allowEmpty: true,
  });
  const verifierMetrics = assertVerifierMetricSummary(
    readRequiredJsonFileStrict(opts.verifierMetricsPath),
    "verifier metrics",
  );
  const promotedMonitor = assertPromotedMonitorDefinition(
    readRequiredJsonFileStrict(opts.monitorDefinitionPath),
    "promoted monitor definition",
  );
  const componentArtifactRefs = loadArtifactRefs(opts.componentArtifactRefPaths);

  const policyEvaluation = evaluateReleasePolicy({
    baselineManifest,
    candidateManifest,
    benchmarkResults,
    shadowResults,
    verifierMetrics,
    latencyRegression: opts.latencyRegression ?? 0,
    costRegression: opts.costRegression ?? 0,
    postPromotionMonitorConfigured: true,
  });

  const promotionController = createPromotionControllerResult({
    candidateReleaseId:
      opts.candidateReleaseId?.trim() ||
      `${candidateManifest.candidate_manifest_id}-release`,
    nicheProgramId: candidateManifest.niche_program_id,
    baselineReleaseId:
      opts.baselineReleaseId?.trim() ||
      `${baselineManifest.baseline_manifest_id}-baseline-release`,
    baselineManifest,
    candidateManifest,
    componentArtifactRefs,
    benchmarkResults,
    shadowResults,
    approvedBy:
      opts.approvedBy && opts.approvedBy.length > 0 ? opts.approvedBy : ["niche-cli"],
    rollbackTarget:
      opts.rollbackTarget?.trim() || baselineManifest.baseline_manifest_id,
    policyEvaluation,
  });

  const monitorAssessment = opts.monitorObservationPath
    ? assessPromotedReleaseMonitor({
        definition: promotedMonitor,
        observation: assertPromotedMonitorObservation(
          readRequiredJsonFileStrict(opts.monitorObservationPath),
          "monitor observation",
        ),
      })
    : undefined;

  const result: NicheReleaseResult = {
    policy_evaluation: policyEvaluation,
    promotion_controller: promotionController,
    promoted_monitor: promotedMonitor,
    monitor_assessment: monitorAssessment,
  };

  runtime.log(opts.json ? JSON.stringify(result, null, 2) : formatReleaseSummary(result));
  return result;
}
