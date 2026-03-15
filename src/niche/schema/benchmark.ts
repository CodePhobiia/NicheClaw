import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import {
  HashString,
  IdentifierString,
  NonEmptyString,
  TimestampString,
  stringEnum,
} from "./common.js";
import { ManifestProviderMetadataQualitySchema } from "./manifests.js";

export const BENCHMARK_CASE_KINDS = ["atomic_case", "episode_case"] as const;
export const BENCHMARK_MODES = [
  "offline_gold",
  "offline_shadow",
  "live_shadow",
  "live_canary",
] as const;
export const BENCHMARK_SPLITS = [
  "train",
  "dev",
  "gold_eval",
  "hidden_eval",
  "shadow_only",
  "quarantined",
] as const;
export const BENCHMARK_ARM_KINDS = ["baseline", "candidate"] as const;
export const CLOCK_MODES = ["time_frozen", "time_simulated", "time_live"] as const;
export const CACHE_MODES = ["cold", "warm", "fixed_snapshot"] as const;

export const BenchmarkCaseKindSchema = stringEnum(BENCHMARK_CASE_KINDS);
export const BenchmarkModeSchema = stringEnum(BENCHMARK_MODES);
export const BenchmarkSplitSchema = stringEnum(BENCHMARK_SPLITS);
export const BenchmarkArmKindSchema = stringEnum(BENCHMARK_ARM_KINDS);
export const ClockModeSchema = stringEnum(CLOCK_MODES);
export const CacheModeSchema = stringEnum(CACHE_MODES);

export const BenchmarkSourceModeSchema = Type.String({ minLength: 1 });
export const BenchmarkNetworkModeSchema = Type.String({ minLength: 1 });
export const BenchmarkSeedPolicySchema = Type.String({ minLength: 1 });
export const BenchmarkEnvironmentSnapshotPolicySchema = Type.String({ minLength: 1 });

