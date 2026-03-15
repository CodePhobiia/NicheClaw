import { describe, expect, it } from "vitest";
import {
  resolveActiveNicheStackForRun,
  type ResolvedActiveNicheStack,
} from "../../../src/niche/runtime/index.js";
import type {
  ActiveNicheStackRecord,
  PreparedNicheRunSeed,
} from "../../../src/niche/schema/index.js";
import {
  setActiveNicheAgentDefault,
  setActiveNicheRouteOverlay,
  upsertActiveNicheStackRecord,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeSeedTemplate(params: {
  activeStackId: string;
  manifestId: string;
  nicheProgramId: string;
}): PreparedNicheRunSeed {
  return {
    seed_id: `template-${params.activeStackId}`,
    prepared_at: "2026-03-13T09:00:00.000Z",
    mode: "live",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: params.manifestId,
    readiness_report_id: `${params.nicheProgramId}-readiness`,
    niche_program_id: params.nicheProgramId,
    domain_pack_id: `${params.nicheProgramId}-pack`,
    domain_pack: {
      domain_pack_id: `${params.nicheProgramId}-pack`,
      niche_program_id: params.nicheProgramId,
      version: "2026.3.13",
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
      required_arguments_by_tool: {
        exec: ["command"],
      },
      max_retry_attempts: 1,
    },
    verifier_pack_config: {
      verifier_pack_id: `${params.nicheProgramId}-verifier-pack`,
      version: "2026.3.13",
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

function makeActiveStackRecord(params: {
  activeStackId: string;
  manifestId: string;
  nicheProgramId: string;
  releaseMode?: ActiveNicheStackRecord["release_mode"];
}): ActiveNicheStackRecord {
  return {
    active_stack_id: params.activeStackId,
    niche_program_id: params.nicheProgramId,
    candidate_manifest_id: params.manifestId,
    registered_at: "2026-03-13T09:00:00.000Z",
    release_mode: params.releaseMode ?? "live",
    run_seed_template: makeSeedTemplate({
      activeStackId: params.activeStackId,
      manifestId: params.manifestId,
      nicheProgramId: params.nicheProgramId,
    }),
  };
}

function expectResolution(
  resolved: ResolvedActiveNicheStack | null,
  expected: {
    activeStackId: string;
    source: PreparedNicheRunSeed["resolution_source"];
  },
): void {
  expect(resolved?.record.active_stack_id).toBe(expected.activeStackId);
  expect(resolved?.source).toBe(expected.source);
  expect(resolved?.runSeed.active_stack_id).toBe(expected.activeStackId);
  expect(resolved?.runSeed.resolution_source).toBe(expected.source);
}

describe("active Niche stack resolution", () => {
  it("prefers session overrides over route overlays and agent defaults", async () => {
    await withTempHome(async () => {
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "stack-default",
          manifestId: "candidate-default",
          nicheProgramId: "repo-ci-default",
        }),
        process.env,
      );
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "stack-route",
          manifestId: "candidate-route",
          nicheProgramId: "repo-ci-route",
        }),
        process.env,
      );
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "stack-session",
          manifestId: "candidate-session",
          nicheProgramId: "repo-ci-session",
        }),
        process.env,
      );
      setActiveNicheAgentDefault(
        {
          agent_id: "main",
          active_stack_id: "stack-default",
          updated_at: "2026-03-13T09:01:00.000Z",
        },
        process.env,
      );
      setActiveNicheRouteOverlay(
        {
          overlay_id: "slack-primary",
          agent_id: "main",
          active_stack_id: "stack-route",
          updated_at: "2026-03-13T09:02:00.000Z",
          channel: "slack",
          account_id: "workspace-1",
          to: "channel:C123",
        },
        process.env,
      );

      const resolved = resolveActiveNicheStackForRun({
        runId: "run-session-override",
        sessionEntry: {
          sessionId: "session-1",
          updatedAt: Date.now(),
          niche: {
            sessionOverrideStackId: "stack-session",
          },
        },
        agentId: "main",
        messageChannel: "slack",
        accountId: "workspace-1",
        to: "channel:C123",
        env: process.env,
      });

      expectResolution(resolved, {
        activeStackId: "stack-session",
        source: "session_override",
      });
      expect(resolved?.runSeed.baseline_or_candidate_manifest_id).toBe("candidate-session");
    });
  });

  it("uses the most specific matching route overlay before falling back to agent defaults", async () => {
    await withTempHome(async () => {
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "stack-default",
          manifestId: "candidate-default",
          nicheProgramId: "repo-ci-default",
        }),
        process.env,
      );
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "stack-channel",
          manifestId: "candidate-channel",
          nicheProgramId: "repo-ci-channel",
        }),
        process.env,
      );
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "stack-route",
          manifestId: "candidate-route",
          nicheProgramId: "repo-ci-route",
        }),
        process.env,
      );
      setActiveNicheAgentDefault(
        {
          agent_id: "main",
          active_stack_id: "stack-default",
          updated_at: "2026-03-13T09:01:00.000Z",
        },
        process.env,
      );
      setActiveNicheRouteOverlay(
        {
          overlay_id: "slack-channel",
          agent_id: "main",
          active_stack_id: "stack-channel",
          updated_at: "2026-03-13T09:02:00.000Z",
          channel: "slack",
        },
        process.env,
      );
      setActiveNicheRouteOverlay(
        {
          overlay_id: "slack-route",
          agent_id: "main",
          active_stack_id: "stack-route",
          updated_at: "2026-03-13T09:03:00.000Z",
          channel: "slack",
          account_id: "workspace-1",
          to: "channel:C123",
        },
        process.env,
      );

      const resolved = resolveActiveNicheStackForRun({
        runId: "run-route-override",
        agentId: "main",
        messageChannel: "slack",
        accountId: "workspace-1",
        to: "channel:C123",
        env: process.env,
      });

      expectResolution(resolved, {
        activeStackId: "stack-route",
        source: "route_override",
      });
    });
  });

  it("falls back to the agent default when no session or route override applies", async () => {
    await withTempHome(async () => {
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "stack-default",
          manifestId: "candidate-default",
          nicheProgramId: "repo-ci-default",
          releaseMode: "canary",
        }),
        process.env,
      );
      setActiveNicheAgentDefault(
        {
          agent_id: "main",
          active_stack_id: "stack-default",
          updated_at: "2026-03-13T09:01:00.000Z",
        },
        process.env,
      );

      const resolved = resolveActiveNicheStackForRun({
        runId: "run-agent-default",
        agentId: "main",
        messageChannel: "telegram",
        accountId: "primary",
        to: "chat:123",
        env: process.env,
      });

      expectResolution(resolved, {
        activeStackId: "stack-default",
        source: "agent_default",
      });
      expect(resolved?.runSeed.resolved_release_mode).toBe("canary");
      expect(resolved?.runSeed.mode).toBe("live");
    });
  });
});
