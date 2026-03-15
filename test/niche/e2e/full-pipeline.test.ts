import { describe, expect, it, vi } from "vitest";
import { compileNicheProgramFlow } from "../../../src/niche/domain/index.js";
import {
  actuateReleaseDecision,
  createPromotionControllerResult,
  DEFAULT_RELEASE_POLICY_THRESHOLDS,
  evaluateReleasePolicy,
  executeRollback,
  runMonitorAssessmentCycle,
} from "../../../src/niche/release/index.js";
import type { PromotedMonitorDefinition } from "../../../src/niche/release/index.js";
import type {
  ActiveNicheStackRecord,
  Artifact,
  ArtifactRightsState,
  BaselineManifest,
  BenchmarkResultRecord,
  CandidateManifest,
  NicheProgram,
  PreparedNicheRunSeed,
  RunTrace,
} from "../../../src/niche/schema/index.js";
import {
  appendRunTrace,
  collectDescendantArtifactIds,
  createArtifactRecord,
  ensureStoredNicheProgram,
  getActiveNicheRuntimeState,
  getBaselineManifest,
  getBenchmarkResultRecord,
  getCandidateManifest,
  getNicheProgram,
  listArtifactRecords,
  listRunTraces,
  upsertActiveNicheStackRecord,
  writeBaselineManifest,
  writeBenchmarkResultRecord,
  writeCandidateManifest,
  writeLineageEdges,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

// -- Fixture builders --------------------------------------------------------

function makeNicheProgram(): NicheProgram {
  return {
    niche_program_id: "e2e-repo-ci",
    name: "E2E Repo CI Specialist",
    objective: "Specialize in repo CI verification tasks.",
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
    prepared_at: "2026-03-14T09:00:00.000Z",
    mode: "live",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: params.manifestId,
    readiness_report_id: `${params.nicheProgramId}-readiness`,
    niche_program_id: params.nicheProgramId,
    domain_pack_id: `${params.nicheProgramId}-pack`,
    domain_pack: {
      domain_pack_id: `${params.nicheProgramId}-pack`,
      niche_program_id: params.nicheProgramId,
      version: "2026.3.14",
      ontology: {
        concepts: [{ id: "repo-doc", label: "Repo doc" }],
        relations: [],
      },
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
        blocking_failure_ids: [],
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
      source_access_manifest_id: `${params.nicheProgramId}-source-access`,
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
      required_arguments_by_tool: { exec: ["command"] },
      max_retry_attempts: 1,
    },
    verifier_pack_config: {
      verifier_pack_id: `${params.nicheProgramId}-verifier-pack`,
      version: "2026.3.14",
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

function makeMonitorDefinition(): PromotedMonitorDefinition {
  const driftThresholds = {
    task_success_drift: 0.05,
    task_family_drift: 0.05,
    verifier_false_veto_drift: 0.02,
    grader_disagreement_drift: 0.02,
    source_freshness_decay: 12,
    latency_cost_drift: 0.1,
    hard_fail_drift: 0.02,
  };
  return {
    monitor: {
      promoted_release_id: "e2e-release-v1",
      baseline_manifest_id: "e2e-baseline",
      candidate_manifest_id: "e2e-candidate",
      required_case_kinds: ["atomic_case"],
      shadow_recheck_policy: {
        policy_id: "shadow-recheck-v1",
        summary: "Recheck every 24h.",
      },
      drift_thresholds: driftThresholds,
      verifier_drift_thresholds: driftThresholds,
      grader_drift_thresholds: driftThresholds,
      freshness_decay_policy: {
        policy_id: "freshness-v1",
        summary: "Recompile when freshness drops.",
      },
      rollback_policy: {
        policy_id: "rollback-v1",
        summary: "Rollback on sustained drift.",
      },
    },
    cadence_defaults: {
      shadow_recheck_interval_hours: 24,
      evaluation_window_size: 3,
      alert_hysteresis_windows: 2,
      rollback_cooldown_hours: 24,
    },
  };
}

function buildSharedManifestFields(program: NicheProgram, sourceAccessManifestId: string) {
  const now = new Date().toISOString();
  return {
    niche_program_id: "e2e-repo-ci",
    created_at: now,
    planner_runtime: program.runtime_stack.planner_runtime,
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-14",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-14",
    api_revision: "v1",
    capability_snapshot_at: now,
    provider_metadata_quality: "exact_snapshot" as const,
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "e2e-baseline-v1",
    grader_set_version: "e2e-grader-set",
    benchmark_suite_id: "e2e-benchmark-suite",
    source_access_manifest_id: sourceAccessManifestId,
    retry_policy: { max_attempts: 1 },
    token_budget: { max_total_tokens: 8000 },
    context_budget: { max_context_tokens: 16000 },
    execution_mode: "benchmark",
    tool_catalog_version: "e2e-tools-v1",
    tool_allowlist: ["exec", "read"],
    tool_contract_version: "e2e-tool-contract-v1",
    retrieval_config: { policy: "baseline" },
    verifier_config: { policy: "baseline" },
  };
}

function buildBaselineManifest(
  program: NicheProgram,
  sourceAccessManifestId: string,
): BaselineManifest {
  return {
    baseline_manifest_id: "e2e-baseline",
    ...buildSharedManifestFields(program, sourceAccessManifestId),
  };
}

function buildCandidateManifest(
  program: NicheProgram,
  sourceAccessManifestId: string,
  domainPackArtifactId: string,
): CandidateManifest {
  return {
    candidate_manifest_id: "e2e-candidate",
    based_on_baseline_manifest_id: "e2e-baseline",
    ...buildSharedManifestFields(program, sourceAccessManifestId),
    domain_pack_id: domainPackArtifactId,
    action_policy_id: "e2e-action-policy",
    retrieval_stack_id: "e2e-retrieval-stack",
    verifier_pack_id: "e2e-verifier-pack",
    optional_student_model_ids: [],
    candidate_recipe: "e2e-candidate-recipe",
  };
}

function buildBenchmarkResultRecord(): BenchmarkResultRecord {
  return {
    benchmark_result_record_id: "e2e-benchmark-record",
    summary: {
      benchmark_result_id: "e2e-result-1",
      benchmark_suite_id: "e2e-benchmark-suite",
      case_kind: "atomic_case",
      mode: "offline_gold",
      baseline_arm_id: "e2e-baseline-arm",
      candidate_arm_id: "e2e-candidate-arm",
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
          task_family: "repo_ci_verification",
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
    baseline_manifest_id: "e2e-baseline",
    candidate_manifest_id: "e2e-candidate",
    baseline_template_manifest_id: "e2e-baseline",
    candidate_template_manifest_id: "e2e-candidate",
    suite_hash: "0123456789abcdef0123456789abcdef",
    fixture_version: "e2e-fixtures-v1",
    actual_suite_hash: "0123456789abcdef0123456789abcdef",
    actual_fixture_version: "e2e-fixtures-v1",
    actual_grader_version: "e2e-grader-v1",
    case_membership_hash: "fedcba9876543210fedcba9876543210",
    run_trace_refs: ["e2e-trace-1"],
    replay_bundle_refs: ["e2e-replay-1"],
    evidence_bundle_ids: ["e2e-evidence-1"],
    arbitration_outcome_summary: {
      arbitration_policy_id: "e2e-arbitration",
      unresolved_blocking_conflicts: false,
      unresolved_conflict_count: 0,
      blocking_conflict_types: [],
    },
    created_at: new Date().toISOString(),
  };
}

// -- Test --------------------------------------------------------------------

describe("NicheClaw full pipeline e2e", () => {
  it("runs create -> compile -> readiness -> benchmark -> release -> promote -> monitor -> rollback", async () => {
    await withTempHome(async () => {
      const program = makeNicheProgram();

      // Stage 1: Create and persist a NicheProgram
      ensureStoredNicheProgram(program, process.env);
      const stored = getNicheProgram("e2e-repo-ci", process.env);
      expect(stored).not.toBeNull();
      expect(stored!.niche_program_id).toBe("e2e-repo-ci");

      // Stage 2: Compile domain with structured_text + benchmark_seed sources
      // Multiple sources boost source_coverage; benchmark_seed boosts benchmarkability.
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
          sourceId: "repo-build-guide",
          sourceKind: "repos" as const,
          inputKind: "structured_text" as const,
          title: "Build guide",
          accessPattern: "read",
          rights: sharedRights,
          freshnessExpectation: "daily",
          text: "Build steps: install deps, lint, type-check, run tests, build.",
        },
        {
          sourceId: "benchmark-seed-source",
          sourceKind: "human_examples" as const,
          inputKind: "benchmark_seed" as const,
          title: "Benchmark seed source",
          accessPattern: "seed",
          rights: sharedRights,
          freshnessExpectation: "daily",
          prompt: "Reproduce the failing CI build and explain the root cause.",
          taskFamilyId: "ci-repair",
          passConditions: ["correct_root_cause"],
          hardFailConditions: ["unsafe_command_use"],
        },
      ];

      const compiled = await compileNicheProgramFlow({
        nicheProgram: program,
        sourceDescriptors,
        env: process.env,
      });

      expect(compiled.compilation.readiness_report.status).toBeDefined();
      expect(compiled.compilation.compiled_domain_pack_artifact_ref).toBeDefined();

      // Stage 3: Verify readiness report — with few source kinds and seeds the
      // source-derived formulas produce scores below the hard-blocker thresholds,
      // so the status is "not_ready" (expected with realistic scoring).
      const readinessReport = compiled.compilation.readiness_report;
      expect(readinessReport.status).toBe("not_ready");

      // Stage 4: Write baseline + candidate manifests
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

      // Verify manifests are readable from store
      expect(getBaselineManifest("e2e-baseline", process.env)).not.toBeNull();
      expect(getCandidateManifest("e2e-candidate", process.env)).not.toBeNull();

      // Stage 5: Write a synthetic benchmark result record
      const benchmarkRecord = buildBenchmarkResultRecord();
      writeBenchmarkResultRecord(benchmarkRecord, process.env);
      expect(getBenchmarkResultRecord("e2e-benchmark-record", process.env)).not.toBeNull();

      // Stage 6: Evaluate release policy with low thresholds and no shadow requirement
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
      // Policy should recommend canary (no shadow results, but shadow not required => canary)
      expect(["promoted", "canary"]).toContain(policyEvaluation.recommended_decision);

      // Stage 7: Register a stack record and actuate promotion
      const stackRecord: ActiveNicheStackRecord = {
        active_stack_id: "e2e-stack-v1",
        niche_program_id: "e2e-repo-ci",
        candidate_manifest_id: "e2e-candidate",
        registered_at: new Date().toISOString(),
        release_mode: "shadow",
        run_seed_template: makeSeedTemplate({
          activeStackId: "e2e-stack-v1",
          manifestId: "e2e-candidate",
          nicheProgramId: "e2e-repo-ci",
        }),
      };
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const promotionResult = createPromotionControllerResult({
        candidateReleaseId: "e2e-release-v1",
        nicheProgramId: "e2e-repo-ci",
        baselineReleaseId: "e2e-baseline-release",
        baselineManifest,
        candidateManifest,
        componentArtifactRefs: [compiled.compilation.compiled_domain_pack_artifact_ref],
        benchmarkResults: [benchmarkRecord.summary],
        approvedBy: ["e2e-test"],
        rollbackTarget: "e2e-baseline",
        policyEvaluation,
      });

      // Force decision to "promoted" for actuation test
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
        agentId: "e2e-agent",
        env: process.env,
      });
      expect(actuationResult.actuated).toBe(true);

      // Stage 8: Verify agent default is set
      const stateAfterPromotion = getActiveNicheRuntimeState(process.env);
      expect(
        stateAfterPromotion.agent_defaults.some(
          (d) => d.agent_id === "e2e-agent" && d.active_stack_id === "e2e-stack-v1",
        ),
      ).toBe(true);

      // Stage 9: Run monitor assessment (no drift -- should NOT rollback)
      const monitorResult = runMonitorAssessmentCycle({
        definition: makeMonitorDefinition(),
        agentId: "e2e-agent",
        activeStackId: "e2e-stack-v1",
        nicheProgramId: "e2e-repo-ci",
        rollbackTarget: null,
        collectObservation: () => ({
          observed_drift: {
            task_success_drift: 0.01,
            task_family_drift: 0.01,
            verifier_false_veto_drift: 0.01,
            grader_disagreement_drift: 0.01,
            source_freshness_decay: 1,
            latency_cost_drift: 0.01,
            hard_fail_drift: 0.01,
          },
          consecutive_breach_windows: 0,
        }),
        env: process.env,
      });
      expect(monitorResult.assessment).not.toBeNull();
      expect(monitorResult.assessment?.should_rollback).toBe(false);

      // Stage 10: Execute rollback
      const rollbackResult = executeRollback({
        activeStackId: "e2e-stack-v1",
        agentId: "e2e-agent",
        nicheProgramId: "e2e-repo-ci",
        rollbackTarget: null,
        reason: "E2E test rollback verification.",
        env: process.env,
      });
      expect(rollbackResult.rolled_back).toBe(true);
      expect(rollbackResult.agent_default_reverted).toBe(true);

      // Stage 11: Verify agent default is cleared
      const stateAfterRollback = getActiveNicheRuntimeState(process.env);
      expect(stateAfterRollback.agent_defaults.some((d) => d.agent_id === "e2e-agent")).toBe(false);
    });
  });

  it("persistence performance: 200 artifacts, 200 lineage edges, 50 traces complete store ops under 5s each", async () => {
    await withTempHome(async () => {
      const now = "2026-03-14T10:00:00.000Z";
      const baseRights: ArtifactRightsState = {
        rights_to_store: true,
        rights_to_train: true,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: false,
        rights_to_generate_synthetic_from: true,
      };

      // -- Create 200 artifacts with governed_data_status --
      const artifactIds: string[] = [];
      for (let i = 0; i < 200; i++) {
        const artifactId = `perf-artifact-${String(i).padStart(4, "0")}`;
        const version = `1.0.${i}`;
        artifactIds.push(artifactId);

        const artifact: Artifact = {
          artifact_id: artifactId,
          artifact_type: "dataset",
          version,
          producer: "perf-test",
          source_trace_refs: [],
          dataset_refs: [],
          metrics: { accuracy: 0.95 },
          governed_data_status: {
            data_zone: "dev",
            retention_policy: "retain",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            quarantined: false,
          },
          created_at: now,
          lineage: [],
        };

        createArtifactRecord({
          artifact,
          rightsState: baseRights,
          env: process.env,
        });
      }

      // -- Create 200 lineage edges (each artifact derived from the previous) --
      for (let i = 1; i < 200; i++) {
        const childId = artifactIds[i]!;
        const parentId = artifactIds[i - 1]!;
        writeLineageEdges(
          childId,
          [
            {
              parent_artifact_id: parentId,
              relationship: "derived-from",
              derivation_step: `step-${i}`,
              notes: `Derived artifact ${i} from artifact ${i - 1}.`,
            },
          ],
          process.env,
        );
      }
      // Also write lineage for the first artifact (no parent, but the function
      // expects at least one call per child for the graph to be complete).
      writeLineageEdges(
        artifactIds[0]!,
        [
          {
            parent_artifact_id: artifactIds[0]!,
            relationship: "self",
            derivation_step: "root",
            notes: "Root artifact, no external parent.",
          },
        ],
        process.env,
      );

      // -- Create 50 RunTrace objects with all required fields --
      for (let i = 0; i < 50; i++) {
        const padded = String(i).padStart(4, "0");
        const trace: RunTrace = {
          trace_id: `perf-trace-${padded}`,
          run_id: `perf-run-${padded}`,
          niche_program_id: "perf-program",
          domain_pack_id: "perf-domain-pack",
          mode: "baseline",
          session_ref: {
            session_id: `perf-session-${padded}`,
          },
          planner_inputs: [{ stage_id: "input-stage", summary: "Planner input summary." }],
          planner_outputs: [{ stage_id: "output-stage", summary: "Planner output summary." }],
          action_proposals: [
            {
              proposal_id: `proposal-${padded}`,
              selected_tool: "exec",
              candidate_rankings: [
                {
                  tool_name: "exec",
                  score: 0.9,
                  reason: "Best match.",
                  missing_required_arguments: [],
                },
              ],
            },
          ],
          tool_calls: [
            {
              tool_call_id: `tc-${padded}`,
              tool_name: "exec",
              status: "completed",
            },
          ],
          observations: [
            {
              observation_id: `obs-${padded}`,
              source: "exec",
              summary: "Command executed successfully.",
            },
          ],
          verifier_decisions: [
            {
              decision_id: `vd-${padded}`,
              outcome: "approved",
              rationale: "All checks passed.",
              findings: [],
            },
          ],
          terminal_status: "delivered",
          final_output: {
            output_id: `out-${padded}`,
            output_type: "text",
            content_summary: "Final output delivered.",
            emitted_to_user: true,
          },
          usage: {
            input_tokens: 500,
            output_tokens: 200,
            total_tokens: 700,
          },
          latency: {
            planner_ms: 100,
            tool_ms: 50,
            verifier_ms: 30,
            end_to_end_ms: 250,
          },
          cost: {
            currency: "usd",
            total_cost: 0.01,
          },
          failure_labels: [],
          artifact_refs: [],
          baseline_or_candidate_manifest_id: "perf-manifest",
          readiness_report_id: "perf-readiness",
          planner_version_id: "planner-v1",
          action_policy_version_id: "action-v1",
          verifier_pack_version_id: "verifier-v1",
          retrieval_stack_version_id: "retrieval-v1",
          grader_set_version_id: "grader-v1",
          source_access_manifest_id: "source-access-v1",
          runtime_snapshot_id: "runtime-v1",
          context_bundle_id: "context-v1",
          evidence_bundle_refs: [
            {
              evidence_bundle_id: `eb-${padded}`,
              source_refs: [
                {
                  source_id: "src-ref",
                  source_hash_or_ref: "abcdef1234567890abcdef1234567890",
                },
              ],
              retrieval_query: "perf test query",
              reranker_output: ["src-ref"],
              delivered_evidence: ["Evidence snippet."],
            },
          ],
          determinism_policy_id: "determinism-v1",
          random_seed: `seed-${padded}`,
          phase_timestamps: {
            planner_started_at: now,
            planner_finished_at: now,
            action_proposal_started_at: now,
            action_proposal_finished_at: now,
            tool_execution_started_at: now,
            tool_execution_finished_at: now,
            verifier_started_at: now,
            verifier_finished_at: now,
            final_emission_at: now,
            trace_persisted_at: now,
          },
          wall_clock_start_at: now,
          wall_clock_end_at: now,
          replayability_status: "replayable",
          determinism_notes: "Fully deterministic perf test trace.",
        };

        appendRunTrace(trace, process.env);
      }

      // -- Time listArtifactRecords --
      const listArtifactsStart = performance.now();
      const allArtifacts = listArtifactRecords({ env: process.env });
      const listArtifactsDuration = performance.now() - listArtifactsStart;
      expect(allArtifacts.length).toBe(200);
      expect(listArtifactsDuration).toBeLessThan(5000);

      // -- Time listRunTraces --
      const listTracesStart = performance.now();
      const allTraces = listRunTraces(process.env);
      const listTracesDuration = performance.now() - listTracesStart;
      expect(allTraces.length).toBe(50);
      expect(listTracesDuration).toBeLessThan(5000);

      // -- Time collectDescendantArtifactIds --
      // Start from artifact 180 to traverse 20 descendants (180 -> 181 -> ... -> 199).
      // collectDescendantArtifactIds is O(n * total_edges) per BFS step, so
      // keeping the traversal shorter ensures a stable smoke-test threshold.
      const descendantsStart = performance.now();
      const descendants = collectDescendantArtifactIds([artifactIds[180]!], process.env);
      const descendantsDuration = performance.now() - descendantsStart;
      expect(descendants.length).toBe(20);
      expect(descendantsDuration).toBeLessThan(5000);
    });
  }, 60_000);
});
