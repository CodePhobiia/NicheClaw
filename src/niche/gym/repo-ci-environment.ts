import { computeEnvironmentSnapshotHash } from "../benchmark/index.js";
import {
  computeRepoCiEnvironmentStateHash,
  computeRepoCiFixtureHash,
  freezeRepoCiFixture,
  type RepoCiAction,
  type RepoCiEnvironmentState,
  type RepoCiFixture,
  type RepoCiStepResult,
} from "./types.js";

function cloneFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

export type RepoCiEnvironmentController = {
  fixture: Readonly<RepoCiFixture>;
  reset: (seed: string) => RepoCiEnvironmentState;
  step: (
    state: RepoCiEnvironmentState,
    action: RepoCiAction,
  ) => {
    state: RepoCiEnvironmentState;
    result: RepoCiStepResult;
  };
  replay: (seed: string, actions: RepoCiAction[]) => RepoCiEnvironmentState;
};

export function createRepoCiEnvironment(fixture: RepoCiFixture): RepoCiEnvironmentController {
  const frozenFixture = freezeRepoCiFixture(fixture);
  const fixtureHash = computeRepoCiFixtureHash(frozenFixture);
  const environmentSnapshotHash = computeEnvironmentSnapshotHash(
    frozenFixture.environment_snapshot,
  );

  const reset = (seed: string): RepoCiEnvironmentState => ({
    fixture_id: frozenFixture.fixture_id,
    fixture_hash: fixtureHash,
    environment_snapshot_hash: environmentSnapshotHash,
    seed,
    step_index: 0,
    root_dir: frozenFixture.root_dir,
    ci_status: frozenFixture.initial_ci_status,
    files: cloneFiles(frozenFixture.files),
    executed_commands: [],
    done: false,
    terminal_log: [],
  });

  const step = (
    state: RepoCiEnvironmentState,
    action: RepoCiAction,
  ): { state: RepoCiEnvironmentState; result: RepoCiStepResult } => {
    const nextState: RepoCiEnvironmentState = {
      ...state,
      step_index: state.step_index + 1,
      files: cloneFiles(state.files),
      executed_commands: [...state.executed_commands],
      terminal_log: [...state.terminal_log],
    };

    const invalidTool = !frozenFixture.allowed_tools.includes(action.tool_name);
    if (invalidTool) {
      nextState.done = true;
      const result: RepoCiStepResult = {
        step_index: nextState.step_index - 1,
        tool_name: action.tool_name,
        success: false,
        hard_fail: true,
        latency_ms: 0,
        cost: 0,
        observation: `Tool ${action.tool_name} is not allowed in this repo/CI environment.`,
        tool_misuse: true,
        verifier_intervention: false,
        recovery_used: false,
        termination_reason: "invalid_tool",
        state_hash: computeRepoCiEnvironmentStateHash(nextState),
      };
      return { state: nextState, result };
    }

    if (action.tool_name === "read_file") {
      const content = nextState.files[action.path];
      const success = typeof content === "string";
      const hardFail = !success;
      if (hardFail) {
        nextState.done = true;
      }
      nextState.terminal_log.push(success ? `READ ${action.path}` : `MISSING ${action.path}`);
      const result: RepoCiStepResult = {
        step_index: nextState.step_index - 1,
        tool_name: "read_file",
        success,
        hard_fail: hardFail,
        latency_ms: 1,
        cost: 0,
        observation: success ? content : `File not found: ${action.path}`,
        tool_misuse: false,
        verifier_intervention: false,
        recovery_used: false,
        termination_reason: hardFail ? "hard_fail" : "not_terminated",
        state_hash: computeRepoCiEnvironmentStateHash(nextState),
      };
      return { state: nextState, result };
    }

    if (action.tool_name === "write_file") {
      nextState.files[action.path] = action.content;
      nextState.terminal_log.push(`WRITE ${action.path}`);
      const result: RepoCiStepResult = {
        step_index: nextState.step_index - 1,
        tool_name: "write_file",
        success: true,
        hard_fail: false,
        latency_ms: 2,
        cost: 0.001,
        observation: `Wrote ${action.path}`,
        tool_misuse: false,
        verifier_intervention: false,
        recovery_used: false,
        termination_reason: "not_terminated",
        state_hash: computeRepoCiEnvironmentStateHash(nextState),
      };
      return { state: nextState, result };
    }

    const commandResult = frozenFixture.command_results[action.command];
    nextState.executed_commands.push(action.command);
    nextState.terminal_log.push(`RUN ${action.command}`);

    if (!commandResult) {
      nextState.done = true;
      const result: RepoCiStepResult = {
        step_index: nextState.step_index - 1,
        tool_name: "run_command",
        success: false,
        hard_fail: true,
        latency_ms: 1,
        cost: 0,
        observation: `Command not available in fixture: ${action.command}`,
        tool_misuse: false,
        verifier_intervention: false,
        recovery_used: false,
        termination_reason: "invalid_command",
        state_hash: computeRepoCiEnvironmentStateHash(nextState),
      };
      return { state: nextState, result };
    }

    for (const [filePath, content] of Object.entries(commandResult.file_updates ?? {})) {
      nextState.files[filePath] = content;
    }
    if (commandResult.ci_status_after) {
      nextState.ci_status = commandResult.ci_status_after;
    }
    if (commandResult.goal_reached || !commandResult.success) {
      nextState.done = true;
    }

    const result: RepoCiStepResult = {
      step_index: nextState.step_index - 1,
      tool_name: "run_command",
      success: commandResult.success,
      hard_fail: !commandResult.success,
      latency_ms: commandResult.latency_ms,
      cost: commandResult.cost,
      observation: commandResult.output,
      tool_misuse: false,
      verifier_intervention: commandResult.verifier_intervention ?? false,
      recovery_used: commandResult.recovery_used ?? false,
      termination_reason: commandResult.goal_reached
        ? "goal_reached"
        : commandResult.success
          ? "not_terminated"
          : "hard_fail",
      state_hash: computeRepoCiEnvironmentStateHash(nextState),
    };
    return { state: nextState, result };
  };

  const replay = (seed: string, actions: RepoCiAction[]): RepoCiEnvironmentState => {
    let current = reset(seed);
    for (const action of actions) {
      const next = step(current, action);
      current = next.state;
      if (current.done) {
        break;
      }
    }
    return current;
  };

  return {
    fixture: frozenFixture,
    reset,
    step,
    replay,
  };
}
