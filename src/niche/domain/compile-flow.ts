import { computeStableContentHash } from "../benchmark/index.js";
import type {
  ArtifactRightsState,
  CompilerBenchmarkSeedHint,
  NicheCompilationRecord,
  NicheProgram,
  NormalizedSourceRecord,
  SourceAccessManifest,
} from "../schema/index.js";
import { SOURCE_KINDS } from "../schema/index.js";
import {
  ensureStoredNicheCompilationRecord,
  ensureStoredSourceAccessManifest,
  saveReadinessReport,
} from "../store/index.js";
import { compileDomainConfig, type CompiledDomainConfig } from "./compiled-config.js";
import { compileDomainPack, materializeCompiledDomainPackArtifact } from "./compiler.js";
import { evaluateReadinessGate } from "./readiness-gate.js";
import { propagateDerivedRights } from "./rights-propagation.js";
import {
  materializeNormalizedSourceArtifacts,
  normalizeSourceDescriptors,
} from "./source-ingest.js";
import type { SourceDescriptor } from "./source-types.js";

const ALLOWED_COMPILATION_DATA_ZONES = new Set(["train", "dev"]);

function assertCompilationSourcesAllowed(sources: NormalizedSourceRecord[]): void {
  for (const source of sources) {
    if (!source.rights.rights_to_store) {
      throw new Error(
        `Source ${source.sourceId} cannot be compiled because rights_to_store is false.`,
      );
    }
    if (!ALLOWED_COMPILATION_DATA_ZONES.has(source.rights.data_zone)) {
      throw new Error(
        `Source ${source.sourceId} cannot be compiled from data zone ${source.rights.data_zone}.`,
      );
    }
    if (source.governedDataStatus.quarantined) {
      throw new Error(`Source ${source.sourceId} is quarantined and cannot be compiled.`);
    }
  }
}

function resolveCompilationVersion(params: {
  nicheProgram: NicheProgram;
  normalizedSources: NormalizedSourceRecord[];
  requestedVersion?: string;
}): string {
  if (params.requestedVersion?.trim()) {
    return params.requestedVersion.trim();
  }
  return `compile-${computeStableContentHash({
    niche_program_id: params.nicheProgram.niche_program_id,
    sources: params.normalizedSources.map((source) => ({
      sourceId: source.sourceId,
      normalizedContent: source.normalizedContent,
      rights: source.rights,
    })),
  }).slice(0, 12)}`;
}

function buildSourceAccessManifest(params: {
  nicheProgram: NicheProgram;
  normalizedSources: NormalizedSourceRecord[];
  version: string;
}): SourceAccessManifest {
  const allowedLiveSources = params.normalizedSources
    .filter((source) => source.sourceKind === "live_sources")
    .map((source) => source.sourceId)
    .toSorted((left, right) => left.localeCompare(right));
  return {
    source_access_manifest_id: `${params.nicheProgram.niche_program_id}-source-access-${computeStableContentHash(
      {
        niche_program_id: params.nicheProgram.niche_program_id,
        version: params.version,
        source_ids: params.normalizedSources.map((source) => source.sourceId),
      },
    ).slice(0, 12)}`,
    allowed_tools: [...params.nicheProgram.allowed_tools].toSorted((left, right) =>
      left.localeCompare(right),
    ),
    allowed_retrieval_indices: params.normalizedSources
      .map((source) => source.sourceId)
      .toSorted((left, right) => left.localeCompare(right)),
    allowed_live_sources: allowedLiveSources,
    disallowed_sources: [],
    sandbox_policy: "workspace_only",
    network_policy: allowedLiveSources.length > 0 ? "restricted_live_sources" : "deny",
    approval_policy: params.nicheProgram.rights_and_data_policy.operator_review_required
      ? "operator_review_required"
      : "operator_optional",
  };
}

function computeRightsSufficiencyScore(rightsState: ArtifactRightsState): number {
  const checks = [
    rightsState.rights_to_store,
    rightsState.rights_to_train,
    rightsState.rights_to_benchmark,
    rightsState.rights_to_derive,
    rightsState.rights_to_distill,
    rightsState.rights_to_generate_synthetic_from,
  ];
  const passing = checks.filter(Boolean).length;
  return Math.round((passing / checks.length) * 100);
}

// Pairwise token overlap with contradictory metadata signals contradiction pressure.
function computeContradictionRate(sources: NormalizedSourceRecord[]): number {
  if (sources.length < 2) return 0;
  let contradictions = 0;
  let pairs = 0;
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      pairs++;
      const tokensA = new Set(
        sources[i].normalizedContent
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 3),
      );
      const tokensB = new Set(
        sources[j].normalizedContent
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 3),
      );
      const overlap = [...tokensA].filter((t) => tokensB.has(t)).length;
      const similarity = overlap / Math.max(1, Math.min(tokensA.size, tokensB.size));
      const metadataConflict =
        sources[i].rights.provenance_status !== sources[j].rights.provenance_status ||
        sources[i].governedDataStatus.quarantined !== sources[j].governedDataStatus.quarantined;
      if (similarity > 0.3 && metadataConflict) {
        contradictions++;
      }
    }
  }
  return pairs > 0 ? Math.round((contradictions / pairs) * 100) : 0;
}

