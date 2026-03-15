# Core Journey Remediation Plan (68 -> 100)

## Current Score: 68/100

## Target Score: 100/100

Based on thorough analysis of the NicheClaw codebase, the six gaps preventing a perfect score on the Core Journey dimension are each precisely identified below with detailed remediation items. The plan is ordered by dependency chain and criticality.

---

## Gap Analysis

**What works (contributing to the 68):**

- All 12 CLI commands (`init`, `create`, `compile`, `readiness`, `quickstart`, `prepare-run`, `run`, `benchmark`, `optimize`, `release`, `inspect`, `compare`) are registered and functional in `src/cli/program/register.niche.ts`.
- All 11 runtime seams (planner injection, tool ranking, constraint enforcement, observation processing, verifier gate, run trace capture/persistence, action mediation, repair guidance, active stack resolution, lifecycle events) are wired into `src/auto-reply/reply/agent-runner.ts` and related modules.
- The E2E test (`test/niche/e2e/full-pipeline.test.ts`) exercises create -> compile -> readiness -> benchmark -> release -> promote -> monitor -> rollback with synthetic data.
- 333/335 tests pass.

**What is broken or missing (the 32-point gap):**

1. **Inter-stage artifact assembly is entirely manual.** After `compile`, the operator must hand-author `BaselineManifest`, `CandidateManifest`, benchmark suite JSON, verifier metrics JSON, monitor definition JSON, and component artifact refs JSON before they can call `benchmark` or `release`. No bridge commands exist to generate these from compilation output. The `quickstart` command does build manifests, but the standard CLI path (`create` -> `compile` -> `benchmark` -> `release`) does not.

2. **No real pilot niche has completed the full loop.** The repo-ci pilot (`src/niche/pilots/repo-ci/`) provides seed domain packs and benchmark suites as data builders, but no integration test or script actually runs the full CLI-driven pipeline from `create` through `run` with real (or even realistic mocked) agent execution.

3. **Quickstart outputs "not_ready" with no remediation guidance.** The `quickstart` command (`src/commands/niche/quickstart.ts`) displays `Readiness status: not_ready` and then suggests `niche benchmark` and `niche release` as "Next Steps" -- which will both fail because the readiness gate blocks them. No actionable guidance is printed about how to fix the blockers.

4. **No `niche prepare-benchmark` bridge command.** Going from compilation output to a runnable benchmark requires the operator to manually construct baseline/candidate manifests, a benchmark suite JSON, and optionally verifier/monitor artifacts. The `buildStarterManifests` function exists in `src/niche/domain/manifest-builder.ts` but is only called from `quickstart`, not exposed as a standalone CLI command.

5. **No manifest auto-generation from compilation output in the standard path.** `snapshotUnspecializedBaseline` (`src/niche/domain/baseline-snapshot.ts`) and `buildStarterManifests` (`src/niche/domain/manifest-builder.ts`) exist as library functions but are never surfaced in the standard `compile` -> `benchmark` CLI path.

6. **No canary/shadow traffic splitting.** The `ActiveNicheStackRecord.release_mode` supports `"shadow"`, `"canary"`, `"live"`, and `"rolled_back"` (defined in `src/niche/schema/activation.ts`), and the `actuateReleaseDecision` function in `src/niche/release/release-controller.ts` correctly maps promotion decisions to release modes. However, the runtime in `src/niche/runtime/active-stack.ts` (`materializePreparedSeedForRuntime`) treats `"shadow"` as `mode: "shadow"` (no user-visible output) but does not actually implement traffic splitting or dual-execution. The `"canary"` mode is mapped but has no fraction-based routing -- it behaves identically to `"live"`.

---

## Remediation Items

### CJ-01: Add `niche prepare-benchmark` bridge command

- **Problem:** After running `niche compile`, the operator must hand-author 5-7 JSON files (baseline manifest, candidate manifest, benchmark suite, verifier metrics, monitor definition, component artifact refs) before they can invoke `niche benchmark`. This manual assembly is error-prone and blocks the core journey.

