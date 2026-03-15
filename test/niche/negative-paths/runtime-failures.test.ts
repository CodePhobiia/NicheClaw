import { describe, expect, it, vi } from "vitest";
import { resolveActiveNicheStackForRun } from "../../../src/niche/runtime/active-stack.js";
import { maybeRunNicheVerifierGate } from "../../../src/niche/runtime/verifier-gate.js";
import { buildNichePlannerPromptBlock } from "../../../src/niche/runtime/planner-injection.js";
import { rankToolsForNicheRun } from "../../../src/niche/runtime/tool-ranking.js";
import {
  upsertActiveNicheStackRecord,
  setActiveNicheAgentDefault,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";
import type {
  ActiveNicheStackRecord,
  PreparedNicheRunSeed,
} from "../../../src/niche/schema/index.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

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
  canaryFraction?: number;
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
    ...(params.canaryFraction !== undefined
      ? { canary_fraction: params.canaryFraction }
      : {}),
  };
}

describe("resolveActiveNicheStackForRun negative paths", () => {
  it("returns null when no stacks are registered", async () => {
    await withTempHome(async () => {
      const resolved = resolveActiveNicheStackForRun({
        runId: "run-no-stacks",
        agentId: "main",
        env: process.env,
      });

      expect(resolved).toBeNull();
    });
  });

  it("returns null when agentId does not match any default", async () => {
    await withTempHome(async () => {
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "stack-1",
          manifestId: "candidate-1",
          nicheProgramId: "prog-1",
        }),
        process.env,
      );
      setActiveNicheAgentDefault(
        {
          agent_id: "other-agent",
          active_stack_id: "stack-1",
          updated_at: "2026-03-13T09:01:00.000Z",
        },
        process.env,
      );

      const resolved = resolveActiveNicheStackForRun({
        runId: "run-wrong-agent",
        agentId: "main",
        env: process.env,
      });

      expect(resolved).toBeNull();
    });
  });

  it("returns null when the stack is rolled_back", async () => {
    await withTempHome(async () => {
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "stack-rolledback",
          manifestId: "candidate-rolledback",
          nicheProgramId: "prog-rolledback",
          releaseMode: "rolled_back",
        }),
        process.env,
      );
      setActiveNicheAgentDefault(
        {
          agent_id: "main",
          active_stack_id: "stack-rolledback",
          updated_at: "2026-03-13T09:01:00.000Z",
        },
        process.env,
      );

      const resolved = resolveActiveNicheStackForRun({
        runId: "run-rolledback",
        agentId: "main",
        env: process.env,
      });

      expect(resolved).toBeNull();
    });
  });

  it("returns null when canary fraction is 0", async () => {
    await withTempHome(async () => {
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "stack-canary-zero",
          manifestId: "candidate-canary-zero",
          nicheProgramId: "prog-canary-zero",
          releaseMode: "canary",
          canaryFraction: 0,
        }),
        process.env,
      );
      setActiveNicheAgentDefault(
        {
          agent_id: "main",
          active_stack_id: "stack-canary-zero",
          updated_at: "2026-03-13T09:01:00.000Z",
        },
        process.env,
      );

      const resolved = resolveActiveNicheStackForRun({
        runId: "run-canary-zero",
        agentId: "main",
        env: process.env,
      });

      expect(resolved).toBeNull();
    });
  });
});

describe("maybeRunNicheVerifierGate negative paths", () => {
  it("returns null when runId is undefined", () => {
    const result = maybeRunNicheVerifierGate({
      runId: undefined,
      payloads: [{ text: "Hello" }],
      checkedAt: "2026-03-14T10:00:00.000Z",
    });

    expect(result).toBeNull();
  });

  it("returns null when payloads array is empty", () => {
    const result = maybeRunNicheVerifierGate({
      runId: "run-empty-payloads",
      payloads: [],
      checkedAt: "2026-03-14T10:00:00.000Z",
    });

    expect(result).toBeNull();
  });
});

describe("buildNichePlannerPromptBlock negative paths", () => {
  it("returns null when no active niche context exists for the run", () => {
    const result = buildNichePlannerPromptBlock("run-nonexistent");

    expect(result).toBeNull();
  });
});

describe("rankToolsForNicheRun negative paths", () => {
  it("returns empty array when no active niche context exists for the run", () => {
    const result = rankToolsForNicheRun("run-nonexistent", ["exec", "read"]);

    expect(result).toEqual([]);
  });

  it("returns empty array when tools list is empty and no context", () => {
    const result = rankToolsForNicheRun("run-no-context", []);

    expect(result).toEqual([]);
  });
});
