import { resolveProgramWorkflowState } from "../../niche/store/index.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type NicheNextOptions = { nicheProgramId: string; json: boolean };
export type NicheNextResult = {
  niche_program_id: string;
  current_stage: string;
  next_action: string;
  next_command: string;
};

export async function nicheNextCommand(
  opts: NicheNextOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NicheNextResult> {
  const state = resolveProgramWorkflowState(opts.nicheProgramId, process.env);
  const result: NicheNextResult = {
    niche_program_id: opts.nicheProgramId,
    current_stage: state.currentStage,
    next_action: state.nextAction,
    next_command: state.nextCommand,
  };
  if (opts.json) {
    runtime.log(JSON.stringify(result, null, 2));
    return result;
  }
  runtime.log(`\nCurrent stage: ${state.currentStage}`);
  runtime.log(`\nNext: ${state.nextAction}`);
  runtime.log(`\nRun:\n  ${state.nextCommand}\n`);
  return result;
}
