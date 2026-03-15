import { describe, expect, it, vi } from "vitest";
import {
  actuateReleaseDecision,
  executeRollback,
  runMonitorAssessmentCycle,
  type PromotionControllerResult,
} from "../../../src/niche/release/index.js";
import { resolveActiveNicheStackForRun } from "../../../src/niche/runtime/active-stack.js";
import type {
  ActiveNicheStackRecord,
  PreparedNicheRunSeed,
} from "../../../src/niche/schema/index.js";
import {
  clearRouteOverlaysForStack,
  getActiveNicheRuntimeState,
  removeActiveNicheAgentDefault,
  setActiveNicheAgentDefault,
  setActiveNicheRouteOverlay,
  upsertActiveNicheStackRecord,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

function makeRunSeedTemplate(): PreparedNicheRunSeed {
  return {
    seed_id: "seed-template-v1",
    prepared_at: "2026-03-12T10:00:00.000Z",
    mode: "candidate",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: "candidate-manifest-repo-ci",
    readiness_report_id: "repo-ci-specialist-readiness",
    niche_program_id: "repo-ci-specialist",
    domain_pack_id: "repo-ci-specialist-pack",
    domain_pack: {
      domain_pack_id: "repo-ci-specialist-pack",
      niche_program_id: "repo-ci-specialist",
      version: "2026.3.12",
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
          seed_id: "repo-ci-seed",
          task_family_id: "repo-ci-verification",
          prompt: "Investigate the failing benchmark case.",
          source_refs: ["repo-doc"],
          pass_conditions: ["grounded_response"],
          hard_fail_conditions: [],
        },
      ],
    },
    source_access_manifest: {
      source_access_manifest_id: "source-access-v1",
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
      verifier_pack_id: "verifier-v1",
      version: "2026.3.12",
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: [],
      output_requirements: ["grounded_response"],
      escalation_policy: "Escalate low-confidence responses.",
      min_confidence: 0.6,
      max_allowed_ungrounded_claims: 0,
      require_evidence_bundles: true,
    },
    planner_version_id: "planner-v1",
    action_policy_version_id: "action-v1",
    verifier_pack_version_id: "verifier-v1",
    retrieval_stack_version_id: "retrieval-v1",
    grader_set_version_id: "grader-v1",
    runtime_snapshot_id: "runtime-v1",
    context_bundle_id: "context-v1",
    determinism_policy_id: "determinism-v1",
    random_seed: "seed-1234",
    replayability_status: "non_replayable",
    determinism_notes: "Runtime template for release test.",
    artifact_refs: [],
    evidence_bundle_refs: [],
  };
}

function makeStackRecord(overrides?: Partial<ActiveNicheStackRecord>): ActiveNicheStackRecord {
  return {
    active_stack_id: "stack-repo-ci-v1",
    niche_program_id: "repo-ci-specialist",
    candidate_manifest_id: "candidate-manifest-repo-ci",
    registered_at: "2026-03-12T10:00:00.000Z",
    release_mode: "shadow",
    run_seed_template: makeRunSeedTemplate(),
    ...overrides,
  };
}

