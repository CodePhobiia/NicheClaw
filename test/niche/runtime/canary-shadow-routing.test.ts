import { describe, expect, it } from "vitest";
import { resolveActiveNicheStackForRun } from "../../../src/niche/runtime/active-stack.js";
import type {
  ActiveNicheStackRecord,
  PreparedNicheRunSeed,
} from "../../../src/niche/schema/index.js";
import {
  upsertActiveNicheStackRecord,
  setActiveNicheAgentDefault,
} from "../../../src/niche/store/active-stack-store.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

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
      version: "v1",
      ontology: { concepts: [{ id: "concept-1", label: "Test" }], relations: [] },
      task_taxonomy: [
        { task_family_id: "task-1", label: "Task", benchmarkable: true, required_capabilities: [] },
      ],
      terminology_map: {},
      constraints: [
        {
          constraint_id: "c-1",
          category: "test",
          rule: "must_not_include:forbidden",
          severity: "moderate",
        },
      ],
      tool_contracts: [
        {
          tool_name: "exec",
          intent_summary: "Run.",
          required_arguments: ["command"],
          optional_arguments: [],
          failure_modes: [],
        },
      ],
      evidence_source_registry: [
        { source_id: "s-1", source_kind: "repos", title: "Repo", access_pattern: "read" },
      ],
      failure_taxonomy: [
        {
          failure_id: "f-1",
          label: "Fail",
          description: "Bad.",
          severity: "high",
          detection_hints: ["bad"],
        },
      ],
      verifier_defaults: {
        required_checks: ["check"],
        blocking_failure_ids: [],
        output_requirements: ["grounded"],
        escalation_policy: "Escalate.",
      },
      benchmark_seed_specs: [
        {
          seed_id: "bs-1",
          task_family_id: "task-1",
          prompt: "Test.",
          source_refs: ["s-1"],
          pass_conditions: ["ok"],
          hard_fail_conditions: [],
        },
      ],
    },
    source_access_manifest: {
      source_access_manifest_id: `${params.nicheProgramId}-sam`,
      allowed_tools: ["exec"],
      allowed_retrieval_indices: [],
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
      verifier_pack_id: `${params.nicheProgramId}-vp`,
      version: "v1",
      required_checks: ["check"],
      blocking_failure_ids: [],
      output_requirements: ["grounded"],
      escalation_policy: "Escalate.",
      min_confidence: 0.6,
      max_allowed_ungrounded_claims: 0,
      require_evidence_bundles: true,
    },
    planner_version_id: "planner-v1",
    action_policy_version_id: "action-v1",
    verifier_pack_version_id: "verifier-v1",
    retrieval_stack_version_id: "retrieval-v1",
    grader_set_version_id: "grader-v1",
    runtime_snapshot_id: `${params.activeStackId}-runtime`,
    context_bundle_id: `${params.activeStackId}-context`,
    determinism_policy_id: `${params.activeStackId}-det`,
    random_seed: `seed-${params.activeStackId}`,
    replayability_status: "non_replayable",
    determinism_notes: "Test template.",
    artifact_refs: [],
    evidence_bundle_refs: [],
  };
}

function makeStackRecord(overrides: Partial<ActiveNicheStackRecord> = {}): ActiveNicheStackRecord {
  const stackId = (overrides.active_stack_id as string) ?? "test-stack";
  const manifestId = (overrides.candidate_manifest_id as string) ?? "test-manifest";
  const programId = (overrides.niche_program_id as string) ?? "test-program";
  return {
    active_stack_id: stackId,
    niche_program_id: programId,
    candidate_manifest_id: manifestId,
    registered_at: "2026-03-14T12:00:00.000Z",
    release_mode: "live",
    run_seed_template: makeSeedTemplate({
      activeStackId: stackId,
      manifestId,
      nicheProgramId: programId,
    }),
    ...overrides,
  };
}

const TS = "2026-03-14T12:00:00.000Z";

