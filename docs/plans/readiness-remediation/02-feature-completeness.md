# Feature Completeness Remediation Plan (78 → 100)

## Current Score: 78/100

## Target Score: 100/100

## Gap Analysis

The NicheClaw implementation has all 12 CLI commands, core subsystems (schema, domain, benchmark, optimizer, release, runtime, store, verifier, action-policy), 18 gateway handlers, and 3 UI views. However, eight specific gaps prevent a perfect feature completeness score:

| Gap ID | Gap                                         | Severity | Points |
| ------ | ------------------------------------------- | -------- | ------ |
| FC-01  | `Type.Any()` in compile-record schema       | Low      | 2      |
| FC-02  | No canary/shadow traffic routing            | High     | 5      |
| FC-03  | Only OpenAI tuning adapter                  | Medium   | 3      |
| FC-04  | No `niche export` / `niche import` commands | Medium   | 3      |
| FC-05  | No `niche status` command                   | Medium   | 3      |
| FC-06  | No batch operations                         | Low      | 2      |
| FC-07  | No artifact garbage collection              | Medium   | 3      |
| FC-08  | Shallow gateway input validation            | Low      | 1      |

## Remediation Items

### FC-01: Replace Type.Any() in compile-record schema with typed CompiledDomainConfigSchema

- **Problem:** `src/niche/schema/compile-record.ts:23` uses `Type.Optional(Type.Any())` for `compiled_domain_config`. This violates the codebase's strict-typing policy (CLAUDE.md: "Prefer strict typing; avoid `any`") and the schema strictness required for promotion-gating. The actual runtime type is `CompiledDomainConfig` from `src/niche/domain/compiled-config.ts`, which is a well-defined shape with `planner`, `tools`, `observation`, `retrieval`, `exemplars`, and `constraints` fields.

- **Solution:** Create a TypeBox schema (`CompiledDomainConfigSchema`) in a new file `src/niche/schema/compiled-domain-config.ts` that mirrors the `CompiledDomainConfig` TypeScript type from `src/niche/domain/compiled-config.ts`. Then replace `Type.Optional(Type.Any())` with `Type.Optional(CompiledDomainConfigSchema)` in `compile-record.ts`. The sub-schemas (PlannerDirectivesSchema, ToolDirectiveSchema, ObservationDirectiveSchema, RetrievalDirectiveSchema, ExemplarDirectiveSchema, ConstraintEnforcementDirectiveSchema) must each be defined as `Type.Object` with `{ additionalProperties: false }` following the existing pattern in domain-pack.ts and release.ts.

- **Files to create/modify:**
  - Create: `src/niche/schema/compiled-domain-config.ts` (TypeBox schemas for each directive type)
  - Modify: `src/niche/schema/compile-record.ts` (import and use the new schema)
  - Modify: `src/niche/schema/index.ts` (re-export new schema and types)

- **Acceptance Criteria:**
  - `compiled_domain_config` field uses a strict TypeBox schema, not `Type.Any()`
  - `grep -r "Type.Any" src/niche/` returns zero results
  - Existing tests continue to pass
  - TypeBox validation rejects invalid compiled domain configs

- **Effort:** S

- **Dependencies:** None

---

### FC-02: Implement canary/shadow traffic routing in the runtime

- **Problem:** The PRD (Section 2.1) defines four benchmark modes: `offline_gold`, `offline_shadow`, `live_shadow`, and `live_canary`. The schema already includes these values in `BENCHMARK_MODES` at `src/niche/schema/benchmark.ts:13-18`, and the activation schema at `src/niche/schema/activation.ts:10` includes `"shadow"`, `"canary"`, `"live"`, `"rolled_back"` as release modes. The policy engine at `src/niche/release/policy-engine.ts` correctly evaluates shadow evidence and can recommend `"shadow"` or `"canary"` decisions. The release controller at `src/niche/release/release-controller.ts:30-43` maps `"shadow"` to the `"shadow"` release mode and `"canary"` to the `"canary"` release mode. However, the runtime stack resolver at `src/niche/runtime/active-stack.ts:50` only distinguishes between `shadow` (produces benchmark-grade traces) and everything else (produces live traces). There is no canary-specific traffic splitting, percentage-based routing, or shadow-mode output suppression. The current implementation promotes or rolls back -- there is no intermediate canary stage with percentage-based traffic diversion.

