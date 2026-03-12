import fs from "node:fs/promises";
import path from "node:path";
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

async function normalizeLocalFileSource(
  source: LocalFileSourceDescriptor,
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
      ingested_at: new Date().toISOString(),
    },
    freshnessExpectation: source.freshnessExpectation,
    trustNotes: source.trustNotes,
  };
}

async function normalizeRepoAssetSource(
  source: RepoAssetSourceDescriptor,
): Promise<NormalizedSourceRecord> {
  const absolutePath = path.resolve(source.repoRoot, source.repoRelativePath);
  const normalizedRoot = path.resolve(source.repoRoot);
  if (!absolutePath.startsWith(normalizedRoot)) {
    throw new Error(`Repo asset source escapes repo root: ${source.repoRelativePath}`);
  }

  const normalizedContent = normalizeText(await fs.readFile(absolutePath, "utf8"));
  return {
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    inputKind: source.inputKind,
    title: source.title,
    accessPattern: source.accessPattern,
    normalizedContent,
    rights: source.rights,
    provenance: {
      source_uri: absolutePath,
      ingested_at: new Date().toISOString(),
      repo_root: normalizedRoot,
      relative_path: source.repoRelativePath.replaceAll("\\", "/"),
    },
    freshnessExpectation: source.freshnessExpectation,
    trustNotes: source.trustNotes,
  };
}

function normalizeStructuredTextSource(
  source: StructuredTextSourceDescriptor,
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
      ingested_at: new Date().toISOString(),
    },
    freshnessExpectation: source.freshnessExpectation,
    trustNotes: source.trustNotes,
  };
}

function normalizeBenchmarkSeedSource(
  source: BenchmarkSeedSourceDescriptor,
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
      ingested_at: new Date().toISOString(),
    },
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
): Promise<NormalizedSourceRecord> {
  switch (source.inputKind) {
    case "local_file":
      return normalizeLocalFileSource(source);
    case "repo_asset":
      return normalizeRepoAssetSource(source);
    case "structured_text":
      return normalizeStructuredTextSource(source);
    case "benchmark_seed":
      return normalizeBenchmarkSeedSource(source);
  }
}

export async function normalizeSourceDescriptors(
  sources: SourceDescriptor[],
): Promise<NormalizedSourceRecord[]> {
  const normalized = await Promise.all(sources.map((source) => normalizeSourceDescriptor(source)));
  return normalized.toSorted((left, right) => left.sourceId.localeCompare(right.sourceId));
}
