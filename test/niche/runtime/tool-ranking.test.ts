import { afterEach, describe, expect, it, vi } from "vitest";
import { compileDomainConfig } from "../../../src/niche/domain/compiled-config.js";
import {
  clearAllNicheRunTraceContextsForTest,
  getDomainArgumentDefaults,
  rankToolsForNicheRun,
  registerNicheRunTraceContext,
} from "../../../src/niche/runtime/index.js";
import type { DomainPack } from "../../../src/niche/schema/index.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => undefined,
}));

function makeDomainPack(overrides?: { toolContracts?: DomainPack["tool_contracts"] }): DomainPack {
  return {
    domain_pack_id: "test-pack",
    niche_program_id: "test-program",
    version: "2026.3.14",
    ontology: {
      concepts: [{ id: "test-concept", label: "Test concept" }],
      relations: [],
    },
    task_taxonomy: [
      {
        task_family_id: "test-task",
        label: "Test task",
        benchmarkable: true,
        required_capabilities: ["evidence_grounding"],
      },
    ],
    terminology_map: {},
    constraints: [
      {
        constraint_id: "must-ground",
        category: "grounding",
        rule: "must_ground_in_evidence",
        severity: "moderate",
      },
    ],
    tool_contracts: overrides?.toolContracts ?? [
      {
        tool_name: "exec",
        intent_summary: "Run shell commands.",
        required_arguments: ["command"],
        optional_arguments: [],
        failure_modes: ["missing_evidence"],
      },
      {
        tool_name: "read",
        intent_summary: "Read file contents.",
        required_arguments: ["path"],
        optional_arguments: [],
        failure_modes: [],
      },
    ],
    evidence_source_registry: [
      {
        source_id: "repo-doc",
        source_kind: "repos",
        title: "Repository",
        access_pattern: "read",
      },
    ],
    failure_taxonomy: [
      {
        failure_id: "missing_evidence",
        label: "Missing evidence",
        description: "The answer is not grounded.",
        severity: "high",
        detection_hints: ["unsupported claim"],
      },
    ],
    verifier_defaults: {
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: ["missing_evidence"],
      output_requirements: ["grounded_response"],
      escalation_policy: "Escalate low-confidence responses.",
    },
    benchmark_seed_specs: [
      {
        seed_id: "seed-1",
        task_family_id: "test-task",
        prompt: "Test prompt.",
        source_refs: ["repo-doc"],
        pass_conditions: ["grounded_response"],
        hard_fail_conditions: [],
      },
    ],
  };
}

function registerTestRun(runId: string, domainPack: DomainPack): void {
  const compiledConfig = compileDomainConfig(domainPack);
  registerNicheRunTraceContext({
    runId,
    nicheProgramId: domainPack.niche_program_id,
    domainPackId: domainPack.domain_pack_id,
    baselineOrCandidateManifestId: "candidate-manifest-1",
    domainPack,
    actionPolicy: {
      allowedTools: domainPack.tool_contracts.map((tc) => tc.tool_name),
    },
    compiledDomainConfig: compiledConfig,
    verifierDecisions: [],
  });
}

afterEach(() => {
  clearAllNicheRunTraceContextsForTest();
});

