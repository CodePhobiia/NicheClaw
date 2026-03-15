# NicheClaw Audit Remediation Design

**Goal:** Close all 15 findings from the LLM-agent failure modes audit so NicheClaw can credibly claim benchmarkable specialization.

**Approach:** Hybrid — sequential for Critical/High fixes touching shared infrastructure, then parallel for isolated Medium/Low fixes.

---

## Phase 1: Sequential Critical/High Fixes

### Fix 1: F-04 — Atomic Writes

- Replace `fs.writeFileSync` with write-to-temp-then-rename in `src/infra/json-file.ts`
- 3 lines changed in 1 file

### Fix 2: F-06 — Rollback Deactivation

- Add `"rolled_back"` to `NicheStackReleaseModeSchema` in `src/niche/schema/activation.ts`
- Set `release_mode: "rolled_back"` in `executeRollback` in `release-controller.ts`
- Skip `rolled_back` stacks in `resolveActiveNicheStackForRun` in `active-stack.ts`

### Fix 3: F-02 — Contamination Controls

- Make drift params required in `runAtomicBenchmark`/`runEpisodeBenchmark` (remove self-defaults)
- Add `detectContamination` function in `live-benchmark.ts` that cross-checks eval case splits against compilation source zones
- Replace hardcoded `contamination_detected: false` with computed result

### Fix 4: F-03 — Grader Calibration Gate

- Extend `evaluateReleasePolicy` params to accept `graderCalibrationRecords`
- Add blocking reason when `promotionEligible === false`
- Add warning when no calibration records provided
- Wire `niche release` CLI to pass calibration records through

### Fix 5: F-05 — Bootstrap CI Gating

- Change default `min_confidence_interval_low` from 0 to 0.001
- Add single-cluster dominance check: block when one task family contributes >70% of positive delta

### Fix 6: F-01 — Wire 5 Runtime Modules

- **Planner injection:** Call `buildNichePlannerPromptBlock(runId)` in `resolvePromptBuildHookResult` in `attempt.ts`, return as `appendSystemContext`
- **Tool ranking:** Sort `subagentFiltered` by `rankToolsForNicheRun` in `pi-tools.ts` between lines 598-600
- **Observation processor:** Call `annotateToolResult` in tool result handler after `recordToolExecutionResult`
- **Constraint enforcer:** Call `checkDomainConstraints` in `delivery.ts` before `maybeRunNicheVerifierGate`
- **Repair guidance:** Attach `buildDomainRepairPrompt` result to gated payloads when `action === "repair_requested"`

### Fix 7: F-07 — Un-skip Teacher Rollout Tests

- Update test fixtures to match current CLI validation contract
- Change `it.skip` back to `it`
- Tighten rollout request schema with `additionalProperties: false` if needed

### Fix 8: F-08 — Replace Synthetic Readiness Scores

- `contradiction_rate`: pairwise source comparison (token overlap + contradictory metadata)
- `source_coverage`: distinct source_kind count / total kinds
- `task_observability`: tools-to-task-types ratio
- `benchmarkability`: graduated seed count (25 per seed)

---

## Phase 2: Parallel Medium/Low Fixes

### F-09: Episode Case Schema

- Define `EpisodeBenchmarkCaseSchema` in `schema/benchmark.ts`
- Replace `Type.Any()` in `episode-runner.ts:65`

### F-10: File Lock on Active Stack State

- Add advisory lock around read-modify-write in `active-stack-store.ts`

### F-11: Gateway Scope Classification

- Add niche read methods to `operator.read` scope in `method-scopes.ts`
- Add niche write methods to `operator.write` scope

### F-12: Dead Default Constraint

- Rewrite default constraint in `compiler.ts` to use `must_not_include:` prefix

### F-13: Gateway Monitor Schema Validation

- Add `validateJsonSchemaValue` call in `niche.monitor.assess` handler

### F-14: Live Benchmark Grading

- Route grading through grader registry in `live-benchmark.ts`
- Fallback to substring matching with warning

### F-15: model_snapshot_id Documentation

- Auto-downgrade `provider_metadata_quality` when `model_snapshot_id` absent
- In `manifest-builder.ts` and `baseline-snapshot.ts`
