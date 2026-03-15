# NicheClaw PRD v3.1 Technical Annex

## Document status

- Version: v3.1 annex
- Parent document: `NICHECLAW_PRD_V3.md`
- Role: engineering and evaluation annex
- Intent: remove ambiguity from the build by defining manifests, benchmark protocol, grader trust, action-policy internals, run-trace replayability, and contamination policy
- Stability patch companion: `NICHECLAW_PRD_V3_1A_PATCH.md`

---

## 0. Purpose

`NICHECLAW_PRD_V3.md` is the strategy document.

This annex turns the strategy into an engineering-grade specification for the parts most likely to become fuzzy, overstated, or contaminated if left informal:

1. Baseline and candidate manifests
2. Benchmark protocol
3. Grader registry and calibration
4. Action policy internal architecture
5. Replayable run traces
6. Contamination, rights, and live-trace reuse policy

---

## 1. BaselineManifest and CandidateManifest

Same-model benchmarking is only honest if the full runtime stack is pinned.

### 1.1 BaselineManifest

The `BaselineManifest` defines the exact configuration of the general-agent control arm.

Required fields:

- `baseline_manifest_id`
- `niche_program_id`
- `created_at`
- `planner_runtime`
- `provider`
- `model_id`
- `model_snapshot_id`
- `api_mode`
- `sampling_config`
- `tool_catalog_version`
- `tool_allowlist`
- `tool_contract_version`
- `retrieval_config`
- `prompt_asset_version`
- `verifier_config`
- `grader_set_version`
- `benchmark_suite_id`
- `source_access_manifest_id`
- `retry_policy`
- `token_budget`
- `context_budget`
- `execution_mode`
- `notes`

### 1.2 CandidateManifest

The `CandidateManifest` defines the exact configuration of the candidate niche stack.

Required fields:

- `candidate_manifest_id`
- `niche_program_id`
- `based_on_baseline_manifest_id`
- `created_at`
- `planner_runtime`
- `provider`
- `model_id`
- `model_snapshot_id`
- `api_mode`
- `sampling_config`
- `domain_pack_id`
- `action_policy_id`
- `retrieval_stack_id`
- `verifier_pack_id`
- `prompt_asset_version`
- `optional_student_model_ids`
- `grader_set_version`
- `benchmark_suite_id`
- `source_access_manifest_id`
- `retry_policy`
- `token_budget`
- `context_budget`
- `execution_mode`
- `candidate_recipe`
- `notes`

### 1.3 Manifest invariants

- The benchmark suite for the baseline and candidate must be identical for a comparison run.
- The provider, planner model family, and source access set must remain identical unless the comparison is explicitly marked as a cross-model experiment.
- If any field that affects execution differs and is not recorded in the manifest, the comparison is invalid.

### 1.4 SourceAccessManifest

Define the allowed information surface for a benchmark arm.

Required fields:

- `source_access_manifest_id`
- `allowed_tools`
- `allowed_retrieval_indices`
- `allowed_live_sources`
- `disallowed_sources`
- `sandbox_policy`
- `network_policy`
- `approval_policy`

---

## 2. Benchmark protocol

NicheClaw must treat benchmark claims as experimental claims, not dashboard impressions.

### 2.1 Benchmark modes

- `offline_gold`: held-out curated benchmark set
- `offline_shadow`: hidden operator-only benchmark set
- `live_shadow`: real traffic run in shadow mode with no user-visible output
- `live_canary`: limited user-visible candidate traffic

### 2.2 Experimental unit

The unit of comparison is a paired eval case:

- same task,
- same allowed tools,
- same source-access manifest,
- same planner runtime family,
- baseline arm,
- candidate arm.

### 2.3 Required benchmark outputs

Every evaluation run must emit:

- per-case score,
- per-case hard-fail flag,
- per-case latency,
- per-case cost,
- per-case verifier outcome,
- per-case grader version,
- confidence interval summary,
- stratified score summary by task family,
- contamination audit summary.

### 2.4 Statistical policy

For each primary metric:

- compute paired delta by eval case,
- compute bootstrap confidence interval over the paired deltas,
- report mean, median, and p10/p90 paired deltas,
- report stratified deltas by task family and difficulty,
- reject promotion if headline gain depends on a single task cluster.

### 2.5 Minimum benchmark size

Promotion-eligible benchmark suites must satisfy:

- at least 100 held-out cases for MVP, unless operator explicitly marks niche as low-data experimental,
- at least 3 task families when the niche supports them,
- at least 20% of cases with recovery/tool complexity when the niche is tool-driven.

