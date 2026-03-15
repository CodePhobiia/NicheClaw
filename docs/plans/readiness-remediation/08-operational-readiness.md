## Operational Readiness Remediation Plan

### Summary of Current State

The NicheClaw subsystem at score 38/100 has these operational assets:

1. **Gateway API surface**: 18 handlers in `src/gateway/server-methods/niche.ts` covering programs, compilations, readiness, manifests, benchmarks, runtime state, traces, rollback, and monitor assessment.
2. **UI views**: Three read-only tables (NichePrograms, NicheBenchmarks, NicheRuntime) wired via `ui/src/ui/controllers/niche.ts` and visible in the "nicheclaw" tab group.
3. **Lifecycle events**: Nine event types (`planner_proposed`, `action_proposed`, `action_validated`, `verifier_decision`, `run_trace_persisted`, `benchmark_case_started`, `benchmark_case_finished`, `candidate_promoted`, `candidate_rolled_back`) emitted via the `niche_lifecycle` plugin hook.
4. **File-system store**: 14 subdirectories under `~/.openclaw/niche/` with advisory lock on `active-stack-state.json`.
5. **CI matrix entry**: `pnpm test:niche` runs via `vitest.niche.config.ts` as a matrix entry in `.github/workflows/ci.yml` (line 155).

What is missing: health checks, monitoring dashboard, alerting, runbooks, niche-specific doctor checks, log aggregation, metrics collection, graceful degradation, and capacity planning documentation.

### Gap Analysis

**No health check endpoint (Gap 1)**: The gateway has a `health` method but it checks gateway-level health only. There is no `niche.health` method that validates store accessibility, schema integrity, active-stack state, or version compatibility.

**No monitoring dashboard (Gap 2)**: The three UI views are informational tables. There is no time-series visualization of benchmark trends, promotion history, drift signals, or compilation cadence.

**No alerting (Gap 3)**: Lifecycle events fire into the plugin hook system but nothing aggregates or triggers notifications on drift detection, rollback events, failed benchmarks, or store corruption.

**No runbooks (Gap 4)**: No documented operational procedures exist anywhere in `docs/` for niche-specific failure modes.

**No dedicated CI pipeline (Gap 5)**: Niche tests run as a matrix entry in the main CI workflow but there is no gate on niche-specific coverage, schema validation, or store integrity checks as a required status check.

**No log aggregation (Gap 6)**: `createSubsystemLogger("niche/...")` writes to the same file/console as everything else. No structured query capability for niche events.

**No metrics collection (Gap 7)**: No counters track compilations, benchmarks, promotions, rollbacks, or store operations per time period.

**No niche-specific doctor checks (Gap 8)**: `src/commands/doctor.ts` orchestrates ~20 check modules but none inspect niche state.

**No graceful degradation (Gap 9)**: In `src/commands/agent.ts:751` and `src/auto-reply/reply/agent-runner.ts:260`, `resolveActiveNicheStackForRun` calls `getActiveNicheRuntimeState` which reads from the file store. If the store file is corrupted or inaccessible, the read throws and propagates to the agent runner with no try-catch. The `assertPreparedSeedReadiness` call at line 762 also throws on failure.

**No capacity planning (Gap 10)**: No documentation on store growth patterns, pruning guidance, or performance characteristics at scale.

---

### Implementation Plan

---

#### OR-01: Niche Health Check Endpoint

**Goal**: Add a `niche.health` gateway method that verifies the niche subsystem is operational.

**Files:**

- Create: `src/niche/health.ts` -- health check logic
- Modify: `src/gateway/server-methods/niche.ts` -- add `niche.health` handler
- Modify: `src/gateway/server-methods-list.ts` -- register `niche.health` in BASE_METHODS
- Create: `test/niche/health.test.ts` -- unit tests
- Modify: `src/gateway/server-methods.ts` -- ensure nicheHandlers includes new method

**Design:**
The `nicheHealthCheck(env)` function should:

