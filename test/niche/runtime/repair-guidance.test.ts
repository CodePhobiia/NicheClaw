import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDomainRepairPrompt,
  clearAllNicheRunTraceContextsForTest,
  getRepairAttemptLimit,
  registerPreparedNicheRunTraceContext,
} from "../../../src/niche/runtime/index.js";
import type { PreparedNicheRunSeed } from "../../../src/niche/schema/index.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: () => false,
    runNicheLifecycle: async () => {},
  }),
}));

function makeSeed(overrides?: {
  constraints?: Array<{
    constraint_id: string;
    category: string;
    rule: string;
    severity: string;
    rationale?: string;
  }>;
  outputRequirements?: string[];
  maxRepairAttempts?: number;
}): PreparedNicheRunSeed {
  return {
    seed_id: "prepared-run-seed-repair-guidance",
    prepared_at: "2026-03-14T10:00:00.000Z",
    mode: "benchmark",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: "candidate-manifest-repair",
    readiness_report_id: "repair-readiness",
    niche_program_id: "repair-test-specialist",
    domain_pack_id: "repair-test-pack",
    domain_pack: {
      domain_pack_id: "repair-test-pack",
      niche_program_id: "repair-test-specialist",
      version: "2026.3.14",
      ontology: { concepts: [], relations: [] },
      task_taxonomy: [
        {
          task_family_id: "repair-verification",
          label: "Repair verification",
          benchmarkable: true,
          required_capabilities: ["evidence_grounding"],
        },
      ],
      terminology_map: {},
      constraints: overrides?.constraints ?? [
        {
          constraint_id: "must-mention-tests",
          category: "output",
          rule: "must_include:tests passed",
          severity: "moderate",
        },
        {
          constraint_id: "no-secrets",
          category: "security",
          rule: "must_not_include:SECRET_KEY",
          severity: "critical",
        },
      ],
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
        output_requirements: overrides?.outputRequirements ?? [
          "grounded_response",
          "must_include:tests passed",
        ],
        escalation_policy: "Escalate low-confidence outputs.",
      },
      benchmark_seed_specs: [
        {
          seed_id: "seed-1",
          task_family_id: "repair-verification",
          prompt: "Verify repair guidance.",
          source_refs: ["test-source"],
          pass_conditions: ["grounded_response"],
          hard_fail_conditions: [],
        },
      ],
    },
    source_access_manifest: {
      source_access_manifest_id: "source-access-repair",
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
      max_repair_attempts: overrides?.maxRepairAttempts,
    },
    verifier_pack_config: {
      verifier_pack_id: "verifier-pack-repair",
      version: "2026.3.14",
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: ["missing_evidence"],
      output_requirements: overrides?.outputRequirements ?? [
        "grounded_response",
        "must_include:tests passed",
      ],
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
    determinism_notes: "Repair guidance test run.",
    artifact_refs: [],
    evidence_bundle_refs: [],
  };
}

afterEach(() => {
  clearAllNicheRunTraceContextsForTest();
});

