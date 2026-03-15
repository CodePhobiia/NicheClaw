import { computeStableContentHash } from "../benchmark/fixture-versioning.js";
import type { BaselineManifest, ManifestProviderMetadataQuality } from "../schema/index.js";

export type BaselineSnapshotParams = {
  agentId: string;
  provider: string;
  modelId: string;
  apiMode: string;
  nicheProgramId: string;
  benchmarkSuiteId: string;
  sourceAccessManifestId: string;
  toolAllowlist?: string[];
  modelSnapshotId?: string;
};

// Default tool allowlist for an unspecialized agent (generic capabilities).
const DEFAULT_TOOL_ALLOWLIST = ["apply_patch", "exec", "read"];

// Default sampling config: moderate temperature for reproducible benchmarks.
const DEFAULT_SAMPLING_CONFIG = { temperature: 0.2, top_p: 1 };

// Default retry policy: single attempt, no retries for baseline fairness.
const DEFAULT_RETRY_POLICY = { max_attempts: 1 };

// Default token budget: generous but bounded.
const DEFAULT_TOKEN_BUDGET = { max_total_tokens: 64000 };

// Default context budget: generous but bounded.
const DEFAULT_CONTEXT_BUDGET = { max_context_tokens: 64000 };

/**
 * Snapshots the current agent's unspecialized configuration as a
 * BaselineManifest — the control arm for benchmarking. The resulting
 * manifest has zero domain-specific configuration: no domain pack, no
 * action policy overlay, no verifier gate, no domain constraints.
 *
 * The baseline_manifest_id is deterministic: identical inputs always
 * produce the same ID via content-hashing.
 */
export function snapshotUnspecializedBaseline(params: BaselineSnapshotParams): BaselineManifest {
  const now = new Date().toISOString();

  const toolAllowlist = params.toolAllowlist
    ? [...params.toolAllowlist].toSorted((a, b) => a.localeCompare(b))
    : [...DEFAULT_TOOL_ALLOWLIST];

  const snapshotId = params.modelSnapshotId ?? `${params.modelId}-unspecialized`;
  const metadataQuality: ManifestProviderMetadataQuality = params.modelSnapshotId
    ? "exact_snapshot"
    : "release_label_only";

  // Deterministic ID derived from the identity-defining inputs.
  const baselineManifestId = `${params.nicheProgramId}-baseline-${computeStableContentHash({
    agentId: params.agentId,
    provider: params.provider,
    modelId: params.modelId,
    apiMode: params.apiMode,
    nicheProgramId: params.nicheProgramId,
    benchmarkSuiteId: params.benchmarkSuiteId,
    sourceAccessManifestId: params.sourceAccessManifestId,
    toolAllowlist,
    modelSnapshotId: snapshotId,
    role: "unspecialized-baseline",
  }).slice(0, 12)}`;

  return {
    baseline_manifest_id: baselineManifestId,
    niche_program_id: params.nicheProgramId,
    created_at: now,
    planner_runtime: {
      component_id: "planner-primary",
      provider: params.provider,
      model_id: params.modelId,
      api_mode: params.apiMode,
    },
    provider: params.provider,
    model_id: params.modelId,
    model_snapshot_id: snapshotId,
    api_mode: params.apiMode,
    provider_metadata_quality: metadataQuality,
    sampling_config: { ...DEFAULT_SAMPLING_CONFIG },
    prompt_asset_version: `${params.nicheProgramId}-baseline-prompts`,
    grader_set_version: `${params.nicheProgramId}-graders-baseline`,
    benchmark_suite_id: params.benchmarkSuiteId,
    source_access_manifest_id: params.sourceAccessManifestId,
    retry_policy: { ...DEFAULT_RETRY_POLICY },
    token_budget: { ...DEFAULT_TOKEN_BUDGET },
    context_budget: { ...DEFAULT_CONTEXT_BUDGET },
    execution_mode: "benchmark",
    tool_catalog_version: `${params.nicheProgramId}-tools-baseline`,
    tool_allowlist: toolAllowlist,
    tool_contract_version: `${params.nicheProgramId}-contracts-baseline`,
    retrieval_config: { policy: "none" },
    verifier_config: { policy: "none" },
  };
}