- **Solution:** Create a new `niche prepare-benchmark` CLI command that reads a compilation record (by niche-program-id or path) and the niche program, then auto-generates all artifacts needed for the benchmark stage:
  1. Calls `snapshotUnspecializedBaseline()` to produce the `BaselineManifest`.
  2. Calls `buildStarterManifests()` to produce the `CandidateManifest`.
  3. Uses the pilot suite builder pattern from `src/niche/pilots/repo-ci/seed-benchmark-suite.ts` to generate a benchmark suite from the `benchmark_seed_hints` and `task_taxonomy` in the compilation record's domain pack.
  4. Writes all generated artifacts to store and outputs their paths.
  5. Optionally generates a starter verifier metrics JSON, monitor definition JSON, and component artifact ref JSON that can be used directly with `niche release`.

- **Files to create/modify:**
  - `src/commands/niche/prepare-benchmark.ts` (new command)
  - `src/niche/domain/benchmark-suite-builder.ts` (new: builds suite from domain pack seed hints)
  - `src/niche/domain/release-artifact-builder.ts` (new: builds starter verifier metrics, monitor definition, component artifact refs from compilation)
  - `src/cli/program/register.niche.ts` (add the new subcommand registration)
  - `src/niche/domain/index.ts` (export new functions)
  - `test/niche/commands/prepare-benchmark.test.ts` (new test)

- **Acceptance Criteria:**
  - `openclaw niche prepare-benchmark --niche-program-id <id> --json` succeeds when a stored compilation record exists.
  - Output includes paths to baseline manifest, candidate manifest, benchmark suite, and starter release artifacts.
  - `openclaw niche benchmark --live --baseline-manifest <output-baseline> --candidate-manifest <output-candidate> --suite <output-suite>` can be invoked directly using the output paths without any manual JSON authoring.
  - Test coverage for the new command and its constituent builders.

- **Effort:** L

- **Dependencies:** None (foundational bridge).

---

### CJ-02: Add `niche prepare-release` bridge command

- **Problem:** After running `niche benchmark`, the operator must manually assemble verifier metrics, a monitor definition, and component artifact refs before invoking `niche release`. These artifacts have strict schema requirements and binding constraints that are difficult to author correctly.

- **Solution:** Create a `niche prepare-release` command that reads the benchmark result record (by path or by querying the store for the latest result for a niche program) and the compilation record, then generates all artifacts needed for the release stage:
  1. Builds a verifier metrics summary from the benchmark result's verifier decisions.
  2. Builds a promoted monitor definition using sensible defaults from the release policy thresholds.
  3. Extracts component artifact refs from the compilation record's `compiled_domain_pack_artifact_ref` and `source_artifact_refs`.
  4. Writes all generated artifacts to store and outputs their paths.

- **Files to create/modify:**
  - `src/commands/niche/prepare-release.ts` (new command)
  - `src/niche/release/release-input-builder.ts` (new: builds verifier metrics, monitor def, artifact refs from benchmark results + compilation)
  - `src/cli/program/register.niche.ts` (add the new subcommand)
  - `test/niche/commands/prepare-release.test.ts` (new test)

- **Acceptance Criteria:**
  - `openclaw niche prepare-release --niche-program-id <id> --benchmark-result <path> --json` succeeds.
  - Output paths can be passed directly to `openclaw niche release` without manual JSON assembly.
  - The generated monitor definition correctly binds to the baseline and candidate manifest IDs from the benchmark result.
  - Test coverage for the new command.

- **Effort:** M

- **Dependencies:** CJ-01 (prepare-benchmark generates the benchmark inputs that produce benchmark results).

---

### CJ-03: Enrich quickstart with actionable readiness guidance

- **Problem:** The `quickstart` command outputs `Readiness status: not_ready` but then prints "Next Steps" that tell the operator to run `niche benchmark` and `niche release`, which will fail because the readiness gate blocks both. The operator has no idea how to fix the hard blockers or warnings.

