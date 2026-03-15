---
summary: "Guide to evaluating release candidates, understanding promotion decisions, and configuring post-promotion monitoring."
read_when:
  - Have passing benchmark results and want to promote a candidate
  - Need to understand release decisions (promoted, rejected, shadow, canary, experimental)
  - Want to configure post-promotion monitoring and rollback
title: "Release and Promotion"
---

# Release and Promotion

After benchmarking, the release command evaluates whether a candidate specialization should be promoted to production. This guide covers the release decisions, required inputs, running the command, and configuring rollback.

## What Is a Release

A NicheClaw release evaluates a candidate specialization against promotion policy. The release command:

1. Loads baseline and candidate manifests.
2. Validates benchmark evidence (binding integrity, contamination, invalidation).
3. Evaluates the release policy against aggregated metrics and thresholds.
4. Produces a `CandidateRelease` with a decision and reason.
5. Optionally assesses post-promotion monitor observations.

## Release Decisions

The release policy engine produces one of five decisions:

### `promoted`

The candidate has passed all policy gates and is approved for production use.

**Requirements:**

- No blocking reasons.
- Shadow results are provided (when `require_shadow_results_for_promotion` is true, which is the default).
- Shadow mean delta is positive and shadow lower confidence bound is non-negative.

### `rejected`

The candidate failed one or more policy gates. The `blocking_reasons` array in the result explains every failure.

Common rejection reasons include:

- Benchmark case count below minimum (default: 100).
- Task family count below minimum (default: 3).
- Mean delta below zero.
- Lower confidence bound below threshold (default: 0.001).
- Hard-fail rate exceeds threshold (default: 15%).
- Verifier false-veto rate exceeds threshold (default: 10%).
- Operator override rate exceeds threshold (default: 10%).
- Latency or cost regression exceeds threshold (default: 15%).
- Task-family regressions detected.
- Contaminated or invalidated benchmark results.
- Missing durable evidence bindings (run traces, replay bundles, evidence bundle IDs).
- Post-promotion monitoring not configured.
- Single task family contributes more than 70% of the aggregate positive delta.

### `shadow`

The candidate won offline benchmarks but needs additional shadow evidence before promotion. This decision is issued when:

- No blocking reasons exist.
- Shadow results are not yet provided (and `require_shadow_results_for_promotion` is true).
- Or shadow evidence exists but is not strong enough for canary.

### `canary`

The candidate shows marginal improvement in shadow evaluation and should be deployed to a subset of traffic for further validation. This decision is issued when:

- No blocking reasons exist.
- Shadow mean delta is non-negative but the lower confidence bound is negative or zero.
- `allow_canary_on_marginal_win` is true (the default).

### `experimental`

Available as a release decision for manual classification of experimental candidates that do not yet meet standard promotion criteria.

## Required Inputs

The release command requires several input files:

| Input                   | Flag                                                                    | Description                                      |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| Baseline manifest       | `--baseline-manifest` or auto-resolved via `--from-program`             | The unspecialized baseline configuration.        |
| Candidate manifest      | `--candidate-manifest` or auto-resolved via `--from-program`            | The specialized candidate configuration.         |
| Benchmark results       | `--benchmark-result` (repeatable) or auto-resolved via `--from-program` | One or more benchmark result record files.       |
| Verifier metrics        | `--verifier-metrics`                                                    | A JSON file with verifier metric summary.        |
| Monitor definition      | `--monitor`                                                             | A promoted release monitor definition.           |
| Component artifact refs | `--component-artifact-ref` (repeatable)                                 | Artifact refs for the components being promoted. |

Optional inputs:

| Input               | Flag                           | Description                                                            |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| Shadow results      | `--shadow-result` (repeatable) | Shadow benchmark result records.                                       |
| Monitor observation | `--monitor-observation`        | Current drift observations for rollback assessment.                    |
| Approved by         | `--approved-by` (repeatable)   | Approver identifiers. Defaults to `["niche-cli"]`.                     |
| Rollback target     | `--rollback-target`            | The manifest ID to roll back to. Defaults to the baseline manifest ID. |
| Latency regression  | `--latency-regression`         | Fractional latency regression (0.0 = none, 0.15 = 15%).                |
| Cost regression     | `--cost-regression`            | Fractional cost regression.                                            |

