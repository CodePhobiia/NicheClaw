# NicheClaw Blindspot Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all six blindspots identified by the product inference audit, making NicheClaw a usable product with a proven end-to-end pipeline, guided creation, real optimizer execution, visual dashboard, clear identity, and persistence guardrails.

**Architecture:** Spine-first — prove the pipeline connects via an e2e test, then build guided flows that follow the proven path, then surface the state visually. All new code uses existing store/schema/runtime modules. No new persistence layers or platform abstractions.

**Tech Stack:** TypeScript ESM, Vitest, @clack/prompts for interactive CLI, existing ui/ web app for dashboard views, existing gateway methods for API layer.

**Design doc:** `docs/plans/2026-03-14-blindspot-remediation-design.md`

---

### Task 1: E2E Pipeline Test — Create Program and Compile Domain

**Files:**

- Create: `test/niche/e2e/full-pipeline.test.ts`

**Step 1: Write the test scaffold with program creation and compilation**

```typescript
import { describe, expect, it, vi } from "vitest";
import type { NicheProgram } from "../../../src/niche/schema/index.js";
import { ensureStoredNicheProgram, getNicheProgram } from "../../../src/niche/store/index.js";
import { compileNicheProgramFlow } from "../../../src/niche/domain/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

function makeNicheProgram(): NicheProgram {
  return {
    niche_program_id: "e2e-repo-ci",
    name: "E2E Repo CI Specialist",
    objective: "Specialize in repo CI verification tasks.",
    risk_class: "low",
    runtime_stack: {
      planner_runtime: {
        component_id: "planner-primary",
        provider: "openai",
        model_id: "gpt-5",
        api_mode: "responses",
      },
      specialization_lanes: ["prompt_policy_assets"],
    },
    allowed_tools: ["exec", "read"],
    allowed_sources: [
      {
        source_id: "repo-doc",
        source_kind: "repos",
      },
    ],
    success_metrics: [
      {
        metric_id: "task-success",
        label: "Task success rate",
        objective: "maximize",
        target_description: "Above 90% on benchmark suite.",
        measurement_method: "Benchmark evaluation.",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "local",
      training_policy: "approved_only",
      benchmark_policy: "approved_only",
      retention_policy: "retain_for_90_days",
      redaction_policy: "none",
      pii_policy: "none",
      live_trace_reuse_policy: "benchmark_only",
      operator_review_required: false,
    },
  };
}

describe("NicheClaw full pipeline e2e", () => {
  it("runs create → compile → readiness → benchmark → release → promote → monitor → rollback", async () => {
    await withTempHome(async () => {
      // Stage 1: Create program
      const program = makeNicheProgram();
      ensureStoredNicheProgram(program, process.env);
      const stored = getNicheProgram("e2e-repo-ci", process.env);
      expect(stored).not.toBeNull();
      expect(stored!.niche_program_id).toBe("e2e-repo-ci");

      // Stage 2: Compile domain
      const sourceDescriptor = {
        sourceId: "repo-doc",
        sourceKind: "repos" as const,
        inputKind: "structured_text" as const,
        title: "Repository documentation",
        accessPattern: "read",
        rights: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: false,
          rights_to_generate_synthetic_from: true,
        },
        governedDataStatus: {
          data_zone: "dev",
          retention_policy: "retain_for_90_days",
          redaction_status: "clean",
          pii_status: "none",
          provenance_status: "verified",
          quarantined: false,
        },
        content: "Repository CI policy: all changes must pass tests before merge.",
      };

      const compiled = await compileNicheProgramFlow({
        nicheProgram: program,
        sourceDescriptors: [sourceDescriptor],
        env: process.env,
      });

      expect(compiled.compilation.readiness_report.status).toBeDefined();
      expect(compiled.compilation.domain_pack_artifact_ref).toBeDefined();

      // ... remaining stages added in subsequent tasks
    });
  });
});
```

**Step 2: Run test to verify Stage 1-2 passes**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/e2e/full-pipeline.test.ts`
Expected: PASS (program creation and compilation succeed)

**Step 3: Commit**

```bash
scripts/committer "test(niche): add e2e pipeline test — program creation and domain compilation" test/niche/e2e/full-pipeline.test.ts
```

---

### Task 2: E2E Pipeline Test — Readiness, Manifests, and Benchmark

**Files:**

- Modify: `test/niche/e2e/full-pipeline.test.ts`

**Step 1: Extend the e2e test with readiness check, manifest creation, and benchmark execution**

After the compilation stage, add:

```typescript
// Stage 3: Check readiness
const readinessReport = compiled.compilation.readiness_report;
expect(readinessReport.status).toBe("ready");

