---
summary: "The operator-owned specialization definition that tells NicheClaw what domain to specialize, which tools and sources are allowed, and how success is measured."
read_when:
  - You are creating a new NicheProgram for the first time
  - You want to understand what fields a NicheProgram requires
  - You need to choose a risk class, source kinds, or specialization lanes
title: "Niche Program"
---

# Niche Program

A Niche Program is the operator-owned blueprint that tells NicheClaw _what_ to specialize. It declares the domain objective, which tools and data sources the specialization may use, how success is measured, and what data-handling rights apply. Every NicheClaw workflow -- compilation, benchmarking, optimization, and release -- starts from a Niche Program.

A single NicheProgram is a JSON document stored under the NicheClaw state root. It is validated against the `NicheProgramSchema` at write time.

## Required fields

| Field                    | Type                                                | Description                                                                                                                                                     |
| ------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `niche_program_id`       | `string` (pattern `^[a-z0-9]+(?:[._-][a-z0-9]+)*$`) | Unique identifier. Lowercase alphanumeric with `.`, `_`, or `-` separators.                                                                                     |
| `name`                   | `string` (non-empty)                                | Human-readable display name for the program.                                                                                                                    |
| `objective`              | `string` (non-empty)                                | A natural-language statement of what the specialization should accomplish. This drives compilation, benchmark seed generation, and optimization.                |
| `risk_class`             | `"low"` \| `"moderate"` \| `"high"`                 | Governs release policy strictness and monitoring thresholds. See [Risk class](#risk-class) below.                                                               |
| `runtime_stack`          | object                                              | Declares the planner runtime, optional retrieval/verifier components, and selected specialization lanes. See [Runtime stack](#runtime-stack).                   |
| `allowed_tools`          | `string[]` (min 1 item)                             | The set of tool names the specialization is permitted to invoke at runtime.                                                                                     |
| `allowed_sources`        | `AllowedSource[]` (min 1 item)                      | Declared data sources the specialization may ingest. Each entry specifies a `source_id`, `source_kind`, and optional `description` and `access_pattern`.        |
| `success_metrics`        | `SuccessMetric[]` (min 1 item)                      | Measurable criteria for evaluating specialization quality. Each metric has a `metric_id`, `label`, `objective`, `target_description`, and `measurement_method`. |
| `rights_and_data_policy` | object                                              | Operator-declared policies for storage, training, benchmarking, retention, redaction, PII, live trace reuse, and whether operator review is required.           |

## Risk class

| Value      | When to use                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `low`      | The domain is low-stakes, failures are easily reversible, and no sensitive data is involved. Release gates and monitoring thresholds are relaxed.                    |
| `moderate` | The domain involves meaningful operator workflows where failures have real cost but are not safety-critical. Default choice for most production niches.              |
| `high`     | The domain touches regulated data, financial operations, or safety-sensitive workflows. Release gates require higher benchmark deltas and more stringent monitoring. |

## Runtime stack

The `runtime_stack` object has the following shape:

| Field                  | Type                                | Description                                                                                                                                               |
| ---------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planner_runtime`      | `RuntimeComponent`                  | The primary model runtime that executes planning and task completion. Specifies `component_id`, `provider`, `model_id`, `api_mode`, and optional `notes`. |
| `retrieval_components` | `RuntimeComponent[]` (optional)     | Additional runtimes used for evidence retrieval and grounding.                                                                                            |
| `verifier_components`  | `RuntimeComponent[]` (optional)     | Additional runtimes used for output verification.                                                                                                         |
| `specialization_lanes` | `SpecializationLane[]` (min 1 item) | Which customization approaches this program uses. See [Specialization Lanes](/niche/concepts/specialization-lanes).                                       |

## Source kinds

Each entry in `allowed_sources` declares a `source_kind`. NicheClaw recognizes 10 source kinds:

| Source kind          | Description                                                                             |
| -------------------- | --------------------------------------------------------------------------------------- |
| `documents`          | Structured or unstructured text documents such as manuals, runbooks, or specifications. |
| `websites`           | Web pages or crawled site content approved for ingestion.                               |
| `repos`              | Source code repositories, including file trees and commit history.                      |
| `logs`               | Operational logs such as CI output, terminal transcripts, or server logs.               |
| `datasets`           | Structured datasets in tabular or record format.                                        |
| `tool_schemas`       | Typed tool definitions, API schemas, or contract declarations.                          |
| `past_task_traces`   | Recorded traces from previous agent task executions.                                    |
| `human_examples`     | Human-authored exemplars demonstrating correct task completion.                         |
| `domain_constraints` | Explicit rules, policies, or invariants the domain enforces.                            |
| `live_sources`       | Real-time data feeds or APIs that provide fresh information at runtime.                 |

## Success metrics

Each metric in `success_metrics` declares an optimization direction:

| Objective  | Meaning                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------ |
| `maximize` | Higher values are better (e.g., task success rate).                                        |
| `minimize` | Lower values are better (e.g., hard-fail rate).                                            |
| `target`   | The metric should converge to a specific value or range described in `target_description`. |

## Example: starter program

The `openclaw niche init --write-starter-program` command generates the following starter program:

```json
{
  "niche_program_id": "repo-ci-specialist",
  "name": "Repo Terminal CI Specialist",
  "objective": "Specialize OpenClaw for benchmarked repo, terminal, and CI workflows without changing the serving substrate outside explicit NicheClaw paths.",
  "risk_class": "moderate",
  "runtime_stack": {
    "planner_runtime": {
      "component_id": "openclaw-planner-runtime",
      "provider": "openclaw",
      "model_id": "same-model-baseline",
      "api_mode": "cli_control_plane",
      "notes": "Starter niche program keeps the same-model baseline discipline and specializes around the OpenClaw runtime."
    },
    "retrieval_components": [
      {
        "component_id": "repo-evidence-retrieval",
        "provider": "openclaw",
        "model_id": "file-backed-registry",
        "api_mode": "local",
        "notes": "Approved repo and CI evidence registry for benchmarkable task grounding."
      }
    ],
    "verifier_components": [
      {
        "component_id": "repo-ci-verifier-pack",
        "provider": "openclaw",
        "model_id": "policy-pack",
        "api_mode": "local",
        "notes": "Starter verifier pack for grounding, constraint, and delivery checks."
      }
    ],
    "specialization_lanes": ["system_specialization", "distillation", "prompt_policy_assets"]
  },
  "allowed_tools": ["read_file", "run_command", "write_file"],
  "allowed_sources": [
    {
      "source_id": "approved-repo-assets",
      "source_kind": "repos",
      "description": "Approved repository sources and fixture packs for repo, terminal, and CI workflows.",
      "access_pattern": "local_checkout_and_frozen_fixtures"
    },
    {
      "source_id": "approved-ci-logs",
      "source_kind": "logs",
      "description": "Approved CI outputs and terminal traces retained for benchmark and verifier evidence.",
      "access_pattern": "stored_ci_artifacts_and_replay_bundles"
    },
    {
      "source_id": "approved-tool-contracts",
      "source_kind": "tool_schemas",
      "description": "Typed tool contracts and allowed-source declarations for the niche boundary.",
      "access_pattern": "versioned_local_contracts"
    }
  ],
  "success_metrics": [
    {
      "metric_id": "held-out-task-success",
      "label": "Held-out task success",
      "objective": "maximize",
      "target_description": "Improve held-out repo, terminal, and CI task success over the same-model baseline.",
      "measurement_method": "paired benchmark deltas on atomic and episode suites"
    },
    {
      "metric_id": "hard-fail-rate",
      "label": "Hard-fail rate",
      "objective": "minimize",
      "target_description": "Reduce hard failures without contaminating held-out evaluation.",
      "measurement_method": "benchmark and promoted-monitor hard-fail tracking"
    },
    {
      "metric_id": "grounded-delivery",
      "label": "Grounded delivery",
      "objective": "maximize",
      "target_description": "Keep final outputs verifier-approved and grounded in declared evidence bundles.",
      "measurement_method": "verifier pass-through and false-veto-sensitive review"
    }
  ],
  "rights_and_data_policy": {
    "storage_policy": "Persist only approved niche artifacts and traces under the NicheClaw state root.",
    "training_policy": "Train only on inputs that retain explicit rights_to_train and derivative authorization.",
    "benchmark_policy": "Benchmark with held-out, same-model comparable manifests and contamination-audited suites.",
    "retention_policy": "Retain reproducibility artifacts needed for lineage, replay, and release governance.",
    "redaction_policy": "Redact operator secrets, credentials, and non-approved sensitive content before persistence.",
    "pii_policy": "Do not store or reuse unapproved PII in optimizer or benchmark artifacts.",
    "live_trace_reuse_policy": "Live traces remain embargoed until contamination checks, rights confirmation, and policy gates clear reuse.",
    "operator_review_required": true
  }
}
```

## Tips for writing a good Niche Program

**Objective.** Write the objective as a clear, testable statement. A good objective constrains what the specialization should improve and names the boundary it must not cross. Avoid vague goals like "be better at coding" -- instead specify the workflow family, the improvement target, and the invariant constraints.

**Risk class.** Start with `moderate` unless you have a specific reason to choose otherwise. The risk class affects release promotion thresholds and post-release monitoring sensitivity; choosing `high` when unnecessary adds friction, while `low` reduces safety margins.

**Allowed tools.** Declare the minimum set of tools the specialization needs. Every tool in this list becomes part of the benchmark surface and the source access manifest. Extra tools increase the evaluation burden.

**Allowed sources.** Use multiple source kinds when possible. The readiness gate measures source coverage as the fraction of distinct source kinds provided out of the 10 available kinds. Three or more distinct kinds is the minimum threshold for readiness.

**Success metrics.** Include at least one `maximize` metric for the positive outcome and one `minimize` metric for failure modes. The readiness gate scores `measurable_success_criteria` based on the count and clarity of declared metrics.
