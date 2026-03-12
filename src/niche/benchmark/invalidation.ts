import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import {
  getManifestComparisonIssues,
  ManifestComparisonIssueSchema,
  NonEmptyString,
  stringEnum,
  type BaselineManifest,
  type CandidateManifest,
} from "../schema/index.js";

export const BENCHMARK_INVALIDATION_REASON_CODES = [
  "manifest_incompatible",
  "contamination_detected",
  "suite_changed_during_comparison",
  "benchmark_suite_hash_drift",
  "grader_version_drift",
  "fixture_version_drift",
  "source_access_mismatch",
] as const;

export const BenchmarkInvalidationReasonCodeSchema = stringEnum(
  BENCHMARK_INVALIDATION_REASON_CODES,
);

export const BenchmarkInvalidationReasonSchema = Type.Object(
  {
    code: BenchmarkInvalidationReasonCodeSchema,
    message: NonEmptyString,
    comparison_issue: Type.Optional(ManifestComparisonIssueSchema),
  },
  { additionalProperties: false },
);

export type BenchmarkInvalidationReasonCode = Static<
  typeof BenchmarkInvalidationReasonCodeSchema
>;
export type BenchmarkInvalidationReason = Static<typeof BenchmarkInvalidationReasonSchema>;

export function collectManifestInvalidationReasons(
  baselineManifest: BaselineManifest,
  candidateManifest: CandidateManifest,
): BenchmarkInvalidationReason[] {
  return getManifestComparisonIssues(baselineManifest, candidateManifest).map((issue) => ({
    code: "manifest_incompatible",
    message: issue.message,
    comparison_issue: issue,
  }));
}

export function collectBenchmarkInvalidationReasons(params: {
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  contaminationDetected?: boolean;
  suiteChangedDuringComparison?: boolean;
  expectedSuiteHash?: string;
  actualSuiteHash?: string;
  expectedGraderVersion?: string;
  actualGraderVersion?: string;
  expectedFixtureVersion?: string;
  actualFixtureVersion?: string;
  expectedSourceAccessManifestId?: string;
  actualSourceAccessManifestId?: string;
}): BenchmarkInvalidationReason[] {
  const reasons = collectManifestInvalidationReasons(
    params.baselineManifest,
    params.candidateManifest,
  );

  if (params.contaminationDetected) {
    reasons.push({
      code: "contamination_detected",
      message: "Benchmark comparison was contaminated and cannot be trusted.",
    });
  }

  if (params.suiteChangedDuringComparison) {
    reasons.push({
      code: "suite_changed_during_comparison",
      message: "Benchmark suite changed during the comparison run.",
    });
  }

  if (
    params.expectedSuiteHash &&
    params.actualSuiteHash &&
    params.expectedSuiteHash !== params.actualSuiteHash
  ) {
    reasons.push({
      code: "benchmark_suite_hash_drift",
      message: "Benchmark suite hash drifted during the comparison run.",
    });
  }

  if (
    params.expectedGraderVersion &&
    params.actualGraderVersion &&
    params.expectedGraderVersion !== params.actualGraderVersion
  ) {
    reasons.push({
      code: "grader_version_drift",
      message: "Grader version drifted during the comparison run.",
    });
  }

  if (
    params.expectedFixtureVersion &&
    params.actualFixtureVersion &&
    params.expectedFixtureVersion !== params.actualFixtureVersion
  ) {
    reasons.push({
      code: "fixture_version_drift",
      message: "Benchmark fixture version drifted during the comparison run.",
    });
  }

  if (
    params.expectedSourceAccessManifestId &&
    params.actualSourceAccessManifestId &&
    params.expectedSourceAccessManifestId !== params.actualSourceAccessManifestId
  ) {
    reasons.push({
      code: "source_access_mismatch",
      message: "Source access changed during the comparison run.",
    });
  }

  return reasons;
}

export function isBenchmarkInvalidated(
  reasons: BenchmarkInvalidationReason[],
): boolean {
  return reasons.length > 0;
}
