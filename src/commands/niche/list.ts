import { resolveAllProgramWorkflowStates } from "../../niche/store/index.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type NicheListOptions = { json: boolean };
export type NicheListEntry = {
  niche_program_id: string;
  name: string;
  stage: string;
  readiness: string | null;
  benchmarks: number;
};
export type NicheListResult = { programs: NicheListEntry[] };

export async function nicheListCommand(
  opts: NicheListOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NicheListResult> {
  const states = resolveAllProgramWorkflowStates(process.env);
  const entries: NicheListEntry[] = states.map((state) => ({
    niche_program_id: state.program.niche_program_id,
    name: state.program.name,
    stage: state.currentStage,
    readiness: state.readinessStatus,
    benchmarks: state.benchmarkCount,
  }));
  const result: NicheListResult = { programs: entries };
  if (opts.json) {
    runtime.log(JSON.stringify(result, null, 2));
    return result;
  }
  if (entries.length === 0) {
    runtime.log("No niche programs found.");
    return result;
  }
  runtime.log("\nNiche Programs:\n");
  const header = [
    "Program ID".padEnd(28),
    "Stage".padEnd(18),
    "Readiness".padEnd(16),
    "Benchmarks",
  ].join("  ");
  runtime.log(header);
  runtime.log("-".repeat(header.length));
  for (const e of entries) {
    runtime.log(
      [
        e.niche_program_id.padEnd(28),
        e.stage.padEnd(18),
        (e.readiness ?? "-").padEnd(16),
        String(e.benchmarks),
      ].join("  "),
    );
  }
  return result;
}
