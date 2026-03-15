# Workflow Coherence Remediation Plan

## Summary of Current State (Score: 52/100)

After thorough exploration of the codebase, I can confirm the following architecture:

**What works:**

- 12 CLI commands registered in `src/cli/program/register.niche.ts`: init, create, compile, readiness, prepare-run, run, benchmark, optimize, release, inspect, compare, quickstart
- Each command accepts typed JSON inputs and produces typed JSON outputs
- A shared store layer (`src/niche/store/`) with separate stores for programs, compilation records, manifests, readiness reports, benchmark results, and active stacks
- Path resolution via `src/niche/store/paths.ts` with deterministic layout under `~/.openclaw/niche/`
- The `quickstart` command already proves the concept of multi-stage chaining (create + compile + manifest generation in one flow)
- Store functions like `getLatestNicheCompilationRecordForProgram`, `getReadinessReportForProgram`, `listBenchmarkResultRecords` already support querying by program ID

**What is missing:**

1. No command resolves artifacts from the store by program ID -- every command requires explicit file paths
2. No workflow state tracking (which stage has a program completed?)
3. Quickstart prints "Next Steps" but the suggested commands require artifacts the operator must manually locate
4. No pipeline/orchestration command
5. No `niche status` or `niche next` command
6. No progress reporting during long operations (benchmark, optimize)
7. Error messages are technical, not workflow-aware

---

## Detailed Work Items

### WC-01: Artifact Resolution Layer -- `--from-program` Flag Infrastructure

**Goal:** Enable all downstream commands to automatically resolve their required artifacts from the store using only the niche program ID, eliminating the need for operators to provide explicit file paths.

**Rationale:** The store already has `getLatestNicheCompilationRecordForProgram`, `getReadinessReportForProgram`, and `listBaselineManifests`/`listCandidateManifests`. What is missing is a unified resolution layer that each command can call.

**Files to create:**

- `src/niche/store/artifact-resolution.ts` -- Central module that resolves all artifacts for a given program ID

**Functions to implement:**

```
resolveCompilationArtifacts(nicheProgramId, env) -> {
  compilationRecord, compilationRecordPath,
  sourceAccessManifest, sourceAccessManifestPath,
  readinessReport, readinessReportPath,
  domainPack, domainPackPath
}

resolveManifestArtifacts(nicheProgramId, env) -> {
  baselineManifest, baselineManifestPath,
  candidateManifest, candidateManifestPath
}

resolveBenchmarkArtifacts(nicheProgramId, env) -> {
  benchmarkResultRecords[], benchmarkResultRecordPaths[]
}

resolveProgramWorkflowState(nicheProgramId, env) -> {
  program, hasCompilation, hasReadiness, hasManifests,
  hasBenchmarks, hasRelease, currentStage
}
```

**Logic:** Each function queries existing store functions. `resolveManifestArtifacts` filters `listBaselineManifests`/`listCandidateManifests` by `niche_program_id` field and picks the most recent. `resolveBenchmarkArtifacts` uses `listBenchmarkResultRecords({ candidateManifestId })`. The resolution functions throw descriptive errors when artifacts are missing, suggesting the command needed to produce them.

**Test file:** `test/niche/store/artifact-resolution.test.ts`

**Dependencies:** None (uses only existing store functions).

---

### WC-02: Add `--from-program` Flag to `benchmark` Command

**Goal:** Allow `openclaw niche benchmark --from-program <id> --suite <path> --live --json` to automatically resolve baseline manifest, candidate manifest, and readiness report from the store.

**Files to modify:**

- `src/commands/niche/benchmark.ts` -- Add optional `nicheProgramId` field to `NicheBenchmarkOptions`. When present and `baselineManifestPath`/`candidateManifestPath` are not provided, call `resolveManifestArtifacts(nicheProgramId)` and `resolveCompilationArtifacts(nicheProgramId)` to populate them.
- `src/cli/program/register.niche.ts` -- Add `--from-program <id>` option to the `benchmark` subcommand. Wire it through so it takes precedence only when explicit manifest paths are absent.

**Behavior:**

- If `--from-program` is given and `--baseline-manifest`/`--candidate-manifest` are absent, resolve from store
- If `--from-program` is given and explicit paths are also given, explicit paths win (no silent override)
- If `--from-program` is given and `--readiness-report` is absent, resolve readiness from store
- Error messages from resolution layer guide operator to the prerequisite command