- **Solution:** Implement two capabilities:
  1. **Shadow routing with output suppression:** When a stack's `release_mode` is `"shadow"`, the runtime should execute the candidate stack in parallel with the baseline (or after the baseline response is already served), capture the run trace, but never surface the candidate output to the user. This requires:
     - A new `src/niche/runtime/shadow-executor.ts` that accepts the resolved candidate seed, executes it in the background via the agent path, captures the run trace, and discards the user-facing output.
     - Integration in the auto-reply path (`src/auto-reply/reply/agent-runner.ts`) to detect when a shadow stack is resolved alongside the primary stack and fork execution.

  2. **Canary routing with percentage-based diversion:** When a stack's `release_mode` is `"canary"`, only a configurable percentage of requests should use the candidate. This requires:
     - Adding a `canary_traffic_percentage` field (0-100, integer) to the `ActiveNicheStackRecordSchema` in `src/niche/schema/runtime-stack.ts`.
     - A canary router function in `src/niche/runtime/canary-router.ts` that deterministically decides (based on a hash of `runId + activeStackId`) whether a given request should go to canary or fallback to baseline.
     - Modification of `resolveActiveNicheStackForRun` in `active-stack.ts` to check the canary percentage and potentially skip the canary stack for non-selected requests.

  3. **Gateway handlers:** Add `niche.runtime.shadow.enqueue` and `niche.runtime.canary.configure` handlers.

- **Files to create/modify:**
  - Create: `src/niche/runtime/shadow-executor.ts`
  - Create: `src/niche/runtime/canary-router.ts`
  - Modify: `src/niche/schema/runtime-stack.ts` (add `canary_traffic_percentage` to `ActiveNicheStackRecordSchema`)
  - Modify: `src/niche/runtime/active-stack.ts` (canary routing logic in `resolveActiveNicheStackForRun`)
  - Modify: `src/niche/release/release-controller.ts` (set canary percentage on actuation)
  - Modify: `src/gateway/server-methods/niche.ts` (new handlers)
  - Modify: `src/gateway/server-methods-list.ts` (register handlers)
  - Create: `test/niche/runtime/shadow-executor.test.ts`
  - Create: `test/niche/runtime/canary-router.test.ts`

- **Acceptance Criteria:**
  - A stack in `"shadow"` release mode produces run traces but does not surface output to the user
  - A stack in `"canary"` release mode routes a configurable percentage of traffic to the candidate
  - Non-canary requests for a canary stack fall through to the next resolution source (agent default baseline)
  - Shadow and canary benchmark results can be collected and fed into the policy engine
  - All existing release/rollback flows continue to work

- **Effort:** L

- **Dependencies:** None (the schema values and policy engine support already exist)

---

### FC-03: Add Anthropic and Google provider-native tuning adapters

- **Problem:** `src/niche/optimizer/tuning-adapters.ts` defines the `ProviderNativeTuningAdapter` interface and provides only `OpenAiNativeTuningAdapter`. The PRD's specialization lanes include provider-native customization for any provider that supports it. The `getDefaultTuningAdapters()` function at line 60-62 returns only the OpenAI adapter. The tuning planner at `src/niche/optimizer/tuning-planner.ts` is already generic and works with any adapter that implements the interface.

- **Solution:** Add two new adapter classes in `src/niche/optimizer/tuning-adapters.ts`:
  1. **`AnthropicNativeTuningAdapter`** - matches `provider === "anthropic"`, returns job plans with `adapter_id: "anthropic-native-tuning"`, `required_credentials: ["ANTHROPIC_API_KEY"]`, and `metadata_quality` from the capability.
  2. **`GoogleNativeTuningAdapter`** - matches `provider === "google"`, returns job plans with `adapter_id: "google-native-tuning"`, `required_credentials: ["GOOGLE_API_KEY"]`, and appropriate metadata quality.

  Update `getDefaultTuningAdapters()` to return all three adapters. Also add corresponding `ProviderTuningCapability` factory presets in `src/niche/optimizer/tuning-capabilities.ts` for quick setup.

- **Files to create/modify:**
  - Modify: `src/niche/optimizer/tuning-adapters.ts` (add two classes, update `getDefaultTuningAdapters`)
  - Modify: `src/niche/optimizer/tuning-capabilities.ts` (add factory functions for Anthropic/Google capabilities)
  - Modify: `src/niche/optimizer/index.ts` (export new adapters)
  - Create: `test/niche/optimizer/tuning-adapters.test.ts` (unit tests for all three adapters)

