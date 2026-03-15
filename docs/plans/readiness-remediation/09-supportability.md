## Supportability Remediation Plan (SP-01 through SP-12)

Here is the complete plan for taking the Supportability dimension from 20/100 to 100/100.

---

### Plan Summary

The NicheClaw codebase has 12 CLI commands (`init`, `create`, `compile`, `readiness`, `prepare-run`, `run`, `benchmark`, `optimize`, `release`, `inspect`, `compare`, `quickstart`), 15 schema files defining approximately 80 typed objects, 9 readiness dimensions with hard blockers and warnings, 7 benchmark invalidation reasons, a full release policy engine with 12 threshold parameters, 9 lifecycle event types, 5 readiness hard blocker codes, 5 verifier finding categories, and approximately 60 distinct error throw sites. None of this is documented for operators.

The plan creates a complete documentation suite in `docs/niche/` following the existing Mintlify-hosted documentation conventions established in `docs/`. Every document is a new file creation; no existing files are modified except `docs/docs.json` which needs a new navigation group.

### File Inventory

The plan produces 14 new documentation files plus 1 modification:

1. `docs/niche/overview.md` -- Architecture overview for operators
2. `docs/niche/glossary.md` -- Domain-specific glossary (approximately 60 terms)
3. `docs/niche/getting-started.md` -- Getting started / quickstart guide
4. `docs/niche/cli-reference.md` -- Complete CLI command reference
5. `docs/niche/schema-reference.md` -- JSON schema reference for all artifacts
6. `docs/niche/readiness.md` -- Readiness system documentation
7. `docs/niche/benchmark.md` -- Benchmark lab documentation
8. `docs/niche/release.md` -- Release policy engine documentation
9. `docs/niche/debugging.md` -- Debugging guide (inspect/compare usage)
10. `docs/niche/troubleshooting.md` -- Troubleshooting guide with error catalog
11. `docs/niche/lifecycle-events.md` -- Lifecycle event / audit trail guide
12. `docs/niche/migration.md` -- Migration and upgrade guide
13. `docs/niche/faq.md` -- Frequently asked questions
14. `docs/niche/runbooks.md` -- Maintainer support runbooks
15. `docs/docs.json` modification -- Add NicheClaw navigation group

---

### SP-01: Architecture Overview for Operators

**Priority:** P0 (foundational -- all other docs reference it)

**Output file:** `docs/niche/overview.md`

**Content to extract from codebase:**

- Three-plane architecture from PRD v3 sections 9.1-9.4 (serving plane, control plane, optimization plane, data plane)
- The Niche Stack concept from PRD v3 section 7 (planner_runtime, domain_pack, action_policy, retrieval_stack, verifier_pack, benchmark_suite, release_policy, optional_student_models)
- Operator workflow stages from PRD v3 section 16 (define niche, ingest and compile, benchmark baseline, generate candidates, compare and shadow, promote or reject)
- Four specialization lanes from `src/niche/schema/common.ts` lines 31-36 (`system_specialization`, `distillation`, `provider_native_customization`, `prompt_policy_assets`)
- State storage layout from `src/niche/constants.ts` lines 4-19 (14 store directories under `~/.openclaw/niche/`)
- How NicheClaw fits into OpenClaw from `src/cli/program/register.niche.ts` lines 48-51

**Sections:**

1. What is NicheClaw
2. Three-plane architecture diagram (text-based)
3. The Niche Stack (what gets deployed)
4. Specialization lanes
5. Operator workflow (6 stages)
6. State directory layout
7. How NicheClaw relates to OpenClaw

**Dependencies:** None (write first)

---

### SP-02: Domain Glossary

**Priority:** P0 (all other docs use these terms)

**Output file:** `docs/niche/glossary.md`

**Terms to define (extracted from schema type names, enum values, and PRD concepts):**

Common types (from `src/niche/schema/common.ts`): Identifier, Version, Hash, Timestamp, RiskClass (`low`, `moderate`, `high`), SpecializationLane (4 values), SourceKind (10 values: `documents`, `websites`, `repos`, `logs`, `datasets`, `tool_schemas`, `past_task_traces`, `human_examples`, `domain_constraints`, `live_sources`), MetricObjective (`maximize`, `minimize`, `target`)