**Test file:** `test/niche/commands/benchmark-from-program.test.ts`

**Dependencies:** WC-01

---

### WC-03: Add `--from-program` Flag to `release` Command

**Goal:** Allow `openclaw niche release --from-program <id> --verifier-metrics <path> --monitor <path> --component-artifact-ref <path> --json` to auto-resolve manifests, benchmark results, and readiness from the store.

**Files to modify:**

- `src/commands/niche/release.ts` -- Add optional `nicheProgramId` to `NicheReleaseOptions`. When present, resolve `baselineManifestPath`, `candidateManifestPath`, and `benchmarkResultPaths` from the store. The `verifierMetricsPath`, `monitorDefinitionPath`, and `componentArtifactRefPaths` remain required since they are not stored by the benchmark stage.
- `src/cli/program/register.niche.ts` -- Add `--from-program <id>` option to the `release` subcommand.

**Behavior:**

- Same precedence rules as WC-02 (explicit paths override resolution)
- `benchmarkResultPaths` resolved via `resolveBenchmarkArtifacts` using the candidate manifest ID from the resolved manifests
- Error messages guide the operator to run `benchmark` first if no results exist

**Test file:** `test/niche/commands/release-from-program.test.ts`

**Dependencies:** WC-01

---

### WC-04: Add `--from-program` Flag to `prepare-run` Command

**Goal:** Reduce the 20+ required flags on `prepare-run` to a handful when working from stored artifacts.

**Files to modify:**

- `src/commands/niche/prepare-run.ts` -- Add optional `nicheProgramId` to `NichePrepareRunOptions`. When present and key paths are absent, resolve `manifestPath`, `domainPackPath`, `sourceAccessManifestPath`, and `readinessReportPath` from `resolveCompilationArtifacts`. The operator still must provide `actionPolicyRuntimePath` and runtime-specific parameters.
- `src/cli/program/register.niche.ts` -- Add `--from-program <id>` option to the `prepare-run` subcommand.

**Behavior:**

- Resolves from latest compilation record for the program
- `manifest` resolved from latest candidate manifest
- `domain-pack` resolved from compilation record's `domain_pack`
- `source-access-manifest` resolved from compilation record's `source_access_manifest`
- `readiness-report` resolved from readiness store

**Test file:** `test/niche/commands/prepare-run-from-program.test.ts`

**Dependencies:** WC-01

---

### WC-05: Workflow Status Command -- `niche status`

**Goal:** Add `openclaw niche status --niche-program-id <id>` that displays the current workflow stage and all stored artifacts for a program.

**Files to create:**

- `src/commands/niche/status.ts` -- New command module

**Type:**

```typescript
type NicheStatusResult = {
  niche_program_id: string;
  stages: {
    create: { completed: boolean; path?: string };
    compile: { completed: boolean; compilation_id?: string; path?: string };
    readiness: { completed: boolean; status?: ReadinessStatus; path?: string };
    manifests: { completed: boolean; baseline_path?: string; candidate_path?: string };
    benchmark: { completed: boolean; result_count: number; paths?: string[] };
    release: { completed: boolean };
    active_stack: { active: boolean; stack_id?: string };
  };
  current_stage: string;
  next_action: string;
  next_command: string;
};
```

**Logic:** Call `resolveProgramWorkflowState` from WC-01. For human output, render a checklist with checkmarks/crosses for each stage. For `--json`, return the structured result.

**Files to modify:**

- `src/cli/program/register.niche.ts` -- Register the `status` subcommand.

**Test file:** `test/niche/commands/status.test.ts`

**Dependencies:** WC-01

---

### WC-06: Next Action Advisor -- `niche next`

**Goal:** Add `openclaw niche next --niche-program-id <id>` that tells the operator exactly what command to run next, with the full command string including resolved artifact paths.

**Files to create:**

- `src/commands/niche/next.ts` -- New command module

**Logic:**

1. Call `resolveProgramWorkflowState` from WC-01
2. Determine the next incomplete stage
3. Generate a complete, copy-pasteable command string:
   - If no compilation: suggest `openclaw niche compile --niche-program-id <id> --source <...>`
   - If compilation but no readiness pass: suggest checking blockers and recompiling
   - If ready but no manifests: suggest using quickstart or manual manifest creation
   - If manifests but no benchmark: generate `openclaw niche benchmark --from-program <id> --suite <suite-path> --live --json`
   - If benchmark but no release: generate `openclaw niche release --from-program <id> --verifier-metrics <...> --monitor <...> --component-artifact-ref <...> --json`
   - If released: suggest `openclaw niche run --seed <...> --message <...>`

