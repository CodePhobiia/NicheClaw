---
summary: "Complete worked example building a Repo CI Specialist niche from scratch, including the NicheProgram, source descriptors, compilation, readiness, benchmarking, and release."
read_when:
  - You want to create your first NicheClaw specialization
  - You need a reference for the end-to-end NicheClaw workflow
  - You want to understand how the Repo CI Specialist pilot works
title: "Example: Repo CI Specialist"
---

# Example: Repo CI Specialist

This is a complete, self-contained tutorial for building a NicheClaw specialization from scratch. The Repo CI Specialist is the default pilot niche that specializes an OpenClaw agent for repository navigation, tool selection, repair loops, CI verification, and long-horizon repo workflows.

## Overview

The Repo CI Specialist:

- Targets 5 task families: repo navigation, tool selection, repair loops, CI verification, and long-horizon repo workflows
- Uses 3 approved tools: `read_file`, `run_command`, `write_file`
- Draws evidence from 4 source categories: repos, logs, tool schemas, and past task traces
- Enforces constraints around approved-tools-only, evidence-before-claim, bounded-write-scope, and verify-after-edit
- Grades outputs using deterministic rule and trace graders
- Runs both atomic (single-task) and episode (multi-step) benchmark suites

## Prerequisites

- OpenClaw installed with NicheClaw support
- A repository with `PRD.md` and `ARCHITECTURE.md` that mention "NicheClaw"

---

## Step 1: Initialize the Workspace

```bash
openclaw niche init --write-starter-program
```

This command:

1. Validates the `PRD.md` and `ARCHITECTURE.md` architecture anchors
2. Creates the NicheClaw state root directory structure
3. Writes a starter niche program to the programs store

Expected output:

```
NicheClaw workspace initialized.
State root: /home/user/.openclaw/niche
Ensured directories: 12
Anchor PRD.md: ok (/home/user/myrepo/PRD.md)
Anchor ARCHITECTURE.md: ok (/home/user/myrepo/ARCHITECTURE.md)
Starter program: /home/user/.openclaw/niche/programs/repo-ci-specialist.json
```

### The NicheProgram (annotated)