// Stage 4: Build manifests from compilation output
const baselineManifest = {
  baseline_manifest_id: "e2e-baseline",
  niche_program_id: "e2e-repo-ci",
  created_at: new Date().toISOString(),
  planner_runtime: program.runtime_stack.planner_runtime,
  provider: "openai",
  model_id: "gpt-5",
  model_snapshot_id: "gpt-5-2026-03-14",
  api_mode: "responses",
  provider_release_label: "gpt-5-2026-03-14",
  api_revision: "v1",
  capability_snapshot_at: new Date().toISOString(),
  provider_metadata_quality: "exact_snapshot",
  sampling_config: { temperature: 0.2 },
  prompt_asset_version: "e2e-baseline-v1",
  grader_set_version: "e2e-grader-set",
  benchmark_suite_id: "e2e-benchmark-suite",
  source_access_manifest_id: compiled.compilation.source_access_manifest.source_access_manifest_id,
  retry_policy: { max_attempts: 1 },
  token_budget: { max_total_tokens: 8000 },
  context_budget: { max_context_tokens: 16000 },
  execution_mode: "benchmark",
  tool_catalog_version: "e2e-tools-v1",
  tool_allowlist: ["exec", "read"],
  tool_contract_version: "e2e-tool-contract-v1",
  retrieval_config: { policy: "baseline" },
  verifier_config: { policy: "baseline" },
};
writeBaselineManifest(baselineManifest, process.env);

// Build candidate manifest referencing compilation artifacts
const candidateManifest = {
  ...baselineManifest,
  candidate_manifest_id: "e2e-candidate",
  based_on_baseline_manifest_id: "e2e-baseline",
  prompt_asset_version: "e2e-candidate-v1",
  domain_pack_id: compiled.compilation.domain_pack_artifact_ref.artifact_id,
  action_policy_id: "e2e-action-policy",
  retrieval_stack_id: "e2e-retrieval-stack",
  verifier_pack_id: "e2e-verifier-pack",
  optional_student_model_ids: [],
  candidate_recipe: "e2e-candidate-recipe",
};
delete (candidateManifest as Record<string, unknown>).baseline_manifest_id;
writeCandidateManifest(candidateManifest, process.env);

// Verify manifests are readable
expect(getBaselineManifest("e2e-baseline", process.env)).not.toBeNull();
expect(getCandidateManifest("e2e-candidate", process.env)).not.toBeNull();

// Stage 5: Write benchmark result record (synthetic — no real LLM call)
const benchmarkRecord = {
  benchmark_result_record_id: "e2e-benchmark-record",
  summary: {
    benchmark_result_id: "e2e-result-1",
    benchmark_suite_id: "e2e-benchmark-suite",
    case_kind: "atomic_case",
    mode: "offline_gold",
    baseline_arm_id: "e2e-baseline-arm",
    candidate_arm_id: "e2e-candidate-arm",
    primary_metric: "task_success",
    case_count: 50,
    paired_delta_summary: {
      mean_delta: 0.15,
      median_delta: 0.14,
      p10_delta: 0.05,
      p90_delta: 0.25,
      confidence_interval_low: 0.08,
      confidence_interval_high: 0.22,
    },
    task_family_summaries: [
      {
        task_family: "repo_ci_verification",
        case_count: 50,
        score_mean: 0.92,
        hard_fail_rate: 0.02,
        mean_delta: 0.15,
      },
    ],
    contamination_audit_summary: {
      contamination_detected: false,
      audited_case_count: 50,
    },
    invalidated: false,
    invalidation_reasons: [],
  },
  baseline_manifest_id: "e2e-baseline",
  candidate_manifest_id: "e2e-candidate",
  suite_hash: "e2e0123456789abcdef0123456789ab",
  fixture_version: "e2e-fixtures-v1",
  actual_suite_hash: "e2e0123456789abcdef0123456789ab",
  actual_fixture_version: "e2e-fixtures-v1",
  actual_grader_version: "e2e-grader-v1",
  case_membership_hash: "e2efedcba9876543210fedcba987654",
  run_trace_refs: ["e2e-trace-1"],
  replay_bundle_refs: ["e2e-replay-1"],
  evidence_bundle_ids: ["e2e-evidence-1"],
  arbitration_outcome_summary: {
    arbitration_policy_id: "e2e-arbitration",
    unresolved_blocking_conflicts: false,
    unresolved_conflict_count: 0,
    blocking_conflict_types: [],
  },
  created_at: new Date().toISOString(),
};
writeBenchmarkResultRecord(benchmarkRecord, process.env);
expect(getBenchmarkResultRecord("e2e-benchmark-record", process.env)).not.toBeNull();
```

Add these imports at the top:

```typescript
import {
  writeBaselineManifest,
  writeCandidateManifest,
  getBaselineManifest,
  getCandidateManifest,
  writeBenchmarkResultRecord,
  getBenchmarkResultRecord,
} from "../../../src/niche/store/index.js";
```

**Step 2: Run test to verify Stages 3-5 pass**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/e2e/full-pipeline.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
scripts/committer "test(niche): e2e pipeline — readiness, manifests, benchmark records" test/niche/e2e/full-pipeline.test.ts
```