function makePromotionResult(
  decision: string,
  overrides?: Partial<PromotionControllerResult>,
): PromotionControllerResult {
  return {
    decision: decision as PromotionControllerResult["decision"],
    reason: `Candidate ready for ${decision}.`,
    warnings: [],
    candidate_release: {
      candidate_release_id: "release-v1",
      niche_program_id: "repo-ci-specialist",
      baseline_release_id: "baseline-release-v1",
      stack_manifest: {
        baseline_manifest_id: "baseline-manifest-repo-ci",
        candidate_manifest_id: "candidate-manifest-repo-ci",
        component_artifact_refs: [
          {
            artifact_id: "artifact-repo-ci",
            artifact_type: "dataset",
            version: "2026.3.12",
            content_hash: "0123456789abcdef0123456789abcdef",
            rights_state: {
              rights_to_store: true,
              rights_to_train: true,
              rights_to_benchmark: true,
              rights_to_derive: true,
              rights_to_distill: false,
              rights_to_generate_synthetic_from: true,
            },
            created_at: "2026-03-12T12:00:00.000Z",
          },
        ],
      },
      benchmark_results: [
        {
          benchmark_result_id: "result-1",
          benchmark_suite_id: "suite-1",
          case_kind: "atomic_case",
          mode: "offline_gold",
          baseline_arm_id: "baseline-arm",
          candidate_arm_id: "candidate-arm",
          primary_metric: "task_success",
          case_count: 10,
          paired_delta_summary: {
            mean_delta: 0.2,
            median_delta: 0.2,
            p10_delta: 0.1,
            p90_delta: 0.3,
            confidence_interval_low: 0.1,
            confidence_interval_high: 0.3,
          },
          task_family_summaries: [
            {
              task_family: "repo_navigation",
              case_count: 10,
              score_mean: 0.9,
              hard_fail_rate: 0,
              mean_delta: 0.2,
            },
          ],
          contamination_audit_summary: {
            contamination_detected: false,
            audited_case_count: 10,
          },
          invalidated: false,
          invalidation_reasons: [],
        },
      ],
      shadow_results: [],
      decision: decision as PromotionControllerResult["decision"],
      decision_reason: `Candidate ready for ${decision}.`,
      approved_by: ["niche-cli"],
      rollback_target: "baseline-manifest-repo-ci",
    },
    ...overrides,
  };
}

describe("release actuation", () => {
  it("persists agent default on promoted decision", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord();
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const result = actuateReleaseDecision({
        promotionResult: makePromotionResult("promoted"),
        stackRecord,
        agentId: "agent-main",
        env: process.env,
      });

      expect(result.actuated).toBe(true);
      expect(result.decision).toBe("promoted");
      expect(result.release_mode).toBe("live");
      expect(result.agent_default_set).toBe(true);
      expect(result.active_stack_id).toBe("stack-repo-ci-v1");

      const state = getActiveNicheRuntimeState(process.env);
      const agentDefault = state.agent_defaults.find(
        (binding) => binding.agent_id === "agent-main",
      );
      expect(agentDefault).toBeDefined();
      expect(agentDefault?.active_stack_id).toBe("stack-repo-ci-v1");

      const updatedStack = state.stacks.find((s) => s.active_stack_id === "stack-repo-ci-v1");
      expect(updatedStack?.release_mode).toBe("live");
    });
  });

  it("registers shadow stack without setting agent default", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord();
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const result = actuateReleaseDecision({
        promotionResult: makePromotionResult("shadow"),
        stackRecord,
        agentId: "agent-main",
        env: process.env,
      });

      expect(result.actuated).toBe(true);
      expect(result.release_mode).toBe("shadow");
      expect(result.agent_default_set).toBe(false);

      const state = getActiveNicheRuntimeState(process.env);
      expect(state.agent_defaults).toHaveLength(0);

      const updatedStack = state.stacks.find((s) => s.active_stack_id === "stack-repo-ci-v1");
      expect(updatedStack?.release_mode).toBe("shadow");
    });
  });

  it("registers canary stack without setting agent default", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord();
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const result = actuateReleaseDecision({
        promotionResult: makePromotionResult("canary"),
        stackRecord,
        agentId: "agent-main",
        env: process.env,
      });

      expect(result.actuated).toBe(true);
      expect(result.release_mode).toBe("canary");
      expect(result.agent_default_set).toBe(false);
    });
  });

  it("does not actuate on rejected decision", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord();
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const result = actuateReleaseDecision({
        promotionResult: makePromotionResult("rejected"),
        stackRecord,
        agentId: "agent-main",
        env: process.env,
      });

      expect(result.actuated).toBe(false);
      expect(result.release_mode).toBeNull();
      expect(result.agent_default_set).toBe(false);
    });
  });
});

