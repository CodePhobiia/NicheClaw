import { computeStableContentHash } from "../benchmark/fixture-versioning.js";
import type {
  BaselineManifest,
  CandidateManifest,
  ManifestProviderMetadataQuality,
  NicheCompilationRecord,
} from "../schema/index.js";

export type ManifestBuilderInput = {
  nicheProgramId: string;
  compilationRecord: NicheCompilationRecord;
  provider: string;
  modelId: string;
  apiMode: string;
  toolAllowlist: string[];
  modelSnapshotId?: string;
  providerReleaseLabel?: string;
  benchmarkSuiteId?: string;
};

export type ManifestBuilderOutput = {
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
};

/**
 * Builds a matched pair of baseline + candidate manifests from a compilation
 * record and execution parameters. The candidate references the baseline via
 * `based_on_baseline_manifest_id`, and all identifiers are derived
 * deterministically from the input using content-hashing.
 */
export function buildStarterManifests(input: ManifestBuilderInput): ManifestBuilderOutput {
  const now = new Date().toISOString();
  const version = input.compilationRecord.version;

  // Deterministic IDs derived from input parameters.
  const baselineId = `${input.nicheProgramId}-baseline-${computeStableContentHash({
    nicheProgramId: input.nicheProgramId,
    version,
    role: "baseline",
  }).slice(0, 12)}`;

  const candidateId = `${input.nicheProgramId}-candidate-${computeStableContentHash({
    nicheProgramId: input.nicheProgramId,
    version,
    role: "candidate",
  }).slice(0, 12)}`;

  const suiteId = input.benchmarkSuiteId ?? `${input.nicheProgramId}-suite`;
  const snapshotId = input.modelSnapshotId ?? `${input.modelId}-${version}`;
  const releaseLabel = input.providerReleaseLabel ?? snapshotId;
  const metadataQuality: ManifestProviderMetadataQuality = input.modelSnapshotId
    ? "exact_snapshot"
    : "release_label_only";

  const sourceAccessManifestId =
    input.compilationRecord.source_access_manifest.source_access_manifest_id;

  const graderSetVersion = `${input.nicheProgramId}-graders-${version}`;
  const toolCatalogVersion = `${input.nicheProgramId}-tools-${version}`;
  const toolContractVersion = `${input.nicheProgramId}-contracts-${version}`;

  // Shared fields used by both baseline and candidate manifests.
  const sharedFields = {
    niche_program_id: input.nicheProgramId,
    created_at: now,
    planner_runtime: {
      component_id: "planner-primary",
      provider: input.provider,
      model_id: input.modelId,
      api_mode: input.apiMode,
    },
    provider: input.provider,
    model_id: input.modelId,
    model_snapshot_id: snapshotId,
    api_mode: input.apiMode,
    provider_release_label: releaseLabel,
    provider_metadata_quality: metadataQuality,
    sampling_config: { temperature: 0.2, top_p: 1 },
    prompt_asset_version: `${input.nicheProgramId}-prompts-${version}`,
    grader_set_version: graderSetVersion,
    benchmark_suite_id: suiteId,
    source_access_manifest_id: sourceAccessManifestId,
    retry_policy: { max_attempts: 1 },
    token_budget: { max_total_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    tool_catalog_version: toolCatalogVersion,
    tool_allowlist: [...input.toolAllowlist].toSorted((a, b) => a.localeCompare(b)),
    tool_contract_version: toolContractVersion,
    retrieval_config: { policy: "baseline" },
    verifier_config: { policy: "baseline" },
  } as const;

  const baselineManifest: BaselineManifest = {
    baseline_manifest_id: baselineId,
    ...sharedFields,
  };

  const candidateManifest: CandidateManifest = {
    candidate_manifest_id: candidateId,
    based_on_baseline_manifest_id: baselineId,
    ...sharedFields,
    domain_pack_id: input.compilationRecord.domain_pack.domain_pack_id,
    action_policy_id: `${input.nicheProgramId}-action-policy`,
    retrieval_stack_id: `${input.nicheProgramId}-retrieval-stack`,
    verifier_pack_id: `${input.nicheProgramId}-verifier-pack`,
    optional_student_model_ids: [],
    candidate_recipe: `${input.nicheProgramId}-recipe`,
  };

  return { baselineManifest, candidateManifest };
}
