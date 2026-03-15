import fs from "node:fs";
import path from "node:path";
import { saveJsonFile } from "../../infra/json-file.js";
import {
  ensureStoredBaselineManifest,
  ensureStoredCandidateManifest,
  ensureStoredNicheCompilationRecord,
  ensureStoredNicheProgram,
  ensureStoredReadinessReport,
  getBaselineManifest,
  getCandidateManifest,
  getBenchmarkResultRecord,
  getLatestNicheCompilationRecordForProgram,
  getNicheProgram,
  getReadinessReportForProgram,
  listBenchmarkResultRecords,
  writeBenchmarkResultRecord,
} from "./index.js";

export type ExportBundleManifest = {
  export_timestamp: string;
  niche_program_ids: string[];
  artifact_count: number;
  sections: string[];
};

export type ExportBundleResult = {
  bundle_dir: string;
  manifest: ExportBundleManifest;
  program_count: number;
  compilation_count: number;
  benchmark_count: number;
  readiness_count: number;
  manifest_count: number;
};

export type ImportBundleResult = {
  imported_programs: number;
  imported_compilations: number;
  imported_benchmarks: number;
  imported_readiness: number;
  imported_manifests: number;
  skipped_duplicates: number;
  errors: string[];
};

export type ImportDryRunResult = {
  would_import: {
    programs: string[];
    compilations: string[];
    benchmarks: string[];
    readiness: string[];
    baselines: string[];
    candidates: string[];
  };
  already_exists: {
    programs: string[];
    compilations: string[];
    benchmarks: string[];
  };
};

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFiles(dirPath: string): Array<{ name: string; data: unknown }> {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => {
      const data = JSON.parse(fs.readFileSync(path.join(dirPath, e.name), "utf-8"));
      return { name: e.name, data };
    });
}

export function exportNicheBundle(params: {
  nicheProgramIds: string[];
  outDir: string;
  env?: NodeJS.ProcessEnv;
}): ExportBundleResult {
  const env = params.env ?? process.env;
  const outDir = params.outDir;
  ensureDir(outDir);

  const sections: string[] = [];
  let compilationCount = 0;
  let benchmarkCount = 0;
  let readinessCount = 0;
  let manifestCount = 0;

  // Programs
  const programsDir = path.join(outDir, "programs");
  ensureDir(programsDir);
  sections.push("programs");
  for (const programId of params.nicheProgramIds) {
    const program = getNicheProgram(programId, env);
    if (!program) {
      throw new Error(`Program ${programId} not found.`);
    }
    saveJsonFile(path.join(programsDir, `${programId}.json`), program);
  }

  // Compilations
  const compilationsDir = path.join(outDir, "compilations");
  ensureDir(compilationsDir);
  sections.push("compilations");
  for (const programId of params.nicheProgramIds) {
    const compilation = getLatestNicheCompilationRecordForProgram(programId, env);
    if (compilation) {
      saveJsonFile(path.join(compilationsDir, `${compilation.compilation_id}.json`), compilation);
      compilationCount++;
    }
  }

  // Readiness reports
  const readinessDir = path.join(outDir, "readiness-reports");
  ensureDir(readinessDir);
  sections.push("readiness-reports");
  for (const programId of params.nicheProgramIds) {
    const report = getReadinessReportForProgram(programId, env);
    if (report) {
      saveJsonFile(path.join(readinessDir, `${report.readiness_report_id}.json`), report);
      readinessCount++;
    }
  }

  // Benchmark results
  const benchmarksDir = path.join(outDir, "benchmark-runs");
  ensureDir(benchmarksDir);
  sections.push("benchmark-runs");
  for (const programId of params.nicheProgramIds) {
    const records = listBenchmarkResultRecords({ env }).filter((r) =>
      r.summary.benchmark_suite_id.startsWith(programId),
    );
    for (const record of records) {
      saveJsonFile(path.join(benchmarksDir, `${record.benchmark_result_record_id}.json`), record);
      benchmarkCount++;
    }
  }

  // Manifests
  const manifestsDir = path.join(outDir, "manifests");
  const baselineDir = path.join(manifestsDir, "baseline");
  const candidateDir = path.join(manifestsDir, "candidate");
  ensureDir(baselineDir);
  ensureDir(candidateDir);
  sections.push("manifests");

  const exportedManifestIds = new Set<string>();
  for (const programId of params.nicheProgramIds) {
    const compilation = getLatestNicheCompilationRecordForProgram(programId, env);
    if (!compilation) continue;

    // Look for manifests referencing this compilation
    const records = listBenchmarkResultRecords({ env }).filter((r) =>
      r.summary.benchmark_suite_id.startsWith(programId),
    );
    for (const record of records) {
      if (!exportedManifestIds.has(record.baseline_manifest_id)) {
        const baseline = getBaselineManifest(record.baseline_manifest_id, env);
        if (baseline) {
          saveJsonFile(path.join(baselineDir, `${record.baseline_manifest_id}.json`), baseline);
          exportedManifestIds.add(record.baseline_manifest_id);
          manifestCount++;
        }
      }
      if (!exportedManifestIds.has(record.candidate_manifest_id)) {
        const candidate = getCandidateManifest(record.candidate_manifest_id, env);
        if (candidate) {
          saveJsonFile(path.join(candidateDir, `${record.candidate_manifest_id}.json`), candidate);
          exportedManifestIds.add(record.candidate_manifest_id);
          manifestCount++;
        }
      }
    }
  }

  // Bundle manifest
  const bundleManifest: ExportBundleManifest = {
    export_timestamp: new Date().toISOString(),
    niche_program_ids: [...params.nicheProgramIds].toSorted(),
    artifact_count:
      params.nicheProgramIds.length +
      compilationCount +
      benchmarkCount +
      readinessCount +
      manifestCount,
    sections,
  };
  saveJsonFile(path.join(outDir, "manifest.json"), bundleManifest);

  return {
    bundle_dir: outDir,
    manifest: bundleManifest,
    program_count: params.nicheProgramIds.length,
    compilation_count: compilationCount,
    benchmark_count: benchmarkCount,
    readiness_count: readinessCount,
    manifest_count: manifestCount,
  };
}

