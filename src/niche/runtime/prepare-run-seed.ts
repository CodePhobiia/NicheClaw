import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { computeStableContentHash } from "../benchmark/fixture-versioning.js";
import {
  ArtifactRefSchema,
  BaselineManifestSchema,
  BenchmarkCaseReferenceSchema,
  CandidateManifestSchema,
  DomainPackSchema,
  EvidenceBundleRefSchema,
  type ArtifactRef,
  type BaselineManifest,
  type BenchmarkCaseReference,
  type CandidateManifest,
  type DomainPack,
  type EvidenceBundleRef,
  type PreparedNicheActionPolicyRuntime,
  type PreparedNicheEnvironmentSnapshot,
  type PreparedNicheRunSeed,
  type PreparedNicheRunSeedManifestKind,
  type PreparedVerifierReleaseGuardrails,
  PreparedNicheActionPolicyRuntimeSchema,
  PreparedNicheEnvironmentSnapshotSchema,
  PreparedNicheRunSeedSchema,
  SourceAccessManifestSchema,
  type SourceAccessManifest,
} from "../schema/index.js";
import { createVerifierPackConfig } from "../verifier/pack.js";

const PREPARED_NICHE_RUN_SEED_CACHE_KEY = "niche-runtime-prepared-run-seed";

export type PrepareNicheRunSeedParams = {
  manifest_kind: PreparedNicheRunSeedManifestKind;
  manifest: BaselineManifest | CandidateManifest;
  domain_pack: DomainPack;
  source_access_manifest: SourceAccessManifest;
  action_policy_runtime: PreparedNicheActionPolicyRuntime;
  verifier_pack_id: string;
  verifier_pack_version: string;
  mode: PreparedNicheRunSeed["mode"];
  runtime_snapshot_id: string;
  context_bundle_id: string;
  determinism_policy_id: string;
  random_seed: string;
  replayability_status: PreparedNicheRunSeed["replayability_status"];
  determinism_notes: string;
  readiness_report_id: string;
  planner_version_id?: string;
  action_policy_version_id?: string;
  verifier_pack_version_id?: string;
  retrieval_stack_version_id?: string;
  grader_set_version_id?: string;
  artifact_refs?: ArtifactRef[];
  evidence_bundle_refs?: EvidenceBundleRef[];
  benchmark_suite_id?: string;
  benchmark_arm_id?: string;
  benchmark_case_ref?: BenchmarkCaseReference;
  suite_hash?: string;
  fixture_version?: string;
  environment_snapshot?: PreparedNicheEnvironmentSnapshot;
  verifier_release_guardrails?: PreparedVerifierReleaseGuardrails;
  prepared_at?: string;
  seed_id?: string;
};

