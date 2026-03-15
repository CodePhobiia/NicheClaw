## Remediation Plan: Reliability Dimension (75 to 100)

### RL-01 -- Fix 2 Failing Live Benchmark Tests

**Current state:** Both tests in `test/niche/commands/benchmark-runtime.test.ts` fail with "Live benchmark did not produce a persisted baseline runtime manifest." The error is thrown at `src/niche/benchmark/live-benchmark.ts:669` (atomic) and `:847` (episode).

**Root cause analysis:**

The test mock in `beforeEach` (line 354-442) correctly calls `persistPreparedNicheRunArtifacts()`, which chains through `persistPreparedNicheRunTrace()` in `src/niche/runtime/persist-run-trace.ts`. This function calls `appendRunTrace(trace, params.env)` at line 594, which writes the trace to disk in `src/niche/store/trace-store.ts:43-53`. So far so good -- the trace IS being persisted to disk.

After `agentCommand` returns (via the mock), `executePreparedSeedCase` at `src/niche/benchmark/live-benchmark.ts:456` calls `queryRunTraces({ runId: params.runId }, process.env)`. This scans the trace store directory via `listRunTraces` (line 68-87 of `trace-store.ts`). The issue is that `process.env` inside `live-benchmark.ts` resolves the store root via `resolveNicheStoreRoots(process.env)`, which uses `resolveStateDir(process.env)`. The test correctly sets `OPENCLAW_STATE_DIR` via `withTempHome`, so trace writes and reads should point to the same temp directory.

The real failure point is more subtle: the mock calls `persistPreparedNicheRunArtifacts` which writes the trace, but `executePreparedSeedCase` (lines 449-468) expects the `queryRunTraces` call to find that trace. The mock is building a `PreparedNicheRunSeed` via `prepareNicheRunSeed()` but the seed's `replayability_status` is `"non_replayable"` and in the live-benchmark flow the trace IS written. However, the test is calling `registerPreparedNicheRunTraceContext` at line 358, but the `snapshotNicheRunTraceContext` function may be failing because the `phaseState.plannerStartedAt` is never set.

Looking more carefully at `persist-run-trace.ts:317`, `plannerStartedAt` is required via `requireValue()`. But in the mock, `registerPreparedNicheRunTraceContext` is called at line 358, then `recordActionProposalForRun` at line 362 -- but there is no explicit call to set `plannerStartedAt`. The `registerPreparedNicheRunTraceContext` function sets the initial context, and `recordActionProposalForRun` should set timing fields. If `plannerStartedAt` is not being set, `persistPreparedNicheRunTrace` would throw "Cannot persist prepared Niche run trace without planner_started_at phase timing." But this error would be caught and re-thrown with a different message than what we see.

Actually, re-reading the mock more carefully: `persistPreparedNicheRunArtifacts` is called at line 397 and any error inside it would propagate. But the error message we see is "Live benchmark did not produce a persisted baseline runtime manifest" which is the check at line 669 -- this means `baselineRuntimeManifest` is still `undefined`. This variable is only assigned inside `executeBaselineCase` (line 610). The flow is: the `runAtomicBenchmark` runner invokes the callback, which calls `executePreparedSeedCase`, which requires `queryRunTraces` to return a trace. If `persistPreparedNicheRunArtifacts` returns `null` (the function signature allows this) then no trace is written, and `queryRunTraces` returns empty, causing the error at line 458: "No persisted run trace was captured for benchmark run..." -- but the reported error is at line 669, not 458.

The only way to reach line 669 is if `runAtomicBenchmark` completes without the callback ever executing, or if the callback throws and the runner catches it. Most likely, the root cause is that `persistPreparedNicheRunTrace` returns `null` because `snapshotNicheRunTraceContext` returns `null` -- meaning the `registerPreparedNicheRunTraceContext` is not properly registering the context for the run ID. The mock uses `opts.runId` as the run ID, but `executePreparedSeedCase` generates a different run ID pattern: `` `benchmark-${params.baselineArm.benchmark_arm_id}-${evalCase.eval_case_id}` ``. The mock's `opts.runId` must match this pattern. Since the mock is called via `agentCommand`, which is invoked at line 450 with `runId: params.runId` from `executePreparedSeedCase`, the IDs should match.

The most plausible root cause: the `plannerStartedAt` timing is never recorded in the mock's trace context, so `persistPreparedNicheRunTrace` throws at line 317-319, the error bubbles up from `persistPreparedNicheRunArtifacts`, which causes the `agentCommand` mock to throw, which causes `executePreparedSeedCase` to throw, which means the `executeBaselineCase` callback throws. If `runAtomicBenchmark` catches/ignores that error (or produces a result with 0 cases), then `baselineRuntimeManifest` remains `undefined`, hitting line 669.

