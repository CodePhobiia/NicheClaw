import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CompiledDomainConfigSchema } from "../../../src/niche/schema/compiled-domain-config.js";
import { validateJsonSchemaValue } from "../../../src/plugins/schema-validator.js";

function makeValidConfig() {
  return {
    niche_program_id: "test-program",
    domain_pack_id: "test-pack",
    version: "v1",
    compiled_at: "2026-03-14T10:00:00.000Z",
    planner: {
      domain_identity: "You are a specialist.",
      reasoning_constraints: ["constraint-1"],
      terminology_guidance: ["term-1"],
      task_decomposition_hints: ["hint-1"],
      failure_awareness: ["awareness-1"],
      evidence_requirements: ["evidence-1"],
    },
    tools: [
      {
        tool_name: "exec",
        domain_relevance_score: 0.9,
        preferred_arguments: {},
        domain_intent: "Run commands",
        failure_modes: ["timeout"],
        required_arguments: ["command"],
      },
    ],
    observation: {
      signal_patterns: [{ source_id: "s1", pattern_description: "desc", extraction_hint: "hint" }],
      failure_indicators: [{ failure_id: "f1", detection_hints: ["hint"], severity: "high" }],
    },
    retrieval: {
      approved_source_ids: ["s1"],
      source_descriptions: { s1: "Source 1" },
      freshness_expectations: { s1: "daily" },
    },
    exemplars: [
      {
        seed_id: "seed-1",
        task_family_id: "task-1",
        prompt: "Test prompt",
        pass_conditions: ["ok"],
        hard_fail_conditions: ["fail"],
      },
    ],
    constraints: [
      {
        constraint_id: "c1",
        category: "test",
        rule: "must_not_include:forbidden",
        severity: "moderate",
      },
    ],
  };
}

describe("FC-01: CompiledDomainConfigSchema validation", () => {
  it("validates a correct CompiledDomainConfig object", () => {
    const result = validateJsonSchemaValue({
      schema: CompiledDomainConfigSchema as unknown as Record<string, unknown>,
      cacheKey: "compiled-domain-config-valid",
      value: makeValidConfig(),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an object with missing required fields", () => {
    const incomplete = {
      niche_program_id: "test-program",
      domain_pack_id: "test-pack",
      // missing version, compiled_at, planner, tools, observation, retrieval, exemplars, constraints
    };
    const result = validateJsonSchemaValue({
      schema: CompiledDomainConfigSchema as unknown as Record<string, unknown>,
      cacheKey: "compiled-domain-config-missing",
      value: incomplete,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an object with additionalProperties beyond the schema", () => {
    const config = {
      ...makeValidConfig(),
      extra_field: "should not be here",
    };
    const result = validateJsonSchemaValue({
      schema: CompiledDomainConfigSchema as unknown as Record<string, unknown>,
      cacheKey: "compiled-domain-config-extra",
      value: config,
    });
    expect(result.ok).toBe(false);
  });

  it("verifies Type.Any() no longer exists in compile-record.ts", () => {
    const content = fs.readFileSync("src/niche/schema/compile-record.ts", "utf-8");
    expect(content).not.toContain("Type.Any()");
  });
});