Core artifacts: NicheProgram, DomainPack, RunTrace, EvalCase, EpisodeCase, Artifact, CandidateRelease, CandidateRecipe, BaselineManifest, CandidateManifest, SourceAccessManifest, PreparedNicheRunSeed, NicheCompilationRecord, BenchmarkResultRecord, BenchmarkSuiteMetadata, ActiveNicheStackRecord

Domain pack components: Ontology, TaskFamily, TerminologyEntry, DomainConstraint, ToolContract, EvidenceSource, FailureMode, VerifierDefaults, BenchmarkSeedSpec

Benchmark terms: BenchmarkCaseKind (`atomic_case`, `episode_case`), BenchmarkMode (`offline_gold`, `offline_shadow`, `live_shadow`, `live_canary`), BenchmarkSplit (`train`, `dev`, `gold_eval`, `hidden_eval`, `shadow_only`, `quarantined`), BenchmarkArmKind (`baseline`, `candidate`), ClockMode, CacheMode, DeterminismRuntimePolicy, ContaminationAuditSummary, PairedDeltaSummary

Release terms: CandidateReleaseDecision (`promoted`, `rejected`, `shadow`, `canary`, `experimental`), ArtifactType (14 values), ArtifactRightsState (6 boolean rights), LineageRef, PromotedReleaseMonitor, DriftThresholdSet, MonitorPolicy

Readiness terms: ReadinessStatus (`ready`, `ready_with_warnings`, `not_ready`), ReadinessDimensionScore, ReadinessHardBlocker (5 codes), ReadinessWarning, ReadinessAction, ReadinessActionPriority (`required`, `recommended`, `optional`)

Trace terms: RunTraceMode (`baseline`, `candidate`, `shadow`, `benchmark`, `live`), ReplayabilityStatus (`replayable`, `partially_replayable`, `non_replayable`), ToolCallStatus, VerifierOutcome (`approved`, `repair_requested`, `escalated`, `vetoed`), TerminalRunStatus (`delivered`, `withheld`, `no_output`, `failed`, `aborted`)

Governance terms: DataZone, GraderType (6 types), ArbitrationMode (4 modes), QuarantineReason (5 reasons), GraderCalibrationRecord

Runtime terms: NicheStackResolutionSource (`session_override`, `route_override`, `agent_default`), NicheStackReleaseMode (`shadow`, `canary`, `live`, `rolled_back`), LifecycleEventType (9 types)

Verifier terms: VerifierFindingSeverity (`info`, `warning`, `moderate`, `high`, `critical`), VerifierFindingCategory (`grounding`, `constraint`, `format`, `release_policy`, `confidence`)

Source ingest terms: SourceInputKind (`local_file`, `repo_asset`, `structured_text`, `benchmark_seed`), SourceRightsMetadata, SourceProvenance, NormalizedSourceRecord

Invalidation terms: BenchmarkInvalidationReasonCode (7 codes)

Provider metadata quality: (`exact_snapshot`, `release_label_only`, `proxy_resolved`, `opaque_provider`)

**Format:** Alphabetical, with each term's source type, valid values (for enums), and a 1-3 sentence definition. Approximately 60 terms total.

**Dependencies:** None (write second)

---

### SP-03: Getting Started Guide

**Priority:** P0

**Output file:** `docs/niche/getting-started.md`

**Content to produce:**

A walkthrough that takes an operator from zero to a promoted candidate. Based on the 6-stage workflow (PRD section 16) and the CLI commands registered in `src/cli/program/register.niche.ts`.

**Sections:**