- **Acceptance Criteria:**
  - `getDefaultTuningAdapters()` returns OpenAI, Anthropic, and Google adapters
  - `buildProviderNativeTuningJobPlan` succeeds for all three providers when capability matches
  - `selectTuningPlan` selects provider-native lane for Anthropic/Google when rights and policy allow
  - Existing OpenAI adapter behavior is unchanged

- **Effort:** S

- **Dependencies:** None

---

### FC-04: Implement `niche export` and `niche import` CLI commands

- **Problem:** There is no way to export a NicheClaw specialization (program + compilation + artifacts + benchmark results) as a portable bundle or import one from another installation. The store at `src/niche/store/paths.ts` defines 14 store roots, but there is no serialization/deserialization for cross-machine portability. This is a significant gap for teams that need to share specializations across environments (dev, staging, production).

- **Solution:** Implement a portable archive format and two CLI commands:
  1. **Export bundle format:** A single `.tar.gz` (or `.zip` on Windows) containing:
     - `manifest.json`: bundle metadata (export timestamp, NicheClaw version, program IDs, artifact count)
     - `programs/`: NicheProgram JSON files
     - `compilations/`: NicheCompilationRecord JSON files
     - `artifacts/`: Artifact registry records
     - `manifests/`: Baseline and candidate manifest files
     - `benchmark-runs/`: BenchmarkResultRecord files
     - `readiness-reports/`: ReadinessReport files
     - `lineage/`: Lineage edge files
     - `domain-packs/`: DomainPack files

  2. **`niche export` command:**
     - `--niche-program-id <id>` (required, repeatable for batch)
     - `--out <path>` (output archive path)
     - `--include-traces` (optional, includes run traces)
     - `--include-replay-bundles` (optional, includes replay bundles)
     - Walks the dependency graph from program to all referenced artifacts
     - Validates all exported artifacts against their TypeBox schemas

  3. **`niche import` command:**
     - `--archive <path>` (required, path to the export archive)
     - `--dry-run` (preview what would be imported)
     - `--force` (overwrite existing artifacts)
     - Validates bundle manifest and all contained artifacts
     - Uses `ensureStored*` functions from the store to deduplicate

  4. **Core module:** `src/niche/store/portable-bundle.ts` with `exportNicheBundle` and `importNicheBundle` functions.

- **Files to create/modify:**
  - Create: `src/niche/store/portable-bundle.ts` (core export/import logic)
  - Create: `src/commands/niche/export.ts` (CLI command implementation)
  - Create: `src/commands/niche/import.ts` (CLI command implementation)
  - Modify: `src/cli/program/register.niche.ts` (register new subcommands)
  - Modify: `src/gateway/server-methods/niche.ts` (add `niche.export` and `niche.import` handlers)
  - Modify: `src/gateway/server-methods-list.ts` (register handlers)
  - Create: `test/niche/store/portable-bundle.test.ts`
  - Create: `test/niche/commands/export-import.test.ts`

- **Acceptance Criteria:**
  - `openclaw niche export --niche-program-id X --out bundle.tar.gz` produces a valid archive
  - `openclaw niche import --archive bundle.tar.gz` restores all artifacts
  - `openclaw niche import --archive bundle.tar.gz --dry-run` shows what would change
  - Round-trip: export then import on a clean store produces identical artifacts
  - Schema validation on both export and import
  - Duplicate detection via content hashes on import

- **Effort:** L

- **Dependencies:** None

---

### FC-05: Implement `niche status` CLI command

- **Problem:** There is no single command that shows an overview of all niche programs and their lifecycle state. Operators must run `niche inspect`, check the gateway, and manually correlate program, compilation, readiness, benchmark, and runtime state. The 12 existing commands are task-specific but no command provides a dashboard view.

- **Solution:** Implement `openclaw niche status` that aggregates state from all store modules:
  1. Lists all programs with their latest compilation status
  2. Shows readiness gate status per program
  3. Shows active runtime stacks and their release modes
  4. Shows recent benchmark results (last N per program)
  5. Shows optimizer job status
  6. Flags stale artifacts (no benchmark in N days) and programs with hard blockers

  The command should support `--niche-program-id <id>` to filter to one program, `--json` for structured output, and plain text table output by default (using `src/terminal/table.ts`).

