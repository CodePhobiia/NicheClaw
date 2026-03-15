import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { IdentifierString, NonEmptyString, TimestampString, VersionString } from "./common.js";

export const PlannerDirectivesSchema = Type.Object(
  {
    domain_identity: NonEmptyString,
    reasoning_constraints: Type.Array(Type.String()),
    terminology_guidance: Type.Array(Type.String()),
    task_decomposition_hints: Type.Array(Type.String()),
    failure_awareness: Type.Array(Type.String()),
    evidence_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const ToolDirectiveSchema = Type.Object(
  {
    tool_name: NonEmptyString,
    domain_relevance_score: Type.Number({ minimum: 0, maximum: 1 }),
    preferred_arguments: Type.Record(Type.String(), Type.String()),
    domain_intent: NonEmptyString,
    failure_modes: Type.Array(Type.String()),
    required_arguments: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const SignalPatternSchema = Type.Object(
  {
    source_id: NonEmptyString,
    pattern_description: NonEmptyString,
    extraction_hint: NonEmptyString,
  },
  { additionalProperties: false },
);

export const FailureIndicatorSchema = Type.Object(
  {
    failure_id: NonEmptyString,
    detection_hints: Type.Array(Type.String()),
    severity: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ObservationDirectiveSchema = Type.Object(
  {
    signal_patterns: Type.Array(SignalPatternSchema),
    failure_indicators: Type.Array(FailureIndicatorSchema),
  },
  { additionalProperties: false },
);

export const RetrievalDirectiveSchema = Type.Object(
  {
    approved_source_ids: Type.Array(Type.String()),
    source_descriptions: Type.Record(Type.String(), Type.String()),
    freshness_expectations: Type.Record(Type.String(), Type.String()),
  },
  { additionalProperties: false },
);

export const ExemplarDirectiveSchema = Type.Object(
  {
    seed_id: NonEmptyString,
    task_family_id: NonEmptyString,
    prompt: NonEmptyString,
    pass_conditions: Type.Array(Type.String()),
    hard_fail_conditions: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const ConstraintEnforcementDirectiveSchema = Type.Object(
  {
    constraint_id: NonEmptyString,
    category: NonEmptyString,
    rule: NonEmptyString,
    severity: NonEmptyString,
    rationale: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const CompiledDomainConfigSchema = Type.Object(
  {
    niche_program_id: IdentifierString,
    domain_pack_id: IdentifierString,
    version: VersionString,
    compiled_at: TimestampString,
    planner: PlannerDirectivesSchema,
    tools: Type.Array(ToolDirectiveSchema),
    observation: ObservationDirectiveSchema,
    retrieval: RetrievalDirectiveSchema,
    exemplars: Type.Array(ExemplarDirectiveSchema),
    constraints: Type.Array(ConstraintEnforcementDirectiveSchema),
  },
  { additionalProperties: false },
);

export type CompiledDomainConfigSchemaType = Static<typeof CompiledDomainConfigSchema>;
