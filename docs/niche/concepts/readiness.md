---
summary: "The readiness gate determines whether a compiled niche is eligible for benchmarking and release by evaluating 9 dimensions, enforcing hard blockers, and surfacing warnings."
read_when:
  - You see a readiness failure or hard blocker during compilation
  - You want to understand why a niche is not ready for benchmarking
  - You need to improve readiness scores to unblock specialization
  - You want to know the scoring formulas and thresholds
title: "Readiness"
---

# Readiness

Readiness is the gate between compilation and benchmarking. After `openclaw niche compile` produces a [Domain Pack](/niche/concepts/domain-pack), the readiness gate evaluates whether the compiled niche has sufficient quality, coverage, and rights to proceed. No niche can enter benchmarking, optimization, or release without passing readiness.

## Three readiness statuses

| Status                | Meaning                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready`               | All dimension scores meet or exceed thresholds. No hard blockers or warnings. The niche can proceed to benchmarking.                                           |
| `ready_with_warnings` | No hard blockers, but one or more warning conditions exist. The niche can proceed, but the operator should address warnings to improve specialization quality. |
| `not_ready`           | One or more hard blockers are present. The niche cannot proceed until all blockers are resolved.                                                               |

## The 9 readiness dimensions

Each dimension produces a score from 0 to 100. Some dimensions use a minimum threshold (score must be at or above), while `contradiction_rate` uses a maximum threshold (score must be at or below, since higher means worse).

| Dimension                     | Default threshold | Direction                  | Scoring formula                                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | ----------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_quality`              | min 70            | Higher is better           | `(verified_and_clean_sources / total_sources) * 100`. Sources count as passing when `provenance_status` is `"verified"` and `redaction_status` is `"clean"`.                                                                                                                                                                              |
| `source_coverage`             | min 30            | Higher is better           | `(distinct_source_kinds_used / 10) * 100`. Measures how many of the 10 source kinds are represented. 3 distinct kinds yields a score of 30.                                                                                                                                                                                               |
| `contradiction_rate`          | max 30            | Lower is better (inverted) | Pairwise comparison of all normalized sources. For each pair, token overlap is computed (words longer than 3 characters). If similarity exceeds 0.3 and the pair has conflicting metadata (different `provenance_status` or `quarantined` flags), it counts as a contradiction. Final score: `(contradicting_pairs / total_pairs) * 100`. |
| `freshness`                   | min 60            | Higher is better           | `60 + (sources_with_freshness_expectation * 15)`, capped at 100. Each source that declares a `freshness_expectation` adds 15 points to a base of 60.                                                                                                                                                                                      |
| `rights_sufficiency`          | min 80            | Higher is better           | `(passing_rights_checks / 6) * 100`. The 6 checks are: `rights_to_store`, `rights_to_train`, `rights_to_benchmark`, `rights_to_derive`, `rights_to_distill`, `rights_to_generate_synthetic_from`. Each `true` value adds ~16.7 points.                                                                                                    |
| `task_observability`          | min 50            | Higher is better           | If no task families are identified: 70 if tools exist, 40 otherwise. With task families: `(tool_count / max(1, task_family_count)) * 60 + 30`, capped at 100.                                                                                                                                                                             |
| `benchmarkability`            | min 50            | Higher is better           | `benchmark_seed_count * 25`, capped at 100. Two benchmark seeds yield 50 (the minimum). Four or more seeds reach the maximum of 100.                                                                                                                                                                                                      |
| `measurable_success_criteria` | min 70            | Higher is better           | `50 + (success_metric_count * 20)`, capped at 100. One metric yields 70 (the minimum). Three or more metrics reach the maximum of 100.                                                                                                                                                                                                    |
| `tool_availability`           | min 80            | Higher is better           | `50 + (allowed_tool_count * 15)`, capped at 100. Two tools yield 80 (the minimum). Four or more tools reach the maximum of 100.                                                                                                                                                                                                           |

## Hard blockers

Hard blockers prevent a niche from proceeding to benchmarking. All 5 blockers must be resolved before the niche can reach `ready` or `ready_with_warnings` status.

| Blocker code                                            | Trigger condition                                                                                  | What to do                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `insufficient_rights_to_use`                            | The aggregate `ArtifactRightsState` has `rights_to_store` or `rights_to_benchmark` set to `false`. | Acquire explicit authorization for storage and benchmark reuse. Update the source rights declarations.                                 |
| `benchmarkability_below_minimum_threshold`              | The `benchmarkability` score is below 50 (fewer than 2 benchmark seeds).                           | Add more source material that enables benchmark seed generation, or add explicit benchmark seed hints.                                 |
| `contradiction_rate_exceeds_hard_threshold`             | The `contradiction_rate` score exceeds 30.                                                         | Remove or reconcile contradictory sources. Check for sources with conflicting provenance or quarantine status that overlap in content. |
| `tool_availability_inadequate_for_workflow`             | The `tool_availability` score is below 80 (fewer than 2 declared tools).                           | Add more tools to `allowed_tools` in the Niche Program, or verify that the declared tools cover the workflow.                          |
| `source_coverage_too_low_for_benchmarkable_domain_pack` | The `source_coverage` score is below 30 (fewer than 3 distinct source kinds).                      | Add approved sources of different kinds. For example, if you only have `repos`, add `logs` and `tool_schemas`.                         |

## Warnings

Warnings do not block progress but indicate areas that should be improved for better specialization quality.

| Warning code             | Trigger condition                             | Recommended action                                                                                          |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `low_source_quality`     | `source_quality` score below 70.              | Verify source provenance and ensure redaction is clean.                                                     |
| `low_freshness`          | `freshness` score below 60.                   | Refresh stale sources before benchmark generation.                                                          |
| `low_task_observability` | `task_observability` score below 50.          | Add more tools or source material that makes task steps observable.                                         |
| `weak_success_criteria`  | `measurable_success_criteria` score below 70. | Define clearer pass/fail criteria for the target workflow. Add more `success_metrics` to the Niche Program. |
| `rights_need_review`     | `rights_sufficiency` score below 80.          | Review and update rights declarations. Ensure all 6 rights flags are set correctly.                         |

## Recommended actions

The readiness report includes a `recommended_next_actions` list with prioritized guidance:

- **`required` priority:** Actions that must be completed to resolve hard blockers (e.g., `resolve_rights_gap`, `increase_source_coverage`).
- **`recommended` priority:** Actions that address warnings and improve quality (e.g., `refresh_sources`, `clarify_success_metrics`).
- **`optional` priority:** When no blockers or warnings exist, the single action `proceed_with_specialization` confirms the niche is ready.

## Checking readiness

Readiness is evaluated automatically during `openclaw niche compile`. The readiness report is saved alongside the Domain Pack. You can also run:

```bash
openclaw niche readiness --program <niche_program_id>
```

The report output includes all 9 dimension scores, any hard blockers, warnings, and recommended next actions.

## ReadinessReport schema

The persisted report contains:

| Field                      | Description                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `readiness_report_id`      | Identifier derived from the program ID.                                             |
| `niche_program_id`         | The program this report evaluates.                                                  |
| `status`                   | `"ready"`, `"ready_with_warnings"`, or `"not_ready"`.                               |
| `dimension_scores`         | All 9 dimension scores with rationale strings.                                      |
| `hard_blockers`            | Array of `{ blocker_code, message }` entries. Empty when status is not `not_ready`. |
| `warnings`                 | Array of `{ warning_code, message }` entries.                                       |
| `recommended_next_actions` | Array of `{ action_id, summary, priority }` entries.                                |
| `generated_at`             | ISO 8601 timestamp of when the report was generated.                                |
