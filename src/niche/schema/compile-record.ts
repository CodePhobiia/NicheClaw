import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { IdentifierString, TimestampString, VersionString } from "./common.js";
import { CompiledDomainConfigSchema } from "./compiled-domain-config.js";
import { DomainPackSchema } from "./domain-pack.js";
import { SourceAccessManifestSchema } from "./manifests.js";
import { ReadinessReportSchema } from "./readiness.js";
import { ArtifactRefSchema } from "./release.js";
import { CompilerBenchmarkSeedHintSchema, NormalizedSourceRecordSchema } from "./source-ingest.js";

export const NicheCompilationRecordSchema = Type.Object(
  {
    compilation_id: IdentifierString,
    niche_program_id: IdentifierString,
    version: VersionString,
    compiled_at: TimestampString,
    domain_pack: DomainPackSchema,
    source_access_manifest: SourceAccessManifestSchema,
    readiness_report: ReadinessReportSchema,
    normalized_sources: Type.Array(NormalizedSourceRecordSchema, { minItems: 1 }),
    benchmark_seed_hints: Type.Array(CompilerBenchmarkSeedHintSchema, { minItems: 1 }),
    source_artifact_refs: Type.Array(ArtifactRefSchema, { minItems: 1 }),
    compiled_domain_pack_artifact_ref: ArtifactRefSchema,
    compiled_domain_config: Type.Optional(CompiledDomainConfigSchema),
  },
  { additionalProperties: false },
);

export type NicheCompilationRecord = Static<typeof NicheCompilationRecordSchema>;
