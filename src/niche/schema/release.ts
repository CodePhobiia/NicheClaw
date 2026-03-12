import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { BenchmarkResultSummarySchema } from "./benchmark.js";
import {
  HashString,
  IdentifierString,
  NonEmptyString,
  TimestampString,
  VersionString,
  stringEnum,
} from "./common.js";

export const ARTIFACT_TYPES = [
  "domain_pack",
  "run_trace",
  "dataset",
  "eval_case",
  "episode_case",
  "grader",
  "reward",
  "prompt_asset",
  "retrieval_stack",
  "verifier_pack",
  "action_policy",
  "candidate_recipe",
  "student_model",
  "release_bundle",
] as const;
export const CANDIDATE_RELEASE_DECISIONS = [
  "promoted",
  "rejected",
  "shadow",
  "canary",
  "experimental",
] as const;

export const ArtifactTypeSchema = stringEnum(ARTIFACT_TYPES);
export const CandidateReleaseDecisionSchema = stringEnum(CANDIDATE_RELEASE_DECISIONS);

export const ArtifactRightsStateSchema = Type.Object(
  {
    rights_to_store: Type.Boolean(),
    rights_to_train: Type.Boolean(),
    rights_to_benchmark: Type.Boolean(),
    rights_to_derive: Type.Boolean(),
    rights_to_distill: Type.Boolean(),
    rights_to_generate_synthetic_from: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const LineageRefSchema = Type.Object(
  {
    parent_artifact_id: IdentifierString,
    relationship: NonEmptyString,
    derivation_step: NonEmptyString,
    notes: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ArtifactRefSchema = Type.Object(
  {
    artifact_id: IdentifierString,
    artifact_type: ArtifactTypeSchema,
    version: VersionString,
    content_hash: HashString,
    rights_state: ArtifactRightsStateSchema,
    created_at: TimestampString,
  },
  { additionalProperties: false },
);

export const ArtifactSchema = Type.Object(
  {
    artifact_id: IdentifierString,
    artifact_type: ArtifactTypeSchema,
    version: VersionString,
    producer: NonEmptyString,
    source_trace_refs: Type.Array(IdentifierString),
    dataset_refs: Type.Array(IdentifierString),
    metrics: Type.Record(Type.String(), Type.Number()),
    created_at: TimestampString,
    lineage: Type.Array(LineageRefSchema),
  },
  { additionalProperties: false },
);

export const CandidateRecipeStepSchema = Type.Object(
  {
    step_id: IdentifierString,
    summary: NonEmptyString,
    output_artifact_refs: Type.Array(ArtifactRefSchema),
  },
  { additionalProperties: false },
);

const HyperparameterValueSchema = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  Type.Null(),
]);

export const CandidateRecipeSchema = Type.Object(
  {
    candidate_recipe_id: IdentifierString,
    niche_program_id: IdentifierString,
    created_at: TimestampString,
    recipe_type: NonEmptyString,
    teacher_runtimes: Type.Array(NonEmptyString, { minItems: 1 }),
    input_dataset_refs: Type.Array(ArtifactRefSchema, { minItems: 1 }),
    synthesis_prompt_refs: Type.Array(ArtifactRefSchema),
    distillation_steps: Type.Array(CandidateRecipeStepSchema),
    sidecar_training_steps: Type.Array(CandidateRecipeStepSchema),
    verifier_training_steps: Type.Array(CandidateRecipeStepSchema),
    retrieval_optimization_steps: Type.Array(CandidateRecipeStepSchema),
    hyperparameters: Type.Record(Type.String(), HyperparameterValueSchema),
    grader_refs: Type.Array(ArtifactRefSchema, { minItems: 1 }),
    evaluation_inputs: Type.Array(ArtifactRefSchema, { minItems: 1 }),
    promotion_inputs: Type.Array(ArtifactRefSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const CandidateStackManifestSchema = Type.Object(
  {
    baseline_manifest_id: Type.Optional(IdentifierString),
    candidate_manifest_id: IdentifierString,
    component_artifact_refs: Type.Array(ArtifactRefSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const CandidateReleaseSchema = Type.Object(
  {
    candidate_release_id: IdentifierString,
    niche_program_id: IdentifierString,
    baseline_release_id: IdentifierString,
    stack_manifest: CandidateStackManifestSchema,
    benchmark_results: Type.Array(BenchmarkResultSummarySchema, { minItems: 1 }),
    shadow_results: Type.Array(BenchmarkResultSummarySchema),
    decision: CandidateReleaseDecisionSchema,
    decision_reason: NonEmptyString,
    approved_by: Type.Array(NonEmptyString, { minItems: 1 }),
    rollback_target: IdentifierString,
  },
  { additionalProperties: false },
);

export const MonitorPolicySchema = Type.Object(
  {
    policy_id: IdentifierString,
    summary: NonEmptyString,
  },
  { additionalProperties: false },
);

export const DriftThresholdSetSchema = Type.Object(
  {
    task_success_drift: Type.Number({ minimum: 0 }),
    task_family_drift: Type.Number({ minimum: 0 }),
    verifier_false_veto_drift: Type.Number({ minimum: 0 }),
    grader_disagreement_drift: Type.Number({ minimum: 0 }),
    source_freshness_decay: Type.Number({ minimum: 0 }),
    latency_cost_drift: Type.Number({ minimum: 0 }),
    hard_fail_drift: Type.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const PromotedReleaseMonitorSchema = Type.Object(
  {
    promoted_release_id: IdentifierString,
    baseline_manifest_id: IdentifierString,
    candidate_manifest_id: IdentifierString,
    shadow_recheck_policy: MonitorPolicySchema,
    drift_thresholds: DriftThresholdSetSchema,
    verifier_drift_thresholds: DriftThresholdSetSchema,
    grader_drift_thresholds: DriftThresholdSetSchema,
    freshness_decay_policy: MonitorPolicySchema,
    rollback_policy: MonitorPolicySchema,
  },
  { additionalProperties: false },
);

export type ArtifactType = Static<typeof ArtifactTypeSchema>;
export type CandidateReleaseDecision = Static<typeof CandidateReleaseDecisionSchema>;
export type ArtifactRightsState = Static<typeof ArtifactRightsStateSchema>;
export type LineageRef = Static<typeof LineageRefSchema>;
export type ArtifactRef = Static<typeof ArtifactRefSchema>;
export type Artifact = Static<typeof ArtifactSchema>;
export type CandidateRecipeStep = Static<typeof CandidateRecipeStepSchema>;
export type CandidateRecipe = Static<typeof CandidateRecipeSchema>;
export type CandidateStackManifest = Static<typeof CandidateStackManifestSchema>;
export type CandidateRelease = Static<typeof CandidateReleaseSchema>;
export type MonitorPolicy = Static<typeof MonitorPolicySchema>;
export type DriftThresholdSet = Static<typeof DriftThresholdSetSchema>;
export type PromotedReleaseMonitor = Static<typeof PromotedReleaseMonitorSchema>;