export const BenchmarkGraderSpecSchema = Type.Object(
  {
    grader_refs: Type.Array(IdentifierString, { minItems: 1 }),
    primary_metric: IdentifierString,
    notes: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const EvalCaseSchema = Type.Object(
  {
    eval_case_id: IdentifierString,
    suite_id: IdentifierString,
    split: BenchmarkSplitSchema,
    task_family: IdentifierString,
    input: Type.Unknown(),
    allowed_tools: Type.Array(NonEmptyString, { minItems: 1 }),
    allowed_sources: Type.Array(IdentifierString, { minItems: 1 }),
    grader_spec: BenchmarkGraderSpecSchema,
    pass_conditions: Type.Array(NonEmptyString, { minItems: 1 }),
    hard_fail_conditions: Type.Array(NonEmptyString),
    difficulty: Type.Integer({ minimum: 0 }),
    seed: NonEmptyString,
  },
  { additionalProperties: false },
);

export const EpisodeCaseSchema = Type.Object(
  {
    episode_case_id: IdentifierString,
    suite_id: IdentifierString,
    split: BenchmarkSplitSchema,
    task_family: IdentifierString,
    initial_state: Type.Unknown(),
    allowed_tools: Type.Array(NonEmptyString, { minItems: 1 }),
    allowed_sources: Type.Array(IdentifierString, { minItems: 1 }),
    step_constraints: Type.Array(NonEmptyString, { minItems: 1 }),
    termination_conditions: Type.Array(NonEmptyString, { minItems: 1 }),
    grader_spec: BenchmarkGraderSpecSchema,
    hard_fail_conditions: Type.Array(NonEmptyString),
    difficulty: Type.Integer({ minimum: 0 }),
    seed: NonEmptyString,
  },
  { additionalProperties: false },
);

export const DeterminismRuntimePolicySchema = Type.Object(
  {
    determinism_policy_id: IdentifierString,
    source_mode: BenchmarkSourceModeSchema,
    cache_mode: CacheModeSchema,
    clock_mode: ClockModeSchema,
    network_mode: BenchmarkNetworkModeSchema,
    seed_policy: BenchmarkSeedPolicySchema,
    environment_snapshot_policy: BenchmarkEnvironmentSnapshotPolicySchema,
  },
  { additionalProperties: false },
);

export const BenchmarkSuiteMetadataSchema = Type.Object(
  {
    benchmark_suite_id: IdentifierString,
    case_kind: BenchmarkCaseKindSchema,
    mode: BenchmarkModeSchema,
    split: BenchmarkSplitSchema,
    created_at: TimestampString,
    suite_version: NonEmptyString,
    suite_hash: HashString,
    fixture_version: NonEmptyString,
    determinism_policy_id: IdentifierString,
    task_families: Type.Array(IdentifierString, { minItems: 1 }),
    description: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const BenchmarkArmIdentifierSchema = Type.Object(
  {
    benchmark_arm_id: IdentifierString,
    benchmark_suite_id: IdentifierString,
    manifest_id: IdentifierString,
    arm_kind: BenchmarkArmKindSchema,
    mode: BenchmarkModeSchema,
  },
  { additionalProperties: false },
);

export const PairedDeltaSummarySchema = Type.Object(
  {
    mean_delta: Type.Number(),
    median_delta: Type.Number(),
    p10_delta: Type.Number(),
    p90_delta: Type.Number(),
    confidence_interval_low: Type.Number(),
    confidence_interval_high: Type.Number(),
  },
  { additionalProperties: false },
);

export const BenchmarkTaskFamilySummarySchema = Type.Object(
  {
    task_family: IdentifierString,
    case_count: Type.Integer({ minimum: 0 }),
    score_mean: Type.Number(),
    hard_fail_rate: Type.Number({ minimum: 0 }),
    mean_delta: Type.Number(),
  },
  { additionalProperties: false },
);

export const ContaminationAuditSummarySchema = Type.Object(
  {
    contamination_detected: Type.Boolean(),
    audited_case_count: Type.Integer({ minimum: 0 }),
    notes: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const BenchmarkArbitrationOutcomeSummarySchema = Type.Object(
  {
    arbitration_policy_id: IdentifierString,
    unresolved_blocking_conflicts: Type.Boolean(),
    unresolved_conflict_count: Type.Integer({ minimum: 0 }),
    blocking_conflict_types: Type.Array(NonEmptyString),
    summary: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const BenchmarkResultSummarySchema = Type.Object(
  {
    benchmark_result_id: IdentifierString,
    benchmark_suite_id: IdentifierString,
    case_kind: BenchmarkCaseKindSchema,
    mode: BenchmarkModeSchema,
    baseline_arm_id: IdentifierString,
    candidate_arm_id: IdentifierString,
    baseline_provider_metadata_quality: ManifestProviderMetadataQualitySchema,
    candidate_provider_metadata_quality: ManifestProviderMetadataQualitySchema,
    primary_metric: IdentifierString,
    case_count: Type.Integer({ minimum: 0 }),
    paired_delta_summary: PairedDeltaSummarySchema,
    task_family_summaries: Type.Array(BenchmarkTaskFamilySummarySchema, { minItems: 1 }),
    contamination_audit_summary: ContaminationAuditSummarySchema,
    invalidated: Type.Boolean(),
    invalidation_reasons: Type.Array(NonEmptyString),
  },
  { additionalProperties: false },
);

export const BenchmarkResultRecordSchema = Type.Object(
  {
    benchmark_result_record_id: IdentifierString,
    summary: BenchmarkResultSummarySchema,
    baseline_manifest_id: IdentifierString,
    candidate_manifest_id: IdentifierString,
    baseline_template_manifest_id: Type.Optional(IdentifierString),
    candidate_template_manifest_id: Type.Optional(IdentifierString),
    suite_hash: HashString,
    fixture_version: NonEmptyString,
    actual_suite_hash: HashString,
    actual_fixture_version: NonEmptyString,
    actual_grader_version: Type.Optional(NonEmptyString),
    case_membership_hash: HashString,
    run_trace_refs: Type.Array(IdentifierString),
    replay_bundle_refs: Type.Array(IdentifierString),
    evidence_bundle_ids: Type.Array(IdentifierString),
    arbitration_outcome_summary: Type.Optional(BenchmarkArbitrationOutcomeSummarySchema),
    created_at: TimestampString,
  },
  { additionalProperties: false },
);

export type BenchmarkCaseKind = Static<typeof BenchmarkCaseKindSchema>;
export type BenchmarkMode = Static<typeof BenchmarkModeSchema>;
export type BenchmarkSplit = Static<typeof BenchmarkSplitSchema>;
export type BenchmarkArmKind = Static<typeof BenchmarkArmKindSchema>;
export type ClockMode = Static<typeof ClockModeSchema>;
export type CacheMode = Static<typeof CacheModeSchema>;
export type BenchmarkGraderSpec = Static<typeof BenchmarkGraderSpecSchema>;
export type EvalCase = Static<typeof EvalCaseSchema>;
export type EpisodeCase = Static<typeof EpisodeCaseSchema>;
export type DeterminismRuntimePolicy = Static<typeof DeterminismRuntimePolicySchema>;
export type BenchmarkSuiteMetadata = Static<typeof BenchmarkSuiteMetadataSchema>;
export type BenchmarkArmIdentifier = Static<typeof BenchmarkArmIdentifierSchema>;
export type PairedDeltaSummary = Static<typeof PairedDeltaSummarySchema>;
export type BenchmarkTaskFamilySummary = Static<typeof BenchmarkTaskFamilySummarySchema>;
export type ContaminationAuditSummary = Static<typeof ContaminationAuditSummarySchema>;
export type BenchmarkArbitrationOutcomeSummary = Static<
  typeof BenchmarkArbitrationOutcomeSummarySchema
>;
export type BenchmarkResultSummary = Static<typeof BenchmarkResultSummarySchema>;
export type BenchmarkResultRecord = Static<typeof BenchmarkResultRecordSchema>;
