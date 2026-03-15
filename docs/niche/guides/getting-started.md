---
summary: "Step-by-step guide to initializing, defining, compiling, and validating your first NicheClaw program."
read_when:
  - Setting up NicheClaw for the first time
  - Need a walkthrough of the niche init, create, compile, readiness flow
  - Want to understand the end-to-end specialization lifecycle
title: "Getting Started with NicheClaw"
---

# Getting Started with NicheClaw

This guide walks through the full setup process for NicheClaw -- from initializing a workspace to compiling your first domain pack and checking readiness.

## Prerequisites

- **Node 22+** installed and available on your PATH.
- **OpenClaw** installed globally (`npm i -g openclaw`).
- A repository with `PRD.md` and `ARCHITECTURE.md` files at the root, both mentioning "NicheClaw". The `init` command validates these anchors before proceeding.

## Walkthrough

<Steps>

### Step 1: Initialize the workspace

Run the following command from your repository root:

```bash
openclaw niche init --write-starter-program
```

This command does three things:

1. **Validates architecture anchors.** It checks that `PRD.md` and `ARCHITECTURE.md` exist at the repo root and that each file mentions "NicheClaw".
2. **Creates the NicheClaw state root.** It provisions all required directories under `~/.openclaw/niche/` (programs, compilations, manifests, benchmarks, and more). Directories are created with `0o700` permissions.
3. **Writes a starter niche program** (when `--write-starter-program` is passed). The starter program is saved to the programs directory as `repo-ci-specialist.json` with sensible defaults: moderate risk class, three allowed tools (`read_file`, `run_command`, `write_file`), three source declarations, and three success metrics.

You can customize the starter program ID and name:

```bash
openclaw niche init \
  --write-starter-program \
  --starter-program-id my-specialist \
  --starter-program-name "My Custom Specialist"
```

<Tip>
Pass `--json` to any NicheClaw command for machine-readable output. This is useful for scripting and CI pipelines.
</Tip>

### Step 2: Define your Niche Program

A Niche Program is a JSON document that declares:

- **Objective** -- what the specialization should accomplish.
- **Risk class** -- `low`, `moderate`, or `high`.
- **Runtime stack** -- provider, model, and API mode for the planner runtime, plus optional retrieval and verifier components.
- **Allowed tools** -- which tools the agent may invoke at runtime.
- **Allowed sources** -- which source kinds are approved for ingestion.
- **Success metrics** -- measurable criteria with objectives (`maximize`, `minimize`, or `target`).
- **Rights and data policy** -- storage, training, benchmark, retention, redaction, and PII policies.

You can use the starter program written by `init`, or author your own. Here is a minimal example:

```json
{
  "niche_program_id": "code-review-agent",
  "name": "Code Review Specialist",
  "objective": "Specialize for automated code review with grounded feedback.",
  "risk_class": "moderate",
  "runtime_stack": {
    "planner_runtime": {
      "component_id": "planner-primary",
      "provider": "anthropic",
      "model_id": "claude-sonnet-4-5-20250514",
      "api_mode": "messages"
    },
    "specialization_lanes": ["prompt_policy_assets"]
  },
  "allowed_tools": ["read_file", "run_command", "apply_patch"],
  "allowed_sources": [
    {
      "source_id": "repo-source",
      "source_kind": "repos"
    }
  ],
  "success_metrics": [
    {
      "metric_id": "review-accuracy",
      "label": "Review accuracy",
      "objective": "maximize",
      "target_description": "Improve review accuracy over baseline.",
      "measurement_method": "paired benchmark deltas"
    }
  ],
  "rights_and_data_policy": {
    "storage_policy": "Store governed artifacts in local state root only.",
    "training_policy": "Training data from operator-approved sources only.",
    "benchmark_policy": "Benchmark data isolated from training via data zone separation.",
    "retention_policy": "Retain for project lifetime.",
    "redaction_policy": "Redact PII before ingestion.",
    "pii_policy": "No PII in governed data zones.",
    "live_trace_reuse_policy": "Live traces require explicit approval before reuse.",
    "operator_review_required": true
  }
}
```

For full schema details, see the [Niche Program concept documentation](/niche/concepts/program).

### Step 3: Store the program

Register the program with the NicheClaw store:

```bash
openclaw niche create --program ./my-program.json
```

The command validates the program JSON against `NicheProgramSchema`, then persists it to the state root. On success it prints the assigned `niche_program_id` and the storage path.

<Warning>
The `niche_program_id` in your JSON must be a valid NicheClaw identifier: lowercase alphanumeric characters separated by hyphens, dots, or underscores (`^[a-z0-9]+(?:[._-][a-z0-9]+)*$`).
</Warning>

### Step 4: Prepare source descriptors

Source descriptors tell the compiler what knowledge to ingest. NicheClaw supports four `inputKind` values:

| `inputKind`       | Purpose                                      | Key fields                                                       |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `structured_text` | Inline text content (docs, guides, policies) | `text`                                                           |
| `benchmark_seed`  | Seed for benchmark case generation           | `prompt`, `taskFamilyId`, `passConditions`, `hardFailConditions` |
| `local_file`      | Reference to a file on disk                  | `filePath`                                                       |
| `repo_asset`      | Reference to a file within a repository      | `repoRoot`, `repoRelativePath`                                   |

Every source descriptor must declare a `rights` object with explicit boolean flags for `rights_to_store`, `rights_to_train`, `rights_to_benchmark`, `rights_to_derive`, `rights_to_distill`, and `rights_to_generate_synthetic_from`, plus `retention_policy`, `redaction_status`, `pii_status`, `provenance_status`, and `data_zone`.

Here is a minimal `structured_text` source descriptor:

```json
{
  "sourceId": "code-review-agent-source-0",
  "sourceKind": "repos",
  "inputKind": "structured_text",
  "title": "Code review guidelines",
  "accessPattern": "read-only",
  "rights": {
    "rights_to_store": true,
    "rights_to_train": true,
    "rights_to_benchmark": true,
    "rights_to_derive": true,
    "rights_to_distill": true,
    "rights_to_generate_synthetic_from": true,
    "retention_policy": "project-lifetime",
    "redaction_status": "clean",
    "pii_status": "none",
    "provenance_status": "verified",
    "data_zone": "train"
  },
  "text": "All code reviews must check for security issues, test coverage, and naming conventions."
}
```

And a `benchmark_seed` source descriptor:

```json
{
  "sourceId": "code-review-agent-seed-0",
  "sourceKind": "datasets",
  "inputKind": "benchmark_seed",
  "title": "Review accuracy seed",
  "accessPattern": "read-only",
  "rights": {
    "rights_to_store": true,
    "rights_to_train": false,
    "rights_to_benchmark": true,
    "rights_to_derive": true,
    "rights_to_distill": false,
    "rights_to_generate_synthetic_from": false,
    "retention_policy": "project-lifetime",
    "redaction_status": "clean",
    "pii_status": "none",
    "provenance_status": "verified",
    "data_zone": "dev"
  },
  "prompt": "Review this function for correctness and suggest improvements.",
  "taskFamilyId": "code-review",
  "passConditions": ["identifies the off-by-one error"],
  "hardFailConditions": ["suggests deleting the function"]
}
```

<Info>
The `data_zone` field must be `train` or `dev` for compilation sources. Sources with `data_zone` set to other values (such as `gold_eval`) or with `quarantined: true` will be rejected during compilation.
</Info>

Save each descriptor to a separate JSON file (for example, `source-text.json`, `source-seed.json`).

### Step 5: Compile

Compile the niche program and its sources into a domain pack:

```bash
openclaw niche compile \
  --niche-program-id code-review-agent \
  --source ./source-text.json \
  --source ./source-seed.json \
  --emit-manifests
```

The compile command:

1. Loads and validates each source descriptor against its `inputKind`-specific schema.
2. Normalizes sources, propagates rights, and checks that every source has `rights_to_store: true` and a valid compilation data zone (`train` or `dev`).
3. Compiles a domain pack from the normalized sources.
4. Builds a source access manifest with tool allowlists, retrieval indices, and network/sandbox policies.
5. Evaluates the readiness gate and generates a readiness report.
6. When `--emit-manifests` is passed, builds and stores baseline and candidate manifests for benchmarking.

The command outputs paths to the compilation record, source access manifest, readiness report, and (with `--emit-manifests`) both manifests.

You can override the provider, model, and API mode for manifests:

```bash
openclaw niche compile \
  --niche-program-id code-review-agent \
  --source ./source-text.json \
  --source ./source-seed.json \
  --emit-manifests \
  --provider anthropic \
  --model-id claude-sonnet-4-5-20250514 \
  --api-mode messages
```

### Step 6: Check readiness

After compilation, verify the readiness status:

```bash
openclaw niche readiness --niche-program-id code-review-agent
```

The readiness report has three possible statuses:

- **`ready`** -- No hard blockers or warnings. You can proceed to benchmarking.
- **`ready_with_warnings`** -- No hard blockers, but there are warnings (low source quality, low freshness, etc.). You can proceed but should address warnings.
- **`not_ready`** -- One or more hard blockers prevent specialization. See [Improving Readiness](/niche/guides/improving-readiness) for a remediation playbook.

Pass `--json` to get the full structured readiness report:

```bash
openclaw niche readiness --niche-program-id code-review-agent --json
```

### Step 7: Next steps

Once readiness is `ready` or `ready_with_warnings`:

1. **Run a benchmark** to compare candidate performance against the baseline. See [Running Your First Benchmark](/niche/guides/first-benchmark).
2. **Check status** at any time:
   ```bash
   openclaw niche status --niche-program-id code-review-agent
   ```
3. **See what to do next**:
   ```bash
   openclaw niche next --niche-program-id code-review-agent
   ```

If readiness is `not_ready`, consult the [Improving Readiness](/niche/guides/improving-readiness) guide for detailed remediation steps for each blocker code.

</Steps>
