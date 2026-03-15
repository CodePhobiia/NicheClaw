import { describe, expect, it, vi } from "vitest";
import { checkDomainConstraints } from "../../../src/niche/runtime/constraint-enforcer.js";
import { annotateToolResult } from "../../../src/niche/runtime/observation-processor.js";
import { buildNichePlannerPromptBlock } from "../../../src/niche/runtime/planner-injection.js";
import {
  registerPreparedNicheRunTraceContext,
  getCompiledDomainConfig,
  clearNicheRunTraceContext,
} from "../../../src/niche/runtime/run-trace-capture.js";
import {
  rankToolsForNicheRun,
  getDomainArgumentDefaults,
} from "../../../src/niche/runtime/tool-ranking.js";
import type { DomainPack, PreparedNicheRunSeed } from "../../../src/niche/schema/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

function makeDomainPack(): DomainPack {
  return {
    domain_pack_id: "proof-pack",
    niche_program_id: "proof-niche",
    version: "2026.3.14",
    ontology: {
      concepts: [{ id: "repo-doc", label: "Repository document" }],
      relations: [],
    },
    task_taxonomy: [
      {
        task_family_id: "ci-verification",
        label: "CI verification",
        benchmarkable: true,
        required_capabilities: ["evidence_grounding", "code_analysis"],
      },
    ],
    terminology_map: {
      "ci-pipeline": {
        canonical_term: "CI pipeline",
        synonyms: ["build pipeline", "continuous integration"],
        definition: "Automated build and test workflow triggered by commits.",
      },
    },
    constraints: [
      {
        constraint_id: "must-include-tests-passed",
        category: "output_quality",
        rule: "must_include:tests passed",
        severity: "high",
        rationale: "Every response must confirm test passage.",
      },
    ],
    tool_contracts: [
      {
        tool_name: "exec",
        intent_summary: "Run shell commands in the repo sandbox.",
        required_arguments: ["command"],
        optional_arguments: ["cwd"],
        failure_modes: ["timeout", "permission_denied"],
      },
      {
        tool_name: "read",
        intent_summary: "Read file contents from the repository.",
        required_arguments: ["path"],
        optional_arguments: [],
        failure_modes: ["file_not_found"],
      },
    ],
    evidence_source_registry: [
      {
        source_id: "repo-doc",
        source_kind: "repos",
        title: "Primary repository documentation",
        access_pattern: "read",
        trust_notes: "Operator-verified source.",
      },
    ],
    failure_taxonomy: [
      {
        failure_id: "missing-evidence",
        label: "Missing evidence",
        description: "Response lacks grounding in approved evidence sources.",
        severity: "high",
        detection_hints: ["unsupported claim", "no source cited"],
      },
    ],
    verifier_defaults: {
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: ["missing-evidence"],
      output_requirements: ["grounded_response"],
      escalation_policy: "Escalate when confidence is below threshold.",
    },
    benchmark_seed_specs: [
      {
        seed_id: "seed-ci-check",
        task_family_id: "ci-verification",
        prompt: "Verify CI pipeline passes for the latest commit.",
        source_refs: ["repo-doc"],
        pass_conditions: ["tests passed"],
        hard_fail_conditions: ["fabricated evidence"],
      },
    ],
  };
}

function makePreparedSeed(): PreparedNicheRunSeed {
  const domainPack = makeDomainPack();
  return {
    seed_id: "proof-seed",
    prepared_at: "2026-03-14T10:00:00.000Z",
    mode: "live",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: "proof-manifest",
    readiness_report_id: "proof-readiness",
    niche_program_id: "proof-niche",
    domain_pack_id: "proof-pack",
    domain_pack: domainPack,
    source_access_manifest: {
      source_access_manifest_id: "proof-source-access",
      allowed_tools: ["exec", "read"],
      allowed_retrieval_indices: ["repo-doc"],
      allowed_live_sources: [],
      disallowed_sources: [],
      sandbox_policy: "workspace_only",
      network_policy: "deny",
      approval_policy: "operator_optional",
    },
    action_policy_runtime: {
      allowed_tools: ["exec", "read"],
      required_arguments_by_tool: {
        exec: ["command"],
        read: ["path"],
      },
      max_retry_attempts: 1,
    },
    verifier_pack_config: {
      verifier_pack_id: "proof-verifier-pack",
      version: "2026.3.14",
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: ["missing-evidence"],
      output_requirements: ["grounded_response"],
      escalation_policy: "Escalate when confidence is below threshold.",
      min_confidence: 0.7,
      max_allowed_ungrounded_claims: 0,
      require_evidence_bundles: true,
    },
    planner_version_id: "planner-v1",
    action_policy_version_id: "action-policy-v1",
    verifier_pack_version_id: "verifier-pack-v1",
    retrieval_stack_version_id: "retrieval-stack-v1",
    grader_set_version_id: "grader-set-v1",
    runtime_snapshot_id: "proof-runtime",
    context_bundle_id: "proof-context",
    determinism_policy_id: "proof-determinism",
    random_seed: "fixed-seed-proof",
    replayability_status: "non_replayable",
    determinism_notes: "Specialization proof test seed.",
    artifact_refs: [],
    evidence_bundle_refs: [],
  };
}

