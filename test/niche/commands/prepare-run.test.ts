import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCliRuntimeCapture } from "../../../src/cli/test-runtime-capture.js";
import { nichePrepareRunCommand } from "../../../src/commands/niche/prepare-run.js";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-prepare-run-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (!dir) {
      continue;
    }
    await fsPromises.rm(dir, { recursive: true, force: true });
  }
});

function writeFixtures(dir: string) {
  const manifestPath = path.join(dir, "candidate.json");
  const domainPackPath = path.join(dir, "domain-pack.json");
  const sourceAccessPath = path.join(dir, "source-access.json");
  const actionPolicyPath = path.join(dir, "action-policy-runtime.json");
  const readinessPath = path.join(dir, "readiness.json");
  const environmentPath = path.join(dir, "environment.json");
  const outPath = path.join(dir, "prepared-seed.json");

  saveJsonFile(manifestPath, {
    candidate_manifest_id: "candidate-manifest-repo-ci",
    based_on_baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T12:00:00.000Z",
    planner_runtime: {
      component_id: "planner-primary-v1",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T11:59:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "exact_snapshot",
    provider_runtime_notes: "Pinned candidate metadata.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12",
    grader_set_version: "grader-set-v1",
    benchmark_suite_id: "repo-ci-suite",
    source_access_manifest_id: "source-access-repo-ci",
    retry_policy: { max_attempts: 2 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Candidate manifest",
    domain_pack_id: "repo-ci-pack",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["exec"],
    tool_contract_version: "2026.3.12",
    retrieval_config: { policy: "baseline" },
    verifier_config: { pack: "baseline" },
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
  });
  saveJsonFile(domainPackPath, {
    domain_pack_id: "repo-ci-pack",
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
        optional_arguments: ["cwd"],
        failure_modes: ["missing_evidence"],
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
      blocking_failure_ids: ["missing_evidence"],
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
  });
  saveJsonFile(sourceAccessPath, {
    source_access_manifest_id: "source-access-repo-ci",
    allowed_tools: ["exec"],
    allowed_retrieval_indices: ["repo-doc"],
    allowed_live_sources: [],
    disallowed_sources: [],
    sandbox_policy: "workspace-only",
    network_policy: "deny",
    approval_policy: "never",
  });
  saveJsonFile(actionPolicyPath, {
    allowed_tools: ["exec"],
    required_arguments_by_tool: {
      exec: ["command"],
    },
    max_retry_attempts: 2,
  });
  saveJsonFile(readinessPath, {
    readiness_report_id: "repo-ci-specialist-readiness",
    niche_program_id: "repo-ci-specialist",
    status: "ready_with_warnings",
    dimension_scores: {
      source_quality: { score: 92, rationale: "Repo sources are clean." },
      source_coverage: { score: 90, rationale: "Repo and CI logs are covered." },
      contradiction_rate: { score: 8, rationale: "Contradictions are low." },
      freshness: { score: 91, rationale: "Sources are current." },
      rights_sufficiency: { score: 95, rationale: "Benchmark rights are approved." },
      task_observability: { score: 94, rationale: "Tool execution is observable." },
      benchmarkability: { score: 93, rationale: "Held-out cases exist." },
      measurable_success_criteria: { score: 89, rationale: "Success is measurable." },
      tool_availability: { score: 96, rationale: "Required tools are available." },
    },
    hard_blockers: [],
    warnings: [
      {
        warning_code: "embargo_review",
        message: "Confirm trace embargo before optimization reuse.",
      },
    ],
    recommended_next_actions: [
      {
        action_id: "review_embargo_policy",
        summary: "Review the live-trace embargo window before optimization.",
        priority: "recommended",
      },
    ],
    generated_at: "2026-03-12T12:00:00.000Z",
  });
  saveJsonFile(environmentPath, {
    environment_hash: "0123456789abcdef0123456789abcdef",
    platform: process.platform,
    notes: "Frozen benchmark host snapshot.",
  });

  return {
    manifestPath,
    domainPackPath,
    sourceAccessPath,
    actionPolicyPath,
    readinessPath,
    environmentPath,
    outPath,
  };
}

describe("nichePrepareRunCommand", () => {
  it("reads typed JSON inputs and writes the prepared seed artifact", async () => {
    const dir = await makeTempDir();
    const files = writeFixtures(dir);
    const { defaultRuntime, runtimeLogs } = createCliRuntimeCapture();

    await nichePrepareRunCommand(
      {
        manifestKind: "candidate",
        manifestPath: files.manifestPath,
        domainPackPath: files.domainPackPath,
        sourceAccessManifestPath: files.sourceAccessPath,
        actionPolicyRuntimePath: files.actionPolicyPath,
        readinessReportPath: files.readinessPath,
        verifierPackId: "verifier-pack-repo-ci",
        verifierPackVersion: "2026.3.12",
        mode: "benchmark",
        runtimeSnapshotId: "runtime-snapshot-v1",
        contextBundleId: "context-bundle-v1",
        determinismPolicyId: "determinism-v1",
        randomSeed: "seed-1",
        replayabilityStatus: "replayable",
        determinismNotes: "Frozen benchmark fixture.",
        benchmarkSuiteId: "repo-ci-suite",
        benchmarkArmId: "candidate-arm",
        suiteHash: "fedcba9876543210fedcba9876543210",
        fixtureVersion: "2026.3.12",
        environmentSnapshotPath: files.environmentPath,
        outPath: files.outPath,
      },
      defaultRuntime,
    );

    expect(fs.existsSync(files.outPath)).toBe(true);
    const seed = JSON.parse(await fsPromises.readFile(files.outPath, "utf8")) as {
      baseline_or_candidate_manifest_id: string;
      benchmark_arm_id: string;
      readiness_report_id: string;
    };
    expect(seed.baseline_or_candidate_manifest_id).toBe("candidate-manifest-repo-ci");
    expect(seed.benchmark_arm_id).toBe("candidate-arm");
    expect(seed.readiness_report_id).toBe("repo-ci-specialist-readiness");
    expect(runtimeLogs[0]).toContain("Wrote prepared Niche run seed");
  });

  it("prints the prepared seed JSON when requested", async () => {
    const dir = await makeTempDir();
    const files = writeFixtures(dir);
    const { defaultRuntime, runtimeLogs } = createCliRuntimeCapture();

    await nichePrepareRunCommand(
      {
        manifestKind: "candidate",
        manifestPath: files.manifestPath,
        domainPackPath: files.domainPackPath,
        sourceAccessManifestPath: files.sourceAccessPath,
        actionPolicyRuntimePath: files.actionPolicyPath,
        readinessReportPath: files.readinessPath,
        verifierPackId: "verifier-pack-repo-ci",
        verifierPackVersion: "2026.3.12",
        mode: "candidate",
        runtimeSnapshotId: "runtime-snapshot-v1",
        contextBundleId: "context-bundle-v1",
        determinismPolicyId: "determinism-v1",
        randomSeed: "seed-1",
        replayabilityStatus: "partially_replayable",
        determinismNotes: "Seed preview only.",
        json: true,
      },
      defaultRuntime,
    );

    expect(JSON.parse(runtimeLogs[0] ?? "{}")).toMatchObject({
      baseline_or_candidate_manifest_id: "candidate-manifest-repo-ci",
      planner_version_id: "planner-primary-v1",
      readiness_report_id: "repo-ci-specialist-readiness",
    });
  });

  it("fails closed when no readiness report is provided or stored", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const files = writeFixtures(dir);
      const { defaultRuntime } = createCliRuntimeCapture();

      await expect(
        nichePrepareRunCommand(
          {
            manifestKind: "candidate",
            manifestPath: files.manifestPath,
            domainPackPath: files.domainPackPath,
            sourceAccessManifestPath: files.sourceAccessPath,
            actionPolicyRuntimePath: files.actionPolicyPath,
            verifierPackId: "verifier-pack-repo-ci",
            verifierPackVersion: "2026.3.12",
            mode: "candidate",
            runtimeSnapshotId: "runtime-snapshot-v1",
            contextBundleId: "context-bundle-v1",
            determinismPolicyId: "determinism-v1",
            randomSeed: "seed-1",
            replayabilityStatus: "non_replayable",
            determinismNotes: "Readiness must be resolved from the store.",
            json: true,
          },
          defaultRuntime,
        ),
      ).rejects.toThrow(/No stored readiness report exists/u);
    });
  });
});
