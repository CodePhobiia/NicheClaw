import type { SourceKind } from "../schema/index.js";

export type SourceInputKind =
  | "local_file"
  | "repo_asset"
  | "structured_text"
  | "benchmark_seed";

export type SourceRightsMetadata = {
  rights_to_store: boolean;
  rights_to_train: boolean;
  rights_to_benchmark: boolean;
  retention_policy: string;
  redaction_status: string;
  pii_status: string;
};

export type SourceProvenance = {
  source_uri: string;
  ingested_at: string;
  repo_root?: string;
  relative_path?: string;
};

type SourceDescriptorBase = {
  sourceId: string;
  sourceKind: SourceKind;
  inputKind: SourceInputKind;
  title: string;
  accessPattern: string;
  rights: SourceRightsMetadata;
  freshnessExpectation?: string;
  trustNotes?: string;
};

export type LocalFileSourceDescriptor = SourceDescriptorBase & {
  inputKind: "local_file";
  filePath: string;
};

export type RepoAssetSourceDescriptor = SourceDescriptorBase & {
  inputKind: "repo_asset";
  repoRoot: string;
  repoRelativePath: string;
};

export type StructuredTextSourceDescriptor = SourceDescriptorBase & {
  inputKind: "structured_text";
  text: string;
};

export type BenchmarkSeedSourceDescriptor = SourceDescriptorBase & {
  inputKind: "benchmark_seed";
  prompt: string;
  taskFamilyId: string;
  passConditions: string[];
  hardFailConditions: string[];
};

export type SourceDescriptor =
  | LocalFileSourceDescriptor
  | RepoAssetSourceDescriptor
  | StructuredTextSourceDescriptor
  | BenchmarkSeedSourceDescriptor;

export type NormalizedSourceRecord = {
  sourceId: string;
  sourceKind: SourceKind;
  inputKind: SourceInputKind;
  title: string;
  accessPattern: string;
  normalizedContent: string;
  rights: SourceRightsMetadata;
  provenance: SourceProvenance;
  freshnessExpectation?: string;
  trustNotes?: string;
  benchmarkSeed?: {
    prompt: string;
    taskFamilyId: string;
    passConditions: string[];
    hardFailConditions: string[];
  };
};

export type CompilerBenchmarkSeedHint = {
  seedId: string;
  taskFamilyId: string;
  prompt: string;
  sourceRefs: string[];
  passConditions: string[];
  hardFailConditions: string[];
};