- **Solution:** Modify the quickstart output to:
  1. When readiness is `not_ready`, print the specific hard blockers (already present in `compiled.compilation.readiness_report.hard_blockers`) with human-readable remediation instructions per blocker code.
  2. Print the dimension scores so the operator sees which dimensions are low.
  3. Replace the generic "Next Steps" with targeted remediation steps: e.g., "Add more source kinds to boost source_coverage above 30" or "Add at least 2 benchmark_seed sources to boost benchmarkability above 50."
  4. When readiness is `ready` or `ready_with_warnings`, print the prepare-benchmark and prepare-release bridge commands (from CJ-01/CJ-02) instead of raw `benchmark`/`release` commands with placeholder arguments.

- **Files to create/modify:**
  - `src/commands/niche/quickstart.ts` (modify the summary/next-steps formatting)
  - `src/niche/domain/readiness-guidance.ts` (new: maps blocker codes and dimension scores to human-readable remediation text)
  - `src/commands/niche/readiness.ts` (also display remediation guidance when `--verbose` or when hard blockers exist)
  - `test/niche/commands/quickstart-readiness-guidance.test.ts` (new test)

- **Acceptance Criteria:**
  - When quickstart produces a `not_ready` readiness report, the output includes each hard blocker code, the dimension score, and a specific remediation instruction.
  - The "Next Steps" section reflects the actual readiness state (remediation steps for not_ready, bridge commands for ready).
  - `niche readiness --niche-program-id <id>` also prints remediation guidance for each hard blocker.
  - Tests verify that each hard blocker code maps to a non-empty remediation message.

- **Effort:** M

- **Dependencies:** CJ-01 (so the "ready" path can reference the bridge commands).

---

### CJ-04: Implement canary/shadow traffic splitting in the runtime

- **Problem:** The PRD (`NICHECLAW_PRD_V3.md` section 14 and `NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md` section 2.1) specifies `live_shadow` and `live_canary` benchmark modes. The schema supports `"shadow"`, `"canary"`, `"live"`, and `"rolled_back"` release modes. However, the runtime in `resolveActiveNicheStackForRun` (`src/niche/runtime/active-stack.ts`) does not implement actual traffic splitting:
  - `"shadow"` mode sets `mode: "shadow"` on the seed but the agent still runs the candidate path for every request. There is no dual-execution (running both baseline and candidate, returning only the baseline result to the user).
  - `"canary"` mode is treated identically to `"live"` -- 100% of requests use the candidate stack. There is no fraction-based routing.

- **Solution:**
  1. Add a `canary_fraction` field to `ActiveNicheStackRecord` (default `0.1`, operator-configurable) and a `shadow_dual_execute` boolean (default `true`).
  2. In `materializePreparedSeedForRuntime`, when `release_mode === "canary"`, use a deterministic hash of `runId + activeStackId` to decide whether this request uses the candidate seed (fraction hits) or returns `null` (baseline path). This gives consistent per-run routing.
  3. In `resolveActiveNicheStackForRun`, when `release_mode === "shadow"` and `shadow_dual_execute` is true, return a `ResolvedActiveNicheStack` with an additional `shadow_mode: true` flag. The caller in `agent-runner.ts` must be updated to: (a) run the candidate path, (b) capture the result as a shadow trace without delivering it to the user, (c) return the baseline (unspecialized) result to the user.
  4. Add an `actuateReleaseDecision` path for `"canary"` that sets the `canary_fraction` on the stack record.

- **Files to create/modify:**
  - `src/niche/schema/runtime-stack.ts` (add `canary_fraction` and `shadow_dual_execute` to `ActiveNicheStackRecordSchema`)
  - `src/niche/runtime/active-stack.ts` (implement fraction-based routing for canary, dual-execute flag for shadow)
  - `src/auto-reply/reply/agent-runner.ts` (handle shadow dual-execution: run candidate silently, return baseline result)
  - `src/niche/release/release-controller.ts` (set canary_fraction on actuation)
  - `src/niche/schema/activation.ts` (no changes needed, modes already defined)
  - `test/niche/runtime/active-stack-resolution.test.ts` (add canary fraction and shadow dual-execute tests)
  - `test/niche/runtime/reply-active-stack.test.ts` (add integration tests for shadow non-delivery)

