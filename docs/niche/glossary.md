---
summary: "Comprehensive glossary of NicheClaw terms, types, and enum values with definitions sourced from the schema layer."
read_when:
  - You encounter an unfamiliar NicheClaw term
  - You need to know the valid values for an enum type
  - You are reviewing NicheClaw schemas or JSON artifacts
title: "Glossary"
---

# Glossary

Alphabetical reference of every NicheClaw type, enum, and concept. Source schemas live in `src/niche/schema/`. Each entry notes the source type, valid values (for enums), and a brief definition.

---

### ActionCandidateRankingRecord

**Source:** `src/niche/schema/trace.ts` (type)

A record of a single candidate tool that was evaluated during action proposal. Contains the tool name, its score, the reason for ranking, and any missing required arguments.

---

### ActionProposalRecord

**Source:** `src/niche/schema/trace.ts` (type)

A record of a proposed action within a run trace. Captures which tool was selected, the guard decision, candidate rankings, and optional repair strategy references.

---

### ActiveNicheRuntimeState

**Source:** `src/niche/schema/runtime-stack.ts` (type)

The current active runtime state for NicheClaw, recording which stack record and route overlays are in effect for the running gateway.

---

### ActiveNicheStackRecord

**Source:** `src/niche/schema/runtime-stack.ts` (type)

A persisted record of an activated Niche Stack, including the baseline and candidate manifest references and the agent default binding.

---

### AllowedSource

**Source:** `src/niche/schema/program.ts` (type)

A data source permitted for use by a Niche Program. Each entry has a source identifier, source kind, and optional description and access pattern.

---

### ArbitrationArtifact

**Source:** `src/niche/schema/governance.ts` (type)

Configuration for how grader disagreements are resolved during benchmarking. Specifies the conflict resolution mode, SME sampling rate, and which conflict types block promotion.

---

### ArbitrationMode

**Source:** `src/niche/schema/governance.ts` (enum)

**Valid values:** `rule_first`, `hierarchical_override`, `weighted_vote`, `sme_required_on_conflict`

The strategy used to resolve disagreements between multiple graders on a benchmark case. `rule_first` applies deterministic rules before escalating; `weighted_vote` aggregates grader scores; `sme_required_on_conflict` requires human review when graders disagree.

---

### Artifact

**Source:** `src/niche/schema/release.ts` (type)

A versioned, governed output of the NicheClaw pipeline. Each artifact has a type, version, producer, lineage chain, dataset and trace references, metrics, and optional governance status.

---

### ArtifactGovernedDataStatus

**Source:** `src/niche/schema/release.ts` (type)

Governance metadata attached to an artifact, including data zone, retention policy, redaction status, PII status, provenance status, and quarantine state.

---

### ArtifactRef

**Source:** `src/niche/schema/release.ts` (type)

A compact reference to a specific version of an artifact. Contains the artifact ID, type, version, content hash, rights state, and creation timestamp.

---

### ArtifactRightsState

**Source:** `src/niche/schema/release.ts` (type)

A set of boolean flags declaring what operations are permitted on an artifact: storage, training, benchmarking, derivation, distillation, and synthetic data generation.

---

### ArtifactTeacherRolloutAuthority

**Source:** `src/niche/schema/release.ts` (type)

Records whether an artifact has been cleared or blocked for teacher rollout. A blocked artifact includes a reason string.

---

### ArtifactType

**Source:** `src/niche/schema/release.ts` (enum)

**Valid values:** `domain_pack`, `run_trace`, `dataset`, `eval_case`, `episode_case`, `grader`, `reward`, `prompt_asset`, `retrieval_stack`, `verifier_pack`, `action_policy`, `candidate_recipe`, `student_model`, `release_bundle`

The kind of artifact stored in the artifact registry. Each type has its own subdirectory under `artifacts/`.

---

### BaselineManifest

**Source:** `src/niche/schema/manifests.ts` (type)

A frozen snapshot of the unspecialized (general-purpose) agent configuration. Serves as the control arm in benchmark comparisons. Pins the provider, model, sampling config, tool allowlist, grader set, and execution invariants.

---

### BenchmarkArmIdentifier

**Source:** `src/niche/schema/benchmark.ts` (type)