function assertSchemaValue<T>(params: {
  value: unknown;
  schema: Record<string, unknown>;
  cacheKey: string;
  label: string;
}): T {
  const result = validateJsonSchemaValue({
    schema: params.schema,
    cacheKey: params.cacheKey,
    value: params.value,
  });
  if (result.ok) {
    return params.value as T;
  }
  const details = result.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid ${params.label}: ${details}`);
}

function assertManifestForKind(
  manifestKind: PreparedNicheRunSeedManifestKind,
  manifest: BaselineManifest | CandidateManifest,
): BaselineManifest | CandidateManifest {
  if (manifestKind === "candidate") {
    return assertSchemaValue<CandidateManifest>({
      value: manifest,
      schema: CandidateManifestSchema,
      cacheKey: "niche-runtime-prepare-run-seed-candidate-manifest",
      label: "candidate manifest",
    });
  }
  return assertSchemaValue<BaselineManifest>({
    value: manifest,
    schema: BaselineManifestSchema,
    cacheKey: "niche-runtime-prepare-run-seed-baseline-manifest",
    label: "baseline manifest",
  });
}

function assertPreparedActionPolicyRuntime(
  value: PreparedNicheActionPolicyRuntime,
): PreparedNicheActionPolicyRuntime {
  return assertSchemaValue<PreparedNicheActionPolicyRuntime>({
    value,
    schema: PreparedNicheActionPolicyRuntimeSchema,
    cacheKey: "niche-runtime-prepare-run-seed-action-policy-runtime",
    label: "prepared niche action policy runtime",
  });
}

function assertEnvironmentSnapshot(
  value: PreparedNicheEnvironmentSnapshot | undefined,
): PreparedNicheEnvironmentSnapshot | undefined {
  if (!value) {
    return undefined;
  }
  return assertSchemaValue<PreparedNicheEnvironmentSnapshot>({
    value,
    schema: PreparedNicheEnvironmentSnapshotSchema,
    cacheKey: "niche-runtime-prepare-run-seed-environment-snapshot",
    label: "prepared niche environment snapshot",
  });
}

function resolveSeedId(params: {
  seedId?: string;
  manifestKind: PreparedNicheRunSeedManifestKind;
  manifestId: string;
  mode: PreparedNicheRunSeed["mode"];
  runtimeSnapshotId: string;
  contextBundleId: string;
  verifierPackId: string;
  verifierPackVersion: string;
  randomSeed: string;
}): string {
  if (params.seedId?.trim()) {
    return params.seedId.trim();
  }
  const hash = computeStableContentHash({
    manifest_kind: params.manifestKind,
    manifest_id: params.manifestId,
    mode: params.mode,
    runtime_snapshot_id: params.runtimeSnapshotId,
    context_bundle_id: params.contextBundleId,
    verifier_pack_id: params.verifierPackId,
    verifier_pack_version: params.verifierPackVersion,
    random_seed: params.randomSeed,
  }).slice(0, 24);
  return `prepared-run-seed-${hash}`;
}

function requireExplicit(value: string | undefined, label: string): string {
  if (value?.trim()) {
    return value.trim();
  }
  throw new Error(`${label} is required for this prepared Niche run seed.`);
}

function requireReplayabilityField<T>(value: T | undefined, label: string): T {
  if (value !== undefined) {
    return value;
  }
  throw new Error(`${label} is required when benchmark/shadow runs claim replayable status.`);
}

function assertAllowedToolSubset(params: {
  actionPolicyRuntime: PreparedNicheActionPolicyRuntime;
  sourceAccessManifest: SourceAccessManifest;
}): void {
  const allowedToolSet = new Set(params.sourceAccessManifest.allowed_tools);
  for (const toolName of params.actionPolicyRuntime.allowed_tools) {
    if (!allowedToolSet.has(toolName)) {
      throw new Error(
        `action_policy_runtime.allowed_tools contains ${JSON.stringify(toolName)} which is not allowed by source_access_manifest.allowed_tools.`,
      );
    }
  }
  for (const toolName of Object.keys(params.actionPolicyRuntime.required_arguments_by_tool ?? {})) {
    if (!params.actionPolicyRuntime.allowed_tools.includes(toolName)) {
      throw new Error(
        `action_policy_runtime.required_arguments_by_tool contains ${JSON.stringify(toolName)} which is not present in action_policy_runtime.allowed_tools.`,
      );
    }
  }
}

export function assertPreparedNicheRunSeed(
  value: unknown,
  label = "prepared Niche run seed",
): PreparedNicheRunSeed {
  return assertSchemaValue<PreparedNicheRunSeed>({
    value,
    schema: PreparedNicheRunSeedSchema,
    cacheKey: PREPARED_NICHE_RUN_SEED_CACHE_KEY,
    label,
  });
}

export function prepareNicheRunSeed(params: PrepareNicheRunSeedParams): PreparedNicheRunSeed {
  const manifest = assertManifestForKind(params.manifest_kind, params.manifest);
  const domainPack = assertSchemaValue<DomainPack>({
    value: params.domain_pack,
    schema: DomainPackSchema,
    cacheKey: "niche-runtime-prepare-run-seed-domain-pack",
    label: "domain pack",
  });
  const sourceAccessManifest = assertSchemaValue<SourceAccessManifest>({
    value: params.source_access_manifest,
    schema: SourceAccessManifestSchema,
    cacheKey: "niche-runtime-prepare-run-seed-source-access-manifest",
    label: "source access manifest",
  });
  const actionPolicyRuntime = assertPreparedActionPolicyRuntime(params.action_policy_runtime);
  const environmentSnapshot = assertEnvironmentSnapshot(params.environment_snapshot);
  const artifactRefs = (params.artifact_refs ?? []).map((entry, index) =>
    assertSchemaValue<ArtifactRef>({
      value: entry,
      schema: ArtifactRefSchema,
      cacheKey: `niche-runtime-prepare-run-seed-artifact-ref-${index}`,
      label: `artifact ref ${index + 1}`,
    }),
  );
  const evidenceBundleRefs = (params.evidence_bundle_refs ?? []).map((entry, index) =>
    assertSchemaValue<EvidenceBundleRef>({
      value: entry,
      schema: EvidenceBundleRefSchema,
      cacheKey: `niche-runtime-prepare-run-seed-evidence-bundle-ref-${index}`,
      label: `evidence bundle ref ${index + 1}`,
    }),
  );
  const benchmarkCaseRef = params.benchmark_case_ref
    ? assertSchemaValue<BenchmarkCaseReference>({
        value: params.benchmark_case_ref,
        schema: BenchmarkCaseReferenceSchema,
        cacheKey: "niche-runtime-prepare-run-seed-benchmark-case-ref",
        label: "benchmark case reference",
      })
    : undefined;

  if (manifest.niche_program_id !== domainPack.niche_program_id) {
    throw new Error(
      `manifest.niche_program_id ${JSON.stringify(manifest.niche_program_id)} must match domain_pack.niche_program_id ${JSON.stringify(domainPack.niche_program_id)}.`,
    );
  }
  if (manifest.source_access_manifest_id !== sourceAccessManifest.source_access_manifest_id) {
    throw new Error(
      `manifest.source_access_manifest_id ${JSON.stringify(manifest.source_access_manifest_id)} must match source_access_manifest.source_access_manifest_id ${JSON.stringify(sourceAccessManifest.source_access_manifest_id)}.`,
    );
  }
  assertAllowedToolSubset({
    actionPolicyRuntime,
    sourceAccessManifest,
  });

  let plannerVersionId = params.planner_version_id?.trim();
  let actionPolicyVersionId = params.action_policy_version_id?.trim();
  let verifierPackVersionId = params.verifier_pack_version_id?.trim();
  let retrievalStackVersionId = params.retrieval_stack_version_id?.trim();
  let graderSetVersionId = params.grader_set_version_id?.trim();

  if (params.manifest_kind === "candidate") {
    const candidate = manifest as CandidateManifest;
    if (candidate.domain_pack_id !== domainPack.domain_pack_id) {
      throw new Error(
        `candidate.domain_pack_id ${JSON.stringify(candidate.domain_pack_id)} must match domain_pack.domain_pack_id ${JSON.stringify(domainPack.domain_pack_id)}.`,
      );
    }
    actionPolicyVersionId ??= candidate.action_policy_id;
    verifierPackVersionId ??= candidate.verifier_pack_id;
    retrievalStackVersionId ??= candidate.retrieval_stack_id;
    graderSetVersionId ??= candidate.grader_set_version;
    plannerVersionId ??= candidate.planner_runtime.component_id;
  } else {
    const baseline = manifest as BaselineManifest;
    actionPolicyVersionId = requireExplicit(actionPolicyVersionId, "action_policy_version_id");
    verifierPackVersionId = requireExplicit(verifierPackVersionId, "verifier_pack_version_id");
    retrievalStackVersionId = requireExplicit(
      retrievalStackVersionId,
      "retrieval_stack_version_id",
    );
    graderSetVersionId = requireExplicit(graderSetVersionId, "grader_set_version_id");
    plannerVersionId ??= baseline.planner_runtime.component_id;
  }

  if (!plannerVersionId?.trim()) {
    throw new Error("planner_version_id could not be resolved for this prepared Niche run seed.");
  }

  if (
    (params.mode === "benchmark" || params.mode === "shadow") &&
    params.replayability_status === "replayable"
  ) {
    requireReplayabilityField(params.benchmark_suite_id?.trim(), "benchmark_suite_id");
    requireReplayabilityField(params.benchmark_arm_id?.trim(), "benchmark_arm_id");
    requireReplayabilityField(params.suite_hash?.trim(), "suite_hash");
    requireReplayabilityField(params.fixture_version?.trim(), "fixture_version");
    requireReplayabilityField(environmentSnapshot, "environment_snapshot");
    requireReplayabilityField(params.determinism_policy_id?.trim(), "determinism_policy_id");
    requireReplayabilityField(params.random_seed?.trim(), "random_seed");
  }

  const manifestId =
    params.manifest_kind === "candidate"
      ? (manifest as CandidateManifest).candidate_manifest_id
      : (manifest as BaselineManifest).baseline_manifest_id;

  const preparedSeed = {
    seed_id: resolveSeedId({
      seedId: params.seed_id,
      manifestKind: params.manifest_kind,
      manifestId,
      mode: params.mode,
      runtimeSnapshotId: params.runtime_snapshot_id,
      contextBundleId: params.context_bundle_id,
      verifierPackId: params.verifier_pack_id,
      verifierPackVersion: params.verifier_pack_version,
      randomSeed: params.random_seed,
    }),
    prepared_at: params.prepared_at ?? new Date().toISOString(),
    mode: params.mode,
    manifest_kind: params.manifest_kind,
    baseline_or_candidate_manifest_id: manifestId,
    readiness_report_id: requireExplicit(params.readiness_report_id, "readiness_report_id"),
    niche_program_id: manifest.niche_program_id,
    domain_pack_id: domainPack.domain_pack_id,
    domain_pack: domainPack,
    source_access_manifest: sourceAccessManifest,
    action_policy_runtime: actionPolicyRuntime,
    verifier_pack_config: createVerifierPackConfig({
      verifierPackId: params.verifier_pack_id,
      version: params.verifier_pack_version,
      domainPack,
      releaseGuardrails: params.verifier_release_guardrails,
    }),
    planner_version_id: plannerVersionId,
    action_policy_version_id: actionPolicyVersionId,
    verifier_pack_version_id: verifierPackVersionId,
    retrieval_stack_version_id: retrievalStackVersionId,
    grader_set_version_id: graderSetVersionId,
    runtime_snapshot_id: requireExplicit(params.runtime_snapshot_id?.trim(), "runtime_snapshot_id"),
    context_bundle_id: requireExplicit(params.context_bundle_id?.trim(), "context_bundle_id"),
    determinism_policy_id: requireExplicit(
      params.determinism_policy_id?.trim(),
      "determinism_policy_id",
    ),
    random_seed: requireExplicit(params.random_seed?.trim(), "random_seed"),
    replayability_status: params.replayability_status,
    determinism_notes: requireExplicit(params.determinism_notes?.trim(), "determinism_notes"),
    artifact_refs: artifactRefs,
    evidence_bundle_refs: evidenceBundleRefs,
    benchmark_suite_id: params.benchmark_suite_id?.trim(),
    benchmark_arm_id: params.benchmark_arm_id?.trim(),
    benchmark_case_ref: benchmarkCaseRef,
    suite_hash: params.suite_hash?.trim(),
    fixture_version: params.fixture_version?.trim(),
    environment_snapshot: environmentSnapshot,
  } satisfies PreparedNicheRunSeed;

  return assertPreparedNicheRunSeed(preparedSeed);
}