export function importNicheBundleDryRun(params: {
  bundleDir: string;
  env?: NodeJS.ProcessEnv;
}): ImportDryRunResult {
  const env = params.env ?? process.env;
  const bundleDir = params.bundleDir;

  const wouldImport = {
    programs: [] as string[],
    compilations: [] as string[],
    benchmarks: [] as string[],
    readiness: [] as string[],
    baselines: [] as string[],
    candidates: [] as string[],
  };
  const alreadyExists = {
    programs: [] as string[],
    compilations: [] as string[],
    benchmarks: [] as string[],
  };

  for (const { name, data } of readJsonFiles(path.join(bundleDir, "programs"))) {
    const id = name.replace(/\.json$/u, "");
    const existing = getNicheProgram(id, env);
    if (existing) {
      alreadyExists.programs.push(id);
    } else {
      wouldImport.programs.push(id);
    }
  }

  for (const { name } of readJsonFiles(path.join(bundleDir, "compilations"))) {
    const id = name.replace(/\.json$/u, "");
    wouldImport.compilations.push(id);
  }

  for (const { name } of readJsonFiles(path.join(bundleDir, "benchmark-runs"))) {
    const id = name.replace(/\.json$/u, "");
    const existing = getBenchmarkResultRecord(id, env);
    if (existing) {
      alreadyExists.benchmarks.push(id);
    } else {
      wouldImport.benchmarks.push(id);
    }
  }

  for (const { name } of readJsonFiles(path.join(bundleDir, "readiness-reports"))) {
    const id = name.replace(/\.json$/u, "");
    wouldImport.readiness.push(id);
  }

  for (const { name } of readJsonFiles(path.join(bundleDir, "manifests", "baseline"))) {
    const id = name.replace(/\.json$/u, "");
    wouldImport.baselines.push(id);
  }

  for (const { name } of readJsonFiles(path.join(bundleDir, "manifests", "candidate"))) {
    const id = name.replace(/\.json$/u, "");
    wouldImport.candidates.push(id);
  }

  return { would_import: wouldImport, already_exists: alreadyExists };
}

