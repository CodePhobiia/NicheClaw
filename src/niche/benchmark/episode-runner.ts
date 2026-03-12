import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import {
  BenchmarkResultSummarySchema,
  ContaminationAuditSummarySchema,
  areManifestsBenchmarkComparable,
  getManifestComparisonIssues,
  type BaselineManifest,
  type BenchmarkResultSummary,
  type CandidateManifest,
  type EpisodeCase,
  type ManifestComparisonIssue,
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
    cases: Type.Array(Type.Any(), { minItems: 1 }),
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
    { caseCount: number; scoreSum: number; hardFailCount: number }
  >();

  for (const result of pairedCaseResults) {
    const current = byFamily.get(result.task_family) ?? {
      caseCount: 0,
      scoreSum: 0,
      hardFailCount: 0,
    };
    current.caseCount += 1;
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
    }))
    .toSorted((left, right) => left.task_family.localeCompare(right.task_family));
}

function buildInvalidatedResult(params: {
  suite: EpisodeBenchmarkSuiteRecord;
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  comparisonIssues: ManifestComparisonIssue[];
  invalidationReasons: BenchmarkInvalidationReason[];
}): EpisodeBenchmarkRunResult {
  return {
    summary: {
      benchmark_result_id: `${params.suite.metadata.benchmark_suite_id}--episode-invalidated`,
      benchmark_suite_id: params.suite.metadata.benchmark_suite_id,
      case_kind: "episode_case",
      mode: params.suite.metadata.mode,
      baseline_arm_id: params.baselineManifest.baseline_manifest_id,
      candidate_arm_id: params.candidateManifest.candidate_manifest_id,
      provider_metadata_quality: params.candidateManifest.provider_metadata_quality,
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
      task_family_summaries: [],
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
  executeBaselineCase: EpisodeCaseExecutor;
  executeCandidateCase: EpisodeCaseExecutor;
  bootstrapSeed?: number;
  contaminationDetected?: boolean;
  actualSuiteHash?: string;
  actualFixtureVersion?: string;
  actualGraderVersion?: string;
}): Promise<EpisodeBenchmarkRunResult> {
  const comparisonIssues = getManifestComparisonIssues(
    params.baselineManifest,
    params.candidateManifest,
  );
  const invalidationReasons = collectBenchmarkInvalidationReasons({
    baselineManifest: params.baselineManifest,
    candidateManifest: params.candidateManifest,
    contaminationDetected: params.contaminationDetected,
    expectedSuiteHash: params.suite.metadata.suite_hash,
    actualSuiteHash: params.actualSuiteHash ?? params.suite.metadata.suite_hash,
    expectedFixtureVersion: params.suite.metadata.fixture_version,
    actualFixtureVersion:
      params.actualFixtureVersion ?? params.suite.metadata.fixture_version,
    expectedGraderVersion: params.suite.cases[0]?.grader_spec.grader_refs[0],
    actualGraderVersion:
      params.actualGraderVersion ?? params.suite.cases[0]?.grader_spec.grader_refs[0],
    expectedSourceAccessManifestId: params.baselineManifest.source_access_manifest_id,
    actualSourceAccessManifestId: params.candidateManifest.source_access_manifest_id,
  });

  if (
    !areManifestsBenchmarkComparable(params.baselineManifest, params.candidateManifest) ||
    invalidationReasons.length > 0
  ) {
    return buildInvalidatedResult({
      suite: params.suite,
      baselineManifest: params.baselineManifest,
      candidateManifest: params.candidateManifest,
      comparisonIssues,
      invalidationReasons,
    });
  }

  const pairedCaseResults: EpisodePairedCaseResult[] = [];
  for (const testCase of params.suite.cases) {
    const baseline = await params.executeBaselineCase({
      manifest: params.baselineManifest,
      episodeCase: testCase,
      armKind: "baseline",
    });
    const candidate = await params.executeCandidateCase({
      manifest: params.candidateManifest,
      episodeCase: testCase,
      armKind: "candidate",
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
    contamination_detected: false,
    audited_case_count: pairedCaseResults.length,
    notes: "Episode benchmark completed without contamination flags.",
  };

  return {
    summary: {
      benchmark_result_id: `${params.suite.metadata.benchmark_suite_id}--episode-run`,
      benchmark_suite_id: params.suite.metadata.benchmark_suite_id,
      case_kind: "episode_case",
      mode: params.suite.metadata.mode,
      baseline_arm_id: params.baselineManifest.baseline_manifest_id,
      candidate_arm_id: params.candidateManifest.candidate_manifest_id,
      provider_metadata_quality: params.candidateManifest.provider_metadata_quality,
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