- **Files to create/modify:**
  - Create: `src/commands/niche/status.ts` (command implementation)
  - Modify: `src/cli/program/register.niche.ts` (register subcommand)
  - Modify: `src/gateway/server-methods/niche.ts` (add `niche.status` handler)
  - Modify: `src/gateway/server-methods-list.ts` (register handler)
  - Create: `test/niche/commands/status.test.ts`

- **Acceptance Criteria:**
  - `openclaw niche status` shows a table of all programs with columns: program_id, version, readiness, active stack, release mode, last benchmark delta, last compile timestamp
  - `openclaw niche status --niche-program-id X` filters to one program with expanded detail
  - `openclaw niche status --json` outputs structured JSON
  - Works when store is empty (shows "no programs")
  - Performance: completes in < 2 seconds for 50 programs

- **Effort:** M

- **Dependencies:** None

---

### FC-06: Add batch operations for multi-program workflows

- **Problem:** Each CLI command operates on a single program/artifact. Operators managing multiple niches must script loops manually. Common batch operations (compile all, benchmark all, check readiness for all) have no native support.

- **Solution:** Add `--all` and `--program-filter <glob>` flags to the following commands:
  - `niche compile --all` compiles all stored programs
  - `niche readiness --all` checks readiness for all programs
  - `niche benchmark --all` runs benchmarks for all programs that have compilations
  - `niche status --all` is already implicit (default behavior)

  Implementation approach:
  - Create `src/niche/batch/batch-executor.ts` with a generic `executeBatch` function that:
    - Lists programs matching the filter
    - Executes the command for each
    - Collects results with per-program success/failure
    - Reports aggregate summary
  - Add `--concurrency <n>` flag to control parallelism (default 1, max 4)

- **Files to create/modify:**
  - Create: `src/niche/batch/batch-executor.ts`
  - Modify: `src/commands/niche/compile.ts` (add batch path)
  - Modify: `src/commands/niche/readiness.ts` (add batch path)
  - Modify: `src/commands/niche/benchmark.ts` (add batch path)
  - Modify: `src/cli/program/register.niche.ts` (add --all, --program-filter flags)
  - Create: `test/niche/batch/batch-executor.test.ts`

- **Acceptance Criteria:**
  - `openclaw niche compile --all --source ./sources/*.json` compiles all programs
  - `openclaw niche readiness --all` shows readiness for all programs
  - `--program-filter "repo-*"` limits to matching program IDs
  - Failures in one program do not stop batch execution
  - Aggregate exit code reflects worst individual result

- **Effort:** M

- **Dependencies:** FC-05 (status command shares the all-programs listing logic)

---

### FC-07: Implement artifact garbage collection

- **Problem:** The artifact store at `src/niche/store/paths.ts` defines 14 store root directories. Old artifacts (benchmark runs, traces, replay bundles, stale compilation records) accumulate indefinitely. There is no mechanism to identify unreferenced artifacts or reclaim disk space.

- **Solution:** Implement a `niche gc` subcommand with a mark-and-sweep collector:
  1. **Mark phase (`src/niche/store/gc-collector.ts`):**
     - Walk all active stacks to find referenced candidate/baseline manifest IDs
     - Walk all programs to find latest compilations
     - Walk lineage graph to find all artifact IDs reachable from live/recent manifests
     - Mark all artifacts, traces, replay bundles, and benchmark runs that are reachable from any active or recent N releases
     - Everything unmarked is a GC candidate

  2. **Sweep phase:**
     - `--dry-run` (default): list what would be deleted with sizes
     - `--execute`: delete unreferenced files
     - `--keep-last <n>`: keep the last N versions of each artifact type (default 3)
     - `--keep-days <n>`: keep anything created within the last N days (default 30)
     - `--protect-promoted`: never GC artifacts referenced by any active promoted stack (always on)

  3. **CLI command:** `openclaw niche gc [--dry-run] [--execute] [--keep-last N] [--keep-days N] [--json]`

