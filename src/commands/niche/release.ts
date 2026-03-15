import {
  validateBenchmarkRecordBindingsAgainstInput,
  getArbitrationArtifact,
  getBenchmarkArm,
  getBenchmarkFixtureMetadata,
  getGraderCalibrationRecord,
  getGraderArtifact,
  getGraderSet,
} from "../../niche/benchmark/index.js";
import { resolveSpecializationReadiness } from "../../niche/domain/index.js";
import { readRequiredJsonFileStrict } from "../../niche/json.js";
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
import { emitNicheLifecycleEvent } from "../../niche/runtime/lifecycle-events.js";
import {
  ArtifactRefSchema,
  BaselineManifestSchema,
  BenchmarkResultRecordSchema,
  BenchmarkResultSummarySchema,
  CandidateManifestSchema,
  PromotedReleaseMonitorSchema,
  type ArtifactRef,
  type BaselineManifest,
  type BenchmarkResultRecord,
  type BenchmarkResultSummary,
  type CandidateManifest,
} from "../../niche/schema/index.js";
import {
  getArtifactRecord,
  getParentsForArtifact,
  resolveCompilationArtifacts,
  resolveManifestArtifacts,
  resolveBenchmarkArtifacts,
  resolveBenchmarkRunStorePath,
} from "../../niche/store/index.js";
import type { VerifierMetricSummary } from "../../niche/verifier/index.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type NicheReleaseOptions = {
  baselineManifestPath?: string;
  candidateManifestPath?: string;
  benchmarkResultPaths?: string[];
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
  readinessReportPath?: string;
  nicheProgramId?: string;
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

