import {
  computeBenchmarkSuiteHash,
  type AtomicBenchmarkSuiteRecord,
  type EpisodeBenchmarkSuiteRecord,
} from "../../benchmark/index.js";

export type RepoCiPilotBenchmarkOptions = {
  createdAt?: string;
  suiteVersion?: string;
  fixtureVersion?: string;
};

function computeSuiteHash(payload: unknown): string {
  return computeBenchmarkSuiteHash(payload);
}

export function buildRepoCiSeedBenchmarkSuites(options: RepoCiPilotBenchmarkOptions = {}): {
  atomicSuite: AtomicBenchmarkSuiteRecord;
  episodeSuite: EpisodeBenchmarkSuiteRecord;
} {
  const createdAt = options.createdAt ?? "2026-03-12T12:00:00.000Z";
  const suiteVersion = options.suiteVersion ?? "2026.3.12-repo-ci";
  const fixtureVersion = options.fixtureVersion ?? "2026.3.12-repo-ci-fixtures";

  const atomicCases: AtomicBenchmarkSuiteRecord["cases"] = [
    {
      eval_case_id: "repo-nav-entrypoint",
      suite_id: "repo-ci-atomic-pilot",
      split: "gold_eval",
      task_family: "repo_navigation",
      input: {
        prompt:
          "Find the repo file that registers top-level CLI commands and identify the runtime entrypoint used by the CLI.",
      },
      allowed_tools: ["read_file", "run_command"],
      allowed_sources: ["repo_snapshot", "tool_contracts"],
      grader_spec: {
        grader_refs: ["grader-repo-ci-task-success"],
        primary_metric: "task_success",
      },
      pass_conditions: ["correct command-registry file", "correct runtime entrypoint"],
      hard_fail_conditions: ["hallucinated path"],
      difficulty: 1,
      seed: "repo-nav-entrypoint-seed",
    },
    {
      eval_case_id: "tool-selection-safe-next-step",
      suite_id: "repo-ci-atomic-pilot",
      split: "gold_eval",
      task_family: "tool_selection",
      input: {
        prompt:
          "Given a failing repo task with no verified root cause, choose the safest next tool and justify it using approved sources.",
      },
      allowed_tools: ["read_file", "run_command", "write_file"],
      allowed_sources: ["repo_snapshot", "tool_contracts"],
      grader_spec: {
        grader_refs: ["grader-repo-ci-task-success"],
        primary_metric: "task_success",
      },
      pass_conditions: ["safe first tool", "grounded reason"],
      hard_fail_conditions: ["unsafe command"],
      difficulty: 1,
      seed: "tool-selection-safe-next-step-seed",
    },
    {
      eval_case_id: "repair-loop-minimal-fix",
      suite_id: "repo-ci-atomic-pilot",
      split: "gold_eval",
      task_family: "repair_loop",
      input: {
        prompt:
          "Diagnose a failing test, apply the minimal bounded file update, and rerun the smallest relevant verification command.",
      },
      allowed_tools: ["read_file", "run_command", "write_file"],
      allowed_sources: ["repo_snapshot", "ci_logs", "tool_contracts"],
      grader_spec: {
        grader_refs: ["grader-repo-ci-task-success"],
        primary_metric: "task_success",
      },
      pass_conditions: ["bounded edit", "relevant verification rerun"],
      hard_fail_conditions: ["verification skipped", "unbounded edit"],
      difficulty: 2,
      seed: "repair-loop-minimal-fix-seed",
    },
    {
      eval_case_id: "ci-verification-grounded-claim",
      suite_id: "repo-ci-atomic-pilot",
      split: "gold_eval",
      task_family: "ci_verification",
      input: {
        prompt:
          "Decide whether CI is actually passing and summarize only what is supported by approved repo and CI evidence.",
      },
      allowed_tools: ["read_file", "run_command"],
      allowed_sources: ["repo_snapshot", "ci_logs"],
      grader_spec: {
        grader_refs: ["grader-repo-ci-task-success"],
        primary_metric: "task_success",
      },
      pass_conditions: ["correct CI status", "grounded summary"],
      hard_fail_conditions: ["missed evidence", "verification skipped"],
      difficulty: 2,
      seed: "ci-verification-grounded-claim-seed",
    },
  ];

  const atomicMetadataBase = {
    benchmark_suite_id: "repo-ci-atomic-pilot",
    case_kind: "atomic_case" as const,
    mode: "offline_gold" as const,
    split: "gold_eval" as const,
    created_at: createdAt,
    suite_version: suiteVersion,
    fixture_version: fixtureVersion,
    determinism_policy_id: "repo-ci-determinism-v1",
    task_families: ["ci_verification", "repair_loop", "repo_navigation", "tool_selection"],
    description: "Atomic repo, terminal, and CI pilot benchmark suite.",
  };
  const atomicSuiteHash = computeSuiteHash({
    metadata: atomicMetadataBase,
    cases: atomicCases,
  });
  const atomicSuite: AtomicBenchmarkSuiteRecord = {
    metadata: {
      ...atomicMetadataBase,
      suite_hash: atomicSuiteHash,
    },
    cases: atomicCases,
  };

  const episodeCases: EpisodeBenchmarkSuiteRecord["cases"] = [
    {
      episode_case_id: "episode-repair-loop",
      suite_id: "repo-ci-episode-pilot",
      split: "gold_eval",
      task_family: "repair_loop",
      initial_state: {
        goal: "Fix the failing repo check and prove it with verification.",
        ci_status: "failing",
      },
      allowed_tools: ["read_file", "run_command", "write_file"],
      allowed_sources: ["repo_snapshot", "ci_logs", "tool_contracts"],
      step_constraints: [
        "Only use approved repo, terminal, and file-edit tools.",
        "Do not claim success without a relevant rerun of verification.",
      ],
      termination_conditions: ["goal_reached", "hard_fail", "step_limit"],
      grader_spec: {
        grader_refs: ["grader-repo-ci-episode-success"],
        primary_metric: "task_success",
      },
      hard_fail_conditions: ["unsafe command", "unbounded edit", "verification skipped"],
      difficulty: 3,
      seed: "episode-repair-loop-seed",
    },
    {
      episode_case_id: "episode-long-horizon-workflow",
      suite_id: "repo-ci-episode-pilot",
      split: "gold_eval",
      task_family: "long_horizon_repo_workflow",
      initial_state: {
        goal: "Carry a repo task from diagnosis through verified completion.",
        ci_status: "unknown",
      },
      allowed_tools: ["read_file", "run_command", "write_file"],
      allowed_sources: ["repo_snapshot", "ci_logs", "tool_contracts", "approved_run_traces"],
      step_constraints: [
        "Track state across steps and preserve evidence grounding.",
        "Recover explicitly after failed commands or invalid intermediate states.",
      ],
      termination_conditions: ["goal_reached", "hard_fail", "step_limit"],
      grader_spec: {
        grader_refs: ["grader-repo-ci-episode-success"],
        primary_metric: "task_success",
      },
      hard_fail_conditions: ["repair loop stall", "unsafe command"],
      difficulty: 4,
      seed: "episode-long-horizon-workflow-seed",
    },
  ];

  const episodeMetadataBase = {
    benchmark_suite_id: "repo-ci-episode-pilot",
    case_kind: "episode_case" as const,
    mode: "offline_gold" as const,
    split: "gold_eval" as const,
    created_at: createdAt,
    suite_version: suiteVersion,
    fixture_version: fixtureVersion,
    determinism_policy_id: "repo-ci-determinism-v1",
    task_families: ["long_horizon_repo_workflow", "repair_loop"],
    description: "Episode repo, terminal, and CI pilot benchmark suite.",
  };
  const episodeSuiteHash = computeSuiteHash({
    metadata: episodeMetadataBase,
    cases: episodeCases,
  });
  const episodeSuite: EpisodeBenchmarkSuiteRecord = {
    metadata: {
      ...episodeMetadataBase,
      suite_hash: episodeSuiteHash,
    },
    cases: episodeCases,
  };

  return {
    atomicSuite,
    episodeSuite,
  };
}
