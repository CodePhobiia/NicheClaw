import { resolveProgramWorkflowState } from "../../niche/store/index.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";
import { nicheCompileCommand } from "./compile.js";
import { nichePrepareBenchmarkCommand } from "./prepare-benchmark.js";
import { nicheReadinessCommand } from "./readiness.js";

export type PipelineStage = "compile" | "readiness" | "prepare-benchmark";

export const PIPELINE_STAGES: PipelineStage[] = ["compile", "readiness", "prepare-benchmark"];

export type NichePipelineOptions = {
  nicheProgramId: string;
  from?: string;
  to?: string;
  sourcePaths?: string[];
  force?: boolean;
  json: boolean;
};

export type PipelineStageResult = {
  stage: string;
  status: "completed" | "skipped" | "failed";
  error?: string;
};

export type NichePipelineResult = {
  niche_program_id: string;
  stages: PipelineStageResult[];
  completed: boolean;
};

function stageIndex(stage: string): number {
  const idx = PIPELINE_STAGES.indexOf(stage as PipelineStage);
  return idx >= 0 ? idx : 0;
}

export async function nichePipelineCommand(
  opts: NichePipelineOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NichePipelineResult> {
  const fromIdx = opts.from ? stageIndex(opts.from) : 0;
  const toIdx = opts.to ? stageIndex(opts.to) : PIPELINE_STAGES.length - 1;
  const stagesToRun = PIPELINE_STAGES.slice(fromIdx, toIdx + 1);

  const stageResults: PipelineStageResult[] = [];
  let allCompleted = true;

  for (const stage of stagesToRun) {
    try {
      const state = resolveProgramWorkflowState(opts.nicheProgramId, process.env);

      if (stage === "compile") {
        if (state.hasCompilation && !opts.force) {
          stageResults.push({ stage, status: "skipped" });
          continue;
        }
        if (!opts.sourcePaths || opts.sourcePaths.length === 0) {
          throw new Error("--source <path> is required for the compile stage.");
        }
        await nicheCompileCommand({
          nicheProgramId: opts.nicheProgramId,
          sourcePaths: opts.sourcePaths,
          emitManifests: true,
          json: false,
        });
        stageResults.push({ stage, status: "completed" });
      } else if (stage === "readiness") {
        if (
          state.hasReadiness &&
          (state.readinessStatus === "ready" || state.readinessStatus === "ready_with_warnings") &&
          !opts.force
        ) {
          stageResults.push({ stage, status: "skipped" });
          continue;
        }
        await nicheReadinessCommand({
          nicheProgramId: opts.nicheProgramId,
          json: false,
        });
        stageResults.push({ stage, status: "completed" });
      } else if (stage === "prepare-benchmark") {
        if (state.hasManifests && !opts.force) {
          stageResults.push({ stage, status: "skipped" });
          continue;
        }
        await nichePrepareBenchmarkCommand({
          nicheProgramId: opts.nicheProgramId,
          emitReleaseArtifacts: true,
          json: false,
        });
        stageResults.push({ stage, status: "completed" });
      }
    } catch (err) {
      stageResults.push({
        stage,
        status: "failed",
        error: String(err),
      });
      allCompleted = false;
      break;
    }
  }

  const result: NichePipelineResult = {
    niche_program_id: opts.nicheProgramId,
    stages: stageResults,
    completed: allCompleted,
  };

  if (opts.json) {
    runtime.log(JSON.stringify(result, null, 2));
    return result;
  }

  runtime.log(`\nPipeline ${allCompleted ? "completed" : "stopped"} for ${opts.nicheProgramId}\n`);
  for (const sr of stageResults) {
    const icon = sr.status === "completed" ? "[+]" : sr.status === "skipped" ? "[-]" : "[!]";
    runtime.log(`  ${icon} ${sr.stage}: ${sr.status}${sr.error ? ` -- ${sr.error}` : ""}`);
  }

  return result;
}
