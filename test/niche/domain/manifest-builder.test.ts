import { describe, expect, it } from "vitest";
import {
  buildStarterManifests,
  type ManifestBuilderInput,
} from "../../../src/niche/domain/manifest-builder.js";
import {
  BaselineManifestSchema,
  CandidateManifestSchema,
  type NicheCompilationRecord,
} from "../../../src/niche/schema/index.js";
import { validateJsonSchemaValue } from "../../../src/plugins/schema-validator.js";

/**
 * Builds a minimal valid NicheCompilationRecord that satisfies the TypeBox
 * schema constraints (all required fields, minItems arrays, identifier/version
 * patterns, ISO 8601 timestamps, etc.).
 */
function makeCompilationRecord(): NicheCompilationRecord {
  return {
    compilation_id: "test-program-compile-abc123def456",
    niche_program_id: "test-program",
    version: "v1.0.0",
    compiled_at: "2026-03-14T10:00:00.000Z",
    domain_pack: {
      domain_pack_id: "test-program-pack",
      niche_program_id: "test-program",
      version: "v1.0.0",
      ontology: {
        concepts: [{ id: "core-concept", label: "Core concept" }],
        relations: [],
      },
      task_taxonomy: [
        {
          task_family_id: "task-repair",
          label: "Task repair",
          benchmarkable: true,
          required_capabilities: ["reasoning"],
        },
      ],
      terminology_map: {},
      constraints: [
        {
          constraint_id: "safety-constraint",
          category: "safety",
          rule: "Do not execute destructive commands.",
          severity: "high",
        },
      ],
      tool_contracts: [
        {
          tool_name: "exec",
          intent_summary: "Execute a shell command.",
          required_arguments: ["command"],
          optional_arguments: ["cwd"],
          failure_modes: ["timeout"],
        },
      ],
      evidence_source_registry: [
        {
          source_id: "repo-doc",
          source_kind: "repos",
          title: "Repository documentation",
          access_pattern: "read",
        },
      ],
      failure_taxonomy: [
        {
          failure_id: "unsafe-command",
          label: "Unsafe command",
          description: "Agent executed a destructive command.",
          severity: "high",
          detection_hints: ["rm -rf", "drop table"],
        },
      ],
      verifier_defaults: {
        required_checks: ["output-format"],
        blocking_failure_ids: ["unsafe-command"],
        output_requirements: ["structured-json"],
        escalation_policy: "block-and-notify",
      },
      benchmark_seed_specs: [
        {
          seed_id: "seed-1",
          task_family_id: "task-repair",
          prompt: "Diagnose the failing build.",
          source_refs: ["repo-doc"],
          pass_conditions: ["correct-diagnosis"],
          hard_fail_conditions: [],
        },
      ],
    },
    source_access_manifest: {
      source_access_manifest_id: "test-program-source-access-abc123",
      allowed_tools: ["exec", "read"],
      allowed_retrieval_indices: ["repo-doc"],
      allowed_live_sources: [],
      disallowed_sources: [],
      sandbox_policy: "workspace_only",
      network_policy: "deny",
      approval_policy: "operator_optional",
    },
    readiness_report: {
      readiness_report_id: "test-program-readiness",
      niche_program_id: "test-program",
      status: "ready",
      dimension_scores: {
        source_quality: { score: 90 },
        source_coverage: { score: 70 },
        contradiction_rate: { score: 95 },
        freshness: { score: 85 },
        rights_sufficiency: { score: 83 },
        task_observability: { score: 90 },
        benchmarkability: { score: 92 },
        measurable_success_criteria: { score: 70 },
        tool_availability: { score: 80 },
      },
      hard_blockers: [],
      warnings: [],
      recommended_next_actions: [],
      generated_at: "2026-03-14T10:00:00.000Z",
    },
    normalized_sources: [
      {
        sourceId: "repo-doc",
        sourceKind: "repos",
        inputKind: "structured_text",
        title: "Repository documentation",
        accessPattern: "read",
        normalizedContent: "Repository CI policy: all changes must pass tests.",
        rights: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: false,
          rights_to_generate_synthetic_from: true,
          retention_policy: "retain",
          redaction_status: "clean",
          pii_status: "none",
          provenance_status: "verified",
          data_zone: "dev",
        },
        provenance: {
          source_uri: "file:///repo/docs/ci.md",
          ingested_at: "2026-03-14T09:59:00.000Z",
        },
        governedDataStatus: {
          data_zone: "dev",
          retention_policy: "retain",
          redaction_status: "clean",
          pii_status: "none",
          provenance_status: "verified",
          quarantined: false,
        },
      },
    ],
    benchmark_seed_hints: [
      {
        seedId: "seed-1",
        taskFamilyId: "task-repair",
        prompt: "Diagnose the failing build.",
        sourceRefs: ["repo-doc"],
        passConditions: ["correct-diagnosis"],
        hardFailConditions: [],
      },
    ],
    source_artifact_refs: [
      {
        artifact_id: "repo-doc-dataset",
        artifact_type: "dataset",
        version: "v1.0.0",
        content_hash: "abcdef0123456789abcdef0123456789",
        rights_state: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: false,
          rights_to_generate_synthetic_from: true,
        },
        created_at: "2026-03-14T10:00:00.000Z",
      },
    ],
    compiled_domain_pack_artifact_ref: {
      artifact_id: "test-program-pack-artifact",
      artifact_type: "domain_pack",
      version: "v1.0.0",
      content_hash: "fedcba9876543210fedcba9876543210",
      rights_state: {
        rights_to_store: true,
        rights_to_train: true,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: false,
        rights_to_generate_synthetic_from: true,
      },
      created_at: "2026-03-14T10:00:00.000Z",
    },
  };
}

