import { describe, expect, it, vi } from "vitest";
import { nicheHandlers } from "../../../src/gateway/server-methods/niche.js";
import type {
  NicheProgram,
  PreparedNicheRunSeed,
  ReadinessReport,
} from "../../../src/niche/schema/index.js";
import {
  writeNicheProgram,
  saveReadinessReport,
  upsertActiveNicheStackRecord,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

function makeProgram(id: string): NicheProgram {
  return {
    niche_program_id: id,
    name: `Program ${id}`,
    objective: "Used for gateway contract tests.",
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
  };
}

function makeReadyReport(nicheProgramId: string): ReadinessReport {
  return {
    readiness_report_id: `${nicheProgramId}-readiness`,
    niche_program_id: nicheProgramId,
    status: "ready",
    dimension_scores: {
      source_quality: { score: 85 },
      source_coverage: { score: 80 },
      contradiction_rate: { score: 5 },
      freshness: { score: 90 },
      rights_sufficiency: { score: 95 },
      task_observability: { score: 75 },
      benchmarkability: { score: 70 },
      measurable_success_criteria: { score: 80 },
      tool_availability: { score: 90 },
    },
    hard_blockers: [],
    warnings: [],
    recommended_next_actions: [
      {
        action_id: "proceed-with-specialization",
        summary: "The niche is ready for the next specialization stage.",
        priority: "optional",
      },
    ],
    generated_at: "2026-03-14T10:00:00.000Z",
  };
}

function makeSeedTemplate(params: {
  nicheProgramId: string;
  manifestId: string;
}): PreparedNicheRunSeed {
  return {
    seed_id: "seed-contract-v1",
    prepared_at: "2026-03-14T10:00:00.000Z",
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
          prompt: "Investigate failing case.",
          source_refs: ["repo-doc"],
          pass_conditions: ["grounded_response"],
          hard_fail_conditions: [],
        },
      ],
    },
    source_access_manifest: {
      source_access_manifest_id: "source-access-contract",
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
      verifier_pack_id: "verifier-contract",
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
    random_seed: "seed-contract",
    replayability_status: "non_replayable",
    determinism_notes: "Contract test template.",
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
      req: { id: "contract-test", method, params } as never,
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

describe("niche gateway-store contract tests", () => {
  it("niche.programs.list returns programs written to store", async () => {
    await withTempHome(async () => {
      const programs = [
        makeProgram("contract-alpha"),
        makeProgram("contract-beta"),
        makeProgram("contract-gamma"),
      ];
      for (const p of programs) {
        writeNicheProgram(p, process.env);
      }

      const result = await callHandler("niche.programs.list", {});
      expect(result.ok).toBe(true);

      const payload = result.payload as { programs: NicheProgram[] };
      expect(payload.programs).toHaveLength(3);

      const ids = payload.programs.map((p) => p.niche_program_id).toSorted();
      expect(ids).toEqual(["contract-alpha", "contract-beta", "contract-gamma"].toSorted());
    });
  });

  it("niche.programs.get returns specific program by ID", async () => {
    await withTempHome(async () => {
      const program = makeProgram("contract-specific");
      writeNicheProgram(program, process.env);

      const result = await callHandler("niche.programs.get", {
        nicheProgramId: "contract-specific",
      });
      expect(result.ok).toBe(true);

      const payload = result.payload as { program: NicheProgram };
      expect(payload.program.niche_program_id).toBe("contract-specific");
      expect(payload.program.name).toBe("Program contract-specific");
    });
  });

  it("niche.programs.get returns error for missing program", async () => {
    await withTempHome(async () => {
      const result = await callHandler("niche.programs.get", {
        nicheProgramId: "does-not-exist",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  it("niche.readiness.get returns readiness report from store", async () => {
    await withTempHome(async () => {
      const programId = "contract-readiness";
      const program = makeProgram(programId);
      writeNicheProgram(program, process.env);

      const report = makeReadyReport(programId);
      saveReadinessReport(report, process.env);

      const result = await callHandler("niche.readiness.get", {
        nicheProgramId: programId,
      });
      expect(result.ok).toBe(true);

      const payload = result.payload as { readiness: ReadinessReport };
      expect(payload.readiness.niche_program_id).toBe(programId);
      expect(payload.readiness.status).toBe("ready");
      expect(payload.readiness.hard_blockers).toHaveLength(0);
    });
  });

  it("niche.readiness.get returns error for missing program", async () => {
    await withTempHome(async () => {
      const result = await callHandler("niche.readiness.get", {
        nicheProgramId: "nonexistent-program",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  it("niche.runtime.state returns active stack state", async () => {
    await withTempHome(async () => {
      const programId = "contract-runtime";
      upsertActiveNicheStackRecord(
        {
          active_stack_id: "stack-contract",
          niche_program_id: programId,
          candidate_manifest_id: "candidate-contract",
          registered_at: "2026-03-14T10:00:00.000Z",
          release_mode: "live",
          run_seed_template: makeSeedTemplate({
            nicheProgramId: programId,
            manifestId: "candidate-contract",
          }),
        },
        process.env,
      );

      const result = await callHandler("niche.runtime.state", {});
      expect(result.ok).toBe(true);

      const payload = result.payload as {
        state: { stacks: Array<{ active_stack_id: string }> };
      };
      expect(payload.state.stacks).toHaveLength(1);
      expect(payload.state.stacks[0]!.active_stack_id).toBe("stack-contract");
    });
  });
});
