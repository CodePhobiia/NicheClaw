import fs from "node:fs/promises";
import path from "node:path";
import { computeStableContentHash } from "../benchmark/index.js";
import {
  computeTeacherRolloutAuthority,
  ensureArtifactRecord,
  getParentsForArtifact,
  writeLineageEdges,
} from "../store/index.js";
import type {
  BenchmarkSeedSourceDescriptor,
  LocalFileSourceDescriptor,
  NormalizedSourceRecord,
  RepoAssetSourceDescriptor,
  SourceDescriptor,
  StructuredTextSourceDescriptor,
} from "./source-types.js";

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function buildGovernedDataStatus(
  rights: NormalizedSourceRecord["rights"],
): NormalizedSourceRecord["governedDataStatus"] {
  return {
    data_zone: rights.data_zone,
    retention_policy: rights.retention_policy,
    redaction_status: rights.redaction_status,
    pii_status: rights.pii_status,
    provenance_status: rights.provenance_status,
    quarantined: rights.quarantined === true,
    ...(rights.quarantine_reason ? { quarantine_reason: rights.quarantine_reason } : {}),
  };
}

function isPathWithinRoot(relativePath: string): boolean {
  return (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

async function normalizeLocalFileSource(
  source: LocalFileSourceDescriptor,
  ingestedAt: string,
): Promise<NormalizedSourceRecord> {
  const normalizedContent = normalizeText(await fs.readFile(source.filePath, "utf8"));
  return {
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    inputKind: source.inputKind,
    title: source.title,
    accessPattern: source.accessPattern,
    normalizedContent,
    rights: source.rights,
    provenance: {
      source_uri: source.filePath,
      ingested_at: ingestedAt,
    },
    governedDataStatus: buildGovernedDataStatus(source.rights),
    freshnessExpectation: source.freshnessExpectation,
    trustNotes: source.trustNotes,
  };
}

async function normalizeRepoAssetSource(
  source: RepoAssetSourceDescriptor,
  ingestedAt: string,
): Promise<NormalizedSourceRecord> {
  const normalizedRoot = path.resolve(source.repoRoot);
  const absolutePath = path.resolve(normalizedRoot, source.repoRelativePath);
  const lexicalRelativePath = path.relative(normalizedRoot, absolutePath);
  if (!isPathWithinRoot(lexicalRelativePath)) {
    throw new Error(`Repo asset source escapes repo root: ${source.repoRelativePath}`);
  }

  const [realRoot, realPath] = await Promise.all([
    fs.realpath(normalizedRoot),
    fs.realpath(absolutePath),
  ]);
  const realRelativePath = path.relative(realRoot, realPath);
  if (!isPathWithinRoot(realRelativePath)) {
    throw new Error(`Repo asset source escapes repo root: ${source.repoRelativePath}`);
  }

  const normalizedContent = normalizeText(await fs.readFile(realPath, "utf8"));
  return {
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    inputKind: source.inputKind,
    title: source.title,
    accessPattern: source.accessPattern,
    normalizedContent,
    rights: source.rights,
    provenance: {
      source_uri: realPath,
      ingested_at: ingestedAt,
      repo_root: realRoot,
      relative_path: source.repoRelativePath.replaceAll("\\", "/"),
    },
    governedDataStatus: buildGovernedDataStatus(source.rights),
    freshnessExpectation: source.freshnessExpectation,
    trustNotes: source.trustNotes,
  };
}

function normalizeStructuredTextSource(
  source: StructuredTextSourceDescriptor,
  ingestedAt: string,
): NormalizedSourceRecord {
  return {
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    inputKind: source.inputKind,
    title: source.title,
    accessPattern: source.accessPattern,
    normalizedContent: normalizeText(source.text),
    rights: source.rights,
    provenance: {
      source_uri: `structured://${source.sourceId}`,
      ingested_at: ingestedAt,
    },
    governedDataStatus: buildGovernedDataStatus(source.rights),
    freshnessExpectation: source.freshnessExpectation,
    trustNotes: source.trustNotes,
  };
}

function normalizeBenchmarkSeedSource(
  source: BenchmarkSeedSourceDescriptor,
  ingestedAt: string,
): NormalizedSourceRecord {
  return {
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    inputKind: source.inputKind,
    title: source.title,
    accessPattern: source.accessPattern,
    normalizedContent: normalizeText(source.prompt),
    rights: source.rights,
    provenance: {
      source_uri: `benchmark-seed://${source.sourceId}`,
      ingested_at: ingestedAt,
    },
    governedDataStatus: buildGovernedDataStatus(source.rights),
    freshnessExpectation: source.freshnessExpectation,
    trustNotes: source.trustNotes,
    benchmarkSeed: {
      prompt: normalizeText(source.prompt),
      taskFamilyId: source.taskFamilyId,
      passConditions: [...source.passConditions],
      hardFailConditions: [...source.hardFailConditions],
    },
  };
}

export async function normalizeSourceDescriptor(
  source: SourceDescriptor,
  ingestedAt: string = new Date().toISOString(),
): Promise<NormalizedSourceRecord> {
  switch (source.inputKind) {
    case "local_file":
      return normalizeLocalFileSource(source, ingestedAt);
    case "repo_asset":
      return normalizeRepoAssetSource(source, ingestedAt);
    case "structured_text":
      return normalizeStructuredTextSource(source, ingestedAt);
    case "benchmark_seed":
      return normalizeBenchmarkSeedSource(source, ingestedAt);
  }
}

export async function normalizeSourceDescriptors(
  sources: SourceDescriptor[],
  ingestedAt: string = new Date().toISOString(),
): Promise<NormalizedSourceRecord[]> {
  const normalized = await Promise.all(
    sources.map((source) => normalizeSourceDescriptor(source, ingestedAt)),
  );
  return normalized.toSorted((left, right) => left.sourceId.localeCompare(right.sourceId));
}

export function materializeNormalizedSourceArtifact(
  source: NormalizedSourceRecord,
  env: NodeJS.ProcessEnv = process.env,
): ReturnType<typeof ensureArtifactRecord> {
  const lineage = [
    {
      parent_artifact_id: source.sourceId,
      relationship: "ingested_from",
      derivation_step: "source_ingest",
      notes: `Dataset artifact ingested from source ${source.sourceId}.`,
    },
  ];
  const artifact = {
    artifact_id: `${source.sourceId}-dataset`,
    artifact_type: "dataset" as const,
    version: computeStableContentHash({
      sourceId: source.sourceId,
      ingestedAt: source.provenance.ingested_at,
      content: source.normalizedContent,
    }),
    producer: "niche.domain.source-ingest",
    source_trace_refs: [],
    dataset_refs: [],
    metrics: {
      content_length: source.normalizedContent.length,
    },
    governed_data_status: source.governedDataStatus,
    teacher_rollout_authority: computeTeacherRolloutAuthority({
      artifactType: "dataset",
      governedDataStatus: source.governedDataStatus,
      rightsState: {
        rights_to_store: source.rights.rights_to_store,
        rights_to_train: source.rights.rights_to_train,
        rights_to_benchmark: source.rights.rights_to_benchmark,
        rights_to_derive: source.rights.rights_to_derive,
        rights_to_distill: source.rights.rights_to_distill,
        rights_to_generate_synthetic_from: source.rights.rights_to_generate_synthetic_from,
      },
    }),
    created_at: source.provenance.ingested_at,
    lineage,
  };
  const created = ensureArtifactRecord({
    artifact,
    rightsState: {
      rights_to_store: source.rights.rights_to_store,
      rights_to_train: source.rights.rights_to_train,
      rights_to_benchmark: source.rights.rights_to_benchmark,
      rights_to_derive: source.rights.rights_to_derive,
      rights_to_distill: source.rights.rights_to_distill,
      rights_to_generate_synthetic_from: source.rights.rights_to_generate_synthetic_from,
    },
    env,
  });
  const existingLineage = getParentsForArtifact(artifact.artifact_id, env);
  if (existingLineage.length === 0) {
    writeLineageEdges(artifact.artifact_id, lineage, env);
  } else if (JSON.stringify(existingLineage) !== JSON.stringify(lineage)) {
    throw new Error(
      `Lineage for ${artifact.artifact_id} is already stored with different content.`,
    );
  }
  return created;
}

export function materializeNormalizedSourceArtifacts(
  sources: NormalizedSourceRecord[],
  env: NodeJS.ProcessEnv = process.env,
): Array<ReturnType<typeof ensureArtifactRecord>> {
  return [...sources]
    .toSorted((left, right) => left.sourceId.localeCompare(right.sourceId))
    .map((source) => materializeNormalizedSourceArtifact(source, env));
}
