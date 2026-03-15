import { describe, expect, it, vi } from "vitest";
import { nicheHandlers } from "../../../src/gateway/server-methods/niche.js";
import type { PreparedNicheRunSeed } from "../../../src/niche/schema/index.js";
import {
  upsertActiveNicheStackRecord,
  setActiveNicheAgentDefault,
  writeNicheProgram,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

function makeSeedTemplate(): PreparedNicheRunSeed {
  return {
    seed_id: "seed-template-v1",
    prepared_at: "2026-03-14T10:00:00.000Z",
    mode: "live",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: "candidate-manifest-repo-ci",
    readiness_report_id: "repo-ci-specialist-readiness",
    niche_program_id: "repo-ci-specialist",
    domain_pack_id: "repo-ci-specialist-pack",
    domain_pack: {
      domain_pack_id: "repo-ci-specialist-pack",
      niche_program_id: "repo-ci-specialist",
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
          prompt: "Investigate failing case.",
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
      version: "2026.3.14",
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
    random_seed: "seed-gw-test",
    replayability_status: "non_replayable",
    determinism_notes: "Template for gateway test.",
    artifact_refs: [],
    evidence_bundle_refs: [],
  };
}

function callHandler(
  method: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; payload?: unknown; error?: unknown }> {
  return new Promise((resolve) => {
    const handler = nicheHandlers[method];
    if (!handler) {
      resolve({ ok: false, error: `Unknown method: ${method}` });
      return;
    }
    handler({
      req: { id: "test-1", method, params } as never,
      params,
      client: null,
      isWebchatConnect: () => false,
      respond: (ok, payload, error) => {
        resolve({ ok, payload, error });
      },
      context: {} as never,
    });
  });
}

describe("niche gateway methods", () => {
  it("lists programs from the store", async () => {
    await withTempHome(async () => {
      writeNicheProgram(
        {
          niche_program_id: "repo-ci-specialist",
          name: "Repo CI Specialist",
          objective: "Specializes in repo CI tasks.",
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
          allowed_tools: ["exec"],
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
              target_description: "Above 90%.",
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
        },
        process.env,
      );

      const result = await callHandler("niche.programs.list", {});
      expect(result.ok).toBe(true);
      const payload = result.payload as { programs: unknown[] };
      expect(payload.programs).toHaveLength(1);
    });
  });

  it("returns error for missing program", async () => {
    await withTempHome(async () => {
      const result = await callHandler("niche.programs.get", { nicheProgramId: "nonexistent" });
      expect(result.ok).toBe(false);
    });
  });

  it("returns active runtime state", async () => {
    await withTempHome(async () => {
      upsertActiveNicheStackRecord(
        {
          active_stack_id: "stack-gw-test",
          niche_program_id: "repo-ci-specialist",
          candidate_manifest_id: "candidate-manifest-repo-ci",
          registered_at: "2026-03-14T10:00:00.000Z",
          release_mode: "live",
          run_seed_template: makeSeedTemplate(),
        },
        process.env,
      );

      const result = await callHandler("niche.runtime.state", {});
      expect(result.ok).toBe(true);
      const payload = result.payload as { state: { stacks: unknown[] } };
      expect(payload.state.stacks).toHaveLength(1);
    });
  });

  it("gets a specific active stack by id", async () => {
    await withTempHome(async () => {
      upsertActiveNicheStackRecord(
        {
          active_stack_id: "stack-gw-test",
          niche_program_id: "repo-ci-specialist",
          candidate_manifest_id: "candidate-manifest-repo-ci",
          registered_at: "2026-03-14T10:00:00.000Z",
          release_mode: "live",
          run_seed_template: makeSeedTemplate(),
        },
        process.env,
      );

      const result = await callHandler("niche.runtime.stack", { activeStackId: "stack-gw-test" });
      expect(result.ok).toBe(true);

      const missing = await callHandler("niche.runtime.stack", { activeStackId: "nonexistent" });
      expect(missing.ok).toBe(false);
    });
  });

  it("executes rollback via gateway", async () => {
    await withTempHome(async () => {
      upsertActiveNicheStackRecord(
        {
          active_stack_id: "stack-rollback-test",
          niche_program_id: "repo-ci-specialist",
          candidate_manifest_id: "candidate-manifest-repo-ci",
          registered_at: "2026-03-14T10:00:00.000Z",
          release_mode: "live",
          run_seed_template: makeSeedTemplate(),
        },
        process.env,
      );
      setActiveNicheAgentDefault(
        {
          agent_id: "agent-gw",
          active_stack_id: "stack-rollback-test",
          updated_at: "2026-03-14T10:00:00.000Z",
        },
        process.env,
      );

      const result = await callHandler("niche.release.rollback", {
        activeStackId: "stack-rollback-test",
        agentId: "agent-gw",
        nicheProgramId: "repo-ci-specialist",
        reason: "Gateway-initiated rollback test.",
      });

      expect(result.ok).toBe(true);
      const payload = result.payload as {
        rollback: { rolled_back: boolean; agent_default_reverted: boolean };
      };
      expect(payload.rollback.rolled_back).toBe(true);
      expect(payload.rollback.agent_default_reverted).toBe(true);
    });
  });

  it("validates required params for rollback", async () => {
    await withTempHome(async () => {
      const result = await callHandler("niche.release.rollback", {
        activeStackId: "",
        agentId: "agent-gw",
        nicheProgramId: "repo-ci-specialist",
      });
      expect(result.ok).toBe(false);
    });
  });
});