Identifies one arm of a benchmark comparison. Contains the arm ID, suite ID, manifest ID, arm kind (baseline or candidate), and the benchmark mode.

---

### BenchmarkArmKind

**Source:** `src/niche/schema/benchmark.ts` (enum)

**Valid values:** `baseline`, `candidate`

Which side of a paired comparison a benchmark arm represents.

---

### BenchmarkCaseKind

**Source:** `src/niche/schema/benchmark.ts` (enum)

**Valid values:** `atomic_case`, `episode_case`

The two kinds of benchmark case. An `atomic_case` is a single-turn evaluation with input/output grading. An `episode_case` is a multi-turn evaluation with step constraints and termination conditions.

---

### BenchmarkGraderSpec

**Source:** `src/niche/schema/benchmark.ts` (type)

Specifies which graders evaluate a benchmark case and which metric is considered primary.

---

### BenchmarkMode

**Source:** `src/niche/schema/benchmark.ts` (enum)

**Valid values:** `offline_gold`, `offline_shadow`, `live_shadow`, `live_canary`

How benchmark cases are executed. `offline_gold` runs against a fixed gold-standard dataset. `offline_shadow` replays recorded traffic. `live_shadow` runs in parallel with production but discards output. `live_canary` routes a fraction of live traffic to the candidate.

---

### BenchmarkResultRecord

**Source:** `src/niche/schema/benchmark.ts` (type)

A durable record of a completed benchmark run, including the summary, manifest bindings, suite and fixture hashes, trace references, replay bundle references, and arbitration outcome.

---

### BenchmarkResultSummary

**Source:** `src/niche/schema/benchmark.ts` (type)

Aggregate statistics from a benchmark comparison: the paired delta summary, per-task-family summaries, contamination audit, invalidation status, and primary metric.

---

### BenchmarkSeedSpec

**Source:** `src/niche/schema/domain-pack.ts` (type)

A seed specification within a Domain Pack that provides a starting point for generating benchmark cases. Contains a prompt, task family, source references, and pass/fail conditions.

---

### BenchmarkSplit

**Source:** `src/niche/schema/benchmark.ts` (enum)

**Valid values:** `train`, `dev`, `gold_eval`, `hidden_eval`, `shadow_only`, `quarantined`

The data partition a benchmark case belongs to. `gold_eval` is the primary evaluation set. `hidden_eval` is withheld until release decisions. `quarantined` cases have governance issues and are excluded.

---

### BenchmarkSuiteMetadata

**Source:** `src/niche/schema/benchmark.ts` (type)

Metadata header for a benchmark suite, including the suite ID, case kind, mode, split, version, hash, fixture version, determinism policy, and task families.

---

### CacheMode

**Source:** `src/niche/schema/benchmark.ts` (enum)

**Valid values:** `cold`, `warm`, `fixed_snapshot`

Controls caching behavior during deterministic benchmark execution. `cold` starts with empty caches, `warm` uses prewarmed caches, and `fixed_snapshot` restores a specific cache state.

---

### CandidateManifest

**Source:** `src/niche/schema/manifests.ts` (type)

A frozen snapshot of the specialized agent configuration. References the baseline it was derived from, plus the domain pack, action policy, retrieval stack, verifier pack, and candidate recipe.

---

### CandidateRecipe

**Source:** `src/niche/schema/release.ts` (type)

A complete record of how a candidate was produced, including teacher runtimes, input datasets, synthesis prompts, distillation steps, verifier training steps, hyperparameters, grader references, and evaluation/promotion inputs.

---

### CandidateRecipeStep

**Source:** `src/niche/schema/release.ts` (type)

A single step within a CandidateRecipe, with a step ID, summary description, and output artifact references.

---

### CandidateRelease

**Source:** `src/niche/schema/release.ts` (type)

A release record for a candidate that has been through the promotion pipeline. Contains the stack manifest, benchmark results, shadow results, the decision, decision reason, approvers, and rollback target.

---

### CandidateReleaseDecision

**Source:** `src/niche/schema/release.ts` (enum)

**Valid values:** `promoted`, `rejected`, `shadow`, `canary`, `experimental`

The outcome of the release evaluation. `promoted` means the candidate replaces the baseline in production. `rejected` means the candidate failed to meet the bar. `shadow` and `canary` are intermediate states for incremental rollout. `experimental` allows deployment without full promotion guarantees.

