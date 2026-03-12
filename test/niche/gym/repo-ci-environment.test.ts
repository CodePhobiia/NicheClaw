import { describe, expect, it } from "vitest";
import type { EpisodeCase } from "../../../src/niche/schema/index.js";
import {
  createRepoCiEnvironment,
  runRepoCiEpisodeHarness,
  type RepoCiFixture,
} from "../../../src/niche/gym/index.js";

function makeFixture(): RepoCiFixture {
  return {
    fixture_id: "repo-ci-fixture-v1",
    root_dir: "/workspace/repo",
    files: {
      "README.md": "# Repo\n",
      "package.json": '{"scripts":{"test":"pnpm test"}}',
      "src/index.ts": "export const answer = 42;\n",
    },
    allowed_tools: ["read_file", "run_command", "write_file"],
    command_results: {
      "pnpm test": {
        success: true,
        output: "Tests passed.",
        latency_ms: 120,
        cost: 0.03,
        ci_status_after: "passing",
        goal_reached: true,
      },
      "pnpm lint": {
        success: false,
        output: "Lint failed.",
        latency_ms: 80,
        cost: 0.02,
        ci_status_after: "failing",
        verifier_intervention: true,
      },
    },
    initial_ci_status: "unknown",
    environment_snapshot: {
      platform: "linux",
      node: "22.x",
    },
  };
}

function makeEpisodeCase(): EpisodeCase {
  return {
    episode_case_id: "episode-repo-ci-1",
    suite_id: "repo-ci-suite",
    split: "gold_eval",
    task_family: "repo-ci-verification",
    initial_state: {
      goal: "Run tests and confirm CI is passing.",
    },
    allowed_tools: ["read_file", "run_command", "write_file"],
    allowed_sources: ["repo-doc"],
    step_constraints: ["Only use approved repo tools."],
    termination_conditions: ["goal_reached", "hard_fail"],
    grader_spec: {
      grader_refs: ["grader-repo-ci-v1"],
      primary_metric: "task_success",
    },
    hard_fail_conditions: ["invalid_tool_use"],
    difficulty: 2,
    seed: "seed-1",
  };
}

describe("repo ci niche gym harness", () => {
  it("resets deterministically from a frozen fixture snapshot", () => {
    const fixture = makeFixture();
    const environment = createRepoCiEnvironment(fixture);
    fixture.files["README.md"] = "mutated after environment creation";

    const stateA = environment.reset("seed-1");
    const stateB = environment.reset("seed-1");

    expect(stateA.fixture_hash).toBe(stateB.fixture_hash);
    expect(stateA.environment_snapshot_hash).toBe(stateB.environment_snapshot_hash);
    expect(stateA.files["README.md"]).toBe("# Repo\n");
    expect(stateB.files["README.md"]).toBe("# Repo\n");
  });

  it("applies deterministic step transitions with explicit tool access", () => {
    const environment = createRepoCiEnvironment(makeFixture());
    const initial = environment.reset("seed-1");
    const readStep = environment.step(initial, {
      tool_name: "read_file",
      path: "README.md",
    });
    const runStep = environment.step(readStep.state, {
      tool_name: "run_command",
      command: "pnpm test",
    });

    expect(readStep.result.success).toBe(true);
    expect(readStep.result.observation).toContain("# Repo");
    expect(runStep.result.success).toBe(true);
    expect(runStep.state.ci_status).toBe("passing");
    expect(runStep.state.done).toBe(true);
    expect(runStep.result.termination_reason).toBe("goal_reached");
  });

  it("replays the same episode trace deterministically from the same fixture and seed", () => {
    const environment = createRepoCiEnvironment(makeFixture());
    const actions = [
      {
        tool_name: "read_file" as const,
        path: "package.json",
      },
      {
        tool_name: "run_command" as const,
        command: "pnpm test",
      },
    ];

    const firstRun = runRepoCiEpisodeHarness({
      episodeCase: makeEpisodeCase(),
      environment,
      actions,
    });
    const replayedState = environment.replay("seed-1", actions);

    expect(firstRun.gym_trace.replay_metadata.replayable).toBe(true);
    expect(firstRun.gym_trace.final_state.fixture_hash).toBe(replayedState.fixture_hash);
    expect(firstRun.gym_trace.final_state.environment_snapshot_hash).toBe(
      replayedState.environment_snapshot_hash,
    );
    expect(
      firstRun.gym_trace.steps.map((step) => step.state_hash).at(-1),
    ).toBe(
      environment.step(
        environment.step(environment.reset("seed-1"), actions[0]).state,
        actions[1],
      ).result.state_hash,
    );
    expect(firstRun.episode_result.success).toBe(true);
    expect(firstRun.episode_result.step_results).toHaveLength(2);
  });
});
