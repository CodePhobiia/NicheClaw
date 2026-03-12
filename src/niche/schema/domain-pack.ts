import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import {
  IdentifierString,
  IdLabelDescriptionSchema,
  NonEmptyString,
  RiskClassSchema,
  SourceKindSchema,
  StringListSchema,
  VersionString,
} from "./common.js";

export const OntologyRelationSchema = Type.Object(
  {
    relation_id: IdentifierString,
    source_concept_id: IdentifierString,
    target_concept_id: IdentifierString,
    relation_type: NonEmptyString,
    description: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const OntologySchema = Type.Object(
  {
    concepts: Type.Array(IdLabelDescriptionSchema, { minItems: 1 }),
    relations: Type.Array(OntologyRelationSchema),
  },
  { additionalProperties: false },
);

export const TaskFamilySchema = Type.Object(
  {
    task_family_id: IdentifierString,
    label: NonEmptyString,
    description: Type.Optional(NonEmptyString),
    benchmarkable: Type.Boolean(),
    required_capabilities: Type.Array(NonEmptyString),
  },
  { additionalProperties: false },
);

export const TerminologyEntrySchema = Type.Object(
  {
    canonical_term: NonEmptyString,
    synonyms: Type.Array(NonEmptyString),
    definition: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const TerminologyMapSchema = Type.Record(Type.String(), TerminologyEntrySchema);

export const DomainConstraintSchema = Type.Object(
  {
    constraint_id: IdentifierString,
    category: NonEmptyString,
    rule: NonEmptyString,
    rationale: Type.Optional(NonEmptyString),
    severity: RiskClassSchema,
  },
  { additionalProperties: false },
);

export const ToolContractSchema = Type.Object(
  {
    tool_name: NonEmptyString,
    intent_summary: NonEmptyString,
    required_arguments: Type.Array(NonEmptyString),
    optional_arguments: Type.Array(NonEmptyString),
    failure_modes: Type.Array(IdentifierString),
  },
  { additionalProperties: false },
);

export const EvidenceSourceSchema = Type.Object(
  {
    source_id: IdentifierString,
    source_kind: SourceKindSchema,
    title: NonEmptyString,
    access_pattern: NonEmptyString,
    freshness_expectation: Type.Optional(NonEmptyString),
    trust_notes: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const FailureModeSchema = Type.Object(
  {
    failure_id: IdentifierString,
    label: NonEmptyString,
    description: NonEmptyString,
    severity: RiskClassSchema,
    detection_hints: Type.Array(NonEmptyString),
  },
  { additionalProperties: false },
);

export const VerifierDefaultsSchema = Type.Object(
  {
    required_checks: StringListSchema,
    blocking_failure_ids: Type.Array(IdentifierString),
    output_requirements: Type.Array(NonEmptyString),
    escalation_policy: NonEmptyString,
  },
  { additionalProperties: false },
);

export const BenchmarkSeedSpecSchema = Type.Object(
  {
    seed_id: IdentifierString,
    task_family_id: IdentifierString,
    prompt: NonEmptyString,
    source_refs: Type.Array(IdentifierString, { minItems: 1 }),
    pass_conditions: Type.Array(NonEmptyString, { minItems: 1 }),
    hard_fail_conditions: Type.Array(NonEmptyString),
  },
  { additionalProperties: false },
);

export const DomainPackSchema = Type.Object(
  {
    domain_pack_id: IdentifierString,
    niche_program_id: IdentifierString,
    version: VersionString,
    ontology: OntologySchema,
    task_taxonomy: Type.Array(TaskFamilySchema, { minItems: 1 }),
    terminology_map: TerminologyMapSchema,
    constraints: Type.Array(DomainConstraintSchema, { minItems: 1 }),
    tool_contracts: Type.Array(ToolContractSchema, { minItems: 1 }),
    evidence_source_registry: Type.Array(EvidenceSourceSchema, { minItems: 1 }),
    failure_taxonomy: Type.Array(FailureModeSchema, { minItems: 1 }),
    verifier_defaults: VerifierDefaultsSchema,
    benchmark_seed_specs: Type.Array(BenchmarkSeedSpecSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export type OntologyRelation = Static<typeof OntologyRelationSchema>;
export type Ontology = Static<typeof OntologySchema>;
export type TaskFamily = Static<typeof TaskFamilySchema>;
export type TerminologyEntry = Static<typeof TerminologyEntrySchema>;
export type DomainConstraint = Static<typeof DomainConstraintSchema>;
export type ToolContract = Static<typeof ToolContractSchema>;
export type EvidenceSource = Static<typeof EvidenceSourceSchema>;
export type FailureMode = Static<typeof FailureModeSchema>;
export type VerifierDefaults = Static<typeof VerifierDefaultsSchema>;
export type BenchmarkSeedSpec = Static<typeof BenchmarkSeedSpecSchema>;
export type DomainPack = Static<typeof DomainPackSchema>;
