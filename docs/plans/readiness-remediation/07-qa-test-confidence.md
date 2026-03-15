## Remediation Plan: QA / Test Confidence (78 -> 100)

### Summary of Findings

The NicheClaw test suite is substantial: 57 test files under `test/niche/` with 21,269 lines of test code covering 110 source files (18,208 lines) in `src/niche/`. Two E2E tests prove the full pipeline. The vitest niche config (`vitest.niche.config.ts`) runs all niche tests but has zero coverage configuration -- no thresholds, no `coverage` block at all. The 2 failing tests in `benchmark-runtime.test.ts` fail because the `agentCommand` mock simulates execution but `buildSyntheticPreparedSeed` in `src/niche/benchmark/live-benchmark.ts` calls `assertCompilationRecordForBenchmark` which reads the compilation record from the store; the test creates the compilation via `nicheCompileCommand` but the baseline arm execution calls `getLatestNicheCompilationRecordForProgram` and the runtime manifest persistence path fails when the baseline's runtime-derived manifest cannot be stored (the baseline manifest is built from the run seed, but the test fixture does not fully wire the compilation through the baseline arm path, causing the `getBaselineManifest` assertion at line 592 to return null).

The ten gaps map to 10 numbered remediation items below.

---

### QA-01: Fix the 2 Failing Tests in benchmark-runtime.test.ts

**Problem:** Both tests in `test/niche/commands/benchmark-runtime.test.ts` fail at assertions verifying the stored baseline runtime manifest. The `buildSyntheticPreparedSeed` function at `src/niche/benchmark/live-benchmark.ts:174-297` calls `assertCompilationRecordForBenchmark` which calls `getLatestNicheCompilationRecordForProgram`. For the baseline arm (which has no active stack record), it falls through to `prepareNicheRunSeed` at line 240. The runtime-derived baseline manifest is then persisted via `ensureStoredBaselineManifest`. The test asserts `getBaselineManifest(baselineRuntimeId, process.env)` returns a matching manifest, but the `baselineRuntimeId` is derived from `path.basename(result.baseline_runtime_manifest_path, ".json")` -- the ID includes the `baseline-runtime-` prefix plus a content hash. The mock does not persist a compilation record whose `source_access_manifest_id` matches the template baseline manifest, causing `assertCompilationRecordForBenchmark` to throw or the runtime manifest to be generated with a mismatched ID.

**Root cause:** The test creates a compilation record via `nicheCompileCommand` but the baseline manifest template declares a `source_access_manifest_id` that was set from `compiled.compilation.source_access_manifest.source_access_manifest_id` -- so the IDs should match. The real problem is that the mock `agentCommand` (line 354-442) calls `persistPreparedNicheRunArtifacts` which persists a run trace but does not trigger the runtime-manifest-derivation path that `runLiveAtomicBenchmark` uses. The test needs to ensure that `ensureStoredBaselineManifest` is called with the correct runtime-derived manifest. Looking more carefully, the assertion at line 592 calls `getBaselineManifest(baselineRuntimeId)` where `baselineRuntimeId` is the filename (without `.json`) of the path returned by `result.baseline_runtime_manifest_path`. The live benchmark writes this manifest via `ensureStoredBaselineManifest` which stores it at the manifest store path. The likely failure mode is that the test environment's `withTempHome` sets `HOME` but the store writes to a path derived from `resolveStateDir(env)` using `process.env` -- the mock in `beforeEach` clears mocks but does not clear the temp home between tests.

**Fix approach:**

1. In the test, after `nicheCompileCommand`, explicitly verify the compilation record exists via `getLatestNicheCompilationRecordForProgram("repo-ci-specialist", process.env)` and assert it is not null.
2. Ensure the baseline manifest template's `source_access_manifest_id` matches the compilation's `source_access_manifest.source_access_manifest_id` (it already does from line 484/518).
3. The most likely fix: the `assertCompilationRecordForBenchmark` call inside `buildSyntheticPreparedSeed` for the baseline arm uses `params.manifest.niche_program_id` which is `"repo-ci-specialist"`. The compilation record written by `nicheCompileCommand` is stored via `writeNicheCompilationRecord` (called inside `compileNicheProgramFlow`). Verify the compilation record ID that was stored and that `getLatestNicheCompilationRecordForProgram` can retrieve it. If the store path is not created under the temp home, the retrieval fails silently. Add a debug assertion after compilation to confirm the record is retrievable.
4. If the issue is that `ensureStoredBaselineManifest` throws because a different baseline manifest with the same ID was already stored (from the template), ensure the template manifest is not pre-stored -- the test calls `saveJsonFile(baselineManifestPath, baselineManifest)` which writes to a temp directory, not the store path, so this should be fine.