### Verifier metrics file

The verifier metrics JSON must include:

```json
{
  "sample_count": 500,
  "true_positive_rate": 0.92,
  "false_positive_rate": 0.04,
  "false_veto_rate": 0.03,
  "pass_through_rate": 0.88,
  "override_rate": 0.05,
  "mean_latency_added_ms": 120,
  "mean_cost_added": 0.002,
  "total_cost_added": 1.0,
  "counts": {
    "true_positive": 460,
    "false_positive": 20,
    "true_negative": 15,
    "false_negative": 5
  }
}
```

### Monitor definition file

The monitor definition configures post-promotion drift detection:

```json
{
  "monitor": {
    "promoted_release_id": "code-review-agent-release-v1",
    "baseline_manifest_id": "<baseline-manifest-id>",
    "candidate_manifest_id": "<candidate-manifest-id>",
    "required_case_kinds": ["atomic_case"],
    "shadow_recheck_policy": {
      "policy_id": "default-shadow-recheck",
      "summary": "Recheck shadow results at configured intervals."
    },
    "drift_thresholds": {
      "task_success_drift": 0.05,
      "task_family_drift": 0.05,
      "verifier_false_veto_drift": 0.03,
      "grader_disagreement_drift": 0.05,
      "source_freshness_decay": 0.1,
      "latency_cost_drift": 0.1,
      "hard_fail_drift": 0.05
    },
    "verifier_drift_thresholds": {
      "task_success_drift": 0.05,
      "task_family_drift": 0.05,
      "verifier_false_veto_drift": 0.03,
      "grader_disagreement_drift": 0.05,
      "source_freshness_decay": 0.1,
      "latency_cost_drift": 0.1,
      "hard_fail_drift": 0.05
    },
    "grader_drift_thresholds": {
      "task_success_drift": 0.05,
      "task_family_drift": 0.05,
      "verifier_false_veto_drift": 0.03,
      "grader_disagreement_drift": 0.05,
      "source_freshness_decay": 0.1,
      "latency_cost_drift": 0.1,
      "hard_fail_drift": 0.05
    },
    "freshness_decay_policy": {
      "policy_id": "default-freshness-decay",
      "summary": "Alert when source freshness decays beyond threshold."
    },
    "rollback_policy": {
      "policy_id": "default-rollback",
      "summary": "Rollback when consecutive breach windows exceed hysteresis."
    }
  },
  "cadence_defaults": {
    "shadow_recheck_interval_hours": 24,
    "evaluation_window_size": 100,
    "alert_hysteresis_windows": 3,
    "rollback_cooldown_hours": 48
  }
}
```

## Running the Release Command

Using `--from-program` to auto-resolve manifests and benchmark results:

```bash
openclaw niche release \
  --from-program code-review-agent \
  --verifier-metrics ./verifier-metrics.json \
  --monitor ./monitor-definition.json \
  --component-artifact-ref ./domain-pack-ref.json \
  --json
```

With explicit paths:

```bash
openclaw niche release \
  --baseline-manifest ./baseline-manifest.json \
  --candidate-manifest ./candidate-manifest.json \
  --benchmark-result ./benchmark-result-record.json \
  --shadow-result ./shadow-result-record.json \
  --verifier-metrics ./verifier-metrics.json \
  --monitor ./monitor-definition.json \
  --component-artifact-ref ./domain-pack-ref.json \
  --approved-by operator-1 \
  --rollback-target <baseline-manifest-id> \
  --json
```

## Understanding the Decision

The release command outputs a `NicheReleaseResult` with:

### `policy_evaluation`

Contains the recommended decision, blocking reasons, warnings, comparison issues, and aggregated metrics:

```
Release decision: promoted
Reason: Candidate passed all release policy gates.
Benchmark mean delta: 0.0423
Benchmark low confidence bound: 0.0089
False-veto rate: 0.0300
Override rate: 0.0500
Shadow recheck interval (hours): 24
```

Key aggregated metrics to review:

| Metric                           | What it means                                                                |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `benchmark_mean_delta`           | Average improvement of candidate over baseline. Must be > 0.                 |
| `benchmark_low_confidence_bound` | Lower bound of confidence interval. Must be > 0.001.                         |
| `benchmark_case_count`           | Total held-out cases evaluated. Must be >= 100.                              |
| `benchmark_task_family_count`    | Distinct task families covered. Must be >= 3.                                |
| `worst_hard_fail_rate`           | Highest hard-fail rate across all task families. Must be < 0.15.             |
| `false_veto_rate`                | Rate at which the verifier incorrectly blocks valid outputs. Must be < 0.10. |
| `override_rate`                  | Rate at which operators override verifier decisions. Must be < 0.10.         |
| `regressed_task_families`        | Task families where the candidate performed worse. Must be empty.            |
| `latency_regression`             | Fractional latency increase. Must be < 0.15.                                 |
| `cost_regression`                | Fractional cost increase. Must be < 0.15.                                    |

### `promotion_controller`

Contains the finalized `CandidateRelease` record with the decision, decision reason, approved-by list, component artifact refs, and rollback target.

### `promoted_monitor`

The monitor definition that will track post-promotion drift.

### `monitor_assessment` (optional)

If `--monitor-observation` was provided, this contains the drift assessment result including whether a rollback is recommended.

## Default Release Policy Thresholds

| Threshold                              | Default | Description                                      |
| -------------------------------------- | ------- | ------------------------------------------------ |
| `min_benchmark_case_count`             | 100     | Minimum held-out evaluation cases.               |
| `min_task_family_count`                | 3       | Minimum distinct task families.                  |
| `min_mean_delta`                       | 0       | Minimum mean improvement (candidate - baseline). |
| `min_confidence_interval_low`          | 0.001   | Minimum lower confidence bound.                  |
| `max_false_veto_rate`                  | 0.10    | Maximum verifier false-veto rate.                |
| `max_override_rate`                    | 0.10    | Maximum operator override rate.                  |
| `max_hard_fail_rate`                   | 0.15    | Maximum hard-fail rate across task families.     |
| `max_latency_regression`               | 0.15    | Maximum fractional latency regression.           |
| `max_cost_regression`                  | 0.15    | Maximum fractional cost regression.              |
| `require_shadow_results_for_promotion` | true    | Shadow results required for `promoted` decision. |
| `allow_canary_on_marginal_win`         | true    | Allow `canary` when shadow results are marginal. |

## Rollback

Every release stores a `rollback_target` -- the manifest ID to revert to if the promoted candidate degrades in production.

Rollback is triggered by the promoted release monitor when:

1. **Drift thresholds are breached.** The monitor tracks seven drift dimensions: task success, task family, verifier false-veto, grader disagreement, source freshness decay, latency/cost, and hard-fail.
2. **Consecutive breach windows exceed hysteresis.** The `alert_hysteresis_windows` setting (default: 3) prevents rollback on transient spikes.
3. **Rollback cooldown has elapsed.** The `rollback_cooldown_hours` setting (default: 48) prevents rapid rollback cycles.

To manually assess rollback readiness, provide a monitor observation file:

```bash
openclaw niche release \
  --from-program code-review-agent \
  --verifier-metrics ./verifier-metrics.json \
  --monitor ./monitor-definition.json \
  --component-artifact-ref ./domain-pack-ref.json \
  --monitor-observation ./current-drift.json \
  --json
```

The monitor observation file contains:

```json
{
  "observed_drift": {
    "task_success_drift": 0.02,
    "task_family_drift": 0.01,
    "verifier_false_veto_drift": 0.01,
    "grader_disagreement_drift": 0.02,
    "source_freshness_decay": 0.03,
    "latency_cost_drift": 0.04,
    "hard_fail_drift": 0.01
  },
  "consecutive_breach_windows": 0,
  "hours_since_last_rollback": 120
}
```

The `monitor_assessment` in the result will indicate whether `should_rollback` is `true` or `false`.

When a candidate is promoted, a `candidate_promoted` lifecycle event is emitted with the candidate release ID, rollback target, and manifest IDs, enabling downstream systems to react to the promotion.