describe("rollback execution", () => {
  it("resets agent default and clears overlays tied to the rolled-back stack", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord({ release_mode: "live" });
      upsertActiveNicheStackRecord(stackRecord, process.env);
      setActiveNicheAgentDefault(
        {
          agent_id: "agent-main",
          active_stack_id: "stack-repo-ci-v1",
          updated_at: "2026-03-12T11:00:00.000Z",
        },
        process.env,
      );
      setActiveNicheRouteOverlay(
        {
          overlay_id: "overlay-telegram",
          agent_id: "agent-main",
          active_stack_id: "stack-repo-ci-v1",
          updated_at: "2026-03-12T11:00:00.000Z",
          channel: "telegram",
        },
        process.env,
      );
      setActiveNicheRouteOverlay(
        {
          overlay_id: "overlay-discord",
          agent_id: "agent-main",
          active_stack_id: "stack-repo-ci-v1",
          updated_at: "2026-03-12T11:00:00.000Z",
          channel: "discord",
        },
        process.env,
      );

      const stateBefore = getActiveNicheRuntimeState(process.env);
      expect(stateBefore.agent_defaults).toHaveLength(1);
      expect(stateBefore.route_overlays).toHaveLength(2);

      const result = executeRollback({
        activeStackId: "stack-repo-ci-v1",
        agentId: "agent-main",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        reason: "Monitor-triggered rollback",
        env: process.env,
      });

      expect(result.rolled_back).toBe(true);
      expect(result.overlays_cleared).toBe(2);
      expect(result.agent_default_reverted).toBe(true);

      const stateAfter = getActiveNicheRuntimeState(process.env);
      expect(stateAfter.agent_defaults).toHaveLength(0);
      expect(stateAfter.route_overlays).toHaveLength(0);
    });
  });

  it("restores agent default to rollback target when present", async () => {
    await withTempHome(async () => {
      const previousStack = makeStackRecord({
        active_stack_id: "stack-repo-ci-v0",
        release_mode: "live",
      });
      const currentStack = makeStackRecord({
        active_stack_id: "stack-repo-ci-v1",
        release_mode: "live",
      });
      upsertActiveNicheStackRecord(previousStack, process.env);
      upsertActiveNicheStackRecord(currentStack, process.env);
      setActiveNicheAgentDefault(
        {
          agent_id: "agent-main",
          active_stack_id: "stack-repo-ci-v1",
          updated_at: "2026-03-12T11:00:00.000Z",
        },
        process.env,
      );

      const result = executeRollback({
        activeStackId: "stack-repo-ci-v1",
        agentId: "agent-main",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: "stack-repo-ci-v0",
        reason: "Rollback to previous stack",
        env: process.env,
      });

      expect(result.rolled_back).toBe(true);
      expect(result.rollback_target).toBe("stack-repo-ci-v0");

      const stateAfter = getActiveNicheRuntimeState(process.env);
      const agentDefault = stateAfter.agent_defaults.find(
        (binding) => binding.agent_id === "agent-main",
      );
      expect(agentDefault).toBeDefined();
      expect(agentDefault?.active_stack_id).toBe("stack-repo-ci-v0");
    });
  });

  it("returns not rolled back when stack does not exist", async () => {
    await withTempHome(async () => {
      const result = executeRollback({
        activeStackId: "nonexistent-stack",
        agentId: "agent-main",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        reason: "Test rollback",
        env: process.env,
      });

      expect(result.rolled_back).toBe(false);
      expect(result.reason).toContain("not found");
    });
  });

  it("marks the stack record as rolled_back after rollback", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord({ release_mode: "live" });
      upsertActiveNicheStackRecord(stackRecord, process.env);
      setActiveNicheAgentDefault(
        {
          agent_id: "agent-main",
          active_stack_id: "stack-repo-ci-v1",
          updated_at: "2026-03-12T11:00:00.000Z",
        },
        process.env,
      );

      const result = executeRollback({
        activeStackId: "stack-repo-ci-v1",
        agentId: "agent-main",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        reason: "Audit F-06: rollback deactivation",
        env: process.env,
      });

      expect(result.rolled_back).toBe(true);

      const stateAfter = getActiveNicheRuntimeState(process.env);
      const rolledBackStack = stateAfter.stacks.find(
        (s) => s.active_stack_id === "stack-repo-ci-v1",
      );
      expect(rolledBackStack).toBeDefined();
      expect(rolledBackStack?.release_mode).toBe("rolled_back");
    });
  });

  it("resolveActiveNicheStackForRun does not resolve to a rolled_back stack", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord({ release_mode: "rolled_back" });
      upsertActiveNicheStackRecord(stackRecord, process.env);
      setActiveNicheAgentDefault(
        {
          agent_id: "agent-main",
          active_stack_id: "stack-repo-ci-v1",
          updated_at: "2026-03-12T11:00:00.000Z",
        },
        process.env,
      );

      const resolved = resolveActiveNicheStackForRun({
        runId: "run-test-rollback",
        agentId: "agent-main",
        env: process.env,
      });

      expect(resolved).toBeNull();
    });
  });
});

