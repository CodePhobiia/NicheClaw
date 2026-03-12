import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import { validateJsonSchemaValue } from "../../../src/plugins/schema-validator.js";
import {
  nicheReleaseCommand,
  type NicheReleaseResult,
} from "../../../src/commands/niche/release.js";
import {
  buildRepoCiSeedBenchmarkSuites,
  buildRepoCiSeedDomainPack,
} from "../../../src/niche/pilots/repo-ci/index.js";
import {
  AtomicBenchmarkSuiteRecordSchema,
  runAtomicBenchmark,
} from "../../../src/niche/benchmark/index.js";
import { EpisodeBenchmarkSuiteRecordSchema } from "../../../src/niche/benchmark/episode-runner.js";
import { createPromotedReleaseMonitorDefinition } from "../../../src/niche/release/index.js";
import {
  ArtifactRefSchema,
  BaselineManifestSchema,
  CandidateManifestSchema,
  DomainPackSchema,
  type ArtifactRef,
  type BaselineManifest,
  type CandidateManifest,
} from "../../../src/niche/schema/index.js";

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-pilot-"));
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

function assertValid<T>(schema: Record<string, unknown>, cacheKey: string, value: T): T {
  const validation = validateJsonSchemaValue({
    schema,
    cacheKey,
    value,
  });
  expect(validation).toEqual({ ok: true });
  return value;
}

function makeBaselineManifest(suiteId: string): BaselineManifest {
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
    benchmark_suite_id: suiteId,
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Repo/terminal/CI baseline manifest.",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["read_file", "run_command", "write_file"],
    tool_contract_version: "2026.3.12",
    retrieval_config: { retrieval_policy: "pilot" },
    verifier_config: { verifier_pack: "repo-ci-verifier" },
  };
}

function makeCandidateManifest(suiteId: string): CandidateManifest {
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
      notes: "Candidate keeps the same-model benchmark discipline.",
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
    provider_runtime_notes: "Candidate provider metadata is bounded but not exact snapshot.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12-candidate",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: suiteId,
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Repo/terminal/CI candidate manifest.",
    domain_pack_id: "repo-ci-specialist-repo-ci-pack",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
  };
}

function makeComponentArtifactRef(): ArtifactRef {
  return {
    artifact_id: "repo-ci-release-bundle",
    artifact_type: "release_bundle",
    version: "2026.3.12",
    content_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    rights_state: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
    },
    created_at: "2026-03-12T12:02:00.000Z",
  };
}

