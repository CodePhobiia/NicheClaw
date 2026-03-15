import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { emitNicheLifecycleEvent } from "../runtime/lifecycle-events.js";
import {
  BenchmarkResultSummarySchema,
  ContaminationAuditSummarySchema,
  EpisodeCaseSchema,
  type BaselineManifest,
  type BenchmarkArmIdentifier,
  type BenchmarkResultSummary,
  type CandidateManifest,
  type EpisodeCase,
} from "../schema/index.js";
import type { BenchmarkInvalidationReason } from "./invalidation.js";
import { collectBenchmarkInvalidationReasons } from "./invalidation.js";
import { buildPairedDeltaSummary } from "./statistics.js";

export const EpisodeStepResultSchema = Type.Object(
  {
    step_index: Type.Integer({ minimum: 0 }),
    score: Type.Number(),
    success: Type.Boolean(),
    hard_fail: Type.Boolean(),
    latency_ms: Type.Integer({ minimum: 0 }),
    cost: Type.Number({ minimum: 0 }),
    tool_misuse: Type.Boolean(),
    verifier_intervention: Type.Boolean(),
    recovery_used: Type.Boolean(),
    notes: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const EpisodeCaseExecutionResultSchema = Type.Object(
  {
    total_score: Type.Number(),
    success: Type.Boolean(),
    hard_fail: Type.Boolean(),
    step_results: Type.Array(EpisodeStepResultSchema, { minItems: 1 }),
    verifier_outcome: Type.String({ minLength: 1 }),
    grader_version: Type.String({ minLength: 1 }),
    retry_count: Type.Integer({ minimum: 0 }),
    memory_effect_summary: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const EpisodeBenchmarkSuiteRecordSchema = Type.Object(
  {
    metadata: Type.Object(
      {
        benchmark_suite_id: Type.String({ minLength: 1 }),
        case_kind: Type.Literal("episode_case"),
        mode: Type.String({ minLength: 1 }),
        split: Type.String({ minLength: 1 }),
        created_at: Type.String({ minLength: 1 }),
        suite_version: Type.String({ minLength: 1 }),
        suite_hash: Type.String({ minLength: 1 }),
        fixture_version: Type.String({ minLength: 1 }),
        determinism_policy_id: Type.String({ minLength: 1 }),
        task_families: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
        description: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
    cases: Type.Array(EpisodeCaseSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const EpisodePairedCaseResultSchema = Type.Object(
  {
    episode_case_id: Type.String({ minLength: 1 }),
    task_family: Type.String({ minLength: 1 }),
    baseline: EpisodeCaseExecutionResultSchema,
    candidate: EpisodeCaseExecutionResultSchema,
    delta: Type.Number(),
  },
  { additionalProperties: false },
);

export const EpisodeBenchmarkRunResultSchema = Type.Object(
  {
    summary: BenchmarkResultSummarySchema,
    paired_case_results: Type.Array(EpisodePairedCaseResultSchema),
    comparison_issues: Type.Array(
      Type.Object(
        {
          code: Type.String({ minLength: 1 }),
          message: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
    invalidation_reasons: Type.Array(
      Type.Object(
        {
          code: Type.String({ minLength: 1 }),
          message: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
    contamination_audit_metadata: ContaminationAuditSummarySchema,
  },
  { additionalProperties: false },
);

export type EpisodeStepResult = Static<typeof EpisodeStepResultSchema>;
export type EpisodeCaseExecutionResult = Static<typeof EpisodeCaseExecutionResultSchema>;
export type EpisodeBenchmarkSuiteRecord = {
  metadata: {
    benchmark_suite_id: string;
    case_kind: "episode_case";
    mode: BenchmarkResultSummary["mode"];
    split: string;
    created_at: string;
    suite_version: string;
    suite_hash: string;
    fixture_version: string;
    determinism_policy_id: string;
    task_families: string[];
    description?: string;
  };
  cases: EpisodeCase[];
};
export type EpisodePairedCaseResult = Static<typeof EpisodePairedCaseResultSchema>;
export type EpisodeBenchmarkRunResult = Static<typeof EpisodeBenchmarkRunResultSchema>;

export type EpisodeCaseExecutor = (params: {
  manifest: BaselineManifest | CandidateManifest;
  episodeCase: EpisodeCase;
  armKind: "baseline" | "candidate";
}) => Promise<EpisodeCaseExecutionResult>;

function buildTaskFamilySummaries(
  pairedCaseResults: EpisodePairedCaseResult[],
): BenchmarkResultSummary["task_family_summaries"] {
  const byFamily = new Map<
    string,
    { caseCount: number; deltaSum: number; scoreSum: number; hardFailCount: number }
  >();

  for (const result of pairedCaseResults) {
    const current = byFamily.get(result.task_family) ?? {
      caseCount: 0,
      deltaSum: 0,
      scoreSum: 0,
      hardFailCount: 0,
    };
    current.caseCount += 1;
    current.deltaSum += result.delta;
    current.scoreSum += result.candidate.total_score;
    if (result.candidate.hard_fail) {
      current.hardFailCount += 1;
    }
    byFamily.set(result.task_family, current);
  }

  return [...byFamily.entries()]
    .map(([taskFamily, summary]) => ({
      task_family: taskFamily,
      case_count: summary.caseCount,
      score_mean: summary.caseCount === 0 ? 0 : summary.scoreSum / summary.caseCount,
      hard_fail_rate: summary.caseCount === 0 ? 0 : summary.hardFailCount / summary.caseCount,
      mean_delta: summary.caseCount === 0 ? 0 : summary.deltaSum / summary.caseCount,
    }))
    .toSorted((left, right) => left.task_family.localeCompare(right.task_family));
}

function buildInvalidatedTaskFamilySummaries(
  taskFamilies: string[],
): BenchmarkResultSummary["task_family_summaries"] {
  return taskFamilies.map((taskFamily) => ({
    task_family: taskFamily,
    case_count: 0,
    score_mean: 0,
    hard_fail_rate: 0,
    mean_delta: 0,
  }));
}

function buildInvalidatedResult(params: {
  suite: EpisodeBenchmarkSuiteRecord;
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  baselineArm: BenchmarkArmIdentifier;
  candidateArm: BenchmarkArmIdentifier;
  comparisonIssues: Array<{ code: string; message: string }>;
  invalidationReasons: BenchmarkInvalidationReason[];
}): EpisodeBenchmarkRunResult {
  return {
    summary: {
      benchmark_result_id: `${params.suite.metadata.benchmark_suite_id}-episode-invalidated`,
      benchmark_suite_id: params.suite.metadata.benchmark_suite_id,
      case_kind: "episode_case",
      mode: params.suite.metadata.mode,
      baseline_arm_id: params.baselineArm.benchmark_arm_id,
      candidate_arm_id: params.candidateArm.benchmark_arm_id,
      baseline_provider_metadata_quality: params.baselineManifest.provider_metadata_quality,
      candidate_provider_metadata_quality: params.candidateManifest.provider_metadata_quality,
      primary_metric: params.suite.cases[0]?.grader_spec.primary_metric ?? "unknown",
      case_count: 0,
      paired_delta_summary: {
        mean_delta: 0,
        median_delta: 0,
        p10_delta: 0,
        p90_delta: 0,
        confidence_interval_low: 0,
        confidence_interval_high: 0,
      },
      task_family_summaries: buildInvalidatedTaskFamilySummaries(
        params.suite.metadata.task_families,
      ),
      contamination_audit_summary: {
        contamination_detected: params.invalidationReasons.some(
          (reason) => reason.code === "contamination_detected",
        ),
        audited_case_count: 0,
        notes: "Episode benchmark was invalidated before execution.",
      },
      invalidated: true,
      invalidation_reasons: params.invalidationReasons.map((reason) => reason.message),
    },
    paired_case_results: [],
    comparison_issues: params.comparisonIssues,
    invalidation_reasons: params.invalidationReasons,
    contamination_audit_metadata: {
      contamination_detected: params.invalidationReasons.some(
        (reason) => reason.code === "contamination_detected",
      ),
      audited_case_count: 0,
      notes: "No episode cases were executed because the benchmark was invalidated.",
    },
  };
}

export async function runEpisodeBenchmark(params: {
  suite: EpisodeBenchmarkSuiteRecord;
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  baselineArm: BenchmarkArmIdentifier;
  candidateArm: BenchmarkArmIdentifier;
  executeBaselineCase: EpisodeCaseExecutor;
  executeCandidateCase: EpisodeCaseExecutor;
  bootstrapSeed?: number;
  contaminationDetected: boolean;
  actualSuiteHash: string;
  actualFixtureVersion: string;
  actualGraderVersion: string;
}): Promise<EpisodeBenchmarkRunResult> {
  const invalidationReasons = collectBenchmarkInvalidationReasons({
    baselineManifest: params.baselineManifest,
    candidateManifest: params.candidateManifest,
    contaminationDetected: params.contaminationDetected,
    expectedSuiteHash: params.suite.metadata.suite_hash,
    actualSuiteHash: params.actualSuiteHash,
    expectedFixtureVersion: params.suite.metadata.fixture_version,
    actualFixtureVersion: params.actualFixtureVersion,
    expectedGraderVersion: params.suite.cases[0]?.grader_spec.grader_refs[0],
    actualGraderVersion: params.actualGraderVersion,
    expectedSourceAccessManifestId: params.baselineManifest.source_access_manifest_id,
    actualSourceAccessManifestId: params.candidateManifest.source_access_manifest_id,
  });
  const comparisonIssues = invalidationReasons
    .flatMap((reason) => reason.comparison_issue ?? [])
    .toSorted((left, right) => left.code.localeCompare(right.code));

  if (invalidationReasons.length > 0) {
    return buildInvalidatedResult({
      suite: params.suite,
      baselineManifest: params.baselineManifest,
      candidateManifest: params.candidateManifest,
      baselineArm: params.baselineArm,
      candidateArm: params.candidateArm,
      comparisonIssues,
      invalidationReasons,
    });
  }

  const pairedCaseResults: EpisodePairedCaseResult[] = [];
  for (const testCase of params.suite.cases) {
    void emitNicheLifecycleEvent({
      event_type: "benchmark_case_started",
      run_id: `benchmark-${params.baselineArm.benchmark_arm_id}-${testCase.episode_case_id}-baseline`,
      niche_program_id: params.baselineManifest.niche_program_id,
      baseline_manifest_id: params.baselineManifest.baseline_manifest_id,
      candidate_manifest_id: params.candidateManifest.candidate_manifest_id,
      payload: {
        benchmark_arm_id: params.baselineArm.benchmark_arm_id,
        benchmark_case_ref: {
          case_kind: "episode_case",
          case_id: testCase.episode_case_id,
        },
      },
    });
    const baseline = await params.executeBaselineCase({
      manifest: params.baselineManifest,
      episodeCase: testCase,
      armKind: "baseline",
    });
    void emitNicheLifecycleEvent({
      event_type: "benchmark_case_finished",
      run_id: `benchmark-${params.baselineArm.benchmark_arm_id}-${testCase.episode_case_id}-baseline`,
      niche_program_id: params.baselineManifest.niche_program_id,
      baseline_manifest_id: params.baselineManifest.baseline_manifest_id,
      candidate_manifest_id: params.candidateManifest.candidate_manifest_id,
      payload: {
        benchmark_arm_id: params.baselineArm.benchmark_arm_id,
        benchmark_case_ref: {
          case_kind: "episode_case",
          case_id: testCase.episode_case_id,
        },
        invalidated: baseline.hard_fail,
        outcome_summary: `Baseline completed with total score ${baseline.total_score.toFixed(4)}.`,
      },
    });
    void emitNicheLifecycleEvent({
      event_type: "benchmark_case_started",
      run_id: `benchmark-${params.candidateArm.benchmark_arm_id}-${testCase.episode_case_id}-candidate`,
      niche_program_id: params.candidateManifest.niche_program_id,
      baseline_manifest_id: params.baselineManifest.baseline_manifest_id,
      candidate_manifest_id: params.candidateManifest.candidate_manifest_id,
      payload: {
        benchmark_arm_id: params.candidateArm.benchmark_arm_id,
        benchmark_case_ref: {
          case_kind: "episode_case",
          case_id: testCase.episode_case_id,
        },
      },
    });
    const candidate = await params.executeCandidateCase({
      manifest: params.candidateManifest,
      episodeCase: testCase,
      armKind: "candidate",
    });
    void emitNicheLifecycleEvent({
      event_type: "benchmark_case_finished",
      run_id: `benchmark-${params.candidateArm.benchmark_arm_id}-${testCase.episode_case_id}-candidate`,
      niche_program_id: params.candidateManifest.niche_program_id,
      baseline_manifest_id: params.baselineManifest.baseline_manifest_id,
      candidate_manifest_id: params.candidateManifest.candidate_manifest_id,
      payload: {
        benchmark_arm_id: params.candidateArm.benchmark_arm_id,
        benchmark_case_ref: {
          case_kind: "episode_case",
          case_id: testCase.episode_case_id,
        },
        invalidated: candidate.hard_fail,
        outcome_summary: `Candidate completed with total score ${candidate.total_score.toFixed(4)}.`,
      },
    });
    pairedCaseResults.push({
      episode_case_id: testCase.episode_case_id,
      task_family: testCase.task_family,
      baseline,
      candidate,
      delta: candidate.total_score - baseline.total_score,
    });
  }

  const deltaSummary = buildPairedDeltaSummary(
    pairedCaseResults.map((result) => result.delta),
    { seed: params.bootstrapSeed ?? 1 },
  );
  const contaminationAuditMetadata = {
    contamination_detected: params.contaminationDetected,
    audited_case_count: pairedCaseResults.length,
    notes: "Episode benchmark completed without contamination flags.",
  };

  return {
    summary: {
      benchmark_result_id: `${params.suite.metadata.benchmark_suite_id}-episode-run`,
      benchmark_suite_id: params.suite.metadata.benchmark_suite_id,
      case_kind: "episode_case",
      mode: params.suite.metadata.mode,
      baseline_arm_id: params.baselineArm.benchmark_arm_id,
      candidate_arm_id: params.candidateArm.benchmark_arm_id,
      baseline_provider_metadata_quality: params.baselineManifest.provider_metadata_quality,
      candidate_provider_metadata_quality: params.candidateManifest.provider_metadata_quality,
      primary_metric: params.suite.cases[0]?.grader_spec.primary_metric ?? "unknown",
      case_count: pairedCaseResults.length,
      paired_delta_summary: {
        mean_delta: deltaSummary.meanDelta,
        median_delta: deltaSummary.medianDelta,
        p10_delta: deltaSummary.p10Delta,
        p90_delta: deltaSummary.p90Delta,
        confidence_interval_low: deltaSummary.confidenceIntervalLow,
        confidence_interval_high: deltaSummary.confidenceIntervalHigh,
      },
      task_family_summaries: buildTaskFamilySummaries(pairedCaseResults),
      contamination_audit_summary: contaminationAuditMetadata,
      invalidated: false,
      invalidation_reasons: [],
    },
    paired_case_results: pairedCaseResults,
    comparison_issues: comparisonIssues,
    invalidation_reasons: [],
    contamination_audit_metadata: contaminationAuditMetadata,
  };
}
