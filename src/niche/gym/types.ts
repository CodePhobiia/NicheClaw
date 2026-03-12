import { computeBenchmarkFixturePackHash, computeEnvironmentSnapshotHash } from "../benchmark/index.js";

export type RepoCiCommandResult = {
  success: boolean;
  output: string;
  latency_ms: number;
  cost: number;
  file_updates?: Record<string, string>;
  ci_status_after?: "passing" | "failing" | "unknown";
  recovery_used?: boolean;
  verifier_intervention?: boolean;
  goal_reached?: boolean;
};

export type RepoCiFixture = {
  fixture_id: string;
  root_dir: string;
  files: Record<string, string>;
  allowed_tools: string[];
  command_results: Record<string, RepoCiCommandResult>;
  initial_ci_status: "passing" | "failing" | "unknown";
  environment_snapshot: Record<string, string | number | boolean>;
};

export type RepoCiEnvironmentState = {
  fixture_id: string;
  fixture_hash: string;
  environment_snapshot_hash: string;
  seed: string;
  step_index: number;
  root_dir: string;
  ci_status: "passing" | "failing" | "unknown";
  files: Record<string, string>;
  executed_commands: string[];
  done: boolean;
  terminal_log: string[];
};

export type RepoCiAction =
  | { tool_name: "read_file"; path: string }
  | { tool_name: "run_command"; command: string }
  | { tool_name: "write_file"; path: string; content: string };

export type GymTerminationReason =
  | "goal_reached"
  | "hard_fail"
  | "step_limit"
  | "invalid_tool"
  | "invalid_command"
  | "not_terminated";

export type RepoCiStepResult = {
  step_index: number;
  tool_name: RepoCiAction["tool_name"];
  success: boolean;
  hard_fail: boolean;
  latency_ms: number;
  cost: number;
  observation: string;
  tool_misuse: boolean;
  verifier_intervention: boolean;
  recovery_used: boolean;
  termination_reason: GymTerminationReason;
  state_hash: string;
};

export type EpisodeReplayMetadata = {
  fixture_hash: string;
  environment_snapshot_hash: string;
  seed: string;
  replayable: boolean;
  step_state_hashes: string[];
};

export type RepoCiEpisodeTrace = {
  episode_case_id: string;
  steps: RepoCiStepResult[];
  final_state: RepoCiEnvironmentState;
  replay_metadata: EpisodeReplayMetadata;
};

function stableClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function freezeRepoCiFixture(fixture: RepoCiFixture): Readonly<RepoCiFixture> {
  return deepFreeze(stableClone(fixture));
}

export function computeRepoCiFixtureHash(fixture: RepoCiFixture): string {
  return computeBenchmarkFixturePackHash({
    fixtureId: fixture.fixture_id,
    rootDir: fixture.root_dir,
    files: fixture.files,
    allowedTools: [...fixture.allowed_tools].toSorted((left, right) =>
      left.localeCompare(right),
    ),
    commands: fixture.command_results,
    initialCiStatus: fixture.initial_ci_status,
  });
}

export function computeRepoCiEnvironmentStateHash(
  state: RepoCiEnvironmentState,
): string {
  return computeEnvironmentSnapshotHash({
    fixtureId: state.fixture_id,
    seed: state.seed,
    stepIndex: state.step_index,
    ciStatus: state.ci_status,
    files: state.files,
    executedCommands: state.executed_commands,
    done: state.done,
  });
}
