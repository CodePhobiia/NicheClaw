---
summary: "How to use niche inspect and niche compare to debug NicheClaw artifacts, manifests, and release decisions."
read_when:
  - You need to debug a NicheClaw artifact or manifest
  - You want to understand why a release was rejected
  - You are investigating benchmark comparison issues
title: "Debugging Guide"
---

# Debugging Guide

NicheClaw provides two primary debugging commands: `niche inspect` for examining individual artifacts, and `niche compare` for analyzing paired manifest comparisons. This guide covers when to use each, what they check, and common debugging workflows.

## When to use `niche inspect` vs `niche compare`

| Goal                                                | Command         |
| --------------------------------------------------- | --------------- |
| Validate a single artifact file against its schema  | `niche inspect` |
| View a summary of a manifest, recipe, or monitor    | `niche inspect` |
| Check whether baseline and candidate are comparable | `niche compare` |
| Debug a release rejection                           | `niche compare` |
| Validate benchmark evidence bindings                | `niche compare` |
| Check governance issues across the comparison pair  | `niche compare` |

Use `niche inspect` when you have one file and want to know if it is valid and what it contains. Use `niche compare` when you have a baseline/candidate pair and want to understand how they relate and whether the candidate can be promoted.

## The 6 inspect kinds

The `niche inspect` command accepts a `--kind` argument and a file path. It validates the file against the corresponding schema and prints a summary.

### baseline_manifest

Inspects a baseline manifest file. The summary includes:

- `manifest_id` - the baseline manifest identifier
- `niche_program_id` - which program this baseline belongs to
- `provider` and `model_id` - the model configuration
- `provider_metadata_quality` - how precisely the model version is pinned
- `benchmark_suite_id` - the evaluation suite
- `source_access_manifest_id` - the access controls
- `tool_allowlist_count` - number of permitted tools

```bash
openclaw niche inspect --kind baseline_manifest --file baseline.json
```

### candidate_manifest

Inspects a candidate manifest file. The summary includes everything from the baseline plus:

- `based_on` - the baseline manifest this candidate derives from
- `domain_pack_id` - the compiled domain knowledge
- `action_policy_id`, `retrieval_stack_id`, `verifier_pack_id` - specialization components
- `tool_catalog_version` and `tool_contract_version` - tool pinning
- `candidate_recipe` - the recipe that produced this candidate

```bash
openclaw niche inspect --kind candidate_manifest --file candidate.json
```

### source_access_manifest

Inspects a source access manifest. The summary shows:

- `allowed_tools` - tools the manifest permits
- `allowed_retrieval_indices` and `allowed_live_sources` - data access
- `disallowed_sources` - explicitly blocked sources
- `sandbox_policy`, `network_policy`, `approval_policy` - security controls

```bash
openclaw niche inspect --kind source_access_manifest --file source-access.json
```

### candidate_recipe

Inspects a candidate recipe. The summary shows:

- `recipe_type` - the type of recipe (e.g., distillation, prompt optimization)
- `teacher_runtimes` - which models were used as teachers
- `input_dataset_count`, `grader_count` - artifact counts
- `evaluation_input_count`, `promotion_input_count` - evidence counts

```bash
openclaw niche inspect --kind candidate_recipe --file recipe.json
```

### artifact

Inspects a generic artifact. The summary shows:

- `artifact_type` - the kind of artifact (domain_pack, grader, etc.)
- `version` and `producer` - provenance
- `dataset_ref_count`, `source_trace_ref_count`, `lineage_count` - graph links
- `governed_data_status` - governance state
- `metric_keys` - what metrics this artifact reports

```bash
openclaw niche inspect --kind artifact --file artifact.json
```

### promoted_monitor

Inspects a promoted release monitor or monitor definition. The summary shows:

- `promoted_release_id` - which release is being monitored
- `baseline_manifest_id`, `candidate_manifest_id` - the comparison pair
- `required_case_kinds` - which benchmark case kinds are required
- `drift_thresholds`, `verifier_drift_thresholds`, `grader_drift_thresholds` - tolerance levels
- `shadow_recheck_policy`, `rollback_policy` - policy summaries
- `cadence_defaults` - monitoring schedule (if definition format)

```bash
openclaw niche inspect --kind promoted_monitor --file monitor.json
```

## JSON output

All inspect commands accept `--json` to output the full parsed record as JSON, useful for piping into other tools:

```bash
openclaw niche inspect --kind baseline_manifest --file baseline.json --json | jq '.summary'
```

## What `niche compare` checks

The `niche compare` command takes a baseline manifest and candidate manifest as required inputs, plus optional benchmark results, shadow results, a suite file, verifier metrics, and a monitor definition.