The starter program written by `init --write-starter-program` has these key properties:

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
      "notes": "Keeps the same-model baseline discipline."
    },
    "retrieval_components": [
      {
        "component_id": "repo-evidence-retrieval",
        "provider": "openclaw",
        "model_id": "file-backed-registry",
        "api_mode": "local"
      }
    ],
    "verifier_components": [
      {
        "component_id": "repo-ci-verifier-pack",
        "provider": "openclaw",
        "model_id": "policy-pack",
        "api_mode": "local"
      }
    ],
    "specialization_lanes": ["system_specialization", "distillation", "prompt_policy_assets"]
  },
  "allowed_tools": ["read_file", "run_command", "write_file"],
  "allowed_sources": [
    {
      "source_id": "approved-repo-assets",
      "source_kind": "repos",
      "description": "Approved repository sources and fixture packs.",
      "access_pattern": "local_checkout_and_frozen_fixtures"
    },
    {
      "source_id": "approved-ci-logs",
      "source_kind": "logs",
      "description": "Approved CI outputs and terminal traces.",
      "access_pattern": "stored_ci_artifacts_and_replay_bundles"
    },
    {
      "source_id": "approved-tool-contracts",
      "source_kind": "tool_schemas",
      "description": "Typed tool contracts and allowed-source declarations.",
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

Key design decisions:

- **same-model-baseline**: The planner uses the same model as the baseline, so benchmark comparisons are fair.
- **3 specialization lanes**: System specialization, distillation, and prompt policy assets are active.
- **operator_review_required: true**: All actions require operator approval before deployment.
- **3 success metrics**: Task success, hard-fail rate, and grounded delivery.

---

## Step 2: Create Source Descriptors

Create two source descriptor JSON files. These tell the compiler what evidence is available.

### Source 1: Structured text source (domain knowledge)

Save as `sources/repo-domain.json`:

```json
{
  "sourceId": "repo-domain-knowledge",
  "sourceKind": "domain_constraints",
  "inputKind": "structured_text",
  "title": "Repo CI domain knowledge and constraints",
  "accessPattern": "inline_text",
  "text": "Repository CI workflows require evidence-grounded tool use. Edits must be bounded and verified. Commands must stay within the approved workspace. CI claims require supporting logs or test output.",
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

### Source 2: Benchmark seed source

Save as `sources/benchmark-seeds.json`:

```json
[
  {
    "sourceId": "repo-nav-seed",
    "sourceKind": "datasets",
    "inputKind": "benchmark_seed",
    "title": "Repo navigation benchmark seed",
    "accessPattern": "inline_seed",
    "prompt": "Locate the runtime entrypoint and the file that defines the CLI command registry.",
    "taskFamilyId": "repo_navigation",
    "passConditions": ["correct entrypoint", "correct command-registry file"],
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
  },
  {
    "sourceId": "tool-selection-seed",
    "sourceKind": "datasets",
    "inputKind": "benchmark_seed",
    "title": "Tool selection benchmark seed",
    "accessPattern": "inline_seed",
    "prompt": "Choose the safest next tool to understand a failing repo task before editing anything.",
    "taskFamilyId": "tool_selection",
    "passConditions": ["safe first tool", "grounded reason"],
    "hardFailConditions": ["unsafe command"],
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
  },
  {
    "sourceId": "repair-loop-seed",
    "sourceKind": "datasets",
    "inputKind": "benchmark_seed",
    "title": "Repair loop benchmark seed",
    "accessPattern": "inline_seed",
    "prompt": "Diagnose a failing verification step, apply a bounded edit, and rerun the minimal check.",
    "taskFamilyId": "repair_loop",
    "passConditions": ["bounded edit", "verification rerun"],
    "hardFailConditions": ["verification skipped", "unbounded edit"],
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
]
```

### Source descriptor design notes

- The domain knowledge source uses `inputKind: "structured_text"` for inline content.
- The benchmark seeds use `inputKind: "benchmark_seed"` which requires `prompt`, `taskFamilyId`, `passConditions`, and `hardFailConditions`.
- All sources have `rights_to_store: true` (required for compilation).
- Benchmark seeds set `rights_to_train: false` to prevent training data contamination.
- Benchmark seeds use `data_zone: "dev"` (allowed in compilation; `gold_eval` and `hidden_eval` are not).

---

## Step 3: Compile the Niche

```bash
openclaw niche compile \
  --niche-program-id repo-ci-specialist \
  --source ./sources/repo-domain.json \
  --source ./sources/benchmark-seeds.json \
  --emit-manifests \
  --json
```

This command:

1. Normalizes all source descriptors
2. Validates that sources have `rights_to_store: true` and are not quarantined
3. Compiles the domain pack (ontology, task taxonomy, terminology, constraints, tool contracts, failure taxonomy, verifier defaults, benchmark seed specs)
4. Builds the source access manifest
5. Evaluates readiness and generates the readiness report
6. Persists the compilation record
7. With `--emit-manifests`, also generates baseline and candidate manifests

---

## Step 4: Check Readiness

```bash
openclaw niche readiness --niche-program-id repo-ci-specialist --json
```

### Expected readiness scores for this example

With 4 sources (1 structured text + 3 benchmark seeds), 3 tools, and 3 success metrics:

| Dimension                     | Expected Score         | Reasoning                                                                                       |
| ----------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `source_quality`              | 100                    | All sources have `provenance_status: "verified"` and `redaction_status: "clean"`.               |
| `source_coverage`             | 20                     | 2 distinct source kinds (`domain_constraints`, `datasets`) out of 10.                           |
| `contradiction_rate`          | 0                      | No conflicting metadata between sources.                                                        |
| `freshness`                   | 60                     | No sources declare `freshnessExpectation`. Base score is 60.                                    |
| `rights_sufficiency`          | Depends on propagation | The benchmark seeds have some rights set to false; the propagated intersection may reduce this. |
| `task_observability`          | 90                     | 3 tools / 3 distinct task families = 60 + 30 = 90.                                              |
| `benchmarkability`            | 75                     | 3 benchmark seeds \* 25 = 75.                                                                   |
| `measurable_success_criteria` | 100                    | 3 metrics: 50 + 3\*20 = 110, capped at 100.                                                     |
| `tool_availability`           | 95                     | 3 tools: 50 + 3\*15 = 95.                                                                       |

With a source coverage of 20 (below the threshold of 30), this configuration would trigger the hard blocker `source_coverage_too_low_for_benchmarkable_domain_pack`.

To fix this, add a source from a third distinct kind. For example, add a `repos` kind source or a `tool_schemas` kind source to the source descriptors.

---

## Step 5: Prepare Benchmark Artifacts

Once readiness is achieved (status is `ready` or `ready_with_warnings` with no hard blockers):

```bash
openclaw niche prepare-benchmark \
  --niche-program-id repo-ci-specialist \
  --emit-release-artifacts \
  --json
```

This generates:

- Baseline manifest (pinning the unspecialized system configuration)
- Candidate manifest (pinning the specialized system configuration)
- Benchmark suite (atomic and/or episode cases derived from compilation seed hints)
- With `--emit-release-artifacts`: starter verifier metrics, monitor definition, and component artifact refs

---

## Step 6: Run the Benchmark

```bash
openclaw niche benchmark \
  --live \
  --from-program repo-ci-specialist \
  --suite ./output/benchmark-suite.json \
  --readiness-report ./output/readiness-report.json \
  --json
```

The `--live` flag executes both baseline and candidate through the real runtime path and persists authoritative benchmark evidence. Without `--live`, the benchmark uses pre-computed typed execution bundles.

The output includes:

- Benchmark result record with paired delta summaries
- Per-task-family score breakdowns
- Contamination audit summary
- Invalidation status

---

## Step 7: Release

```bash
openclaw niche release \
  --from-program repo-ci-specialist \
  --verifier-metrics ./output/verifier-metrics.json \
  --monitor ./output/promoted-monitor.json \
  --component-artifact-ref ./output/release-bundle-ref.json \
  --json
```

The release command:

1. Loads the baseline and candidate manifests
2. Validates manifest comparison (all execution invariants must match)
3. Evaluates benchmark results against promotion criteria
4. Checks verifier metrics and monitor drift thresholds
5. Emits a typed `CandidateRelease` with one of: `promoted`, `rejected`, `shadow`, `canary`, `experimental`

---

## Shortcut: Pipeline Command

Instead of running each step individually, you can use the pipeline command to run multiple stages in sequence:

```bash
openclaw niche pipeline \
  --niche-program-id repo-ci-specialist \
  --from compile \
  --to prepare-benchmark \
  --source ./sources/repo-domain.json \
  --source ./sources/benchmark-seeds.json \
  --json
```

This runs compile, readiness evaluation, and prepare-benchmark in sequence with automatic artifact bridging between stages.

---

## The Domain Pack (generated)

The compiler generates a domain pack from the niche program and source descriptors. For the Repo CI Specialist, the built-in seed domain pack (`src/niche/pilots/repo-ci/seed-domain-pack.ts`) produces:

- **Ontology**: 4 concepts (repo_snapshot, terminal_step, ci_signal, repair_loop) with 3 relations
- **Task taxonomy**: 5 task families (repo_navigation, tool_selection, repair_loop, ci_verification, long_horizon_repo_workflow)
- **Terminology map**: 3 entries (repo, ci, repair_loop)
- **Constraints**: 4 rules (approved-tools-only, evidence-before-claim, bounded-write-scope, verify-after-edit)
- **Tool contracts**: 3 contracts (read_file, run_command, write_file)
- **Evidence source registry**: 4 sources (repo_snapshot, ci_logs, tool_contracts, approved_run_traces)
- **Failure taxonomy**: 6 modes (hallucinated_path, unsafe_command, unbounded_edit, verification_skipped, missed_evidence, repair_loop_stall)
- **Verifier defaults**: 3 required checks, 3 blocking failure IDs
- **Benchmark seed specs**: 4 seeds across 4 task families

---

## The Benchmark Suites (generated)

The seed benchmark suite builder (`src/niche/pilots/repo-ci/seed-benchmark-suite.ts`) produces two suites:

### Atomic suite (repo-ci-atomic-pilot)

4 eval cases across 4 task families:

| Case ID                          | Task Family       | Difficulty |
| -------------------------------- | ----------------- | ---------- |
| `repo-nav-entrypoint`            | `repo_navigation` | 1          |
| `tool-selection-safe-next-step`  | `tool_selection`  | 1          |
| `repair-loop-minimal-fix`        | `repair_loop`     | 2          |
| `ci-verification-grounded-claim` | `ci_verification` | 2          |

### Episode suite (repo-ci-episode-pilot)

2 episode cases:

| Case ID                         | Task Family                  | Difficulty |
| ------------------------------- | ---------------------------- | ---------- |
| `episode-repair-loop`           | `repair_loop`                | 3          |
| `episode-long-horizon-workflow` | `long_horizon_repo_workflow` | 4          |

Episode cases define `initial_state`, `step_constraints`, and `termination_conditions` for multi-step evaluation.

---

## Summary of Commands

```bash
# 1. Initialize workspace
openclaw niche init --write-starter-program

# 2. (Create source descriptor files manually)

# 3. Compile
openclaw niche compile \
  --niche-program-id repo-ci-specialist \
  --source ./sources/repo-domain.json \
  --source ./sources/benchmark-seeds.json \
  --emit-manifests

# 4. Check readiness
openclaw niche readiness --niche-program-id repo-ci-specialist

# 5. Prepare benchmark artifacts
openclaw niche prepare-benchmark \
  --niche-program-id repo-ci-specialist \
  --emit-release-artifacts

# 6. Run benchmark
openclaw niche benchmark \
  --live \
  --from-program repo-ci-specialist \
  --suite ./output/benchmark-suite.json \
  --readiness-report ./output/readiness-report.json

# 7. Release
openclaw niche release \
  --from-program repo-ci-specialist \
  --verifier-metrics ./output/verifier-metrics.json \
  --monitor ./output/promoted-monitor.json \
  --component-artifact-ref ./output/release-bundle-ref.json
```