1. Prerequisites (Node 22+, OpenClaw installed, `pnpm install`)
2. Initialize state roots: `openclaw niche init --write-starter-program`
3. Create a niche program: `openclaw niche create --program ./niche-program.json` with a full example NicheProgram JSON (fields from `src/niche/schema/program.ts`)
4. Prepare source descriptors: explain the 4 source input kinds from `src/niche/schema/source-ingest.ts` (local_file, repo_asset, structured_text, benchmark_seed) with example JSON for each
5. Compile the domain: `openclaw niche compile --niche-program-id <id> --source ./sources/repo.json --source ./sources/seeds.json --json` -- explain the compilation record output
6. Check readiness: `openclaw niche readiness --niche-program-id <id>` -- explain what the 9 dimensions mean and what to do if not_ready
7. Prepare and run a baseline: `openclaw niche prepare-run` with key flags, then `openclaw niche run`
8. Benchmark: `openclaw niche benchmark` with --live flag
9. Optimize: `openclaw niche optimize` to generate candidates
10. Release: `openclaw niche release` to evaluate promotion
11. Inspect results: `openclaw niche inspect` and `openclaw niche compare`
12. Next steps (link to detailed guides)

**Dependencies:** SP-01 (overview), SP-02 (glossary)

---

### SP-04: CLI Command Reference

**Priority:** P0

**Output file:** `docs/niche/cli-reference.md`

**Content source:** `src/cli/program/register.niche.ts` lines 48-595 (all 12 commands with every flag)

**For each of the 12 commands, document:**

1. Command name and description
2. All required options with types and allowed values
3. All optional options with types, defaults, and allowed values
4. JSON output format (schema reference)
5. At least one complete example invocation
6. Exit codes and common errors

**Commands to document (from register.niche.ts):**

1. `niche init` -- 4 options (lines 103-119)
2. `niche create` -- 2 options (lines 121-133)
3. `niche compile` -- 5 options (lines 135-160)
4. `niche readiness` -- 2 options (lines 162-174)
5. `niche prepare-run` -- 30+ options (lines 176-264), the most complex command
6. `niche run` -- 17 options (lines 266-316)
7. `niche benchmark` -- 12 options (lines 318-367)
8. `niche optimize` -- 16 options (lines 369-434)
9. `niche release` -- 14 options (lines 436-502)
10. `niche inspect` -- 3 options, 6 inspect kinds (lines 504-520)
11. `niche compare` -- 10 options (lines 522-576)
12. `niche quickstart` -- 1 option (lines 578-587)

**Special attention:** `prepare-run` has the most flags and is the hardest command to use correctly. Document the required field combinations for different modes (baseline, candidate, benchmark).

**Dependencies:** SP-02 (glossary for type references)

---

### SP-05: JSON Schema Reference

**Priority:** P1

**Output file:** `docs/niche/schema-reference.md`

**Source files:** All 15 files in `src/niche/schema/`

**For each schema, document:**

1. Schema name and purpose
2. All required fields with types, constraints (patterns, minimums, etc.)
3. All optional fields with types and defaults
4. Enum values with descriptions
5. A minimal valid JSON example
6. Cross-references to related schemas

**Schemas to document (grouped by domain):**

**Program:** NicheProgram, RuntimeStack, RuntimeComponent, AllowedSource, SuccessMetric, RightsAndDataPolicy

**Domain Pack:** DomainPack, Ontology, OntologyRelation, TaskFamily, TerminologyEntry, DomainConstraint, ToolContract, EvidenceSource, FailureMode, VerifierDefaults, BenchmarkSeedSpec

**Source Ingest:** LocalFileSourceDescriptor, RepoAssetSourceDescriptor, StructuredTextSourceDescriptor, BenchmarkSeedSourceDescriptor, NormalizedSourceRecord, SourceRightsMetadata, SourceProvenance

**Manifests:** BaselineManifest, CandidateManifest, SourceAccessManifest, SamplingConfig, RetryPolicy, TokenBudget, ContextBudget

**Benchmark:** EvalCase, EpisodeCase, BenchmarkSuiteMetadata, BenchmarkArmIdentifier, BenchmarkResultSummary, BenchmarkResultRecord, DeterminismRuntimePolicy, ContaminationAuditSummary, PairedDeltaSummary

**Trace:** RunTrace, SessionReference, PlannerExchange, ActionProposalRecord, ToolCallRecord, ObservationRecord, VerifierDecisionRecord, FinalOutputRecord, UsageSummary, CostSummary, TracePhaseTimestamps, EvidenceBundleRef

**Release:** Artifact, ArtifactRef, CandidateRecipe, CandidateRelease, CandidateStackManifest, PromotedReleaseMonitor, DriftThresholdSet, LineageRef, ArtifactRightsState, ArtifactGovernedDataStatus

