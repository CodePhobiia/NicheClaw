import {
  getActiveNicheRuntimeState,
  getLatestNicheCompilationRecordForProgram,
  getReadinessReportForProgram,
  listBenchmarkResultRecords,
  listNichePrograms,
} from "../../niche/store/index.js";

export type NicheProgramStatusEntry = {
  niche_program_id: string;
  name: string;
  latest_version: string | null;
  latest_compiled_at: string | null;
  readiness_status: string | null;
  readiness_score: number | null;
  active_stack_id: string | null;
  release_mode: string | null;
  last_benchmark_delta: number | null;
  last_benchmark_at: string | null;
};

export type NicheStatusResult = {
  programs: NicheProgramStatusEntry[];
  total_programs: number;
  active_stacks: number;
  ready_programs: number;
};

export type NicheStatusOptions = {
  nicheProgramId?: string;
  json: boolean;
};

function computeAverageReadinessScore(dimensionScores: Record<string, { score: number }>): number {
  const scores = Object.values(dimensionScores).map((d) => d.score);
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

export async function nicheStatusCommand(opts: NicheStatusOptions): Promise<NicheStatusResult> {
  const programs = listNichePrograms(process.env);
  const runtimeState = getActiveNicheRuntimeState(process.env);

  const allBenchmarkResults = listBenchmarkResultRecords({ env: process.env });

  const entries: NicheProgramStatusEntry[] = [];

  for (const program of programs) {
    if (opts.nicheProgramId && program.niche_program_id !== opts.nicheProgramId) {
      continue;
    }

    const compilation = getLatestNicheCompilationRecordForProgram(
      program.niche_program_id,
      process.env,
    );

    const readiness = getReadinessReportForProgram(program.niche_program_id, process.env);

    const activeStack = runtimeState.stacks.find(
      (s) => s.niche_program_id === program.niche_program_id && s.release_mode !== "rolled_back",
    );

    const benchmarkResults = allBenchmarkResults.filter((r) =>
      r.summary.benchmark_suite_id.startsWith(program.niche_program_id),
    );
    const latestBenchmark = benchmarkResults.toSorted(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    )[0];

    entries.push({
      niche_program_id: program.niche_program_id,
      name: program.name,
      latest_version: compilation?.version ?? null,
      latest_compiled_at: compilation?.compiled_at ?? null,
      readiness_status: readiness?.status ?? null,
      readiness_score: readiness ? computeAverageReadinessScore(readiness.dimension_scores) : null,
      active_stack_id: activeStack?.active_stack_id ?? null,
      release_mode: activeStack?.release_mode ?? null,
      last_benchmark_delta: latestBenchmark?.summary.paired_delta_summary?.mean_delta ?? null,
      last_benchmark_at: latestBenchmark?.created_at ?? null,
    });
  }

  const result: NicheStatusResult = {
    programs: entries,
    total_programs: entries.length,
    active_stacks: entries.filter((e) => e.active_stack_id !== null).length,
    ready_programs: entries.filter(
      (e) => e.readiness_status === "ready" || e.readiness_status === "ready_with_warnings",
    ).length,
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  if (entries.length === 0) {
    console.log("No niche programs found. Run `openclaw niche create` to get started.");
    return result;
  }

  console.log(`\nNicheClaw Status — ${result.total_programs} program(s)\n`);

  const header = [
    "Program ID".padEnd(28),
    "Version".padEnd(12),
    "Readiness".padEnd(16),
    "Score".padEnd(6),
    "Stack".padEnd(20),
    "Mode".padEnd(12),
    "Delta".padEnd(8),
  ].join("  ");

  console.log(header);
  console.log("-".repeat(header.length));

  for (const entry of entries) {
    const row = [
      entry.niche_program_id.padEnd(28),
      (entry.latest_version ?? "-").padEnd(12),
      (entry.readiness_status ?? "-").padEnd(16),
      (entry.readiness_score !== null ? `${entry.readiness_score}%` : "-").padEnd(6),
      (entry.active_stack_id ?? "-").padEnd(20),
      (entry.release_mode ?? "-").padEnd(12),
      (entry.last_benchmark_delta !== null
        ? `${entry.last_benchmark_delta > 0 ? "+" : ""}${entry.last_benchmark_delta.toFixed(2)}`
        : "-"
      ).padEnd(8),
    ].join("  ");
    console.log(row);
  }

  console.log(`\nSummary: ${result.ready_programs} ready, ${result.active_stacks} active stack(s)`);

  return result;
}
