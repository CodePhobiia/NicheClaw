import type { EpisodeCase } from "../schema/index.js";
import type {
  EpisodeCaseExecutionResult,
  EpisodeStepResult,
} from "../benchmark/index.js";
import type {
  EpisodeReplayMetadata,
  RepoCiAction,
  RepoCiEpisodeTrace,
  RepoCiStepResult,
} from "./types.js";
import type { RepoCiEnvironmentController } from "./repo-ci-environment.js";

export type EpisodeHarnessResult = {
  episode_result: EpisodeCaseExecutionResult;
  gym_trace: RepoCiEpisodeTrace;
};

function toEpisodeStepResult(step: RepoCiStepResult): EpisodeStepResult {
  return {
    step_index: step.step_index,
    score: step.success ? 1 : 0,
    success: step.success,
    hard_fail: step.hard_fail,
    latency_ms: step.latency_ms,
    cost: step.cost,
    tool_misuse: step.tool_misuse,
    verifier_intervention: step.verifier_intervention,
    recovery_used: step.recovery_used,
    notes: step.observation,
  };
}

export function runRepoCiEpisodeHarness(params: {
  episodeCase: EpisodeCase;
  environment: RepoCiEnvironmentController;
  actions: RepoCiAction[];
  seed?: string;
  maxSteps?: number;
}): EpisodeHarnessResult {
  const seed = params.seed ?? params.episodeCase.seed;
  const maxSteps =
    params.maxSteps ?? params.episodeCase.termination_conditions.length + params.actions.length;
  let state = params.environment.reset(seed);
  const steps: RepoCiStepResult[] = [];

  for (const action of params.actions.slice(0, maxSteps)) {
    const next = params.environment.step(state, action);
    state = next.state;
    steps.push(next.result);
    if (state.done) {
      break;
    }
  }

  const replayMetadata: EpisodeReplayMetadata = {
    fixture_hash: state.fixture_hash,
    environment_snapshot_hash: state.environment_snapshot_hash,
    seed,
    replayable: true,
    step_state_hashes: steps.map((step) => step.state_hash),
  };
  const episodeStepResults = steps.map((step) => toEpisodeStepResult(step));
  const totalScore = episodeStepResults.reduce((sum, step) => sum + step.score, 0);
  const retryCount = episodeStepResults.filter((step) => step.recovery_used).length;
  const success = steps.some((step) => step.termination_reason === "goal_reached");
  const hardFail = steps.some((step) => step.hard_fail);

  return {
    episode_result: {
      total_score: totalScore,
      success,
      hard_fail: hardFail,
      step_results: episodeStepResults.length > 0
        ? episodeStepResults
        : [
            {
              step_index: 0,
              score: 0,
              success: false,
              hard_fail: true,
              latency_ms: 0,
              cost: 0,
              tool_misuse: false,
              verifier_intervention: false,
              recovery_used: false,
              notes: "Episode executed zero steps.",
            },
          ],
      verifier_outcome: steps.some((step) => step.verifier_intervention)
        ? "repair_requested"
        : "approved",
      grader_version: params.episodeCase.grader_spec.grader_refs[0] ?? "unknown",
      retry_count: retryCount,
      memory_effect_summary: steps.length === 0 ? "No steps executed." : undefined,
    },
    gym_trace: {
      episode_case_id: params.episodeCase.episode_case_id,
      steps,
      final_state: state,
      replay_metadata: replayMetadata,
    },
  };
}