---

### Task 3: E2E Pipeline Test — Release, Promotion, Monitor, Rollback

**Files:**

- Modify: `test/niche/e2e/full-pipeline.test.ts`

**Step 1: Extend the e2e test with release evaluation, promotion actuation, monitoring, and rollback**

After the benchmark stage, add:

```typescript
      // Stage 6: Evaluate release policy
      const policyEvaluation = evaluateReleasePolicy({
        baselineManifest,
        candidateManifest,
        benchmarkResults: [benchmarkRecord],
        verifierMetrics: {
          sample_count: 50,
          true_positive_rate: 0.96,
          false_positive_rate: 0.02,
          false_veto_rate: 0.02,
          pass_through_rate: 0.94,
          override_rate: 0.02,
          mean_latency_added_ms: 30,
          mean_cost_added: 0.01,
          total_cost_added: 0.5,
          counts: { approved: 47, vetoed: 1, escalated: 1, repair_requested: 1 },
        },
        latencyRegression: 0.05,
        costRegression: 0.03,
        postPromotionMonitorConfigured: true,
        thresholds: {
          ...DEFAULT_RELEASE_POLICY_THRESHOLDS,
          min_benchmark_case_count: 10,
          min_task_family_count: 1,
          require_shadow_results_for_promotion: false,
        },
      });
      // Policy should recommend promotion given strong benchmark evidence
      expect(["promoted", "canary"]).toContain(policyEvaluation.recommended_decision);

      // Stage 7: Register stack and actuate promotion
      const stackRecord = {
        active_stack_id: "e2e-stack-v1",
        niche_program_id: "e2e-repo-ci",
        candidate_manifest_id: "e2e-candidate",
        registered_at: new Date().toISOString(),
        release_mode: "shadow" as const,
        run_seed_template: makeSeedTemplate(),
      };
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const promotionResult = createPromotionControllerResult({
        candidateReleaseId: "e2e-release-v1",
        nicheProgramId: "e2e-repo-ci",
        baselineReleaseId: "e2e-baseline-release",
        baselineManifest,
        candidateManifest,
        componentArtifactRefs: [compiled.compilation.domain_pack_artifact_ref],
        benchmarkResults: [benchmarkRecord.summary],
        approvedBy: ["e2e-test"],
        rollbackTarget: "e2e-baseline",
        policyEvaluation,
      });

      const actuationResult = actuateReleaseDecision({
        promotionResult,
        stackRecord,
        agentId: "e2e-agent",
        env: process.env,
      });
      expect(actuationResult.actuated).toBe(true);

      // Verify agent default is set
      const stateAfterPromotion = getActiveNicheRuntimeState(process.env);
      expect(stateAfterPromotion.agent_defaults.some(
        (d) => d.agent_id === "e2e-agent" && d.active_stack_id === "e2e-stack-v1",
      )).toBe(true);

      // Stage 8: Monitor assessment (no drift — should not rollback)
      const monitorResult = runMonitorAssessmentCycle({
        definition: makeMonitorDefinition(),
        agentId: "e2e-agent",
        activeStackId: "e2e-stack-v1",
        nicheProgramId: "e2e-repo-ci",
        rollbackTarget: null,
        collectObservation: () => ({
          observed_drift: {
            task_success_drift: 0.01,
            task_family_drift: 0.01,
            verifier_false_veto_drift: 0.01,
            grader_disagreement_drift: 0.01,
            source_freshness_decay: 1,
            latency_cost_drift: 0.01,
            hard_fail_drift: 0.01,
          },
          consecutive_breach_windows: 0,
        }),
        env: process.env,
      });
      expect(monitorResult.assessment?.should_rollback).toBe(false);

      // Stage 9: Rollback
      const rollbackResult = executeRollback({
        activeStackId: "e2e-stack-v1",
        agentId: "e2e-agent",
        nicheProgramId: "e2e-repo-ci",
        rollbackTarget: null,
        reason: "E2E test rollback verification.",
        env: process.env,
      });
      expect(rollbackResult.rolled_back).toBe(true);
      expect(rollbackResult.agent_default_reverted).toBe(true);

      // Verify agent default is cleared
      const stateAfterRollback = getActiveNicheRuntimeState(process.env);
      expect(stateAfterRollback.agent_defaults.some(
        (d) => d.agent_id === "e2e-agent",
      )).toBe(false);
    });
  });
});
```

