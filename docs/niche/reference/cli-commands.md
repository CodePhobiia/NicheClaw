---
summary: "Complete CLI reference for all openclaw niche subcommands, organized by workflow stage, with syntax, flags, and usage examples."
read_when:
  - You need the exact flags or syntax for a NicheClaw CLI command
  - You are scripting or automating NicheClaw workflows
  - You want to understand what each niche subcommand does
title: "CLI Commands Reference"
---

# CLI Commands Reference

All NicheClaw commands are subcommands of `openclaw niche`. An alias `openclaw nicheclaw` is also available (prints help).

Every subcommand accepts `--json` to emit machine-readable JSON output.

## Table of Contents

- [Setup and Initialization](#setup-and-initialization)
  - [init](#init)
  - [create](#create)
  - [quickstart](#quickstart)
- [Compilation and Readiness](#compilation-and-readiness)
  - [compile](#compile)
  - [readiness](#readiness)
- [Run Preparation and Execution](#run-preparation-and-execution)
  - [prepare-run](#prepare-run)
  - [run](#run)
- [Benchmarking](#benchmarking)
  - [prepare-benchmark](#prepare-benchmark)
  - [benchmark](#benchmark)
- [Optimization](#optimization)
  - [optimize](#optimize)
- [Release](#release)
  - [prepare-release](#prepare-release)
  - [release](#release-1)
- [Inspection and Comparison](#inspection-and-comparison)
  - [inspect](#inspect)
  - [compare](#compare)
- [Lifecycle and Management](#lifecycle-and-management)
  - [list](#list)
  - [next](#next)
  - [pipeline](#pipeline)
  - [status](#status)
- [Import, Export, and Maintenance](#import-export-and-maintenance)
  - [export](#export)
  - [import](#import)
  - [gc](#gc)

---

## Setup and Initialization

### init

Initialize NicheClaw state roots and validate architecture anchors.

**Syntax:**

```
openclaw niche init [options]
```

**Flags:**

| Flag                            | Required | Default                       | Description                                                       |
| ------------------------------- | -------- | ----------------------------- | ----------------------------------------------------------------- |
| `--write-starter-program`       | No       | `false`                       | Write a starter niche program manifest to the programs directory. |
| `--starter-program-id <id>`     | No       | `repo-ci-specialist`          | Override the starter program identifier.                          |
| `--starter-program-name <name>` | No       | `Repo Terminal CI Specialist` | Override the starter program name.                                |
| `--json`                        | No       | `false`                       | Output JSON.                                                      |

**Prerequisites:** The repository root must contain `PRD.md` and `ARCHITECTURE.md` files that mention "NicheClaw" (case-insensitive).

**Example:**

```bash
openclaw niche init --write-starter-program
```

**Output:** State root path, ensured directories, anchor validation results, and starter program path (if written).

---

### create

Store a validated Niche program for later compile and release flows.

**Syntax:**

```
openclaw niche create --program <path> [options]
```

**Flags:**

| Flag               | Required | Default | Description                          |
| ------------------ | -------- | ------- | ------------------------------------ |
| `--program <path>` | Yes      | -       | Path to the Niche program JSON file. |
| `--json`           | No       | `false` | Output JSON.                         |

**Example:**

```bash
openclaw niche create --program ./niche-program.json
```

**Output:** Confirmation that the program was validated and stored.

---

### quickstart

Interactive guided setup for a new NicheClaw specialization.

**Syntax:**

```
openclaw niche quickstart [options]
```

**Flags:**

| Flag     | Required | Default | Description          |
| -------- | -------- | ------- | -------------------- |
| `--json` | No       | `false` | Output JSON summary. |

**Example:**

```bash
openclaw niche quickstart
```

**Output:** Interactive prompts that guide through niche program creation.

---

## Compilation and Readiness

### compile

Normalize source descriptors and persist the compiled domain-pack, source-access manifest, and readiness artifacts.

**Syntax:**

```
openclaw niche compile --niche-program-id <id> --source <path> [--source <path> ...] [options]
```

**Flags:**

| Flag                        | Required | Default        | Description                                          |
| --------------------------- | -------- | -------------- | ---------------------------------------------------- |
| `--niche-program-id <id>`   | Yes      | -              | Stored niche program identifier.                     |
| `--source <path>`           | Yes      | -              | Source descriptor JSON path. Repeatable.             |
| `--version <version>`       | No       | auto-generated | Domain-pack version override.                        |
| `--compiled-at <timestamp>` | No       | current time   | Compilation timestamp override (ISO 8601).           |
| `--emit-manifests`          | No       | `false`        | Also build and store baseline + candidate manifests. |
| `--provider <provider>`     | No       | -              | Provider override for emitted manifests.             |
| `--model-id <modelId>`      | No       | -              | Model ID override for emitted manifests.             |
| `--api-mode <apiMode>`      | No       | -              | API mode override for emitted manifests.             |
| `--json`                    | No       | `false`        | Output JSON.                                         |

**Example:**

```bash
openclaw niche compile \
  --niche-program-id repo-ci-specialist \
  --source ./sources/repo.json \
  --source ./sources/seeds.json \
  --emit-manifests \
  --json
```

**Output:** Compilation record ID, domain pack ID, source access manifest path, readiness report path, and optionally emitted manifest paths.

---

### readiness

Read the latest stored readiness report for a niche program.

**Syntax:**

```
openclaw niche readiness --niche-program-id <id> [options]
```

**Flags:**

| Flag                      | Required | Default | Description                      |
| ------------------------- | -------- | ------- | -------------------------------- |
| `--niche-program-id <id>` | Yes      | -       | Stored niche program identifier. |
| `--json`                  | No       | `false` | Output JSON.                     |

**Example:**

```bash
openclaw niche readiness --niche-program-id repo-ci-specialist
```

**Output:** Readiness status, dimension scores, hard blockers, warnings, and recommended next actions.

---

## Run Preparation and Execution

### prepare-run

Prepare a readiness-gated seeded-runtime Niche run seed from typed JSON inputs.

**Syntax:**

```
openclaw niche prepare-run --manifest-kind <kind> [options]
```

**Flags:**

| Flag                                | Required    | Default | Description                                                                         |
| ----------------------------------- | ----------- | ------- | ----------------------------------------------------------------------------------- |
| `--manifest-kind <kind>`            | Yes         | -       | `baseline` or `candidate`.                                                          |
| `--from-program <id>`               | No          | -       | Resolve manifest, domain-pack, and source-access paths from a stored niche program. |
| `--manifest <path>`                 | Conditional | -       | Path to baseline or candidate manifest JSON. Required unless `--from-program`.      |
| `--domain-pack <path>`              | Conditional | -       | Path to domain-pack JSON. Required unless `--from-program`.                         |
| `--source-access-manifest <path>`   | Conditional | -       | Path to source-access manifest JSON. Required unless `--from-program`.              |
| `--action-policy-runtime <path>`    | Yes         | -       | Path to the prepared action-policy runtime JSON.                                    |
| `--readiness-report <path>`         | No          | -       | Path to readiness report JSON.                                                      |
| `--verifier-pack-id <id>`           | Yes         | -       | Verifier pack identifier.                                                           |
| `--verifier-pack-version <version>` | Yes         | -       | Verifier pack config version.                                                       |
| `--mode <mode>`                     | Yes         | -       | Run mode: `baseline`, `candidate`, `shadow`, `benchmark`, or `live`.                |
| `--runtime-snapshot-id <id>`        | Yes         | -       | Runtime snapshot identifier.                                                        |
| `--context-bundle-id <id>`          | Yes         | -       | Context bundle identifier.                                                          |
| `--determinism-policy-id <id>`      | Yes         | -       | Determinism policy identifier.                                                      |
| `--random-seed <seed>`              | Yes         | -       | Random seed for determinism.                                                        |
| `--replayability-status <status>`   | Yes         | -       | `replayable`, `partially_replayable`, or `non_replayable`.                          |
| `--determinism-notes <text>`        | Yes         | -       | Determinism notes.                                                                  |
| `--planner-version-id <id>`         | No          | -       | Planner version override.                                                           |
| `--action-policy-version-id <id>`   | No          | -       | Action-policy version override.                                                     |
| `--verifier-pack-version-id <id>`   | No          | -       | Verifier-pack version override.                                                     |
| `--retrieval-stack-version-id <id>` | No          | -       | Retrieval stack version override.                                                   |
| `--grader-set-version-id <id>`      | No          | -       | Grader set version override.                                                        |
| `--artifact-ref <path>`             | No          | -       | Artifact ref JSON path. Repeatable.                                                 |
| `--evidence-bundle <path>`          | No          | -       | Evidence bundle ref JSON path. Repeatable.                                          |
| `--benchmark-suite-id <id>`         | No          | -       | Benchmark suite identifier.                                                         |
| `--benchmark-arm-id <id>`           | No          | -       | Benchmark arm identifier.                                                           |
| `--benchmark-case-kind <kind>`      | No          | -       | `atomic_case` or `episode_case`.                                                    |
| `--benchmark-case-id <id>`          | No          | -       | Benchmark case identifier.                                                          |
| `--suite-hash <hash>`               | No          | -       | Benchmark suite hash.                                                               |
| `--fixture-version <version>`       | No          | -       | Benchmark fixture version.                                                          |
| `--environment-snapshot <path>`     | No          | -       | Environment snapshot JSON path.                                                     |
| `--out <path>`                      | No          | -       | Write the prepared run seed JSON to a file.                                         |
| `--json`                            | No          | `false` | Print the prepared run seed JSON.                                                   |

**Example:**

```bash
openclaw niche prepare-run \
  --from-program repo-ci-specialist \
  --manifest-kind candidate \
  --action-policy-runtime ./action-policy-runtime.json \
  --verifier-pack-id verifier-pack-repo-ci \
  --verifier-pack-version 2026.3.12 \
  --mode benchmark \
  --runtime-snapshot-id runtime-snapshot-v1 \
  --context-bundle-id context-bundle-v1 \
  --determinism-policy-id determinism-v1 \
  --random-seed seed-1 \
  --replayability-status replayable \
  --determinism-notes "Frozen benchmark fixture." \
  --out ./prepared-seed.json
```

---

### run

Activate a readiness-gated seeded-runtime Niche run through the local trusted agent path.

**Syntax:**

```
openclaw niche run --seed <path> --message <text> [options]
```

**Flags:**

| Flag                          | Required | Default | Description                                           |
| ----------------------------- | -------- | ------- | ----------------------------------------------------- |
| `--seed <path>`               | Yes      | -       | Path to the prepared Niche run seed JSON.             |
| `--message <text>`            | Yes      | -       | Message body for the seeded agent run.                |
| `--agent <id>`                | No       | -       | Agent ID override.                                    |
| `--to <number>`               | No       | -       | Recipient number in E.164 for session key derivation. |
| `--session-id <id>`           | No       | -       | Explicit session ID.                                  |
| `--session-key <key>`         | No       | -       | Explicit session key.                                 |
| `--thinking <level>`          | No       | -       | Thinking level override.                              |
| `--thinking-once <level>`     | No       | -       | One-shot thinking level override.                     |
| `--verbose <on\|off>`         | No       | -       | Persist agent verbose level for the session.          |
| `--timeout <seconds>`         | No       | -       | Agent command timeout in seconds.                     |
| `--deliver`                   | No       | `false` | Send the agent reply to the selected channel.         |
| `--reply-to <target>`         | No       | -       | Delivery target override.                             |
| `--reply-channel <channel>`   | No       | -       | Delivery channel override.                            |
| `--reply-account-id <id>`     | No       | -       | Delivery account ID override.                         |
| `--thread-id <id>`            | No       | -       | Delivery thread/topic ID override.                    |
| `--message-channel <channel>` | No       | -       | Message channel context.                              |
| `--channel <channel>`         | No       | -       | Delivery channel.                                     |
| `--account-id <id>`           | No       | -       | Account ID for multi-account routing.                 |
| `--best-effort-deliver`       | No       | `false` | Do not throw when delivery fails.                     |
| `--json`                      | No       | `false` | Output result as JSON.                                |

**Example:**

```bash
openclaw niche run \
  --seed ./prepared-seed.json \
  --session-id session-123 \
  --message "Investigate the failing benchmark case" \
  --json
```

---

## Benchmarking

### prepare-benchmark

Auto-generate benchmark artifacts (manifests, suite, release inputs) from a compilation record.

**Syntax:**

```
openclaw niche prepare-benchmark --niche-program-id <id> [options]
```

**Flags:**

| Flag                          | Required | Default | Description                                                                              |
| ----------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------- |
| `--niche-program-id <id>`     | Yes      | -       | Stored niche program identifier.                                                         |
| `--provider <provider>`       | No       | -       | Provider override for manifests.                                                         |
| `--model-id <modelId>`        | No       | -       | Model ID override for manifests.                                                         |
| `--api-mode <apiMode>`        | No       | -       | API mode override for manifests.                                                         |
| `--suite-id <suiteId>`        | No       | -       | Benchmark suite ID override.                                                             |
| `--suite-version <version>`   | No       | -       | Benchmark suite version override.                                                        |
| `--fixture-version <version>` | No       | -       | Fixture version override.                                                                |
| `--emit-release-artifacts`    | No       | `false` | Also generate starter verifier metrics, monitor definition, and component artifact refs. |
| `--json`                      | No       | `false` | Output JSON.                                                                             |

**Example:**

```bash
openclaw niche prepare-benchmark \
  --niche-program-id repo-ci-specialist \
  --emit-release-artifacts \
  --json
```

**Output:** Paths to generated baseline manifest, candidate manifest, benchmark suite, and optionally release artifacts.

---

### benchmark

Run live or typed benchmark comparisons and persist benchmark result records.

**Syntax:**

```
openclaw niche benchmark --suite <path> [options]
```

**Flags:**

| Flag                                 | Required    | Default | Description                                                        |
| ------------------------------------ | ----------- | ------- | ------------------------------------------------------------------ |
| `--from-program <id>`                | No          | -       | Resolve manifest and readiness paths from a stored niche program.  |
| `--baseline-manifest <path>`         | Conditional | -       | Path to baseline manifest JSON. Required unless `--from-program`.  |
| `--candidate-manifest <path>`        | Conditional | -       | Path to candidate manifest JSON. Required unless `--from-program`. |
| `--suite <path>`                     | Yes         | -       | Path to benchmark suite JSON.                                      |
| `--baseline-execution <path>`        | No          | -       | Path to baseline typed execution bundle JSON.                      |
| `--candidate-execution <path>`       | No          | -       | Path to candidate typed execution bundle JSON.                     |
| `--live`                             | No          | `false` | Execute the benchmark through the real runtime path.               |
| `--readiness-report <path>`          | No          | -       | Path to readiness report JSON.                                     |
| `--bootstrap-seed <n>`               | No          | -       | Bootstrap seed for deterministic confidence intervals.             |
| `--contamination-detected`           | No          | `false` | Mark the benchmark input as contaminated.                          |
| `--actual-suite-hash <hash>`         | No          | -       | Actual suite hash observed at execution time.                      |
| `--actual-fixture-version <version>` | No          | -       | Actual fixture version at execution time.                          |
| `--actual-grader-version <id>`       | No          | -       | Actual grader version at execution time.                           |
| `--json`                             | No          | `false` | Output JSON.                                                       |

**Example:**

```bash
openclaw niche benchmark \
  --live \
  --from-program repo-ci-specialist \
  --suite ./benchmark-suite.json \
  --readiness-report ./readiness.json \
  --json
```

---

## Optimization

### optimize

Preview or execute typed optimization-plane job plans.

**Syntax:**

```
openclaw niche optimize --job-type <type> --niche-program-id <id> [options]
```

**Flags:**

| Flag                               | Required | Default | Description                                                                                 |
| ---------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------- |
| `--job-type <type>`                | Yes      | -       | `candidate_generation`, `teacher_rollout`, `verifier_refresh`, or `evaluation_preparation`. |
| `--niche-program-id <id>`          | Yes      | -       | Niche program identifier.                                                                   |
| `--readiness-report <path>`        | No       | -       | Path to readiness report JSON.                                                              |
| `--created-at <timestamp>`         | No       | -       | ISO timestamp for the job.                                                                  |
| `--reward-artifact-id <id>`        | No       | -       | Reward artifact ID. Repeatable.                                                             |
| `--promotion-eligible`             | No       | `false` | Apply promotion-eligible governance checks.                                                 |
| `--candidate-recipe <path>`        | No       | -       | Candidate recipe JSON path.                                                                 |
| `--candidate-recipe-ref <path>`    | No       | -       | Candidate recipe artifact ref JSON path.                                                    |
| `--teacher-rollout-request <path>` | No       | -       | Teacher rollout request JSON path.                                                          |
| `--verifier-pack-ref <path>`       | No       | -       | Verifier-pack artifact ref JSON path.                                                       |
| `--evaluation-input-ref <path>`    | No       | -       | Evaluation input artifact ref JSON path. Repeatable.                                        |
| `--candidate-artifact-ref <path>`  | No       | -       | Candidate artifact ref JSON path. Repeatable.                                               |
| `--benchmark-input-ref <path>`     | No       | -       | Benchmark input artifact ref JSON path. Repeatable.                                         |
| `--preview`                        | No       | `false` | Preview-only (default behavior).                                                            |
| `--execute`                        | No       | `false` | Execute the planned job.                                                                    |
| `--json`                           | No       | `false` | Output JSON.                                                                                |

**Example:**

```bash
openclaw niche optimize \
  --job-type candidate_generation \
  --niche-program-id repo-ci-specialist \
  --readiness-report ./readiness.json \
  --candidate-recipe ./candidate-recipe.json \
  --candidate-recipe-ref ./candidate-recipe-ref.json \
  --preview \
  --json
```

---

## Release

### prepare-release

Auto-generate release artifacts (verifier metrics, monitor definition, artifact refs) from benchmark results.

**Syntax:**

```
openclaw niche prepare-release --niche-program-id <id> [options]
```

**Flags:**

| Flag                           | Required | Default | Description                            |
| ------------------------------ | -------- | ------- | -------------------------------------- |
| `--niche-program-id <id>`      | Yes      | -       | Stored niche program identifier.       |
| `--benchmark-result <path>`    | No       | -       | Explicit benchmark result record path. |
| `--baseline-manifest-id <id>`  | No       | -       | Explicit baseline manifest ID.         |
| `--candidate-manifest-id <id>` | No       | -       | Explicit candidate manifest ID.        |
| `--json`                       | No       | `false` | Output JSON.                           |

**Example:**

```bash
openclaw niche prepare-release \
  --niche-program-id repo-ci-specialist \
  --json
```

---

### release

Evaluate release policy inputs and emit a typed promotion decision.

**Syntax:**

```
openclaw niche release --verifier-metrics <path> --monitor <path> --component-artifact-ref <path> [options]
```

**Flags:**

| Flag                              | Required    | Default | Description                                                                      |
| --------------------------------- | ----------- | ------- | -------------------------------------------------------------------------------- |
| `--from-program <id>`             | No          | -       | Resolve manifest, benchmark, and readiness paths from a stored niche program.    |
| `--baseline-manifest <path>`      | Conditional | -       | Path to baseline manifest JSON. Required unless `--from-program`.                |
| `--candidate-manifest <path>`     | Conditional | -       | Path to candidate manifest JSON. Required unless `--from-program`.               |
| `--benchmark-result <path>`       | Conditional | -       | Benchmark result record JSON path. Repeatable. Required unless `--from-program`. |
| `--shadow-result <path>`          | No          | -       | Shadow benchmark result JSON path. Repeatable.                                   |
| `--verifier-metrics <path>`       | Yes         | -       | Verifier metric summary JSON path.                                               |
| `--monitor <path>`                | Yes         | -       | Promoted monitor definition JSON path.                                           |
| `--readiness-report <path>`       | No          | -       | Path to readiness report JSON.                                                   |
| `--component-artifact-ref <path>` | Yes         | -       | Component artifact ref JSON path. Repeatable.                                    |
| `--approved-by <actor>`           | No          | -       | Approver identifier. Repeatable.                                                 |
| `--candidate-release-id <id>`     | No          | -       | Candidate release ID override.                                                   |
| `--baseline-release-id <id>`      | No          | -       | Baseline release ID override.                                                    |
| `--rollback-target <id>`          | No          | -       | Rollback target ID override.                                                     |
| `--latency-regression <delta>`    | No          | -       | Latency regression delta (fractional, non-negative).                             |
| `--cost-regression <delta>`       | No          | -       | Cost regression delta (fractional, non-negative).                                |
| `--monitor-observation <path>`    | No          | -       | Promoted monitor observation JSON path.                                          |
| `--json`                          | No          | `false` | Output JSON.                                                                     |

**Example:**

```bash
openclaw niche release \
  --from-program repo-ci-specialist \
  --verifier-metrics ./verifier-metrics.json \
  --monitor ./promoted-monitor.json \
  --component-artifact-ref ./release-bundle-ref.json \
  --json
```

---

## Inspection and Comparison

### inspect

Inspect a niche manifest, recipe, artifact, or promoted monitor in a typed read-only view.

**Syntax:**

```
openclaw niche inspect --kind <kind> --file <path> [options]
```

**Flags:**

| Flag            | Required | Default | Description                       |
| --------------- | -------- | ------- | --------------------------------- |
| `--kind <kind>` | Yes      | -       | Inspect kind (see values below).  |
| `--file <path>` | Yes      | -       | Path to the JSON file to inspect. |
| `--json`        | No       | `false` | Output JSON.                      |

**Inspect kinds:** `baseline_manifest`, `candidate_manifest`, `source_access_manifest`, `candidate_recipe`, `artifact`, `promoted_monitor`

**Example:**

```bash
openclaw niche inspect --kind candidate_manifest --file ./candidate.json
```

**Output:** Kind, file path, and a typed summary of key fields.

---

### compare

Read-only comparison of baseline and candidate niche manifests plus governance inputs.

**Syntax:**

```
openclaw niche compare --baseline-manifest <path> --candidate-manifest <path> [options]
```

**Flags:**

| Flag                           | Required | Default | Description                                          |
| ------------------------------ | -------- | ------- | ---------------------------------------------------- |
| `--baseline-manifest <path>`   | Yes      | -       | Path to baseline manifest JSON.                      |
| `--candidate-manifest <path>`  | Yes      | -       | Path to candidate manifest JSON.                     |
| `--suite <path>`               | No       | -       | Benchmark suite JSON path for hash/fixture metadata. |
| `--benchmark-result <path>`    | No       | -       | Benchmark result JSON path. Repeatable.              |
| `--shadow-result <path>`       | No       | -       | Shadow result JSON path. Repeatable.                 |
| `--verifier-metrics <path>`    | No       | -       | Verifier metric summary JSON path.                   |
| `--monitor <path>`             | No       | -       | Promoted monitor definition JSON path.               |
| `--latency-regression <delta>` | No       | -       | Latency regression delta.                            |
| `--cost-regression <delta>`    | No       | -       | Cost regression delta.                               |
| `--json`                       | No       | `false` | Output JSON.                                         |

**Example:**

```bash
openclaw niche compare \
  --baseline-manifest ./baseline.json \
  --candidate-manifest ./candidate.json \
  --suite ./suite.json \
  --benchmark-result ./benchmark-summary.json
```

**Output:** Manifest comparison issues, governance checks, and delta summaries.

---

## Lifecycle and Management

### list

List all stored niche programs with their workflow stage.

**Syntax:**

```
openclaw niche list [options]
```

**Flags:**

| Flag     | Required | Default | Description  |
| -------- | -------- | ------- | ------------ |
| `--json` | No       | `false` | Output JSON. |

**Example:**

```bash
openclaw niche list --json
```

---

### next

Show the next action and command for a niche program.

**Syntax:**

```
openclaw niche next --niche-program-id <id> [options]
```

**Flags:**

| Flag                      | Required | Default | Description               |
| ------------------------- | -------- | ------- | ------------------------- |
| `--niche-program-id <id>` | Yes      | -       | Niche program identifier. |
| `--json`                  | No       | `false` | Output JSON.              |

**Example:**

```bash
openclaw niche next --niche-program-id repo-ci-specialist
```

**Output:** The next workflow stage and the command to run.

---

### pipeline

Run multiple niche stages in sequence with automatic artifact bridging.

**Syntax:**

```
openclaw niche pipeline --niche-program-id <id> [options]
```

**Flags:**

| Flag                      | Required | Default | Description                                                          |
| ------------------------- | -------- | ------- | -------------------------------------------------------------------- |
| `--niche-program-id <id>` | Yes      | -       | Niche program identifier.                                            |
| `--from <stage>`          | No       | -       | Start stage: `compile`, `readiness`, or `prepare-benchmark`.         |
| `--to <stage>`            | No       | -       | End stage: `compile`, `readiness`, or `prepare-benchmark`.           |
| `--source <path>`         | No       | -       | Source descriptor JSON path. Repeatable. Required for compile stage. |
| `--force`                 | No       | `false` | Re-run already-completed stages.                                     |
| `--json`                  | No       | `false` | Output JSON.                                                         |

**Example:**

```bash
openclaw niche pipeline \
  --niche-program-id repo-ci-specialist \
  --from compile \
  --to prepare-benchmark \
  --source ./sources/repo.json \
  --source ./sources/seeds.json
```

---

### status

Show a dashboard of all niche programs and their lifecycle state.

**Syntax:**

```
openclaw niche status [options]
```

**Flags:**

| Flag                      | Required | Default | Description                       |
| ------------------------- | -------- | ------- | --------------------------------- |
| `--niche-program-id <id>` | No       | -       | Filter to a single niche program. |
| `--json`                  | No       | `false` | Output JSON.                      |

**Example:**

```bash
openclaw niche status --json
```

---

## Import, Export, and Maintenance

### export

Export niche programs and artifacts as a portable bundle.

**Syntax:**

```
openclaw niche export --niche-program-id <id> --out <path> [options]
```

**Flags:**

| Flag                      | Required | Default | Description                             |
| ------------------------- | -------- | ------- | --------------------------------------- |
| `--niche-program-id <id>` | Yes      | -       | Niche program ID to export. Repeatable. |
| `--out <path>`            | Yes      | -       | Output directory for the export bundle. |
| `--json`                  | No       | `false` | Output JSON.                            |

**Example:**

```bash
openclaw niche export \
  --niche-program-id repo-ci-specialist \
  --out ./export-bundle
```

---

### import

Import niche programs and artifacts from a portable bundle.

**Syntax:**

```
openclaw niche import --bundle <path> [options]
```

**Flags:**

| Flag              | Required | Default | Description                                     |
| ----------------- | -------- | ------- | ----------------------------------------------- |
| `--bundle <path>` | Yes      | -       | Path to the export bundle directory.            |
| `--dry-run`       | No       | `false` | Preview what would be imported without writing. |
| `--force`         | No       | `false` | Overwrite existing artifacts on conflict.       |
| `--json`          | No       | `false` | Output JSON.                                    |

**Example:**

```bash
openclaw niche import --bundle ./export-bundle --dry-run
```

---

### gc

Garbage collect unreferenced niche artifacts.

**Syntax:**

```
openclaw niche gc [options]
```

**Flags:**

| Flag              | Required | Default | Description                                   |
| ----------------- | -------- | ------- | --------------------------------------------- |
| `--execute`       | No       | `false` | Actually delete files. Default is dry-run.    |
| `--keep-last <n>` | No       | `3`     | Keep the last N versions per artifact type.   |
| `--keep-days <n>` | No       | `30`    | Keep anything created within the last N days. |
| `--json`          | No       | `false` | Output JSON.                                  |

**Example:**

```bash
# Dry run first
openclaw niche gc --json

# Then execute
openclaw niche gc --execute --keep-last 5 --keep-days 14
```