- **Files to create/modify:**
  - Create: `src/niche/store/gc-collector.ts` (mark-and-sweep logic)
  - Create: `src/commands/niche/gc.ts` (CLI command)
  - Modify: `src/cli/program/register.niche.ts` (register subcommand)
  - Modify: `src/gateway/server-methods/niche.ts` (add `niche.gc.preview` handler)
  - Modify: `src/gateway/server-methods-list.ts` (register handler)
  - Create: `test/niche/store/gc-collector.test.ts`

- **Acceptance Criteria:**
  - `openclaw niche gc --dry-run` lists unreferenced artifacts with sizes, deletes nothing
  - `openclaw niche gc --execute` removes only unreferenced artifacts
  - Promoted stacks' artifacts are never collected
  - `--keep-last 3` retains the 3 most recent versions of each artifact
  - `--keep-days 30` retains anything less than 30 days old
  - GC is idempotent (running twice produces same result)

- **Effort:** M

- **Dependencies:** None

---

### FC-08: Add TypeBox validation for gateway `niche.monitor.assess` inputs

- **Problem:** The `niche.monitor.assess` handler at `src/gateway/server-methods/niche.ts:286-325` does presence checks (`typeof params.definition !== "object"`, `typeof params.observation !== "object"`) and shallow field checks (`!definition.monitor || !definition.cadence_defaults`) but does not perform full TypeBox schema validation. It casts `params.definition as PromotedMonitorDefinition` and `params.observation` without schema validation, trusting the caller. Other store modules (program-store, artifact-registry, replay-bundle) consistently use `validateJsonSchemaValue` for all inputs.

- **Solution:**
  1. Create TypeBox schemas for `PromotedMonitorDefinition` and `PromotedMonitorObservation` in `src/niche/release/promoted-monitor.ts` (they currently exist only as TypeScript types).
  2. In `niche.monitor.assess`, replace the shallow checks with `validateJsonSchemaValue` calls using the new schemas.
  3. Apply the same pattern to validate `niche.release.rollback` inputs more strictly (currently uses `assertString` but not full schema validation for the params object).

- **Files to create/modify:**
  - Modify: `src/niche/release/promoted-monitor.ts` (add `PromotedMonitorDefinitionSchema`, `PromotedMonitorObservationSchema`, `PromotedMonitorCadenceDefaultsSchema`)
  - Modify: `src/gateway/server-methods/niche.ts` (use `validateJsonSchemaValue` in `niche.monitor.assess` and `niche.release.rollback`)
  - Modify: `src/niche/release/index.ts` (export new schemas)

- **Acceptance Criteria:**
  - `niche.monitor.assess` rejects malformed `definition` or `observation` with specific validation error messages
  - `niche.release.rollback` validates all required string fields via schema
  - No existing valid calls are broken (backward compatible)
  - Error messages include field paths from TypeBox validation

- **Effort:** S

- **Dependencies:** None

---

## Implementation Sequencing

The remediation items should be implemented in the following order to minimize risk and maximize early value:

1. **FC-01** (S) -- Immediate win. Eliminates the only `Type.Any()` in the schema layer. No dependencies.
2. **FC-08** (S) -- Immediate win. Strengthens gateway validation. No dependencies.
3. **FC-03** (S) -- Quick adapter additions. Extends provider coverage. No dependencies.
4. **FC-05** (M) -- Provides the status dashboard that operators need before batch operations.
5. **FC-07** (M) -- Artifact GC enables safe long-running deployments.
6. **FC-06** (M) -- Batch operations build on the program listing from FC-05.
7. **FC-04** (L) -- Export/import is high value but more complex. Benefits from GC (FC-07) being done first so exports are clean.
8. **FC-02** (L) -- Canary/shadow routing is the most complex item and benefits from all other items being stable.

Total estimated effort: 3S + 3M + 2L

---

### Critical Files for Implementation

- `src/niche/schema/compile-record.ts` - Contains the only `Type.Any()` violation; FC-01 modifies this directly
- `src/niche/runtime/active-stack.ts` - Core traffic routing logic; FC-02 must add canary/shadow awareness here
- `src/niche/optimizer/tuning-adapters.ts` - FC-03 adds Anthropic/Google adapters alongside existing OpenAI adapter
- `src/niche/store/paths.ts` - Defines all 14 store roots; FC-04 and FC-07 both need to traverse these comprehensively
- `src/gateway/server-methods/niche.ts` - All 18 niche handlers live here; FC-08 hardens validation, FC-02/04/05/07 add new handlers