describe("repo ci pilot assets", () => {
  it("builds a valid pilot domain pack", () => {
    const domainPack = buildRepoCiSeedDomainPack();
    assertValid(DomainPackSchema, "repo-ci-domain-pack", domainPack);
    expect(domainPack.task_taxonomy.map((task) => task.task_family_id)).toEqual(
      expect.arrayContaining([
        "repo_navigation",
        "tool_selection",
        "repair_loop",
        "ci_verification",
        "long_horizon_repo_workflow",
      ]),
    );
    expect(domainPack.tool_contracts.map((tool) => tool.tool_name)).toEqual([
      "read_file",
      "run_command",
      "write_file",
    ]);
  });

  it("builds valid atomic and episode benchmark seed suites", () => {
    const { atomicSuite, episodeSuite } = buildRepoCiSeedBenchmarkSuites();
    assertValid(AtomicBenchmarkSuiteRecordSchema, "repo-ci-atomic-suite", atomicSuite);
    assertValid(EpisodeBenchmarkSuiteRecordSchema, "repo-ci-episode-suite", episodeSuite);

    expect(atomicSuite.metadata.suite_hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(episodeSuite.metadata.suite_hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(atomicSuite.cases.map((testCase) => testCase.task_family)).toEqual(
      expect.arrayContaining([
        "repo_navigation",
        "tool_selection",
        "repair_loop",
        "ci_verification",
      ]),
    );
    expect(episodeSuite.cases.map((testCase) => testCase.task_family)).toEqual(
      expect.arrayContaining(["repair_loop", "long_horizon_repo_workflow"]),
    );
  });

  it("produces a compatible release decision from pilot benchmark inputs", async () => {
    const tempDir = await makeTempDir();
    const { atomicSuite } = buildRepoCiSeedBenchmarkSuites();
    const baselineManifest = assertValid(
      BaselineManifestSchema,
      "repo-ci-baseline-manifest",
      makeBaselineManifest(atomicSuite.metadata.benchmark_suite_id),
    );
    const candidateManifest = assertValid(
      CandidateManifestSchema,
      "repo-ci-candidate-manifest",
      makeCandidateManifest(atomicSuite.metadata.benchmark_suite_id),
    );
    const componentArtifactRef = assertValid(
      ArtifactRefSchema,
      "repo-ci-component-artifact-ref",
      makeComponentArtifactRef(),
    );

    const benchmarkResult = await runAtomicBenchmark({
      suite: atomicSuite,
      baselineManifest,
      candidateManifest,
      bootstrapSeed: 7,
      executeBaselineCase: async ({ evalCase }) => ({
        score: evalCase.task_family === "repair_loop" ? 0.4 : 0.5,
        hard_fail: false,
        latency_ms: 120,
        cost: 0.02,
        verifier_outcome: "approved",
        grader_version: "grader-repo-ci-task-success",
      }),
      executeCandidateCase: async ({ evalCase }) => ({
        score: evalCase.task_family === "repair_loop" ? 0.8 : 0.75,
        hard_fail: false,
        latency_ms: 125,
        cost: 0.025,
        verifier_outcome: "approved",
        grader_version: "grader-repo-ci-task-success",
      }),
    });
    const shadowResult = {
      ...benchmarkResult.summary,
      benchmark_result_id: `${benchmarkResult.summary.benchmark_result_id}-shadow`,
      mode: "live_shadow" as const,
    };
    const monitorDefinition = createPromotedReleaseMonitorDefinition({
      promotedReleaseId: "repo-ci-candidate-release",
      baselineManifestId: baselineManifest.baseline_manifest_id,
      candidateManifestId: candidateManifest.candidate_manifest_id,
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

    const baselineManifestPath = path.join(tempDir, "baseline.json");
    const candidateManifestPath = path.join(tempDir, "candidate.json");
    const benchmarkResultPath = path.join(tempDir, "benchmark-result.json");
    const shadowResultPath = path.join(tempDir, "shadow-result.json");
    const verifierMetricsPath = path.join(tempDir, "verifier-metrics.json");
    const monitorPath = path.join(tempDir, "promoted-monitor.json");
    const componentRefPath = path.join(tempDir, "component-artifact-ref.json");

    saveJsonFile(baselineManifestPath, baselineManifest);
    saveJsonFile(candidateManifestPath, candidateManifest);
    saveJsonFile(benchmarkResultPath, benchmarkResult.summary);
    saveJsonFile(shadowResultPath, shadowResult);
    saveJsonFile(verifierMetricsPath, {
      sample_count: 4,
      true_positive_rate: 0.75,
      false_positive_rate: 0.05,
      false_veto_rate: 0.02,
      pass_through_rate: 0.2,
      override_rate: 0.01,
      mean_latency_added_ms: 15,
      mean_cost_added: 0.001,
      total_cost_added: 0.004,
      counts: {
        true_positive: 3,
        false_positive: 0,
        false_veto: 0,
        pass_through: 1,
        overrides: 0,
      },
    });
    saveJsonFile(monitorPath, monitorDefinition);
    saveJsonFile(componentRefPath, componentArtifactRef);

    const runtime = {
      log: (_message: unknown) => {},
      error: (_message: unknown) => {},
      exit: (_code: number) => {},
    };
    const result: NicheReleaseResult = await nicheReleaseCommand(
      {
        baselineManifestPath,
        candidateManifestPath,
        benchmarkResultPaths: [benchmarkResultPath],
        shadowResultPaths: [shadowResultPath],
        verifierMetricsPath,
        monitorDefinitionPath: monitorPath,
        componentArtifactRefPaths: [componentRefPath],
        json: true,
      },
      runtime,
    );

    expect(result.promotion_controller.decision).toBe("promoted");
    expect(result.promotion_controller.candidate_release.benchmark_results).toHaveLength(1);
    expect(result.promoted_monitor.cadence_defaults.shadow_recheck_interval_hours).toBe(24);
  });
});
