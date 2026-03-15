import fs from "node:fs";
import path from "node:path";
import {
  getActiveNicheRuntimeState,
  getLatestNicheCompilationRecordForProgram,
  listBenchmarkResultRecords,
  listNichePrograms,
} from "./index.js";
import { resolveNicheStoreRoots, type NicheStoreRoots } from "./paths.js";

export type GcCandidate = {
  file_path: string;
  store_root: string;
  size_bytes: number;
  created_at: string | null;
  artifact_id: string;
};

export type GcPlan = {
  candidates: GcCandidate[];
  total_size_bytes: number;
  protected_artifact_ids: Set<string>;
  scanned_files: number;
};

export type GcResult = {
  deleted: GcCandidate[];
  total_freed_bytes: number;
  errors: Array<{ file_path: string; error: string }>;
};

function collectReferencedIdsFromActiveStacks(env: NodeJS.ProcessEnv): Set<string> {
  const referenced = new Set<string>();
  const state = getActiveNicheRuntimeState(env);
  for (const stack of state.stacks) {
    if (stack.release_mode === "rolled_back") continue;
    referenced.add(stack.active_stack_id);
    referenced.add(stack.candidate_manifest_id);
    referenced.add(stack.niche_program_id);
  }
  return referenced;
}

function collectReferencedIdsFromPrograms(env: NodeJS.ProcessEnv): Set<string> {
  const referenced = new Set<string>();
  for (const program of listNichePrograms(env)) {
    referenced.add(program.niche_program_id);
  }
  return referenced;
}

function collectReferencedIdsFromBenchmarks(env: NodeJS.ProcessEnv, keepLast: number): Set<string> {
  const referenced = new Set<string>();
  const records = listBenchmarkResultRecords({ env });

  // Group by suite and keep the N most recent per suite
  const bySuite = new Map<string, typeof records>();
  for (const record of records) {
    const suiteId = record.summary.benchmark_suite_id;
    if (!bySuite.has(suiteId)) bySuite.set(suiteId, []);
    bySuite.get(suiteId)!.push(record);
  }

  for (const [, suiteRecords] of bySuite) {
    const sorted = suiteRecords.toSorted(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
    for (const record of sorted.slice(0, keepLast)) {
      referenced.add(record.benchmark_result_record_id);
      referenced.add(record.baseline_manifest_id);
      referenced.add(record.candidate_manifest_id);
      referenced.add(record.summary.benchmark_suite_id);
    }
  }

  return referenced;
}

function collectReferencedIdsFromCompilations(env: NodeJS.ProcessEnv): Set<string> {
  const referenced = new Set<string>();
  for (const program of listNichePrograms(env)) {
    const latest = getLatestNicheCompilationRecordForProgram(program.niche_program_id, env);
    if (latest) {
      referenced.add(latest.compilation_id);
      referenced.add(`${program.niche_program_id}-readiness`);
    }
  }
  return referenced;
}

function scanStoreDirectory(
  dirPath: string,
  storeRoot: string,
  keepDays: number,
  protectedIds: Set<string>,
): { candidates: GcCandidate[]; scanned: number } {
  const candidates: GcCandidate[] = [];
  let scanned = 0;

  if (!fs.existsSync(dirPath)) {
    return { candidates, scanned };
  }

  const cutoffMs = Date.now() - keepDays * 24 * 60 * 60 * 1000;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // Recurse into subdirectories (e.g., artifact type dirs)
      const sub = scanStoreDirectory(fullPath, storeRoot, keepDays, protectedIds);
      candidates.push(...sub.candidates);
      scanned += sub.scanned;
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    scanned++;

    const fileId = entry.name.replace(/\.json$/u, "");
    const idParts = fileId.split("--");
    if (idParts.some((part) => protectedIds.has(part)) || protectedIds.has(fileId)) continue;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.mtimeMs > cutoffMs) continue;

    candidates.push({
      file_path: fullPath,
      store_root: storeRoot,
      size_bytes: stat.size,
      created_at: stat.mtime.toISOString(),
      artifact_id: fileId,
    });
  }

  return { candidates, scanned };
}

export function planGarbageCollection(params: {
  keepLast?: number;
  keepDays?: number;
  env?: NodeJS.ProcessEnv;
}): GcPlan {
  const env = params.env ?? process.env;
  const keepLast = params.keepLast ?? 3;
  const keepDays = params.keepDays ?? 30;
  const roots = resolveNicheStoreRoots(env);

  // Build the set of protected artifact IDs
  const protectedIds = new Set<string>([
    ...collectReferencedIdsFromActiveStacks(env),
    ...collectReferencedIdsFromPrograms(env),
    ...collectReferencedIdsFromBenchmarks(env, keepLast),
    ...collectReferencedIdsFromCompilations(env),
  ]);

  // Scan the GC-eligible store directories
  const gcDirs: Array<[string, string]> = [
    [roots.benchmarkRuns, "benchmarkRuns"],
    [roots.traces, "traces"],
    [roots.replayBundles, "replayBundles"],
    [roots.artifacts, "artifacts"],
    [roots.domainPacks, "domainPacks"],
    [roots.lineage, "lineage"],
  ];

  let allCandidates: GcCandidate[] = [];
  let totalScanned = 0;

  for (const [dirPath, storeRoot] of gcDirs) {
    const { candidates, scanned } = scanStoreDirectory(dirPath, storeRoot, keepDays, protectedIds);
    allCandidates.push(...candidates);
    totalScanned += scanned;
  }

  // Deduplicate by file path
  const seen = new Set<string>();
  allCandidates = allCandidates.filter((c) => {
    if (seen.has(c.file_path)) return false;
    seen.add(c.file_path);
    return true;
  });

  return {
    candidates: allCandidates.toSorted((a, b) => a.file_path.localeCompare(b.file_path)),
    total_size_bytes: allCandidates.reduce((sum, c) => sum + c.size_bytes, 0),
    protected_artifact_ids: protectedIds,
    scanned_files: totalScanned,
  };
}

export function executeGarbageCollection(plan: GcPlan): GcResult {
  const deleted: GcCandidate[] = [];
  const errors: Array<{ file_path: string; error: string }> = [];

  for (const candidate of plan.candidates) {
    try {
      fs.unlinkSync(candidate.file_path);
      deleted.push(candidate);
    } catch (err) {
      errors.push({
        file_path: candidate.file_path,
        error: String(err),
      });
    }
  }

  return {
    deleted,
    total_freed_bytes: deleted.reduce((sum, c) => sum + c.size_bytes, 0),
    errors,
  };
}
