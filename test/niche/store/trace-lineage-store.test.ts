import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { RunTrace } from "../../../src/niche/schema/index.js";
import {
  appendRunTrace,
  createReplayBundle,
  getChildrenForArtifact,
  getParentsForArtifact,
  getReplayBundle,
  getRunTrace,
  listLineageEdges,
  queryRunTraces,
  writeLineageEdges,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeArtifactRef() {
  return {
    artifact_id: "artifact-repo-dataset",
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
    created_at: "2026-03-12T10:10:00.000Z",
  } as const;
}

function makeRunTrace(): RunTrace {
  return {
    trace_id: "trace-repo-ci-001",
    run_id: "run-repo-ci-001",
    niche_program_id: "repo-ci-specialist",
    domain_pack_id: "repo-ci-specialist-pack",
    mode: "benchmark",
    session_ref: {
      session_id: "session-main",
      transcript_path: "agents/main/sessions/run-001.jsonl",
      route: "cli",
    },
    planner_inputs: [{ stage_id: "planner-input-1", summary: "Benchmark prompt and repo context." }],
    planner_outputs: [{ stage_id: "planner-output-1", summary: "Plan to inspect build failure and patch." }],
    action_proposals: [
      {
        proposal_id: "proposal-1",
        selected_tool: "exec",
        selected_reason: "Need to reproduce the failure first.",
        guard_decision: "allowed",
        attempt_index: 0,
      },
    ],
    tool_calls: [
      {
        tool_call_id: "tool-call-1",
        tool_name: "exec",
        status: "completed",
        arguments_summary: "pnpm build:strict-smoke",
        output_summary: "Build failed before schema fix.",
      },
    ],
    observations: [
      {
        observation_id: "observation-1",
        source: "ci_logs",
        summary: "Build fails in schema export surface.",
      },
    ],
    verifier_decisions: [
      {
        decision_id: "verifier-1",
        outcome: "approved",
        rationale: "Output is grounded in build evidence.",
      },
    ],
    final_output: {
      output_id: "final-output-1",
      output_type: "text",
      content_summary: "Reported validated schema fix with evidence.",
      emitted_to_user: false,
    },
    usage: {
      input_tokens: 1200,
      output_tokens: 340,
      total_tokens: 1540,
    },
    latency: {
      planner_ms: 120,
      tool_ms: 1800,
      verifier_ms: 40,
      end_to_end_ms: 2100,
    },
    cost: {
      currency: "USD",
      total_cost: 0.12,
    },
    failure_labels: ["nonzero_exit"],
    artifact_refs: [makeArtifactRef()],
    baseline_or_candidate_manifest_id: "candidate-manifest-repo-ci",
    planner_version_id: "planner-primary-v1",
    action_policy_version_id: "repo-ci-action-policy-v1",
    verifier_pack_version_id: "repo-ci-verifier-pack-v1",
    retrieval_stack_version_id: "repo-ci-retrieval-stack-v1",
    grader_set_version_id: "grader-set-v1",
    source_access_manifest_id: "repo-ci-source-access",
    runtime_snapshot_id: "runtime-snapshot-v1",
    context_bundle_id: "context-bundle-v1",
    evidence_bundle_refs: [
      {
        evidence_bundle_id: "evidence-bundle-1",
        source_refs: [{ source_id: "repo-root", source_hash_or_ref: "repo@abc123" }],
        retrieval_query: "build strict smoke schema exports",
        reranker_output: ["repo-root"],
        delivered_evidence: ["schema barrel export duplication"],
      },
    ],
    benchmark_arm_ref: {
      benchmark_arm_id: "candidate-arm",
    },
    benchmark_case_ref: {
      case_kind: "atomic_case",
      case_id: "eval-case-repo-search",
    },
    determinism_policy_id: "repo-ci-determinism-v1",
    random_seed: "seed-001",
    phase_timestamps: {
      planner_started_at: "2026-03-12T10:20:00.000Z",
      planner_finished_at: "2026-03-12T10:20:01.000Z",
      action_proposal_started_at: "2026-03-12T10:20:01.000Z",
      action_proposal_finished_at: "2026-03-12T10:20:02.000Z",
      tool_execution_started_at: "2026-03-12T10:20:02.000Z",
      tool_execution_finished_at: "2026-03-12T10:20:04.000Z",
      verifier_started_at: "2026-03-12T10:20:04.000Z",
      verifier_finished_at: "2026-03-12T10:20:05.000Z",
      final_emission_at: "2026-03-12T10:20:05.000Z",
      trace_persisted_at: "2026-03-12T10:20:06.000Z",
    },
    wall_clock_start_at: "2026-03-12T10:20:00.000Z",
    wall_clock_end_at: "2026-03-12T10:20:06.000Z",
    replayability_status: "replayable",
    determinism_notes: "Frozen repo snapshot and fixed benchmark seed.",
  };
}

describe("trace store", () => {
  it("appends, loads, and queries traces without allowing overwrites", async () => {
    await withTempHome(async () => {
      const trace = makeRunTrace();
      const pathname = appendRunTrace(trace, process.env);
      expect(fs.existsSync(pathname)).toBe(true);
      expect(getRunTrace(trace.trace_id, process.env)).toEqual(trace);
      expect(
        queryRunTraces(
          {
            mode: "benchmark",
            manifestId: "candidate-manifest-repo-ci",
            benchmarkArmId: "candidate-arm",
            benchmarkCaseId: "eval-case-repo-search",
            replayabilityStatus: "replayable",
          },
          process.env,
        ),
      ).toEqual([trace]);

      expect(() => appendRunTrace(trace, process.env)).toThrow(
        /Refusing to overwrite existing run trace/u,
      );
    });
  });

  it("rejects invalid traces before persistence", async () => {
    await withTempHome(async () => {
      const invalidTrace = {
        ...makeRunTrace(),
        trace_id: "",
      };

      expect(() =>
        appendRunTrace(invalidTrace as unknown as RunTrace, process.env),
      ).toThrow(/Invalid run trace/u);
    });
  });
});

describe("replay bundle store", () => {
  it("persists and loads replay bundles with deterministic metadata", async () => {
    await withTempHome(async () => {
      appendRunTrace(makeRunTrace(), process.env);

      const replayBundle = {
        replay_bundle_id: "replay-bundle-1",
        trace_id: "trace-repo-ci-001",
        context_bundle_id: "context-bundle-v1",
        runtime_snapshot_id: "runtime-snapshot-v1",
        determinism_policy_id: "repo-ci-determinism-v1",
        evidence_bundle_refs: makeRunTrace().evidence_bundle_refs,
        benchmark_suite_id: "repo-ci-benchmark-suite",
        suite_hash: "fedcba9876543210fedcba9876543210",
        fixture_version: "2026.3.12",
        environment_snapshot: {
          environment_hash: "abcdef0123456789abcdef0123456789",
          platform: "win32",
          notes: "Replay bundle captured from local benchmark host.",
        },
        replayability_status: "replayable",
        created_at: "2026-03-12T10:21:00.000Z",
      } as const;

      const pathname = createReplayBundle(replayBundle, process.env);
      expect(fs.existsSync(pathname)).toBe(true);
      expect(getReplayBundle("replay-bundle-1", process.env)).toEqual(replayBundle);
    });
  });
});

describe("lineage store", () => {
  it("writes lineage edges and supports parent and child reverse lookups", async () => {
    await withTempHome(async () => {
      writeLineageEdges(
        "candidate-recipe-v1",
        [
          {
            parent_artifact_id: "artifact-repo-dataset",
            relationship: "derived_from",
            derivation_step: "candidate_recipe_construction",
            notes: "Recipe generated from approved dataset lineage.",
          },
        ],
        process.env,
      );

      expect(getParentsForArtifact("candidate-recipe-v1", process.env)).toEqual([
        {
          parent_artifact_id: "artifact-repo-dataset",
          relationship: "derived_from",
          derivation_step: "candidate_recipe_construction",
          notes: "Recipe generated from approved dataset lineage.",
        },
      ]);

      expect(getChildrenForArtifact("artifact-repo-dataset", process.env)).toEqual([
        {
          child_artifact_id: "candidate-recipe-v1",
          parent_artifact_id: "artifact-repo-dataset",
          relationship: "derived_from",
          derivation_step: "candidate_recipe_construction",
          notes: "Recipe generated from approved dataset lineage.",
        },
      ]);
      expect(listLineageEdges(process.env)).toHaveLength(1);
    });
  });
});