export function importNicheBundle(params: {
  bundleDir: string;
  force?: boolean;
  env?: NodeJS.ProcessEnv;
}): ImportBundleResult {
  const env = params.env ?? process.env;
  const bundleDir = params.bundleDir;
  const force = params.force ?? false;

  let importedPrograms = 0;
  let importedCompilations = 0;
  let importedBenchmarks = 0;
  let importedReadiness = 0;
  let importedManifests = 0;
  let skippedDuplicates = 0;
  const errors: string[] = [];

  // Import programs
  for (const { data } of readJsonFiles(path.join(bundleDir, "programs"))) {
    try {
      ensureStoredNicheProgram(data as Parameters<typeof ensureStoredNicheProgram>[0], env);
      importedPrograms++;
    } catch (err) {
      if (!force && String(err).includes("already stored")) {
        skippedDuplicates++;
      } else if (force) {
        // With force, we skip duplicates silently
        skippedDuplicates++;
      } else {
        errors.push(`Program: ${String(err)}`);
      }
    }
  }

  // Import compilations
  for (const { data } of readJsonFiles(path.join(bundleDir, "compilations"))) {
    try {
      ensureStoredNicheCompilationRecord(
        data as Parameters<typeof ensureStoredNicheCompilationRecord>[0],
        env,
      );
      importedCompilations++;
    } catch (err) {
      if (String(err).includes("already stored") || String(err).includes("already exists")) {
        skippedDuplicates++;
      } else {
        errors.push(`Compilation: ${String(err)}`);
      }
    }
  }

  // Import readiness reports
  for (const { data } of readJsonFiles(path.join(bundleDir, "readiness-reports"))) {
    try {
      ensureStoredReadinessReport(data as Parameters<typeof ensureStoredReadinessReport>[0], env);
      importedReadiness++;
    } catch (err) {
      if (String(err).includes("already stored") || String(err).includes("already exists")) {
        skippedDuplicates++;
      } else {
        errors.push(`Readiness: ${String(err)}`);
      }
    }
  }

  // Import baseline manifests
  for (const { data } of readJsonFiles(path.join(bundleDir, "manifests", "baseline"))) {
    try {
      ensureStoredBaselineManifest(data as Parameters<typeof ensureStoredBaselineManifest>[0], env);
      importedManifests++;
    } catch (err) {
      if (String(err).includes("already stored") || String(err).includes("already exists")) {
        skippedDuplicates++;
      } else {
        errors.push(`Baseline manifest: ${String(err)}`);
      }
    }
  }

  // Import candidate manifests
  for (const { data } of readJsonFiles(path.join(bundleDir, "manifests", "candidate"))) {
    try {
      ensureStoredCandidateManifest(
        data as Parameters<typeof ensureStoredCandidateManifest>[0],
        env,
      );
      importedManifests++;
    } catch (err) {
      if (String(err).includes("already stored") || String(err).includes("already exists")) {
        skippedDuplicates++;
      } else {
        errors.push(`Candidate manifest: ${String(err)}`);
      }
    }
  }

  // Import benchmark results
  for (const { data } of readJsonFiles(path.join(bundleDir, "benchmark-runs"))) {
    try {
      const record = data as Parameters<typeof writeBenchmarkResultRecord>[0];
      const existing = getBenchmarkResultRecord(record.benchmark_result_record_id, env);
      if (existing) {
        skippedDuplicates++;
      } else {
        writeBenchmarkResultRecord(record, env);
        importedBenchmarks++;
      }
    } catch (err) {
      errors.push(`Benchmark: ${String(err)}`);
    }
  }

  return {
    imported_programs: importedPrograms,
    imported_compilations: importedCompilations,
    imported_benchmarks: importedBenchmarks,
    imported_readiness: importedReadiness,
    imported_manifests: importedManifests,
    skipped_duplicates: skippedDuplicates,
    errors,
  };
}
