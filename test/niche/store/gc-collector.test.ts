import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  ActiveNicheStackRecord,
  PreparedNicheRunSeed,
} from "../../../src/niche/schema/index.js";
import { upsertActiveNicheStackRecord } from "../../../src/niche/store/active-stack-store.js";
import {
  planGarbageCollection,
  executeGarbageCollection,
} from "../../../src/niche/store/gc-collector.js";
import { resolveNicheStoreRoots } from "../../../src/niche/store/paths.js";
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
        concepts: [{ id: "concept-1", label: "Concept" }],
        relations: [],
      },
      task_taxonomy: [
        {
          task_family_id: "task-fam-1",
          label: "Task family",
          benchmarkable: true,
          required_capabilities: ["evidence_grounding"],
        },
      ],
      terminology_map: {},
      constraints: [
        {
          constraint_id: "constraint-1",
          category: "grounding",
          rule: "must_ground_in_evidence",
          severity: "moderate",
        },
      ],
      tool_contracts: [
        {
          tool_name: "exec",
          intent_summary: "Execute commands.",
          required_arguments: ["command"],
          optional_arguments: [],
          failure_modes: [],
        },
      ],
      evidence_source_registry: [
        {
          source_id: "src-1",
          source_kind: "repos",
          title: "Source",
          access_pattern: "read",
        },
      ],
      failure_taxonomy: [
        {
          failure_id: "fail-1",
          label: "Failure",
          description: "A failure.",
          severity: "high",
          detection_hints: ["error"],
        },
      ],
      verifier_defaults: {
        required_checks: ["evidence_grounding"],
        blocking_failure_ids: [],
        output_requirements: ["grounded_response"],
        escalation_policy: "Escalate.",
      },
      benchmark_seed_specs: [
        {
          seed_id: "seed-1",
          task_family_id: "task-fam-1",
          prompt: "Test prompt.",
          source_refs: ["src-1"],
          pass_conditions: ["grounded_response"],
          hard_fail_conditions: [],
        },
      ],
    },
    source_access_manifest: {
      source_access_manifest_id: `${params.nicheProgramId}-source-access`,
      allowed_tools: ["exec"],
      allowed_retrieval_indices: ["src-1"],
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
      version: "2026.3.13",
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: [],
      output_requirements: ["grounded_response"],
      escalation_policy: "Escalate.",
      min_confidence: 0.6,
      max_allowed_ungrounded_claims: 0,
    },
    planner_version_id: "planner-v1",
    action_policy_version_id: "action-policy-v1",
    verifier_pack_version_id: "verifier-pack-v1",
    retrieval_stack_version_id: "retrieval-stack-v1",
    grader_set_version_id: "grader-set-v1",
    runtime_snapshot_id: `${params.activeStackId}-runtime`,
    context_bundle_id: `${params.activeStackId}-context`,
    determinism_policy_id: `${params.activeStackId}-determinism`,
    random_seed: `seed-${params.activeStackId}`,
    replayability_status: "non_replayable",
    determinism_notes: `Template for ${params.activeStackId}.`,
    artifact_refs: [],
    evidence_bundle_refs: [],
  };
}

function makeActiveStackRecord(params: {
  activeStackId: string;
  manifestId: string;
  nicheProgramId: string;
}): ActiveNicheStackRecord {
  return {
    active_stack_id: params.activeStackId,
    niche_program_id: params.nicheProgramId,
    candidate_manifest_id: params.manifestId,
    registered_at: "2026-03-13T09:00:00.000Z",
    release_mode: "live",
    run_seed_template: makeSeedTemplate(params),
  };
}

describe("planGarbageCollection", () => {
  it("returns empty plan when store is empty", async () => {
    await withTempHome(async () => {
      const plan = planGarbageCollection({ keepDays: 30, env: process.env });
      expect(plan.candidates).toEqual([]);
      expect(plan.total_size_bytes).toBe(0);
      expect(plan.scanned_files).toBe(0);
    });
  });

  it("identifies old files as GC candidates", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      // Use traces dir (not benchmarkRuns) to avoid schema validation
      // that listBenchmarkResultRecords triggers on benchmarkRuns files.
      fs.mkdirSync(roots.traces, { recursive: true });
      const filePath = path.join(roots.traces, "stale-trace.json");
      fs.writeFileSync(filePath, JSON.stringify({ trace_id: "stale-trace" }));

      // Set mtime to 60 days ago
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      fs.utimesSync(filePath, sixtyDaysAgo, sixtyDaysAgo);

      const plan = planGarbageCollection({ keepDays: 30, env: process.env });
      expect(plan.candidates.length).toBeGreaterThanOrEqual(1);

      const staleCandidate = plan.candidates.find((c) => c.artifact_id === "stale-trace");
      expect(staleCandidate).toBeDefined();
      expect(staleCandidate!.file_path).toBe(filePath);
      expect(plan.total_size_bytes).toBeGreaterThan(0);
    });
  });

  it("protects files referenced by active stacks", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      // Use traces dir to avoid benchmarkRuns schema validation
      fs.mkdirSync(roots.traces, { recursive: true });

      // Create a stale file with the same artifact_id as a protected active stack ref
      const protectedId = "protected-manifest";
      const filePath = path.join(roots.traces, `${protectedId}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ id: protectedId }));
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      fs.utimesSync(filePath, sixtyDaysAgo, sixtyDaysAgo);

      // Register an active stack that references the protected ID as a candidate manifest
      upsertActiveNicheStackRecord(
        makeActiveStackRecord({
          activeStackId: "stack-gc-test",
          manifestId: protectedId,
          nicheProgramId: "gc-test-program",
        }),
        process.env,
      );

      const plan = planGarbageCollection({ keepDays: 30, env: process.env });
      expect(plan.protected_artifact_ids.has(protectedId)).toBe(true);

      const protectedCandidate = plan.candidates.find((c) => c.artifact_id === protectedId);
      expect(protectedCandidate).toBeUndefined();
    });
  });
});

describe("executeGarbageCollection", () => {
  it("deletes candidate files", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      // Use traces dir to avoid benchmarkRuns schema validation
      fs.mkdirSync(roots.traces, { recursive: true });

      const filePath = path.join(roots.traces, "to-delete.json");
      fs.writeFileSync(filePath, JSON.stringify({ trace_id: "to-delete" }));
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      fs.utimesSync(filePath, sixtyDaysAgo, sixtyDaysAgo);

      const plan = planGarbageCollection({ keepDays: 30, env: process.env });
      expect(plan.candidates.length).toBeGreaterThanOrEqual(1);

      const gcResult = executeGarbageCollection(plan);
      expect(gcResult.deleted.length).toBeGreaterThanOrEqual(1);
      expect(gcResult.errors).toEqual([]);
      expect(gcResult.total_freed_bytes).toBeGreaterThan(0);

      // Verify the file was actually removed
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });
});