**Readiness:** ReadinessReport, ReadinessDimensionScores, ReadinessHardBlocker, ReadinessWarning, ReadinessAction

**Governance:** GovernedDataStatus, GraderArtifact, ArbitrationArtifact, RewardArtifact, GraderCalibrationRecord

**Runtime Seed:** PreparedNicheRunSeed, PreparedNicheActionPolicyRuntime, PreparedVerifierPackConfigSnapshot

**Runtime Stack:** ActiveNicheStackRecord, ActiveNicheAgentDefaultBinding, ActiveNicheRouteOverlay, ActiveNicheRuntimeState

**Compile Record:** NicheCompilationRecord

**Lifecycle:** LifecycleEvent (all 9 variants with their payloads)

**String format patterns to document (from common.ts):**

- Identifier: `^[a-z0-9]+(?:[._-][a-z0-9]+)*$`
- Version: `^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$`
- Hash: `^[A-Fa-f0-9]{32,128}$`
- Timestamp: ISO 8601 UTC with optional milliseconds ending in Z

**Dependencies:** SP-02 (glossary)

---

### SP-06: Readiness System Documentation

**Priority:** P0

**Output file:** `docs/niche/readiness.md`

**Source files:**

- `src/niche/schema/readiness.ts` (status, dimension scores, hard blockers, warnings, actions)
- `src/niche/domain/readiness-gate.ts` (evaluateReadinessGate logic, buildReadinessRefusal)
- `src/niche/domain/readiness-thresholds.ts` (DEFAULT_READINESS_THRESHOLDS with all 9 values)
- `src/niche/domain/readiness-enforcement.ts` (resolveSpecializationReadiness, assertPreparedSeedReadiness)

**Sections:**

1. What is readiness -- the gate that prevents premature specialization
2. The 9 dimensions with their default thresholds:
   - `source_quality` (min 70)
   - `source_coverage` (min 30 -- 3+ distinct source kinds)
   - `contradiction_rate` (max 30)
   - `freshness` (min 60)
   - `rights_sufficiency` (min 80)
   - `task_observability` (min 50)
   - `benchmarkability` (min 50 -- 2+ benchmark seeds)
   - `measurable_success_criteria` (min 70)
   - `tool_availability` (min 80)
3. ReadinessStatus values: `ready`, `ready_with_warnings`, `not_ready` -- when each occurs
4. Hard blockers (5 codes from readiness.ts lines 7-13):
   - `insufficient_rights_to_use` -- storage and benchmarking rights missing
   - `benchmarkability_below_minimum_threshold` -- benchmarkability < 50
   - `contradiction_rate_exceeds_hard_threshold` -- contradiction rate > 30
   - `tool_availability_inadequate_for_workflow` -- tool availability < 80
   - `source_coverage_too_low_for_benchmarkable_domain_pack` -- source coverage < 30
5. Warnings (5 codes from readiness-gate.ts lines 134-177):
   - `low_source_quality`
   - `low_freshness`
   - `low_task_observability`
   - `weak_success_criteria`
   - `rights_need_review`
6. Recommended actions: what actions the system generates for each blocker/warning
7. How readiness enforcement gates other commands (prepare-run, run, benchmark)
8. How to fix each hard blocker with concrete operator steps
9. How to override thresholds

**Dependencies:** SP-01, SP-02

---

### SP-07: Benchmark Lab Documentation

**Priority:** P1

**Output file:** `docs/niche/benchmark.md`

**Source files:**

- `src/niche/schema/benchmark.ts` (all benchmark schemas)
- `src/niche/benchmark/invalidation.ts` (7 invalidation reason codes)
- `src/niche/benchmark/suite-registry.ts` (suite and arm registration)
- `src/niche/benchmark/statistics.ts` (confidence intervals)
- `src/niche/benchmark/arbitration.ts` (grader conflict resolution)
- `src/niche/benchmark/calibration.ts` (grader calibration)
- `src/niche/benchmark/live-benchmark.ts` (live benchmark execution)
- `src/niche/benchmark/record-bindings.ts` (manifest binding validation)

**Sections:**