**Human output:** Uses `@clack/prompts` note() to display the suggestion prominently.

**Files to modify:**

- `src/cli/program/register.niche.ts` -- Register the `next` subcommand.

**Test file:** `test/niche/commands/next.test.ts`

**Dependencies:** WC-01, WC-05

---

### WC-07: Pipeline Orchestration Command -- `niche pipeline`

**Goal:** Add `openclaw niche pipeline --niche-program-id <id> --from compile --to benchmark --suite <path> --json` that runs multiple stages in sequence, bridging artifacts automatically.

**Files to create:**

- `src/commands/niche/pipeline.ts` -- New command module

**Stages enum:** `create | compile | readiness | benchmark | release`

**Logic:**

1. Parse `--from` and `--to` to determine the stage range
2. For each stage in range:
   a. Check if already completed (skip with note, or force with `--force`)
   b. Resolve inputs from store (using WC-01 resolution layer)
   c. Call the underlying command function directly (e.g., `nicheCompileCommand`, `nicheBenchmarkCommand`)
   d. Report progress using `createCliProgress` from `src/cli/progress.ts`
3. Output a combined result with per-stage outcomes

**Options:**

- `--niche-program-id <id>` (required)
- `--from <stage>` (default: first incomplete stage)
- `--to <stage>` (default: end of pipeline)
- `--suite <path>` (required if benchmark is in range)
- `--source <path>` (repeatable, required if compile is in range)
- `--force` (re-run already-completed stages)
- `--json`

**Files to modify:**

- `src/cli/program/register.niche.ts` -- Register the `pipeline` subcommand.

**Test file:** `test/niche/commands/pipeline.test.ts`

**Dependencies:** WC-01, WC-02, WC-03

---

### WC-08: Quickstart Continuation -- Auto-Bridge to Benchmark

**Goal:** After quickstart completes, instead of printing opaque "Next Steps" with placeholder paths, print the exact resolved command with actual artifact paths and offer to continue to benchmark if a suite is available.

**Files to modify:**

- `src/commands/niche/quickstart.ts` -- Replace the current `note()` "Next Steps" block (lines 441-457) with:
  1. Print the exact `openclaw niche benchmark --from-program <id> --suite <path> --live --json` command
  2. Print the exact `openclaw niche status --niche-program-id <id>` command
  3. Print the exact `openclaw niche next --niche-program-id <id>` command
  4. Use the actual artifact paths from `QuickstartResult` in the suggested commands

**Current problem (lines 443-456):** The quickstart prints:

```
openclaw niche benchmark --live \
  --baseline-manifest ${result.baseline_manifest_path} \
  --candidate-manifest ${result.candidate_manifest_path} \
  --suite <suite.json> --json
```

The operator must still hand-construct a `<suite.json>`. With `--from-program`, the manifests can be auto-resolved.

**Test file:** Update `test/niche/commands/create-compile-readiness.test.ts` with quickstart continuation assertions.

**Dependencies:** WC-02, WC-05, WC-06

---

### WC-09: Progress Indicators for Long-Running Operations

**Goal:** Add progress reporting to benchmark and optimize commands using the existing `src/cli/progress.ts` infrastructure.

**Files to modify:**

- `src/commands/niche/benchmark.ts` -- Wrap the `runLiveAtomicBenchmark`/`runLiveEpisodeBenchmark` calls with `withProgress` from `src/cli/progress.ts`. The progress label should show "Running benchmark..." and tick per case completion.
- `src/commands/niche/optimize.ts` -- Wrap the `executeCandidateGeneration` call with `withProgress`.
- `src/commands/niche/pipeline.ts` (from WC-07) -- Use `withProgressTotals` showing "Pipeline stage N/M: <stage name>"

**Pattern:** Use the existing `createCliProgress` which supports both OSC progress bars and `@clack/prompts` spinner fallback. The progress reporter should be passed through to the benchmark/optimize internals.

**Benchmark progress specifics:**

- `total` = number of suite cases
- `tick()` after each case execution completes
- Label: `"Benchmarking case {current}/{total}"`

**Dependencies:** WC-07 (for pipeline progress), standalone for benchmark/optimize

---

### WC-10: Workflow-Aware Error Messages