---

### CandidateStackManifest

**Source:** `src/niche/schema/release.ts` (type)

A manifest binding a candidate to its component artifacts. Lists the baseline manifest (if any), candidate manifest, and all component artifact references.

---

### ClockMode

**Source:** `src/niche/schema/benchmark.ts` (enum)

**Valid values:** `time_frozen`, `time_simulated`, `time_live`

Controls time behavior during benchmark execution. `time_frozen` holds the clock constant, `time_simulated` advances time deterministically, and `time_live` uses real wall-clock time.

---

### CompiledDomainConfig

**Source:** `src/niche/schema/compiled-domain-config.ts` (type)

The output of domain compilation: a structured configuration containing planner directives, tool directives, exemplar directives, observation directives, retrieval directives, constraint enforcement directives, failure indicators, and signal patterns.

---

### ContextBudget

**Source:** `src/niche/schema/manifests.ts` (type)

Token and item limits for context assembly. Controls max context tokens, max retrieval items, and max exemplars.

---

### ContaminationAuditSummary

**Source:** `src/niche/schema/benchmark.ts` (type)

Summary of whether data contamination was detected during a benchmark run. Reports the number of audited cases and optional notes.

---

### CostSummary

**Source:** `src/niche/schema/trace.ts` (type)

Cost information for a run trace, including the currency and total cost.

---

### DataZone

**Source:** `src/niche/schema/governance.ts` (enum)

**Valid values:** `train`, `dev`, `gold_eval`, `hidden_eval`, `shadow_only`, `quarantined`

The governance zone a piece of data belongs to. Determines how the data can be used across the pipeline. Data in `gold_eval` or `hidden_eval` must not leak into training. `quarantined` data has unresolved governance issues.

---

### DerivedRightsStatus

**Source:** `src/niche/schema/governance.ts` (type)

Records whether an artifact's rights were inherited from its lineage chain or overridden by explicit authorization.

---

### DeterminismRuntimePolicy

**Source:** `src/niche/schema/benchmark.ts` (type)

Controls all determinism-related settings for benchmark execution: source mode, cache mode, clock mode, network mode, seed policy, and environment snapshot policy.

---

### DomainConstraint

**Source:** `src/niche/schema/domain-pack.ts` (type)

A rule that constrains agent behavior within a domain. Each constraint has a category, rule text, optional rationale, and a severity level (low/moderate/high).

---

### DomainPack

**Source:** `src/niche/schema/domain-pack.ts` (type)

The compiled knowledge artifact for a niche. Contains an ontology, task taxonomy, terminology map, domain constraints, tool contracts, evidence source registry, failure taxonomy, verifier defaults, and benchmark seed specs. Produced by the compiler from source descriptors.

---

### DriftThresholdSet

**Source:** `src/niche/schema/release.ts` (type)

A set of numeric thresholds that define when post-promotion drift is significant enough to trigger alerts or rollback. Covers task success, task family, verifier false veto, grader disagreement, source freshness, latency/cost, and hard fail drift.

---

### EpisodeCase

**Source:** `src/niche/schema/benchmark.ts` (type)

A multi-turn benchmark case with an initial state, step constraints, termination conditions, allowed tools and sources, a grader spec, and difficulty rating.

---

### EvalCase

**Source:** `src/niche/schema/benchmark.ts` (type)

A single-turn benchmark case with input, allowed tools and sources, a grader spec, pass/fail conditions, and difficulty rating.

---

### EvidenceBundleRef

**Source:** `src/niche/schema/trace.ts` (type)

A reference to evidence retrieved during a run, including source references, the retrieval query, reranker output, and the evidence that was actually delivered to the agent.

---

### EvidenceSource

**Source:** `src/niche/schema/domain-pack.ts` (type)

A registered source of evidence within a Domain Pack. Records the source kind, title, access pattern, freshness expectation, and trust notes.

---

### FailureMode

**Source:** `src/niche/schema/domain-pack.ts` (type)

A catalogued failure mode for the domain, with a label, description, severity, and detection hints used by the verifier.

---

### FinalOutputRecord

**Source:** `src/niche/schema/trace.ts` (type)

The final output of a run, recording the output type, content summary, and whether it was emitted to the user.

---

