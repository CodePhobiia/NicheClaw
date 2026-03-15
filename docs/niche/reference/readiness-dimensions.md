---
summary: "Detailed reference for NicheClaw readiness dimensions, including score formulas, default thresholds, hard blocker logic, and status determination."
read_when:
  - You need to understand how readiness scores are calculated
  - A readiness report shows not_ready or warnings and you need to diagnose why
  - You want to know the default thresholds for each dimension
title: "Readiness Dimensions Reference"
---

# Readiness Dimensions Reference

The readiness gate evaluates 9 dimensions to determine whether a compiled niche is ready for specialization. Each dimension produces a score from 0 to 100. The scores, combined with threshold checks, determine the overall status.

Source files:

- Score computation: `src/niche/domain/compile-flow.ts` (lines 132-181)
- Threshold defaults: `src/niche/domain/readiness-thresholds.ts`
- Gate evaluation: `src/niche/domain/readiness-gate.ts`

## Status Determination

The overall readiness status is determined by this logic:

1. If any **hard blockers** exist: `not_ready`
2. If no hard blockers but **warnings** exist: `ready_with_warnings`
3. If no hard blockers and no warnings: `ready`

A niche is considered ready for specialization when `status` is `ready` or `ready_with_warnings` **and** there are zero hard blockers.

---

## Dimension Score Table

| Dimension                     | Default Threshold | Threshold Type | Hard Blocker | Blocker Code                                            |
| ----------------------------- | ----------------- | -------------- | ------------ | ------------------------------------------------------- |
| `source_quality`              | 70 (min)          | Warning        | No           | n/a (warning: `low_source_quality`)                     |
| `source_coverage`             | 30 (min)          | Hard blocker   | Yes          | `source_coverage_too_low_for_benchmarkable_domain_pack` |
| `contradiction_rate`          | 30 (max)          | Hard blocker   | Yes          | `contradiction_rate_exceeds_hard_threshold`             |
| `freshness`                   | 60 (min)          | Warning        | No           | n/a (warning: `low_freshness`)                          |
| `rights_sufficiency`          | 80 (min)          | Warning        | No           | n/a (warning: `rights_need_review`)                     |
| `task_observability`          | 50 (min)          | Warning        | No           | n/a (warning: `low_task_observability`)                 |
| `benchmarkability`            | 50 (min)          | Hard blocker   | Yes          | `benchmarkability_below_minimum_threshold`              |
| `measurable_success_criteria` | 70 (min)          | Warning        | No           | n/a (warning: `weak_success_criteria`)                  |
| `tool_availability`           | 80 (min)          | Hard blocker   | Yes          | `tool_availability_inadequate_for_workflow`             |

An additional hard blocker exists independent of dimension scores:

| Condition                                                                                       | Blocker Code                 |
| ----------------------------------------------------------------------------------------------- | ---------------------------- |
| `rights_to_store` is false **or** `rights_to_benchmark` is false on the propagated rights state | `insufficient_rights_to_use` |

---

## Score Formulas

Each dimension score is computed during the compile flow from the normalized sources and niche program definition. All scores are clamped to the range [0, 100].

### source_quality

Measures the proportion of sources that are both verified and clean.

```
qualitySignal = count of sources where:
    rights.provenance_status == "verified"
    AND rights.redaction_status == "clean"

source_quality = round((qualitySignal / max(1, totalSourceCount)) * 100)
```

Capped at 100.

### source_coverage

Measures diversity of source kinds relative to the 10 recognized source kinds.

```
distinctKinds = count of unique sourceKind values across all normalized sources

source_coverage = round((distinctKinds / 10) * 100)
```

The 10 source kinds are: `documents`, `websites`, `repos`, `logs`, `datasets`, `tool_schemas`, `past_task_traces`, `human_examples`, `domain_constraints`, `live_sources`.

To reach the default threshold of 30, you need at least 3 distinct source kinds.

### contradiction_rate

Measures contradiction pressure in the source set using pairwise token overlap with conflicting metadata.

```
For each pair of sources (i, j):
    tokensA = set of lowercase tokens (length > 3) from source i
    tokensB = set of lowercase tokens (length > 3) from source j
    overlap = count of tokens in both sets
    similarity = overlap / max(1, min(|tokensA|, |tokensB|))
    metadataConflict = (provenance_status differs) OR (quarantined status differs)
    if similarity > 0.3 AND metadataConflict:
        contradictions++
    pairs++

contradiction_rate = round((contradictions / max(1, pairs)) * 100)
```

This is a "lower is better" dimension. The hard blocker fires when `contradiction_rate > 30`. A score of 0 means no contradictions detected.

Note: For this dimension, unlike the others, a **lower** score is better. The threshold is a **maximum**, not a minimum.

### freshness

Measures how many sources declare a freshness expectation.

```
freshnessSignal = count of sources where freshnessExpectation is defined

freshness = min(100, 60 + freshnessSignal * 15)
```

The base score is 60 even with no freshness declarations. Each source with a freshness expectation adds 15 points.

| Sources with freshness | Score |
| ---------------------- | ----- |
| 0                      | 60    |
| 1                      | 75    |
| 2                      | 90    |
| 3+                     | 100   |

### rights_sufficiency

Measures the proportion of rights flags that are set to `true` on the propagated artifact rights state.

```
checks = [
    rights_to_store,
    rights_to_train,
    rights_to_benchmark,
    rights_to_derive,
    rights_to_distill,
    rights_to_generate_synthetic_from,
]
passing = count of checks that are true

rights_sufficiency = round((passing / 6) * 100)
```

| Rights granted | Score |
| -------------- | ----- |
| 6 of 6         | 100   |
| 5 of 6         | 83    |
| 4 of 6         | 67    |
| 3 of 6         | 50    |