**Goal:** When a command fails because a prerequisite artifact is missing, the error message should include the exact command to run to produce that artifact.

**Files to modify:**

- `src/niche/store/artifact-resolution.ts` (from WC-01) -- Each resolution function already needs to throw descriptive errors. These errors should follow a standard format:

```
Missing <artifact-type> for niche program "<id>".
Run: openclaw niche <command> --niche-program-id <id> [--additional-flags]
```

- `src/niche/domain/readiness-enforcement.ts` -- Modify error messages to include the `openclaw niche compile` command suggestion when readiness reports are missing (currently says "Pass --readiness-report first." which is not actionable).
- `src/commands/niche/compile.ts` -- Modify error at line 85 from "Run openclaw niche create first." to include the full command string.
- `src/commands/niche/readiness.ts` -- Modify error at line 38 from "Run openclaw niche compile first." to include the full command string.

**Pattern:** Create a helper function `buildWorkflowErrorMessage(opts: { missing: string; command: string; flags: string[] }): string` in `src/niche/store/artifact-resolution.ts` that standardizes the error format.

**Test file:** `test/niche/store/artifact-resolution.test.ts` (extend from WC-01)

**Dependencies:** WC-01

---

### WC-11: `niche list` Command for Program Discovery

**Goal:** Add `openclaw niche list` that shows all stored niche programs with their current workflow stage, so operators can discover their program IDs without remembering them.

**Files to create:**

- `src/commands/niche/list.ts` -- New command module

**Logic:**

1. Call `listNichePrograms(env)` from the program store
2. For each program, call `resolveProgramWorkflowState` to get stage info
3. Output as table (human) or JSON array

**Human output format:**

```
Program ID          Stage           Readiness    Benchmarks
repo-ci-specialist  benchmark       ready        2
my-assistant        compile         not_ready    0
```

Uses `src/terminal/table.ts` for formatting.

**Files to modify:**

- `src/cli/program/register.niche.ts` -- Register the `list` subcommand.

**Test file:** `test/niche/commands/list.test.ts`

**Dependencies:** WC-01

---

## Implementation Sequence

**Phase 1 -- Foundation (Sequential, shared infrastructure):**

1. **WC-01** -- Artifact resolution layer (everything depends on this)
2. **WC-10** -- Workflow-aware error messages (improves all commands immediately)

**Phase 2 -- Command Extensions (Parallel, isolated files):** 3. **WC-02** -- `--from-program` on benchmark 4. **WC-03** -- `--from-program` on release 5. **WC-04** -- `--from-program` on prepare-run 6. **WC-05** -- `niche status` command 7. **WC-11** -- `niche list` command

**Phase 3 -- Orchestration (Sequential, depends on Phase 2):** 8. **WC-06** -- `niche next` command 9. **WC-07** -- `niche pipeline` command 10. **WC-08** -- Quickstart continuation 11. **WC-09** -- Progress indicators

---

## Score Impact Analysis

| Gap                                 | Items                      | Points                    |
| ----------------------------------- | -------------------------- | ------------------------- |
| No artifact bridging between stages | WC-01, WC-02, WC-03, WC-04 | +15                       |
| No pipeline/workflow command        | WC-07                      | +10                       |
| Quickstart drops operator           | WC-08                      | +5                        |
| No state tracking between stages    | WC-01, WC-05               | +5                        |
| No progress/status indicators       | WC-09                      | +3                        |
| No `niche next` command             | WC-06                      | +3                        |
| No artifact path resolution helpers | WC-01                      | +3 (shared with bridging) |
| Error messages not workflow-aware   | WC-10                      | +2                        |
| No program discovery                | WC-11                      | +2                        |
| **Total**                           |                            | **+48 (52 -> 100)**       |

---

### Critical Files for Implementation

- `src/niche/store/artifact-resolution.ts` - New file: central artifact resolution layer that all `--from-program` features and status/next/pipeline commands depend on
- `src/niche/store/paths.ts` - Existing path resolution infrastructure; artifact-resolution builds on top of these helpers
- `src/cli/program/register.niche.ts` - CLI registration hub where all new subcommands (status, next, list, pipeline) and new flags (`--from-program`) are wired
- `src/commands/niche/benchmark.ts` - Primary command to extend with `--from-program` and progress reporting; pattern for WC-03 and WC-04
- `src/niche/store/index.ts` - Store barrel export; must be extended to export new resolution functions from artifact-resolution.ts
