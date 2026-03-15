import { describe, expect, it } from "vitest";
import {
  writeNicheProgram,
  ensureStoredBaselineManifest,
  ensureStoredCandidateManifest,
  getBaselineManifest,
  getCandidateManifest,
  createArtifactRecord,
  getArtifactRecord,
} from "../../../src/niche/store/index.js";
import { validateSchemaVersion } from "../../../src/niche/store/schema-version.js";
import {
  computeStoreRecordHash,
  wrapWithIntegrityEnvelope,
  verifyIntegrityEnvelope,
} from "../../../src/niche/store/integrity.js";
import { writeBaselineManifest } from "../../../src/niche/store/manifest-store.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";
import type {
  NicheProgram,
  BaselineManifest,
  CandidateManifest,
  ArtifactRef,
} from "../../../src/niche/schema/index.js";

function makeValidProgram(id: string): NicheProgram {
  return {
    niche_program_id: id,
    name: "Store Test Program",
    objective: "Validate store error paths.",
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
    niche_program_id: "store-test-program",
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

function makeCandidateManifest(id: string): CandidateManifest {
  return {
    candidate_manifest_id: id,
    based_on_baseline_manifest_id: "baseline-v1",
    niche_program_id: "store-test-program",
    created_at: "2026-03-14T10:01:00.000Z",
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
    prompt_asset_version: "v2",
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
    domain_pack_id: "domain-pack-v1",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    tool_catalog_version: "v1",
    tool_allowlist: ["exec"],
    tool_contract_version: "v1",
    retrieval_config: {},
    verifier_config: {},
    optional_student_model_ids: [],
    candidate_recipe: "recipe-v1",
  };
}

describe("store negative paths: program", () => {
  it("writeNicheProgram throws when program already exists", async () => {
    await withTempHome(async () => {
      const program = makeValidProgram("duplicate-program");
      writeNicheProgram(program, process.env);

      expect(() => writeNicheProgram(program, process.env)).toThrow(
        /Refusing to overwrite existing niche program/,
      );
    });
  });
});

describe("store negative paths: baseline manifest", () => {
  it("ensureStoredBaselineManifest throws when content differs for same ID", async () => {
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

  it("getBaselineManifest returns null for non-existent ID", async () => {
    await withTempHome(async () => {
      const result = getBaselineManifest("does-not-exist", process.env);

      expect(result).toBeNull();
    });
  });
});

describe("store negative paths: candidate manifest", () => {
  it("ensureStoredCandidateManifest throws when content differs for same ID", async () => {
    await withTempHome(async () => {
      const manifest = makeCandidateManifest("candidate-conflict");
      const { writeCandidateManifest } = await import(
        "../../../src/niche/store/manifest-store.js"
      );
      writeCandidateManifest(manifest, process.env);

      const altered = {
        ...manifest,
        model_id: "gpt-6",
      };

      expect(() => ensureStoredCandidateManifest(altered, process.env)).toThrow(
        /already stored with different content/,
      );
    });
  });

  it("getCandidateManifest returns null for non-existent ID", async () => {
    await withTempHome(async () => {
      const result = getCandidateManifest("does-not-exist", process.env);

      expect(result).toBeNull();
    });
  });
});

describe("store negative paths: artifact registry", () => {
  it("createArtifactRecord throws on version collision", async () => {
    await withTempHome(async () => {
      const artifact = {
        artifact_id: "artifact-collision",
        artifact_type: "domain_pack" as const,
        version: "v1",
        producer: "niche.test",
        source_trace_refs: [],
        dataset_refs: [],
        metrics: { count: 1 },
        created_at: "2026-03-14T10:00:00.000Z",
        lineage: [],
      };
      const rightsState = {
        rights_to_store: true,
        rights_to_train: true,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: true,
        rights_to_generate_synthetic_from: true,
      };

      createArtifactRecord({ artifact, rightsState, env: process.env });

      // Second write with same artifact_id + version should throw
      expect(() =>
        createArtifactRecord({ artifact, rightsState, env: process.env }),
      ).toThrow(/Refusing to overwrite/);
    });
  });

  it("getArtifactRecord returns null for non-existent ref", async () => {
    await withTempHome(async () => {
      const ref: ArtifactRef = {
        artifact_id: "nonexistent-artifact",
        artifact_type: "domain_pack",
        version: "v1",
        content_hash: "0123456789abcdef0123456789abcdef",
        rights_state: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: true,
          rights_to_generate_synthetic_from: true,
        },
        created_at: "2026-03-14T10:00:00.000Z",
      };

      const result = getArtifactRecord(ref, process.env);

      expect(result).toBeNull();
    });
  });
});

describe("store negative paths: schema version", () => {
  it("validateSchemaVersion reports mismatch info for different major version", async () => {
    await withTempHome(async () => {
      // Write a schema version file with a different major version
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { resolveNicheStateRoot } = await import("../../../src/niche/store/paths.js");

      const root = resolveNicheStateRoot(process.env);
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(
        path.join(root, ".schema-version"),
        JSON.stringify({
          version: "99.0.0",
          written_at: "2026-03-14T10:00:00.000Z",
        }),
      );

      const result = validateSchemaVersion(process.env);

      expect(result.ok).toBe(false);
      expect(result.stored).toBe("99.0.0");
      expect(result.message).toMatch(/Major version mismatch/);
    });
  });
});

describe("store negative paths: integrity", () => {
  it("computeStoreRecordHash produces consistent hashes for same content", () => {
    const data = { name: "test", value: 42, nested: { ok: true } };
    const hash1 = computeStoreRecordHash(data);
    const hash2 = computeStoreRecordHash(data);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("verifyIntegrityEnvelope detects tampered content", () => {
    const original = { name: "test", score: 95 };
    const envelope = wrapWithIntegrityEnvelope(original);

    // Verify original is valid
    const valid = verifyIntegrityEnvelope(envelope);
    expect(valid.ok).toBe(true);

    // Tamper with the data
    const tampered = {
      ...envelope,
      data: { ...envelope.data, score: 0 },
    };
    const invalid = verifyIntegrityEnvelope(tampered);

    expect(invalid.ok).toBe(false);
    expect(invalid.expected).not.toBe(invalid.computed);
  });
});