describe("specialization proof: niche pipeline vs general pipeline", () => {
  it("proves every pipeline stage transforms behavior with niche active and is inert without", async () => {
    await withTempHome(async () => {
      const runId = "proof-run-001";
      const seed = makePreparedSeed();

      // ── Register the niche run context ──────────────────────────────
      registerPreparedNicheRunTraceContext({ runId, seed });

      // ── 3. getCompiledDomainConfig returns a real config ────────────
      const compiledConfig = getCompiledDomainConfig(runId);
      expect(compiledConfig).not.toBeNull();
      expect(compiledConfig).not.toBeUndefined();
      expect(compiledConfig!.niche_program_id).toBe("proof-niche");
      expect(compiledConfig!.domain_pack_id).toBe("proof-pack");

      // ── 4. Planner prompt block is domain-aware ─────────────────────
      const plannerBlock = buildNichePlannerPromptBlock(runId);
      expect(plannerBlock).not.toBeNull();
      expect(plannerBlock).toContain("Domain Specialization");
      // The constraint rule text (the must_include rule) should appear
      // via the reasoning_constraints rendering.
      expect(plannerBlock).toContain("must_include:tests passed");

      // ── 5. Tool ranking prioritizes domain tools ────────────────────
      const rankings = rankToolsForNicheRun(runId, ["exec", "read", "web_search"]);
      expect(rankings).toHaveLength(3);

      const execRanking = rankings.find((r) => r.tool_name === "exec")!;
      const readRanking = rankings.find((r) => r.tool_name === "read")!;
      const webSearchRanking = rankings.find((r) => r.tool_name === "web_search")!;

      expect(execRanking.domain_relevance_score).toBe(1.0);
      expect(readRanking.domain_relevance_score).toBe(1.0);
      expect(webSearchRanking.domain_relevance_score).toBe(0.1);

      // ── 6. getDomainArgumentDefaults works for domain tools ─────────
      const execDefaults = getDomainArgumentDefaults(runId, "exec");
      expect(execDefaults).toBeDefined();
      expect(typeof execDefaults).toBe("object");

      // ── 7. Observation processor detects domain-relevant signals ────
      const relevantAnnotation = annotateToolResult(runId, "exec", "source from repo-doc found");
      expect(relevantAnnotation.domain_relevance).toBe("high");

      // ── 8. Constraint check passes when content satisfies rules ─────
      const passingCheck = checkDomainConstraints(runId, "all tests passed and verified");
      expect(passingCheck.passed).toBe(true);

      // ── 9. Constraint check catches violations ──────────────────────
      const failingCheck = checkDomainConstraints(runId, "no evidence available");
      // The must_include constraint should fire because "tests passed"
      // is not present in the content.
      const mustIncludeViolation = failingCheck.violations.find(
        (v) => v.constraint_id === "must-include-tests-passed",
      );
      expect(mustIncludeViolation).toBeDefined();
      expect(mustIncludeViolation!.rule).toBe("must_include:tests passed");
      // severity is "high" which means blocking
      expect(failingCheck.passed).toBe(false);

      // ── Clear the niche context ─────────────────────────────────────
      clearNicheRunTraceContext(runId);

      // ── 10. getCompiledDomainConfig returns undefined ───────────────
      expect(getCompiledDomainConfig(runId)).toBeUndefined();

      // ── 11. Planner prompt block is null ────────────────────────────
      expect(buildNichePlannerPromptBlock(runId)).toBeNull();

      // ── 12. Tool ranking returns empty array ────────────────────────
      const emptyRankings = rankToolsForNicheRun(runId, ["exec"]);
      expect(emptyRankings).toEqual([]);

      // ── 13. Observation processor returns low relevance ─────────────
      const inertAnnotation = annotateToolResult(runId, "exec", "anything");
      expect(inertAnnotation.domain_relevance).toBe("low");

      // ── 14. Constraint enforcer is permissive ───────────────────────
      const inertCheck = checkDomainConstraints(runId, "anything");
      expect(inertCheck.passed).toBe(true);
      expect(inertCheck.violations).toEqual([]);
    });
  });

  it("partial domain config with empty constraints list produces planner block but no constraint violations", async () => {
    await withTempHome(async () => {
      const runId = "proof-run-partial-constraints";
      const seed = makePreparedSeed();
      // Mutate the domain pack to have empty constraints
      seed.domain_pack = {
        ...makeDomainPack(),
        constraints: [],
      };
      registerPreparedNicheRunTraceContext({ runId, seed });

      // Planner block still generated (ontology and taxonomy are present)
      const plannerBlock = buildNichePlannerPromptBlock(runId);
      expect(plannerBlock).not.toBeNull();
      expect(plannerBlock).toContain("Domain Specialization");

      // Constraint check with empty constraints always passes
      const check = checkDomainConstraints(runId, "anything at all");
      expect(check.passed).toBe(true);
      expect(check.violations).toEqual([]);

      clearNicheRunTraceContext(runId);
    });
  });

  it("empty tool_contracts leads tool ranking to return low relevance for all tools", async () => {
    await withTempHome(async () => {
      const runId = "proof-run-empty-tools";
      const seed = makePreparedSeed();
      seed.domain_pack = {
        ...makeDomainPack(),
        tool_contracts: [],
      };
      // Also clear action_policy_runtime allowed_tools to match
      seed.action_policy_runtime = {
        allowed_tools: [],
        required_arguments_by_tool: {},
        max_retry_attempts: 1,
      };
      registerPreparedNicheRunTraceContext({ runId, seed });

      const rankings = rankToolsForNicheRun(runId, ["exec", "read", "web_search"]);
      // All tools should have low domain relevance since none are in tool_contracts
      for (const ranking of rankings) {
        expect(ranking.domain_relevance_score).toBeLessThan(0.5);
      }

      clearNicheRunTraceContext(runId);
    });
  });

  it("multiple constraints all appear in planner block", async () => {
    await withTempHome(async () => {
      const runId = "proof-run-multi-constraints";
      const seed = makePreparedSeed();
      seed.domain_pack = {
        ...makeDomainPack(),
        constraints: [
          {
            constraint_id: "constraint-alpha",
            category: "output_quality",
            rule: "must_include:alpha value",
            severity: "high",
            rationale: "Alpha must be included.",
          },
          {
            constraint_id: "constraint-beta",
            category: "output_quality",
            rule: "must_not_include:beta secret",
            severity: "high",
            rationale: "Beta secret must not appear.",
          },
          {
            constraint_id: "constraint-gamma",
            category: "safety",
            rule: "must_include:gamma check",
            severity: "medium",
            rationale: "Gamma check recommended.",
          },
        ],
      };
      registerPreparedNicheRunTraceContext({ runId, seed });

      const plannerBlock = buildNichePlannerPromptBlock(runId);
      expect(plannerBlock).not.toBeNull();
      expect(plannerBlock).toContain("must_include:alpha value");
      expect(plannerBlock).toContain("must_not_include:beta secret");
      expect(plannerBlock).toContain("must_include:gamma check");

      clearNicheRunTraceContext(runId);
    });
  });

  it("minimal domain pack with only ontology (no constraints, no tools) produces graceful behavior", async () => {
    await withTempHome(async () => {
      const runId = "proof-run-minimal-pack";
      const seed = makePreparedSeed();
      seed.domain_pack = {
        ...makeDomainPack(),
        constraints: [],
        tool_contracts: [],
        task_taxonomy: [],
        terminology_map: {},
        evidence_source_registry: [],
        failure_taxonomy: [],
        benchmark_seed_specs: [],
      };
      seed.action_policy_runtime = {
        allowed_tools: [],
        required_arguments_by_tool: {},
        max_retry_attempts: 1,
      };
      seed.source_access_manifest = {
        ...seed.source_access_manifest,
        allowed_tools: [],
        allowed_retrieval_indices: [],
      };
      registerPreparedNicheRunTraceContext({ runId, seed });

      // Config is still present
      const compiledConfig = getCompiledDomainConfig(runId);
      expect(compiledConfig).not.toBeNull();
      expect(compiledConfig!.niche_program_id).toBe("proof-niche");

      // Planner block generated (at minimum, ontology concepts are present)
      const plannerBlock = buildNichePlannerPromptBlock(runId);
      expect(plannerBlock).not.toBeNull();

      // Constraints pass vacuously
      const check = checkDomainConstraints(runId, "any content");
      expect(check.passed).toBe(true);
      expect(check.violations).toEqual([]);

      // Tool ranking returns low relevance for all tools since none in contracts
      const rankings = rankToolsForNicheRun(runId, ["exec"]);
      for (const ranking of rankings) {
        expect(ranking.domain_relevance_score).toBeLessThan(0.5);
      }

      // Observation processor returns low relevance (no evidence sources matched)
      const annotation = annotateToolResult(runId, "exec", "some output");
      expect(annotation.domain_relevance).toBe("low");

      clearNicheRunTraceContext(runId);
    });
  });
});