### GovernedDataStatus

**Source:** `src/niche/schema/governance.ts` (type)

Full governance status for a data record, including data zone, retention policy, redaction status, PII status, provenance status, and quarantine state with optional reason.

---

### GraderArtifact

**Source:** `src/niche/schema/governance.ts` (type)

A registered grader used to evaluate benchmark cases. Records the grader type, version, owner, calibration suite, prompt/rule hash, decision schema, and expected failure modes.

---

### GraderCalibrationRecord

**Source:** `src/niche/schema/governance.ts` (type)

Calibration metrics for a grader within a grader set: precision, recall, agreement rate, SME sample counts, and whether the grader is promotion-eligible.

---

### GraderType

**Source:** `src/niche/schema/governance.ts` (enum)

**Valid values:** `deterministic_rule`, `schema_validator`, `trace_grader`, `model_based`, `sme_review`, `pairwise_preference`

The implementation strategy of a grader. `deterministic_rule` applies fixed rules. `schema_validator` checks output structure. `trace_grader` evaluates the full trace. `model_based` uses an LLM. `sme_review` requires human expert review. `pairwise_preference` compares two outputs side by side.

---

### Hash

**Source:** `src/niche/schema/common.ts` (type)

A hex string of 32-128 characters matching the pattern `^[A-Fa-f0-9]{32,128}$`. Used for content hashes, suite hashes, and case membership hashes.

---

### Identifier

**Source:** `src/niche/schema/common.ts` (type)

A lowercase string matching `^[a-z0-9]+(?:[._-][a-z0-9]+)*$`. Used as the primary key type for all NicheClaw entities (programs, packs, manifests, artifacts, etc.).

---

### IdLabelDescription

**Source:** `src/niche/schema/common.ts` (type)

A reusable triple of identifier, human-readable label, and optional description. Used for ontology concepts and similar catalog entries.

---

### LineageRef

**Source:** `src/niche/schema/release.ts` (type)

A reference to a parent artifact in the derivation chain, recording the parent artifact ID, relationship type, derivation step, and notes.

---

### ManifestComparisonIssue

**Source:** `src/niche/schema/manifests.ts` (type)

A structured issue found when comparing a baseline manifest to a candidate manifest. Contains an issue code and a human-readable message.

---

### ManifestComparisonIssueCode

**Source:** `src/niche/schema/manifests.ts` (enum)

**Valid values:** `benchmark_suite_mismatch`, `provider_mismatch`, `model_id_mismatch`, `planner_runtime_mismatch`, `source_access_mismatch`, `execution_invariant_mismatch`

The category of comparison issue. For a valid paired comparison, baseline and candidate must agree on suite, provider, model, planner runtime, source access, and all execution invariants.

---

### ManifestProviderMetadataQuality

**Source:** `src/niche/schema/manifests.ts` (enum)

**Valid values:** `exact_snapshot`, `release_label_only`, `proxy_resolved`, `opaque_provider`

How precisely the provider's model version is known. `exact_snapshot` means a pinned model checkpoint. `release_label_only` means only a version label (e.g., "gpt-4o"). `proxy_resolved` means the version was resolved through a routing proxy. `opaque_provider` means the provider does not expose version information.

---

### MetricObjective

**Source:** `src/niche/schema/common.ts` (enum)

**Valid values:** `maximize`, `minimize`, `target`

The optimization direction for a success metric. `maximize` means higher is better, `minimize` means lower is better, and `target` means the goal is to hit a specific value.

---

### MonitorPolicy

**Source:** `src/niche/schema/release.ts` (type)

A named policy reference used in promoted release monitors. Contains a policy ID and a human-readable summary.

---

### NicheCompilationRecord

**Source:** `src/niche/schema/compile-record.ts` (type)

A record of a domain compilation run, capturing inputs, outputs, and metadata about the compilation process.

---

### NicheProgram

**Source:** `src/niche/schema/program.ts` (type)

The top-level definition of a specialization. Declares the objective, risk class, runtime stack, allowed tools, allowed sources, success metrics, rights and data policy, and optional access policy.

---

### NicheStackReleaseMode

**Source:** `src/niche/schema/activation.ts` (enum)

**Valid values:** `shadow`, `canary`, `live`, `rolled_back`

