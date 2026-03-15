---
summary: "Remediation playbook for every NicheClaw readiness blocker code and warning dimension, including scoring formulas."
read_when:
  - Readiness report shows not_ready or ready_with_warnings
  - Need to understand what each blocker code means and how to fix it
  - Want to predict readiness scores before compiling
title: "Improving Readiness"
---

# Improving Readiness

When `openclaw niche readiness` reports `not_ready` or `ready_with_warnings`, this guide explains exactly what each blocker or warning means, how the score is computed, and what to change in your sources or program definition to resolve it.

## Reading the Readiness Report

The readiness report (available via `openclaw niche readiness --niche-program-id <id> --json`) contains:

- **`status`** -- one of `ready`, `ready_with_warnings`, or `not_ready`.
- **`dimension_scores`** -- nine scored dimensions, each with a `score` (0-100) and a `rationale`.
- **`hard_blockers`** -- an array of objects with `blocker_code` and `message`. Any hard blocker forces `not_ready`.
- **`warnings`** -- an array of objects with `warning_code` and `message`. Warnings alone yield `ready_with_warnings`.
- **`recommended_next_actions`** -- prioritized remediation steps (`required`, `recommended`, or `optional`).

The status is determined as follows:

- If there are any hard blockers, status is `not_ready`.
- If there are no hard blockers but there are warnings, status is `ready_with_warnings`.
- If there are neither hard blockers nor warnings, status is `ready`.

## Hard Blocker Remediation

Each hard blocker code maps to a specific dimension threshold. Fix the underlying data issue, then recompile to regenerate the readiness report.

### `insufficient_rights_to_use`

**Trigger:** The propagated rights state has `rights_to_store: false` or `rights_to_benchmark: false`.

Rights propagation computes the intersection of all source rights. If any single source descriptor sets `rights_to_store: false` or `rights_to_benchmark: false`, the aggregate rights state will lack these permissions.

**Fix:** Ensure that every source descriptor in your compilation set has both `rights_to_store: true` and `rights_to_benchmark: true` in its `rights` object.

```json
{
  "rights": {
    "rights_to_store": true,
    "rights_to_benchmark": true,
    "rights_to_train": true,
    "rights_to_derive": true,
    "rights_to_distill": true,
    "rights_to_generate_synthetic_from": true
  }
}
```

**Rights sufficiency score formula:**

```
rights_sufficiency = round((count_of_true_rights / 6) * 100)
```

The six boolean rights flags are: `rights_to_store`, `rights_to_train`, `rights_to_benchmark`, `rights_to_derive`, `rights_to_distill`, `rights_to_generate_synthetic_from`. Setting all six to `true` yields a score of 100.

### `benchmarkability_below_minimum_threshold`

**Trigger:** The `benchmarkability` dimension score is below the minimum threshold of **50**.

**Score formula:**

```
benchmarkability = min(100, benchmark_seed_count * 25)
```

Each `benchmark_seed` source descriptor contributes exactly 25 points to the benchmarkability score.

| Seed count | Score |
| ---------- | ----- |
| 0          | 0     |
| 1          | 25    |
| 2          | 50    |
| 3          | 75    |
| 4+         | 100   |

**Fix:** Add at least 2 source descriptors with `inputKind: "benchmark_seed"`. Each seed must include a `prompt`, `taskFamilyId`, `passConditions`, and `hardFailConditions`.

```json
{
  "sourceId": "seed-01",
  "sourceKind": "datasets",
  "inputKind": "benchmark_seed",
  "title": "Task accuracy seed",
  "accessPattern": "read-only",
  "rights": {
    "rights_to_store": true,
    "rights_to_train": false,
    "rights_to_benchmark": true,
    "rights_to_derive": true,
    "rights_to_distill": false,
    "rights_to_generate_synthetic_from": false,
    "retention_policy": "project-lifetime",
    "redaction_status": "clean",
    "pii_status": "none",
    "provenance_status": "verified",
    "data_zone": "dev"
  },
  "prompt": "Given this input, produce a correct output.",
  "taskFamilyId": "accuracy-tasks",
  "passConditions": ["output matches expected format"],
  "hardFailConditions": ["output contains harmful content"]
}
```

### `contradiction_rate_exceeds_hard_threshold`

**Trigger:** The `contradiction_rate` dimension score exceeds the hard threshold of **30**.

**Score formula:**

The contradiction rate is computed by examining all pairs of sources. For each pair, the compiler computes token overlap (tokens with more than 3 characters). If the similarity exceeds 0.3 (30% of overlapping tokens relative to the smaller token set) and the pair has conflicting metadata (different `provenance_status` or different `quarantined` flags), the pair is counted as contradictory.

```
contradiction_rate = round((contradictory_pairs / total_pairs) * 100)
```

**Fix:**

- Review your sources for conflicting metadata. Ensure all sources that share significant textual overlap have consistent `provenance_status` values (all `"verified"` or all `"unverified"`).
- Ensure no source has `quarantined: true` when another overlapping source has `quarantined: false`.
- Remove or reconcile duplicate sources that contain overlapping content with inconsistent metadata.

### `tool_availability_inadequate_for_workflow`

**Trigger:** The `tool_availability` dimension score is below the minimum threshold of **80**.