### Manifest comparability

The first check is whether the two manifests are structurally comparable. The comparison validates that the following fields match:

- `benchmark_suite_id` - must be the same suite
- `provider` and `model_id` - must be the same model (unless cross-model experiment)
- `planner_runtime` - must match component ID, provider, and model
- `source_access_manifest_id` - must use the same access controls
- Execution invariants: `api_mode`, `sampling_config`, `retry_policy`, `token_budget`, `context_budget`, `execution_mode`, `grader_set_version`, `tool_catalog_version`, `tool_allowlist`, `tool_contract_version`, `retrieval_config`, `verifier_config`

Each mismatch produces a `ManifestComparisonIssue` with one of these codes:

| Code                           | Meaning                           |
| ------------------------------ | --------------------------------- |
| `benchmark_suite_mismatch`     | Suites differ                     |
| `provider_mismatch`            | Providers differ                  |
| `model_id_mismatch`            | Models differ                     |
| `planner_runtime_mismatch`     | Planner runtime components differ |
| `source_access_mismatch`       | Source access manifests differ    |
| `execution_invariant_mismatch` | An execution parameter differs    |

### Suite validation

If a `--suite` path is provided, the suite metadata is loaded and validated. The comparison reports:

- `benchmark_suite_id`, `case_kind`, `mode`
- `suite_hash` - integrity hash
- `fixture_version` - the fixture version used

### Evidence binding

When benchmark result paths are provided, the comparison:

1. Validates each result against `BenchmarkResultRecordSchema` (or falls back to `BenchmarkResultSummarySchema` with a governance warning)
2. Checks that benchmark results are bound to the correct baseline and candidate manifests
3. Reports contaminated and invalidated results
4. Computes aggregate `mean_delta` and `low_confidence_bound`

### Governance validation

The comparison checks grader governance for both manifests:

- Grader set existence and availability
- Arbitration artifact availability
- Fixture metadata availability and suite binding
- Individual grader artifact availability
- Grader calibration records: promotion eligibility and SME sampling sufficiency

If a monitor definition is provided, it also validates that the monitor's manifest IDs match the comparison pair.

### Release policy evaluation

When benchmark results, verifier metrics, and a monitor definition are all provided, the comparison runs the full release policy evaluation and reports:

- `recommended_decision` - the suggested release decision
- `warnings` - any policy warnings

## Common debugging workflows

### Why was my candidate rejected

1. Run `niche compare` with all available evidence:

```bash
openclaw niche compare \
  --baseline baseline.json \
  --candidate candidate.json \
  --suite suite.json \
  --benchmark-result result-1.json --benchmark-result result-2.json \
  --verifier-metrics verifier.json \
  --monitor-definition monitor.json \
  --json
```

2. Check `manifests_comparable` - if `false`, the manifests have structural issues that prevent comparison
3. Check `governance_issues` - these are blocking problems with grader calibration, evidence binding, or monitor configuration
4. Check `release_policy.recommended_decision` and `release_policy.warnings` for the specific rejection reason
5. Check `benchmark_summary.mean_delta` - a negative delta means the candidate performed worse

### Why are my manifests not comparable

1. Run `niche compare` with just the two manifests:

```bash
openclaw niche compare --baseline baseline.json --candidate candidate.json --json
```

2. Look at `comparison_issues` - each entry has a `code` and `message` explaining the mismatch
3. Common fixes:
   - `benchmark_suite_mismatch`: regenerate one manifest against the correct suite
   - `execution_invariant_mismatch`: check that sampling config, token budgets, and tool versions match
   - `provider_metadata_quality` differences do not block comparison but may affect confidence

### Why did my benchmark result get invalidated

1. Inspect the benchmark result:

```bash
openclaw niche inspect --kind artifact --file result.json --json
```

2. Check `invalidation_reasons` in the result summary
3. Common causes: contamination detected, suite hash mismatch between compile-time and run-time, grader conflicts with unresolved blocking types

### Validating a file before submission

Use `niche inspect` to catch schema validation errors early:

```bash
openclaw niche inspect --kind candidate_manifest --file my-candidate.json
```

If the file is invalid, the error message lists the specific schema violations. Fix them and re-run until validation passes.

### Checking post-promotion monitor configuration

```bash
openclaw niche inspect --kind promoted_monitor --file monitor-def.json --json
```

Verify that:

- `required_case_kinds` covers all case kinds you benchmark
- `drift_thresholds` are set appropriately for your risk class
- `cadence_defaults.shadow_recheck_interval_hours` matches your monitoring frequency
- `cadence_defaults.rollback_cooldown_hours` gives enough time to investigate before automatic rollback
