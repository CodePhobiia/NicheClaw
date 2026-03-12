import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { optionalStringEnum, stringEnum } from "../../agents/schema/typebox.js";

export { optionalStringEnum, stringEnum };

export const NICHE_IDENTIFIER_PATTERN = "^[a-z0-9]+(?:[._-][a-z0-9]+)*$";
export const NICHE_VERSION_PATTERN = "^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$";
export const NICHE_HASH_PATTERN = "^[A-Fa-f0-9]{32,128}$";
export const ISO_8601_UTC_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";

export const NonEmptyString = Type.String({ minLength: 1 });
export const IdentifierString = Type.String({
  minLength: 1,
  pattern: NICHE_IDENTIFIER_PATTERN,
});
export const VersionString = Type.String({
  minLength: 1,
  pattern: NICHE_VERSION_PATTERN,
});
export const HashString = Type.String({
  minLength: 32,
  pattern: NICHE_HASH_PATTERN,
});
export const TimestampString = Type.String({
  minLength: 20,
  pattern: ISO_8601_UTC_PATTERN,
});

export const RISK_CLASS_VALUES = ["low", "moderate", "high"] as const;
export const SPECIALIZATION_LANES = [
  "system_specialization",
  "distillation",
  "provider_native_customization",
  "prompt_policy_assets",
] as const;
export const SOURCE_KINDS = [
  "documents",
  "websites",
  "repos",
  "logs",
  "datasets",
  "tool_schemas",
  "past_task_traces",
  "human_examples",
  "domain_constraints",
  "live_sources",
] as const;
export const METRIC_OBJECTIVES = ["maximize", "minimize", "target"] as const;

export const RiskClassSchema = stringEnum(RISK_CLASS_VALUES);
export const SpecializationLaneSchema = stringEnum(SPECIALIZATION_LANES);
export const SourceKindSchema = stringEnum(SOURCE_KINDS);
export const MetricObjectiveSchema = stringEnum(METRIC_OBJECTIVES);

export const IdLabelDescriptionSchema = Type.Object(
  {
    id: IdentifierString,
    label: NonEmptyString,
    description: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const StringListSchema = Type.Array(NonEmptyString, { minItems: 1 });
export const OptionalStringListSchema = Type.Array(NonEmptyString);
export const StringMapSchema = Type.Record(Type.String(), NonEmptyString);

export const KeyedMetadataEntrySchema = Type.Object(
  {
    key: IdentifierString,
    value: NonEmptyString,
    description: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export type Identifier = Static<typeof IdentifierString>;
export type Version = Static<typeof VersionString>;
export type Hash = Static<typeof HashString>;
export type Timestamp = Static<typeof TimestampString>;
export type RiskClass = Static<typeof RiskClassSchema>;
export type SpecializationLane = Static<typeof SpecializationLaneSchema>;
export type SourceKind = Static<typeof SourceKindSchema>;
export type MetricObjective = Static<typeof MetricObjectiveSchema>;
export type IdLabelDescription = Static<typeof IdLabelDescriptionSchema>;
export type KeyedMetadataEntry = Static<typeof KeyedMetadataEntrySchema>;