describe("rankToolsForNicheRun", () => {
  it("sorts domain tools above non-domain tools", () => {
    const domainPack = makeDomainPack();
    registerTestRun("run-rank-1", domainPack);

    const results = rankToolsForNicheRun("run-rank-1", ["write", "exec", "apply_patch", "read"]);

    // "exec" and "read" have domain directives (score 1.0), others get 0.1
    expect(results.length).toBe(4);
    expect(results[0].tool_name).toBe("exec");
    expect(results[0].domain_relevance_score).toBe(1.0);
    expect(results[1].tool_name).toBe("read");
    expect(results[1].domain_relevance_score).toBe(1.0);
    expect(results[2].domain_relevance_score).toBe(0.1);
    expect(results[3].domain_relevance_score).toBe(0.1);
  });

  it("assigns 0.1 score to tools without directives", () => {
    const domainPack = makeDomainPack();
    registerTestRun("run-rank-2", domainPack);

    const results = rankToolsForNicheRun("run-rank-2", ["apply_patch", "memory_search"]);

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.domain_relevance_score).toBe(0.1);
      expect(result.domain_intent).toBe("");
      expect(result.preferred_arguments).toEqual({});
    }
  });

  it("populates domain_intent from the tool directive", () => {
    const domainPack = makeDomainPack();
    registerTestRun("run-rank-3", domainPack);

    const results = rankToolsForNicheRun("run-rank-3", ["exec"]);

    expect(results).toHaveLength(1);
    expect(results[0].domain_intent).toBe("Run shell commands.");
  });

  it("returns empty array when no niche run is active", () => {
    const results = rankToolsForNicheRun("nonexistent-run", ["exec", "read"]);
    expect(results).toEqual([]);
  });

  it("returns empty array when available tools list is empty", () => {
    const domainPack = makeDomainPack();
    registerTestRun("run-rank-4", domainPack);

    const results = rankToolsForNicheRun("run-rank-4", []);
    expect(results).toEqual([]);
  });
});

describe("getDomainArgumentDefaults", () => {
  it("returns defaults from config for a tool with a directive", () => {
    const domainPack = makeDomainPack({
      toolContracts: [
        {
          tool_name: "exec",
          intent_summary: "Run shell commands.",
          required_arguments: ["command"],
          optional_arguments: ["cwd"],
          failure_modes: [],
        },
      ],
    });

    // compileDomainConfig produces empty preferred_arguments by default,
    // so we register a context with a manually set preferred_arguments
    registerNicheRunTraceContext({
      runId: "run-defaults-1",
      nicheProgramId: domainPack.niche_program_id,
      domainPackId: domainPack.domain_pack_id,
      baselineOrCandidateManifestId: "candidate-manifest-1",
      domainPack,
      actionPolicy: {
        allowedTools: ["exec"],
      },
      compiledDomainConfig: {
        niche_program_id: domainPack.niche_program_id,
        domain_pack_id: domainPack.domain_pack_id,
        version: domainPack.version,
        compiled_at: new Date().toISOString(),
        planner: {
          domain_identity: "test",
          reasoning_constraints: [],
          terminology_guidance: [],
          task_decomposition_hints: [],
          failure_awareness: [],
          evidence_requirements: [],
        },
        tools: [
          {
            tool_name: "exec",
            domain_relevance_score: 1.0,
            preferred_arguments: { cwd: "/workspace", timeout: "30000" },
            domain_intent: "Run shell commands.",
            failure_modes: [],
            required_arguments: ["command"],
          },
        ],
        observation: { signal_patterns: [], failure_indicators: [] },
        retrieval: {
          approved_source_ids: [],
          source_descriptions: {},
          freshness_expectations: {},
        },
        exemplars: [],
        constraints: [],
      },
      verifierDecisions: [],
    });

    const defaults = getDomainArgumentDefaults("run-defaults-1", "exec");
    expect(defaults).toEqual({ cwd: "/workspace", timeout: "30000" });
  });

  it("returns empty object for an unknown tool", () => {
    const domainPack = makeDomainPack();
    registerTestRun("run-defaults-2", domainPack);

    const defaults = getDomainArgumentDefaults("run-defaults-2", "nonexistent_tool");
    expect(defaults).toEqual({});
  });

  it("returns empty object when no niche run is active", () => {
    const defaults = getDomainArgumentDefaults("nonexistent-run", "exec");
    expect(defaults).toEqual({});
  });

  it("returns a copy so mutations do not affect the stored config", () => {
    const domainPack = makeDomainPack();
    registerTestRun("run-defaults-3", domainPack);

    const defaults1 = getDomainArgumentDefaults("run-defaults-3", "exec");
    defaults1.injected = "value";

    const defaults2 = getDomainArgumentDefaults("run-defaults-3", "exec");
    expect(defaults2).not.toHaveProperty("injected");
  });
});