Add helper functions and imports:

```typescript
import {
  evaluateReleasePolicy,
  DEFAULT_RELEASE_POLICY_THRESHOLDS,
  createPromotionControllerResult,
  actuateReleaseDecision,
  executeRollback,
  runMonitorAssessmentCycle,
} from "../../../src/niche/release/index.js";
import {
  upsertActiveNicheStackRecord,
  getActiveNicheRuntimeState,
} from "../../../src/niche/store/index.js";
```

Add `makeSeedTemplate()` and `makeMonitorDefinition()` helper functions using the same pattern from `test/niche/runtime/active-stack-resolution.test.ts` (valid domain pack with repos source kind, tool contracts, etc.) and `test/niche/release/release-actuation.test.ts` (monitor definition with drift thresholds).

**Step 2: Run test to verify the full pipeline passes**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/e2e/full-pipeline.test.ts`
Expected: PASS — full pipeline from create through rollback

**Step 3: Run full niche suite to verify no regression**

Run: `npx vitest run --config vitest.niche.config.ts`
Expected: 48+ files, 216+ tests, all passing

**Step 4: Commit**

```bash
scripts/committer "test(niche): e2e pipeline — release, promotion, monitor, rollback" test/niche/e2e/full-pipeline.test.ts
```

---

### Task 4: Persistence Performance Smoke Test (BS-4)

**Files:**

- Modify: `test/niche/e2e/full-pipeline.test.ts`
- Modify: `src/niche/store/index.ts` (doc comment only)

**Step 1: Add persistence abstraction doc comment**

In `src/niche/store/index.ts`, add at the top of the file:

```typescript
/**
 * NicheClaw store access boundary.
 *
 * All NicheClaw persistence flows through this module. Callers must not
 * assume file-system semantics — the storage backend may change. Import
 * store functions from this barrel; do not read/write niche state files
 * directly.
 */
```

**Step 2: Add performance smoke test to the e2e file**

Add a second `it` block inside the same `describe`:

```typescript
it("handles 200 artifacts + 200 lineage edges + 50 traces within 5 seconds per operation", async () => {
  await withTempHome(async () => {
    const start = Date.now();

    // Create 200 artifacts
    for (let i = 0; i < 200; i++) {
      createArtifactRecord({
        artifact: {
          artifact_id: `perf-artifact-${i}`,
          artifact_type: "dataset",
          version: `2026.3.14-perf-${i}`,
          producer: "perf-test",
          source_trace_refs: [],
          dataset_refs: [],
          metrics: { index: i },
          governed_data_status: {
            data_zone: "dev",
            retention_policy: "retain",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            quarantined: false,
          },
          created_at: new Date().toISOString(),
          lineage: [],
        },
        rightsState: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: false,
          rights_to_generate_synthetic_from: true,
        },
        env: process.env,
      });
    }

    // Create 200 lineage edges
    for (let i = 1; i < 200; i++) {
      writeLineageEdges(
        `perf-artifact-${i}`,
        [
          {
            parent_artifact_id: `perf-artifact-${i - 1}`,
            relationship: "derived_from",
            derivation_step: "perf-test",
            notes: `Edge ${i}.`,
          },
        ],
        process.env,
      );
    }

    // Create 50 traces
    for (let i = 0; i < 50; i++) {
      appendRunTrace(makePerfTrace(i), process.env);
    }

    // Timed operations
    const listArtifactsStart = Date.now();
    const artifacts = listArtifactRecords({ env: process.env });
    expect(artifacts.length).toBe(200);
    expect(Date.now() - listArtifactsStart).toBeLessThan(5000);

    const listTracesStart = Date.now();
    const traces = listRunTraces(process.env);
    expect(traces.length).toBe(50);
    expect(Date.now() - listTracesStart).toBeLessThan(5000);

    const lineageStart = Date.now();
    const descendants = collectDescendantArtifactIds(["perf-artifact-0"], process.env);
    expect(descendants.length).toBeGreaterThan(0);
    expect(Date.now() - lineageStart).toBeLessThan(5000);
  });
});
```

Add `makePerfTrace(index)` helper that builds a minimal valid RunTrace.

**Step 3: Run the test**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/e2e/full-pipeline.test.ts`
Expected: PASS (both tests)

