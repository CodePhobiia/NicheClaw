import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkDomainConstraints,
  clearAllNicheRunTraceContextsForTest,
  registerPreparedNicheRunTraceContext,
} from "../../../src/niche/runtime/index.js";
import type { PreparedNicheRunSeed } from "../../../src/niche/schema/index.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: () => false,
    runNicheLifecycle: async () => {},
  }),
}));

function makeSeed(
  constraints: Array<{
    constraint_id: string;
    category: string;
    rule: string;
    severity: string;
    rationale?: string;
  }>,
): PreparedNicheRunSeed {
  return {
    seed_id: "prepared-run-seed-constraint-enforcer",
    prepared_at: "2026-03-14T10:00:00.000Z",
    mode: "benchmark",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: "candidate-manifest-constraint",
    readiness_report_id: "constraint-readiness",
    niche_program_id: "constraint-test-specialist",
    domain_pack_id: "constraint-test-pack",
    domain_pack: {
      domain_pack_id: "constraint-test-pack",
      niche_program_id: "constraint-test-specialist",
      version: "2026.3.14",
      ontology: { concepts: [], relations: [] },
      task_taxonomy: [
        {
          task_family_id: "constraint-verification",
          label: "Constraint verification",
          benchmarkable: true,
          required_capabilities: ["evidence_grounding"],
        },
      ],
      terminology_map: {},
      constraints,
      tool_contracts: [
        {
          tool_name: "exec",
          intent_summary: "Run commands.",
          required_arguments: ["command"],
          optional_arguments: [],
          failure_modes: ["missing_evidence"],
        },
      ],
      evidence_source_registry: [
        {
          source_id: "test-source",
          source_kind: "repo_file",
          title: "Test source",
          access_pattern: "read_file",
        },
      ],
      failure_taxonomy: [
        {
          failure_id: "missing_evidence",
          label: "Missing evidence",
          description: "Evidence is missing.",
          severity: "high",
          detection_hints: ["unsupported claim"],
        },
      ],
      verifier_defaults: {
        required_checks: ["evidence_grounding"],
        blocking_failure_ids: ["missing_evidence"],
        output_requirements: ["grounded_response"],
        escalation_policy: "Escalate low-confidence outputs.",
      },
      benchmark_seed_specs: [
        {
          seed_id: "seed-1",
          task_family_id: "constraint-verification",
          prompt: "Verify constraints.",
          source_refs: ["test-source"],
          pass_conditions: ["grounded_response"],
          hard_fail_conditions: [],
        },
      ],
    },
    source_access_manifest: {
      source_access_manifest_id: "source-access-constraint",
      allowed_tools: ["exec"],
      allowed_retrieval_indices: ["test-source"],
      allowed_live_sources: [],
      disallowed_sources: [],
      sandbox_policy: "workspace-only",
      network_policy: "deny",
      approval_policy: "never",
    },
    action_policy_runtime: {
      allowed_tools: ["exec"],
      required_arguments_by_tool: { exec: ["command"] },
    },
    verifier_pack_config: {
      verifier_pack_id: "verifier-pack-constraint",
      version: "2026.3.14",
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: ["missing_evidence"],
      output_requirements: ["grounded_response"],
      escalation_policy: "Escalate low-confidence outputs.",
      min_confidence: 0.6,
      max_allowed_ungrounded_claims: 0,
      require_evidence_bundles: true,
    },
    planner_version_id: "planner-v1",
    action_policy_version_id: "action-policy-v1",
    verifier_pack_version_id: "verifier-pack-v1",
    retrieval_stack_version_id: "retrieval-stack-v1",
    grader_set_version_id: "grader-set-v1",
    runtime_snapshot_id: "runtime-snapshot-v1",
    context_bundle_id: "context-bundle-v1",
    determinism_policy_id: "determinism-v1",
    random_seed: "seed-1",
    replayability_status: "non_replayable",
    determinism_notes: "Constraint enforcer test run.",
    artifact_refs: [],
    evidence_bundle_refs: [],
  };
}

afterEach(() => {
  clearAllNicheRunTraceContextsForTest();
});