The deployment mode of an activated Niche Stack. `shadow` runs in parallel without affecting output. `canary` routes partial traffic. `live` is full production. `rolled_back` means the stack was reverted.

---

### NicheStackResolutionSource

**Source:** `src/niche/schema/activation.ts` (enum)

**Valid values:** `session_override`, `route_override`, `agent_default`

How the active Niche Stack was resolved for a given run. `session_override` means the session explicitly selected a stack. `route_override` means the routing configuration selected it. `agent_default` means the agent-level default was used.

---

### NormalizedSourceRecord

**Source:** `src/niche/schema/source-ingest.ts` (type)

A source record after ingestion and normalization. Contains the source ID, kind, input kind, title, normalized content, rights metadata, provenance, governed data status, and optional benchmark seed.

---

### ObservationRecord

**Source:** `src/niche/schema/trace.ts` (type)

An observation captured during a run, with a source identifier and summary. Observations come from tool outputs, retrieval results, or environment signals.

---

### Ontology

**Source:** `src/niche/schema/domain-pack.ts` (type)

The concept graph for a domain. Contains an array of concepts (each an IdLabelDescription) and an array of relations between them.

---

### OntologyRelation

**Source:** `src/niche/schema/domain-pack.ts` (type)

A typed edge in the domain ontology, connecting a source concept to a target concept with a relation type and optional description.

---

### PairedDeltaSummary

**Source:** `src/niche/schema/benchmark.ts` (type)

Statistical summary of the paired difference between baseline and candidate performance: mean delta, median delta, 10th/90th percentile deltas, and confidence interval bounds.

---

### PlannerExchange

**Source:** `src/niche/schema/trace.ts` (type)

A recorded input or output stage of the planner within a run trace, with a stage ID and summary.

---

### PreparedNicheRunSeed

**Source:** `src/niche/schema/runtime-seed.ts` (type)

A fully resolved seed for executing a NicheClaw run. Contains the manifest kind, action policy runtime, environment snapshot, and verifier configuration snapshots.

---

### PromotedReleaseMonitor

**Source:** `src/niche/schema/release.ts` (type)

Configuration for ongoing monitoring of a promoted release. Defines drift thresholds for task success, verifier, and grader metrics, plus shadow recheck, freshness decay, and rollback policies.

---

### QuarantineReason

**Source:** `src/niche/schema/governance.ts` (enum)

**Valid values:** `unclear_rights`, `redaction_failed`, `contradictory_or_corrupted_source`, `missing_provenance`, `overlap_with_eval`

Why a data record was quarantined. `overlap_with_eval` means training data overlapped with evaluation data, which would contaminate benchmarks.

---

### ReadinessAction

**Source:** `src/niche/schema/readiness.ts` (type)

A recommended action to improve readiness, with an ID, summary, and priority level.

---

### ReadinessActionPriority

**Source:** `src/niche/schema/readiness.ts` (enum)

**Valid values:** `required`, `recommended`, `optional`

Priority level for a readiness improvement action. `required` actions must be completed before proceeding.

---

### ReadinessDimensionScore

**Source:** `src/niche/schema/readiness.ts` (type)

A score (0-100) for a single readiness dimension, with an optional rationale.

---

### ReadinessDimensionScores

**Source:** `src/niche/schema/readiness.ts` (type)

The full set of readiness dimension scores: source quality, source coverage, contradiction rate, freshness, rights sufficiency, task observability, benchmarkability, measurable success criteria, and tool availability.

---

### ReadinessHardBlocker

**Source:** `src/niche/schema/readiness.ts` (type)

A hard blocker preventing specialization from proceeding, with a blocker code and message.

---

### ReadinessHardBlockerCode

**Source:** `src/niche/schema/readiness.ts` (enum)

**Valid values:** `insufficient_rights_to_use`, `benchmarkability_below_minimum_threshold`, `contradiction_rate_exceeds_hard_threshold`, `tool_availability_inadequate_for_workflow`, `source_coverage_too_low_for_benchmarkable_domain_pack`

The specific reason readiness is hard-blocked. Each code maps to a specific dimension that fell below the minimum acceptable threshold.

---

### ReadinessReport

**Source:** `src/niche/schema/readiness.ts` (type)

