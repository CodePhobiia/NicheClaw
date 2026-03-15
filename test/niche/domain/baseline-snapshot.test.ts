import { describe, expect, it } from "vitest";
import {
  snapshotUnspecializedBaseline,
  type BaselineSnapshotParams,
} from "../../../src/niche/domain/baseline-snapshot.js";
import { BaselineManifestSchema } from "../../../src/niche/schema/index.js";
import { validateJsonSchemaValue } from "../../../src/plugins/schema-validator.js";

function makeSnapshotParams(
  overrides: Partial<BaselineSnapshotParams> = {},
): BaselineSnapshotParams {
  return {
    agentId: "agent-test-001",
    provider: "openai",
    modelId: "gpt-5",
    apiMode: "responses",
    nicheProgramId: "repo-ci-specialist",
    benchmarkSuiteId: "repo-ci-suite",
    sourceAccessManifestId: "repo-ci-source-access",
    ...overrides,
  };
}

describe("snapshotUnspecializedBaseline", () => {
  it("produces a valid BaselineManifest against the TypeBox schema", () => {
    const manifest = snapshotUnspecializedBaseline(makeSnapshotParams());

    const result = validateJsonSchemaValue({
      schema: BaselineManifestSchema as unknown as Record<string, unknown>,
      cacheKey: "test-baseline-snapshot-validation",
      value: manifest,
    });

    expect(
      result.ok,
      `baseline schema validation errors: ${JSON.stringify(result.ok ? [] : result.errors)}`,
    ).toBe(true);
  });

  it("has no domain-specific configuration fields", () => {
    const manifest = snapshotUnspecializedBaseline(makeSnapshotParams());
    const raw = manifest as Record<string, unknown>;

    // Candidate-only domain fields must not be present on the baseline.
    expect(raw).not.toHaveProperty("domain_pack_id");
    expect(raw).not.toHaveProperty("action_policy_id");
    expect(raw).not.toHaveProperty("retrieval_stack_id");
    expect(raw).not.toHaveProperty("verifier_pack_id");
    expect(raw).not.toHaveProperty("candidate_recipe");
    expect(raw).not.toHaveProperty("optional_student_model_ids");

    // Retrieval and verifier config should indicate no domain overlay.
    expect(manifest.retrieval_config).toEqual({ policy: "none" });
    expect(manifest.verifier_config).toEqual({ policy: "none" });
  });

  it("uses the provided provider and model", () => {
    const manifest = snapshotUnspecializedBaseline(
      makeSnapshotParams({ provider: "anthropic", modelId: "claude-opus-4-20250514" }),
    );

    expect(manifest.provider).toBe("anthropic");
    expect(manifest.model_id).toBe("claude-opus-4-20250514");
    expect(manifest.planner_runtime.provider).toBe("anthropic");
    expect(manifest.planner_runtime.model_id).toBe("claude-opus-4-20250514");
  });

  it("uses the provided apiMode", () => {
    const manifest = snapshotUnspecializedBaseline(makeSnapshotParams({ apiMode: "chat" }));

    expect(manifest.api_mode).toBe("chat");
    expect(manifest.planner_runtime.api_mode).toBe("chat");
  });

  it("generates a deterministic baseline_manifest_id for identical inputs", () => {
    const params = makeSnapshotParams();
    const first = snapshotUnspecializedBaseline(params);
    const second = snapshotUnspecializedBaseline(params);

    expect(first.baseline_manifest_id).toBe(second.baseline_manifest_id);
  });

  it("generates different IDs for different inputs", () => {
    const a = snapshotUnspecializedBaseline(makeSnapshotParams({ agentId: "agent-a" }));
    const b = snapshotUnspecializedBaseline(makeSnapshotParams({ agentId: "agent-b" }));

    expect(a.baseline_manifest_id).not.toBe(b.baseline_manifest_id);
  });

  it("includes the provided benchmarkSuiteId", () => {
    const manifest = snapshotUnspecializedBaseline(
      makeSnapshotParams({ benchmarkSuiteId: "custom-bench-suite" }),
    );

    expect(manifest.benchmark_suite_id).toBe("custom-bench-suite");
  });

  it("includes the provided sourceAccessManifestId", () => {
    const manifest = snapshotUnspecializedBaseline(
      makeSnapshotParams({ sourceAccessManifestId: "custom-source-access" }),
    );

    expect(manifest.source_access_manifest_id).toBe("custom-source-access");
  });

  it("sets execution_mode to benchmark", () => {
    const manifest = snapshotUnspecializedBaseline(makeSnapshotParams());

    expect(manifest.execution_mode).toBe("benchmark");
  });

  it("applies default sampling config, retry policy, and budgets", () => {
    const manifest = snapshotUnspecializedBaseline(makeSnapshotParams());

    expect(manifest.sampling_config).toEqual({ temperature: 0.2, top_p: 1 });
    expect(manifest.retry_policy).toEqual({ max_attempts: 1 });
    expect(manifest.token_budget).toEqual({ max_total_tokens: 64000 });
    expect(manifest.context_budget).toEqual({ max_context_tokens: 64000 });
  });

  it("uses a default tool allowlist when none is provided", () => {
    const manifest = snapshotUnspecializedBaseline(makeSnapshotParams());

    expect(manifest.tool_allowlist).toEqual(["apply_patch", "exec", "read"]);
  });

  it("sorts a custom tool allowlist alphabetically", () => {
    const manifest = snapshotUnspecializedBaseline(
      makeSnapshotParams({ toolAllowlist: ["write", "exec", "apply_patch", "read"] }),
    );

    expect(manifest.tool_allowlist).toEqual(["apply_patch", "exec", "read", "write"]);
  });

  it("uses modelSnapshotId and exact_snapshot quality when provided", () => {
    const manifest = snapshotUnspecializedBaseline(
      makeSnapshotParams({ modelSnapshotId: "gpt-5-2026-03-14-snap" }),
    );

    expect(manifest.model_snapshot_id).toBe("gpt-5-2026-03-14-snap");
    expect(manifest.provider_metadata_quality).toBe("exact_snapshot");
  });

  it("falls back to release_label_only quality when no modelSnapshotId is given", () => {
    const manifest = snapshotUnspecializedBaseline(makeSnapshotParams());

    expect(manifest.provider_metadata_quality).toBe("release_label_only");
    expect(manifest.model_snapshot_id).toBe("gpt-5-unspecialized");
  });

  it("includes nicheProgramId in the baseline_manifest_id prefix", () => {
    const manifest = snapshotUnspecializedBaseline(makeSnapshotParams());

    expect(manifest.baseline_manifest_id).toMatch(/^repo-ci-specialist-baseline-/);
  });

  it("includes nicheProgramId in the niche_program_id field", () => {
    const manifest = snapshotUnspecializedBaseline(makeSnapshotParams());

    expect(manifest.niche_program_id).toBe("repo-ci-specialist");
  });
});