1. Resolve `resolveNicheStoreRoots(env)` and verify the root directory exists and is writable.
2. Attempt to read `active-stack-state.json` and validate against `ActiveNicheRuntimeStateSchema`.
3. List programs directory and verify each file parses as valid JSON matching `NicheProgramSchema`.
4. Return a typed result: `{ status: "healthy" | "degraded" | "unhealthy", checks: Array<{ name: string, passed: boolean, message?: string }>, timestamp: string }`.

The gateway handler pattern follows `healthHandlers` in `src/gateway/server-methods/health.ts`, returning the result via `respond(true, result, undefined)`. On exception, return `respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, ...))`.

**Sequencing**: This is the foundational item. All other operational readiness tasks build on it.

---

#### OR-02: Niche Doctor Checks

**Goal**: Add niche-specific checks to `openclaw doctor` that detect store corruption, stale locks, orphan files, and schema drift.

**Files:**

- Create: `src/commands/doctor-niche.ts` -- niche doctor checks module
- Create: `src/commands/doctor-niche.test.ts` -- unit tests
- Modify: `src/commands/doctor.ts` -- call `noteNicheHealth(cfg, prompter)` alongside existing checks (after `noteStateIntegrity`)

**Design:**
Follow the exact pattern of `noteStateIntegrity` in `src/commands/doctor-state-integrity.ts`:

1. Accept `(cfg: OpenClawConfig, prompter: DoctorPrompterLike)`.
2. Resolve niche store root via `resolveNicheStateRoot(env)`.
3. Check store root exists and is writable.
4. Check for stale `.lock` files older than 5 minutes on `active-stack-state.json.lock`.
5. Validate `active-stack-state.json` schema if it exists.
6. Count programs, compilations, benchmark runs -- emit notes on empty store vs. populated.
7. Check for orphan files in manifests directories that do not reference known programs.
8. Offer to repair stale locks interactively (same pattern as orphan transcript archival in doctor-state-integrity.ts).
9. Use `note(warnings.join("\n"), "NicheClaw")` for output.

**Dependency**: OR-01 (reuse health check logic internally).

---

#### OR-03: Graceful Degradation in Agent Runner

**Goal**: Wrap niche stack resolution in try-catch so store failures do not crash the agent command.

**Files:**

- Modify: `src/commands/agent.ts` (around line 748-762) -- wrap in try-catch
- Modify: `src/auto-reply/reply/agent-runner.ts` (around line 258-270) -- wrap in try-catch
- Create: `test/niche/runtime/graceful-degradation.test.ts` -- tests for fallback behavior
- Modify: `src/niche/runtime/active-stack.ts` -- add safe wrapper function

**Design:**
Add a `safeResolveActiveNicheStackForRun` wrapper in `src/niche/runtime/active-stack.ts` that:

```
export function safeResolveActiveNicheStackForRun(params: ...): ResolvedActiveNicheStack | null {
  try {
    return resolveActiveNicheStackForRun(params);
  } catch (err) {
    log.warn(`Niche stack resolution failed, proceeding without niche: ${String(err)}`);
    return null;
  }
}
```

In both call sites (`agent.ts:751` and `agent-runner.ts:260`), replace `resolveActiveNicheStackForRun` with `safeResolveActiveNicheStackForRun`. Also wrap the `assertPreparedSeedReadiness` call in a similar guard. When niche resolution fails, the agent runs without niche specialization (the existing code already handles `null` return from this function).

Export from `src/niche/runtime/index.ts`.

**Dependency**: None (standalone safety improvement).

---

#### OR-04: Metrics Collection Infrastructure

**Goal**: Add in-process counters for niche operations, queryable via a gateway method and by the health check.

**Files:**

- Create: `src/niche/metrics.ts` -- in-memory counter registry
- Create: `test/niche/metrics.test.ts` -- unit tests
- Modify: `src/niche/runtime/lifecycle-events.ts` -- increment counters on event emission
- Modify: `src/gateway/server-methods/niche.ts` -- add `niche.metrics` handler
- Modify: `src/gateway/server-methods-list.ts` -- register `niche.metrics`