**Fix strategy:**

The mock must record planner phase timing before calling `persistPreparedNicheRunArtifacts`. Add a call to record the planner start/finish timestamps in the mock's `agentCommand` implementation, between `registerPreparedNicheRunTraceContext` and `recordActionProposalForRun`. Specifically, the mock needs to call something like:

```typescript
// After registerPreparedNicheRunTraceContext:
// Set the planner phase timing that persist-run-trace.ts requires
```

Looking at `run-trace-capture.ts`, the planner timing is likely set via the existing `registerPreparedNicheRunTraceContext` or another helper. Need to check what `registerPreparedNicheRunTraceContext` sets for `phaseState`.

**Files to modify:**

- `test/niche/commands/benchmark-runtime.test.ts` -- Fix the mock to properly set planner phase timing in the trace context before calling `persistPreparedNicheRunArtifacts`
- Potentially `src/niche/runtime/run-trace-capture.ts` -- to understand the exact registration API for phase timing

**Verification:** `pnpm test:niche -- benchmark-runtime.test.ts` -- both tests pass.

---

### RL-02 -- File-System Store Corruption Recovery

**Current state:** `readJsonFileStrict` in `src/niche/json.ts` throws a hard `Error` if `JSON.parse` fails (line 22-25). No recovery is attempted. If a `.tmp` file survived a crash (the atomic rename failed), or if a file was partially written due to disk-full, the store becomes permanently unreadable.

**Fix strategy:**

1. Add a `tryRecoverCorruptedJsonFile` function in `src/infra/json-file.ts` that:
   - On `JSON.parse` failure, checks for a `.tmp` sibling file
   - If the `.tmp` file exists and is valid JSON, renames it into place (completing the interrupted atomic write)
   - If the `.tmp` file is also corrupt, moves the corrupt file to a `.corrupt.<timestamp>` backup and returns `undefined` (signaling the store that the record is missing)
   - Logs a warning (not an error) so operators notice the self-healing

2. Modify `readJsonFileStrict` in `src/niche/json.ts` to call the recovery function on `JSON.parse` failure before throwing. If recovery succeeds, retry the read.

3. Add a `recoverCorruptedStoreFile` export from `src/infra/json-file.ts` that can be called directly.

**Files to modify:**

- `src/infra/json-file.ts` -- Add `tryRecoverCorruptedJsonFile` function
- `src/niche/json.ts` -- Integrate recovery into `readJsonFileStrict`
- `test/niche/store/manifest-artifact-store.test.ts` -- Add test: write valid JSON, corrupt it manually, verify recovery

**Verification:** New test where a `.json` file is written with garbage content, a valid `.tmp` sibling exists, and the read auto-recovers. Second test: no `.tmp` sibling, file is moved to `.corrupt.*` and `undefined` is returned.

---

### RL-03 -- Stale Lock File Detection and Cleanup

**Current state:** `withStateLock` in `src/niche/store/active-stack-store.ts` (lines 22-57) writes the PID to the lock file. If the process crashes, the `.lock` file remains forever. The busy-wait loop retries 10 times with 50ms delay (total ~500ms) and then throws.

**Fix strategy:**

1. After failing to acquire the lock (EEXIST), read the PID from the lock file.
2. Check if that PID is still alive using `process.kill(pid, 0)` (signal 0 checks existence without killing).
3. If the PID is dead, the lock is stale -- unlink it and retry.
4. If the PID is alive, continue the retry loop as today.
5. Also add a maximum lock age check: if the lock file is older than 30 seconds (via `fs.statSync(lockPath).mtimeMs`), treat it as stale regardless of PID status (handles cases where PID was recycled).

**Files to modify:**

- `src/niche/store/active-stack-store.ts` -- Enhance `withStateLock` with stale lock detection
- `test/niche/runtime/reply-active-stack.test.ts` or new test -- Verify stale lock is cleaned up

**Verification:** Test that creates a lock file with a dead PID, then calls a function that acquires the lock -- should succeed without error.

---

### RL-04 -- Store Integrity Check Command (`openclaw niche verify`)

**Current state:** No way to verify that the on-disk store is internally consistent. Manifests can reference artifacts that don't exist, lineage edges can point to missing parents, benchmark records can reference traces that have been deleted.

**Fix strategy:**