**Step 4: Commit**

```bash
scripts/committer "test(niche): add persistence performance smoke test (BS-4)" test/niche/e2e/full-pipeline.test.ts src/niche/store/index.ts
```

---

### Task 5: Manifest Builder — Automatic Manifest Generation from Compilation

**Files:**

- Create: `src/niche/domain/manifest-builder.ts`
- Create: `test/niche/domain/manifest-builder.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { buildStarterManifests } from "../../../src/niche/domain/manifest-builder.js";
import { validateJsonSchemaValue } from "../../../src/plugins/schema-validator.js";
import {
  BaselineManifestSchema,
  CandidateManifestSchema,
} from "../../../src/niche/schema/index.js";

describe("manifest builder", () => {
  it("builds valid baseline and candidate manifests from compilation output", () => {
    const result = buildStarterManifests({
      nicheProgramId: "test-program",
      compilationRecord: {
        /* minimal compilation record */
      },
      provider: "openai",
      modelId: "gpt-5",
      apiMode: "responses",
      toolAllowlist: ["exec", "read"],
    });

    const baselineValidation = validateJsonSchemaValue({
      schema: BaselineManifestSchema,
      cacheKey: "test-manifest-builder-baseline",
      value: result.baselineManifest,
    });
    expect(baselineValidation.ok).toBe(true);

    const candidateValidation = validateJsonSchemaValue({
      schema: CandidateManifestSchema,
      cacheKey: "test-manifest-builder-candidate",
      value: result.candidateManifest,
    });
    expect(candidateValidation.ok).toBe(true);

    expect(result.candidateManifest.based_on_baseline_manifest_id).toBe(
      result.baselineManifest.baseline_manifest_id,
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/domain/manifest-builder.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

`src/niche/domain/manifest-builder.ts`:

```typescript
import { computeStableContentHash } from "../benchmark/fixture-versioning.js";
import type {
  BaselineManifest,
  CandidateManifest,
  NicheCompilationRecord,
} from "../schema/index.js";

export type ManifestBuilderInput = {
  nicheProgramId: string;
  compilationRecord: NicheCompilationRecord;
  provider: string;
  modelId: string;
  apiMode: string;
  modelSnapshotId?: string;
  providerReleaseLabel?: string;
  toolAllowlist: string[];
  benchmarkSuiteId?: string;
};

export type ManifestBuilderOutput = {
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
};

