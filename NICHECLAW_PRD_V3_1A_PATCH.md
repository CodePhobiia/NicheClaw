# NicheClaw PRD v3.1a Patch

## Document status

- Version: v3.1a patch
- Parent documents:
  - `NICHECLAW_PRD_V3.md`
  - `NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md`
- Role: patch set to freeze remaining high-risk ambiguities before broad engineering implementation

---

## 0. Purpose

This patch closes the remaining gaps that could still cause engineering drift, benchmark theater, weak reproducibility, or governance failures even after `v3.1`.

The patch adds:

1. provider-reality manifest fields,
2. formal `CandidateRecipe` plus artifact-lineage references,
3. episode-level benchmark protocol,
4. determinism and cache policy,
5. grader arbitration and SME sampling rules,
6. derived-data rights fields,
7. post-promotion drift monitoring,
8. reward-artifact governance,
9. readiness-gate thresholds,
10. seam contract tests.

---

## 1. Provider-reality manifest patch

`model_snapshot_id` remains desirable, but it is not sufficient for all providers.

### 1.1 Manifest field additions

Add these fields to both `BaselineManifest` and `CandidateManifest`:

- `provider_release_label`
- `api_revision`
- `capability_snapshot_at`
- `routing_proxy_version`
- `provider_metadata_quality`
- `provider_runtime_notes`

### 1.2 Field definitions

- `provider_release_label`
  Use the most stable provider-visible release label available when a true snapshot ID is unavailable.

- `api_revision`
  Record the API version, compatibility mode, or protocol revision used for the run.

- `capability_snapshot_at`
  Timestamp when model capabilities were probed or resolved for this manifest.

- `routing_proxy_version`
  Required when the runtime model is reached through a proxy, gateway, or provider aggregation layer.

- `provider_metadata_quality`
  Enum:
  - `exact_snapshot`
  - `release_label_only`
  - `proxy_resolved`
  - `opaque_provider`

- `provider_runtime_notes`
  Free-text explanation of known reproducibility limits.

### 1.3 Manifest reproducibility rule

Every comparison report must explicitly state the provider metadata quality. If metadata quality is below `release_label_only`, the result is valid for operational comparison but must be marked as reduced-reproducibility evidence.

---

## 2. CandidateRecipe and lineage patch

`candidate_recipe` must become a typed artifact, not just a narrative field.

### 2.1 CandidateRecipe schema

Required fields:

- `candidate_recipe_id`
- `niche_program_id`
- `created_at`
- `recipe_type`
- `teacher_runtimes`
- `input_dataset_refs`
- `synthesis_prompt_refs`
- `distillation_steps`
- `sidecar_training_steps`
- `verifier_training_steps`
- `retrieval_optimization_steps`
- `hyperparameters`
- `grader_refs`
- `evaluation_inputs`
- `promotion_inputs`

### 2.2 ArtifactRef schema

Required fields:

- `artifact_id`
- `artifact_type`
- `version`
- `content_hash`
- `rights_state`
- `created_at`

### 2.3 LineageRef schema

Required fields:

- `parent_artifact_id`
- `relationship`
- `derivation_step`
- `notes`

### 2.4 Artifact lineage rule

Every deployed component of a Niche Stack must be reconstructible through chained `ArtifactRef` and `LineageRef` entries. If it cannot be reconstructed, it cannot be promoted beyond experimental status.

---

## 3. Episode-level benchmark patch

Single-case benchmarking is insufficient for long-horizon agent behavior.

### 3.1 Benchmark unit expansion

Support both:

- `atomic_case`
- `episode_case`

### 3.2 EpisodeCase schema

Required fields:

- `episode_case_id`
- `suite_id`
- `split`
- `task_family`
- `initial_state`
- `allowed_tools`
- `allowed_sources`
- `step_constraints`
- `termination_conditions`
- `grader_spec`
- `hard_fail_conditions`
- `difficulty`
- `seed`

### 3.3 Episode evaluation requirements

Every episode evaluation must capture:

- total success/failure,
- step success trajectory,
- recovery behavior,
- retry behavior,
- tool misuse,
- verifier interventions,
- latency and cost per step,
- compaction or memory-related effects if relevant to the niche.

### 3.4 Promotion rule

For niches with long-running workflows, promotion is invalid unless the candidate wins on both:

- atomic benchmark sets,
- episode benchmark sets.

---

## 4. Determinism and cache policy patch

Replayability is not only metadata. It is a runtime discipline.

### 4.1 Benchmark source policy

- `offline_gold` and `offline_shadow` runs must prefer frozen or snapshotted sources.
- Live APIs are disallowed for gold benchmark runs unless the suite is explicitly marked as live-variance and results are excluded from promotion gating.

### 4.2 Cache policy

For every benchmark arm, record:

- retrieval cache state,
- provider prompt cache state if visible,
- exemplar cache state,
- tool-side cache state where relevant.

### 4.3 Allowed cache modes

- `cold`
- `warm`
- `fixed_snapshot`

Baseline and candidate must run under identical cache mode for a valid comparison.

### 4.4 Wall-clock policy

If a task is time-sensitive, benchmark cases must declare:

- `time_frozen`
- `time_simulated`
- or `time_live`

`time_live` cases are not promotion-gating gold cases unless the niche explicitly depends on live temporal variance.