**Score formula:**

```
tool_availability = min(100, 50 + allowed_tools_count * 15)
```

| Tool count | Score |
| ---------- | ----- |
| 0          | 50    |
| 1          | 65    |
| 2          | 80    |
| 3          | 95    |
| 4+         | 100   |

**Fix:** Add at least 2 tools to the `allowed_tools` array in your niche program definition. For example:

```json
{
  "allowed_tools": ["read_file", "run_command", "write_file"]
}
```

Then re-create the program and recompile.

### `source_coverage_too_low_for_benchmarkable_domain_pack`

**Trigger:** The `source_coverage` dimension score is below the minimum threshold of **30**.

**Score formula:**

```
source_coverage = round((distinct_source_kinds / 10) * 100)
```

NicheClaw defines 10 possible source kinds: `documents`, `websites`, `repos`, `logs`, `datasets`, `tool_schemas`, `past_task_traces`, `human_examples`, `domain_constraints`, `live_sources`.

The score is based on how many distinct `sourceKind` values appear across your source descriptors.

| Distinct kinds | Score |
| -------------- | ----- |
| 1              | 10    |
| 2              | 20    |
| 3              | 30    |
| 4              | 40    |
| 5+             | 50+   |

**Fix:** Add source descriptors that use at least 3 distinct `sourceKind` values. For example, combine `repos`, `datasets`, and `documents`:

```json
[
  { "sourceKind": "repos", "inputKind": "structured_text", "...": "..." },
  { "sourceKind": "datasets", "inputKind": "benchmark_seed", "...": "..." },
  { "sourceKind": "documents", "inputKind": "structured_text", "...": "..." }
]
```

## Improving Warning Dimensions

Warnings do not block compilation or benchmarking, but addressing them improves specialization quality.

### `low_source_quality` (threshold: 70)

**Score formula:**

```
source_quality = min(100, round((verified_and_clean_sources / total_sources) * 100))
```

A source counts as "verified and clean" when `provenance_status === "verified"` and `redaction_status === "clean"`.

**Fix:** Ensure all source descriptors have `provenance_status: "verified"` and `redaction_status: "clean"` in their `rights` object.

### `low_freshness` (threshold: 60)

**Score formula:**

```
freshness = min(100, 60 + sources_with_freshness_expectation * 15)
```

The base score is 60. Each source that declares a `freshnessExpectation` field adds 15 points.

**Fix:** Add the `freshnessExpectation` field to your source descriptors:

```json
{
  "freshnessExpectation": "updated-weekly"
}
```

### `low_task_observability` (threshold: 50)

**Score formula:**

When no benchmark seeds provide task families:

- If `allowed_tools.length > 0`: score is 70.
- If `allowed_tools.length === 0`: score is 40.

When benchmark seeds are present:

```
task_observability = min(100, round((tool_count / max(1, task_family_count)) * 60 + 30))
```

**Fix:** Ensure your program declares enough allowed tools relative to the number of distinct task families in your benchmark seeds.

### `weak_success_criteria` (threshold: 70)

**Score formula:**

```
measurable_success_criteria = min(100, 50 + success_metrics_count * 20)
```

| Metric count | Score |
| ------------ | ----- |
| 0            | 50    |
| 1            | 70    |
| 2            | 90    |
| 3+           | 100   |

**Fix:** Add at least 1 success metric to meet the threshold, or 2+ for a comfortable margin. Each metric needs a `metric_id`, `label`, `objective`, `target_description`, and `measurement_method`.

### `rights_need_review` (threshold: 80)

This warning fires when the `rights_sufficiency` score (see formula above) is below 80, meaning fewer than 5 of the 6 rights flags are true across all sources.

**Fix:** Set all six rights flags to `true` on every source descriptor, or review which rights are intentionally withheld and confirm they are not needed for your workflow.

## Default Readiness Thresholds

For reference, the full set of default thresholds used by the readiness gate:

| Dimension                     | Type         | Threshold | Notes                             |
| ----------------------------- | ------------ | --------- | --------------------------------- |
| `source_quality`              | warning      | >= 70     | Verified and clean sources        |
| `source_coverage`             | hard blocker | >= 30     | 3+ distinct source kinds          |
| `contradiction_rate`          | hard blocker | <= 30     | Pairwise contradiction rate       |
| `freshness`                   | warning      | >= 60     | Base 60, +15 per freshness signal |
| `rights_sufficiency`          | warning      | >= 80     | 5+ of 6 rights flags true         |
| `task_observability`          | warning      | >= 50     | Tool-to-task-family coverage      |
| `benchmarkability`            | hard blocker | >= 50     | 2+ benchmark seeds                |
| `measurable_success_criteria` | warning      | >= 70     | 1+ success metrics                |
| `tool_availability`           | hard blocker | >= 80     | 2+ allowed tools                  |

## Recompiling After Changes

After modifying source descriptors or the niche program, recompile:

```bash
openclaw niche compile \
  --niche-program-id <id> \
  --source ./updated-source.json \
  --emit-manifests
```

Then check readiness again:

```bash
openclaw niche readiness --niche-program-id <id>
```

Repeat until the status is `ready` or `ready_with_warnings` with acceptable warnings.
