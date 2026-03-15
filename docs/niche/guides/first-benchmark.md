---
summary: "Guide to building a benchmark suite, running a live benchmark, and interpreting paired delta results in NicheClaw."
read_when:
  - Readiness is ready and want to run the first benchmark
  - Need to understand the EvalCase and EpisodeCase structures
  - Want to interpret benchmark results and paired delta summaries
title: "Running Your First Benchmark"
---

# Running Your First Benchmark

NicheClaw benchmarks compare a candidate specialization against a same-model baseline using held-out evaluation cases. This guide covers building a benchmark suite, running a live benchmark, and understanding the results.

## Prerequisites

Before running a benchmark, ensure:

1. **Readiness is `ready` or `ready_with_warnings`.** The benchmark command enforces readiness before proceeding. Check with:

   ```bash
   openclaw niche readiness --niche-program-id <id>
   ```

2. **Baseline and candidate manifests exist.** These are created during compilation with `--emit-manifests`, or by the quickstart. The benchmark command can auto-resolve them when you pass `--from-program <id>`.

## What Is a Benchmark

A NicheClaw benchmark is a **same-model comparison** between two arms:

- **Baseline arm** -- the unspecialized configuration, defined by the baseline manifest.
- **Candidate arm** -- the specialized configuration, defined by the candidate manifest.

Both arms run the same suite of evaluation cases. Results are compared as paired deltas (candidate score minus baseline score) to measure whether specialization improved performance.

## Benchmark Case Kinds

NicheClaw supports two case kinds:

### Atomic cases (`atomic_case`)

Single-turn evaluation cases. Each case has one input, and the grader scores the output directly.

An `EvalCase` has this structure:

| Field                  | Type     | Description                                                                              |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `eval_case_id`         | string   | Unique identifier for the case.                                                          |
| `suite_id`             | string   | The benchmark suite this case belongs to.                                                |
| `split`                | string   | Data split: `train`, `dev`, `gold_eval`, `hidden_eval`, `shadow_only`, or `quarantined`. |
| `task_family`          | string   | Groups cases by task type for per-family analysis.                                       |
| `input`                | any      | The input payload for the case.                                                          |
| `allowed_tools`        | string[] | Tools the agent may use for this case.                                                   |
| `allowed_sources`      | string[] | Source IDs the agent may access.                                                         |
| `grader_spec`          | object   | References the grader(s) and primary metric.                                             |
| `pass_conditions`      | string[] | Conditions that must hold for a passing score.                                           |
| `hard_fail_conditions` | string[] | Conditions that trigger an automatic failure.                                            |
| `difficulty`           | integer  | Difficulty level (0+).                                                                   |
| `seed`                 | string   | Determinism seed for reproducibility.                                                    |

### Episode cases (`episode_case`)

Multi-turn evaluation cases that model a sequence of agent steps. Each case defines an initial state, step constraints, and termination conditions.

An `EpisodeCase` has this structure:

| Field                    | Type     | Description                               |
| ------------------------ | -------- | ----------------------------------------- |
| `episode_case_id`        | string   | Unique identifier for the episode.        |
| `suite_id`               | string   | The benchmark suite this case belongs to. |
| `split`                  | string   | Data split.                               |
| `task_family`            | string   | Task family grouping.                     |
| `initial_state`          | any      | The starting state for the episode.       |
| `allowed_tools`          | string[] | Tools the agent may use.                  |
| `allowed_sources`        | string[] | Accessible source IDs.                    |
| `step_constraints`       | string[] | Constraints applied at each step.         |
| `termination_conditions` | string[] | Conditions that end the episode.          |
| `grader_spec`            | object   | Grader references and primary metric.     |
| `hard_fail_conditions`   | string[] | Automatic failure conditions.             |
| `difficulty`             | integer  | Difficulty level.                         |
| `seed`                   | string   | Determinism seed.                         |

## Building a Benchmark Suite

A benchmark suite is a JSON file with a `metadata` object and a `cases` array. Here is a minimal atomic suite:

```json
{
  "metadata": {
    "benchmark_suite_id": "code-review-suite-v1",
    "case_kind": "atomic_case",
    "mode": "offline_gold",
    "split": "gold_eval",
    "created_at": "2026-03-14T00:00:00.000Z",
    "suite_version": "1.0.0",
    "suite_hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    "fixture_version": "1.0.0",
    "determinism_policy_id": "standard-determinism",
    "task_families": ["code-review"]
  },
  "cases": [
    {
      "eval_case_id": "case-001",
      "suite_id": "code-review-suite-v1",
      "split": "gold_eval",
      "task_family": "code-review",
      "input": {
        "code": "function add(a, b) { return a - b; }",
        "instruction": "Review this function for correctness."
      },
      "allowed_tools": ["read_file"],
      "allowed_sources": ["repo-source"],
      "grader_spec": {
        "grader_refs": ["accuracy-grader-v1"],
        "primary_metric": "review-accuracy"
      },
      "pass_conditions": ["identifies the subtraction bug"],
      "hard_fail_conditions": ["approves the code without comment"],
      "difficulty": 1,
      "seed": "seed-001"
    }
  ]
}
```