### 2.6 Stopping rules

Benchmark execution must stop early only when one of these is true:

- candidate is already mathematically incapable of meeting minimum lift under the remaining budget,
- hard-fail rate has crossed a non-recoverable rejection threshold,
- operator budget ceiling is reached,
- infrastructure failure invalidates the run.

Do not stop because intermediate results "look good enough."

### 2.7 Promotion thresholds

Default thresholds:

- primary metric lower bound of paired confidence interval > 0,
- preferred threshold: lower bound exceeds configured minimum lift margin,
- hard-fail regression within configured limit,
- no critical task family regresses beyond allowed tolerance,
- verifier false-veto rate remains within threshold,
- shadow outcomes match offline trend closely enough to justify promotion.

### 2.8 Benchmark invalidation conditions

A benchmark result is invalid if:

- manifests are incomplete,
- grader version drifted mid-run,
- contamination policy was violated,
- baseline and candidate had unequal source access,
- the benchmark suite changed during the comparison.

---

## 3. Grader registry and calibration

Graders are first-class artifacts and must not be treated as invisible truth machines.

### 3.1 Grader types

- deterministic rule graders
- schema validators
- trace graders
- model-based graders
- SME review graders
- pairwise preference graders

### 3.2 GraderArtifact schema

Required fields:

- `grader_id`
- `grader_type`
- `version`
- `owner`
- `calibration_suite_id`
- `prompt_or_rule_hash`
- `model_runtime_if_applicable`
- `decision_schema`
- `expected_failure_modes`
- `created_at`

### 3.3 Calibration requirements

Before a grader is allowed to gate promotion:

- it must be tested on a calibration set,
- calibration set must contain true positives, true negatives, and ambiguous cases,
- grader agreement against SMEs must be recorded,
- disagreement clusters must be reviewable.

### 3.4 Grader metrics

Track:

- grader precision,
- grader recall,
- grader agreement with SMEs,
- pairwise consistency,
- drift over time,
- exploitability signals.

### 3.5 Grader governance

- No promotion may rely on an uncalibrated grader.
- Model-based graders must themselves be version-pinned in the manifest.
- Grader changes require a new version and cannot silently modify historical scorecards.

---

## 4. Action policy internal architecture

The action policy must not be one opaque learned box.

### 4.1 Required internal split

The action policy is composed of three layers:

1. `contract_guard`
2. `tool_selector`
3. `repair_and_retry_policy`

### 4.2 Contract guard

Deterministic layer that:

- checks tool availability,
- checks schema validity,
- checks permission policy,
- checks domain and release constraints,
- blocks obviously invalid actions before execution.

### 4.3 Tool selector

Learned or heuristic ranking layer that:

- chooses the best tool,
- ranks alternatives,
- estimates action risk,
- emits structured action proposals.

### 4.4 Repair and retry policy

Layer that:

- handles malformed arguments,
- handles transient failures,
- chooses whether to retry, repair, escalate, or stop,
- learns from failure clusters.

### 4.5 ActionProposal schema refinement

Add these required fields to every proposal:

- `candidate_rankings`
- `selected_reason`
- `guard_decision`
- `guard_failure_reason`
- `selector_score`
- `repair_strategy_id`
- `attempt_index`
- `previous_attempt_ref`

### 4.6 Attribution requirement

Benchmark reporting must be able to attribute whether a win came from:

- better tool selection,
- better argument quality,
- better repair policy,
- stricter blocking,
- or planner improvements.

---

## 5. Replayable RunTrace expansion

Current v3 `RunTrace` is directionally correct, but reproducibility requires more.

### 5.1 Expanded required fields

Add:

- `baseline_or_candidate_manifest_id`
- `planner_version_id`
- `action_policy_version_id`
- `verifier_pack_version_id`
- `retrieval_stack_version_id`
- `grader_set_version_id`
- `source_access_manifest_id`
- `runtime_snapshot_id`
- `context_bundle_id`
- `evidence_bundle_refs`
- `benchmark_arm_id`
- `benchmark_case_id_if_applicable`
- `random_seed`
- `phase_timestamps`
- `wall_clock_start_at`
- `wall_clock_end_at`
- `replayability_status`
- `determinism_notes`

### 5.2 Phase timestamps

Track timestamps for at least:

- planner start/end,
- action proposal generation,
- tool execution start/end,
- verifier start/end,
- final emission,
- trace persistence.

### 5.3 Replayability status

