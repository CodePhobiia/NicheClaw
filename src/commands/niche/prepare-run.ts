import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveJsonFile } from "../../infra/json-file.js";
import { resolveSpecializationReadiness } from "../../niche/domain/index.js";
import { readRequiredJsonFileStrict } from "../../niche/json.js";
import {
  prepareNicheRunSeed,
  type PrepareNicheRunSeedParams,
} from "../../niche/runtime/prepare-run-seed.js";
import {
  ArtifactRefSchema,
  BaselineManifestSchema,
  CandidateManifestSchema,
  DomainPackSchema,
  EvidenceBundleRefSchema,
  PreparedNicheActionPolicyRuntimeSchema,
  PreparedNicheEnvironmentSnapshotSchema,
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
  type ReplayabilityStatus,
  type RunTraceMode,
  SourceAccessManifestSchema,
  type BenchmarkCaseKind,
  type SourceAccessManifest,
} from "../../niche/schema/index.js";
import { resolveCompilationArtifacts, resolveManifestArtifacts } from "../../niche/store/index.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type NichePrepareRunOptions = {
  manifestKind: PreparedNicheRunSeedManifestKind;
  manifestPath?: string;
  domainPackPath?: string;
  sourceAccessManifestPath?: string;
  actionPolicyRuntimePath: string;
  verifierPackId: string;
  verifierPackVersion: string;
  mode: RunTraceMode;
  runtimeSnapshotId: string;
  contextBundleId: string;
  determinismPolicyId: string;
  randomSeed: string;
  replayabilityStatus: ReplayabilityStatus;
  determinismNotes: string;
  plannerVersionId?: string;
  actionPolicyVersionId?: string;
  verifierPackVersionId?: string;
  retrievalStackVersionId?: string;
  graderSetVersionId?: string;
  artifactRefPaths?: string[];
  evidenceBundlePaths?: string[];
  benchmarkSuiteId?: string;
  benchmarkArmId?: string;
  benchmarkCaseKind?: BenchmarkCaseKind;
  benchmarkCaseId?: string;
  suiteHash?: string;
  fixtureVersion?: string;
  environmentSnapshotPath?: string;
  readinessReportPath?: string;
  nicheProgramId?: string;
  outPath?: string;
  json?: boolean;
};

