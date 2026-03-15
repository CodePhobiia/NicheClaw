import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompiledDomainConfig } from "../../../src/niche/domain/compiled-config.js";
import {
  buildNichePlannerPromptBlock,
  clearAllNicheRunTraceContextsForTest,
  formatPlannerBlock,
  registerPreparedNicheRunTraceContext,
} from "../../../src/niche/runtime/index.js";
import type { PreparedNicheRunSeed } from "../../../src/niche/schema/index.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

afterEach(() => {
  clearAllNicheRunTraceContextsForTest();
});

function makeFullConfig(): CompiledDomainConfig {
  return {
    niche_program_id: "repo-ci-specialist",
    domain_pack_id: "repo-ci-pack",
    version: "2026.3.12",
    compiled_at: "2026-03-12T12:00:00.000Z",
    planner: {
      domain_identity:
        "You are a specialist in repo-ci-specialist. Your responses must be grounded in approved domain evidence.",
      reasoning_constraints: ["[moderate] must_ground_in_evidence — Outputs must cite sources"],
      terminology_guidance: [
        'Use "continuous integration" (not CI, ci): Automated build and test pipeline.',
      ],
      task_decomposition_hints: [
        'Task family "repo-ci-verification": requires [evidence_grounding]',
      ],
      failure_awareness: [
        'Avoid "Missing evidence" (high): The answer is not grounded. Detection hints: unsupported claim',
      ],
      evidence_requirements: ["grounded_response"],
    },
    tools: [
      {
        tool_name: "exec",
        domain_relevance_score: 1.0,
        preferred_arguments: {},
        domain_intent: "Run repo commands.",
        failure_modes: ["missing_evidence"],
        required_arguments: ["command"],
      },
    ],
    observation: {
      signal_patterns: [
        {
          source_id: "repo-doc",
          pattern_description: "Repository",
          extraction_hint: "Access via read. Trust: standard.",
        },
      ],
      failure_indicators: [
        {
          failure_id: "missing_evidence",
          detection_hints: ["unsupported claim"],
          severity: "high",
        },
      ],
    },
    retrieval: {
      approved_source_ids: ["repo-doc"],
      source_descriptions: { "repo-doc": "Repository" },
      freshness_expectations: {},
    },
    exemplars: [
      {
        seed_id: "seed-1",
        task_family_id: "repo-ci-verification",
        prompt: "Investigate the failing benchmark case.",
        pass_conditions: ["grounded_response"],
        hard_fail_conditions: [],
      },
      {
        seed_id: "seed-2",
        task_family_id: "code-review",
        prompt: "Review the pull request for correctness.",
        pass_conditions: ["accurate_review"],
        hard_fail_conditions: ["false_positive"],
      },
      {
        seed_id: "seed-3",
        task_family_id: "dependency-audit",
        prompt: "Audit the package dependencies for vulnerabilities.",
        pass_conditions: ["complete_audit"],
        hard_fail_conditions: [],
      },
      {
        seed_id: "seed-4",
        task_family_id: "should-be-omitted",
        prompt: "This exemplar should not appear (beyond 3 limit).",
        pass_conditions: ["never_seen"],
        hard_fail_conditions: [],
      },
    ],
    constraints: [
      {
        constraint_id: "must-ground-output",
        category: "grounding",
        rule: "must_ground_in_evidence",
        severity: "moderate",
        rationale: "Outputs must cite sources",
      },
    ],
  };
}

function makeEmptyConfig(): CompiledDomainConfig {
  return {
    niche_program_id: "empty-program",
    domain_pack_id: "empty-pack",
    version: "1.0.0",
    compiled_at: "2026-03-12T12:00:00.000Z",
    planner: {
      domain_identity: "You are a specialist in empty-program.",
      reasoning_constraints: [],
      terminology_guidance: [],
      task_decomposition_hints: [],
      failure_awareness: [],
      evidence_requirements: [],
    },
    tools: [],
    observation: {
      signal_patterns: [],
      failure_indicators: [],
    },
    retrieval: {
      approved_source_ids: [],
      source_descriptions: {},
      freshness_expectations: {},
    },
    exemplars: [],
    constraints: [],
  };
}

