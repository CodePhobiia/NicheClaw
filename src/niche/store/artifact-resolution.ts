import type {
  BaselineManifest,
  BenchmarkResultRecord,
  CandidateManifest,
  DomainPack,
  NicheCompilationRecord,
  NicheProgram,
  ReadinessReport,
  ReadinessStatus,
  SourceAccessManifest,
} from "../schema/index.js";
import { getActiveNicheRuntimeState } from "./active-stack-store.js";
import { listBenchmarkResultRecords } from "./benchmark-run-store.js";
import { getLatestNicheCompilationRecordForProgram } from "./domain-pack-store.js";
import { listBaselineManifests, listCandidateManifests } from "./manifest-store.js";
import {
  resolveManifestStorePath,
  resolveNicheCompilationRecordStorePath,
  resolveReadinessReportStorePath,
} from "./paths.js";
import { getNicheProgram, listNichePrograms } from "./program-store.js";
import { getReadinessReportForProgram } from "./readiness-store.js";

// ---------------------------------------------------------------------------
// Workflow-aware error helpers
// ---------------------------------------------------------------------------

export function buildWorkflowErrorMessage(params: {
  missing: string;
  nicheProgramId: string;
  command: string;
  flags?: string[];
}): string {
  const flagStr = params.flags?.length ? ` ${params.flags.join(" ")}` : "";
  return [
    `Missing ${params.missing} for niche program "${params.nicheProgramId}".`,
    `Run: openclaw niche ${params.command} --niche-program-id ${params.nicheProgramId}${flagStr}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Compilation artifact resolution
// ---------------------------------------------------------------------------

export type ResolvedCompilationArtifacts = {
  compilationRecord: NicheCompilationRecord;
  compilationRecordPath: string;
  sourceAccessManifest: SourceAccessManifest;
  readinessReport: ReadinessReport;
  readinessReportPath: string;
  domainPack: DomainPack;
};

export function resolveCompilationArtifacts(
  nicheProgramId: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCompilationArtifacts {
  const compilationRecord = getLatestNicheCompilationRecordForProgram(nicheProgramId, env);
  if (!compilationRecord) {
    throw new Error(
      buildWorkflowErrorMessage({
        missing: "compilation record",
        nicheProgramId,
        command: "compile",
        flags: ["--source <paths...>"],
      }),
    );
  }

  const readinessReport = getReadinessReportForProgram(nicheProgramId, env);
  if (!readinessReport) {
    throw new Error(
      buildWorkflowErrorMessage({
        missing: "readiness report",
        nicheProgramId,
        command: "compile",
        flags: ["--source <paths...>"],
      }),
    );
  }

  return {
    compilationRecord,
    compilationRecordPath: resolveNicheCompilationRecordStorePath(
      compilationRecord.compilation_id,
      env,
    ),
    sourceAccessManifest: compilationRecord.source_access_manifest,
    readinessReport,
    readinessReportPath: resolveReadinessReportStorePath(readinessReport.readiness_report_id, env),
    domainPack: compilationRecord.domain_pack,
  };
}

// ---------------------------------------------------------------------------
// Manifest artifact resolution
// ---------------------------------------------------------------------------

export type ResolvedManifestArtifacts = {
  baselineManifest: BaselineManifest;
  baselineManifestPath: string;
  candidateManifest: CandidateManifest;
  candidateManifestPath: string;
};

export function resolveManifestArtifacts(
  nicheProgramId: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedManifestArtifacts {
  const baselines = listBaselineManifests(env).filter((m) => m.niche_program_id === nicheProgramId);
  const candidates = listCandidateManifests(env).filter(
    (m) => m.niche_program_id === nicheProgramId,
  );

  if (baselines.length === 0) {
    throw new Error(
      buildWorkflowErrorMessage({
        missing: "baseline manifest",
        nicheProgramId,
        command: "compile",
        flags: ["--source <paths...>", "--emit-manifests"],
      }),
    );
  }
  if (candidates.length === 0) {
    throw new Error(
      buildWorkflowErrorMessage({
        missing: "candidate manifest",
        nicheProgramId,
        command: "compile",
        flags: ["--source <paths...>", "--emit-manifests"],
      }),
    );
  }

  const baseline = baselines.toSorted(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0]!;
  const candidate = candidates.toSorted(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0]!;

  return {
    baselineManifest: baseline,
    baselineManifestPath: resolveManifestStorePath("baseline", baseline.baseline_manifest_id, env),
    candidateManifest: candidate,
    candidateManifestPath: resolveManifestStorePath(
      "candidate",
      candidate.candidate_manifest_id,
      env,
    ),
  };
}

// ---------------------------------------------------------------------------
// Benchmark artifact resolution
// ---------------------------------------------------------------------------

export type ResolvedBenchmarkArtifacts = {
  benchmarkResultRecords: BenchmarkResultRecord[];
};

export function resolveBenchmarkArtifacts(
  nicheProgramId: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedBenchmarkArtifacts {
  const candidates = listCandidateManifests(env).filter(
    (m) => m.niche_program_id === nicheProgramId,
  );
  const candidateIds = new Set(candidates.map((c) => c.candidate_manifest_id));

  const records = listBenchmarkResultRecords({ env }).filter((r) =>
    candidateIds.has(r.candidate_manifest_id),
  );

  if (records.length === 0) {
    throw new Error(
      buildWorkflowErrorMessage({
        missing: "benchmark results",
        nicheProgramId,
        command: "benchmark",
        flags: ["--from-program", nicheProgramId, "--suite <path>", "--live"],
      }),
    );
  }

  return {
    benchmarkResultRecords: records.toSorted(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    ),
  };
}

// ---------------------------------------------------------------------------
// Workflow state resolution
// ---------------------------------------------------------------------------

export type ProgramWorkflowStage =
  | "created"
  | "compiled"
  | "ready"
  | "manifests_built"
  | "benchmarked"
  | "released"
  | "active";

export type ProgramWorkflowState = {
  program: NicheProgram;
  hasCompilation: boolean;
  hasReadiness: boolean;
  readinessStatus: ReadinessStatus | null;
  hasManifests: boolean;
  hasBenchmarks: boolean;
  benchmarkCount: number;
  hasActiveStack: boolean;
  currentStage: ProgramWorkflowStage;
  nextAction: string;
  nextCommand: string;
};

export function resolveProgramWorkflowState(
  nicheProgramId: string,
  env: NodeJS.ProcessEnv = process.env,
): ProgramWorkflowState {
  const program = getNicheProgram(nicheProgramId, env);
  if (!program) {
    throw new Error(
      `Niche program "${nicheProgramId}" not found. Run: openclaw niche create --program <path>`,
    );
  }

  const compilation = getLatestNicheCompilationRecordForProgram(nicheProgramId, env);
  const hasCompilation = compilation !== null;

  const readiness = getReadinessReportForProgram(nicheProgramId, env);
  const hasReadiness = readiness !== null;
  const readinessStatus = readiness?.status ?? null;
  const isReady = readinessStatus === "ready" || readinessStatus === "ready_with_warnings";

  const baselines = listBaselineManifests(env).filter((m) => m.niche_program_id === nicheProgramId);
  const candidates = listCandidateManifests(env).filter(
    (m) => m.niche_program_id === nicheProgramId,
  );
  const hasManifests = baselines.length > 0 && candidates.length > 0;

  const candidateIds = new Set(candidates.map((c) => c.candidate_manifest_id));
  const benchmarks = listBenchmarkResultRecords({ env }).filter((r) =>
    candidateIds.has(r.candidate_manifest_id),
  );
  const hasBenchmarks = benchmarks.length > 0;

  let hasActiveStack = false;
  try {
    const state = getActiveNicheRuntimeState(env);
    hasActiveStack = state.stacks.some(
      (s) => s.niche_program_id === nicheProgramId && s.release_mode !== "rolled_back",
    );
  } catch {
    // No active state file yet
  }

  let currentStage: ProgramWorkflowStage;
  let nextAction: string;
  let nextCommand: string;

  if (hasActiveStack) {
    currentStage = "active";
    nextAction = "Stack is active. Monitor or rollback as needed.";
    nextCommand = `openclaw niche status --niche-program-id ${nicheProgramId}`;
  } else if (hasBenchmarks) {
    currentStage = "benchmarked";
    nextAction = "Run the release evaluation to promote the candidate.";
    nextCommand = `openclaw niche release --from-program ${nicheProgramId} --verifier-metrics <path> --monitor <path> --component-artifact-ref <path>`;
  } else if (hasManifests) {
    currentStage = "manifests_built";
    nextAction = "Run benchmarks to evaluate the candidate against the baseline.";
    nextCommand = `openclaw niche benchmark --from-program ${nicheProgramId} --suite <path> --live`;
  } else if (isReady) {
    currentStage = "ready";
    nextAction = "Build manifests and prepare benchmark artifacts.";
    nextCommand = `openclaw niche prepare-benchmark --niche-program-id ${nicheProgramId} --emit-release-artifacts`;
  } else if (hasCompilation) {
    currentStage = "compiled";
    nextAction =
      hasReadiness && !isReady
        ? "Fix readiness blockers and recompile."
        : "Compile with sufficient sources to pass readiness.";
    nextCommand = `openclaw niche compile --niche-program-id ${nicheProgramId} --source <paths...>`;
  } else {
    currentStage = "created";
    nextAction = "Compile source descriptors into a domain pack.";
    nextCommand = `openclaw niche compile --niche-program-id ${nicheProgramId} --source <paths...>`;
  }

  return {
    program,
    hasCompilation,
    hasReadiness,
    readinessStatus,
    hasManifests,
    hasBenchmarks,
    benchmarkCount: benchmarks.length,
    hasActiveStack,
    currentStage,
    nextAction,
    nextCommand,
  };
}

// ---------------------------------------------------------------------------
// Batch workflow state resolution (avoids O(N*M) directory scans)
// ---------------------------------------------------------------------------

/**
 * Resolves workflow state for ALL programs in a single pass.
 *
 * Unlike calling `resolveProgramWorkflowState` in a loop, this pre-loads
 * manifests and benchmark records once and indexes them by program ID,
 * reducing O(N*M) directory scans to O(N+M).
 */
export function resolveAllProgramWorkflowStates(
  env: NodeJS.ProcessEnv = process.env,
): ProgramWorkflowState[] {
  const programs = listNichePrograms(env);
  if (programs.length === 0) return [];

  const allBaselines = listBaselineManifests(env);
  const allCandidates = listCandidateManifests(env);
  const allBenchmarks = listBenchmarkResultRecords({ env });

  let activeState: { stacks: Array<{ niche_program_id: string; release_mode: string }> } = {
    stacks: [],
  };
  try {
    activeState = getActiveNicheRuntimeState(env);
  } catch {
    // No active state file yet
  }

  // Index by program ID
  const baselinesByProgram = new Map<string, typeof allBaselines>();
  for (const m of allBaselines) {
    const list = baselinesByProgram.get(m.niche_program_id) ?? [];
    list.push(m);
    baselinesByProgram.set(m.niche_program_id, list);
  }
  const candidatesByProgram = new Map<string, typeof allCandidates>();
  for (const m of allCandidates) {
    const list = candidatesByProgram.get(m.niche_program_id) ?? [];
    list.push(m);
    candidatesByProgram.set(m.niche_program_id, list);
  }

  return programs.map((program) => {
    const nicheProgramId = program.niche_program_id;
    const compilation = getLatestNicheCompilationRecordForProgram(nicheProgramId, env);
    const hasCompilation = compilation !== null;
    const readiness = getReadinessReportForProgram(nicheProgramId, env);
    const hasReadiness = readiness !== null;
    const readinessStatus = readiness?.status ?? null;
    const isReady = readinessStatus === "ready" || readinessStatus === "ready_with_warnings";

    const baselines = baselinesByProgram.get(nicheProgramId) ?? [];
    const candidates = candidatesByProgram.get(nicheProgramId) ?? [];
    const hasManifests = baselines.length > 0 && candidates.length > 0;

    const candidateIds = new Set(candidates.map((c) => c.candidate_manifest_id));
    const benchmarks = allBenchmarks.filter((r) => candidateIds.has(r.candidate_manifest_id));
    const hasBenchmarks = benchmarks.length > 0;

    const hasActiveStack = activeState.stacks.some(
      (s) => s.niche_program_id === nicheProgramId && s.release_mode !== "rolled_back",
    );

    let currentStage: ProgramWorkflowStage;
    let nextAction: string;
    let nextCommand: string;

    if (hasActiveStack) {
      currentStage = "active";
      nextAction = "Stack is active. Monitor or rollback as needed.";
      nextCommand = `openclaw niche status --niche-program-id ${nicheProgramId}`;
    } else if (hasBenchmarks) {
      currentStage = "benchmarked";
      nextAction = "Run the release evaluation to promote the candidate.";
      nextCommand = `openclaw niche release --from-program ${nicheProgramId} --verifier-metrics <path> --monitor <path> --component-artifact-ref <path>`;
    } else if (hasManifests) {
      currentStage = "manifests_built";
      nextAction = "Run benchmarks to evaluate the candidate against the baseline.";
      nextCommand = `openclaw niche benchmark --from-program ${nicheProgramId} --suite <path> --live`;
    } else if (isReady) {
      currentStage = "ready";
      nextAction = "Build manifests and prepare benchmark artifacts.";
      nextCommand = `openclaw niche prepare-benchmark --niche-program-id ${nicheProgramId} --emit-release-artifacts`;
    } else if (hasCompilation) {
      currentStage = "compiled";
      nextAction =
        hasReadiness && !isReady
          ? "Fix readiness blockers and recompile."
          : "Compile with sufficient sources to pass readiness.";
      nextCommand = `openclaw niche compile --niche-program-id ${nicheProgramId} --source <paths...>`;
    } else {
      currentStage = "created";
      nextAction = "Compile source descriptors into a domain pack.";
      nextCommand = `openclaw niche compile --niche-program-id ${nicheProgramId} --source <paths...>`;
    }

    return {
      program,
      hasCompilation,
      hasReadiness,
      readinessStatus,
      hasManifests,
      hasBenchmarks,
      benchmarkCount: benchmarks.length,
      hasActiveStack,
      currentStage,
      nextAction,
      nextCommand,
    };
  });
}
