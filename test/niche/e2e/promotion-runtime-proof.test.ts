/**
 * Promotion → Runtime Proof E2E Test
 *
 * Bridges the gap between full-pipeline.test.ts (artifact-level flow) and
 * specialization-proof.test.ts (runtime behavior transformation) by proving
 * that a promoted stack resolves at runtime and transforms agent behavior.
 *
 * Flow:
 *   compile → write manifests → write benchmark → evaluate release policy →
 *   promote → resolveActiveNicheStackForRun → register runtime context →
 *   verify planner injection + tool ranking + constraint enforcement →
 *   rollback → verify resolution returns null
 */

import { describe, expect, it, vi } from "vitest";
import { compileNicheProgramFlow } from "../../../src/niche/domain/index.js";
import {
  actuateReleaseDecision,
  createPromotionControllerResult,
  DEFAULT_RELEASE_POLICY_THRESHOLDS,
  evaluateReleasePolicy,
  executeRollback,
} from "../../../src/niche/release/index.js";
import { resolveActiveNicheStackForRun } from "../../../src/niche/runtime/active-stack.js";
import { checkDomainConstraints } from "../../../src/niche/runtime/constraint-enforcer.js";
import { buildNichePlannerPromptBlock } from "../../../src/niche/runtime/planner-injection.js";
import {
  registerPreparedNicheRunTraceContext,
  clearNicheRunTraceContext,
} from "../../../src/niche/runtime/run-trace-capture.js";
import { rankToolsForNicheRun } from "../../../src/niche/runtime/tool-ranking.js";
import type {
  ActiveNicheStackRecord,
  BaselineManifest,
  BenchmarkResultRecord,
  CandidateManifest,
  NicheProgram,
  PreparedNicheRunSeed,
} from "../../../src/niche/schema/index.js";
import {
  ensureStoredNicheProgram,
  upsertActiveNicheStackRecord,
  writeBaselineManifest,
  writeBenchmarkResultRecord,
  writeCandidateManifest,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

// -- Fixture builders --------------------------------------------------------

function makeNicheProgram(): NicheProgram {
  return {
    niche_program_id: "promo-runtime-proof",
    name: "Promotion Runtime Proof Specialist",
    objective: "Prove that promotion wires through to runtime behavior.",
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
    allowed_tools: ["exec", "read"],
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
        target_description: "Above 90% on benchmark suite.",
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

function makeSeedTemplate(params: {
  activeStackId: string;
  manifestId: string;
  nicheProgramId: string;
}): PreparedNicheRunSeed {
  return {
    seed_id: `template-${params.activeStackId}`,
    prepared_at: "2026-03-15T09:00:00.000Z",
    mode: "live",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: params.manifestId,
    readiness_report_id: `${params.nicheProgramId}-readiness`,
    niche_program_id: params.nicheProgramId,
    domain_pack_id: `${params.nicheProgramId}-pack`,
    domain_pack: {
      domain_pack_id: `${params.nicheProgramId}-pack`,
      niche_program_id: params.nicheProgramId,
      version: "2026.3.15",
      ontology: {
        concepts: [
          { id: "repo-doc", label: "Repository document" },
          { id: "ci-pipeline", label: "CI pipeline" },
        ],
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
          constraint_id: "must-ground-output",
          category: "grounding",
          rule: "must_ground_in_evidence",
          severity: "moderate",
        },
        {
          constraint_id: "must-cite-source",
          category: "output_quality",
          rule: "must_include:source verified",
          severity: "high",
          rationale: "Every response must confirm source verification.",
        },
      ],
      tool_contracts: [
        {
          tool_name: "exec",
          intent_summary: "Run repo commands in sandbox.",
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
          title: "Repository documentation",
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
        blocking_failure_ids: [],
        output_requirements: ["grounded_response"],
        escalation_policy: "Escalate low-confidence responses.",
      },
      benchmark_seed_specs: [
        {
          seed_id: "seed-1",
          task_family_id: "ci-verification",
          prompt: "Verify the CI pipeline passes for the latest commit.",
          source_refs: ["repo-doc"],
          pass_conditions: ["grounded_response"],
          hard_fail_conditions: [],
        },
      ],
    },
    source_access_manifest: {
      source_access_manifest_id: `${params.nicheProgramId}-source-access`,
      allowed_tools: ["exec", "read"],
      allowed_retrieval_indices: ["repo-doc"],
      allowed_live_sources: [],
      disallowed_sources: [],
      sandbox_policy: "workspace-only",
      network_policy: "deny",
      approval_policy: "never",
    },
    action_policy_runtime: {
      allowed_tools: ["exec", "read"],
      required_arguments_by_tool: { exec: ["command"], read: ["path"] },
      max_retry_attempts: 1,
    },
    verifier_pack_config: {
      verifier_pack_id: `${params.nicheProgramId}-verifier-pack`,
      version: "2026.3.15",
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: [],
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
    runtime_snapshot_id: `${params.activeStackId}-runtime`,
    context_bundle_id: `${params.activeStackId}-context`,
    determinism_policy_id: `${params.activeStackId}-determinism`,
    random_seed: `seed-${params.activeStackId}`,
    replayability_status: "non_replayable",
    determinism_notes: `Runtime template for ${params.activeStackId}.`,
    artifact_refs: [],
    evidence_bundle_refs: [],
  };
}

function buildSharedManifestFields(program: NicheProgram, sourceAccessManifestId: string) {
  const now = new Date().toISOString();
  return {
    niche_program_id: "promo-runtime-proof",
    created_at: now,
    planner_runtime: program.runtime_stack.planner_runtime,
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-15",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-15",
    api_revision: "v1",
    capability_snapshot_at: now,
    provider_metadata_quality: "exact_snapshot" as const,
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "promo-baseline-v1",
    grader_set_version: "promo-grader-set",
    benchmark_suite_id: "promo-benchmark-suite",
    source_access_manifest_id: sourceAccessManifestId,
    retry_policy: { max_attempts: 1 },
    token_budget: { max_total_tokens: 8000 },
    context_budget: { max_context_tokens: 16000 },
    execution_mode: "benchmark",
    tool_catalog_version: "promo-tools-v1",
    tool_allowlist: ["exec", "read"],
    tool_contract_version: "promo-tool-contract-v1",
    retrieval_config: { policy: "baseline" },
    verifier_config: { policy: "baseline" },
  };
}

function buildBaselineManifest(
  program: NicheProgram,
  sourceAccessManifestId: string,
): BaselineManifest {
  return {
    baseline_manifest_id: "promo-baseline",
    ...buildSharedManifestFields(program, sourceAccessManifestId),
  };
}

function buildCandidateManifest(
  program: NicheProgram,
  sourceAccessManifestId: string,
  domainPackArtifactId: string,
): CandidateManifest {
  return {
    candidate_manifest_id: "promo-candidate",
    based_on_baseline_manifest_id: "promo-baseline",
    ...buildSharedManifestFields(program, sourceAccessManifestId),
    domain_pack_id: domainPackArtifactId,
    action_policy_id: "promo-action-policy",
    retrieval_stack_id: "promo-retrieval-stack",
    verifier_pack_id: "promo-verifier-pack",
    optional_student_model_ids: [],
    candidate_recipe: "promo-candidate-recipe",
  };
}

function buildBenchmarkResultRecord(): BenchmarkResultRecord {
  return {
    benchmark_result_record_id: "promo-benchmark-record",
    summary: {
      benchmark_result_id: "promo-result-1",
      benchmark_suite_id: "promo-benchmark-suite",
      case_kind: "atomic_case",
      mode: "offline_gold",
      baseline_arm_id: "promo-baseline-arm",
      candidate_arm_id: "promo-candidate-arm",
      baseline_provider_metadata_quality: "exact_snapshot",
      candidate_provider_metadata_quality: "exact_snapshot",
      primary_metric: "task_success",
      case_count: 50,
      paired_delta_summary: {
        mean_delta: 0.15,
        median_delta: 0.14,
        p10_delta: 0.05,
        p90_delta: 0.25,
        confidence_interval_low: 0.08,
        confidence_interval_high: 0.22,
      },
      task_family_summaries: [
        {
          task_family: "ci_verification",
          case_count: 50,
          score_mean: 0.92,
          hard_fail_rate: 0.02,
          mean_delta: 0.15,
        },
      ],
      contamination_audit_summary: {
        contamination_detected: false,
        audited_case_count: 50,
      },
      invalidated: false,
      invalidation_reasons: [],
    },
    baseline_manifest_id: "promo-baseline",
    candidate_manifest_id: "promo-candidate",
    baseline_template_manifest_id: "promo-baseline",
    candidate_template_manifest_id: "promo-candidate",
    suite_hash: "0123456789abcdef0123456789abcdef",
    fixture_version: "promo-fixtures-v1",
    actual_suite_hash: "0123456789abcdef0123456789abcdef",
    actual_fixture_version: "promo-fixtures-v1",
    actual_grader_version: "promo-grader-v1",
    case_membership_hash: "fedcba9876543210fedcba9876543210",
    run_trace_refs: ["promo-trace-1"],
    replay_bundle_refs: ["promo-replay-1"],
    evidence_bundle_ids: ["promo-evidence-1"],
    arbitration_outcome_summary: {
      arbitration_policy_id: "promo-arbitration",
      unresolved_blocking_conflicts: false,
      unresolved_conflict_count: 0,
      blocking_conflict_types: [],
    },
    created_at: new Date().toISOString(),
  };
}

// -- Test --------------------------------------------------------------------

describe("NicheClaw promotion → runtime proof e2e", () => {
  it("promoted stack resolves at runtime and transforms planner, tool ranking, and constraint behavior", async () => {
    await withTempHome(async () => {
      const program = makeNicheProgram();

      // ── Stage 1: Create and persist a NicheProgram ─────────────────
      ensureStoredNicheProgram(program, process.env);

      // ── Stage 2: Compile domain pack ───────────────────────────────
      const sharedRights = {
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
        data_zone: "dev" as const,
      };

      const sourceDescriptors = [
        {
          sourceId: "repo-doc",
          sourceKind: "repos" as const,
          inputKind: "structured_text" as const,
          title: "Repository documentation",
          accessPattern: "read",
          rights: sharedRights,
          freshnessExpectation: "daily",
          text: "Repository CI policy: all changes must pass tests before merge.",
        },
        {
          sourceId: "benchmark-seed-source",
          sourceKind: "human_examples" as const,
          inputKind: "benchmark_seed" as const,
          title: "Benchmark seed source",
          accessPattern: "seed",
          rights: sharedRights,
          freshnessExpectation: "daily",
          prompt: "Verify CI pipeline passes for the latest commit.",
          taskFamilyId: "ci-verification",
          passConditions: ["grounded_response"],
          hardFailConditions: ["fabricated_evidence"],
        },
      ];

      const compiled = await compileNicheProgramFlow({
        nicheProgram: program,
        sourceDescriptors,
        env: process.env,
      });

      expect(compiled.compilation.compiled_domain_pack_artifact_ref).toBeDefined();

      // ── Stage 3: Write manifests and benchmark record ──────────────
      const sourceAccessManifestId =
        compiled.compilation.source_access_manifest.source_access_manifest_id;
      const domainPackArtifactId =
        compiled.compilation.compiled_domain_pack_artifact_ref.artifact_id;

      const baselineManifest = buildBaselineManifest(program, sourceAccessManifestId);
      writeBaselineManifest(baselineManifest, process.env);

      const candidateManifest = buildCandidateManifest(
        program,
        sourceAccessManifestId,
        domainPackArtifactId,
      );
      writeCandidateManifest(candidateManifest, process.env);

      const benchmarkRecord = buildBenchmarkResultRecord();
      writeBenchmarkResultRecord(benchmarkRecord, process.env);

      // ── Stage 4: Evaluate release policy ───────────────────────────
      const policyEvaluation = evaluateReleasePolicy({
        baselineManifest,
        candidateManifest,
        benchmarkResults: [benchmarkRecord],
        verifierMetrics: {
          sample_count: 50,
          true_positive_rate: 0.96,
          false_positive_rate: 0.02,
          false_veto_rate: 0.02,
          pass_through_rate: 0.94,
          override_rate: 0.02,
          mean_latency_added_ms: 30,
          mean_cost_added: 0.01,
          total_cost_added: 0.5,
          counts: {
            true_positive: 47,
            false_positive: 1,
            false_veto: 1,
            pass_through: 47,
            overrides: 1,
          },
        },
        latencyRegression: 0.05,
        costRegression: 0.03,
        postPromotionMonitorConfigured: true,
        thresholds: {
          ...DEFAULT_RELEASE_POLICY_THRESHOLDS,
          min_benchmark_case_count: 10,
          min_task_family_count: 1,
          require_shadow_results_for_promotion: false,
        },
      });

      expect(["promoted", "canary"]).toContain(policyEvaluation.recommended_decision);

      // ── Stage 5: Register stack record and actuate promotion ───────
      const stackRecord: ActiveNicheStackRecord = {
        active_stack_id: "promo-stack-v1",
        niche_program_id: "promo-runtime-proof",
        candidate_manifest_id: "promo-candidate",
        registered_at: new Date().toISOString(),
        release_mode: "shadow",
        run_seed_template: makeSeedTemplate({
          activeStackId: "promo-stack-v1",
          manifestId: "promo-candidate",
          nicheProgramId: "promo-runtime-proof",
        }),
      };
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const promotionResult = createPromotionControllerResult({
        candidateReleaseId: "promo-release-v1",
        nicheProgramId: "promo-runtime-proof",
        baselineReleaseId: "promo-baseline-release",
        baselineManifest,
        candidateManifest,
        componentArtifactRefs: [compiled.compilation.compiled_domain_pack_artifact_ref],
        benchmarkResults: [benchmarkRecord.summary],
        approvedBy: ["promo-test"],
        rollbackTarget: "promo-baseline",
        policyEvaluation,
      });

      // Force decision to "promoted" for actuation
      const promotedResult = {
        ...promotionResult,
        decision: "promoted" as const,
        candidate_release: {
          ...promotionResult.candidate_release,
          decision: "promoted" as const,
        },
      };

      const actuationResult = actuateReleaseDecision({
        promotionResult: promotedResult,
        stackRecord,
        agentId: "test-agent",
        env: process.env,
      });
      expect(actuationResult.actuated).toBe(true);
      expect(actuationResult.agent_default_set).toBe(true);

      // ── Stage 6: CRITICAL — resolve the promoted stack at runtime ──
      const resolved = resolveActiveNicheStackForRun({
        runId: "test-run-1",
        agentId: "test-agent",
        env: process.env,
      });

      expect(resolved).not.toBeNull();
      expect(resolved!.record.active_stack_id).toBe("promo-stack-v1");
      expect(resolved!.source).toBe("agent_default");
      expect(resolved!.runSeed).toBeDefined();
      expect(resolved!.runSeed.niche_program_id).toBe("promo-runtime-proof");
      expect(resolved!.runSeed.domain_pack).toBeDefined();
      expect(resolved!.shadow_mode).toBe(false);

      // ── Stage 7: Register resolved seed as runtime trace context ───
      registerPreparedNicheRunTraceContext({
        runId: "test-run-1",
        seed: resolved!.runSeed,
      });

      // ── Stage 8: Planner prompt block contains domain specialization ─
      const plannerBlock = buildNichePlannerPromptBlock("test-run-1");
      expect(plannerBlock).not.toBeNull();
      expect(plannerBlock).toContain("Domain Specialization");
      // Verify ontology concepts are reflected in the planner block
      expect(plannerBlock).toContain("CI pipeline");
      // The must_include constraint rule should appear in reasoning constraints
      expect(plannerBlock).toContain("must_include:source verified");
      // Verify evidence requirements section is present
      expect(plannerBlock).toContain("grounded_response");

      // ── Stage 9: Tool ranking prioritizes domain tools ─────────────
      const rankings = rankToolsForNicheRun("test-run-1", ["exec", "web_search", "read"]);
      expect(rankings).toHaveLength(3);

      const execRanking = rankings.find((r) => r.tool_name === "exec")!;
      const readRanking = rankings.find((r) => r.tool_name === "read")!;
      const webSearchRanking = rankings.find((r) => r.tool_name === "web_search")!;

      // Domain tools (exec, read) should score 1.0; non-domain (web_search) should score 0.1
      expect(execRanking.domain_relevance_score).toBe(1.0);
      expect(readRanking.domain_relevance_score).toBe(1.0);
      expect(webSearchRanking.domain_relevance_score).toBe(0.1);

      // Domain tools should be ranked above non-domain tools
      const execIndex = rankings.indexOf(execRanking);
      const webSearchIndex = rankings.indexOf(webSearchRanking);
      expect(execIndex).toBeLessThan(webSearchIndex);

      // ── Stage 10: Constraint enforcement detects violations ────────
      // Content that satisfies the must_include constraint
      const passingCheck = checkDomainConstraints(
        "test-run-1",
        "all checks passed, source verified and grounded",
      );
      expect(passingCheck.passed).toBe(true);

      // Content that violates the must_include constraint ("source verified" is absent)
      const failingCheck = checkDomainConstraints(
        "test-run-1",
        "no evidence available for this claim",
      );
      expect(failingCheck.passed).toBe(false);
      const mustCiteViolation = failingCheck.violations.find(
        (v) => v.constraint_id === "must-cite-source",
      );
      expect(mustCiteViolation).toBeDefined();
      expect(mustCiteViolation!.rule).toBe("must_include:source verified");
      expect(mustCiteViolation!.blocking).toBe(true);

      // ── Stage 11: Execute rollback ─────────────────────────────────
      const rollbackResult = executeRollback({
        activeStackId: "promo-stack-v1",
        agentId: "test-agent",
        nicheProgramId: "promo-runtime-proof",
        rollbackTarget: null,
        reason: "Promotion runtime proof rollback verification.",
        env: process.env,
      });
      expect(rollbackResult.rolled_back).toBe(true);
      expect(rollbackResult.agent_default_reverted).toBe(true);

      // ── Stage 12: Resolution returns null after rollback ───────────
      const resolvedAfterRollback = resolveActiveNicheStackForRun({
        runId: "test-run-2",
        agentId: "test-agent",
        env: process.env,
      });
      expect(resolvedAfterRollback).toBeNull();

      // ── Cleanup ────────────────────────────────────────────────────
      clearNicheRunTraceContext("test-run-1");
    });
  });
});
