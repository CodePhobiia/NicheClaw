import path from "node:path";
import { saveJsonFile } from "../../infra/json-file.js";
import { buildStarterReleaseArtifacts } from "../../niche/domain/index.js";
import { readRequiredJsonFileStrict } from "../../niche/json.js";
import type { BaselineManifest, CandidateManifest } from "../../niche/schema/index.js";
import {
  getBaselineManifest,
  getCandidateManifest,
  getLatestNicheCompilationRecordForProgram,
  getNicheProgram,
  listBenchmarkResultRecords,
  resolveManifestStorePath,
  resolveNicheStateRoot,
} from "../../niche/store/index.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type NichePrepareReleaseOptions = {
  nicheProgramId: string;
  benchmarkResultPath?: string;
  baselineManifestId?: string;
  candidateManifestId?: string;
  json?: boolean;
};

export type NichePrepareReleaseResult = {
  niche_program_id: string;
  baseline_manifest_path: string;
  candidate_manifest_path: string;
  benchmark_result_path: string;
  verifier_metrics_path: string;
  monitor_definition_path: string;
  component_artifact_refs_path: string;
};

export async function nichePrepareReleaseCommand(
  opts: NichePrepareReleaseOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NichePrepareReleaseResult> {
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

  // Resolve manifests — from explicit IDs, or discover from store.
  let baselineManifest: BaselineManifest | null = null;
  let candidateManifest: CandidateManifest | null = null;
  let baselineManifestPath: string;
  let candidateManifestPath: string;

  if (opts.baselineManifestId) {
    baselineManifest = getBaselineManifest(opts.baselineManifestId, process.env);
    if (!baselineManifest) {
      throw new Error(`Baseline manifest ${opts.baselineManifestId} not found in store.`);
    }
    baselineManifestPath = resolveManifestStorePath(
      "baseline",
      opts.baselineManifestId,
      process.env,
    );
  } else {
    // Find the latest benchmark result for this program to discover the manifest IDs.
    const benchmarkResults = listBenchmarkResultRecords({ env: process.env }).filter((r) =>
      r.summary.benchmark_suite_id.startsWith(opts.nicheProgramId),
    );
    if (benchmarkResults.length > 0) {
      const latest = benchmarkResults[benchmarkResults.length - 1]!;
      baselineManifest = getBaselineManifest(latest.summary.baseline_arm_id, process.env);
      if (baselineManifest) {
        baselineManifestPath = resolveManifestStorePath(
          "baseline",
          baselineManifest.baseline_manifest_id,
          process.env,
        );
      }
    }
    if (!baselineManifest) {
      throw new Error(
        `Missing baseline manifest for niche program "${opts.nicheProgramId}".\nRun: openclaw niche prepare-benchmark --niche-program-id ${opts.nicheProgramId} --emit-release-artifacts`,
      );
    }
    baselineManifestPath = resolveManifestStorePath(
      "baseline",
      baselineManifest.baseline_manifest_id,
      process.env,
    );
  }

  if (opts.candidateManifestId) {
    candidateManifest = getCandidateManifest(opts.candidateManifestId, process.env);
    if (!candidateManifest) {
      throw new Error(`Candidate manifest ${opts.candidateManifestId} not found in store.`);
    }
    candidateManifestPath = resolveManifestStorePath(
      "candidate",
      opts.candidateManifestId,
      process.env,
    );
  } else {
    // Discover from benchmark results or compilation-derived ID.
    const benchmarkResults = listBenchmarkResultRecords({ env: process.env }).filter((r) =>
      r.summary.benchmark_suite_id.startsWith(opts.nicheProgramId),
    );
    if (benchmarkResults.length > 0) {
      const latest = benchmarkResults[benchmarkResults.length - 1]!;
      candidateManifest = getCandidateManifest(latest.summary.candidate_arm_id, process.env);
      if (candidateManifest) {
        candidateManifestPath = resolveManifestStorePath(
          "candidate",
          candidateManifest.candidate_manifest_id,
          process.env,
        );
      }
    }
    if (!candidateManifest) {
      throw new Error(
        `Missing candidate manifest for niche program "${opts.nicheProgramId}".\nRun: openclaw niche prepare-benchmark --niche-program-id ${opts.nicheProgramId} --emit-release-artifacts`,
      );
    }
    candidateManifestPath = resolveManifestStorePath(
      "candidate",
      candidateManifest.candidate_manifest_id,
      process.env,
    );
  }

  // Resolve benchmark result path.
  let benchmarkResultPath: string;
  if (opts.benchmarkResultPath) {
    benchmarkResultPath = opts.benchmarkResultPath;
    // Validate it's readable.
    readRequiredJsonFileStrict(benchmarkResultPath);
  } else {
    // Find the latest benchmark result for this program.
    const results = listBenchmarkResultRecords({
      candidateManifestId: candidateManifest.candidate_manifest_id,
      env: process.env,
    });
    if (results.length === 0) {
      throw new Error(
        `Missing benchmark results for niche program "${opts.nicheProgramId}".\nRun: openclaw niche benchmark --from-program ${opts.nicheProgramId} --suite <path> --live`,
      );
    }
    // Use the most recent result.
    const latest = results[results.length - 1]!;
    const { resolveBenchmarkRunStorePath } = await import("../../niche/store/index.js");
    benchmarkResultPath = resolveBenchmarkRunStorePath(
      latest.benchmark_result_record_id,
      process.env,
    );
  }

  // Build release artifacts.
  const releaseArtifacts = buildStarterReleaseArtifacts({
    compilationRecord,
    baselineManifest,
    candidateManifest,
  });

  const stateRoot = resolveNicheStateRoot(process.env);
  const preparedDir = path.join(stateRoot, "prepared");

  const verifierPath = path.join(preparedDir, `${opts.nicheProgramId}-verifier-metrics.json`);
  saveJsonFile(verifierPath, releaseArtifacts.verifierMetrics);

  const monitorPath = path.join(preparedDir, `${opts.nicheProgramId}-monitor-definition.json`);
  saveJsonFile(monitorPath, releaseArtifacts.monitorDefinition);

  // Write each artifact ref as a separate file (release command expects one per --component-artifact-ref).
  const refsDir = path.join(preparedDir, `${opts.nicheProgramId}-artifact-refs`);
  const refPaths: string[] = [];
  for (const ref of releaseArtifacts.componentArtifactRefs) {
    const refPath = path.join(refsDir, `${ref.artifact_id}.json`);
    saveJsonFile(refPath, ref);
    refPaths.push(refPath);
  }

  // Also write a combined refs file for convenience.
  const combinedRefsPath = path.join(
    preparedDir,
    `${opts.nicheProgramId}-component-artifact-refs.json`,
  );
  saveJsonFile(combinedRefsPath, refPaths);

  const result: NichePrepareReleaseResult = {
    niche_program_id: opts.nicheProgramId,
    baseline_manifest_path: baselineManifestPath,
    candidate_manifest_path: candidateManifestPath,
    benchmark_result_path: benchmarkResultPath,
    verifier_metrics_path: verifierPath,
    monitor_definition_path: monitorPath,
    component_artifact_refs_path: combinedRefsPath,
  };

  runtime.log(opts.json ? JSON.stringify(result, null, 2) : formatSummary(result, refPaths));
  return result;
}

function formatSummary(result: NichePrepareReleaseResult, refPaths: string[]): string {
  const lines = [
    `Prepared release artifacts for ${result.niche_program_id}.`,
    `Baseline manifest: ${result.baseline_manifest_path}`,
    `Candidate manifest: ${result.candidate_manifest_path}`,
    `Benchmark result: ${result.benchmark_result_path}`,
    `Verifier metrics: ${result.verifier_metrics_path}`,
    `Monitor definition: ${result.monitor_definition_path}`,
    `Component artifact refs (${refPaths.length}): ${result.component_artifact_refs_path}`,
    "",
    "Next: openclaw niche release \\",
    `  --baseline-manifest ${result.baseline_manifest_path} \\`,
    `  --candidate-manifest ${result.candidate_manifest_path} \\`,
    `  --benchmark-result ${result.benchmark_result_path} \\`,
    `  --verifier-metrics ${result.verifier_metrics_path} \\`,
    `  --monitor ${result.monitor_definition_path} \\`,
    ...refPaths.map((p) => `  --component-artifact-ref ${p} \\`),
    "  --json",
  ];
  return lines.join("\n");
}