### task_observability

Measures the ratio of declared tools to distinct task families, with adjustments when no tasks are present.

```
taskCount = count of distinct taskFamilyId values in benchmark seed hints
toolCount = count of allowed_tools in the niche program

if taskCount == 0:
    if toolCount > 0:
        task_observability = 70
    else:
        task_observability = 40
else:
    task_observability = min(100, round((toolCount / max(1, taskCount)) * 60 + 30))
```

### benchmarkability

Measures the number of benchmark seed hints produced by the compiler.

```
seedCount = count of benchmark seed hints

benchmarkability = min(100, seedCount * 25)
```

| Seed count | Score |
| ---------- | ----- |
| 0          | 0     |
| 1          | 25    |
| 2          | 50    |
| 3          | 75    |
| 4+         | 100   |

To clear the default hard blocker threshold of 50, you need at least 2 benchmark seeds.

### measurable_success_criteria

Measures the number of success metrics declared in the niche program.

```
metricCount = count of success_metrics in the niche program

measurable_success_criteria = min(100, 50 + metricCount * 20)
```

| Metric count | Score |
| ------------ | ----- |
| 0            | 50    |
| 1            | 70    |
| 2            | 90    |
| 3+           | 100   |

The base score is 50 even with no metrics. Each metric adds 20 points.

### tool_availability

Measures the number of declared tools in the niche program.

```
toolCount = count of allowed_tools in the niche program

tool_availability = min(100, 50 + toolCount * 15)
```

| Tool count | Score |
| ---------- | ----- |
| 0          | 50    |
| 1          | 65    |
| 2          | 80    |
| 3          | 95    |
| 4+         | 100   |

The base score is 50 even with no tools. Each tool adds 15 points. To clear the default threshold of 80, you need at least 2 tools.

---

## Default Thresholds

Defined in `src/niche/domain/readiness-thresholds.ts`:

```typescript
{
  source_quality_min: 70,
  source_coverage_min: 30,     // 3+ distinct source kinds out of 10
  contradiction_rate_max: 30,
  freshness_min: 60,
  rights_sufficiency_min: 80,
  task_observability_min: 50,
  benchmarkability_min: 50,    // 2+ benchmark seeds
  measurable_success_criteria_min: 70,
  tool_availability_min: 80,
}
```

---

## Hard Blocker Details

Hard blockers prevent a niche from proceeding to specialization. They are evaluated in the readiness gate (`src/niche/domain/readiness-gate.ts`).

### insufficient_rights_to_use

**Trigger:** The propagated rights state has `rights_to_store == false` or `rights_to_benchmark == false`.

**Resolution:** Ensure all source descriptors grant `rights_to_store: true` and `rights_to_benchmark: true`. The propagated rights state is the intersection (logical AND) of all source rights.

### benchmarkability_below_minimum_threshold

**Trigger:** The benchmarkability score is below `benchmarkability_min` (default 50).

**Resolution:** Add more benchmark seed source descriptors. At least 2 seeds are required to reach a score of 50.

### contradiction_rate_exceeds_hard_threshold

**Trigger:** The contradiction rate score exceeds `contradiction_rate_max` (default 30).

**Resolution:** Resolve conflicting metadata between sources. Sources with high token overlap but different `provenance_status` or `quarantined` flags trigger contradiction pressure. Ensure metadata consistency across similar sources.

### tool_availability_inadequate_for_workflow

**Trigger:** The tool availability score is below `tool_availability_min` (default 80).

**Resolution:** Declare more tools in the niche program's `allowed_tools` array. At least 2 tools are required to reach a score of 80.

### source_coverage_too_low_for_benchmarkable_domain_pack

**Trigger:** The source coverage score is below `source_coverage_min` (default 30).

**Resolution:** Provide sources from at least 3 distinct source kinds (out of the 10 available). For example: `repos` + `logs` + `tool_schemas`.

---

## Warning Details

Warnings do not block specialization but indicate areas that could be improved.

| Warning Code             | Trigger                                                              | Recommendation                                                                        |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `low_source_quality`     | `source_quality < source_quality_min` (70)                           | Improve provenance verification and redaction status of sources.                      |
| `low_freshness`          | `freshness < freshness_min` (60)                                     | Add `freshnessExpectation` to source descriptors.                                     |
| `low_task_observability` | `task_observability < task_observability_min` (50)                   | Add more tools or ensure benchmark seeds cover declared task families.                |
| `weak_success_criteria`  | `measurable_success_criteria < measurable_success_criteria_min` (70) | Add more success metrics to the niche program. At least 1 metric gives a score of 70. |
| `rights_need_review`     | `rights_sufficiency < rights_sufficiency_min` (80)                   | Review source rights. At least 5 of 6 rights flags should be true.                    |

---

## Recommended Actions

The readiness gate generates recommended actions based on the blockers and warnings present:

| Condition                             | Action ID                     | Summary                                                              | Priority    |
| ------------------------------------- | ----------------------------- | -------------------------------------------------------------------- | ----------- |
| `insufficient_rights_to_use` blocker  | `resolve_rights_gap`          | Acquire explicit authorization for storage and benchmark reuse.      | required    |
| `source_coverage_too_low_...` blocker | `increase_source_coverage`    | Add more approved workflow sources before attempting specialization. | required    |
| `low_freshness` warning               | `refresh_sources`             | Refresh stale sources before benchmark generation.                   | recommended |
| `weak_success_criteria` warning       | `clarify_success_metrics`     | Define clearer pass/fail criteria for the target workflow.           | recommended |
| No blockers or warnings               | `proceed_with_specialization` | The niche is ready for the next specialization stage.                | optional    |
