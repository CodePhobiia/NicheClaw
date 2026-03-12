import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { IdentifierString, NonEmptyString, TimestampString, stringEnum } from "./common.js";

export const READINESS_STATUSES = ["ready", "ready_with_warnings", "not_ready"] as const;
export const READINESS_ACTION_PRIORITIES = ["required", "recommended", "optional"] as const;
export const READINESS_HARD_BLOCKER_CODES = [
  "insufficient_rights_to_use",
  "benchmarkability_below_minimum_threshold",
  "contradiction_rate_exceeds_hard_threshold",
  "tool_availability_inadequate_for_workflow",
  "source_coverage_too_low_for_benchmarkable_domain_pack",
] as const;

export const ReadinessStatusSchema = stringEnum(READINESS_STATUSES);
export const ReadinessActionPrioritySchema = stringEnum(READINESS_ACTION_PRIORITIES);
export const ReadinessHardBlockerCodeSchema = stringEnum(READINESS_HARD_BLOCKER_CODES);

export const ReadinessDimensionScoreSchema = Type.Object(
  {
    score: Type.Number({ minimum: 0, maximum: 100 }),
    rationale: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ReadinessDimensionScoresSchema = Type.Object(
  {
    source_quality: ReadinessDimensionScoreSchema,
    source_coverage: ReadinessDimensionScoreSchema,
    contradiction_rate: ReadinessDimensionScoreSchema,
    freshness: ReadinessDimensionScoreSchema,
    rights_sufficiency: ReadinessDimensionScoreSchema,
    task_observability: ReadinessDimensionScoreSchema,
    benchmarkability: ReadinessDimensionScoreSchema,
    measurable_success_criteria: ReadinessDimensionScoreSchema,
    tool_availability: ReadinessDimensionScoreSchema,
  },
  { additionalProperties: false },
);

export const ReadinessHardBlockerSchema = Type.Object(
  {
    blocker_code: ReadinessHardBlockerCodeSchema,
    message: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ReadinessWarningSchema = Type.Object(
  {
    warning_code: IdentifierString,
    message: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ReadinessActionSchema = Type.Object(
  {
    action_id: IdentifierString,
    summary: NonEmptyString,
    priority: ReadinessActionPrioritySchema,
  },
  { additionalProperties: false },
);

export const ReadinessReportSchema = Type.Object(
  {
    readiness_report_id: IdentifierString,
    niche_program_id: IdentifierString,
    status: ReadinessStatusSchema,
    dimension_scores: ReadinessDimensionScoresSchema,
    hard_blockers: Type.Array(ReadinessHardBlockerSchema),
    warnings: Type.Array(ReadinessWarningSchema),
    recommended_next_actions: Type.Array(ReadinessActionSchema),
    generated_at: TimestampString,
  },
  { additionalProperties: false },
);

export type ReadinessStatus = Static<typeof ReadinessStatusSchema>;
export type ReadinessActionPriority = Static<typeof ReadinessActionPrioritySchema>;
export type ReadinessHardBlockerCode = Static<typeof ReadinessHardBlockerCodeSchema>;
export type ReadinessDimensionScore = Static<typeof ReadinessDimensionScoreSchema>;
export type ReadinessDimensionScores = Static<typeof ReadinessDimensionScoresSchema>;
export type ReadinessHardBlocker = Static<typeof ReadinessHardBlockerSchema>;
export type ReadinessWarning = Static<typeof ReadinessWarningSchema>;
export type ReadinessAction = Static<typeof ReadinessActionSchema>;
export type ReadinessReport = Static<typeof ReadinessReportSchema>;

export function hasReadinessHardBlockers(report: ReadinessReport): boolean {
  return report.hard_blockers.length > 0;
}

export function isReadyForSpecialization(report: ReadinessReport): boolean {
  if (report.status === "not_ready") {
    return false;
  }
  return !hasReadinessHardBlockers(report);
}