`replayability_status` values:

- `replayable`
- `partially_replayable`
- `non_replayable`

Reasons for partial or non-replayable status must be explicit.

### 5.4 Evidence bundle requirements

Every trace using retrieval must record:

- source IDs,
- source hashes or immutable refs,
- retrieval query,
- reranker output,
- final evidence bundle delivered to the planner/verifier.

### 5.5 Benchmark replay policy

All benchmark traces must be replayable or explicitly marked non-replayable with justification.

---

## 6. Contamination and rights policy

This section is mandatory because NicheClaw’s credibility depends on it.

### 6.1 Data zones

Data must be tagged into one of these zones:

- `train`
- `dev`
- `gold_eval`
- `hidden_eval`
- `shadow_only`
- `quarantined`

### 6.2 Hard contamination rules

- `gold_eval` data may never enter training artifacts.
- `hidden_eval` data may never be exposed to operators constructing candidate recipes.
- `shadow_only` live traces may not enter training until their embargo expires.
- Any artifact trained with contaminated data is ineligible for promotion until rebuilt.

### 6.3 Live-trace embargo

Live traces must default to embargo before training reuse.

Recommended default:

- embargo for at least one evaluation cycle,
- embargo until contamination checks pass,
- embargo until rights policy confirms the trace is reusable.

### 6.4 Rights and policy tags

Every ingested source and live trace must have:

- `rights_to_store`
- `rights_to_train`
- `rights_to_benchmark`
- `retention_policy`
- `redaction_status`
- `pii_status`

### 6.5 Quarantine conditions

Move data to `quarantined` if:

- rights are unclear,
- redaction failed,
- the source is contradictory or corrupted,
- provenance cannot be established,
- the source is later discovered to overlap with gold or hidden eval.

---

## 7. Niche readiness gate

Before any specialization run starts, NicheClaw must decide whether the niche is ready.

### 7.1 Gate outputs

- `ready`
- `ready_with_warnings`
- `not_ready`

### 7.2 Gate dimensions

Score:

- source quality,
- source coverage,
- task observability,
- contradiction rate,
- freshness,
- rights-to-use,
- benchmarkability,
- measurable success criteria,
- tool availability.

### 7.3 Gate policy

If the niche is `not_ready`, NicheClaw must refuse to claim it can specialize the niche and must explain what is missing.

---

## 8. Verifier evaluation policy

Verifier packs are only useful if they help more than they hurt.

### 8.1 Required verifier metrics

- true positive rate on real failures,
- false positive rate,
- false-veto rate,
- pass-through rate,
- latency added,
- cost added,
- operator override rate.

### 8.2 Verifier promotion rule

A verifier pack cannot be promoted merely because it increases vetoes. It must improve net benchmark quality while keeping false vetoes and operational cost within thresholds.

---

## 9. Semantic seam map

Line-number patch maps rot. Engineering should bind to semantic seams instead.

### 9.1 Planner seam

Definition:

The point after session/model/runtime resolution and before the actual run begins.

Current repo anchors:

- `src/commands/agent.ts`
- `src/auto-reply/reply/get-reply-run.ts`
- `src/agents/pi-embedded-runner/run.ts`

### 9.2 Action seam

Definition:

The point where a planner-intended action becomes an executable tool invocation.

Current repo anchors:

- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/pi-embedded-subscribe.handlers.tools.ts`

### 9.3 Verifier seam

Definition:

The point after the model/tool loop has produced a candidate response and before final user-visible delivery.

Current repo anchors:

- `src/auto-reply/reply/agent-runner.ts`
- `src/commands/agent/delivery.ts`
- `src/auto-reply/reply/dispatch-from-config.ts`

### 9.4 Trace seam

Definition:

The point where one run’s execution artifacts become a durable, queryable record.

Current repo anchors:

- `src/config/sessions/transcript.ts`
- `src/agents/cache-trace.ts`
- `src/infra/session-cost-usage.ts`

### 9.5 Lifecycle seam

Definition:

The point where NicheClaw can observe, mutate, or gate runtime phases through typed interfaces and events.

Current repo anchors:

- `src/plugins/types.ts`
- `src/plugins/hooks.ts`

---

## 10. Build-readiness checklist

Before engineering begins on the specialization engine, the repo should have:

- manifests defined,
- benchmark protocol codified,
- grader registry defined,
- run traces expanded,
- contamination policy enforced,
- niche readiness gate specified.

This annex is the minimum required to make the strategy document operationally safe.
