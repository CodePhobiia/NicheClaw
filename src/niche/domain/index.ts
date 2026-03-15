export { compileDomainPack, materializeCompiledDomainPackArtifact } from "./compiler.js";
export {
  compileDomainConfig,
  type CompiledDomainConfig,
  type ConstraintEnforcementDirective,
  type ExemplarDirective,
  type ObservationDirective,
  type PlannerDirectives,
  type RetrievalDirective,
  type ToolDirective,
} from "./compiled-config.js";
export {
  compileNicheProgramFlow,
  type CompileNicheProgramFlowOptions,
  type CompileNicheProgramFlowResult,
} from "./compile-flow.js";
export { buildReadinessRefusal, evaluateReadinessGate } from "./readiness-gate.js";
export {
  assertPreparedSeedReadiness,
  resolveSpecializationReadiness,
} from "./readiness-enforcement.js";
export {
  normalizeSourceDescriptor,
  normalizeSourceDescriptors,
  materializeNormalizedSourceArtifact,
  materializeNormalizedSourceArtifacts,
} from "./source-ingest.js";
export { DEFAULT_READINESS_THRESHOLDS, type ReadinessThresholds } from "./readiness-thresholds.js";
export {
  propagateDerivedRights,
  type DerivedRightsResult,
  type ExplicitRightsOverride,
} from "./rights-propagation.js";
export {
  buildStarterManifests,
  type ManifestBuilderInput,
  type ManifestBuilderOutput,
} from "./manifest-builder.js";
export { snapshotUnspecializedBaseline, type BaselineSnapshotParams } from "./baseline-snapshot.js";
export { buildBenchmarkSuiteFromCompilation } from "./benchmark-suite-builder.js";
export {
  generateReadinessGuidance,
  formatReadinessGuidance,
  type ReadinessGuidanceItem,
} from "./readiness-guidance.js";
export {
  buildStarterReleaseArtifacts,
  type StarterReleaseArtifacts,
} from "./release-artifact-builder.js";
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
