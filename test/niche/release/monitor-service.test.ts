import { describe, expect, it, vi } from "vitest";
import {
  runMonitorAssessmentCycle,
  type MonitorObservationCollector,
} from "../../../src/niche/release/index.js";
import type {
  ActiveNicheStackRecord,
  PreparedNicheRunSeed,
} from "../../../src/niche/schema/index.js";
import type { PromotedMonitorDefinition } from "../../../src/niche/release/index.js";
import {
  getActiveNicheRuntimeState,
  setActiveNicheAgentDefault,
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
    determinism_notes: "Runtime template for monitor test.",
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
      promoted_release_id: "release-v1",
      baseline_manifest_id: "baseline-manifest-repo-ci",
      candidate_manifest_id: "candidate-manifest-repo-ci",
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

function makeCleanObservation(): MonitorObservationCollector {
  return () => ({
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
  });
}

function makeBreachingObservation(): MonitorObservationCollector {
  return () => ({
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
  });
}

describe("monitor service", () => {
  it("returns skipped_reason when stack is not found", async () => {
    await withTempHome(async () => {
      const result = runMonitorAssessmentCycle({
        definition: makeMonitorDefinition(),
        agentId: "agent-main",
        activeStackId: "nonexistent-stack",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        collectObservation: makeCleanObservation(),
        env: process.env,
      });

      expect(result.skipped_reason).toContain("nonexistent-stack");
      expect(result.skipped_reason).toContain("not found");
      expect(result.assessment).toBeNull();
      expect(result.rollback).toBeNull();
      expect(result.active_stack_id).toBe("nonexistent-stack");
      expect(result.agent_id).toBe("agent-main");
    });
  });

  it("returns skipped_reason when stack is in shadow mode", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord({ release_mode: "shadow" });
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const result = runMonitorAssessmentCycle({
        definition: makeMonitorDefinition(),
        agentId: "agent-main",
        activeStackId: "stack-repo-ci-v1",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        collectObservation: makeCleanObservation(),
        env: process.env,
      });

      expect(result.skipped_reason).toContain("shadow");
      expect(result.skipped_reason).toContain("not live");
      expect(result.assessment).toBeNull();
      expect(result.rollback).toBeNull();
    });
  });

  it("returns skipped_reason when stack is in canary mode", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord({ release_mode: "canary" });
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const result = runMonitorAssessmentCycle({
        definition: makeMonitorDefinition(),
        agentId: "agent-main",
        activeStackId: "stack-repo-ci-v1",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        collectObservation: makeCleanObservation(),
        env: process.env,
      });

      expect(result.skipped_reason).toContain("canary");
      expect(result.skipped_reason).toContain("not live");
      expect(result.assessment).toBeNull();
      expect(result.rollback).toBeNull();
    });
  });

  it("returns skipped_reason when observation collector returns null", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord({ release_mode: "live" });
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const result = runMonitorAssessmentCycle({
        definition: makeMonitorDefinition(),
        agentId: "agent-main",
        activeStackId: "stack-repo-ci-v1",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        collectObservation: () => null,
        env: process.env,
      });

      expect(result.skipped_reason).toContain("null");
      expect(result.assessment).toBeNull();
      expect(result.rollback).toBeNull();
    });
  });

  it("returns assessment with no rollback when no drift breach", async () => {
    await withTempHome(async () => {
      const stackRecord = makeStackRecord({ release_mode: "live" });
      upsertActiveNicheStackRecord(stackRecord, process.env);

      const result = runMonitorAssessmentCycle({
        definition: makeMonitorDefinition(),
        agentId: "agent-main",
        activeStackId: "stack-repo-ci-v1",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        collectObservation: makeCleanObservation(),
        env: process.env,
      });

      expect(result.assessment).not.toBeNull();
      expect(result.assessment?.should_rollback).toBe(false);
      expect(result.rollback).toBeNull();
      expect(result.skipped_reason).toBeNull();
      expect(result.active_stack_id).toBe("stack-repo-ci-v1");
      expect(result.agent_id).toBe("agent-main");
    });
  });

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
        definition: makeMonitorDefinition(),
        agentId: "agent-main",
        activeStackId: "stack-repo-ci-v1",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        collectObservation: makeBreachingObservation(),
        env: process.env,
      });

      expect(result.assessment).not.toBeNull();
      expect(result.assessment?.should_rollback).toBe(true);
      expect(result.assessment?.breached_dimensions).toContain("hard_fail_drift");
      expect(result.rollback).not.toBeNull();
      expect(result.rollback?.rolled_back).toBe(true);
      expect(result.skipped_reason).toBeNull();

      const stateAfter = getActiveNicheRuntimeState(process.env);
      expect(stateAfter.agent_defaults).toHaveLength(0);
      const rolledBackStack = stateAfter.stacks.find(
        (s) => s.active_stack_id === "stack-repo-ci-v1",
      );
      expect(rolledBackStack?.release_mode).toBe("rolled_back");
    });
  });

  it("evaluates only the target stack when multiple stacks exist", async () => {
    await withTempHome(async () => {
      const otherSeed = makeRunSeedTemplate();
      otherSeed.baseline_or_candidate_manifest_id = "candidate-manifest-other";
      const otherStack = makeStackRecord({
        active_stack_id: "stack-other-v1",
        candidate_manifest_id: "candidate-manifest-other",
        release_mode: "live",
        run_seed_template: otherSeed,
      });
      const targetStack = makeStackRecord({
        active_stack_id: "stack-repo-ci-v1",
        release_mode: "live",
      });

      upsertActiveNicheStackRecord(otherStack, process.env);
      upsertActiveNicheStackRecord(targetStack, process.env);
      setActiveNicheAgentDefault(
        {
          agent_id: "agent-main",
          active_stack_id: "stack-repo-ci-v1",
          updated_at: "2026-03-12T11:00:00.000Z",
        },
        process.env,
      );

      // Collector tracks which stack was queried
      const collectorCalls: string[] = [];
      const collector: MonitorObservationCollector = (params) => {
        collectorCalls.push(params.activeStackId);
        return {
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
        };
      };

      const result = runMonitorAssessmentCycle({
        definition: makeMonitorDefinition(),
        agentId: "agent-main",
        activeStackId: "stack-repo-ci-v1",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: null,
        collectObservation: collector,
        env: process.env,
      });

      // Only the target stack should be evaluated
      expect(collectorCalls).toEqual(["stack-repo-ci-v1"]);
      expect(result.active_stack_id).toBe("stack-repo-ci-v1");
      expect(result.assessment).not.toBeNull();
      expect(result.assessment?.should_rollback).toBe(false);

      // Other stack remains untouched
      const stateAfter = getActiveNicheRuntimeState(process.env);
      const otherAfter = stateAfter.stacks.find((s) => s.active_stack_id === "stack-other-v1");
      expect(otherAfter?.release_mode).toBe("live");
    });
  });

  it("passes rollback target through to rollback execution", async () => {
    await withTempHome(async () => {
      const previousSeed = makeRunSeedTemplate();
      previousSeed.baseline_or_candidate_manifest_id = "candidate-manifest-prev";
      const previousStack = makeStackRecord({
        active_stack_id: "stack-repo-ci-v0",
        candidate_manifest_id: "candidate-manifest-prev",
        release_mode: "live",
        run_seed_template: previousSeed,
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

      const result = runMonitorAssessmentCycle({
        definition: makeMonitorDefinition(),
        agentId: "agent-main",
        activeStackId: "stack-repo-ci-v1",
        nicheProgramId: "repo-ci-specialist",
        rollbackTarget: "stack-repo-ci-v0",
        collectObservation: makeBreachingObservation(),
        env: process.env,
      });

      expect(result.assessment?.should_rollback).toBe(true);
      expect(result.rollback).not.toBeNull();
      expect(result.rollback?.rolled_back).toBe(true);
      expect(result.rollback?.rollback_target).toBe("stack-repo-ci-v0");

      // Agent default should be restored to the rollback target
      const stateAfter = getActiveNicheRuntimeState(process.env);
      const agentDefault = stateAfter.agent_defaults.find(
        (binding) => binding.agent_id === "agent-main",
      );
      expect(agentDefault).toBeDefined();
      expect(agentDefault?.active_stack_id).toBe("stack-repo-ci-v0");

      // Current stack should be rolled_back, previous should remain live
      const currentAfter = stateAfter.stacks.find(
        (s) => s.active_stack_id === "stack-repo-ci-v1",
      );
      expect(currentAfter?.release_mode).toBe("rolled_back");
      const previousAfter = stateAfter.stacks.find(
        (s) => s.active_stack_id === "stack-repo-ci-v0",
      );
      expect(previousAfter?.release_mode).toBe("live");
    });
  });
});