describe("buildDomainRepairPrompt", () => {
  it("returns null when no niche run is active", () => {
    const result = buildDomainRepairPrompt({
      runId: "nonexistent-run",
      findings: [
        {
          finding_id: "must-mention-tests",
          category: "constraint",
          severity: "moderate",
          message: "Output does not include required text.",
        },
      ],
      originalOutput: "Some output without tests passed.",
    });
    expect(result).toBeNull();
  });

  it("produces repair guidance mentioning specific constraint violations", () => {
    const seed = makeSeed();
    registerPreparedNicheRunTraceContext({ runId: "run-repair-1", seed });

    const result = buildDomainRepairPrompt({
      runId: "run-repair-1",
      findings: [
        {
          finding_id: "must-mention-tests",
          category: "constraint",
          severity: "moderate",
          message: "Output does not include required text.",
        },
      ],
      originalOutput: "Some output without tests passed.",
    });

    expect(result).not.toBeNull();
    expect(result).toContain("Your output needs revision:");
    expect(result).toContain("must-mention-tests");
    expect(result).toContain("must_include:tests passed");
  });

  it("matches findings by category when finding_id does not match a constraint", () => {
    const seed = makeSeed();
    registerPreparedNicheRunTraceContext({ runId: "run-repair-cat", seed });

    const result = buildDomainRepairPrompt({
      runId: "run-repair-cat",
      findings: [
        {
          finding_id: "unknown-finding",
          category: "security",
          severity: "critical",
          message: "Security violation detected.",
        },
      ],
      originalOutput: "Leaked SECRET_KEY here.",
    });

    expect(result).not.toBeNull();
    expect(result).toContain("no-secrets");
    expect(result).toContain("must_not_include:SECRET_KEY");
  });

  it("includes evidence requirements from the domain", () => {
    const seed = makeSeed({
      outputRequirements: ["grounded_response", "must_include:tests passed"],
    });
    registerPreparedNicheRunTraceContext({ runId: "run-repair-evidence", seed });

    const result = buildDomainRepairPrompt({
      runId: "run-repair-evidence",
      findings: [
        {
          finding_id: "must-mention-tests",
          category: "constraint",
          severity: "moderate",
          message: "Output does not include required text.",
        },
      ],
      originalOutput: "Some output.",
    });

    expect(result).not.toBeNull();
    expect(result).toContain("Domain requirements:");
    expect(result).toContain("grounded_response");
    expect(result).toContain("must_include:tests passed");
  });

  it("returns null when findings array is empty", () => {
    const seed = makeSeed();
    registerPreparedNicheRunTraceContext({ runId: "run-repair-empty", seed });

    const result = buildDomainRepairPrompt({
      runId: "run-repair-empty",
      findings: [],
      originalOutput: "Some output.",
    });

    expect(result).toBeNull();
  });

  it("provides generic guidance for findings that do not match any constraint", () => {
    const seed = makeSeed();
    registerPreparedNicheRunTraceContext({ runId: "run-repair-unmatched", seed });

    const result = buildDomainRepairPrompt({
      runId: "run-repair-unmatched",
      findings: [
        {
          finding_id: "completely-unknown",
          category: "completely-unknown-category",
          severity: "warning",
          message: "Some unrecognized issue.",
        },
      ],
      originalOutput: "Output text.",
    });

    expect(result).not.toBeNull();
    expect(result).toContain("Address the issue identified by the verifier");
  });

  it("includes constraint rationale when available", () => {
    const seed = makeSeed({
      constraints: [
        {
          constraint_id: "require-summary",
          category: "output",
          rule: "must_include:summary",
          severity: "moderate",
          rationale: "Summaries help the reader understand the key points quickly.",
        },
      ],
    });
    registerPreparedNicheRunTraceContext({ runId: "run-repair-rationale", seed });

    const result = buildDomainRepairPrompt({
      runId: "run-repair-rationale",
      findings: [
        {
          finding_id: "require-summary",
          category: "output",
          severity: "moderate",
          message: "Missing summary section.",
        },
      ],
      originalOutput: "Output without summary.",
    });

    expect(result).not.toBeNull();
    expect(result).toContain("Summaries help the reader understand the key points quickly.");
  });
});

describe("getRepairAttemptLimit", () => {
  it("returns the configured max repair attempts", () => {
    const seed = makeSeed({ maxRepairAttempts: 5 });
    registerPreparedNicheRunTraceContext({ runId: "run-limit-configured", seed });

    const limit = getRepairAttemptLimit("run-limit-configured");
    expect(limit).toBe(5);
  });

  it("returns 2 as default when not configured", () => {
    const seed = makeSeed();
    registerPreparedNicheRunTraceContext({ runId: "run-limit-default", seed });

    const limit = getRepairAttemptLimit("run-limit-default");
    expect(limit).toBe(2);
  });

  it("returns 2 as default when no niche run is active", () => {
    const limit = getRepairAttemptLimit("nonexistent-run");
    expect(limit).toBe(2);
  });
});