describe("constraint enforcer", () => {
  it("returns passed with no violations when no niche run is active", () => {
    const result = checkDomainConstraints("nonexistent-run", "any content");
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("must_include: content lacking required text fails", () => {
    const seed = makeSeed([
      {
        constraint_id: "must-mention-tests",
        category: "output",
        rule: "must_include:tests passed",
        severity: "high",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-mi-fail", seed });

    const result = checkDomainConstraints("run-mi-fail", "The build completed successfully.");
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.constraint_id).toBe("must-mention-tests");
    expect(result.violations[0]!.rule).toBe("must_include:tests passed");
    expect(result.violations[0]!.blocking).toBe(true);
  });

  it("must_include: content containing required text passes", () => {
    const seed = makeSeed([
      {
        constraint_id: "must-mention-tests",
        category: "output",
        rule: "must_include:tests passed",
        severity: "high",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-mi-pass", seed });

    const result = checkDomainConstraints(
      "run-mi-pass",
      "All tests passed with grounded evidence.",
    );
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("must_include: check is case-insensitive", () => {
    const seed = makeSeed([
      {
        constraint_id: "must-mention-tests",
        category: "output",
        rule: "must_include:Tests Passed",
        severity: "high",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-mi-case", seed });

    const result = checkDomainConstraints("run-mi-case", "all TESTS PASSED successfully.");
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("must_not_include: content containing forbidden text fails", () => {
    const seed = makeSeed([
      {
        constraint_id: "no-internal-secrets",
        category: "security",
        rule: "must_not_include:SECRET_KEY",
        severity: "critical",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-mni-fail", seed });

    const result = checkDomainConstraints("run-mni-fail", "The secret_key is ABC123.");
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.constraint_id).toBe("no-internal-secrets");
    expect(result.violations[0]!.rule).toBe("must_not_include:SECRET_KEY");
    expect(result.violations[0]!.blocking).toBe(true);
  });

  it("must_not_include: content lacking forbidden text passes", () => {
    const seed = makeSeed([
      {
        constraint_id: "no-internal-secrets",
        category: "security",
        rule: "must_not_include:SECRET_KEY",
        severity: "critical",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-mni-pass", seed });

    const result = checkDomainConstraints(
      "run-mni-pass",
      "The output is safe and contains no secrets.",
    );
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("high-severity violations are blocking", () => {
    const seed = makeSeed([
      {
        constraint_id: "high-sev",
        category: "output",
        rule: "must_include:required text",
        severity: "high",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-high-sev", seed });

    const result = checkDomainConstraints("run-high-sev", "no match here");
    expect(result.passed).toBe(false);
    expect(result.violations[0]!.blocking).toBe(true);
  });

  it("critical-severity violations are blocking", () => {
    const seed = makeSeed([
      {
        constraint_id: "critical-sev",
        category: "output",
        rule: "must_not_include:forbidden",
        severity: "critical",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-critical-sev", seed });

    const result = checkDomainConstraints("run-critical-sev", "this contains forbidden text");
    expect(result.passed).toBe(false);
    expect(result.violations[0]!.blocking).toBe(true);
  });

  it("moderate-severity violations are NOT blocking (passed is still true)", () => {
    const seed = makeSeed([
      {
        constraint_id: "moderate-sev",
        category: "output",
        rule: "must_include:recommended text",
        severity: "moderate",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-moderate-sev", seed });

    const result = checkDomainConstraints("run-moderate-sev", "no match here");
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.blocking).toBe(false);
    expect(result.violations[0]!.severity).toBe("moderate");
  });

  it("low-severity violations are NOT blocking", () => {
    const seed = makeSeed([
      {
        constraint_id: "low-sev",
        category: "style",
        rule: "must_include:please",
        severity: "low",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-low-sev", seed });

    const result = checkDomainConstraints("run-low-sev", "no match here");
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.blocking).toBe(false);
  });

  it("checks multiple constraints together", () => {
    const seed = makeSeed([
      {
        constraint_id: "must-mention-tests",
        category: "output",
        rule: "must_include:tests passed",
        severity: "high",
      },
      {
        constraint_id: "no-secrets",
        category: "security",
        rule: "must_not_include:api_key",
        severity: "critical",
      },
      {
        constraint_id: "style-note",
        category: "style",
        rule: "must_include:summary",
        severity: "moderate",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-multi", seed });

    // Content has "tests passed" (satisfies first), contains "api_key" (violates second),
    // and lacks "summary" (violates third)
    const result = checkDomainConstraints(
      "run-multi",
      "All tests passed. The api_key is exposed here.",
    );
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);

    const secretViolation = result.violations.find((v) => v.constraint_id === "no-secrets");
    expect(secretViolation).toBeDefined();
    expect(secretViolation!.blocking).toBe(true);
    expect(secretViolation!.severity).toBe("critical");

    const styleViolation = result.violations.find((v) => v.constraint_id === "style-note");
    expect(styleViolation).toBeDefined();
    expect(styleViolation!.blocking).toBe(false);
    expect(styleViolation!.severity).toBe("moderate");
  });

  it("skips must_ground_in_evidence constraints (handled by verifier)", () => {
    const seed = makeSeed([
      {
        constraint_id: "grounding",
        category: "grounding",
        rule: "must_ground_in_evidence",
        severity: "high",
      },
      {
        constraint_id: "must-mention-tests",
        category: "output",
        rule: "must_include:tests passed",
        severity: "moderate",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-skip-ground", seed });

    const result = checkDomainConstraints("run-skip-ground", "no tests here");
    // Only the must_include violation should appear; must_ground_in_evidence is skipped
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.constraint_id).toBe("must-mention-tests");
    expect(result.passed).toBe(true); // moderate severity is non-blocking
  });

  it("skips unknown rule formats", () => {
    const seed = makeSeed([
      {
        constraint_id: "future-rule",
        category: "experimental",
        rule: "regex_match:[0-9]+",
        severity: "high",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-skip-unknown", seed });

    const result = checkDomainConstraints("run-skip-unknown", "any content");
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("handles content with all constraints satisfied", () => {
    const seed = makeSeed([
      {
        constraint_id: "must-have-tests",
        category: "output",
        rule: "must_include:tests passed",
        severity: "high",
      },
      {
        constraint_id: "no-secrets",
        category: "security",
        rule: "must_not_include:secret_key",
        severity: "critical",
      },
      {
        constraint_id: "grounding",
        category: "grounding",
        rule: "must_ground_in_evidence",
        severity: "high",
      },
    ]);
    registerPreparedNicheRunTraceContext({ runId: "run-all-pass", seed });

    const result = checkDomainConstraints(
      "run-all-pass",
      "All tests passed. Output is grounded with evidence.",
    );
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
