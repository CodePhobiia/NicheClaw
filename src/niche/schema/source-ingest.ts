import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import {
  IdentifierString,
  NonEmptyString,
  OptionalStringListSchema,
  SourceKindSchema,
  TimestampString,
} from "./common.js";
import { GovernedDataStatusSchema } from "./governance.js";

export const SourceInputKindSchema = Type.Union([
  Type.Literal("local_file"),
  Type.Literal("repo_asset"),
  Type.Literal("structured_text"),
  Type.Literal("benchmark_seed"),
]);

export const SourceRightsMetadataSchema = Type.Object(
  {
    rights_to_store: Type.Boolean(),
    rights_to_train: Type.Boolean(),
    rights_to_benchmark: Type.Boolean(),
    rights_to_derive: Type.Boolean(),
    rights_to_distill: Type.Boolean(),
    rights_to_generate_synthetic_from: Type.Boolean(),
    retention_policy: NonEmptyString,
    redaction_status: NonEmptyString,
    pii_status: NonEmptyString,
    provenance_status: NonEmptyString,
    data_zone: Type.Union([
      Type.Literal("train"),
      Type.Literal("dev"),
      Type.Literal("gold_eval"),
      Type.Literal("hidden_eval"),
      Type.Literal("shadow_only"),
      Type.Literal("quarantined"),
    ]),
    quarantined: Type.Optional(Type.Boolean()),
    quarantine_reason: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const SourceProvenanceSchema = Type.Object(
  {
    source_uri: NonEmptyString,
    ingested_at: TimestampString,
    repo_root: Type.Optional(NonEmptyString),
    relative_path: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

const SourceDescriptorBaseFields = {
  sourceId: IdentifierString,
  sourceKind: SourceKindSchema,
  title: NonEmptyString,
  accessPattern: NonEmptyString,
  rights: SourceRightsMetadataSchema,
  freshnessExpectation: Type.Optional(NonEmptyString),
  trustNotes: Type.Optional(NonEmptyString),
} as const;

export const LocalFileSourceDescriptorSchema = Type.Object(
  {
    ...SourceDescriptorBaseFields,
    inputKind: Type.Literal("local_file"),
    filePath: NonEmptyString,
  },
  { additionalProperties: false },
);

export const RepoAssetSourceDescriptorSchema = Type.Object(
  {
    ...SourceDescriptorBaseFields,
    inputKind: Type.Literal("repo_asset"),
    repoRoot: NonEmptyString,
    repoRelativePath: NonEmptyString,
  },
  { additionalProperties: false },
);

export const StructuredTextSourceDescriptorSchema = Type.Object(
  {
    ...SourceDescriptorBaseFields,
    inputKind: Type.Literal("structured_text"),
    text: NonEmptyString,
  },
  { additionalProperties: false },
);

export const BenchmarkSeedSourceDescriptorSchema = Type.Object(
  {
    ...SourceDescriptorBaseFields,
    inputKind: Type.Literal("benchmark_seed"),
    prompt: NonEmptyString,
    taskFamilyId: IdentifierString,
    passConditions: OptionalStringListSchema,
    hardFailConditions: OptionalStringListSchema,
  },
  { additionalProperties: false },
);

export const NormalizedBenchmarkSeedSchema = Type.Object(
  {
    prompt: NonEmptyString,
    taskFamilyId: IdentifierString,
    passConditions: OptionalStringListSchema,
    hardFailConditions: OptionalStringListSchema,
  },
  { additionalProperties: false },
);

export const NormalizedSourceRecordSchema = Type.Object(
  {
    sourceId: IdentifierString,
    sourceKind: SourceKindSchema,
    inputKind: SourceInputKindSchema,
    title: NonEmptyString,
    accessPattern: NonEmptyString,
    normalizedContent: NonEmptyString,
    rights: SourceRightsMetadataSchema,
    provenance: SourceProvenanceSchema,
    governedDataStatus: GovernedDataStatusSchema,
    freshnessExpectation: Type.Optional(NonEmptyString),
    trustNotes: Type.Optional(NonEmptyString),
    benchmarkSeed: Type.Optional(NormalizedBenchmarkSeedSchema),
  },
  { additionalProperties: false },
);

export const CompilerBenchmarkSeedHintSchema = Type.Object(
  {
    seedId: IdentifierString,
    taskFamilyId: IdentifierString,
    prompt: NonEmptyString,
    sourceRefs: Type.Array(IdentifierString, { minItems: 1 }),
    passConditions: Type.Array(NonEmptyString, { minItems: 1 }),
    hardFailConditions: OptionalStringListSchema,
  },
  { additionalProperties: false },
);

export type SourceInputKind = Static<typeof SourceInputKindSchema>;
export type SourceRightsMetadata = Static<typeof SourceRightsMetadataSchema>;
export type SourceProvenance = Static<typeof SourceProvenanceSchema>;
export type LocalFileSourceDescriptor = Static<typeof LocalFileSourceDescriptorSchema>;
export type RepoAssetSourceDescriptor = Static<typeof RepoAssetSourceDescriptorSchema>;
export type StructuredTextSourceDescriptor = Static<typeof StructuredTextSourceDescriptorSchema>;
export type BenchmarkSeedSourceDescriptor = Static<typeof BenchmarkSeedSourceDescriptorSchema>;
export type NormalizedSourceRecord = Static<typeof NormalizedSourceRecordSchema>;
export type CompilerBenchmarkSeedHint = Static<typeof CompilerBenchmarkSeedHintSchema>;
