export {
  compileDomainPack,
} from "./compiler.js";
export {
  buildReadinessRefusal,
  evaluateReadinessGate,
} from "./readiness-gate.js";
export {
  normalizeSourceDescriptor,
  normalizeSourceDescriptors,
} from "./source-ingest.js";
export {
  DEFAULT_READINESS_THRESHOLDS,
  type ReadinessThresholds,
} from "./readiness-thresholds.js";
export {
  propagateDerivedRights,
  type DerivedRightsResult,
  type ExplicitRightsOverride,
} from "./rights-propagation.js";
export type {
  BenchmarkSeedSourceDescriptor,
  CompilerBenchmarkSeedHint,
  LocalFileSourceDescriptor,
  NormalizedSourceRecord,
  RepoAssetSourceDescriptor,
  SourceDescriptor,
  SourceInputKind,
  SourceProvenance,
  SourceRightsMetadata,
  StructuredTextSourceDescriptor,
} from "./source-types.js";
