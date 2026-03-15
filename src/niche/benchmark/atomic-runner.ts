import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { emitNicheLifecycleEvent } from "../runtime/lifecycle-events.js";
import {
  BenchmarkResultSummarySchema,
  ContaminationAuditSummarySchema,
  type BaselineManifest,
  type BenchmarkArmIdentifier,
  type BenchmarkResultSummary,
  type CandidateManifest,
  type EvalCase,
} from "../schema/index.js";
import type { BenchmarkInvalidationReason } from "./invalidation.js";
import { collectBenchmarkInvalidationReasons } from "./invalidation.js";
import { buildPairedDeltaSummary } from "./statistics.js";
import type { AtomicBenchmarkSuiteRecord } from "./suite-registry.js";

export const AtomicCaseExecutionResultSchema = Type.Object(
  {
    score: Type.Number(),
    hard_fail: Type.Boolean(),
    latency_ms: Type.Integer({ minimum: 0 }),
    cost: Type.Number({ minimum: 0 }),
    verifier_outcome: Type.String({ minLength: 1 }),
    grader_version: Type.String({ minLength: 1 }),
    grader_used: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const AtomicPairedCaseResultSchema = Type.Object(
  {
    eval_case_id: Type.String({ minLength: 1 }),
    task_family: Type.String({ minLength: 1 }),
    baseline: AtomicCaseExecutionResultSchema,
    candidate: AtomicCaseExecutionResultSchema,
    delta: Type.Number(),
  },
  { additionalProperties: false },
);

export const AtomicBenchmarkRunResultSchema = Type.Object(
  {
    summary: BenchmarkResultSummarySchema,
    paired_case_results: Type.Array(AtomicPairedCaseResultSchema),
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

export type AtomicCaseExecutionResult = Static<typeof AtomicCaseExecutionResultSchema>;
export type AtomicPairedCaseResult = Static<typeof AtomicPairedCaseResultSchema>;
export type AtomicBenchmarkRunResult = Static<typeof AtomicBenchmarkRunResultSchema>;

export type AtomicCaseExecutor = (params: {
  manifest: BaselineManifest | CandidateManifest;
  evalCase: EvalCase;
  armKind: "baseline" | "candidate";
}) => Promise<AtomicCaseExecutionResult>;

function buildTaskFamilySummaries(
  pairedCaseResults: AtomicPairedCaseResult[],
): BenchmarkResultSummary["task_family_summaries"] {
  const byFamily = new Map<
    string,
    {
      caseCount: number;
      deltaSum: number;
      scoreSum: number;
      hardFailCount: number;
    }
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
    current.scoreSum += result.candidate.score;
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
  suite: AtomicBenchmarkSuiteRecord;
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  baselineArm: BenchmarkArmIdentifier;
  candidateArm: BenchmarkArmIdentifier;
  comparisonIssues: Array<{ code: string; message: string }>;
  invalidationReasons: BenchmarkInvalidationReason[];
}): AtomicBenchmarkRunResult {
  return {
    summary: {
      benchmark_result_id: `${params.suite.metadata.benchmark_suite_id}-invalidated`,
      benchmark_suite_id: params.suite.metadata.benchmark_suite_id,
      case_kind: params.suite.metadata.case_kind,
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
        notes: "Benchmark run invalidated before execution.",
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
      notes: "No cases executed because manifest comparison was invalidated.",
    },
  };
}

export async function runAtomicBenchmark(params: {
  suite: AtomicBenchmarkSuiteRecord;
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  baselineArm: BenchmarkArmIdentifier;
  candidateArm: BenchmarkArmIdentifier;
  executeBaselineCase: AtomicCaseExecutor;
  executeCandidateCase: AtomicCaseExecutor;
  bootstrapSeed?: number;
  contaminationDetected: boolean;
  actualSuiteHash: string;
  actualFixtureVersion: string;
  actualGraderVersion: string;
  contaminationAuditNotes?: string;
}): Promise<AtomicBenchmarkRunResult> {
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

  const pairedCaseResults: AtomicPairedCaseResult[] = [];
  for (const testCase of params.suite.cases) {
    void emitNicheLifecycleEvent({
      event_type: "benchmark_case_started",
      run_id: `benchmark-${params.baselineArm.benchmark_arm_id}-${testCase.eval_case_id}-baseline`,
      niche_program_id: params.baselineManifest.niche_program_id,
      baseline_manifest_id: params.baselineManifest.baseline_manifest_id,
      candidate_manifest_id: params.candidateManifest.candidate_manifest_id,
      payload: {
        benchmark_arm_id: params.baselineArm.benchmark_arm_id,
        benchmark_case_ref: {
          case_kind: "atomic_case",
          case_id: testCase.eval_case_id,
        },
      },
    });
    const baseline = await params.executeBaselineCase({
      manifest: params.baselineManifest,
      evalCase: testCase,
      armKind: "baseline",
    });
    void emitNicheLifecycleEvent({
      event_type: "benchmark_case_finished",
      run_id: `benchmark-${params.baselineArm.benchmark_arm_id}-${testCase.eval_case_id}-baseline`,
      niche_program_id: params.baselineManifest.niche_program_id,
      baseline_manifest_id: params.baselineManifest.baseline_manifest_id,
      candidate_manifest_id: params.candidateManifest.candidate_manifest_id,
      payload: {
        benchmark_arm_id: params.baselineArm.benchmark_arm_id,
        benchmark_case_ref: {
          case_kind: "atomic_case",
          case_id: testCase.eval_case_id,
        },
        invalidated: baseline.hard_fail,
        outcome_summary: `Baseline completed with score ${baseline.score.toFixed(4)}.`,
      },
    });
    void emitNicheLifecycleEvent({
      event_type: "benchmark_case_started",
      run_id: `benchmark-${params.candidateArm.benchmark_arm_id}-${testCase.eval_case_id}-candidate`,
      niche_program_id: params.candidateManifest.niche_program_id,
      baseline_manifest_id: params.baselineManifest.baseline_manifest_id,
      candidate_manifest_id: params.candidateManifest.candidate_manifest_id,
      payload: {
        benchmark_arm_id: params.candidateArm.benchmark_arm_id,
        benchmark_case_ref: {
          case_kind: "atomic_case",
          case_id: testCase.eval_case_id,
        },
      },
    });
    const candidate = await params.executeCandidateCase({
      manifest: params.candidateManifest,
      evalCase: testCase,
      armKind: "candidate",
    });
    void emitNicheLifecycleEvent({
      event_type: "benchmark_case_finished",
      run_id: `benchmark-${params.candidateArm.benchmark_arm_id}-${testCase.eval_case_id}-candidate`,
      niche_program_id: params.candidateManifest.niche_program_id,
      baseline_manifest_id: params.baselineManifest.baseline_manifest_id,
      candidate_manifest_id: params.candidateManifest.candidate_manifest_id,
      payload: {
        benchmark_arm_id: params.candidateArm.benchmark_arm_id,
        benchmark_case_ref: {
          case_kind: "atomic_case",
          case_id: testCase.eval_case_id,
        },
        invalidated: candidate.hard_fail,
        outcome_summary: `Candidate completed with score ${candidate.score.toFixed(4)}.`,
      },
    });
    pairedCaseResults.push({
      eval_case_id: testCase.eval_case_id,
      task_family: testCase.task_family,
      baseline,
      candidate,
      delta: candidate.score - baseline.score,
    });
  }

  const deltaSummary = buildPairedDeltaSummary(
    pairedCaseResults.map((result) => result.delta),
    { seed: params.bootstrapSeed ?? 1 },
  );
  const contaminationAuditMetadata = {
    contamination_detected: params.contaminationDetected,
    audited_case_count: pairedCaseResults.length,
    notes:
      params.contaminationAuditNotes ?? "Atomic benchmark completed without contamination flags.",
  };

  return {
    summary: {
      benchmark_result_id: `${params.suite.metadata.benchmark_suite_id}-atomic-run`,
      benchmark_suite_id: params.suite.metadata.benchmark_suite_id,
      case_kind: params.suite.metadata.case_kind,
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