1. Benchmark philosophy: same-model comparison, held-out evaluation
2. Benchmark modes: `offline_gold`, `offline_shadow`, `live_shadow`, `live_canary`
3. Benchmark splits: `train`, `dev`, `gold_eval`, `hidden_eval`, `shadow_only`, `quarantined` -- what each means and when to use it
4. Case kinds: atomic_case vs episode_case
5. Determinism policies: clock modes, cache modes, seed policies
6. EvalCase structure -- how to write an atomic eval case
7. EpisodeCase structure -- how to write an episode eval case
8. Grader types and how to register graders
9. Grader calibration: what `promotion_eligible` means, SME sample requirements
10. Arbitration modes: `rule_first`, `hierarchical_override`, `weighted_vote`, `sme_required_on_conflict`
11. Benchmark invalidation reasons (7 codes from invalidation.ts lines 12-20):
    - `manifest_incompatible` -- baseline/candidate manifests are not comparable
    - `contamination_detected` -- eval data leaked into training
    - `suite_changed_during_comparison` -- suite mutated mid-run
    - `benchmark_suite_hash_drift` -- hash mismatch
    - `grader_version_drift` -- grader changed
    - `fixture_version_drift` -- fixture version changed
    - `source_access_mismatch` -- source access changed
12. Contamination audit: what it checks and what "contaminated" means
13. PairedDeltaSummary: how mean_delta, confidence intervals work
14. Running `--live` benchmarks vs typed execution bundles
15. The `niche benchmark` CLI command in detail

**Dependencies:** SP-02, SP-04

---

### SP-08: Release Policy Engine Documentation

**Priority:** P1

**Output file:** `docs/niche/release.md`

**Source files:**

- `src/niche/release/policy-engine.ts` (evaluateReleasePolicy, DEFAULT_RELEASE_POLICY_THRESHOLDS, all blocking reason strings)
- `src/niche/release/promotion-controller.ts`
- `src/niche/release/invalidation-plan.ts`
- `src/niche/release/promoted-monitor.ts`
- `src/niche/release/rights-revocation.ts`
- `src/niche/release/monitor-service.ts`
- `src/niche/release/release-controller.ts`

**Sections:**

1. Release decision types: `promoted`, `rejected`, `shadow`, `canary`, `experimental`
2. Default thresholds (from policy-engine.ts lines 53-65):
   - `min_benchmark_case_count`: 100
   - `min_task_family_count`: 3
   - `min_mean_delta`: 0
   - `min_confidence_interval_low`: 0.001
   - `max_false_veto_rate`: 0.1
   - `max_override_rate`: 0.1
   - `max_hard_fail_rate`: 0.15
   - `max_latency_regression`: 0.15
   - `max_cost_regression`: 0.15
   - `require_shadow_results_for_promotion`: true
   - `allow_canary_on_marginal_win`: true
3. Blocking reasons catalog -- every reason the policy engine can block promotion (enumerated from policy-engine.ts lines 296-540):
   - Manifest comparison issues (6 codes from manifests.ts)
   - Missing benchmark evidence
   - Suite-manifest binding mismatches
   - Missing durable evidence bindings
   - Invalidated results
   - Contaminated results
   - Unresolved arbitration conflicts
   - Missing post-promotion monitor
   - Insufficient case count
   - Insufficient task family coverage
   - Negative mean delta
   - Low confidence bound
   - False-veto rate threshold exceeded
   - Override rate threshold exceeded
   - Hard-fail rate threshold exceeded
   - Latency regression threshold exceeded
   - Cost regression threshold exceeded
   - Task-family regressions
   - Uncalibrated graders (F-03 gate)
   - Single-cluster dominance (F-05 gate)
   - Missing required case kinds
4. Decision flow chart (text-based):
   - blocking reasons > 0 => `rejected`
   - no shadow + shadow required => `shadow`
   - shadow positive + confidence >= 0 => `promoted`
   - shadow marginal + canary allowed => `canary`
   - shadow required => `shadow`
   - else => `canary`
5. Post-promotion monitoring: drift thresholds, shadow recheck policy, rollback policy
6. Manifest comparison rules: what fields must match between baseline and candidate
7. Rights revocation: when and how artifacts get revoked
8. How to customize thresholds