- **Acceptance Criteria:**
  - When a stack is in `"canary"` mode with `canary_fraction: 0.1`, approximately 10% of runs resolve to the candidate seed and 90% resolve to `null` (baseline path).
  - When a stack is in `"shadow"` mode, the candidate path executes but its output is not delivered to the user; the baseline path's output is delivered instead.
  - Shadow traces are persisted with `mode: "shadow"` for later benchmark analysis.
  - Canary runs are persisted with `mode: "live"` but the stack record tracks which runs were canary-routed.
  - All existing tests continue to pass.

- **Effort:** XL

- **Dependencies:** None (can be developed in parallel with bridge commands, but needs CJ-01/CJ-02 for the full pipeline to be exercised).

---

### CJ-05: Build a real pilot niche integration test

- **Problem:** The E2E test (`test/niche/e2e/full-pipeline.test.ts`) exercises the pipeline using synthetic data constructed inline. No test exercises the actual CLI commands in sequence, and the repo-ci pilot seed data (`src/niche/pilots/repo-ci/`) is used only in unit tests. There is no evidence that a real niche (even with mocked agent execution) can complete the full loop through the CLI surface.

- **Solution:** Create a new integration test that:
  1. Uses `withTempHome` to isolate the state directory.
  2. Calls `nicheCreateCommand` with a NicheProgram derived from the repo-ci pilot.
  3. Calls `nicheCompileCommand` with source descriptors that cover enough source kinds and benchmark seeds to pass the readiness gate (the current E2E test shows readiness is `not_ready` with typical inputs because `source_coverage` is only `20%` with 2 source kinds out of 10).
  4. Calls the new `prepareBenchmarkCommand` (from CJ-01) to auto-generate benchmark inputs.
  5. Calls `nicheBenchmarkCommand` in non-live mode (with typed execution bundles) using the auto-generated suite and manifests.
  6. Calls the new `prepareReleaseCommand` (from CJ-02) to auto-generate release inputs.
  7. Calls `nicheReleaseCommand` with the auto-generated inputs.
  8. Verifies that the release decision is `promoted` or `canary` (not `rejected`).
  9. Optionally calls `nicheRunCommand` with a mocked agent to verify the end-to-end path.

  Additionally, fix the readiness threshold issue for realistic source sets:
  - The `source_coverage_min` threshold of 30 requires 3+ distinct source kinds out of 10 (`SOURCE_KINDS`). With structured_text + benchmark_seed (2 kinds), the score is 20%, which triggers the `source_coverage_too_low_for_benchmarkable_domain_pack` hard blocker.
  - The pilot integration test should provide 3+ source kinds (e.g., `repos`, `human_examples`, `tool_contracts`) to clear this gate, demonstrating that a realistic pilot can pass readiness.

- **Files to create/modify:**
  - `test/niche/e2e/pilot-repo-ci-cli-pipeline.test.ts` (new: full CLI-surface integration test)
  - `src/niche/pilots/repo-ci/seed-source-descriptors.ts` (new: produces source descriptors covering 3+ source kinds to pass readiness)
  - `src/niche/pilots/repo-ci/index.ts` (export new seed source descriptors)

- **Acceptance Criteria:**
  - The integration test passes from `create` through `release` without any manual JSON file authoring.
  - The readiness report produced during compilation is `ready` or `ready_with_warnings` (not `not_ready`).
  - The benchmark result produces a positive mean delta.
  - The release decision is not `rejected`.
  - The test exercises the bridge commands from CJ-01 and CJ-02.

- **Effort:** L

- **Dependencies:** CJ-01, CJ-02 (bridge commands must exist for the zero-manual-assembly pipeline).

