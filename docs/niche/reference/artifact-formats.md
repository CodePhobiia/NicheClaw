---
summary: "Complete field-level reference for every NicheClaw artifact type, including schemas, field tables, enums, and JSON examples."
read_when:
  - You need to know the exact fields and types for a NicheClaw artifact
  - You are building or validating NicheClaw JSON files
  - You need to understand relationships between NicheClaw schema types
title: "Artifact Formats Reference"
---

# Artifact Formats Reference

This document defines every NicheClaw artifact type at the field level. All schemas are defined in `src/niche/schema/` using TypeBox (`@sinclair/typebox`). Validation is strict: `additionalProperties: false` on every object schema.

## Table of Contents

- [Common Field Types](#common-field-types)
- [Enums](#enums)
- [NicheProgram](#nicheprogram)
- [DomainPack](#domainpack)
- [ReadinessReport](#readinessreport)
- [Source Descriptors](#source-descriptors)
- [BaselineManifest and CandidateManifest](#baselinemanifest-and-candidatemanifest)
- [NicheCompilationRecord](#nichecompilationrecord)
- [EvalCase](#evalcase)
- [CandidateRelease](#candidaterelease)

---

## Common Field Types

Defined in `src/niche/schema/common.ts`.

| Type               | Pattern / Constraint                                 | Description                                              |
| ------------------ | ---------------------------------------------------- | -------------------------------------------------------- |
| `IdentifierString` | `^[a-z0-9]+(?:[._-][a-z0-9]+)*$`                     | Lowercase kebab/dot/underscore identifier. Min length 1. |
| `VersionString`    | `^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$`               | Version string allowing mixed case. Min length 1.        |
| `HashString`       | `^[A-Fa-f0-9]{32,128}$`                              | Hex content hash, 32 to 128 characters.                  |
| `TimestampString`  | `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$` | ISO 8601 UTC timestamp. Min length 20.                   |
| `NonEmptyString`   | `minLength: 1`                                       | Any non-empty string.                                    |

---

## Enums

### RiskClass

Values: `low`, `moderate`, `high`

### SourceKind

The 10 recognized source kinds:

`documents`, `websites`, `repos`, `logs`, `datasets`, `tool_schemas`, `past_task_traces`, `human_examples`, `domain_constraints`, `live_sources`

### MetricObjective

Values: `maximize`, `minimize`, `target`

### SpecializationLane

Values: `system_specialization`, `distillation`, `provider_native_customization`, `prompt_policy_assets`

### ArtifactType

Values: `domain_pack`, `run_trace`, `dataset`, `eval_case`, `episode_case`, `grader`, `reward`, `prompt_asset`, `retrieval_stack`, `verifier_pack`, `action_policy`, `candidate_recipe`, `student_model`, `release_bundle`

### BenchmarkCaseKind

Values: `atomic_case`, `episode_case`

### CandidateReleaseDecision

Values: `promoted`, `rejected`, `shadow`, `canary`, `experimental`

### DataZone

Values: `train`, `dev`, `gold_eval`, `hidden_eval`, `shadow_only`, `quarantined`

### BenchmarkMode

Values: `offline_gold`, `offline_shadow`, `live_shadow`, `live_canary`

### BenchmarkSplit

Values: `train`, `dev`, `gold_eval`, `hidden_eval`, `shadow_only`, `quarantined`

### ProviderMetadataQuality

Values: `exact_snapshot`, `release_label_only`, `proxy_resolved`, `opaque_provider`

---

## NicheProgram

**Schema**: `NicheProgramSchema` in `src/niche/schema/program.ts`

**Purpose**: The operator-owned specialization definition that declares the niche objective, runtime stack, allowed tools and sources, success metrics, and data policy.

### Fields

| Field                    | Type                | Required | Description                                                             |
| ------------------------ | ------------------- | -------- | ----------------------------------------------------------------------- |
| `niche_program_id`       | IdentifierString    | Required | Unique identifier for this niche program.                               |
| `name`                   | NonEmptyString      | Required | Human-readable name.                                                    |
| `objective`              | NonEmptyString      | Required | Description of the specialization goal.                                 |
| `risk_class`             | RiskClass           | Required | Risk classification: `low`, `moderate`, or `high`.                      |
| `runtime_stack`          | RuntimeStack        | Required | Declares the planner, retrieval, and verifier components.               |
| `allowed_tools`          | NonEmptyString[]    | Required | List of tool names the niche may use. Min 1 item.                       |
| `allowed_sources`        | AllowedSource[]     | Required | Declared evidence and data sources. Min 1 item.                         |
| `success_metrics`        | SuccessMetric[]     | Required | Measurable criteria for evaluating specialization. Min 1 item.          |
| `rights_and_data_policy` | RightsAndDataPolicy | Required | Governance policies for storage, training, benchmarking, and retention. |

### Nested: RuntimeStack

| Field                  | Type                 | Required | Description                              |
| ---------------------- | -------------------- | -------- | ---------------------------------------- |
| `planner_runtime`      | RuntimeComponent     | Required | Primary planner component.               |
| `retrieval_components` | RuntimeComponent[]   | Optional | Retrieval components.                    |
| `verifier_components`  | RuntimeComponent[]   | Optional | Verifier components.                     |
| `specialization_lanes` | SpecializationLane[] | Required | Active specialization strategies. Min 1. |

### Nested: RuntimeComponent

| Field          | Type             | Required | Description             |
| -------------- | ---------------- | -------- | ----------------------- |
| `component_id` | IdentifierString | Required | Component identifier.   |
| `provider`     | NonEmptyString   | Required | Provider name.          |
| `model_id`     | NonEmptyString   | Required | Model identifier.       |
| `api_mode`     | NonEmptyString   | Optional | API communication mode. |
| `notes`        | NonEmptyString   | Optional | Freeform notes.         |

### Nested: AllowedSource

| Field            | Type             | Required | Description                 |
| ---------------- | ---------------- | -------- | --------------------------- |
| `source_id`      | IdentifierString | Required | Source identifier.          |
| `source_kind`    | SourceKind       | Required | One of the 10 source kinds. |
| `description`    | NonEmptyString   | Optional | What this source provides.  |
| `access_pattern` | NonEmptyString   | Optional | How the source is accessed. |

### Nested: SuccessMetric

| Field                | Type             | Required | Description                          |
| -------------------- | ---------------- | -------- | ------------------------------------ |
| `metric_id`          | IdentifierString | Required | Metric identifier.                   |
| `label`              | NonEmptyString   | Required | Human-readable label.                |
| `objective`          | MetricObjective  | Required | `maximize`, `minimize`, or `target`. |
| `target_description` | NonEmptyString   | Required | What the metric aims to achieve.     |
| `measurement_method` | NonEmptyString   | Required | How the metric is measured.          |

### Nested: RightsAndDataPolicy

| Field                      | Type           | Required | Description                                      |
| -------------------------- | -------------- | -------- | ------------------------------------------------ |
| `storage_policy`           | NonEmptyString | Required | Policy for artifact persistence.                 |
| `training_policy`          | NonEmptyString | Required | Policy for training data use.                    |
| `benchmark_policy`         | NonEmptyString | Required | Policy for benchmark data use.                   |
| `retention_policy`         | NonEmptyString | Required | Data retention rules.                            |
| `redaction_policy`         | NonEmptyString | Required | Redaction rules for sensitive content.           |
| `pii_policy`               | NonEmptyString | Required | PII handling rules.                              |
| `live_trace_reuse_policy`  | NonEmptyString | Required | Rules for reusing live traces.                   |
| `operator_review_required` | boolean        | Required | Whether operator approval is needed for actions. |

### Example

```json
{
  "niche_program_id": "repo-ci-specialist",
  "name": "Repo Terminal CI Specialist",
  "objective": "Specialize for benchmarked repo, terminal, and CI workflows.",
  "risk_class": "moderate",
  "runtime_stack": {
    "planner_runtime": {
      "component_id": "openclaw-planner-runtime",
      "provider": "openclaw",
      "model_id": "same-model-baseline",
      "api_mode": "cli_control_plane"
    },
    "specialization_lanes": ["system_specialization", "distillation"]
  },
  "allowed_tools": ["read_file", "run_command", "write_file"],
  "allowed_sources": [
    {
      "source_id": "approved-repo-assets",
      "source_kind": "repos",
      "description": "Approved repository sources."
    }
  ],
  "success_metrics": [
    {
      "metric_id": "held-out-task-success",
      "label": "Held-out task success",
      "objective": "maximize",
      "target_description": "Improve held-out task success over baseline.",
      "measurement_method": "paired benchmark deltas"
    }
  ],
  "rights_and_data_policy": {
    "storage_policy": "Persist only approved niche artifacts.",
    "training_policy": "Train only on inputs with explicit rights.",
    "benchmark_policy": "Benchmark with held-out, comparable manifests.",
    "retention_policy": "Retain artifacts for lineage and replay.",
    "redaction_policy": "Redact secrets before persistence.",
    "pii_policy": "Do not store unapproved PII.",
    "live_trace_reuse_policy": "Embargo live traces until cleared.",
    "operator_review_required": true
  }
}
```

---

## DomainPack

**Schema**: `DomainPackSchema` in `src/niche/schema/domain-pack.ts`

**Purpose**: System-compiled domain knowledge artifact containing ontology, task taxonomy, terminology, constraints, tool contracts, evidence sources, failure modes, verifier defaults, and benchmark seed specifications.

### Top-level Fields

| Field                      | Type                             | Required | Description                                       |
| -------------------------- | -------------------------------- | -------- | ------------------------------------------------- |
| `domain_pack_id`           | IdentifierString                 | Required | Unique domain pack identifier.                    |
| `niche_program_id`         | IdentifierString                 | Required | Parent niche program.                             |
| `version`                  | VersionString                    | Required | Domain pack version.                              |
| `ontology`                 | Ontology                         | Required | Domain concepts and relations.                    |
| `task_taxonomy`            | TaskFamily[]                     | Required | Benchmarkable task families. Min 1.               |
| `terminology_map`          | Record<string, TerminologyEntry> | Required | Canonical terms and synonyms.                     |
| `constraints`              | DomainConstraint[]               | Required | Enforcement rules. Min 1.                         |
| `tool_contracts`           | ToolContract[]                   | Required | Tool intent, arguments, and failure modes. Min 1. |
| `evidence_source_registry` | EvidenceSource[]                 | Required | Approved evidence sources. Min 1.                 |
| `failure_taxonomy`         | FailureMode[]                    | Required | Known failure modes. Min 1.                       |
| `verifier_defaults`        | VerifierDefaults                 | Required | Default verifier checks and blocking rules.       |
| `benchmark_seed_specs`     | BenchmarkSeedSpec[]              | Required | Seeds for benchmark generation. Min 1.            |

### Nested: Ontology

| Field       | Type                 | Required | Description                     |
| ----------- | -------------------- | -------- | ------------------------------- |
| `concepts`  | IdLabelDescription[] | Required | Domain concepts. Min 1.         |
| `relations` | OntologyRelation[]   | Required | Relationships between concepts. |

### Nested: OntologyRelation

| Field               | Type             | Required | Description                                   |
| ------------------- | ---------------- | -------- | --------------------------------------------- |
| `relation_id`       | IdentifierString | Required | Relation identifier.                          |
| `source_concept_id` | IdentifierString | Required | Source concept.                               |
| `target_concept_id` | IdentifierString | Required | Target concept.                               |
| `relation_type`     | NonEmptyString   | Required | Relation type (e.g., "supports", "produces"). |
| `description`       | NonEmptyString   | Optional | Relation description.                         |

### Nested: TaskFamily

| Field                   | Type             | Required | Description                                  |
| ----------------------- | ---------------- | -------- | -------------------------------------------- |
| `task_family_id`        | IdentifierString | Required | Task family identifier.                      |
| `label`                 | NonEmptyString   | Required | Display label.                               |
| `description`           | NonEmptyString   | Optional | Description.                                 |
| `benchmarkable`         | boolean          | Required | Whether this task family can be benchmarked. |
| `required_capabilities` | NonEmptyString[] | Required | Capabilities needed.                         |

### Nested: TerminologyEntry

| Field            | Type             | Required | Description      |
| ---------------- | ---------------- | -------- | ---------------- |
| `canonical_term` | NonEmptyString   | Required | Preferred term.  |
| `synonyms`       | NonEmptyString[] | Required | Known synonyms.  |
| `definition`     | NonEmptyString   | Optional | Term definition. |

### Nested: DomainConstraint

| Field           | Type             | Required | Description                              |
| --------------- | ---------------- | -------- | ---------------------------------------- |
| `constraint_id` | IdentifierString | Required | Constraint identifier.                   |
| `category`      | NonEmptyString   | Required | Category (e.g., "tooling", "grounding"). |
| `rule`          | NonEmptyString   | Required | The rule text.                           |
| `rationale`     | NonEmptyString   | Optional | Why this constraint exists.              |
| `severity`      | RiskClass        | Required | `low`, `moderate`, or `high`.            |

### Nested: ToolContract

| Field                | Type               | Required | Description                        |
| -------------------- | ------------------ | -------- | ---------------------------------- |
| `tool_name`          | NonEmptyString     | Required | Tool name.                         |
| `intent_summary`     | NonEmptyString     | Required | What the tool does.                |
| `required_arguments` | NonEmptyString[]   | Required | Required argument names.           |
| `optional_arguments` | NonEmptyString[]   | Required | Optional argument names.           |
| `failure_modes`      | IdentifierString[] | Required | Known failure modes for this tool. |

### Nested: EvidenceSource

| Field                   | Type             | Required | Description                 |
| ----------------------- | ---------------- | -------- | --------------------------- |
| `source_id`             | IdentifierString | Required | Source identifier.          |
| `source_kind`           | SourceKind       | Required | One of the 10 source kinds. |
| `title`                 | NonEmptyString   | Required | Display title.              |
| `access_pattern`        | NonEmptyString   | Required | How to access this source.  |
| `freshness_expectation` | NonEmptyString   | Optional | Expected update cadence.    |
| `trust_notes`           | NonEmptyString   | Optional | Trust and provenance notes. |

### Nested: FailureMode

| Field             | Type             | Required | Description                          |
| ----------------- | ---------------- | -------- | ------------------------------------ |
| `failure_id`      | IdentifierString | Required | Failure mode identifier.             |
| `label`           | NonEmptyString   | Required | Display label.                       |
| `description`     | NonEmptyString   | Required | Description.                         |
| `severity`        | RiskClass        | Required | `low`, `moderate`, or `high`.        |
| `detection_hints` | NonEmptyString[] | Required | Patterns that indicate this failure. |

### Nested: VerifierDefaults

| Field                  | Type               | Required | Description                            |
| ---------------------- | ------------------ | -------- | -------------------------------------- |
| `required_checks`      | NonEmptyString[]   | Required | Verifier checks that must pass. Min 1. |
| `blocking_failure_ids` | IdentifierString[] | Required | Failure IDs that block delivery.       |
| `output_requirements`  | NonEmptyString[]   | Required | Output quality requirements.           |
| `escalation_policy`    | NonEmptyString     | Required | When to escalate.                      |

### Nested: BenchmarkSeedSpec

| Field                  | Type               | Required | Description                           |
| ---------------------- | ------------------ | -------- | ------------------------------------- |
| `seed_id`              | IdentifierString   | Required | Seed identifier.                      |
| `task_family_id`       | IdentifierString   | Required | Target task family.                   |
| `prompt`               | NonEmptyString     | Required | Benchmark prompt text.                |
| `source_refs`          | IdentifierString[] | Required | Referenced sources. Min 1.            |
| `pass_conditions`      | NonEmptyString[]   | Required | Conditions for passing. Min 1.        |
| `hard_fail_conditions` | NonEmptyString[]   | Required | Conditions that trigger hard failure. |

### Example (abbreviated)

```json
{
  "domain_pack_id": "repo-ci-specialist-repo-ci-pack",
  "niche_program_id": "repo-ci-specialist",
  "version": "2026.3.12-repo-ci",
  "ontology": {
    "concepts": [{ "id": "repo_snapshot", "label": "Repository snapshot" }],
    "relations": []
  },
  "task_taxonomy": [
    {
      "task_family_id": "repo_navigation",
      "label": "Repo navigation",
      "benchmarkable": true,
      "required_capabilities": ["evidence_grounding"]
    }
  ],
  "terminology_map": {
    "repo": {
      "canonical_term": "repository",
      "synonyms": ["repo", "checkout"],
      "definition": "The local project files under evaluation."
    }
  },
  "constraints": [
    {
      "constraint_id": "approved-tools-only",
      "category": "tooling",
      "rule": "Use only approved tools declared in the niche.",
      "severity": "high"
    }
  ],
  "tool_contracts": [
    {
      "tool_name": "read_file",
      "intent_summary": "Inspect repo files without mutating state.",
      "required_arguments": ["path"],
      "optional_arguments": [],
      "failure_modes": ["hallucinated_path"]
    }
  ],
  "evidence_source_registry": [
    {
      "source_id": "repo_snapshot",
      "source_kind": "repos",
      "title": "Local repository snapshot",
      "access_pattern": "frozen checkout"
    }
  ],
  "failure_taxonomy": [
    {
      "failure_id": "hallucinated_path",
      "label": "Hallucinated path",
      "description": "Cites a path not in repo evidence.",
      "severity": "high",
      "detection_hints": ["path missing"]
    }
  ],
  "verifier_defaults": {
    "required_checks": ["evidence_grounding", "output_constraints"],
    "blocking_failure_ids": ["hallucinated_path", "unsafe_command"],
    "output_requirements": ["claims must cite approved evidence"],
    "escalation_policy": "Escalate when evidence is insufficient."
  },
  "benchmark_seed_specs": [
    {
      "seed_id": "repo-navigation-seed",
      "task_family_id": "repo_navigation",
      "prompt": "Locate the runtime entrypoint.",
      "source_refs": ["repo_snapshot"],
      "pass_conditions": ["correct entrypoint"],
      "hard_fail_conditions": ["hallucinated path"]
    }
  ]
}
```

---

## ReadinessReport

**Schema**: `ReadinessReportSchema` in `src/niche/schema/readiness.ts`

**Purpose**: Evaluation of whether a compiled niche is ready for specialization, including dimension scores, hard blockers, warnings, and recommended actions.

### Fields

| Field                      | Type                     | Required | Description                                     |
| -------------------------- | ------------------------ | -------- | ----------------------------------------------- |
| `readiness_report_id`      | IdentifierString         | Required | Report identifier.                              |
| `niche_program_id`         | IdentifierString         | Required | Parent niche program.                           |
| `status`                   | ReadinessStatus          | Required | `ready`, `ready_with_warnings`, or `not_ready`. |
| `dimension_scores`         | ReadinessDimensionScores | Required | Scores for each readiness dimension.            |
| `hard_blockers`            | ReadinessHardBlocker[]   | Required | Blocking issues (may be empty).                 |
| `warnings`                 | ReadinessWarning[]       | Required | Non-blocking warnings (may be empty).           |
| `recommended_next_actions` | ReadinessAction[]        | Required | Suggested next steps.                           |
| `generated_at`             | TimestampString          | Required | When the report was generated.                  |

### Nested: ReadinessDimensionScores

Each dimension is a `ReadinessDimensionScore` with:

| Field       | Type           | Required | Description               |
| ----------- | -------------- | -------- | ------------------------- |
| `score`     | number (0-100) | Required | Dimension score.          |
| `rationale` | NonEmptyString | Optional | Explanation of the score. |

Dimensions: `source_quality`, `source_coverage`, `contradiction_rate`, `freshness`, `rights_sufficiency`, `task_observability`, `benchmarkability`, `measurable_success_criteria`, `tool_availability`.

### Hard Blocker Codes

| Code                                                    | Description                              |
| ------------------------------------------------------- | ---------------------------------------- |
| `insufficient_rights_to_use`                            | Storage or benchmark rights are missing. |
| `benchmarkability_below_minimum_threshold`              | Not enough benchmark seeds.              |
| `contradiction_rate_exceeds_hard_threshold`             | Source contradiction rate too high.      |
| `tool_availability_inadequate_for_workflow`             | Tool coverage too low.                   |
| `source_coverage_too_low_for_benchmarkable_domain_pack` | Too few source kinds.                    |

### Nested: ReadinessAction

| Field       | Type                    | Required | Description                               |
| ----------- | ----------------------- | -------- | ----------------------------------------- |
| `action_id` | IdentifierString        | Required | Action identifier.                        |
| `summary`   | NonEmptyString          | Required | What to do.                               |
| `priority`  | ReadinessActionPriority | Required | `required`, `recommended`, or `optional`. |

### Example

```json
{
  "readiness_report_id": "repo-ci-specialist-readiness",
  "niche_program_id": "repo-ci-specialist",
  "status": "ready_with_warnings",
  "dimension_scores": {
    "source_quality": { "score": 100, "rationale": "All sources verified and clean." },
    "source_coverage": { "score": 30 },
    "contradiction_rate": { "score": 0 },
    "freshness": { "score": 75 },
    "rights_sufficiency": { "score": 100 },
    "task_observability": { "score": 70 },
    "benchmarkability": { "score": 100 },
    "measurable_success_criteria": { "score": 90 },
    "tool_availability": { "score": 95 }
  },
  "hard_blockers": [],
  "warnings": [],
  "recommended_next_actions": [
    {
      "action_id": "proceed_with_specialization",
      "summary": "The niche is ready for the next specialization stage.",
      "priority": "optional"
    }
  ],
  "generated_at": "2026-03-14T12:00:00.000Z"
}
```

---

## Source Descriptors

**Schema**: Defined in `src/niche/schema/source-ingest.ts`

**Purpose**: Typed input descriptors that declare how source material enters the compile flow. There are four input kinds.

### Common Base Fields

All source descriptors share these fields:

| Field                  | Type                 | Required | Description                                                         |
| ---------------------- | -------------------- | -------- | ------------------------------------------------------------------- |
| `sourceId`             | IdentifierString     | Required | Source identifier.                                                  |
| `sourceKind`           | SourceKind           | Required | One of the 10 source kinds.                                         |
| `inputKind`            | SourceInputKind      | Required | `local_file`, `repo_asset`, `structured_text`, or `benchmark_seed`. |
| `title`                | NonEmptyString       | Required | Display title.                                                      |
| `accessPattern`        | NonEmptyString       | Required | How the source is accessed.                                         |
| `rights`               | SourceRightsMetadata | Required | Rights and governance metadata.                                     |
| `freshnessExpectation` | NonEmptyString       | Optional | Expected freshness.                                                 |
| `trustNotes`           | NonEmptyString       | Optional | Trust notes.                                                        |

### Nested: SourceRightsMetadata

| Field                               | Type           | Required | Description                                                                  |
| ----------------------------------- | -------------- | -------- | ---------------------------------------------------------------------------- |
| `rights_to_store`                   | boolean        | Required | May this source be persisted?                                                |
| `rights_to_train`                   | boolean        | Required | May this source be used for training?                                        |
| `rights_to_benchmark`               | boolean        | Required | May this source be used in benchmarks?                                       |
| `rights_to_derive`                  | boolean        | Required | May derivatives be created?                                                  |
| `rights_to_distill`                 | boolean        | Required | May this source be used for distillation?                                    |
| `rights_to_generate_synthetic_from` | boolean        | Required | May synthetic data be generated?                                             |
| `retention_policy`                  | NonEmptyString | Required | Retention rules.                                                             |
| `redaction_status`                  | NonEmptyString | Required | Redaction state (e.g., "clean").                                             |
| `pii_status`                        | NonEmptyString | Required | PII state (e.g., "none").                                                    |
| `provenance_status`                 | NonEmptyString | Required | Provenance state (e.g., "verified").                                         |
| `data_zone`                         | DataZone       | Required | `train`, `dev`, `gold_eval`, `hidden_eval`, `shadow_only`, or `quarantined`. |
| `quarantined`                       | boolean        | Optional | Whether the source is quarantined.                                           |
| `quarantine_reason`                 | NonEmptyString | Optional | Why it was quarantined.                                                      |

### 1. LocalFileSourceDescriptor

Additional field:

| Field      | Type           | Required | Description                            |
| ---------- | -------------- | -------- | -------------------------------------- |
| `filePath` | NonEmptyString | Required | Absolute or relative path to the file. |

```json
{
  "sourceId": "repo-readme",
  "sourceKind": "documents",
  "inputKind": "local_file",
  "title": "Repository README",
  "accessPattern": "local_file_read",
  "filePath": "./README.md",
  "rights": {
    "rights_to_store": true,
    "rights_to_train": true,
    "rights_to_benchmark": true,
    "rights_to_derive": true,
    "rights_to_distill": true,
    "rights_to_generate_synthetic_from": true,
    "retention_policy": "retain_for_lineage",
    "redaction_status": "clean",
    "pii_status": "none",
    "provenance_status": "verified",
    "data_zone": "train"
  }
}
```

### 2. RepoAssetSourceDescriptor

Additional fields:

| Field              | Type           | Required | Description                 |
| ------------------ | -------------- | -------- | --------------------------- |
| `repoRoot`         | NonEmptyString | Required | Repository root path.       |
| `repoRelativePath` | NonEmptyString | Required | Path relative to repo root. |

```json
{
  "sourceId": "ci-config",
  "sourceKind": "repos",
  "inputKind": "repo_asset",
  "title": "CI configuration",
  "accessPattern": "local_checkout",
  "repoRoot": "/home/user/myrepo",
  "repoRelativePath": ".github/workflows/ci.yml",
  "rights": {
    "rights_to_store": true,
    "rights_to_train": true,
    "rights_to_benchmark": true,
    "rights_to_derive": true,
    "rights_to_distill": true,
    "rights_to_generate_synthetic_from": true,
    "retention_policy": "retain_for_lineage",
    "redaction_status": "clean",
    "pii_status": "none",
    "provenance_status": "verified",
    "data_zone": "train"
  }
}
```

### 3. StructuredTextSourceDescriptor

Additional field:

| Field  | Type           | Required | Description                     |
| ------ | -------------- | -------- | ------------------------------- |
| `text` | NonEmptyString | Required | Inline structured text content. |

```json
{
  "sourceId": "domain-knowledge",
  "sourceKind": "domain_constraints",
  "inputKind": "structured_text",
  "title": "Domain constraints document",
  "accessPattern": "inline_text",
  "text": "All edits must stay within the declared task scope.",
  "rights": {
    "rights_to_store": true,
    "rights_to_train": true,
    "rights_to_benchmark": true,
    "rights_to_derive": true,
    "rights_to_distill": true,
    "rights_to_generate_synthetic_from": true,
    "retention_policy": "retain_for_lineage",
    "redaction_status": "clean",
    "pii_status": "none",
    "provenance_status": "verified",
    "data_zone": "train"
  }
}
```

### 4. BenchmarkSeedSourceDescriptor

Additional fields:

| Field                | Type             | Required | Description                           |
| -------------------- | ---------------- | -------- | ------------------------------------- |
| `prompt`             | NonEmptyString   | Required | Benchmark prompt text.                |
| `taskFamilyId`       | IdentifierString | Required | Target task family for this seed.     |
| `passConditions`     | NonEmptyString[] | Required | Conditions for passing.               |
| `hardFailConditions` | NonEmptyString[] | Required | Conditions that trigger hard failure. |

```json
{
  "sourceId": "repo-nav-seed",
  "sourceKind": "datasets",
  "inputKind": "benchmark_seed",
  "title": "Repo navigation benchmark seed",
  "accessPattern": "inline_seed",
  "prompt": "Locate the runtime entrypoint and the CLI command registry.",
  "taskFamilyId": "repo_navigation",
  "passConditions": ["correct entrypoint", "correct registry file"],
  "hardFailConditions": ["hallucinated path"],
  "rights": {
    "rights_to_store": true,
    "rights_to_train": false,
    "rights_to_benchmark": true,
    "rights_to_derive": true,
    "rights_to_distill": false,
    "rights_to_generate_synthetic_from": false,
    "retention_policy": "retain_for_benchmark",
    "redaction_status": "clean",
    "pii_status": "none",
    "provenance_status": "verified",
    "data_zone": "dev"
  }
}
```

---

## BaselineManifest and CandidateManifest

**Schema**: `BaselineManifestSchema` and `CandidateManifestSchema` in `src/niche/schema/manifests.ts`

**Purpose**: Execution-pinned manifests that lock every variable that could affect benchmark comparison. The baseline represents the unspecialized system; the candidate represents the specialized system. Manifests must match on all execution invariants for valid comparison.

### Shared Manifest Fields

Both manifests share these fields:

| Field                       | Type                    | Required | Description                      |
| --------------------------- | ----------------------- | -------- | -------------------------------- |
| `niche_program_id`          | IdentifierString        | Required | Parent niche program.            |
| `created_at`                | TimestampString         | Required | Creation timestamp.              |
| `planner_runtime`           | RuntimeComponent        | Required | Planner runtime component.       |
| `provider`                  | NonEmptyString          | Required | Model provider.                  |
| `model_id`                  | NonEmptyString          | Required | Model identifier.                |
| `model_snapshot_id`         | NonEmptyString          | Optional | Specific model snapshot.         |
| `api_mode`                  | NonEmptyString          | Required | API mode.                        |
| `provider_release_label`    | NonEmptyString          | Optional | Provider release label.          |
| `api_revision`              | NonEmptyString          | Optional | API revision.                    |
| `capability_snapshot_at`    | TimestampString         | Optional | When capabilities were captured. |
| `routing_proxy_version`     | VersionString           | Optional | Routing proxy version.           |
| `provider_metadata_quality` | ProviderMetadataQuality | Required | Quality of provider metadata.    |
| `provider_runtime_notes`    | NonEmptyString          | Optional | Notes about provider setup.      |
| `sampling_config`           | Record<string, scalar>  | Required | Sampling parameters.             |
| `prompt_asset_version`      | NonEmptyString          | Required | Prompt asset version.            |
| `grader_set_version`        | NonEmptyString          | Required | Grader set version.              |
| `benchmark_suite_id`        | IdentifierString        | Required | Benchmark suite for comparison.  |
| `source_access_manifest_id` | IdentifierString        | Required | Source access manifest.          |
| `retry_policy`              | RetryPolicy             | Required | Retry configuration.             |
| `token_budget`              | TokenBudget             | Required | Token limits.                    |
| `context_budget`            | ContextBudget           | Required | Context limits.                  |
| `execution_mode`            | NonEmptyString          | Required | Execution mode.                  |
| `notes`                     | NonEmptyString          | Optional | Freeform notes.                  |
| `tool_catalog_version`      | NonEmptyString          | Required | Tool catalog version.            |
| `tool_allowlist`            | NonEmptyString[]        | Required | Allowed tools. Min 1.            |
| `tool_contract_version`     | NonEmptyString          | Required | Tool contract version.           |
| `retrieval_config`          | unknown                 | Required | Retrieval configuration.         |
| `verifier_config`           | unknown                 | Required | Verifier configuration.          |

### BaselineManifest-specific

| Field                  | Type             | Required | Description                   |
| ---------------------- | ---------------- | -------- | ----------------------------- |
| `baseline_manifest_id` | IdentifierString | Required | Baseline manifest identifier. |

### CandidateManifest-specific

| Field                           | Type             | Required | Description                                      |
| ------------------------------- | ---------------- | -------- | ------------------------------------------------ |
| `candidate_manifest_id`         | IdentifierString | Required | Candidate manifest identifier.                   |
| `based_on_baseline_manifest_id` | IdentifierString | Required | The baseline this candidate is compared against. |
| `domain_pack_id`                | IdentifierString | Required | Domain pack used.                                |
| `action_policy_id`              | IdentifierString | Required | Action policy used.                              |
| `retrieval_stack_id`            | IdentifierString | Required | Retrieval stack used.                            |
| `verifier_pack_id`              | IdentifierString | Required | Verifier pack used.                              |
| `optional_student_model_ids`    | NonEmptyString[] | Required | Student model IDs (may be empty).                |
| `candidate_recipe`              | IdentifierString | Required | Candidate recipe used.                           |

### Comparison Issues

When comparing manifests, the following issue codes may be raised:

| Code                           | Description                                       |
| ------------------------------ | ------------------------------------------------- |
| `benchmark_suite_mismatch`     | Different benchmark suite IDs.                    |
| `provider_mismatch`            | Different providers.                              |
| `model_id_mismatch`            | Different model IDs (unless cross-model allowed). |
| `planner_runtime_mismatch`     | Different planner runtime component IDs.          |
| `source_access_mismatch`       | Different source access manifests.                |
| `execution_invariant_mismatch` | Any execution parameter differs.                  |

---

## NicheCompilationRecord

**Schema**: `NicheCompilationRecordSchema` in `src/niche/schema/compile-record.ts`

**Purpose**: Complete record of a niche compilation, bundling the domain pack, source access manifest, readiness report, normalized sources, benchmark seed hints, and artifact references.

### Fields

| Field                               | Type                        | Required | Description                                           |
| ----------------------------------- | --------------------------- | -------- | ----------------------------------------------------- |
| `compilation_id`                    | IdentifierString            | Required | Compilation record identifier.                        |
| `niche_program_id`                  | IdentifierString            | Required | Parent niche program.                                 |
| `version`                           | VersionString               | Required | Compilation version.                                  |
| `compiled_at`                       | TimestampString             | Required | Compilation timestamp.                                |
| `domain_pack`                       | DomainPack                  | Required | The compiled domain pack.                             |
| `source_access_manifest`            | SourceAccessManifest        | Required | Source access manifest.                               |
| `readiness_report`                  | ReadinessReport             | Required | Readiness evaluation.                                 |
| `normalized_sources`                | NormalizedSourceRecord[]    | Required | All normalized source records. Min 1.                 |
| `benchmark_seed_hints`              | CompilerBenchmarkSeedHint[] | Required | Benchmark seed hints. Min 1.                          |
| `source_artifact_refs`              | ArtifactRef[]               | Required | Source artifact references. Min 1.                    |
| `compiled_domain_pack_artifact_ref` | ArtifactRef                 | Required | Domain pack artifact reference.                       |
| `compiled_domain_config`            | CompiledDomainConfig        | Optional | Operating configuration derived from the domain pack. |

### Example (abbreviated)

```json
{
  "compilation_id": "repo-ci-specialist-repo-ci-pack-compile-abc123def456",
  "niche_program_id": "repo-ci-specialist",
  "version": "compile-abc123def456",
  "compiled_at": "2026-03-14T12:00:00.000Z",
  "domain_pack": { "...": "see DomainPack" },
  "source_access_manifest": { "...": "see SourceAccessManifest" },
  "readiness_report": { "...": "see ReadinessReport" },
  "normalized_sources": [{ "...": "see NormalizedSourceRecord" }],
  "benchmark_seed_hints": [{ "...": "see CompilerBenchmarkSeedHint" }],
  "source_artifact_refs": [{ "...": "see ArtifactRef" }],
  "compiled_domain_pack_artifact_ref": { "...": "see ArtifactRef" }
}
```

---

## EvalCase

**Schema**: `EvalCaseSchema` in `src/niche/schema/benchmark.ts`

**Purpose**: A single atomic benchmark evaluation case, specifying the task input, allowed tools and sources, grading configuration, and pass/fail conditions.

### Fields

| Field                  | Type                | Required | Description                    |
| ---------------------- | ------------------- | -------- | ------------------------------ |
| `eval_case_id`         | IdentifierString    | Required | Case identifier.               |
| `suite_id`             | IdentifierString    | Required | Parent benchmark suite.        |
| `split`                | BenchmarkSplit      | Required | Data split for this case.      |
| `task_family`          | IdentifierString    | Required | Task family.                   |
| `input`                | unknown             | Required | Task input (freeform).         |
| `allowed_tools`        | NonEmptyString[]    | Required | Tools available. Min 1.        |
| `allowed_sources`      | IdentifierString[]  | Required | Sources available. Min 1.      |
| `grader_spec`          | BenchmarkGraderSpec | Required | Grading configuration.         |
| `pass_conditions`      | NonEmptyString[]    | Required | Conditions for passing. Min 1. |
| `hard_fail_conditions` | NonEmptyString[]    | Required | Conditions for hard failure.   |
| `difficulty`           | integer (>= 0)      | Required | Difficulty level.              |
| `seed`                 | NonEmptyString      | Required | Deterministic seed string.     |

### Nested: BenchmarkGraderSpec

| Field            | Type               | Required | Description                |
| ---------------- | ------------------ | -------- | -------------------------- |
| `grader_refs`    | IdentifierString[] | Required | Grader identifiers. Min 1. |
| `primary_metric` | IdentifierString   | Required | Primary evaluation metric. |
| `notes`          | NonEmptyString     | Optional | Grader notes.              |

### Example

```json
{
  "eval_case_id": "repo-nav-entrypoint",
  "suite_id": "repo-ci-atomic-pilot",
  "split": "gold_eval",
  "task_family": "repo_navigation",
  "input": {
    "prompt": "Find the repo file that registers top-level CLI commands."
  },
  "allowed_tools": ["read_file", "run_command"],
  "allowed_sources": ["repo_snapshot", "tool_contracts"],
  "grader_spec": {
    "grader_refs": ["grader-repo-ci-task-success"],
    "primary_metric": "task_success"
  },
  "pass_conditions": ["correct command-registry file"],
  "hard_fail_conditions": ["hallucinated path"],
  "difficulty": 1,
  "seed": "repo-nav-entrypoint-seed"
}
```

---

## CandidateRelease

**Schema**: `CandidateReleaseSchema` in `src/niche/schema/release.ts`

**Purpose**: A typed promotion decision that records the benchmark evidence, approval chain, and rollback target for a candidate specialization release.

### Fields

| Field                  | Type                     | Required | Description                                                    |
| ---------------------- | ------------------------ | -------- | -------------------------------------------------------------- |
| `candidate_release_id` | IdentifierString         | Required | Release identifier.                                            |
| `niche_program_id`     | IdentifierString         | Required | Parent niche program.                                          |
| `baseline_release_id`  | IdentifierString         | Required | Baseline release being compared against.                       |
| `stack_manifest`       | CandidateStackManifest   | Required | Candidate stack manifest.                                      |
| `benchmark_results`    | BenchmarkResultSummary[] | Required | Primary benchmark evidence. Min 1.                             |
| `shadow_results`       | BenchmarkResultSummary[] | Required | Shadow benchmark evidence (may be empty).                      |
| `decision`             | CandidateReleaseDecision | Required | `promoted`, `rejected`, `shadow`, `canary`, or `experimental`. |
| `decision_reason`      | NonEmptyString           | Required | Justification for the decision.                                |
| `approved_by`          | NonEmptyString[]         | Required | Approver identifiers. Min 1.                                   |
| `rollback_target`      | IdentifierString         | Required | Release to roll back to if needed.                             |

### Nested: CandidateStackManifest

| Field                     | Type             | Required | Description                           |
| ------------------------- | ---------------- | -------- | ------------------------------------- |
| `baseline_manifest_id`    | IdentifierString | Optional | Baseline manifest ID.                 |
| `candidate_manifest_id`   | IdentifierString | Required | Candidate manifest ID.                |
| `component_artifact_refs` | ArtifactRef[]    | Required | Component artifact references. Min 1. |

### Nested: ArtifactRef

| Field           | Type                | Required | Description                   |
| --------------- | ------------------- | -------- | ----------------------------- |
| `artifact_id`   | IdentifierString    | Required | Artifact identifier.          |
| `artifact_type` | ArtifactType        | Required | One of the 14 artifact types. |
| `version`       | VersionString       | Required | Artifact version.             |
| `content_hash`  | HashString          | Required | Content hash.                 |
| `rights_state`  | ArtifactRightsState | Required | Rights state.                 |
| `created_at`    | TimestampString     | Required | Creation timestamp.           |

### Example

```json
{
  "candidate_release_id": "repo-ci-release-2026-03-14",
  "niche_program_id": "repo-ci-specialist",
  "baseline_release_id": "baseline-release-v1",
  "stack_manifest": {
    "baseline_manifest_id": "baseline-manifest-v1",
    "candidate_manifest_id": "candidate-manifest-v1",
    "component_artifact_refs": [
      {
        "artifact_id": "release-bundle-v1",
        "artifact_type": "release_bundle",
        "version": "2026.3.14",
        "content_hash": "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        "rights_state": {
          "rights_to_store": true,
          "rights_to_train": true,
          "rights_to_benchmark": true,
          "rights_to_derive": true,
          "rights_to_distill": true,
          "rights_to_generate_synthetic_from": true
        },
        "created_at": "2026-03-14T12:00:00.000Z"
      }
    ]
  },
  "benchmark_results": [{ "...": "see BenchmarkResultSummary" }],
  "shadow_results": [],
  "decision": "promoted",
  "decision_reason": "Candidate shows positive mean delta across all task families.",
  "approved_by": ["operator"],
  "rollback_target": "baseline-release-v1"
}
```