describe("store helpers", () => {
  it("removeActiveNicheAgentDefault clears the binding", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord();
      upsertActiveNicheStackRecord(stackRecord, process.env);
      setActiveNicheAgentDefault(
        {
          agent_id: "agent-main",
          active_stack_id: "stack-repo-ci-v1",
          updated_at: "2026-03-12T11:00:00.000Z",
        },
        process.env,
      );

      expect(removeActiveNicheAgentDefault("agent-main", process.env)).toBe(true);
      expect(removeActiveNicheAgentDefault("agent-main", process.env)).toBe(false);

      const state = getActiveNicheRuntimeState(process.env);
      expect(state.agent_defaults).toHaveLength(0);
    });
  });

  it("clearRouteOverlaysForStack removes only matching overlays", async () => {
    await withTempHome(async () => {
      const stackA = makeStackRecord({ active_stack_id: "stack-a" });
      const stackB = makeStackRecord({ active_stack_id: "stack-b" });
      upsertActiveNicheStackRecord(stackA, process.env);
      upsertActiveNicheStackRecord(stackB, process.env);
      setActiveNicheRouteOverlay(
        {
          overlay_id: "overlay-a",
          agent_id: "agent-main",
          active_stack_id: "stack-a",
          updated_at: "2026-03-12T11:00:00.000Z",
          channel: "telegram",
        },
        process.env,
      );
      setActiveNicheRouteOverlay(
        {
          overlay_id: "overlay-b",
          agent_id: "agent-main",
          active_stack_id: "stack-b",
          updated_at: "2026-03-12T11:00:00.000Z",
          channel: "discord",
        },
        process.env,
      );

      expect(clearRouteOverlaysForStack("stack-a", process.env)).toBe(1);

      const state = getActiveNicheRuntimeState(process.env);
      expect(state.route_overlays).toHaveLength(1);
      expect(state.route_overlays[0].overlay_id).toBe("overlay-b");
    });
  });
});

