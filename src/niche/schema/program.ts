import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import {
  IdentifierString,
  MetricObjectiveSchema,
  NonEmptyString,
  RiskClassSchema,
  SourceKindSchema,
  SpecializationLaneSchema,
  StringListSchema,
} from "./common.js";

export const RuntimeComponentSchema = Type.Object(
  {
    component_id: IdentifierString,
    provider: NonEmptyString,
    model_id: NonEmptyString,
    api_mode: Type.Optional(NonEmptyString),
    notes: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const RuntimeStackSchema = Type.Object(
  {
    planner_runtime: RuntimeComponentSchema,
    retrieval_components: Type.Optional(Type.Array(RuntimeComponentSchema)),
    verifier_components: Type.Optional(Type.Array(RuntimeComponentSchema)),
    specialization_lanes: Type.Array(SpecializationLaneSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const AllowedSourceSchema = Type.Object(
  {
    source_id: IdentifierString,
    source_kind: SourceKindSchema,
    description: Type.Optional(NonEmptyString),
    access_pattern: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const SuccessMetricSchema = Type.Object(
  {
    metric_id: IdentifierString,
    label: NonEmptyString,
    objective: MetricObjectiveSchema,
    target_description: NonEmptyString,
    measurement_method: NonEmptyString,
  },
  { additionalProperties: false },
);

export const RightsAndDataPolicySchema = Type.Object(
  {
    storage_policy: NonEmptyString,
    training_policy: NonEmptyString,
    benchmark_policy: NonEmptyString,
    retention_policy: NonEmptyString,
    redaction_policy: NonEmptyString,
    pii_policy: NonEmptyString,
    live_trace_reuse_policy: NonEmptyString,
    operator_review_required: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const NicheProgramSchema = Type.Object(
  {
    niche_program_id: IdentifierString,
    name: NonEmptyString,
    objective: NonEmptyString,
    risk_class: RiskClassSchema,
    runtime_stack: RuntimeStackSchema,
    allowed_tools: StringListSchema,
    allowed_sources: Type.Array(AllowedSourceSchema, { minItems: 1 }),
    success_metrics: Type.Array(SuccessMetricSchema, { minItems: 1 }),
    rights_and_data_policy: RightsAndDataPolicySchema,
  },
  { additionalProperties: false },
);

export type RuntimeComponent = Static<typeof RuntimeComponentSchema>;
export type RuntimeStack = Static<typeof RuntimeStackSchema>;
export type AllowedSource = Static<typeof AllowedSourceSchema>;
export type SuccessMetric = Static<typeof SuccessMetricSchema>;
export type RightsAndDataPolicy = Static<typeof RightsAndDataPolicySchema>;
export type NicheProgram = Static<typeof NicheProgramSchema>;