**Design:**
Create a simple in-memory counter map:

```
const counters = new Map<string, number>();
export function incrementNicheMetric(name: string, delta = 1): void { ... }
export function getNicheMetrics(): Record<string, number> { ... }
export function resetNicheMetrics(): void { ... } // for tests
```

Tracked metrics:

- `compilations_total`, `compilations_failed`
- `benchmarks_total`, `benchmarks_failed`
- `promotions_total`, `rollbacks_total`
- `monitor_assessments_total`, `monitor_rollbacks_triggered`
- `store_reads_total`, `store_writes_total`, `store_errors_total`
- `health_checks_total`

Increment in `emitNicheLifecycleEvent` based on `event_type`. The gateway handler returns `{ metrics: getNicheMetrics(), since: process_start_timestamp }`.

**Dependency**: None (standalone).

---

#### OR-05: Structured Log Aggregation for Niche Events

**Goal**: Persist niche lifecycle events to a dedicated JSONL log file for queryable post-hoc analysis.

**Files:**

- Create: `src/niche/event-log.ts` -- JSONL append-only event log
- Create: `test/niche/event-log.test.ts` -- unit tests
- Modify: `src/niche/runtime/lifecycle-events.ts` -- append to event log after validation
- Modify: `src/niche/store/paths.ts` -- add `resolveNicheEventLogPath`

**Design:**
The event log file lives at `<niche_root>/event-log.jsonl`. Each line is a JSON-serialized lifecycle event with its full envelope (event_id, event_type, occurred_at, etc.).

```
export function appendNicheEventLog(event: LifecycleEvent, env?: NodeJS.ProcessEnv): void {
  const logPath = resolveNicheEventLogPath(env);
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); }
  fs.appendFileSync(logPath, JSON.stringify(event) + "\n", "utf8");
}
export function readNicheEventLog(env?: NodeJS.ProcessEnv, limit?: number): LifecycleEvent[] { ... }
```

In `emitNicheLifecycleEvent`, after schema validation succeeds (line 45 of lifecycle-events.ts), call `appendNicheEventLog(event, env)` before the hook runner call. This ensures events are persisted even if no hook subscribers exist.

Add a `niche.events.list` gateway handler to query events with optional `since` timestamp filter. Register in server-methods-list.ts.

**Dependency**: None (standalone).

---

#### OR-06: Alerting via Lifecycle Hook and CLI Notifications

**Goal**: Provide built-in alerting for critical niche events (drift breach, rollback, benchmark failure, store corruption).

**Files:**

- Create: `src/niche/alerts.ts` -- alert evaluation and emission logic
- Create: `test/niche/alerts.test.ts` -- unit tests
- Modify: `src/niche/runtime/lifecycle-events.ts` -- trigger alert evaluation after event emission
- Modify: `src/niche/release/monitor-service.ts` -- emit alert on rollback trigger

**Design:**
Define alert severity levels: `critical`, `warning`, `info`. Alert conditions:

- `critical`: `candidate_rolled_back` event, store read/write failure, health check `unhealthy`
- `warning`: monitor assessment with breached dimensions (but no rollback yet), benchmark case with `invalidated: true`
- `info`: `candidate_promoted`, compilation completed

The alert system:

1. Evaluates conditions in `shouldEmitNicheAlert(event)`.
2. Writes alert to the event log with an `alert_` prefix type.
3. Emits a `niche_alert` through the subsystem logger at the appropriate level (error/warn/info).
4. Provides a gateway method `niche.alerts.list` that reads alert events from the event log.

For operator notification, leverage the existing `emitDiagnosticEvent` infrastructure (`src/infra/diagnostic-events.ts`) so alerts appear in the gateway event stream and web UI.

**Dependency**: OR-05 (event log), OR-04 (metrics for health-triggered alerts).

---

#### OR-07: Monitoring Dashboard Views

**Goal**: Add time-series visualization views for benchmark trends, promotion history, and drift signals to the web UI.

**Files:**

