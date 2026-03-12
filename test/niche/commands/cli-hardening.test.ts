import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import { nicheBenchmarkCommand } from "../../../src/commands/niche/benchmark.js";
import { nicheInspectCommand } from "../../../src/commands/niche/inspect.js";
import { createPromotedReleaseMonitorDefinition } from "../../../src/niche/release/index.js";
import type { BaselineManifest, CandidateManifest } from "../../../src/niche/schema/index.js";

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-cli-hardening-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (!dir) {
      continue;
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function makeBaselineManifest(): BaselineManifest {
  return {
    baseline_manifest_id: "repo-ci-baseline",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T12:00:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
      notes: "Baseline planner runtime.",
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
    provider_runtime_notes: "Pinned baseline metadata.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12-baseline",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-atomic-pilot",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Repo baseline",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["read_file", "run_command", "write_file"],
    tool_contract_version: "2026.3.12",
    retrieval_config: { retrieval_policy: "pilot" },
    verifier_config: { verifier_pack: "repo-ci-verifier" },
  };
}

function makeCandidateManifest(): CandidateManifest {
  return {
    candidate_manifest_id: "repo-ci-candidate",
    based_on_baseline_manifest_id: "repo-ci-baseline",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T12:01:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
      notes: "Candidate planner runtime.",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T11:59:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "release_label_only",
    provider_runtime_notes: "Candidate metadata bounded.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12-candidate",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-atomic-pilot",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Repo candidate",
    domain_pack_id: "repo-ci-specialist-repo-ci-pack",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
  };
}

describe("niche CLI hardening", () => {
  it("reports malformed benchmark input JSON clearly", async () => {
    const dir = await makeTempDir();
    const baselinePath = path.join(dir, "baseline.json");
    const candidatePath = path.join(dir, "candidate.json");
    const suitePath = path.join(dir, "suite.json");
    const baselineExecPath = path.join(dir, "baseline-exec.json");
    const candidateExecPath = path.join(dir, "candidate-exec.json");

    saveJsonFile(baselinePath, makeBaselineManifest());
    saveJsonFile(candidatePath, makeCandidateManifest());
    await fs.writeFile(suitePath, "{ invalid-json", "utf8");
    saveJsonFile(baselineExecPath, { cases: {} });
    saveJsonFile(candidateExecPath, { cases: {} });

    await expect(
      nicheBenchmarkCommand(
        {
          baselineManifestPath: baselinePath,
          candidateManifestPath: candidatePath,
          suitePath,
          baselineExecutionPath: baselineExecPath,
          candidateExecutionPath: candidateExecPath,
        },
        {
          log: () => {},
          error: () => {},
          exit: () => {},
        },
      ),
    ).rejects.toThrow(/Invalid JSON in/);
  });

  it("inspects promoted monitor definitions with cadence defaults instead of dropping metadata", async () => {
    const dir = await makeTempDir();
    const monitorPath = path.join(dir, "monitor.json");
    const definition = createPromotedReleaseMonitorDefinition({
      promotedReleaseId: "repo-ci-release",
      baselineManifestId: "repo-ci-baseline",
      candidateManifestId: "repo-ci-candidate",
      driftThresholds: {
        task_success_drift: 0.2,
        task_family_drift: 0.2,
        verifier_false_veto_drift: 0.1,
        grader_disagreement_drift: 0.1,
        source_freshness_decay: 0.3,
        latency_cost_drift: 0.2,
        hard_fail_drift: 0.1,
      },
      verifierDriftThresholds: {
        task_success_drift: 0.2,
        task_family_drift: 0.2,
        verifier_false_veto_drift: 0.1,
        grader_disagreement_drift: 0.1,
        source_freshness_decay: 0.3,
        latency_cost_drift: 0.2,
        hard_fail_drift: 0.1,
      },
      graderDriftThresholds: {
        task_success_drift: 0.2,
        task_family_drift: 0.2,
        verifier_false_veto_drift: 0.1,
        grader_disagreement_drift: 0.1,
        source_freshness_decay: 0.3,
        latency_cost_drift: 0.2,
        hard_fail_drift: 0.1,
      },
    });
    saveJsonFile(monitorPath, definition);

    const result = await nicheInspectCommand(
      {
        kind: "promoted_monitor",
        filePath: monitorPath,
      },
      {
        log: () => {},
        error: () => {},
        exit: () => {},
      },
    );

    expect(result.summary.cadence_defaults).toEqual(definition.cadence_defaults);
  });
});