function makeBuilderInput(overrides: Partial<ManifestBuilderInput> = {}): ManifestBuilderInput {
  return {
    nicheProgramId: "test-program",
    compilationRecord: makeCompilationRecord(),
    provider: "openai",
    modelId: "gpt-5",
    apiMode: "responses",
    toolAllowlist: ["exec", "read"],
    ...overrides,
  };
}

describe("manifest builder", () => {
  it("builds valid baseline and candidate manifests from compilation output", () => {
    const result = buildStarterManifests(makeBuilderInput());

    const baselineValidation = validateJsonSchemaValue({
      schema: BaselineManifestSchema as unknown as Record<string, unknown>,
      cacheKey: "test-manifest-builder-baseline",
      value: result.baselineManifest,
    });
    expect(
      baselineValidation.ok,
      `baseline validation errors: ${JSON.stringify(
        baselineValidation.ok ? [] : baselineValidation.errors,
      )}`,
    ).toBe(true);

    const candidateValidation = validateJsonSchemaValue({
      schema: CandidateManifestSchema as unknown as Record<string, unknown>,
      cacheKey: "test-manifest-builder-candidate",
      value: result.candidateManifest,
    });
    expect(
      candidateValidation.ok,
      `candidate validation errors: ${JSON.stringify(
        candidateValidation.ok ? [] : candidateValidation.errors,
      )}`,
    ).toBe(true);
  });

  it("candidate references the baseline via based_on_baseline_manifest_id", () => {
    const result = buildStarterManifests(makeBuilderInput());

    expect(result.candidateManifest.based_on_baseline_manifest_id).toBe(
      result.baselineManifest.baseline_manifest_id,
    );
  });

  it("domain_pack_id comes from the compilation record", () => {
    const input = makeBuilderInput();
    const result = buildStarterManifests(input);

    expect(result.candidateManifest.domain_pack_id).toBe(
      input.compilationRecord.domain_pack.domain_pack_id,
    );
  });

  it("source_access_manifest_id comes from the compilation record", () => {
    const input = makeBuilderInput();
    const result = buildStarterManifests(input);
    const expectedId = input.compilationRecord.source_access_manifest.source_access_manifest_id;

    expect(result.baselineManifest.source_access_manifest_id).toBe(expectedId);
    expect(result.candidateManifest.source_access_manifest_id).toBe(expectedId);
  });

  it("generates deterministic IDs for the same input", () => {
    const input = makeBuilderInput();
    const first = buildStarterManifests(input);
    const second = buildStarterManifests(input);

    expect(first.baselineManifest.baseline_manifest_id).toBe(
      second.baselineManifest.baseline_manifest_id,
    );
    expect(first.candidateManifest.candidate_manifest_id).toBe(
      second.candidateManifest.candidate_manifest_id,
    );
  });

  it("uses modelSnapshotId when provided", () => {
    const result = buildStarterManifests(
      makeBuilderInput({ modelSnapshotId: "gpt-5-2026-03-14-snap" }),
    );

    expect(result.baselineManifest.model_snapshot_id).toBe("gpt-5-2026-03-14-snap");
    expect(result.candidateManifest.model_snapshot_id).toBe("gpt-5-2026-03-14-snap");
    expect(result.baselineManifest.provider_metadata_quality).toBe("exact_snapshot");
  });

  it("falls back to release_label_only quality when no snapshot id is given", () => {
    const result = buildStarterManifests(makeBuilderInput());

    // No modelSnapshotId provided, so quality is release_label_only.
    expect(result.baselineManifest.provider_metadata_quality).toBe("release_label_only");
  });

  it("uses providerReleaseLabel when provided", () => {
    const result = buildStarterManifests(
      makeBuilderInput({ providerReleaseLabel: "custom-label" }),
    );

    expect(result.baselineManifest.provider_release_label).toBe("custom-label");
    expect(result.candidateManifest.provider_release_label).toBe("custom-label");
  });

  it("uses custom benchmarkSuiteId when provided", () => {
    const result = buildStarterManifests(makeBuilderInput({ benchmarkSuiteId: "custom-suite" }));

    expect(result.baselineManifest.benchmark_suite_id).toBe("custom-suite");
    expect(result.candidateManifest.benchmark_suite_id).toBe("custom-suite");
  });

  it("sorts tool_allowlist alphabetically", () => {
    const result = buildStarterManifests(
      makeBuilderInput({ toolAllowlist: ["read", "exec", "apply_patch"] }),
    );

    expect(result.baselineManifest.tool_allowlist).toEqual(["apply_patch", "exec", "read"]);
    expect(result.candidateManifest.tool_allowlist).toEqual(["apply_patch", "exec", "read"]);
  });

  it("baseline and candidate share identical execution-invariant fields", () => {
    const result = buildStarterManifests(makeBuilderInput());
    const { baselineManifest, candidateManifest } = result;

    // All shared execution-invariant fields must match between manifests.
    expect(baselineManifest.provider).toBe(candidateManifest.provider);
    expect(baselineManifest.model_id).toBe(candidateManifest.model_id);
    expect(baselineManifest.api_mode).toBe(candidateManifest.api_mode);
    expect(baselineManifest.model_snapshot_id).toBe(candidateManifest.model_snapshot_id);
    expect(baselineManifest.sampling_config).toEqual(candidateManifest.sampling_config);
    expect(baselineManifest.retry_policy).toEqual(candidateManifest.retry_policy);
    expect(baselineManifest.token_budget).toEqual(candidateManifest.token_budget);
    expect(baselineManifest.context_budget).toEqual(candidateManifest.context_budget);
    expect(baselineManifest.execution_mode).toBe(candidateManifest.execution_mode);
    expect(baselineManifest.grader_set_version).toBe(candidateManifest.grader_set_version);
    expect(baselineManifest.tool_catalog_version).toBe(candidateManifest.tool_catalog_version);
    expect(baselineManifest.tool_allowlist).toEqual(candidateManifest.tool_allowlist);
    expect(baselineManifest.tool_contract_version).toBe(candidateManifest.tool_contract_version);
    expect(baselineManifest.benchmark_suite_id).toBe(candidateManifest.benchmark_suite_id);
    expect(baselineManifest.source_access_manifest_id).toBe(
      candidateManifest.source_access_manifest_id,
    );
  });
});