The complete readiness assessment for a Niche Program. Contains the overall status, per-dimension scores, hard blockers, warnings, and recommended next actions.

---

### ReadinessStatus

**Source:** `src/niche/schema/readiness.ts` (enum)

**Valid values:** `ready`, `ready_with_warnings`, `not_ready`

The overall readiness status. `ready` means all dimensions pass. `ready_with_warnings` means all hard thresholds pass but some dimensions have warnings. `not_ready` means at least one hard blocker exists.

---

### ReadinessWarning

**Source:** `src/niche/schema/readiness.ts` (type)

A non-blocking warning in a readiness report, with a warning code and message.

---

### ReplayabilityStatus

**Source:** `src/niche/schema/trace.ts` (enum)

**Valid values:** `replayable`, `partially_replayable`, `non_replayable`

Whether a run trace can be deterministically replayed. `replayable` means all inputs are captured. `partially_replayable` means some external calls were not captured. `non_replayable` means the trace cannot be replayed.

---

### RetryPolicy

**Source:** `src/niche/schema/manifests.ts` (type)

Retry configuration for a manifest, including max attempts, backoff policy, and which errors trigger retries.

---

### RewardArtifact

**Source:** `src/niche/schema/governance.ts` (type)

A reward model artifact used in optimization. Records the reward type, version, training inputs, calibration suite, lineage references, and owner.

---

### RightsAndDataPolicy

**Source:** `src/niche/schema/program.ts` (type)

The governance policy declaration for a Niche Program. Covers storage, training, benchmarking, retention, redaction, PII, live trace reuse, and whether operator review is required.

---

### RiskClass

**Source:** `src/niche/schema/common.ts` (enum)

**Valid values:** `low`, `moderate`, `high`

The risk classification of a Niche Program. Higher risk classes require stricter governance controls, more comprehensive benchmarking, and additional approval steps.

---

### RunTrace

**Source:** `src/niche/schema/trace.ts` (type)

A comprehensive record of a single NicheClaw run. Captures planner inputs/outputs, action proposals, tool calls, observations, verifier decisions, terminal status, final output, usage, latency, cost, artifact references, and benchmark bindings.

---

### RunTraceMode

**Source:** `src/niche/schema/trace.ts` (enum)

**Valid values:** `baseline`, `candidate`, `shadow`, `benchmark`, `live`

The mode in which a run was executed. `baseline` and `candidate` are the two arms of a comparison. `shadow` runs in parallel without emitting output. `benchmark` is for offline evaluation. `live` is production execution.

---

### RuntimeComponent

**Source:** `src/niche/schema/program.ts` (type)

A single component in the runtime stack, identified by component ID, provider, model ID, optional API mode, and notes.

---

### RuntimeStack

**Source:** `src/niche/schema/program.ts` (type)

The full runtime configuration for a Niche Program: the planner runtime component, optional retrieval and verifier components, and the allowed specialization lanes.

---

### SamplingConfig

**Source:** `src/niche/schema/manifests.ts` (type)

A key-value map of sampling parameters (temperature, top_p, etc.) that must match between baseline and candidate for a valid comparison.

---

### SessionReference

**Source:** `src/niche/schema/trace.ts` (type)

A reference to the session in which a run occurred, with the session ID, optional transcript path, and optional route.

---

### SourceAccessManifest

**Source:** `src/niche/schema/manifests.ts` (type)

Declares what tools, retrieval indices, live sources, and disallowed sources a manifest permits, plus sandbox, network, and approval policies.

---

### SourceInputKind

**Source:** `src/niche/schema/source-ingest.ts` (enum)

**Valid values:** `local_file`, `repo_asset`, `structured_text`, `benchmark_seed`

The input format of a source descriptor. Determines how the source is read and normalized during compilation.

---

### SourceKind

**Source:** `src/niche/schema/common.ts` (enum)

**Valid values:** `documents`, `websites`, `repos`, `logs`, `datasets`, `tool_schemas`, `past_task_traces`, `human_examples`, `domain_constraints`, `live_sources`

The semantic category of a data source. Used to classify sources in the Niche Program and Domain Pack.

---

### SourceProvenance

**Source:** `src/niche/schema/source-ingest.ts` (type)

Provenance metadata for a normalized source record: the source URI, ingestion timestamp, and optional repo root and relative path.

---