function validateValue<T>(params: {
  schema: Record<string, unknown>;
  cacheKey: string;
  value: unknown;
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

function loadManifest(
  manifestKind: PreparedNicheRunSeedManifestKind,
  pathname: string,
): BaselineManifest | CandidateManifest {
  const raw = readRequiredJsonFileStrict(pathname, `manifest ${pathname}`);
  if (manifestKind === "candidate") {
    return validateValue<CandidateManifest>({
      schema: CandidateManifestSchema,
      cacheKey: "niche-prepare-run-command-candidate-manifest",
      value: raw,
      label: "candidate manifest",
    });
  }
  return validateValue<BaselineManifest>({
    schema: BaselineManifestSchema,
    cacheKey: "niche-prepare-run-command-baseline-manifest",
    value: raw,
    label: "baseline manifest",
  });
}

function loadArtifactRefs(pathnames: string[] | undefined): ArtifactRef[] {
  return (pathnames ?? []).map((pathname, index) =>
    validateValue<ArtifactRef>({
      schema: ArtifactRefSchema,
      cacheKey: `niche-prepare-run-command-artifact-ref-${index}`,
      value: readRequiredJsonFileStrict(pathname, `artifact ref ${pathname}`),
      label: `artifact ref ${pathname}`,
    }),
  );
}

function loadEvidenceBundleRefs(pathnames: string[] | undefined): EvidenceBundleRef[] {
  return (pathnames ?? []).map((pathname, index) =>
    validateValue<EvidenceBundleRef>({
      schema: EvidenceBundleRefSchema,
      cacheKey: `niche-prepare-run-command-evidence-bundle-${index}`,
      value: readRequiredJsonFileStrict(pathname, `evidence bundle ref ${pathname}`),
      label: `evidence bundle ref ${pathname}`,
    }),
  );
}

function resolveBenchmarkCaseRef(opts: NichePrepareRunOptions): BenchmarkCaseReference | undefined {
  if (!opts.benchmarkCaseKind && !opts.benchmarkCaseId) {
    return undefined;
  }
  if (!opts.benchmarkCaseKind || !opts.benchmarkCaseId) {
    throw new Error(
      "benchmarkCaseKind and benchmarkCaseId must be provided together when preparing a benchmark case reference.",
    );
  }
  return {
    case_kind: opts.benchmarkCaseKind,
    case_id: opts.benchmarkCaseId,
  };
}

export async function nichePrepareRunCommand(
  opts: NichePrepareRunOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<PreparedNicheRunSeed> {
  if (!opts.outPath && !opts.json) {
    throw new Error("Pass --out to write the prepared seed, or --json to print it.");
  }

  // Track temp files created for --from-program so we can clean them up
  const tempFiles: string[] = [];

  // Resolve artifact paths from the program store when --from-program is given
  if (opts.nicheProgramId) {
    const compilation = resolveCompilationArtifacts(opts.nicheProgramId, process.env);
    if (!opts.manifestPath) {
      const manifests = resolveManifestArtifacts(opts.nicheProgramId, process.env);
      opts.manifestPath =
        opts.manifestKind === "baseline"
          ? manifests.baselineManifestPath
          : manifests.candidateManifestPath;
    }
    if (!opts.domainPackPath) {
      const tmpPath = path.join(os.tmpdir(), `niche-domain-pack-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, JSON.stringify(compilation.domainPack));
      opts.domainPackPath = tmpPath;
      tempFiles.push(tmpPath);
    }
    if (!opts.sourceAccessManifestPath) {
      const tmpPath = path.join(os.tmpdir(), `niche-sam-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, JSON.stringify(compilation.sourceAccessManifest));
      opts.sourceAccessManifestPath = tmpPath;
      tempFiles.push(tmpPath);
    }
    if (!opts.readinessReportPath) {
      opts.readinessReportPath = compilation.readinessReportPath;
    }
  }

  try {
    if (!opts.manifestPath) {
      throw new Error("--manifest is required (or use --from-program to resolve it automatically).");
    }
    if (!opts.domainPackPath) {
      throw new Error(
        "--domain-pack is required (or use --from-program to resolve it automatically).",
      );
    }
    if (!opts.sourceAccessManifestPath) {
      throw new Error(
        "--source-access-manifest is required (or use --from-program to resolve it automatically).",
      );
    }

    const manifest = loadManifest(opts.manifestKind, opts.manifestPath);
    const domainPack = validateValue<DomainPack>({
      schema: DomainPackSchema,
      cacheKey: "niche-prepare-run-command-domain-pack",
      value: readRequiredJsonFileStrict(opts.domainPackPath, `domain pack ${opts.domainPackPath}`),
      label: "domain pack",
    });
    const sourceAccessManifest = validateValue<SourceAccessManifest>({
      schema: SourceAccessManifestSchema,
      cacheKey: "niche-prepare-run-command-source-access-manifest",
      value: readRequiredJsonFileStrict(
        opts.sourceAccessManifestPath,
        `source access manifest ${opts.sourceAccessManifestPath}`,
      ),
      label: "source access manifest",
    });
    const actionPolicyRuntime = validateValue<PreparedNicheActionPolicyRuntime>({
      schema: PreparedNicheActionPolicyRuntimeSchema,
      cacheKey: "niche-prepare-run-command-action-policy-runtime",
      value: readRequiredJsonFileStrict(
        opts.actionPolicyRuntimePath,
        `action policy runtime ${opts.actionPolicyRuntimePath}`,
      ),
      label: "action policy runtime",
    });
    const environmentSnapshot = opts.environmentSnapshotPath
      ? validateValue<PreparedNicheEnvironmentSnapshot>({
          schema: PreparedNicheEnvironmentSnapshotSchema,
          cacheKey: "niche-prepare-run-command-environment-snapshot",
          value: readRequiredJsonFileStrict(
            opts.environmentSnapshotPath,
            `environment snapshot ${opts.environmentSnapshotPath}`,
          ),
          label: "environment snapshot",
        })
      : undefined;
    const readinessReport = resolveSpecializationReadiness({
      nicheProgramId: manifest.niche_program_id,
      readinessReportPath: opts.readinessReportPath,
      env: process.env,
    });
    if (domainPack.niche_program_id !== readinessReport.niche_program_id) {
      throw new Error(
        `readiness_report.niche_program_id ${JSON.stringify(readinessReport.niche_program_id)} must match domain_pack.niche_program_id ${JSON.stringify(domainPack.niche_program_id)}.`,
      );
    }

    const seed = prepareNicheRunSeed({
      manifest_kind: opts.manifestKind,
      manifest,
      domain_pack: domainPack,
      source_access_manifest: sourceAccessManifest,
      action_policy_runtime: actionPolicyRuntime,
      verifier_pack_id: opts.verifierPackId,
      verifier_pack_version: opts.verifierPackVersion,
      mode: opts.mode,
      runtime_snapshot_id: opts.runtimeSnapshotId,
      context_bundle_id: opts.contextBundleId,
      determinism_policy_id: opts.determinismPolicyId,
      random_seed: opts.randomSeed,
      replayability_status: opts.replayabilityStatus,
      determinism_notes: opts.determinismNotes,
      readiness_report_id: readinessReport.readiness_report_id,
      planner_version_id: opts.plannerVersionId,
      action_policy_version_id: opts.actionPolicyVersionId,
      verifier_pack_version_id: opts.verifierPackVersionId,
      retrieval_stack_version_id: opts.retrievalStackVersionId,
      grader_set_version_id: opts.graderSetVersionId,
      artifact_refs: loadArtifactRefs(opts.artifactRefPaths),
      evidence_bundle_refs: loadEvidenceBundleRefs(opts.evidenceBundlePaths),
      benchmark_suite_id: opts.benchmarkSuiteId,
      benchmark_arm_id: opts.benchmarkArmId,
      benchmark_case_ref: resolveBenchmarkCaseRef(opts),
      suite_hash: opts.suiteHash,
      fixture_version: opts.fixtureVersion,
      environment_snapshot: environmentSnapshot,
    } satisfies PrepareNicheRunSeedParams);

    if (opts.outPath) {
      saveJsonFile(opts.outPath, seed);
      if (!opts.json) {
        runtime.log(`Wrote prepared Niche run seed to ${opts.outPath}`);
      }
    }
    if (opts.json) {
      runtime.log(JSON.stringify(seed, null, 2));
    }

    return seed;
  } finally {
    // Best-effort cleanup of temp files created for --from-program
    for (const tmpFile of tempFiles) {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