describe("monitor service", () => {
  it("triggers rollback when assessment detects drift breach", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord({ release_mode: "live" });
      upsertActiveNicheStackRecord(stackRecord, process.env);
      setActiveNicheAgentDefault(
        {
          agent_id: "agent-main",
          active_stack_id: "stack-repo-ci-v1",
          updated_at: "2026-03-12T11:00:00.000Z",
        },
        process.env,
      );

      const result = runMonitorAssessmentCycle({
        definition: {
          monitor: {
            promoted_release_id: "release-v1",
            baseline_manifest_id: "baseline-manifest-repo-ci",
            candidate_manifest_id: "candidate-manifest-repo-ci",
            required_case_kinds: ["atomic_case"],
            shadow_recheck_policy: {
              policy_id: "shadow-recheck-v1",
              summary: "Recheck every 24h.",
            },
            drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
            verifier_drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
            grader_drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
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
        },
        agentId: "agent-main",
        activeStackId: "stack-repo-ci-v1",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        collectObservation: () => ({
          observed_drift: {
            task_success_drift: 0.01,
            task_family_drift: 0.01,
            verifier_false_veto_drift: 0.01,
            grader_disagreement_drift: 0.01,
            source_freshness_decay: 1,
            latency_cost_drift: 0.01,
            hard_fail_drift: 0.1,
          },
          consecutive_breach_windows: 3,
        }),
        env: process.env,
      });

      expect(result.assessment).not.toBeNull();
      expect(result.assessment?.should_rollback).toBe(true);
      expect(result.assessment?.breached_dimensions).toContain("hard_fail_drift");
      expect(result.rollback).not.toBeNull();
      expect(result.rollback?.rolled_back).toBe(true);

      const stateAfter = getActiveNicheRuntimeState(process.env);
      expect(stateAfter.agent_defaults).toHaveLength(0);
    });
  });

  it("skips rollback when assessment shows no drift breach", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord({ release_mode: "live" });
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const result = runMonitorAssessmentCycle({
        definition: {
          monitor: {
            promoted_release_id: "release-v1",
            baseline_manifest_id: "baseline-manifest-repo-ci",
            candidate_manifest_id: "candidate-manifest-repo-ci",
            required_case_kinds: ["atomic_case"],
            shadow_recheck_policy: {
              policy_id: "shadow-recheck-v1",
              summary: "Recheck every 24h.",
            },
            drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
            verifier_drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
            grader_drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
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
        },
        agentId: "agent-main",
        activeStackId: "stack-repo-ci-v1",
        nicheProgramId: "repo-ci-specialist",
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

      expect(result.assessment).not.toBeNull();
      expect(result.assessment?.should_rollback).toBe(false);
      expect(result.rollback).toBeNull();
    });
  });

  it("skips non-live stacks", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord({ release_mode: "shadow" });
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const result = runMonitorAssessmentCycle({
        definition: {
          monitor: {
            promoted_release_id: "release-v1",
            baseline_manifest_id: "baseline-manifest-repo-ci",
            candidate_manifest_id: "candidate-manifest-repo-ci",
            required_case_kinds: ["atomic_case"],
            shadow_recheck_policy: {
              policy_id: "shadow-recheck-v1",
              summary: "Recheck.",
            },
            drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
            verifier_drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
            grader_drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
            freshness_decay_policy: {
              policy_id: "freshness-v1",
              summary: "Recompile.",
            },
            rollback_policy: {
              policy_id: "rollback-v1",
              summary: "Rollback.",
            },
          },
          cadence_defaults: {
            shadow_recheck_interval_hours: 24,
            evaluation_window_size: 3,
            alert_hysteresis_windows: 2,
            rollback_cooldown_hours: 24,
          },
        },
        agentId: "agent-main",
        activeStackId: "stack-repo-ci-v1",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        collectObservation: () => null,
        env: process.env,
      });

      expect(result.skipped_reason).toContain("shadow mode");
      expect(result.assessment).toBeNull();
      expect(result.rollback).toBeNull();
    });
  });

  it("skips when observation collector returns null", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord({ release_mode: "live" });
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const result = runMonitorAssessmentCycle({
        definition: {
          monitor: {
            promoted_release_id: "release-v1",
            baseline_manifest_id: "baseline-manifest-repo-ci",
            candidate_manifest_id: "candidate-manifest-repo-ci",
            required_case_kinds: ["atomic_case"],
            shadow_recheck_policy: {
              policy_id: "shadow-recheck-v1",
              summary: "Recheck.",
            },
            drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
            verifier_drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
            grader_drift_thresholds: {
              task_success_drift: 0.05,
              task_family_drift: 0.05,
              verifier_false_veto_drift: 0.02,
              grader_disagreement_drift: 0.02,
              source_freshness_decay: 12,
              latency_cost_drift: 0.1,
              hard_fail_drift: 0.02,
            },
            freshness_decay_policy: {
              policy_id: "freshness-v1",
              summary: "Recompile.",
            },
            rollback_policy: {
              policy_id: "rollback-v1",
              summary: "Rollback.",
            },
          },
          cadence_defaults: {
            shadow_recheck_interval_hours: 24,
            evaluation_window_size: 3,
            alert_hysteresis_windows: 2,
            rollback_cooldown_hours: 24,
          },
        },
        agentId: "agent-main",
        activeStackId: "stack-repo-ci-v1",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        collectObservation: () => null,
        env: process.env,
      });

      expect(result.skipped_reason).toContain("null");
      expect(result.assessment).toBeNull();
    });
  });
});