function assertPromotedMonitorDefinition(value: unknown, label: string): PromotedMonitorDefinition {
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
  if (
    !Array.isArray(candidate.monitor.required_case_kinds) ||
    candidate.monitor.required_case_kinds.length === 0
  ) {
    throw new Error(`Invalid ${label}: monitor.required_case_kinds must be a non-empty array.`);
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
  if (!candidate.observed_drift || typeof candidate.consecutive_breach_windows !== "number") {
    throw new Error(`Invalid ${label}: missing observed_drift or consecutive_breach_windows.`);
  }
  return {
    observed_drift: candidate.observed_drift,
    consecutive_breach_windows: candidate.consecutive_breach_windows,
    hours_since_last_rollback: candidate.hours_since_last_rollback,
  };
}

function loadBenchmarkEvidenceRecords(
  pathnames: string[],
  label: string,
  options: { allowEmpty?: boolean } = {},
): { records: BenchmarkResultRecord[]; summaries: BenchmarkResultSummary[]; issues: string[] } {
  if (pathnames.length === 0) {
    if (options.allowEmpty) {
      return { records: [], summaries: [], issues: [] };
    }
    throw new Error(`At least one ${label} is required.`);
  }
  const records: BenchmarkResultRecord[] = [];
  const summaries: BenchmarkResultSummary[] = [];
  const issues: string[] = [];
  for (const pathname of pathnames) {
    const raw = readRequiredJsonFileStrict(pathname);
    const recordValidation = validateJsonSchemaValue({
      schema: BenchmarkResultRecordSchema,
      cacheKey: `niche-cli-release-benchmark-record-${label}-${pathname}`,
      value: raw,
    });
    if (recordValidation.ok) {
      const record = raw as BenchmarkResultRecord;
      records.push(record);
      summaries.push(record.summary);
      continue;
    }
    const summaryValidation = validateJsonSchemaValue({
      schema: BenchmarkResultSummarySchema,
      cacheKey: `niche-cli-release-benchmark-summary-${label}-${pathname}`,
      value: raw,
    });
    if (summaryValidation.ok) {
      const summary = raw as BenchmarkResultSummary;
      summaries.push(summary);
      issues.push(
        `${label} ${summary.benchmark_result_id} is summary-only JSON; release policy requires stored benchmark result records with durable bindings.`,
      );
      continue;
    }
    const details = recordValidation.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid ${label} ${pathname}: ${details}`);
  }
  return { records, summaries, issues };
}

function loadArtifactRefs(pathnames: string[]): ArtifactRef[] {
  if (pathnames.length === 0) {
    throw new Error("At least one --component-artifact-ref is required.");
  }
  return pathnames.map((pathname) => {
    const ref = validateValue(
      ArtifactRefSchema,
      `niche-cli-release-component-ref-${pathname}`,
      readRequiredJsonFileStrict(pathname) as ArtifactRef,
      `component artifact ref ${pathname}`,
    );
    const stored = getArtifactRecord(ref, process.env);
    if (!stored) {
      throw new Error(
        `Component artifact ${ref.artifact_id} is not present in the store and cannot be promoted.`,
      );
    }
    if (getParentsForArtifact(stored.ref.artifact_id, process.env).length === 0) {
      throw new Error(
        `Component artifact ${stored.ref.artifact_id} has no authoritative lineage and cannot be promoted.`,
      );
    }
    return stored.ref;
  });
}

function validateBenchmarkResultBindings(params: {
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  results: BenchmarkResultRecord[];
}): string[] {
  const issues: string[] = [];

  for (const result of params.results) {
  }

  return [
    ...issues,
    ...validateBenchmarkRecordBindingsAgainstInput({
      baselineManifest: params.baselineManifest,
      candidateManifest: params.candidateManifest,
      results: params.results,
      usageLabel: "release",
    }),
  ];
}

function validateMonitorBinding(params: {
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  promotedMonitor: PromotedMonitorDefinition;
}): string[] {
  const issues: string[] = [];
  if (
    params.promotedMonitor.monitor.baseline_manifest_id !==
    params.baselineManifest.baseline_manifest_id
  ) {
    issues.push(
      `Promoted monitor baseline_manifest_id ${params.promotedMonitor.monitor.baseline_manifest_id} does not match ${params.baselineManifest.baseline_manifest_id}.`,
    );
  }
  if (
    params.promotedMonitor.monitor.candidate_manifest_id !==
    params.candidateManifest.candidate_manifest_id
  ) {
    issues.push(
      `Promoted monitor candidate_manifest_id ${params.promotedMonitor.monitor.candidate_manifest_id} does not match ${params.candidateManifest.candidate_manifest_id}.`,
    );
  }
  return issues;
}

function validateGraderGovernance(manifest: BaselineManifest | CandidateManifest): string[] {
  const issues: string[] = [];
  const graderSet = getGraderSet(manifest.grader_set_version, process.env);
  if (!graderSet) {
    issues.push(
      `Missing grader set ${manifest.grader_set_version} for manifest ${"baseline_manifest_id" in manifest ? manifest.baseline_manifest_id : manifest.candidate_manifest_id}.`,
    );
    return issues;
  }
  const arbitration = getArbitrationArtifact(graderSet.arbitration_policy_id, process.env);
  if (!arbitration) {
    issues.push(
      `Missing arbitration artifact ${graderSet.arbitration_policy_id} for grader set ${graderSet.grader_set_id}.`,
    );
  }
  const fixtureMetadata = getBenchmarkFixtureMetadata(graderSet.fixture_metadata_id, process.env);
  if (!fixtureMetadata) {
    issues.push(
      `Missing fixture metadata ${graderSet.fixture_metadata_id} for grader set ${graderSet.grader_set_id}.`,
    );
  } else if (fixtureMetadata.benchmark_suite_id !== manifest.benchmark_suite_id) {
    issues.push(
      `Fixture metadata ${fixtureMetadata.fixture_metadata_id} targets suite ${fixtureMetadata.benchmark_suite_id}, expected ${manifest.benchmark_suite_id}.`,
    );
  }
  for (const graderRef of graderSet.grader_refs) {
    if (graderRef.artifact_type !== "grader") {
      issues.push(
        `Grader set ${graderSet.grader_set_id} contains non-grader artifact ${graderRef.artifact_id}.`,
      );
      continue;
    }
    if (!getGraderArtifact(graderRef.artifact_id, process.env)) {
      issues.push(
        `Missing grader artifact ${graderRef.artifact_id} referenced by grader set ${graderSet.grader_set_id}.`,
      );
      continue;
    }
    const calibration = getGraderCalibrationRecord(
      graderSet.grader_set_id,
      graderRef.artifact_id,
      process.env,
    );
    if (!calibration) {
      issues.push(
        `Missing grader calibration record for ${graderRef.artifact_id} in grader set ${graderSet.grader_set_id}.`,
      );
      continue;
    }
    if (!calibration.promotion_eligible) {
      issues.push(
        `Grader ${graderRef.artifact_id} is not promotion-eligible for grader set ${graderSet.grader_set_id}.`,
      );
    }
    if (calibration.sme_sample_count < calibration.required_sme_sample_count) {
      issues.push(
        `Grader ${graderRef.artifact_id} has insufficient SME sampling (${calibration.sme_sample_count}/${calibration.required_sme_sample_count}).`,
      );
    }
  }
  return issues;
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
    lines.push(`Rollback now: ${result.monitor_assessment.should_rollback ? "yes" : "no"}`);
  }
  return lines.join("\n");
}

export async function nicheReleaseCommand(
  opts: NicheReleaseOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NicheReleaseResult> {
  // Resolve manifest, benchmark, and readiness paths from the program store when --from-program is given
  if (opts.nicheProgramId) {
    if (!opts.baselineManifestPath || !opts.candidateManifestPath) {
      const manifests = resolveManifestArtifacts(opts.nicheProgramId, process.env);
      opts.baselineManifestPath ??= manifests.baselineManifestPath;
      opts.candidateManifestPath ??= manifests.candidateManifestPath;
    }
    if (!opts.benchmarkResultPaths || opts.benchmarkResultPaths.length === 0) {
      const benchmarks = resolveBenchmarkArtifacts(opts.nicheProgramId, process.env);
      opts.benchmarkResultPaths = benchmarks.benchmarkResultRecords.map((r) =>
        resolveBenchmarkRunStorePath(r.benchmark_result_record_id, process.env),
      );
    }
    if (!opts.readinessReportPath) {
      const compilation = resolveCompilationArtifacts(opts.nicheProgramId, process.env);
      opts.readinessReportPath = compilation.readinessReportPath;
    }
  }
  if (!opts.baselineManifestPath) {
    throw new Error(
      "--baseline-manifest is required (or use --from-program to resolve it automatically).",
    );
  }
  if (!opts.candidateManifestPath) {
    throw new Error(
      "--candidate-manifest is required (or use --from-program to resolve it automatically).",
    );
  }
  if (!opts.benchmarkResultPaths || opts.benchmarkResultPaths.length === 0) {
    throw new Error(
      "--benchmark-result is required (or use --from-program to resolve it automatically).",
    );
  }
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
  resolveSpecializationReadiness({
    nicheProgramId: candidateManifest.niche_program_id,
    readinessReportPath: opts.readinessReportPath,
    env: process.env,
  });
  const benchmarkEvidence = loadBenchmarkEvidenceRecords(
    opts.benchmarkResultPaths,
    "benchmark result",
  );
  const shadowEvidence = loadBenchmarkEvidenceRecords(
    opts.shadowResultPaths ?? [],
    "shadow result",
    {
      allowEmpty: true,
    },
  );
  const benchmarkResults = benchmarkEvidence.records;
  const shadowResults = shadowEvidence.records;
  const benchmarkSummaries = benchmarkEvidence.summaries;
  const shadowSummaries = shadowEvidence.summaries;
  const verifierMetrics = assertVerifierMetricSummary(
    readRequiredJsonFileStrict(opts.verifierMetricsPath),
    "verifier metrics",
  );
  const promotedMonitor = assertPromotedMonitorDefinition(
    readRequiredJsonFileStrict(opts.monitorDefinitionPath),
    "promoted monitor definition",
  );
  const componentArtifactRefs = loadArtifactRefs(opts.componentArtifactRefPaths);
  const evidenceBindingIssues = [
    ...benchmarkEvidence.issues,
    ...shadowEvidence.issues,
    ...validateGraderGovernance(baselineManifest),
    ...validateGraderGovernance(candidateManifest),
    ...validateBenchmarkResultBindings({
      baselineManifest,
      candidateManifest,
      results: [...benchmarkResults, ...shadowResults],
    }),
    ...validateMonitorBinding({
      baselineManifest,
      candidateManifest,
      promotedMonitor,
    }),
  ];

  const policyEvaluation = evaluateReleasePolicy({
    baselineManifest,
    candidateManifest,
    benchmarkResults,
    shadowResults,
    verifierMetrics,
    latencyRegression: opts.latencyRegression ?? 0,
    costRegression: opts.costRegression ?? 0,
    postPromotionMonitorConfigured: evidenceBindingIssues.length === 0,
    preexistingBlockingReasons: evidenceBindingIssues,
    requiredCaseKinds: promotedMonitor.monitor.required_case_kinds,
  });

  const promotionController = createPromotionControllerResult({
    candidateReleaseId:
      opts.candidateReleaseId?.trim() || `${candidateManifest.candidate_manifest_id}-release`,
    nicheProgramId: candidateManifest.niche_program_id,
    baselineReleaseId:
      opts.baselineReleaseId?.trim() || `${baselineManifest.baseline_manifest_id}-baseline-release`,
    baselineManifest,
    candidateManifest,
    componentArtifactRefs,
    benchmarkResults: benchmarkSummaries,
    shadowResults: shadowSummaries,
    approvedBy: opts.approvedBy && opts.approvedBy.length > 0 ? opts.approvedBy : ["niche-cli"],
    rollbackTarget: opts.rollbackTarget?.trim() || baselineManifest.baseline_manifest_id,
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
  if (promotionController.decision === "promoted") {
    void emitNicheLifecycleEvent({
      event_type: "candidate_promoted",
      run_id: promotionController.candidate_release.candidate_release_id,
      niche_program_id: candidateManifest.niche_program_id,
      baseline_manifest_id: baselineManifest.baseline_manifest_id,
      candidate_manifest_id: candidateManifest.candidate_manifest_id,
      payload: {
        candidate_release_id: promotionController.candidate_release.candidate_release_id,
        rollback_target: promotionController.candidate_release.rollback_target,
      },
    }).catch(() => {});
  }

  runtime.log(opts.json ? JSON.stringify(result, null, 2) : formatReleaseSummary(result));
  return result;
}
