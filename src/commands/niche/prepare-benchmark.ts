import path from "node:path";
import { saveJsonFile } from "../../infra/json-file.js";
import {
  createAtomicBenchmarkSuite,
  getAtomicBenchmarkSuite,
} from "../../niche/benchmark/suite-registry.js";
import {
  buildBenchmarkSuiteFromCompilation,
  buildStarterManifests,
  buildStarterReleaseArtifacts,
} from "../../niche/domain/index.js";
import {
  ensureStoredBaselineManifest,
  ensureStoredCandidateManifest,
  getBaselineManifest,
  getCandidateManifest,
  getLatestNicheCompilationRecordForProgram,
  getNicheProgram,
  resolveManifestStorePath,
  resolveNicheStateRoot,
  resolveNicheStoreRoots,
} from "../../niche/store/index.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type NichePrepareBenchmarkOptions = {
  nicheProgramId: string;
  provider?: string;
  modelId?: string;
  apiMode?: string;
  suiteId?: string;
  suiteVersion?: string;
  fixtureVersion?: string;
  emitReleaseArtifacts?: boolean;
  json?: boolean;
};

export type NichePrepareBenchmarkResult = {
  niche_program_id: string;
  baseline_manifest_path: string;
  candidate_manifest_path: string;
  benchmark_suite_path: string;
  verifier_metrics_path?: string;
  monitor_definition_path?: string;
  component_artifact_refs_path?: string;
};

export async function nichePrepareBenchmarkCommand(
  opts: NichePrepareBenchmarkOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NichePrepareBenchmarkResult> {
  const nicheProgram = getNicheProgram(opts.nicheProgramId, process.env);
  if (!nicheProgram) {
    throw new Error(
      `Missing niche program "${opts.nicheProgramId}".\nRun: openclaw niche create --program <path>`,
    );
  }

  const compilationRecord = getLatestNicheCompilationRecordForProgram(
    opts.nicheProgramId,
    process.env,
  );
  if (!compilationRecord) {
    throw new Error(
      `Missing compilation record for niche program "${opts.nicheProgramId}".\nRun: openclaw niche compile --niche-program-id ${opts.nicheProgramId} --source <paths...>`,
    );
  }

  // Build manifests from compilation.
  const provider = opts.provider ?? nicheProgram.runtime_stack.planner_runtime.provider;
  const modelId = opts.modelId ?? nicheProgram.runtime_stack.planner_runtime.model_id;
  const apiMode = opts.apiMode ?? nicheProgram.runtime_stack.planner_runtime.api_mode ?? "messages";
  const toolAllowlist = [...nicheProgram.allowed_tools];

  const manifests = buildStarterManifests({
    nicheProgramId: opts.nicheProgramId,
    compilationRecord,
    provider,
    modelId,
    apiMode,
    toolAllowlist,
    benchmarkSuiteId: opts.suiteId,
  });

  // Store manifests. If they already exist (idempotent re-run), reuse the existing paths.
  // The manifest IDs are deterministic but `created_at` differs between runs, so
  // we check existence first and skip storage if the ID is already stored.
  const baselineId = manifests.baselineManifest.baseline_manifest_id;
  const candidateId = manifests.candidateManifest.candidate_manifest_id;
  const existingBaseline = getBaselineManifest(baselineId, process.env);
  const existingCandidate = getCandidateManifest(candidateId, process.env);

  const baselineResult = existingBaseline
    ? {
        path: resolveManifestStorePath("baseline", baselineId, process.env),
        manifest: existingBaseline,
      }
    : ensureStoredBaselineManifest(manifests.baselineManifest, process.env);
  const candidateResult = existingCandidate
    ? {
        path: resolveManifestStorePath("candidate", candidateId, process.env),
        manifest: existingCandidate,
      }
    : ensureStoredCandidateManifest(manifests.candidateManifest, process.env);

  // Build benchmark suite from compilation seed hints.
  const suite = buildBenchmarkSuiteFromCompilation({
    compilationRecord,
    suiteId: opts.suiteId,
    suiteVersion: opts.suiteVersion,
    fixtureVersion: opts.fixtureVersion,
  });

  // Store suite (idempotent: skip if already stored).
  const existingSuite = getAtomicBenchmarkSuite(suite.metadata.benchmark_suite_id, process.env);
  let suitePath: string;
  if (existingSuite) {
    const roots = resolveNicheStoreRoots(process.env);
    suitePath = path.join(roots.benchmarkSuites, `${suite.metadata.benchmark_suite_id}.json`);
  } else {
    suitePath = createAtomicBenchmarkSuite(suite, process.env);
  }

  const result: NichePrepareBenchmarkResult = {
    niche_program_id: opts.nicheProgramId,
    baseline_manifest_path: baselineResult.path,
    candidate_manifest_path: candidateResult.path,
    benchmark_suite_path: suitePath,
  };

  // Optionally emit starter release artifacts.
  if (opts.emitReleaseArtifacts) {
    const releaseArtifacts = buildStarterReleaseArtifacts({
      compilationRecord,
      baselineManifest: manifests.baselineManifest,
      candidateManifest: manifests.candidateManifest,
    });

    const stateRoot = resolveNicheStateRoot(process.env);
    const preparedDir = path.join(stateRoot, "prepared");

    const verifierPath = path.join(preparedDir, `${opts.nicheProgramId}-verifier-metrics.json`);
    saveJsonFile(verifierPath, releaseArtifacts.verifierMetrics);
    result.verifier_metrics_path = verifierPath;

    const monitorPath = path.join(preparedDir, `${opts.nicheProgramId}-monitor-definition.json`);
    saveJsonFile(monitorPath, releaseArtifacts.monitorDefinition);
    result.monitor_definition_path = monitorPath;

    const refsPath = path.join(preparedDir, `${opts.nicheProgramId}-component-artifact-refs.json`);
    saveJsonFile(refsPath, releaseArtifacts.componentArtifactRefs);
    result.component_artifact_refs_path = refsPath;
  }

  runtime.log(opts.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return result;
}

function formatSummary(result: NichePrepareBenchmarkResult): string {
  const lines = [
    `Prepared benchmark artifacts for ${result.niche_program_id}.`,
    `Baseline manifest: ${result.baseline_manifest_path}`,
    `Candidate manifest: ${result.candidate_manifest_path}`,
    `Benchmark suite: ${result.benchmark_suite_path}`,
  ];
  if (result.verifier_metrics_path) {
    lines.push(`Verifier metrics: ${result.verifier_metrics_path}`);
  }
  if (result.monitor_definition_path) {
    lines.push(`Monitor definition: ${result.monitor_definition_path}`);
  }
  if (result.component_artifact_refs_path) {
    lines.push(`Component artifact refs: ${result.component_artifact_refs_path}`);
  }
  lines.push(
    "",
    "Next: openclaw niche benchmark --live \\",
    `  --baseline-manifest ${result.baseline_manifest_path} \\`,
    `  --candidate-manifest ${result.candidate_manifest_path} \\`,
    `  --suite ${result.benchmark_suite_path} --json`,
  );
  return lines.join("\n");
}