The available `mode` values are:

| Mode             | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `offline_gold`   | Offline evaluation against gold-standard test cases. |
| `offline_shadow` | Offline shadow evaluation.                           |
| `live_shadow`    | Live shadow evaluation against production traffic.   |
| `live_canary`    | Live canary evaluation with partial traffic.         |

<Warning>
The `suite_hash` must be a valid hex string of 32-128 characters matching `^[A-Fa-f0-9]{32,128}$`. You can compute it from the suite contents for integrity verification.
</Warning>

## Running a Live Benchmark

The simplest way to run a benchmark is with `--from-program`, which auto-resolves manifests and readiness:

```bash
openclaw niche benchmark \
  --from-program code-review-agent \
  --suite ./benchmark-suite.json \
  --live \
  --json
```

The `--live` flag tells the benchmark runner to execute cases against both the baseline and candidate runtimes in real time, rather than using pre-computed execution bundles.

The `--from-program` flag resolves:

- The baseline manifest from the stored program artifacts.
- The candidate manifest from the stored program artifacts.
- The readiness report from the latest compilation.

You can also specify manifests explicitly:

```bash
openclaw niche benchmark \
  --baseline-manifest ./baseline-manifest.json \
  --candidate-manifest ./candidate-manifest.json \
  --suite ./benchmark-suite.json \
  --live \
  --json
```

### Pre-computed execution bundles

For offline benchmarks without `--live`, provide pre-computed execution results:

```bash
openclaw niche benchmark \
  --from-program code-review-agent \
  --suite ./benchmark-suite.json \
  --baseline-execution ./baseline-results.json \
  --candidate-execution ./candidate-results.json \
  --json
```

Execution bundles are JSON objects keyed by case ID, where each value contains the case execution result.

## Understanding Results

The benchmark command outputs a structured result with these key fields:

### Top-level metadata

| Field             | Value                                                   | Description                                       |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------- |
| `input_mode`      | `live_runtime` or `typed_execution_bundle`              | Whether cases were executed live or from bundles. |
| `authority_mode`  | `promotion_authoritative` or `legacy_non_authoritative` | Live runs are promotion-authoritative.            |
| `suite_case_kind` | `atomic_case` or `episode_case`                         | The case kind of the suite.                       |
| `suite_hash`      | hex string                                              | Content hash of the suite for integrity.          |
| `fixture_version` | string                                                  | Version of the test fixtures used.                |

### Paired delta summary

The core of the benchmark result is the `paired_delta_summary`, which compares candidate scores against baseline scores:

| Metric                     | Description                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `mean_delta`               | Average (candidate - baseline) score across all cases. Positive means the candidate is better. |
| `median_delta`             | Median of paired deltas.                                                                       |
| `p10_delta`                | 10th percentile delta (worst-case improvement).                                                |
| `p90_delta`                | 90th percentile delta (best-case improvement).                                                 |
| `confidence_interval_low`  | Lower bound of the confidence interval.                                                        |
| `confidence_interval_high` | Upper bound of the confidence interval.                                                        |

<Info>
For promotion eligibility, the release policy requires `mean_delta > 0` and `confidence_interval_low > 0.001` by default. A positive lower confidence bound means the improvement is statistically meaningful.
</Info>

### Task family summaries

Results are also broken down by task family:

| Field            | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `task_family`    | The task family identifier.                              |
| `case_count`     | Number of cases in this family.                          |
| `score_mean`     | Mean absolute score for this family.                     |
| `hard_fail_rate` | Proportion of cases that triggered hard-fail conditions. |
| `mean_delta`     | Mean delta for this family specifically.                 |

### Contamination and invalidation

| Field                                                | Description                              |
| ---------------------------------------------------- | ---------------------------------------- |
| `contamination_audit_summary.contamination_detected` | Whether data contamination was detected. |
| `invalidated`                                        | Whether the result has been invalidated. |
| `invalidation_reasons`                               | Array of reasons if invalidated.         |

A benchmark result that is invalidated or contamination-detected cannot be used for release promotion.

### Benchmark result record

Every benchmark run persists a `BenchmarkResultRecord` to the store. The record includes run trace references, replay bundle references, and evidence bundle IDs required for promotion-authoritative release decisions.

## Next Steps

Once you have passing benchmark results:

1. **Review the delta summary.** Confirm that `mean_delta` is positive and `confidence_interval_low` is above zero.
2. **Check for task-family regressions.** Any family with a negative `mean_delta` will block promotion.
3. **Proceed to release evaluation.** See [Release and Promotion](/niche/guides/release-promotion) for the promotion workflow.

If results are negative or invalidated:

1. Review your source descriptors and domain pack for coverage gaps.
2. Add more benchmark seeds and recompile.
3. Consider whether the candidate configuration (provider, model, tools) is appropriate for the task.
4. Re-run the benchmark after changes.