function makeSeed(): PreparedNicheRunSeed {
  return {
    seed_id: "prepared-run-seed-planner-injection",
    prepared_at: "2026-03-12T12:00:00.000Z",
    mode: "benchmark",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: "candidate-manifest-repo-ci",
    readiness_report_id: "repo-ci-specialist-readiness",
    niche_program_id: "repo-ci-specialist",
    domain_pack_id: "repo-ci-pack",
    domain_pack: {
      domain_pack_id: "repo-ci-pack",
      niche_program_id: "repo-ci-specialist",
      version: "2026.3.12",
      ontology: { concepts: [{ id: "repo-doc", label: "Repo doc" }], relations: [] },
      task_taxonomy: [
        {
          task_family_id: "repo-ci-verification",
          label: "Repo CI verification",
          benchmarkable: true,
          required_capabilities: ["evidence_grounding"],
        },
      ],
      terminology_map: {},
      constraints: [
        {
          constraint_id: "must-ground-output",
          category: "grounding",
          rule: "must_ground_in_evidence",
          severity: "moderate",
        },
      ],
      tool_contracts: [
        {
          tool_name: "exec",
          intent_summary: "Run repo commands.",
          required_arguments: ["command"],
          optional_arguments: [],
          failure_modes: ["missing_evidence"],
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
          task_family_id: "repo-ci-verification",
          prompt: "Investigate the failing benchmark case.",
          source_refs: ["repo-doc"],
          pass_conditions: ["grounded_response"],
          hard_fail_conditions: [],
        },
      ],
    },
    source_access_manifest: {
      source_access_manifest_id: "source-access-repo-ci",
      allowed_tools: ["exec"],
      allowed_retrieval_indices: ["repo-doc"],
      allowed_live_sources: [],
      disallowed_sources: [],
      sandbox_policy: "workspace-only",
      network_policy: "deny",
      approval_policy: "never",
    },
    action_policy_runtime: {
      allowed_tools: ["exec"],
      required_arguments_by_tool: {
        exec: ["command"],
      },
    },
    verifier_pack_config: {
      verifier_pack_id: "verifier-pack-repo-ci",
      version: "2026.3.12",
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: ["missing_evidence"],
      output_requirements: ["grounded_response"],
      escalation_policy: "Escalate low-confidence responses.",
      min_confidence: 0.6,
      max_allowed_ungrounded_claims: 0,
      require_evidence_bundles: true,
    },
    planner_version_id: "planner-primary-v1",
    action_policy_version_id: "action-policy-v1",
    verifier_pack_version_id: "verifier-pack-v1",
    retrieval_stack_version_id: "retrieval-stack-v1",
    grader_set_version_id: "grader-set-v1",
    runtime_snapshot_id: "runtime-snapshot-v1",
    context_bundle_id: "context-bundle-v1",
    determinism_policy_id: "determinism-v1",
    random_seed: "seed-1",
    replayability_status: "non_replayable",
    determinism_notes: "Explicit local seeded run.",
    artifact_refs: [],
    evidence_bundle_refs: [],
  };
}