### SourceRightsMetadata

**Source:** `src/niche/schema/source-ingest.ts` (type)

Rights and governance metadata for a source, including boolean flags for storage/training/benchmark/derivation/distillation/synthetic generation rights, plus retention, redaction, PII, provenance, and data zone information.

---

### SpecializationLane

**Source:** `src/niche/schema/common.ts` (enum)

**Valid values:** `system_specialization`, `distillation`, `provider_native_customization`, `prompt_policy_assets`

The mechanism used for specialization. `system_specialization` modifies the system prompt and retrieval stack. `distillation` trains a smaller model from a teacher. `provider_native_customization` uses provider fine-tuning APIs. `prompt_policy_assets` uses prompt templates and policy documents.

---

### SuccessMetric

**Source:** `src/niche/schema/program.ts` (type)

A metric defined in the Niche Program for measuring specialization success. Includes a metric ID, label, optimization objective, target description, and measurement method.

---

### SuppressedOutputRecord

**Source:** `src/niche/schema/trace.ts` (type)

Records output that was generated but not emitted to the user, with a content summary and optional suppression reason.

---

### TaskFamily

**Source:** `src/niche/schema/domain-pack.ts` (type)

A category of tasks within a domain. Each task family has an ID, label, optional description, a benchmarkable flag, and required capabilities.

---

### TerminalRunStatus

**Source:** `src/niche/schema/trace.ts` (enum)

**Valid values:** `delivered`, `withheld`, `no_output`, `failed`, `aborted`

The final status of a run. `delivered` means output was sent to the user. `withheld` means the verifier suppressed the output. `no_output` means no output was produced. `failed` means an error occurred. `aborted` means the run was cancelled.

---

### TerminologyEntry

**Source:** `src/niche/schema/domain-pack.ts` (type)

A domain term with its canonical form, synonyms, and optional definition. Part of the terminology map in a Domain Pack.

---

### Timestamp

**Source:** `src/niche/schema/common.ts` (type)

An ISO 8601 UTC timestamp string matching `^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$`. Used for all temporal fields in NicheClaw schemas.

---

### TokenBudget

**Source:** `src/niche/schema/manifests.ts` (type)

Token limits for a manifest: max input tokens, max output tokens, and max total tokens.

---

### ToolCallRecord

**Source:** `src/niche/schema/trace.ts` (type)

A record of a single tool call within a run trace, including the tool name, status, and optional summaries of arguments, output, and errors.

---

### ToolCallStatus

**Source:** `src/niche/schema/trace.ts` (enum)

**Valid values:** `started`, `completed`, `failed`

The execution status of a tool call.

---

### ToolContract

**Source:** `src/niche/schema/domain-pack.ts` (type)

A domain-specific contract for a tool, declaring its intent, required and optional arguments, and expected failure modes.

---

### TracePhaseTimestamps

**Source:** `src/niche/schema/trace.ts` (type)

Precise timestamps for each phase of a run: planner start/finish, action proposal start/finish, tool execution start/finish, verifier start/finish, final emission, and trace persistence.

---

### UsageSummary

**Source:** `src/niche/schema/trace.ts` (type)

Token usage statistics for a run: input tokens, output tokens, and total tokens.

---

### VerifierDecisionRecord

**Source:** `src/niche/schema/trace.ts` (type)

A verifier's decision on a proposed action, with a decision ID, outcome, rationale, and list of findings.

---

### VerifierDefaults

**Source:** `src/niche/schema/domain-pack.ts` (type)

Default verifier configuration in a Domain Pack: required checks, blocking failure IDs, output requirements, and escalation policy.

---

### VerifierFindingRecord

**Source:** `src/niche/schema/trace.ts` (type)

A single finding from the verifier, with a finding ID, severity, and message.

---

### VerifierOutcome

**Source:** `src/niche/schema/trace.ts` (enum)

**Valid values:** `approved`, `repair_requested`, `escalated`, `vetoed`

The verifier's decision on a proposed action. `approved` allows execution. `repair_requested` asks for a corrected proposal. `escalated` defers to a human or higher-authority verifier. `vetoed` blocks the action entirely.

---

### Version

**Source:** `src/niche/schema/common.ts` (type)

A version string matching `^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$`. Used for artifact versions, suite versions, and component versions.