- Create: `ui/src/ui/views/niche/NicheMonitoring.ts` -- monitoring dashboard view
- Modify: `ui/src/ui/controllers/niche.ts` -- add `loadNicheMonitoring` function
- Modify: `ui/src/ui/navigation.ts` -- add `niche-monitoring` tab
- Modify: `ui/src/ui/app.ts` -- wire up new view
- Modify: `ui/src/ui/app-view-state.ts` -- add monitoring state
- Modify: `ui/src/ui/app-render.ts` -- render monitoring view
- Modify: `ui/src/i18n/locales/en.ts` -- add i18n strings

**Design:**
The monitoring view renders:

1. **Summary cards**: total programs, active stacks, total benchmarks, recent rollbacks (counts from `niche.metrics`).
2. **Benchmark trend table**: last N benchmark results sorted by `createdAt` with mean delta column, showing improvement/regression indicators.
3. **Promotion history table**: events from event log filtered to `candidate_promoted` and `candidate_rolled_back`, showing timeline.
4. **Alert feed**: recent alerts from `niche.alerts.list`, color-coded by severity.
5. **Health status indicator**: result from `niche.health`, showing green/yellow/red chip.

Uses the existing Lit `html` template pattern exactly as `NichePrograms.ts`, `NicheBenchmarks.ts`, and `NicheRuntime.ts`. Data fetched via gateway client using the new `niche.metrics`, `niche.events.list`, `niche.alerts.list`, and `niche.health` endpoints.

Add tab registration: `{ label: "nicheclaw", tabs: ["niche-programs", "niche-benchmarks", "niche-runtime", "niche-monitoring"] }` in `ui/src/ui/navigation.ts`.

**Dependency**: OR-01 (health), OR-04 (metrics), OR-05 (event log), OR-06 (alerts).

---

#### OR-08: Operational Runbooks

**Goal**: Create comprehensive runbook documentation for all NicheClaw operational failure modes.

**Files:**

- Create: `docs/niche/runbooks/benchmark-failed.md`
- Create: `docs/niche/runbooks/drift-detected.md`
- Create: `docs/niche/runbooks/rollback-triggered.md`
- Create: `docs/niche/runbooks/store-corrupted.md`
- Create: `docs/niche/runbooks/compilation-failed.md`
- Create: `docs/niche/runbooks/health-check-degraded.md`
- Create: `docs/niche/runbooks/index.md` -- overview and quick-reference table

**Design:**
Each runbook follows a standard format:

```
# [Title]
## Symptoms
## Diagnosis Steps
## Resolution
## Prevention
## Escalation
```

Specific runbook content:

**benchmark-failed.md**: How to identify which cases failed, check grader configuration, re-run individual cases, verify baseline/candidate comparability.

**drift-detected.md**: How to read monitor assessment output, understand breached dimensions, check observation data, decide between re-benchmark and rollback.

**rollback-triggered.md**: What happens during rollback (overlay clearing, agent default reversion, release_mode set to rolled_back), how to verify rollback completed, how to re-promote after fixing the issue.

**store-corrupted.md**: How to run `openclaw doctor` niche checks, repair stale locks, rebuild state from traces, backup/restore procedures.

**compilation-failed.md**: Source ingestion errors, schema validation failures, missing source access manifests.

**health-check-degraded.md**: Interpreting health check results, store permission issues, schema version mismatches.

**Dependency**: OR-01 (health check referenced in runbooks), OR-02 (doctor checks referenced).

---

#### OR-09: Enhanced CI Pipeline for Niche Tests

**Goal**: Strengthen the niche CI pipeline with coverage gates, schema validation, and store integrity checks.

**Files:**

- Modify: `.github/workflows/ci.yml` -- enhance niche matrix entry
- Modify: `vitest.niche.config.ts` -- add coverage thresholds
- Create: `scripts/niche-ci-checks.ts` -- pre-test validation script

**Design:**
The existing CI matrix entry at line 155 runs `pnpm test:niche`. Enhance it:

1. **Coverage thresholds**: Add to `vitest.niche.config.ts`:

```
coverage: {
  provider: 'v8',
  thresholds: { lines: 70, branches: 70, functions: 70, statements: 70 },
  include: ['src/niche/**/*.ts'],
}
```

2. **Schema validation gate**: Add `scripts/niche-ci-checks.ts` that:
   - Imports all niche schemas and validates they compile without errors.
   - Verifies schema backward compatibility by checking no required fields were removed.
   - Runs as a pre-step before `pnpm test:niche`.

3. **CI matrix enhancement**: Change the niche command to:

```
command: node --import tsx scripts/niche-ci-checks.ts && pnpm test:niche --coverage
```

4. **Store integrity smoke test**: Add a test that creates a temp niche store, writes sample data through all store modules, then runs the health check against it.

**Dependency**: OR-01 (health check used in smoke test).

---

#### OR-10: Capacity Planning and Store Pruning

**Goal**: Document store growth patterns, add pruning utilities, and provide performance guidance.

**Files:**

- Create: `docs/niche/capacity-planning.md` -- growth patterns and guidance
- Create: `src/niche/store/pruning.ts` -- store pruning utilities
- Create: `test/niche/store/pruning.test.ts` -- unit tests
- Modify: `src/commands/niche/inspect.ts` -- add `--store-stats` flag to show store size

**Design:**

**capacity-planning.md** covers:

- Expected file counts per store directory at various scales (10, 100, 1000 programs).
- Approximate storage per file type (programs ~2KB, compilations ~5KB, benchmark runs ~10KB, traces ~50KB, manifests ~3KB).
- Growth rate formulas: trace files grow linearly with run count, benchmark runs grow with optimization cycles.
- Recommended pruning intervals: traces older than 90 days, rolled-back stacks older than 30 days.
- Performance notes: file-system scan time grows linearly, lock contention increases with concurrent agents.

**pruning.ts** provides:

```
export function pruneOldTraces(params: { olderThanDays: number, dryRun?: boolean, env?: ProcessEnv }): PruneResult
export function pruneRolledBackStacks(params: { olderThanDays: number, dryRun?: boolean, env?: ProcessEnv }): PruneResult
export function getStoreStatistics(env?: ProcessEnv): StoreStatistics
```

`getStoreStatistics` returns file counts and total size per subdirectory. This powers both the `--store-stats` CLI flag and the health check degraded-state detection (store approaching capacity).

The `niche inspect --store-stats` output shows a table of subdirectory name, file count, total size, and oldest/newest file timestamps.

**Dependency**: None (standalone).

---

### Implementation Sequencing

**Phase 1 (Sequential -- foundational infrastructure):**

1. OR-01: Health check endpoint (foundation for everything)
2. OR-03: Graceful degradation (immediate safety improvement)
3. OR-04: Metrics collection (foundation for monitoring)
4. OR-05: Event log (foundation for alerting and dashboard)

**Phase 2 (Parallel -- can be developed independently):**

- OR-02: Doctor checks (depends on OR-01)
- OR-06: Alerting (depends on OR-04, OR-05)
- OR-08: Runbooks (depends on OR-01, OR-02 for content references)
- OR-10: Capacity planning (standalone)

**Phase 3 (Integration):**

- OR-07: Monitoring dashboard (depends on OR-01, OR-04, OR-05, OR-06)
- OR-09: Enhanced CI (depends on OR-01)

### Critical Files for Implementation

- `src/niche/store/paths.ts` - Store path resolution; extended for event log path and used by health checks
- `src/niche/runtime/lifecycle-events.ts` - Event emission entry point; modified by OR-04, OR-05, OR-06 to tap into every lifecycle event
- `src/gateway/server-methods/niche.ts` - All new gateway endpoints (health, metrics, events, alerts) are added here
- `src/commands/doctor.ts` - Doctor orchestrator; modified to include niche checks (OR-02)
- `src/niche/runtime/active-stack.ts` - Stack resolution logic; modified for graceful degradation (OR-03)
