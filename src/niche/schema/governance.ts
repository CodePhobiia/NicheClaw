import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import {
  IdentifierString,
  NonEmptyString,
  TimestampString,
  VersionString,
  stringEnum,
} from "./common.js";
import { ArtifactRefSchema, ArtifactRightsStateSchema, LineageRefSchema } from "./release.js";

export const DATA_ZONES = [
  "train",
  "dev",
  "gold_eval",
  "hidden_eval",
  "shadow_only",
  "quarantined",
] as const;
export const GRADER_TYPES = [
  "deterministic_rule",
  "schema_validator",
  "trace_grader",
  "model_based",
  "sme_review",
  "pairwise_preference",
] as const;
export const ARBITRATION_MODES = [
  "rule_first",
  "hierarchical_override",
  "weighted_vote",
  "sme_required_on_conflict",
] as const;
export const QUARANTINE_REASONS = [
  "unclear_rights",
  "redaction_failed",
  "contradictory_or_corrupted_source",
  "missing_provenance",
  "overlap_with_eval",
] as const;

export const DataZoneSchema = stringEnum(DATA_ZONES);
export const GraderTypeSchema = stringEnum(GRADER_TYPES);
export const ArbitrationModeSchema = stringEnum(ARBITRATION_MODES);
export const QuarantineReasonSchema = stringEnum(QUARANTINE_REASONS);

export const GovernedDataStatusSchema = Type.Object(
  {
    data_zone: DataZoneSchema,
    retention_policy: NonEmptyString,
    redaction_status: NonEmptyString,
    pii_status: NonEmptyString,
    provenance_status: NonEmptyString,
    quarantined: Type.Boolean(),
    quarantine_reason: Type.Optional(QuarantineReasonSchema),
  },
  { additionalProperties: false },
);

export const DerivedRightsStatusSchema = Type.Object(
  {
    rights_state: ArtifactRightsStateSchema,
    inherited_from_lineage: Type.Boolean(),
    authorization_override_id: Type.Optional(IdentifierString),
  },
  { additionalProperties: false },
);

export const GraderArtifactSchema = Type.Object(
  {
    grader_id: IdentifierString,
    grader_type: GraderTypeSchema,
    version: VersionString,
    owner: NonEmptyString,
    calibration_suite_id: IdentifierString,
    prompt_or_rule_hash: NonEmptyString,
    model_runtime_if_applicable: Type.Optional(NonEmptyString),
    decision_schema: NonEmptyString,
    expected_failure_modes: Type.Array(NonEmptyString),
    created_at: TimestampString,
  },
  { additionalProperties: false },
);

export const ArbitrationArtifactSchema = Type.Object(
  {
    arbitration_policy_id: IdentifierString,
    grader_refs: Type.Array(ArtifactRefSchema, { minItems: 1 }),
    conflict_resolution_mode: ArbitrationModeSchema,
    sme_sampling_rate: Type.Number({ minimum: 0, maximum: 1 }),
    promotion_blocking_conflict_types: Type.Array(NonEmptyString, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const RewardArtifactSchema = Type.Object(
  {
    reward_artifact_id: IdentifierString,
    reward_type: NonEmptyString,
    version: VersionString,
    training_inputs: Type.Array(ArtifactRefSchema, { minItems: 1 }),
    calibration_suite_id: IdentifierString,
    lineage_refs: Type.Array(LineageRefSchema, { minItems: 1 }),
    owner: NonEmptyString,
    created_at: TimestampString,
  },
  { additionalProperties: false },
);

export type DataZone = Static<typeof DataZoneSchema>;
export type GraderType = Static<typeof GraderTypeSchema>;
export type ArbitrationMode = Static<typeof ArbitrationModeSchema>;
export type QuarantineReason = Static<typeof QuarantineReasonSchema>;
export type GovernedDataStatus = Static<typeof GovernedDataStatusSchema>;
export type DerivedRightsStatus = Static<typeof DerivedRightsStatusSchema>;
export type GraderArtifact = Static<typeof GraderArtifactSchema>;
export type ArbitrationArtifact = Static<typeof ArbitrationArtifactSchema>;
export type RewardArtifact = Static<typeof RewardArtifactSchema>;