---

### CJ-06: Wire compilation output directly to manifest builder in the standard CLI path

- **Problem:** The standard path (`create` -> `compile` -> `benchmark`) has no way to generate manifests from compilation output without the quickstart wizard or manual JSON authoring. The `buildStarterManifests` function exists but is only called from `quickstart`. The `snapshotUnspecializedBaseline` function exists but is never called from any CLI command.

- **Solution:** Enhance `niche compile` to optionally output manifest-ready metadata:
  1. Add `--emit-manifests` flag to `niche compile`. When set, the compile command also calls `buildStarterManifests` and `snapshotUnspecializedBaseline`, stores the manifests, and includes their paths in the output.
  2. This makes the two-command pipeline (`niche create` -> `niche compile --emit-manifests`) produce everything needed for the benchmark stage, without requiring the separate `prepare-benchmark` command for simple cases.
  3. The `prepare-benchmark` command (CJ-01) remains for cases where the operator wants to customize the manifests or benchmark suite independently.

- **Files to create/modify:**
  - `src/commands/niche/compile.ts` (add `--emit-manifests` flag, call manifest builders when set)
  - `src/cli/program/register.niche.ts` (register the new flag)
  - `test/niche/commands/compile-emit-manifests.test.ts` (new test)

- **Acceptance Criteria:**
  - `openclaw niche compile --niche-program-id <id> --source <path> --emit-manifests --json` includes `baseline_manifest_path` and `candidate_manifest_path` in its output.
  - The emitted manifests are schema-valid and stored in the manifest store.
  - The emitted candidate manifest's `based_on_baseline_manifest_id` matches the emitted baseline manifest's ID.

- **Effort:** S

- **Dependencies:** None (uses existing `buildStarterManifests` and `snapshotUnspecializedBaseline`).

---

## Dependency Graph

```
CJ-06 (compile --emit-manifests, S)          CJ-04 (canary/shadow traffic, XL)
    |                                              |
    v                                              |
CJ-01 (prepare-benchmark, L)                      |
    |                                              |
    v                                              |
CJ-02 (prepare-release, M)                        |
    |                                              |
    v                                              |
CJ-03 (readiness guidance, M)                     |
    |                                              |
    v                                              v
CJ-05 (pilot integration test, L) <----- depends on CJ-01, CJ-02
```

## Recommended Implementation Order

1. **CJ-06** (S) -- Quick win: compile with `--emit-manifests` flag. Unlocks the standard two-command path.
2. **CJ-01** (L) -- Core bridge: `prepare-benchmark` command. Eliminates the manual JSON assembly gap between compile and benchmark.
3. **CJ-02** (M) -- Release bridge: `prepare-release` command. Eliminates the manual JSON assembly gap between benchmark and release.
4. **CJ-03** (M) -- UX: readiness guidance. Fixes the quickstart dead-end and makes `readiness` command actionable.
5. **CJ-04** (XL) -- Runtime: canary/shadow traffic splitting. Fills the PRD-required promotion modes.
6. **CJ-05** (L) -- Proof: pilot integration test. Proves the full loop works end-to-end through the CLI surface.

## Total Estimated Effort

- S: 1 item
- M: 2 items
- L: 2 items
- XL: 1 item

### Critical Files for Implementation

- `src/commands/niche/quickstart.ts` - Core quickstart flow that already calls buildStarterManifests; must be enhanced with readiness guidance
- `src/niche/domain/manifest-builder.ts` - Contains buildStarterManifests which must be surfaced in CLI and bridge commands
- `src/niche/runtime/active-stack.ts` - Contains resolveActiveNicheStackForRun; must implement canary fraction routing and shadow dual-execute
- `src/niche/domain/compile-flow.ts` - Compile flow producing compilation records; must optionally emit manifests and be the data source for bridge commands
- `src/cli/program/register.niche.ts` - CLI registration for all niche subcommands; must add prepare-benchmark, prepare-release, and new flags