**Dependencies:** SP-02, SP-07

---

### SP-09: Debugging Guide (Inspect and Compare)

**Priority:** P1

**Output file:** `docs/niche/debugging.md`

**Source files:**

- `src/commands/niche/inspect.ts` (6 inspect kinds, summary extraction logic)
- `src/commands/niche/compare.ts` (comparison workflow, governance validation)

**Sections:**

1. When to use `niche inspect` vs `niche compare`
2. `niche inspect` kinds (6, from inspect.ts lines 21-28):
   - `baseline_manifest` -- summary fields: manifest_id, niche_program_id, provider, model_id, provider_metadata_quality, benchmark_suite_id, source_access_manifest_id, tool_allowlist_count
   - `candidate_manifest` -- adds domain_pack_id, action_policy_id, retrieval_stack_id, verifier_pack_id, candidate_recipe
   - `source_access_manifest` -- tools, sources, policies
   - `candidate_recipe` -- recipe_type, teacher_runtimes, input counts
   - `artifact` -- artifact_type, version, producer, lineage, metrics, governed_data_status
   - `promoted_monitor` -- drift thresholds, cadence defaults, rollback policy
3. `niche compare` -- what it checks:
   - Manifest comparability (6 invariant checks)
   - Suite metadata validation
   - Benchmark evidence binding validation
   - Grader governance checks (calibration, arbitration, fixture metadata)
   - Monitor binding validation
   - Full release policy evaluation when all inputs are provided
4. Reading JSON output vs human-readable output (--json flag)
5. Common debugging workflows:
   - "Why was my release rejected?" (run compare with all inputs)
   - "Are my manifests comparable?" (run compare with just manifests)
   - "What is in this artifact?" (run inspect)
   - "Why is the benchmark invalidated?" (check invalidation_reasons in result)
   - "What governance issues exist?" (check governance_issues in compare output)

**Dependencies:** SP-02, SP-04

---

### SP-10: Troubleshooting Guide and Error Catalog

**Priority:** P0

**Output file:** `docs/niche/troubleshooting.md`

**Source:** All `throw new Error(...)` sites in `src/niche/` (approximately 60), plus validation error patterns

**Sections:**

1. **Common error patterns and fixes:**

   JSON validation errors:
   - `"Invalid <type>: <details>"` -- Schema validation failure. The details string contains field-level errors from TypeBox validation. Solution: check the referenced field against the schema reference.
   - `"Required JSON file not found: <label>"` -- A --file or --manifest flag points to a missing file
   - `"Invalid JSON in <label>"` -- The file exists but is not valid JSON
   - `"Failed to read <label>"` -- File permission or I/O error

   Readiness errors:
   - `"No stored readiness report exists for niche program <id>. Pass --readiness-report first."` -- Must compile first or provide explicit report
   - `"Readiness report <id> targets <program>, expected <expected>."` -- Wrong program binding
   - Each of the 5 hard blocker messages, with cause and fix:
     - "The declared rights state does not allow storage and benchmarking."
     - "Benchmarkability is below the minimum threshold."
     - "Contradiction rate exceeds the hard threshold."
     - "Tool availability is inadequate for the declared workflow."
     - "Source coverage is too low to support a benchmarkable domain pack."

   Benchmark errors:
   - `"Benchmark comparison was contaminated and cannot be trusted."` -- Data leaked into eval
   - `"Benchmark suite changed during the comparison run."` -- Suite mutated
   - Drift errors for suite hash, grader version, fixture version
   - `"Cannot select an action proposal without at least one candidate."` -- Empty tool candidate set

   Release policy errors:
   - All blocking reasons from SP-08 with specific remediation steps

   Runtime/seed errors:
   - `"Prepared Niche run seed <id> is missing readiness_report_id"` -- Seed was built without readiness
   - `"planner_version_id could not be resolved"` -- Missing version binding
   - `"Cannot persist prepared Niche run trace without <field>"` -- Missing required trace field

   Compile errors:
   - `"At least one source descriptor is required to compile a niche."` -- No --source flags
   - `"Source <id> is quarantined and cannot be compiled."` -- Quarantined source
   - `"Compiled domain packs require store-backed source artifacts."` -- Sources not persisted

   Optimizer errors:
   - `"Candidate recipes require at least one teacher runtime."` -- Missing teacher runtimes
   - `"Optimizer artifacts require lineage parents."` -- Missing lineage