describe("canary and shadow traffic routing", () => {
  it("returns null for canary requests outside the canary fraction", async () => {
    await withTempHome(async () => {
      const record = makeStackRecord({ release_mode: "canary", canary_fraction: 0 });
      upsertActiveNicheStackRecord(record, process.env);
      setActiveNicheAgentDefault(
        { agent_id: "agent-1", active_stack_id: "test-stack", updated_at: TS },
        process.env,
      );

      const result = resolveActiveNicheStackForRun({
        runId: "run-1",
        agentId: "agent-1",
        env: process.env,
      });
      expect(result).toBeNull();
    });
  });

  it("routes all requests when canary_fraction is 1", async () => {
    await withTempHome(async () => {
      const record = makeStackRecord({ release_mode: "canary", canary_fraction: 1 });
      upsertActiveNicheStackRecord(record, process.env);
      setActiveNicheAgentDefault(
        { agent_id: "agent-1", active_stack_id: "test-stack", updated_at: TS },
        process.env,
      );

      const result = resolveActiveNicheStackForRun({
        runId: "run-1",
        agentId: "agent-1",
        env: process.env,
      });
      expect(result).not.toBeNull();
      expect(result!.canary_routed).toBe(true);
      expect(result!.shadow_mode).toBe(false);
    });
  });

  it("deterministically routes canary based on runId hash", async () => {
    await withTempHome(async () => {
      const record = makeStackRecord({ release_mode: "canary", canary_fraction: 0.5 });
      upsertActiveNicheStackRecord(record, process.env);
      setActiveNicheAgentDefault(
        { agent_id: "agent-1", active_stack_id: "test-stack", updated_at: TS },
        process.env,
      );

      const results: boolean[] = [];
      for (let i = 0; i < 20; i++) {
        const r = resolveActiveNicheStackForRun({
          runId: `run-${i}`,
          agentId: "agent-1",
          env: process.env,
        });
        results.push(r !== null);
      }

      // Same runId → same result.
      const a = resolveActiveNicheStackForRun({
        runId: "run-0",
        agentId: "agent-1",
        env: process.env,
      });
      const b = resolveActiveNicheStackForRun({
        runId: "run-0",
        agentId: "agent-1",
        env: process.env,
      });
      expect(a !== null).toBe(b !== null);

      // 50% fraction + 20 runs → expect a mix.
      const routedCount = results.filter(Boolean).length;
      expect(routedCount).toBeGreaterThan(0);
      expect(routedCount).toBeLessThan(20);
    });
  });

  it("sets shadow_mode for shadow release mode", async () => {
    await withTempHome(async () => {
      const record = makeStackRecord({ release_mode: "shadow" });
      upsertActiveNicheStackRecord(record, process.env);
      setActiveNicheAgentDefault(
        { agent_id: "agent-1", active_stack_id: "test-stack", updated_at: TS },
        process.env,
      );

      const result = resolveActiveNicheStackForRun({
        runId: "run-1",
        agentId: "agent-1",
        env: process.env,
      });
      expect(result).not.toBeNull();
      expect(result!.shadow_mode).toBe(true);
      expect(result!.canary_routed).toBe(false);
      expect(result!.runSeed.mode).toBe("shadow");
    });
  });

  it("sets neither shadow nor canary for live mode", async () => {
    await withTempHome(async () => {
      const record = makeStackRecord({ release_mode: "live" });
      upsertActiveNicheStackRecord(record, process.env);
      setActiveNicheAgentDefault(
        { agent_id: "agent-1", active_stack_id: "test-stack", updated_at: TS },
        process.env,
      );

      const result = resolveActiveNicheStackForRun({
        runId: "run-1",
        agentId: "agent-1",
        env: process.env,
      });
      expect(result).not.toBeNull();
      expect(result!.shadow_mode).toBe(false);
      expect(result!.canary_routed).toBe(false);
    });
  });

  it("skips rolled_back stacks", async () => {
    await withTempHome(async () => {
      const record = makeStackRecord({ release_mode: "rolled_back" });
      upsertActiveNicheStackRecord(record, process.env);
      setActiveNicheAgentDefault(
        { agent_id: "agent-1", active_stack_id: "test-stack", updated_at: TS },
        process.env,
      );

      const result = resolveActiveNicheStackForRun({
        runId: "run-1",
        agentId: "agent-1",
        env: process.env,
      });
      expect(result).toBeNull();
    });
  });
});