function buildReadinessReport(params: {
  nicheProgram: NicheProgram;
  normalizedSources: NormalizedSourceRecord[];
  benchmarkSeedHints: CompilerBenchmarkSeedHint[];
  rightsState: ArtifactRightsState;
  compiledAt: string;
}) {
  const sourceCount = params.normalizedSources.length;
  const freshnessSignal = params.normalizedSources.filter(
    (source) => source.freshnessExpectation,
  ).length;
  const qualitySignal = params.normalizedSources.filter(
    (source) =>
      source.rights.provenance_status === "verified" && source.rights.redaction_status === "clean",
  ).length;
  const toolCount = params.nicheProgram.allowed_tools.length;
  const taskCount = new Set(params.benchmarkSeedHints.map((h) => h.taskFamilyId)).size;
  const seedCount = params.benchmarkSeedHints.length;
  return evaluateReadinessGate({
    nicheProgramId: params.nicheProgram.niche_program_id,
    generatedAt: params.compiledAt,
    rightsState: params.rightsState,
    dimensionValues: {
      source_quality: Math.min(100, Math.round((qualitySignal / Math.max(1, sourceCount)) * 100)),
      source_coverage: Math.round(
        (new Set(params.normalizedSources.map((s) => s.sourceKind)).size / SOURCE_KINDS.length) *
          100,
      ),
      contradiction_rate: computeContradictionRate(params.normalizedSources),
      freshness: Math.min(100, 60 + freshnessSignal * 15),
      rights_sufficiency: computeRightsSufficiencyScore(params.rightsState),
      task_observability:
        taskCount === 0
          ? toolCount > 0
            ? 70
            : 40
          : Math.min(100, Math.round((toolCount / Math.max(1, taskCount)) * 60 + 30)),
      benchmarkability: Math.min(100, seedCount * 25),
      measurable_success_criteria: Math.min(
        100,
        50 + params.nicheProgram.success_metrics.length * 20,
      ),
      tool_availability: Math.min(100, 50 + params.nicheProgram.allowed_tools.length * 15),
    },
  });
}

export type CompileNicheProgramFlowOptions = {
  nicheProgram: NicheProgram;
  sourceDescriptors: SourceDescriptor[];
  version?: string;
  compiledAt?: string;
  env?: NodeJS.ProcessEnv;
};

export type CompileNicheProgramFlowResult = {
  compilation: NicheCompilationRecord;
  compiled_domain_config: CompiledDomainConfig;
  source_access_manifest_path: string;
  readiness_report_path: string;
  compilation_record_path: string;
};

export async function compileNicheProgramFlow(
  opts: CompileNicheProgramFlowOptions,
): Promise<CompileNicheProgramFlowResult> {
  const compiledAt = opts.compiledAt ?? new Date().toISOString();
  const normalizedSources = await normalizeSourceDescriptors(opts.sourceDescriptors, compiledAt);
  if (normalizedSources.length === 0) {
    throw new Error("At least one source descriptor is required to compile a niche.");
  }
  assertCompilationSourcesAllowed(normalizedSources);

  const version = resolveCompilationVersion({
    nicheProgram: opts.nicheProgram,
    normalizedSources,
    requestedVersion: opts.version,
  });
  const sourceArtifacts = materializeNormalizedSourceArtifacts(normalizedSources, opts.env);
  const compiled = compileDomainPack({
    nicheProgram: opts.nicheProgram,
    version,
    sources: normalizedSources,
  });
  const domainPackArtifact = materializeCompiledDomainPackArtifact({
    domainPack: compiled.domainPack,
    sourceArtifactRefs: sourceArtifacts.map((artifact) => artifact.ref),
    createdAt: compiledAt,
    env: opts.env,
  });
  const sourceAccessManifest = buildSourceAccessManifest({
    nicheProgram: opts.nicheProgram,
    normalizedSources,
    version,
  });
  const sourceAccessManifestResult = ensureStoredSourceAccessManifest(
    sourceAccessManifest,
    opts.env,
  );
  const rightsState = propagateDerivedRights(
    sourceArtifacts.map((artifact) => artifact.ref.rights_state),
  ).rightsState;
  const readinessReport = buildReadinessReport({
    nicheProgram: opts.nicheProgram,
    normalizedSources,
    benchmarkSeedHints: compiled.benchmarkSeedHints,
    rightsState,
    compiledAt,
  });
  const readinessReportPath = saveReadinessReport(readinessReport, opts.env);
  // Produce operating configuration from the domain pack so the compilation
  // record carries both domain knowledge and runtime directives.
  const compiledDomainConfig = compileDomainConfig(compiled.domainPack, compiledAt);
  const compilationRecord: NicheCompilationRecord = {
    compilation_id: `${compiled.domainPack.domain_pack_id}-compile-${computeStableContentHash({
      domain_pack_id: compiled.domainPack.domain_pack_id,
      version,
    }).slice(0, 12)}`,
    niche_program_id: opts.nicheProgram.niche_program_id,
    version,
    compiled_at: compiledAt,
    domain_pack: compiled.domainPack,
    source_access_manifest: sourceAccessManifestResult.manifest,
    readiness_report: readinessReport,
    normalized_sources: normalizedSources,
    benchmark_seed_hints: compiled.benchmarkSeedHints,
    source_artifact_refs: sourceArtifacts.map((artifact) => artifact.ref),
    compiled_domain_pack_artifact_ref: domainPackArtifact.ref,
    compiled_domain_config: compiledDomainConfig,
  };
  const compilationRecordResult = ensureStoredNicheCompilationRecord(compilationRecord, opts.env);

  return {
    compilation: compilationRecordResult.record,
    compiled_domain_config: compiledDomainConfig,
    source_access_manifest_path: sourceAccessManifestResult.path,
    readiness_report_path: readinessReportPath,
    compilation_record_path: compilationRecordResult.path,
  };
}