2. **Diagnostic checklist:** Step-by-step process for diagnosing any failure
3. **How to read error messages:** Anatomy of a NicheClaw error string
4. **How to get verbose output:** --json flag, lifecycle event hooks

**Dependencies:** SP-02, SP-04

---

### SP-11: Lifecycle Events and Audit Trail Guide

**Priority:** P2

**Output file:** `docs/niche/lifecycle-events.md`

**Source files:**

- `src/niche/contracts/lifecycle.ts` (9 event types with typed payloads)
- `src/niche/runtime/lifecycle-events.ts` (emission mechanism)
- `src/plugins/types.ts` and `src/plugins/hooks.ts` (hook runner integration)

**Sections:**

1. What lifecycle events are: typed audit records emitted during NicheClaw operations
2. How events are emitted: via the `niche_lifecycle` plugin hook
3. Event envelope: event_id, event_type, occurred_at, run_id, niche_program_id, optional baseline/candidate manifest IDs
4. All 9 event types with payload schemas:
   - `planner_proposed` -- selected_manifest_id, planner_runtime_component_id, active_stack_id, resolution_source, resolved_release_mode
   - `action_proposed` -- action seam input (tool selection proposal)
   - `action_validated` -- proposal_id, guard_decision, ready_for_execution, repair_strategy_id
   - `verifier_decision` -- verifier seam output (outcome, findings)
   - `run_trace_persisted` -- trace_id, replayability_status, persisted_path
   - `benchmark_case_started` -- benchmark_arm_id, benchmark_case_ref
   - `benchmark_case_finished` -- benchmark_arm_id, benchmark_case_ref, invalidated, outcome_summary
   - `candidate_promoted` -- candidate_release_id, rollback_target
   - `candidate_rolled_back` -- rolled_back_stack_id, rollback_target, reason, overlays_cleared
5. How to subscribe: implementing the `niche_lifecycle` hook in a plugin
6. How to use events for:
   - Audit logging
   - External system integration
   - Debugging production issues
   - Building custom dashboards
7. Event ID generation: deterministic hash-based for idempotency

**Dependencies:** SP-01, SP-02

---

### SP-12: FAQ, Migration Guide, and Maintainer Runbooks

**Priority:** P2

**Output files:**

- `docs/niche/faq.md`
- `docs/niche/migration.md`
- `docs/niche/runbooks.md`

#### SP-12a: FAQ (`docs/niche/faq.md`)

Questions to answer (sourced from the most common confusion points in the codebase):

1. "Why is my readiness status `not_ready`?" -- Check the `hard_blockers` array; refer to SP-06 for fixes
2. "How do I fix contamination?" -- Quarantine the leaking data, re-partition splits, re-run benchmark
3. "What does `provider_metadata_quality: opaque_provider` mean?" -- Model version cannot be pinned exactly; reduces reproducibility confidence
4. "Why was my benchmark invalidated?" -- Check `invalidation_reasons` array; 7 possible codes documented in SP-07
5. "Why is the release decision `rejected`?" -- Check `blocking_reasons` in the release policy evaluation; each reason documented in SP-08
6. "Can I use different models for baseline and candidate?" -- No by default (model_id_mismatch); only if `allowCrossModelExperiment` is set
7. "What are the minimum requirements for promotion?" -- 100+ held-out cases, 3+ task families, positive mean delta, positive confidence interval, shadow results, configured monitor
8. "How do I roll back a promoted candidate?" -- The `candidate_rolled_back` lifecycle event is emitted; use the rollback_target to identify the previous stack
9. "What is a domain pack and do I write one by hand?" -- No, the compiler generates it from source descriptors; you write source descriptors
10. "What rights do I need to grant?" -- At minimum `rights_to_store` and `rights_to_benchmark` must be true
11. "How do benchmark splits prevent data leakage?" -- `gold_eval` and `hidden_eval` splits are never used for training
12. "What is the difference between atomic_case and episode_case?" -- Atomic is a single input/output; episode is multi-turn with initial_state, step_constraints, termination_conditions
13. "What is arbitration?" -- When multiple graders disagree, the arbitration policy resolves conflicts
14. "Why does the single-cluster dominance check reject my candidate?" -- One task family contributes > 70% of the positive delta
15. "What do I need to provide for `prepare-run`?" -- The 13 required flags documented in SP-04

