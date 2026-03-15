import { describe, expect, it, vi } from "vitest";
import { compileNicheProgramFlow } from "../../../src/niche/domain/index.js";
import { compileDomainPack } from "../../../src/niche/domain/compiler.js";
import { evaluateReadinessGate } from "../../../src/niche/domain/readiness-gate.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";
import type { NicheProgram } from "../../../src/niche/schema/index.js";
import type {
  NormalizedSourceRecord,
  StructuredTextSourceDescriptor,
} from "../../../src/niche/domain/source-types.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

function makeValidProgram(id: string): NicheProgram {
  return {
    niche_program_id: id,
    name: "Compile Test Program",
    objective: "Validate compilation negative paths.",
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

function makeSourceDescriptor(
  id: string,
  overrides: Partial<StructuredTextSourceDescriptor> = {},
): StructuredTextSourceDescriptor {
  return {
    sourceId: id,
    sourceKind: "documents",
    inputKind: "structured_text",
    title: `Source ${id}`,
    accessPattern: "read",
    text: `Approved workflow documentation for source ${id}.`,
    rights: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
      retention_policy: "retain_for_90_days",
      redaction_status: "clean",
      pii_status: "clean",
      provenance_status: "verified",
      data_zone: "train",
    },
    freshnessExpectation: "weekly",
    trustNotes: "Trusted internal documentation.",
    ...overrides,
  };
}

function makeNormalizedSource(
  id: string,
  overrides: Partial<NormalizedSourceRecord> = {},
): NormalizedSourceRecord {
  return {
    sourceId: id,
    sourceKind: "documents",
    inputKind: "structured_text",
    title: `Source ${id}`,
    accessPattern: "read",
    normalizedContent: `Approved workflow documentation for source ${id}.`,
    rights: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
      retention_policy: "retain_for_90_days",
      redaction_status: "clean",
      pii_status: "clean",
      provenance_status: "verified",
      data_zone: "train",
    },
    provenance: {
      source_uri: `file:///sources/${id}.md`,
      ingested_at: "2026-03-14T10:00:00.000Z",
    },
    governedDataStatus: {
      data_zone: "train",
      retention_policy: "retain_for_90_days",
      redaction_status: "clean",
      pii_status: "clean",
      provenance_status: "verified",
      quarantined: false,
    },
    freshnessExpectation: "weekly",
    trustNotes: "Trusted internal documentation.",
    ...overrides,
  };
}

describe("compile-flow negative paths", () => {
  it("compileNicheProgramFlow throws with empty sources array", async () => {
    await withTempHome(async () => {
      await expect(
        compileNicheProgramFlow({
          nicheProgram: makeValidProgram("empty-sources"),
          sourceDescriptors: [],
          env: process.env,
        }),
      ).rejects.toThrow("At least one source descriptor is required");
    });
  });

  it("compileNicheProgramFlow throws when source has rights_to_store: false", async () => {
    await withTempHome(async () => {
      const descriptor = makeSourceDescriptor("no-store", {
        rights: {
          rights_to_store: false,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: true,
          rights_to_generate_synthetic_from: true,
          retention_policy: "retain_for_90_days",
          redaction_status: "clean",
          pii_status: "clean",
          provenance_status: "verified",
          data_zone: "train",
        },
      });

      await expect(
        compileNicheProgramFlow({
          nicheProgram: makeValidProgram("no-store-rights"),
          sourceDescriptors: [descriptor],
          env: process.env,
        }),
      ).rejects.toThrow("rights_to_store is false");
    });
  });

  it("compileNicheProgramFlow throws when source has data_zone gold_eval", async () => {
    await withTempHome(async () => {
      const descriptor = makeSourceDescriptor("gold-eval-src", {
        rights: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: true,
          rights_to_generate_synthetic_from: true,
          retention_policy: "retain_for_90_days",
          redaction_status: "clean",
          pii_status: "clean",
          provenance_status: "verified",
          data_zone: "gold_eval",
        },
      });

      await expect(
        compileNicheProgramFlow({
          nicheProgram: makeValidProgram("gold-eval-zone"),
          sourceDescriptors: [descriptor],
          env: process.env,
        }),
      ).rejects.toThrow("cannot be compiled from data zone gold_eval");
    });
  });

  it("compileNicheProgramFlow throws when source is quarantined", async () => {
    await withTempHome(async () => {
      const descriptor = makeSourceDescriptor("quarantined-src", {
        rights: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: true,
          rights_to_generate_synthetic_from: true,
          retention_policy: "retain_for_90_days",
          redaction_status: "clean",
          pii_status: "clean",
          provenance_status: "verified",
          data_zone: "train",
          quarantined: true,
          quarantine_reason: "unclear_rights",
        },
      });

      await expect(
        compileNicheProgramFlow({
          nicheProgram: makeValidProgram("quarantined-test"),
          sourceDescriptors: [descriptor],
          env: process.env,
        }),
      ).rejects.toThrow("quarantined and cannot be compiled");
    });
  });
});