export function buildStarterManifests(input: ManifestBuilderInput): ManifestBuilderOutput {
  const now = new Date().toISOString();
  const version = input.compilationRecord.version;
  const baselineId = `${input.nicheProgramId}-baseline-${computeStableContentHash({ nicheProgramId: input.nicheProgramId, version, role: "baseline" }).slice(0, 12)}`;
  const candidateId = `${input.nicheProgramId}-candidate-${computeStableContentHash({ nicheProgramId: input.nicheProgramId, version, role: "candidate" }).slice(0, 12)}`;
  const suiteId = input.benchmarkSuiteId ?? `${input.nicheProgramId}-suite`;
  const snapshotId = input.modelSnapshotId ?? `${input.modelId}-${version}`;

  const shared = {
    niche_program_id: input.nicheProgramId,
    created_at: now,
    planner_runtime: {
      component_id: "planner-primary",
      provider: input.provider,
      model_id: input.modelId,
      api_mode: input.apiMode,
    },
    provider: input.provider,
    model_id: input.modelId,
    model_snapshot_id: snapshotId,
    api_mode: input.apiMode,
    provider_release_label: input.providerReleaseLabel ?? snapshotId,
    api_revision: "v1",
    capability_snapshot_at: now,
    provider_metadata_quality: "exact_snapshot" as const,
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: version,
    grader_set_version: `${input.nicheProgramId}-graders`,
    benchmark_suite_id: suiteId,
    source_access_manifest_id:
      input.compilationRecord.source_access_manifest.source_access_manifest_id,
    retry_policy: { max_attempts: 1 },
    token_budget: { max_total_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark" as const,
    tool_catalog_version: version,
    tool_allowlist: input.toolAllowlist,
    tool_contract_version: version,
    retrieval_config: { policy: "baseline" },
    verifier_config: { policy: "baseline" },
  };

  const baselineManifest: BaselineManifest = {
    baseline_manifest_id: baselineId,
    ...shared,
  };

  const candidateManifest: CandidateManifest = {
    candidate_manifest_id: candidateId,
    based_on_baseline_manifest_id: baselineId,
    ...shared,
    domain_pack_id: input.compilationRecord.domain_pack_artifact_ref.artifact_id,
    action_policy_id: `${input.nicheProgramId}-action-policy`,
    retrieval_stack_id: `${input.nicheProgramId}-retrieval-stack`,
    verifier_pack_id: `${input.nicheProgramId}-verifier-pack`,
    optional_student_model_ids: [],
    candidate_recipe: `${input.nicheProgramId}-recipe`,
  };

  return { baselineManifest, candidateManifest };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/domain/manifest-builder.test.ts`
Expected: PASS

**Step 5: Export from domain index**

Add to `src/niche/domain/index.ts`:

```typescript
export {
  buildStarterManifests,
  type ManifestBuilderInput,
  type ManifestBuilderOutput,
} from "./manifest-builder.js";
```

**Step 6: Commit**

```bash
scripts/committer "feat(niche): add automatic manifest builder from compilation output (BS-1)" src/niche/domain/manifest-builder.ts test/niche/domain/manifest-builder.test.ts src/niche/domain/index.ts
```

---

### Task 6: Quickstart Command — Interactive Creation Flow

**Files:**

- Create: `src/commands/niche/quickstart.ts`
- Modify: `src/cli/program/register.niche.ts`

**Step 1: Write the quickstart command**

`src/commands/niche/quickstart.ts` — interactive command using `@clack/prompts` that:

1. Prints `intro("NicheClaw — Governed AI Agent Specialization")`
2. Prompts for program name, objective, risk class (select from `RISK_CLASS_VALUES`)
3. Prompts for provider and model (text inputs with defaults)
4. Prompts for allowed tools (multiselect from `["exec", "read", "apply_patch", "web_search"]`)
5. Prompts for source paths (text input, comma-separated)
6. Prompts for success metric (text inputs for label, objective select, target description)
7. Constructs and persists `NicheProgram` via `ensureStoredNicheProgram`
8. Builds `SourceDescriptor` objects from provided paths (as `structured_text` or `repo_asset`)
9. Calls `compileNicheProgramFlow` with spinner
10. Calls `buildStarterManifests` to generate baseline + candidate manifests
11. Writes manifests to store via `writeBaselineManifest` / `writeCandidateManifest`
12. Prints summary with `note()` showing created artifacts
13. Prints next-step commands: benchmark, release, optimize

**Step 2: Register the subcommand**

In `src/cli/program/register.niche.ts`, add after the existing subcommand registrations:

```typescript
niche
  .command("quickstart")
  .description("Interactive guided setup for a new NicheClaw specialization")
  .option("--json", "Output JSON summary", false)
  .action(async (opts) => {
    await runCommandWithRuntime(defaultRuntime, async () => {
      const { nicheQuickstartCommand } = await import("../../commands/niche/quickstart.js");
      await nicheQuickstartCommand({ json: Boolean(opts.json) });
    });
  });
```

**Step 3: Run the quickstart manually to verify it works**

Run: `pnpm openclaw niche quickstart`
Expected: Interactive prompts appear, artifacts are created on completion

**Step 4: Add quickstart to method list**

In `src/gateway/server-methods-list.ts`, the quickstart is CLI-only — no gateway method needed.

**Step 5: Commit**

```bash
scripts/committer "feat(niche): add niche quickstart interactive creation flow (BS-1)" src/commands/niche/quickstart.ts src/cli/program/register.niche.ts
```

---

### Task 7: Candidate Generation Executor

**Files:**

- Create: `src/niche/optimizer/candidate-generation-executor.ts`
- Create: `test/niche/optimizer/candidate-generation-executor.test.ts`
- Modify: `src/niche/optimizer/index.ts`
- Modify: `src/commands/niche/optimize.ts`
- Modify: `src/cli/program/register.niche.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { executeCandidateGeneration } from "../../../src/niche/optimizer/candidate-generation-executor.js";
import {
  createArtifactRecord,
  writeLineageEdges,
  getArtifactRecord,
  getParentsForArtifact,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

describe("candidate generation executor", () => {
  it("reads recipe input datasets and produces derived artifacts with lineage", async () => {
    await withTempHome(async () => {
      // Setup: create a parent dataset in the store
      const parentRef = createArtifactRecord({
        /* valid artifact + rights */
      });
      writeLineageEdges(parentRef.ref.artifact_id, [
        /* root lineage */
      ]);

      const job = {
        /* ready candidate_generation job referencing parentRef */
      };
      const recipe = {
        /* CandidateRecipe with input_dataset_refs: [parentRef.ref] */
      };

      const result = executeCandidateGeneration({ job, recipe, env: process.env });

      expect(result.status).toBe("completed");
      expect(result.produced_artifact_refs.length).toBeGreaterThan(0);

      // Verify lineage
      const produced = result.produced_artifact_refs[0];
      const parents = getParentsForArtifact(produced.artifact_id, process.env);
      expect(parents.length).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/optimizer/candidate-generation-executor.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

`src/niche/optimizer/candidate-generation-executor.ts`:

- Takes a `candidate_generation` OptimizerJob + CandidateRecipe
- Reads each `input_dataset_ref` from the artifact store
- For each recipe step (distillation, sidecar, retrieval optimization), produces a derived artifact
- Uses `materializeOptimizerArtifact` for persistence with lineage
- Returns `OptimizerJobExecutionResult` with status and produced refs

**Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/optimizer/candidate-generation-executor.test.ts`
Expected: PASS

**Step 5: Add `--execute` flag to optimize command**

In `src/commands/niche/optimize.ts`, add `execute?: boolean` to options. After planning the job, if `execute` is true and job type is `candidate_generation`, call `executeCandidateGeneration`.

In `src/cli/program/register.niche.ts`, add `.option("--execute", "Execute the planned job", false)` to the optimize subcommand.

**Step 6: Update optimizer index exports**

Add to `src/niche/optimizer/index.ts`:

```typescript
export { executeCandidateGeneration } from "./candidate-generation-executor.js";
```

**Step 7: Run full niche suite**

Run: `npx vitest run --config vitest.niche.config.ts`
Expected: All passing

**Step 8: Commit**

```bash
scripts/committer "feat(niche): add candidate generation executor with --execute flag (BS-5)" src/niche/optimizer/candidate-generation-executor.ts test/niche/optimizer/candidate-generation-executor.test.ts src/niche/optimizer/index.ts src/commands/niche/optimize.ts src/cli/program/register.niche.ts
```

---

### Task 8: Control UI — Navigation and Programs View

**Files:**

- Modify: `ui/src/ui/navigation.ts`
- Create: `ui/src/ui/views/niche/NichePrograms.ts` (or `.tsx` depending on framework)

**Step 1: Add NicheClaw section to navigation**

In `ui/src/ui/navigation.ts`:

- Add a new tab group: `{ label: "NicheClaw", tabs: ["niche-programs", "niche-benchmarks", "niche-runtime", "niche-releases"] }`
- Add tab path mappings, icons, titles, and subtitles for each

**Step 2: Create Programs list view**

The view calls `niche.programs.list` gateway method and renders a table with columns: Name, Risk Class, Readiness Status. Click-through shows program detail by calling `niche.programs.get` and `niche.readiness.get`.

Follow the exact component pattern used by existing views in `ui/src/ui/views/`.

**Step 3: Verify UI builds**

Run: `cd ui && pnpm build` (or whatever the UI build command is)
Expected: No build errors

**Step 4: Commit**

```bash
scripts/committer "feat(niche): add NicheClaw nav section and Programs view to Control UI (BS-6)" ui/src/ui/navigation.ts ui/src/ui/views/niche/NichePrograms.ts
```

---

### Task 9: Control UI — Benchmarks, Runtime State, and Release History Views

**Files:**

- Create: `ui/src/ui/views/niche/NicheBenchmarks.ts`
- Create: `ui/src/ui/views/niche/NicheRuntime.ts`
- Create: `ui/src/ui/views/niche/NicheReleases.ts`

**Step 1: Benchmark runs view**

Calls `niche.benchmarks.list` gateway method. Table columns: Suite, Case Kind, Mean Delta, Confidence Interval, Contamination, Created At. Filterable by program.

**Step 2: Active runtime state view**

Calls `niche.runtime.state` gateway method. Shows three sections:

- Registered stacks (table: stack ID, program, manifest, release mode)
- Agent defaults (table: agent ID, stack ID, updated at)
- Route overlays (table: overlay ID, agent, channel, account, stack)

Add Rollback button per stack that calls `niche.release.rollback` with confirmation dialog.

**Step 3: Release history view**

Calls `niche.traces.list` gateway method filtered for lifecycle traces. Shows timeline of promotion and rollback events.

**Step 4: Verify UI builds**

Run: `cd ui && pnpm build`
Expected: No build errors

**Step 5: Commit**

```bash
scripts/committer "feat(niche): add Benchmarks, Runtime, and Releases views to Control UI (BS-6)" ui/src/ui/views/niche/NicheBenchmarks.ts ui/src/ui/views/niche/NicheRuntime.ts ui/src/ui/views/niche/NicheReleases.ts
```

---

### Task 10: Product Identity Resolution (BS-3)

**Files:**

- Modify: `src/cli/program/register.niche.ts`
- Modify: `README.md`

**Step 1: Add CLI alias**

In `src/cli/program/register.niche.ts`, after the main `niche` command registration, add:

```typescript
program
  .command("nicheclaw")
  .description("Alias for openclaw niche — Governed AI Agent Specialization")
  .action(() => {
    niche.outputHelp();
  });
```

This makes `openclaw nicheclaw` discoverable and prints the niche help.

**Step 2: Add README section**

In `README.md`, add a section:

```markdown
## NicheClaw

NicheClaw is a governed AI specialization product built on OpenClaw's multi-channel agent infrastructure. It lets operators define, compile, benchmark, verify, and safely release specialized domain knowledge configurations for AI agents — with formal quality tracking, rights governance, and rollback safety.

Get started: `openclaw niche quickstart`
```

**Step 3: Verify CLI alias works**

Run: `pnpm openclaw nicheclaw`
Expected: Prints niche subcommand help

**Step 4: Commit**

```bash
scripts/committer "feat(niche): add openclaw nicheclaw alias and README section (BS-3)" src/cli/program/register.niche.ts README.md
```

---

### Task 11: Final Verification

**Files:** None (verification only)

**Step 1: Run full niche test suite**

Run: `npx vitest run --config vitest.niche.config.ts`
Expected: 50+ files, 230+ tests, all passing

**Step 2: Run strict smoke build**

Run: `pnpm build:strict-smoke`
Expected: PASS

**Step 3: Run full build (since we touched broader repo wiring)**

Run: `pnpm build`
Expected: PASS

**Step 4: Verify e2e pipeline test specifically**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/e2e/full-pipeline.test.ts`
Expected: 2 tests passing (pipeline + performance smoke)

---

## Summary

| Task | Blindspot | What                                             | Estimated lines |
| ---- | --------- | ------------------------------------------------ | --------------- |
| 1-3  | BS-2      | E2E pipeline test (create → rollback)            | ~350            |
| 4    | BS-4      | Persistence performance smoke test + doc comment | ~80             |
| 5    | BS-1      | Manifest builder                                 | ~120            |
| 6    | BS-1      | Quickstart interactive command                   | ~250            |
| 7    | BS-5      | Candidate generation executor + --execute flag   | ~200            |
| 8-9  | BS-6      | Control UI views (4 views + nav)                 | ~400            |
| 10   | BS-3      | CLI alias + README section                       | ~20             |
| 11   | —         | Final verification                               | 0               |

Total: ~1,420 lines of production code + tests across 11 tasks.