**Files to modify:**

- `test/niche/commands/benchmark-runtime.test.ts` -- fix mock wiring so the baseline arm's runtime-derived manifest is correctly persisted and retrievable

**Estimated effort:** Small (1-2 hours)

---

### QA-02: Add Coverage Thresholds to vitest.niche.config.ts

**Problem:** `vitest.niche.config.ts` extends the unit config but does not define any `coverage` block. The base `vitest.config.ts` defines V8 coverage with thresholds (70% lines/functions/statements, 55% branches) but only for `./src/**/*.ts`. The niche config inherits these but because the niche tests are in `test/niche/**` and the unit config excludes `src/commands/**`, `src/gateway/**`, etc., the coverage numbers for niche source files are never explicitly gated.

**Fix approach:**

1. Add a `coverage` block to `vitest.niche.config.ts` with:
   - `provider: "v8"`
   - `reporter: ["text", "lcov"]`
   - `include: ["src/niche/**/*.ts"]` -- scoped to niche source only
   - `thresholds`: Start at measured baseline (run `pnpm test:niche -- --coverage` to get current numbers), then set thresholds 5% below measured to avoid false failures, with a ratchet-up plan
   - Target thresholds: lines 80%, functions 80%, branches 65%, statements 80% (higher than core because niche is newer code)
2. Add a `test:niche:coverage` script to `package.json`: `vitest run --config vitest.niche.config.ts --coverage`

**Files to modify:**

- `vitest.niche.config.ts` -- add coverage block
- `package.json` -- add `test:niche:coverage` script

**Estimated effort:** Small (30 minutes)

---

### QA-03: Add Real-Domain Integration Test Scaffold

**Problem:** All 57 test files use synthetic fixtures. No test exercises real model calls, real tool execution, or real domain knowledge retrieval. This means the test suite cannot detect integration failures between the runtime substrate and actual LLM providers.

**Fix approach:**