describe("compileDomainPack negative paths", () => {
  it("materializeCompiledDomainPackArtifact throws with empty sourceArtifactRefs", async () => {
    await withTempHome(async () => {
      const { materializeCompiledDomainPackArtifact } = await import(
        "../../../src/niche/domain/compiler.js"
      );
      const program = makeValidProgram("empty-artifact-refs");
      const sources = [makeNormalizedSource("doc-1")];
      const { domainPack } = compileDomainPack({
        nicheProgram: program,
        version: "v1",
        sources,
      });

      expect(() =>
        materializeCompiledDomainPackArtifact({
          domainPack,
          sourceArtifactRefs: [],
          env: process.env,
        }),
      ).toThrow("require store-backed source artifacts");
    });
  });
});

describe("evaluateReadinessGate negative paths", () => {
  it("returns not_ready with blocker when rights_to_store is false", () => {
    const report = evaluateReadinessGate({
      nicheProgramId: "missing-store-rights",
      generatedAt: "2026-03-14T10:00:00.000Z",
      dimensionValues: {
        source_quality: 90,
        source_coverage: 80,
        contradiction_rate: 5,
        freshness: 90,
        rights_sufficiency: 90,
        task_observability: 80,
        benchmarkability: 80,
        measurable_success_criteria: 80,
        tool_availability: 80,
      },
      rightsState: {
        rights_to_store: false,
        rights_to_train: true,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: true,
        rights_to_generate_synthetic_from: true,
      },
    });

    expect(report.status).toBe("not_ready");
    expect(report.hard_blockers.some((b) => b.blocker_code === "insufficient_rights_to_use")).toBe(
      true,
    );
  });

  it("returns not_ready with blocker when benchmarkability is zero", () => {
    const report = evaluateReadinessGate({
      nicheProgramId: "zero-benchmarkability",
      generatedAt: "2026-03-14T10:00:00.000Z",
      dimensionValues: {
        source_quality: 90,
        source_coverage: 80,
        contradiction_rate: 5,
        freshness: 90,
        rights_sufficiency: 90,
        task_observability: 80,
        benchmarkability: 0,
        measurable_success_criteria: 80,
        tool_availability: 80,
      },
    });

    expect(report.status).toBe("not_ready");
    expect(
      report.hard_blockers.some(
        (b) => b.blocker_code === "benchmarkability_below_minimum_threshold",
      ),
    ).toBe(true);
  });

  it("returns not_ready with blocker when contradiction_rate is at maximum", () => {
    const report = evaluateReadinessGate({
      nicheProgramId: "high-contradiction",
      generatedAt: "2026-03-14T10:00:00.000Z",
      dimensionValues: {
        source_quality: 90,
        source_coverage: 80,
        contradiction_rate: 100,
        freshness: 90,
        rights_sufficiency: 90,
        task_observability: 80,
        benchmarkability: 80,
        measurable_success_criteria: 80,
        tool_availability: 80,
      },
    });

    expect(report.status).toBe("not_ready");
    expect(
      report.hard_blockers.some(
        (b) => b.blocker_code === "contradiction_rate_exceeds_hard_threshold",
      ),
    ).toBe(true);
  });
});