#### SP-12b: Migration Guide (`docs/niche/migration.md`)

1. Schema versioning: all schemas use TypeBox with `additionalProperties: false` -- adding new optional fields is backward-compatible
2. Store directory layout stability: the 14 store directories under `~/.openclaw/niche/` are considered stable
3. How to detect breaking changes: schemas validated with `validateJsonSchemaValue` will reject files with unknown fields
4. Manual store migration: when to re-compile, when to re-benchmark
5. Version pinning: identifier, version, and hash patterns from common.ts

#### SP-12c: Maintainer Runbooks (`docs/niche/runbooks.md`)

1. "Operator reports `not_ready` but believes their data is sufficient" -- Check each dimension score in the readiness report; verify source counts against thresholds; check if contradiction_rate is inverted (higher = worse)
2. "Operator reports release is `rejected` with no clear reason" -- Run `niche compare` with all inputs to see the full blocking_reasons list
3. "Benchmark results show `invalidated: true`" -- Check invalidation_reasons, verify suite hash consistency, check for grader version drift
4. "Operator sees `Invalid <schema>` error on a file they believe is valid" -- Common issues: missing required fields, identifier pattern mismatch (must be lowercase alphanumeric with dots/hyphens/underscores), timestamp must end in Z, hash must be 32-128 hex characters
5. "Active stack state lock failure" -- `"Failed to acquire active-stack-state lock after retries"` -- concurrent access to the active stack state file
6. "How to inspect the store state" -- Directory layout, file naming conventions, how to read individual JSON files

---

### SP-13: Navigation Registration

**Priority:** P0 (must be done or docs are not discoverable)

**File to modify:** `docs/docs.json`

**Change:** Add a new navigation group for NicheClaw within the existing navigation structure:

```json
{
  "group": "NicheClaw",
  "pages": [
    "niche/overview",
    "niche/glossary",
    "niche/getting-started",
    "niche/cli-reference",
    "niche/schema-reference",
    "niche/readiness",
    "niche/benchmark",
    "niche/release",
    "niche/debugging",
    "niche/troubleshooting",
    "niche/lifecycle-events",
    "niche/faq",
    "niche/migration",
    "niche/runbooks"
  ]
}
```

**Dependencies:** All SP-01 through SP-12 files must exist first

---

### Implementation Sequence

**Phase 1 (P0 -- Score 20 to 60):** SP-01, SP-02, SP-03, SP-04, SP-06, SP-10
These provide the foundational architecture doc, glossary, getting started, CLI reference, readiness docs, and troubleshooting. This is the minimum viable documentation set.

**Phase 2 (P1 -- Score 60 to 85):** SP-05, SP-07, SP-08, SP-09
These add schema reference, benchmark documentation, release policy documentation, and the debugging guide.

**Phase 3 (P2 -- Score 85 to 100):** SP-11, SP-12a, SP-12b, SP-12c, SP-13
These add lifecycle events, FAQ, migration guide, runbooks, and navigation registration.

### Critical Files for Implementation

- `src/cli/program/register.niche.ts` - "Complete CLI registration with all 12 commands and every flag -- primary source for SP-04"
- `src/niche/schema/index.ts` - "Master export barrel for all 15 schema modules with approximately 80 typed objects -- primary source for SP-02 and SP-05"
- `src/niche/release/policy-engine.ts` - "Release policy evaluation with all threshold defaults and every blocking reason string -- primary source for SP-08 and SP-10"
- `src/niche/domain/readiness-gate.ts` - "Readiness gate logic with all hard blockers, warnings, and recommended actions -- primary source for SP-06"
- `src/niche/benchmark/invalidation.ts` - "All 7 benchmark invalidation reason codes and collection logic -- primary source for SP-07"