1. Create `test/niche/e2e/live-domain-integration.test.ts` -- gated behind `OPENCLAW_LIVE_TEST=1` environment variable (following the repo's existing pattern from `vitest.live.config.ts`)
2. The test should:
   - Create a real niche program for a simple domain (e.g., "code-review-specialist")
   - Compile with real source descriptors (inline text, no external file dependencies)
   - Prepare a run seed with the compiled domain pack
   - Execute via `agentCommand` with a real model call (gated behind `LIVE=1`)
   - Assert the run trace was persisted with expected fields
   - Assert tool calls were recorded
   - Assert verifier decisions were recorded
3. Add the test to `vitest.live.config.ts`'s include patterns so it runs with `pnpm test:live`
4. For CI (no live keys), add a mock-backed variant that verifies the integration seams (the wiring from `nicheBenchmarkCommand` through `runLiveAtomicBenchmark` through `executePreparedSeedCase` through `agentCommand`) without real API calls -- this exists partially in `benchmark-runtime.test.ts` but should be extracted into a dedicated integration seam test

**Files to create:**

- `test/niche/e2e/live-domain-integration.test.ts`

**Files to modify:**

- `vitest.live.config.ts` (if needed to include niche live tests)

**Estimated effort:** Medium (4-6 hours)

---

### QA-04: Add Property-Based Testing for Schema Invariants

**Problem:** Schemas define complex numeric invariants (e.g., `PairedDeltaSummary` has `confidence_interval_low` and `confidence_interval_high` but no schema constraint enforcing `low < high`; `BenchmarkTaskFamilySummary` has `hard_fail_rate` with `minimum: 0` but no `maximum: 1`; `score_mean` similarly unbounded). TypeBox schemas define types but not cross-field invariants. Fuzz testing would catch edge cases.

**Fix approach:**

1. Add `fast-check` as a dev dependency (standard property-based testing library for JS/TS)
2. Create `test/niche/schema/property-based-invariants.test.ts` with:
   - **PairedDeltaSummary**: generate random valid summaries and assert `confidence_interval_low <= confidence_interval_high` (this is currently NOT enforced -- it is a documentation-only invariant)
   - **BenchmarkResultSummary**: generate summaries and assert `case_count >= 0`, `hard_fail_rate` in `[0, 1]`
   - **SourceRightsMetadata**: generate random rights and assert boolean fields are consistent (e.g., cannot `rights_to_train` without `rights_to_store`)
   - **DomainConstraint severity/rule**: fuzz constraint rules with random strings and ensure `checkDomainConstraints` never throws (only returns violations)
   - **Manifest comparison**: generate random baseline/candidate pairs and assert `getManifestComparisonIssues` never throws
3. If any invariant is violated by valid schema values, add runtime validation functions and tests for them
4. Consider adding cross-field TypeBox constraints or runtime validators where invariants are discovered

**Files to create:**

- `test/niche/schema/property-based-invariants.test.ts`

**Files to modify:**

- `package.json` -- add `fast-check` to devDependencies

**Estimated effort:** Medium (3-4 hours)

---

### QA-05: Add Mutation Testing Configuration

**Problem:** No mutation testing exists. The 333 passing tests might be assertion-weak -- they could pass even with bugs. Mutation testing introduces small code changes (mutants) and checks that at least one test fails for each mutant. A low mutation score reveals hollow tests.

**Fix approach:**

1. Add `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` as dev dependencies
2. Create `stryker.niche.config.json` (or `.js`) with:
   - `mutate`: `["src/niche/**/*.ts", "!src/niche/**/*.test.ts"]`
   - `testRunner`: `"vitest"`
   - `vitest.configFile`: `"vitest.niche.config.ts"`
   - `thresholds.high`: 80, `thresholds.low`: 60, `thresholds.break`: 50
   - `reporters`: `["html", "clear-text", "progress"]`
   - `concurrency`: 4
3. Add `test:niche:mutation` script to `package.json`: `stryker run stryker.niche.config.json`
4. Run initial baseline, document the mutation score, and identify the weakest modules (likely `src/niche/benchmark/live-benchmark.ts` at 889 lines, `src/niche/release/policy-engine.ts` at 596 lines)
5. Do NOT gate CI on mutation score initially -- use it as a reporting tool

**Files to create:**

- `stryker.niche.config.json`

**Files to modify:**

- `package.json` -- add stryker dev dependencies and `test:niche:mutation` script

**Estimated effort:** Medium (2-3 hours for setup, ongoing for score improvement)

---

### QA-06: Add Load/Stress Test for Store Operations

**Problem:** The E2E test at `test/niche/e2e/full-pipeline.test.ts:620-850` checks 200 artifacts, 200 lineage edges, and 50 traces complete in under 5 seconds each. But this is a single-burst test, not a sustained load test. No test exercises concurrent write pressure, growing store sizes over time, or repeated read-after-write cycles.

**Fix approach:**

1. Create `test/niche/store/load-stress.test.ts` with:
   - **Sustained write throughput**: write 1000 artifacts in a loop, measure p50/p95/p99 latency per write, assert p99 < 100ms
   - **Read-after-write consistency**: write N items, immediately read each back, assert 100% consistency
   - **Growing store degradation**: write 500 items, measure read-all latency; write 500 more, measure again; assert degradation < 2x
   - **Concurrent active-stack mutations**: use `Promise.all` to upsert 10 stack records simultaneously, assert final state is consistent (exercises the `withStateLock` mechanism in `src/niche/store/active-stack-store.ts:22-57`)
2. Mark the test with a 120-second timeout (Vitest `it("...", async () => {}, 120_000)`)
3. Gate behind a `OPENCLAW_TEST_PROFILE` environment variable so it does not slow down default test runs

**Files to create:**

- `test/niche/store/load-stress.test.ts`

**Estimated effort:** Medium (3-4 hours)

---

### QA-07: Add Concurrent Store Access Test

**Problem:** `src/niche/store/active-stack-store.ts` implements a file-based lock via `withStateLock` (lines 22-57) using `fs.writeFileSync(lockPath, ..., { flag: "wx" })` with a busy-wait retry loop (`LOCK_MAX_RETRIES=10`, `LOCK_RETRY_DELAY_MS=50`). No test exercises the actual contention path. If the lock is broken (e.g., stale lockfile from a crashed process), no test catches it.

**Fix approach:**

1. Create `test/niche/store/concurrent-active-stack.test.ts` with:
   - **Concurrent upserts**: launch 5 concurrent `upsertActiveNicheStackRecord` calls with different stack IDs, assert all 5 are present in final state
   - **Concurrent upsert + read**: launch writes and reads in parallel, assert reads never return corrupt/partial state
   - **Stale lock recovery**: manually create a `.lock` file, then call `upsertActiveNicheStackRecord`, expect it to retry and eventually fail (or succeed after lock expiry if lock-breaking is implemented)
   - **Lock timeout**: set `LOCK_MAX_RETRIES * LOCK_RETRY_DELAY_MS` to a known ceiling and assert the function throws within that budget when a lock is permanently held
2. These tests exercise the `EEXIST` branch at line 40-52 of `active-stack-store.ts`

**Files to create:**

- `test/niche/store/concurrent-active-stack.test.ts`

**Estimated effort:** Small-Medium (2-3 hours)

---

### QA-08: Add Negative Path Coverage Audit

**Problem:** Unknown whether all error branches are tested. Key error paths include: invalid schema validation (every `assertManifestValid`/`assertSchemaValue` call), store read failures (missing files, corrupt JSON), duplicate write rejection (`manifest-store.ts:96-98` "Refusing to overwrite"), lock acquisition failure (`active-stack-store.ts:56`), benchmark contamination detection, manifest comparison incompatibilities, release policy blocking reasons.

**Fix approach:**

1. Audit each `throw new Error(...)` in `src/niche/` by searching for all throw statements and checking whether a test triggers each one
2. Create `test/niche/negative-paths/error-branch-coverage.test.ts` with targeted tests for untested error branches:
   - **manifest-store**: attempt to write a manifest with an existing ID (should throw "Refusing to overwrite")
   - **manifest-store**: write a manifest with an invalid schema (missing required fields)
   - **active-stack-store**: create a stack record where `run_seed_template.manifest_kind !== "candidate"` (should throw at `assertCandidateRunSeedTemplate`)
   - **active-stack-store**: create a stack where `baseline_or_candidate_manifest_id !== candidate_manifest_id` (should throw)
   - **trace-store**: attempt to write a trace with an existing `trace_id` (should throw "Refusing to overwrite")
   - **live-benchmark**: call `assertCompilationRecordForBenchmark` with a program ID that has no compilation (should throw)
   - **benchmark invalidation**: test each of the 7 `BENCHMARK_INVALIDATION_REASON_CODES` is producible
   - **policy-engine**: test each blocking reason path (insufficient cases, negative delta, high false veto rate, etc.)
   - **constraint-enforcer**: test with empty content, very long content, special characters
3. Run coverage after adding these tests and verify that error branches that were previously uncovered are now hit

**Files to create:**

- `test/niche/negative-paths/error-branch-coverage.test.ts`

**Estimated effort:** Medium-Large (4-6 hours)

---

### QA-09: Add Snapshot Tests for CLI Output Format

**Problem:** The CLI commands (`benchmark.ts:215-240`, `inspect.ts:300-306`, `compare.ts`, `release.ts`) produce human-readable output via `runtime.log(...)`. Format changes (field reordering, missing fields, changed wording) would go undetected. No test snapshots the output.

**Fix approach:**

1. Create `test/niche/commands/cli-output-snapshots.test.ts` with:
   - **nicheInspectCommand**: call with each of the 6 `NICHE_INSPECT_KINDS`, capture `runtime.log` output, snapshot it
   - **nicheBenchmarkCommand**: run in non-live mode (with pre-computed execution bundles), capture the summary output, snapshot it
   - **nicheCompareCommand**: call with two benchmark result records, snapshot the comparison output
   - **nicheReleaseCommand**: call with a mock promotion result, snapshot the output
2. Use Vitest's `toMatchSnapshot()` or `toMatchInlineSnapshot()` for each output
3. Inject a mock `runtime` that captures `log` calls instead of writing to stdout
4. Each snapshot test should have both `json: true` and `json: false` variants to cover both output formats

**Files to create:**

- `test/niche/commands/cli-output-snapshots.test.ts`

**Estimated effort:** Medium (3-4 hours)

---

### QA-10: Add Contract Tests Between Gateway Handlers and Store Layer

**Problem:** `test/niche/gateway/niche-methods.test.ts` tests 5 gateway methods (programs.list, programs.get, runtime.state, runtime.stack, release.rollback). But the gateway defines 14 methods in `src/gateway/server-methods/niche.ts`. Missing coverage: `niche.compilations.list`, `niche.compilations.get`, `niche.compilations.latest`, `niche.readiness.get`, `niche.readiness.list`, `niche.manifests.list`, `niche.manifests.get`, `niche.benchmarks.list`, `niche.benchmarks.get`, `niche.traces.list`, `niche.traces.get`, `niche.monitor.assess`. The existing tests verify the gateway handler calls store functions, but do not verify the contract between what the gateway returns and what the store persists (e.g., does the store return the exact same object that was written?).

**Fix approach:**

1. Expand `test/niche/gateway/niche-methods.test.ts` (or create a companion `niche-methods-contract.test.ts`) with tests for all 14 gateway methods:
   - **compilations.list / .get / .latest**: write a compilation record via `writeNicheCompilationRecord`, then query via gateway, assert shape matches
   - **readiness.get / .list**: write a readiness report, query via gateway
   - **manifests.list / .get**: write baseline + candidate manifests, query via gateway with `kind` filter
   - **benchmarks.list / .get**: write a benchmark result record, query via gateway with filter params
   - **traces.list / .get**: append a run trace, query via gateway, verify the list endpoint returns summary fields and the get endpoint returns the full trace
   - **monitor.assess**: set up a stack + agent default + monitor definition, call the assess handler, verify the response shape
2. For each method, test both success and error paths:
   - Missing required params (empty string)
   - Resource not found
   - Invalid `kind` value for manifests
3. Verify round-trip fidelity: `write -> gateway.get -> assert deep equality with written object`

**Files to modify/create:**

- `test/niche/gateway/niche-methods-contract.test.ts` (new)
- OR expand `test/niche/gateway/niche-methods.test.ts`

**Estimated effort:** Medium (4-5 hours)

---

### Implementation Sequencing

**Phase 1 -- Critical (blocks 100/100):**

1. **QA-01** -- Fix 2 failing tests (gets to 335/335)
2. **QA-02** -- Add coverage thresholds (establishes measurement baseline)

**Phase 2 -- High value (parallel):** 3. **QA-08** -- Negative path coverage audit (most bang-for-buck in coverage improvement) 4. **QA-10** -- Gateway-store contract tests (completes a major untested surface) 5. **QA-07** -- Concurrent store access test (validates a critical correctness property)

**Phase 3 -- Defense in depth (parallel):** 6. **QA-04** -- Property-based testing (catches edge cases in schemas) 7. **QA-09** -- CLI output snapshots (prevents format regressions) 8. **QA-06** -- Load/stress tests (validates performance properties)

**Phase 4 -- Advanced (can defer):** 9. **QA-03** -- Real-domain integration test (requires live keys, long-running) 10. **QA-05** -- Mutation testing (ongoing quality signal, not a gate)

---

### Critical Files for Implementation

- `test/niche/commands/benchmark-runtime.test.ts` - Contains the 2 failing tests; must fix mock wiring for baseline manifest persistence
- `vitest.niche.config.ts` - Must add coverage block with thresholds for niche subsystem
- `src/niche/benchmark/live-benchmark.ts` - Core benchmark execution logic (889 lines); understanding `buildSyntheticPreparedSeed` and `assertCompilationRecordForBenchmark` is essential for QA-01
- `src/niche/store/active-stack-store.ts` - Contains `withStateLock` file-locking mechanism that needs concurrent access testing (QA-07)
- `src/gateway/server-methods/niche.ts` - All 14 gateway handlers; 9 are untested and need contract tests (QA-10)