1. Create `src/commands/niche/verify.ts` implementing a `nicheVerifyCommand` that:
   - Scans all store directories under `resolveNicheStoreRoots(env)`
   - Validates every JSON file against its schema (reusing existing `assert*` validators)
   - Checks referential integrity: manifests reference valid `source_access_manifest_id`, benchmark records reference valid `baseline_manifest_id` and `candidate_manifest_id`, lineage edges reference valid artifact IDs, run traces reference valid manifests
   - Reports orphaned files (`.tmp` leftovers, `.lock` stale files)
   - Returns a structured `NicheVerifyResult` with `{ ok: boolean; errors: VerifyIssue[]; warnings: VerifyIssue[] }`

2. Register in CLI: add `openclaw niche verify` subcommand in `src/cli/program/register.niche.ts`.

3. Follow the pattern of `nicheReadinessCommand` for structure and output formatting.

**Files to create:**

- `src/commands/niche/verify.ts` -- Main command
- `test/niche/commands/verify.test.ts` -- Tests

**Files to modify:**

- `src/cli/program/register.niche.ts` -- Register the subcommand
- `src/niche/store/index.ts` -- Export any new integrity-check helpers

**Verification:** Test that a healthy store returns `ok: true`, a store with a corrupt file returns an error, a store with a dangling manifest reference returns an error.

---

### RL-05 -- Backup/Restore Mechanism

**Current state:** All NicheClaw state lives under `~/.openclaw/niche/` with no export/import capability. A disk failure or accidental deletion loses all specialization state.

**Fix strategy:**

1. Create `src/commands/niche/backup.ts` implementing `nicheBackupCommand`:
   - Walks the entire `resolveNicheStateRoot(env)` directory tree
   - Produces a single tar.gz archive (or a structured JSON export bundle)
   - Includes a manifest listing all files and their content hashes for verification
   - Optionally runs `nicheVerifyCommand` first to confirm store integrity before backup

2. Create `src/commands/niche/restore.ts` implementing `nicheRestoreCommand`:
   - Accepts a backup archive path
   - Verifies the archive manifest (content hashes match)
   - Restores files to the store directory, refusing to overwrite existing files unless `--force` is provided
   - Runs integrity check after restore

3. Use `node:zlib` and `node:fs` for archiving -- no additional dependencies needed. Alternatively, use a JSON-based bundle format (a single JSON file containing all records keyed by store type and ID) for portability.

**Files to create:**

- `src/commands/niche/backup.ts`
- `src/commands/niche/restore.ts`
- `test/niche/commands/backup-restore.test.ts`

**Files to modify:**

- `src/cli/program/register.niche.ts` -- Register subcommands

**Verification:** Round-trip test: populate a store, back up, wipe, restore, verify all records match.

---

### RL-06 -- Extend File Locking to All Mutable Stores

**Current state:** Only `active-stack-store.ts` uses `withStateLock`. The other stores that perform read-modify-write patterns (program-store, manifest-store, benchmark-run-store, domain-pack-store, readiness-store, trace-store, lineage-store, replay-bundle-store, artifact-registry) have no concurrency protection. While most of these use `ensureStored*` patterns that check-then-write (and refuse to overwrite), the check-then-write is not atomic -- two concurrent processes could both see the file as missing and race to write.

**Fix strategy:**

1. Extract `withStateLock` from `active-stack-store.ts` into `src/infra/file-lock.ts` as a generic utility:

   ```typescript
   export function withFileLock<T>(
     lockPath: string,
     fn: () => T,
     opts?: { maxRetries?: number; retryDelayMs?: number; staleLockMaxAgeMs?: number },
   ): T;
   ```

   Include the stale-lock detection from RL-03.

2. The immutable stores (manifests, programs, compilation records, traces, replay bundles, lineage, artifacts) use a write-once-refuse-overwrite pattern. For these, the concurrency risk is low (two writers would write identical content and the second would fail with "refusing to overwrite"). However, the `existsSync` + `writeFileSync` check is not atomic on any filesystem. Wrap the write path with a per-file lock based on the target path: `withFileLock(\`${pathname}.lock\`, () => { ... })`.

3. For `active-stack-store.ts`, refactor to use the extracted `withFileLock`.

4. Priority order: active-stack-store (already done, just refactor), program-store, manifest-store, trace-store (these are most commonly written during live runs).

**Files to create:**

- `src/infra/file-lock.ts` -- Generic file lock utility

**Files to modify:**

