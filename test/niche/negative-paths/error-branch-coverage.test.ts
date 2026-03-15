import { describe, expect, it } from "vitest";
import { resolveSpecializationReadiness } from "../../../src/niche/domain/readiness-enforcement.js";
import { NicheProgramSchema } from "../../../src/niche/schema/index.js";
import type {
  NicheProgram,
  BaselineManifest,
  ReadinessReport,
} from "../../../src/niche/schema/index.js";
import {
  ensureStoredBaselineManifest,
  writeBaselineManifest,
} from "../../../src/niche/store/manifest-store.js";
import { writeNicheProgram, getNicheProgram } from "../../../src/niche/store/program-store.js";
import { saveReadinessReport } from "../../../src/niche/store/readiness-store.js";
import { validateJsonSchemaValue } from "../../../src/plugins/schema-validator.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeValidProgram(id: string): NicheProgram {
  return {
    niche_program_id: id,
    name: "Test Program",
    objective: "Covers error branches in tests.",
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
    allowed_tools: ["exec"],
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
        target_description: "Above 90%.",
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

function makeBaselineManifest(id: string): BaselineManifest {
  return {
    baseline_manifest_id: id,
    niche_program_id: "test-program",
    created_at: "2026-03-14T10:00:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
    },
    provider: "openai",
    model_id: "gpt-5",
    api_mode: "responses",
    provider_metadata_quality: "exact_snapshot",
    sampling_config: {
      temperature: 0.7,
      top_p: 1.0,
    },
    prompt_asset_version: "v1",
    grader_set_version: "v1",
    benchmark_suite_id: "test-suite",
    source_access_manifest_id: "source-access-v1",
    retry_policy: {
      max_attempts: 2,
    },
    token_budget: {
      max_input_tokens: 100000,
      max_output_tokens: 4096,
    },
    context_budget: {
      max_context_tokens: 50000,
    },
    execution_mode: "standard",
    tool_catalog_version: "v1",
    tool_allowlist: ["exec"],
    tool_contract_version: "v1",
    retrieval_config: {},
    verifier_config: {},
  };
}

function makeNotReadyReport(nicheProgramId: string): ReadinessReport {
  return {
    readiness_report_id: `${nicheProgramId}-readiness`,
    niche_program_id: nicheProgramId,
    status: "not_ready",
    dimension_scores: {
      source_quality: { score: 80 },
      source_coverage: { score: 20 },
      contradiction_rate: { score: 10 },
      freshness: { score: 80 },
      rights_sufficiency: { score: 90 },
      task_observability: { score: 70 },
      benchmarkability: { score: 15 },
      measurable_success_criteria: { score: 70 },
      tool_availability: { score: 80 },
    },
    hard_blockers: [
      {
        blocker_code: "benchmarkability_below_minimum_threshold",
        message: "Benchmarkability is below the minimum threshold.",
      },
    ],
    warnings: [],
    recommended_next_actions: [
      {
        action_id: "improve-benchmarkability",
        summary: "Improve source coverage for benchmarks.",
        priority: "required",
      },
    ],
    generated_at: "2026-03-14T10:00:00.000Z",
  };
}

describe("negative path error branch coverage", () => {
  it("writeNicheProgram throws when program already exists", async () => {
    await withTempHome(async () => {
      const program = makeValidProgram("duplicate-test");
      writeNicheProgram(program, process.env);

      expect(() => writeNicheProgram(program, process.env)).toThrow(
        /Refusing to overwrite existing niche program/,
      );
    });
  });

  it("ensureStoredBaselineManifest throws when different content for same ID", async () => {
    await withTempHome(async () => {
      const manifest = makeBaselineManifest("baseline-conflict");
      writeBaselineManifest(manifest, process.env);

      const altered = {
        ...manifest,
        model_id: "gpt-6",
      };

      expect(() => ensureStoredBaselineManifest(altered, process.env)).toThrow(
        /already stored with different content/,
      );
    });
  });

  it("schema validation rejects invalid NicheProgram (missing required fields)", () => {
    const invalid = {
      niche_program_id: "test",
      // Missing: name, objective, risk_class, runtime_stack, etc.
    };

    const result = validateJsonSchemaValue({
      schema: NicheProgramSchema,
      cacheKey: "niche-negative-path-test",
      value: invalid,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("schema validation rejects NicheProgram with invalid risk_class", () => {
    const invalid = {
      ...makeValidProgram("bad-risk"),
      risk_class: "extreme",
    };

    const result = validateJsonSchemaValue({
      schema: NicheProgramSchema,
      cacheKey: "niche-negative-path-risk-test",
      value: invalid,
    });

    expect(result.ok).toBe(false);
  });

  it("resolveSpecializationReadiness throws when no readiness report exists", async () => {
    await withTempHome(async () => {
      expect(() =>
        resolveSpecializationReadiness({
          nicheProgramId: "nonexistent-program",
          env: process.env,
        }),
      ).toThrow(/No stored readiness report exists for niche program/);
    });
  });

  it("resolveSpecializationReadiness throws when readiness status is not_ready", async () => {
    await withTempHome(async () => {
      const programId = "blocked-program";
      const report = makeNotReadyReport(programId);
      saveReadinessReport(report, process.env);

      expect(() =>
        resolveSpecializationReadiness({
          nicheProgramId: programId,
          env: process.env,
        }),
      ).toThrow(/below the minimum threshold/);
    });
  });
});