### 4.5 DeterminismRuntimePolicy schema

Required fields:

- `determinism_policy_id`
- `source_mode`
- `cache_mode`
- `clock_mode`
- `network_mode`
- `seed_policy`
- `environment_snapshot_policy`

---

## 5. Grader arbitration patch

Calibrated graders can still disagree. Arbitration must be explicit.

### 5.1 Arbitration modes

Supported modes:

- `rule_first`
- `hierarchical_override`
- `weighted_vote`
- `sme_required_on_conflict`

### 5.2 Default arbitration policy

Default:

- deterministic rule graders decide hard structural failures,
- model graders score qualitative dimensions,
- SME adjudication is required on conflict for promotion-critical cases.

### 5.3 SME sampling rule

Each promotion cycle must include an SME-reviewed sample large enough to detect grader drift.

Default minimum:

- at least 10% of gold benchmark cases,
- and never fewer than 20 cases when gold benchmark size permits.

### 5.4 ArbitrationArtifact schema

Required fields:

- `arbitration_policy_id`
- `grader_refs`
- `conflict_resolution_mode`
- `sme_sampling_rate`
- `promotion_blocking_conflict_types`

---

## 6. Derived-data rights patch

Rights policy must extend to derivative artifacts, not just raw sources.

### 6.1 Rights field additions

Add to source and artifact metadata:

- `rights_to_derive`
- `rights_to_distill`
- `rights_to_generate_synthetic_from`

### 6.2 Derived artifact rule

No synthetic, distilled, verifier, or trace-derived dataset may be used for training or promotion if its upstream source lineage lacks the required derivative rights.

### 6.3 Rights propagation rule

Derived artifacts inherit the most restrictive rights status from their lineage unless a stronger explicit authorization record exists.

---

## 7. Post-promotion drift monitoring patch

Promotion is the start of live accountability, not the end of evaluation.

### 7.1 PromotedReleaseMonitor schema

Required fields:

- `promoted_release_id`
- `baseline_manifest_id`
- `candidate_manifest_id`
- `shadow_recheck_policy`
- `drift_thresholds`
- `verifier_drift_thresholds`
- `grader_drift_thresholds`
- `freshness_decay_policy`
- `rollback_policy`

### 7.2 Drift dimensions

Track:

- task success drift,
- task-family drift,
- verifier false-veto drift,
- grader disagreement drift,
- source freshness decay,
- latency/cost drift,
- hard-fail drift.

### 7.3 Rollback policy

Rollback can be triggered by:

- sustained degradation across a configured window,
- critical hard-fail spike,
- verifier drift beyond threshold,
- grader-trust degradation,
- source freshness collapse in time-sensitive niches.

---

## 8. Reward-artifact governance patch

If reward models or process-reward artifacts influence training, they must be governed like graders.

### 8.1 RewardArtifact schema

Required fields:

- `reward_artifact_id`
- `reward_type`
- `version`
- `training_inputs`
- `calibration_suite_id`
- `lineage_refs`
- `owner`
- `created_at`

### 8.2 Reward governance rule

No reward artifact may influence promotion-eligible training unless it has:

- lineage,
- calibration evidence,
- version pinning,
- and documented failure modes.

### 8.3 Scope rule

If reward artifacts are not used in a niche, they remain out of scope. If they are used, they become first-class governance objects.

---

## 9. Readiness-gate threshold patch

The readiness gate must be enforceable, not advisory.

### 9.1 Readiness dimensions

Every niche receives machine-generated scores for:

- source quality,
- source coverage,
- contradiction rate,
- freshness,
- rights sufficiency,
- task observability,
- tool availability,
- benchmarkability.

### 9.2 Hard blockers

A niche is automatically `not_ready` if any of these are true:

- rights-to-use are insufficient,
- benchmarkability is below minimum threshold,
- contradiction rate exceeds hard threshold,
- tool availability is inadequate for the declared workflow,
- source coverage is too low to support a benchmarkable domain pack.

### 9.3 ReadinessReport schema

Required fields:

- `readiness_report_id`
- `niche_program_id`
- `status`
- `dimension_scores`
- `hard_blockers`
- `warnings`
- `recommended_next_actions`
- `generated_at`

---

## 10. Seam contract test patch

Semantic seams must be paired with tests or they will drift as the OpenClaw fork evolves.

### 10.1 Required seam contract suites

Create contract test suites for:

- `planner seam`
- `action seam`
- `verifier seam`
- `trace seam`
- `lifecycle seam`

### 10.2 Contract assertions

Examples:

- planner seam always emits manifest-bound run metadata,
- action seam always produces structured `ActionProposal` records before execution,
- verifier seam can veto or repair before user-visible delivery,
- trace seam always persists benchmark-relevant artifacts,
- lifecycle seam emits all required typed events for optimization services.

### 10.3 Repo placement

Recommended initial placement:

- `src/niche/contracts/*.test.ts`
- `test/niche/contracts/*.test.ts`

These tests should validate seam behavior, not implementation line numbers.

---

## 11. Freeze condition

`v3` plus `v3.1` plus this `v3.1a` patch should be considered the minimum documentation set required before broad implementation begins.

After this patch, the remaining work should move from product ambiguity reduction into concrete system design and code.