describe("formatPlannerBlock", () => {
  it("produces expected sections from a full compiled config", () => {
    const config = makeFullConfig();
    const block = formatPlannerBlock(config);

    expect(block).toContain("## Domain Specialization");
    expect(block).toContain("repo-ci-specialist");
    expect(block).toContain("## Domain Constraints");
    expect(block).toContain("must_ground_in_evidence");
    expect(block).toContain("## Domain Terminology");
    expect(block).toContain("continuous integration");
    expect(block).toContain("## Task Families");
    expect(block).toContain("repo-ci-verification");
    expect(block).toContain("## Known Failure Modes");
    expect(block).toContain("Missing evidence");
    expect(block).toContain("## Output Requirements");
    expect(block).toContain("grounded_response");
    expect(block).toContain("## Approved Evidence Sources");
    expect(block).toContain("Repository (repo-doc)");
    expect(block).toContain("## Domain Examples");
    expect(block).toContain("Investigate the failing benchmark case.");
  });

  it("includes domain identity in the specialization section", () => {
    const config = makeFullConfig();
    const block = formatPlannerBlock(config);
    const identitySection = block.split("\n\n")[0];
    expect(identitySection).toContain("## Domain Specialization");
    expect(identitySection).toContain(config.planner.domain_identity);
  });

  it("formats constraints as bullet list", () => {
    const config = makeFullConfig();
    const block = formatPlannerBlock(config);
    expect(block).toContain("- [moderate] must_ground_in_evidence");
  });

  it("formats terminology guidance as bullet list", () => {
    const config = makeFullConfig();
    const block = formatPlannerBlock(config);
    expect(block).toContain('- Use "continuous integration"');
  });

  it("formats failure modes as bullet list", () => {
    const config = makeFullConfig();
    const block = formatPlannerBlock(config);
    expect(block).toContain('- Avoid "Missing evidence" (high)');
  });

  it("formats evidence requirements as bullet list", () => {
    const config = makeFullConfig();
    const block = formatPlannerBlock(config);
    expect(block).toContain("- grounded_response");
  });

  it("formats approved sources with descriptions and IDs", () => {
    const config = makeFullConfig();
    const block = formatPlannerBlock(config);
    expect(block).toContain("- Repository (repo-doc)");
  });

  it("includes exemplars with prompt and pass conditions", () => {
    const config = makeFullConfig();
    const block = formatPlannerBlock(config);
    expect(block).toContain("### Example: repo-ci-verification");
    expect(block).toContain("Prompt: Investigate the failing benchmark case.");
    expect(block).toContain("Pass conditions: grounded_response");
  });

  it("limits exemplars to first 3", () => {
    const config = makeFullConfig();
    const block = formatPlannerBlock(config);
    expect(block).toContain("### Example: repo-ci-verification");
    expect(block).toContain("### Example: code-review");
    expect(block).toContain("### Example: dependency-audit");
    expect(block).not.toContain("### Example: should-be-omitted");
    expect(block).not.toContain("This exemplar should not appear");
  });

  it("skips empty sections", () => {
    const config = makeEmptyConfig();
    const block = formatPlannerBlock(config);

    expect(block).toContain("## Domain Specialization");
    expect(block).not.toContain("## Domain Constraints");
    expect(block).not.toContain("## Domain Terminology");
    expect(block).not.toContain("## Task Families");
    expect(block).not.toContain("## Known Failure Modes");
    expect(block).not.toContain("## Output Requirements");
    expect(block).not.toContain("## Approved Evidence Sources");
    expect(block).not.toContain("## Domain Examples");
  });

  it("joins sections with double newlines", () => {
    const config = makeFullConfig();
    const block = formatPlannerBlock(config);
    const sections = block.split("\n\n");
    // Should have at least domain identity + constraints + terminology, etc.
    expect(sections.length).toBeGreaterThanOrEqual(8);
  });
});

describe("buildNichePlannerPromptBlock", () => {
  it("returns null when no niche run is active", () => {
    const result = buildNichePlannerPromptBlock("nonexistent-run-id");
    expect(result).toBeNull();
  });

  it("returns a prompt block when a niche run is active", () => {
    const seed = makeSeed();
    registerPreparedNicheRunTraceContext({
      runId: "run-planner-injection-1",
      seed,
    });

    const result = buildNichePlannerPromptBlock("run-planner-injection-1");
    expect(result).not.toBeNull();
    expect(result).toContain("## Domain Specialization");
    expect(result).toContain("repo-ci-specialist");
    expect(result).toContain("## Domain Constraints");
    expect(result).toContain("## Known Failure Modes");
    expect(result).toContain("Missing evidence");
    expect(result).toContain("## Output Requirements");
    expect(result).toContain("grounded_response");
    expect(result).toContain("## Approved Evidence Sources");
    expect(result).toContain("Repository (repo-doc)");
    expect(result).toContain("## Domain Examples");
    expect(result).toContain("Investigate the failing benchmark case.");
  });

  it("returns null for a cleared run context", () => {
    const seed = makeSeed();
    registerPreparedNicheRunTraceContext({
      runId: "run-planner-cleared",
      seed,
    });

    // Verify it works first
    expect(buildNichePlannerPromptBlock("run-planner-cleared")).not.toBeNull();

    // Clear and verify null
    clearAllNicheRunTraceContextsForTest();
    expect(buildNichePlannerPromptBlock("run-planner-cleared")).toBeNull();
  });
});