- `src/niche/store/active-stack-store.ts` -- Use extracted utility
- `src/niche/store/manifest-store.ts` -- Add lock around `writeManifest`
- `src/niche/store/program-store.ts` -- Add lock around `writeNicheProgram`
- `src/niche/store/trace-store.ts` -- Add lock around `appendRunTrace`
- `src/niche/store/benchmark-run-store.ts` -- Add lock around `writeBenchmarkResultRecord`
- `src/niche/store/domain-pack-store.ts` -- Add lock around `writeNicheCompilationRecord`
- `src/niche/store/readiness-store.ts` -- Add lock around `writeReadinessReport`
- `src/niche/store/replay-bundle.ts` -- Add lock around `createReplayBundle`
- `src/niche/store/lineage-store.ts` -- Add lock around `writeLineageEdges`
- `src/niche/store/artifact-registry.ts` -- Add lock around `createArtifactRecord`
- `test/niche/store/manifest-artifact-store.test.ts` -- Add concurrency test

**Verification:** Test that two concurrent writes to the same store path both complete without corrupting each other (one succeeds, the second sees the file and returns the existing value or throws the expected "refusing to overwrite" error).

---

### RL-07 -- Retry with Backoff on Transient File I/O Errors

**Current state:** All file reads in `readJsonFileStrict` (line 16-18 of `src/niche/json.ts`) and `loadJsonFile` (lines 6-13 of `src/infra/json-file.ts`) fail immediately on any I/O error. On Windows, antivirus scanners and search indexers frequently hold brief locks on files, causing `EBUSY` or `EACCES` errors that resolve within milliseconds.

**Fix strategy:**

1. Add a `retryFileOp` utility in `src/infra/json-file.ts`:

   ```typescript
   function retryFileOp<T>(
     fn: () => T,
     opts?: { maxRetries?: number; baseDelayMs?: number; retryableCodes?: Set<string> },
   ): T;
   ```

   Retryable error codes: `EBUSY`, `EACCES`, `EPERM`, `EAGAIN`, `ENOTEMPTY` (for renames on Windows).
   Default: 3 retries with exponential backoff (50ms, 100ms, 200ms).

2. Wrap `fs.readFileSync` in `readJsonFileStrict` with `retryFileOp`.
3. Wrap `fs.writeFileSync` and `fs.renameSync` in `saveJsonFile` with `retryFileOp`.
4. Wrap `fs.unlinkSync` in lock cleanup paths with a single retry.

**Files to modify:**

- `src/infra/json-file.ts` -- Add `retryFileOp`, wrap read/write/rename calls
- `src/niche/json.ts` -- Wrap `readFileSync` with retry
- Test: Add a test that mocks `fs.readFileSync` to throw `EBUSY` once then succeed, verifying the retry works

**Verification:** Unit test that simulates `EBUSY` on first attempt and success on second. Also verify that non-retryable errors (`ENOENT`, `EISDIR`) still fail immediately.

---

## Implementation Sequence

**Phase 1 (Sequential -- shared infrastructure):**

1. **RL-07** -- Retry utility (other items depend on reliable I/O)
2. **RL-03** -- Stale lock detection (RL-06 depends on this)
3. **RL-06** -- Extract and extend file locking (foundational for all stores)
4. **RL-02** -- Corruption recovery (depends on reliable I/O from RL-07)

**Phase 2 (Parallel -- independent):** 5. **RL-01** -- Fix failing tests (isolated test file) 6. **RL-04** -- Store integrity check command (new command, no deps) 7. **RL-05** -- Backup/restore (new commands, no deps)

**Estimated impact on score:**

- RL-01: +8 points (333/335 to 335/335 -- test suite fully green)
- RL-02: +3 points (corruption self-healing)
- RL-03: +3 points (stale lock recovery)
- RL-04: +3 points (verifiable store integrity)
- RL-05: +3 points (disaster recovery)
- RL-06: +3 points (full concurrency safety)
- RL-07: +2 points (transient error resilience)
- Total: +25 points (75 to 100)

---

### Critical Files for Implementation

- `test/niche/commands/benchmark-runtime.test.ts` - Fix the 2 failing tests by correcting mock planner phase timing (RL-01)
- `src/infra/json-file.ts` - Core file I/O: add retry, corruption recovery, and refactor atomic writes (RL-02, RL-07)
- `src/niche/store/active-stack-store.ts` - Extract generic file lock utility from existing implementation (RL-03, RL-06)
- `src/niche/json.ts` - Integrate corruption recovery and retry into the strict JSON reader (RL-02, RL-07)
- `src/commands/niche/verify.ts` - New store integrity check command (RL-04)
