/**
 * NicheClaw store access boundary.
 *
 * All NicheClaw persistence flows through this module. Callers must not
 * assume file-system semantics — the storage backend may change. Import
 * store functions from this barrel; do not read/write niche state files
 * directly.
 */
export {
  clearRouteOverlaysForStack,
  getActiveNicheRuntimeState,
  getActiveNicheStackRecord,
  getActiveNicheStackRecordForCandidateManifest,
  removeActiveNicheAgentDefault,
  setActiveNicheAgentDefault,
  setActiveNicheRouteOverlay,
  upsertActiveNicheStackRecord,
} from "./active-stack-store.js";
export {
  getBenchmarkResultRecord,
  listBenchmarkResultRecords,
  writeBenchmarkResultRecord,
} from "./benchmark-run-store.js";
export {
  getLatestNicheCompilationRecordForProgram,
  getNicheCompilationRecord,
  listNicheCompilationRecords,
  ensureStoredNicheCompilationRecord,
  writeNicheCompilationRecord,
} from "./domain-pack-store.js";
export {
  backfillTeacherRolloutAuthority,
  type TeacherRolloutAuthorityBackfillResult,
} from "./backfill-rollout-authority.js";
export {
  computeTeacherRolloutAuthority,
  ensureArtifactRecord,
  getArtifactRecord,
  getArtifactRecordsByIds,
  listArtifactRecords,
  createArtifactRecord,
  computeArtifactContentHash,
  requiresTeacherRolloutAuthority,
} from "./artifact-registry.js";
export {
  collectDescendantArtifactIds,
  getChildrenForArtifact,
  getParentsForArtifact,
  listLineageEdges,
  writeLineageEdges,
} from "./lineage-store.js";
export {
  ensureStoredBaselineManifest,
  ensureStoredCandidateManifest,
  ensureStoredSourceAccessManifest,
  getBaselineManifest,
  getCandidateManifest,
  getSourceAccessManifest,
  listBaselineManifests,
  listCandidateManifests,
  listSourceAccessManifests,
  writeBaselineManifest,
  writeCandidateManifest,
  writeSourceAccessManifest,
} from "./manifest-store.js";
export {
  ensureStoredNicheProgram,
  getNicheProgram,
  listNichePrograms,
  writeNicheProgram,
} from "./program-store.js";
export {
  ensureStoredReadinessReport,
  getReadinessReport,
  getReadinessReportForProgram,
  listReadinessReports,
  saveReadinessReport,
  writeReadinessReport,
} from "./readiness-store.js";
export {
  resolveActiveNicheRuntimeStatePath,
  resolveArtifactStorePath,
  resolveArtifactStoreRoot,
  resolveArtifactVersionDirectory,
  resolveBenchmarkRunStorePath,
  resolveLineageStorePath,
  resolveManifestStorePath,
  resolveManifestStoreRoot,
  resolveNicheCompilationRecordStorePath,
  resolveNicheProgramStorePath,
  resolveNicheStateRoot,
  resolveNicheStoreRoots,
  resolveReadinessReportStorePath,
  type ManifestStoreKind,
  type NicheStoreRoots,
} from "./paths.js";
export {
  appendAuditEntry,
  readAuditEntries,
  resolveAuditLogPath,
  type AuditLogEntry,
} from "./audit-log.js";
export { createReplayBundle, getReplayBundle } from "./replay-bundle.js";
export { getReplayBundleForTrace, listReplayBundles } from "./replay-bundle.js";
export {
  buildWorkflowErrorMessage,
  resolveAllProgramWorkflowStates,
  resolveCompilationArtifacts,
  resolveManifestArtifacts,
  resolveBenchmarkArtifacts,
  resolveProgramWorkflowState,
  type ProgramWorkflowStage,
  type ProgramWorkflowState,
  type ResolvedBenchmarkArtifacts,
  type ResolvedCompilationArtifacts,
  type ResolvedManifestArtifacts,
} from "./artifact-resolution.js";
export {
  appendRunTrace,
  getRunTrace,
  listRunTraces,
  queryRunTraces,
  type RunTraceQuery,
} from "./trace-store.js";
