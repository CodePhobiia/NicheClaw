import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nicheBenchmarkCommand } from "../../../src/commands/niche/benchmark.js";
import { nicheCompileCommand } from "../../../src/commands/niche/compile.js";
import { nicheCreateCommand } from "../../../src/commands/niche/create.js";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import {
  markNicheFinalEmission,
  maybeRunNicheVerifierGate,
  persistPreparedNicheRunArtifacts,
  recordActionProposalForRun,
  recordToolExecutionResult,
  recordToolExecutionStart,
  registerPreparedNicheRunTraceContext,
} from "../../../src/niche/runtime/index.js";
import { prepareNicheRunSeed } from "../../../src/niche/runtime/prepare-run-seed.js";
import type {
  ActiveNicheStackRecord,
  GuardDecision,
  PreparedNicheRunSeed,
} from "../../../src/niche/schema/index.js";
import {
  getBenchmarkResultRecord,
  getCandidateManifest,
  getBaselineManifest,
  getActiveNicheStackRecordForCandidateManifest,
  upsertActiveNicheStackRecord,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const hoisted = vi.hoisted(() => ({
  agentCommand: vi.fn(),
}));
const tempRoots: string[] = [];

vi.mock("../../../src/commands/agent.js", () => ({
  agentCommand: hoisted.agentCommand,
}));

vi.mock("../../../src/config/config.js", () => ({
  loadConfig: () => ({
    models: {
      providers: {
        openai: {
          models: [
            {
              id: "gpt-5",
              cost: {
                input: 1,
                output: 2,
                cacheRead: 0,
                cacheWrite: 0,
              },
            },
          ],
        },
      },
    },
  }),
}));

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-benchmark-runtime-"));
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

function makeProgramFile(dir: string): string {
  const programPath = path.join(dir, "niche-program.json");
  saveJsonFile(programPath, {
    niche_program_id: "repo-ci-specialist",
    name: "Repo CI Specialist",
    objective: "Improve repo and CI execution quality.",
    risk_class: "moderate",
    runtime_stack: {
      planner_runtime: {
        component_id: "planner-primary",
        provider: "openai",
        model_id: "gpt-5",
        api_mode: "responses",
      },
      retrieval_components: [],
      verifier_components: [],
      specialization_lanes: ["system_specialization"],
    },
    allowed_tools: ["read", "exec", "apply_patch"],
    allowed_sources: [
      {
        source_id: "repo-root",
        source_kind: "repos",
        description: "Primary repo.",
        access_pattern: "workspace",
      },
    ],
    success_metrics: [
      {
        metric_id: "task-success",
        label: "Task success",
        objective: "maximize",
        target_description: "Improve held-out task completion.",
        measurement_method: "benchmark grading",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "store approved sources",
      training_policy: "train only on approved sources",
      benchmark_policy: "keep eval sources held out",
      retention_policy: "retain according to governance policy",
      redaction_policy: "redact sensitive material first",
      pii_policy: "avoid unreviewed PII",
      live_trace_reuse_policy: "embargo live traces before reuse",
      operator_review_required: true,
    },
  });
  return programPath;
}

function makeSourceFiles(dir: string): string[] {
  const structuredPath = path.join(dir, "structured-source.json");
  const benchmarkSeedPath = path.join(dir, "benchmark-seed.json");
  saveJsonFile(structuredPath, {
    sourceId: "repo-source",
    sourceKind: "repos",
    inputKind: "structured_text",
    title: "Repo Source",
    text: "The repo requires grounded build and test verification before delivery.",
    accessPattern: "workspace",
    rights: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
      retention_policy: "retain",
      redaction_status: "clean",
      pii_status: "none",
      provenance_status: "verified",
      data_zone: "dev",
    },
    freshnessExpectation: "daily",
    trustNotes: "Approved repo guidance.",
  });
  saveJsonFile(benchmarkSeedPath, {
    sourceId: "benchmark-seed-source",
    sourceKind: "human_examples",
    inputKind: "benchmark_seed",
    title: "Benchmark Seed Source",
    prompt: "Reproduce the failing CI build and explain the root cause.",
    taskFamilyId: "ci-repair",
    passConditions: ["root cause found"],
    hardFailConditions: ["unsafe command use"],
    accessPattern: "seed",
    rights: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
      retention_policy: "retain",
      redaction_status: "clean",
      pii_status: "none",
      provenance_status: "verified",
      data_zone: "dev",
    },
  });
  const seedPath2 = path.join(dir, "benchmark-seed-2.json");
  saveJsonFile(seedPath2, {
    sourceId: "benchmark-seed-source-2",
    sourceKind: "human_examples",
    inputKind: "benchmark_seed",
    title: "Benchmark Seed Lint",
    prompt: "Verify the linter output and fix the flagged issues.",
    taskFamilyId: "lint-repair",
    passConditions: ["lint errors resolved"],
    hardFailConditions: ["introduced new errors"],
    accessPattern: "seed",
    rights: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
      retention_policy: "retain",
      redaction_status: "clean",
      pii_status: "none",
      provenance_status: "verified",
      data_zone: "dev",
    },
  });
  const seedPath3 = path.join(dir, "benchmark-seed-3.json");
  saveJsonFile(seedPath3, {
    sourceId: "benchmark-seed-source-3",
    sourceKind: "human_examples",
    inputKind: "benchmark_seed",
    title: "Benchmark Seed Test",
    prompt: "Write a regression test for the reported bug.",
    taskFamilyId: "test-authoring",
    passConditions: ["test covers bug scenario"],
    hardFailConditions: ["test does not compile"],
    accessPattern: "seed",
    rights: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
      retention_policy: "retain",
      redaction_status: "clean",
      pii_status: "none",
      provenance_status: "verified",
      data_zone: "dev",
    },
  });
  const constraintPath = path.join(dir, "domain-constraint.json");
  saveJsonFile(constraintPath, {
    sourceId: "constraint-source",
    sourceKind: "domain_constraints",
    inputKind: "structured_text",
    title: "Domain Constraint",
    text: "All repairs must be tested before delivery. Unsafe commands are forbidden.",
    accessPattern: "inline",
    rights: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
      retention_policy: "retain",
      redaction_status: "clean",
      pii_status: "none",
      provenance_status: "verified",
      data_zone: "dev",
    },
  });
  return [structuredPath, benchmarkSeedPath, seedPath2, seedPath3, constraintPath];
}

function makeBenchmarkSuite(dir: string): string {
  const suitePath = path.join(dir, "suite.json");
  saveJsonFile(suitePath, {
    metadata: {
      benchmark_suite_id: "repo-ci-live-suite",
      case_kind: "atomic_case",
      mode: "offline_gold",
      split: "gold_eval",
      created_at: "2026-03-13T12:00:00.000Z",
      suite_version: "2026.3.13",
      suite_hash: "0123456789abcdef0123456789abcdef",
      fixture_version: "2026.3.13-fixtures",
      determinism_policy_id: "determinism-v1",
      task_families: ["ci_repair"],
    },
    cases: [
      {
        eval_case_id: "eval-case-1",
        suite_id: "repo-ci-live-suite",
        split: "gold_eval",
        task_family: "ci_repair",
        input: { prompt: "Find the root cause and report it." },
        allowed_tools: ["read", "exec"],
        allowed_sources: ["repo-source"],
        grader_spec: {
          grader_refs: ["grader-task-success"],
          primary_metric: "task_success",
        },
        pass_conditions: ["root cause found"],
        hard_fail_conditions: ["unsafe command use"],
        difficulty: 1,
        seed: "seed-1",
      },
    ],
  });
  return suitePath;
}

function makeEpisodeBenchmarkSuite(dir: string): string {
  const suitePath = path.join(dir, "episode-suite.json");
  saveJsonFile(suitePath, {
    metadata: {
      benchmark_suite_id: "repo-ci-live-episode-suite",
      case_kind: "episode_case",
      mode: "offline_gold",
      split: "gold_eval",
      created_at: "2026-03-13T12:00:00.000Z",
      suite_version: "2026.3.13",
      suite_hash: "fedcba9876543210fedcba9876543210",
      fixture_version: "2026.3.13-fixtures",
      determinism_policy_id: "determinism-v1",
      task_families: ["ci_repair"],
    },
    cases: [
      {
        episode_case_id: "episode-case-1",
        suite_id: "repo-ci-live-episode-suite",
        split: "gold_eval",
        task_family: "ci_repair",
        initial_state: { branch: "feature/failing-build" },
        allowed_tools: ["read", "exec"],
        allowed_sources: ["repo-source"],
        step_constraints: ["no_unapproved_network"],
        termination_conditions: ["build passes"],
        grader_spec: {
          grader_refs: ["grader-task-success"],
          primary_metric: "task_success",
        },
        hard_fail_conditions: ["unsafe command use"],
        difficulty: 1,
        seed: "episode-seed-1",
      },
    ],
  });
  return suitePath;
}

function makeAllowedDecision(): GuardDecision {
  return {
    allowed: true,
    code: "allowed",
    reason: "tool allowed",
    violations: [],
  };
}

function makeActiveStackRecord(template: PreparedNicheRunSeed): ActiveNicheStackRecord {
  return {
    active_stack_id: "active-stack-candidate",
    niche_program_id: template.niche_program_id,
    candidate_manifest_id: "candidate-manifest-template",
    registered_at: "2026-03-13T12:10:00.000Z",
    release_mode: "live",
    run_seed_template: template,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.agentCommand.mockImplementation(
    async (opts: { runId: string; nicheRunSeed: PreparedNicheRunSeed }) => {
      registerPreparedNicheRunTraceContext({
        runId: opts.runId,
        seed: opts.nicheRunSeed,
      });
      recordActionProposalForRun(opts.runId, makeAllowedDecision(), {
        proposal_id: `${opts.runId}-proposal`,
        selected_tool: "exec",
        selected_reason: "Need to inspect the failure.",
        guard_decision: "allowed",
        selector_score: 1,
        candidate_rankings: [],
        attempt_index: 0,
      });
      recordToolExecutionStart({
        runId: opts.runId,
        toolCallId: `${opts.runId}-tool`,
        toolName: "exec",
        args: { command: "pnpm test:niche" },
      });
      recordToolExecutionResult({
        runId: opts.runId,
        toolCallId: `${opts.runId}-tool`,
        toolName: "exec",
        result: { ok: true, output: "tests passed" },
        isError: false,
      });
      maybeRunNicheVerifierGate({
        runId: opts.runId,
        payloads: [
          {
            text:
              opts.nicheRunSeed.manifest_kind === "baseline"
                ? "partial response"
                : "root cause found",
          },
        ],
        checkedAt: "2026-03-13T12:11:00.000Z",
      });
      markNicheFinalEmission(opts.runId, "2026-03-13T12:11:01.000Z");
      persistPreparedNicheRunArtifacts({
        runId: opts.runId,
        nicheRunSeed: opts.nicheRunSeed,
        sessionId: `benchmark-${opts.runId}`,
        resultMeta: {
          durationMs: 1000,
          agentMeta: {
            sessionId: `benchmark-${opts.runId}`,
            provider: "openai",
            model: "gpt-5",
            usage: {
              input: 100,
              output: 40,
              total: 140,
            },
          },
        },
        deliveredPayloads: [
          {
            text:
              opts.nicheRunSeed.manifest_kind === "baseline"
                ? "partial response"
                : "root cause found",
          },
        ],
        emittedToUser: false,
        deliveredAt: "2026-03-13T12:11:01.000Z",
        env: process.env,
      });
      return {
        payloads: [
          {
            text:
              opts.nicheRunSeed.manifest_kind === "baseline"
                ? "partial response"
                : "root cause found",
          },
        ],
        meta: {
          agentMeta: {
            provider: "openai",
            model: "gpt-5",
          },
        },
      };
    },
  );
});

describe("niche benchmark live runtime authority", () => {
  it("executes benchmark arms through the real runtime substrate and persists durable evidence", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      const sourcePaths = makeSourceFiles(dir);
      const suitePath = makeBenchmarkSuite(dir);

      await nicheCreateCommand({ programPath, json: false });
      const compiled = await nicheCompileCommand({
        nicheProgramId: "repo-ci-specialist",
        sourcePaths,
        version: "compile-v1",
        compiledAt: "2026-03-13T12:00:00.000Z",
        json: false,
      });

      const baselineManifest = {
        baseline_manifest_id: "baseline-manifest-template",
        niche_program_id: "repo-ci-specialist",
        created_at: "2026-03-13T12:01:00.000Z",
        planner_runtime: {
          component_id: "planner-primary",
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
        capability_snapshot_at: "2026-03-13T12:01:00.000Z",
        provider_metadata_quality: "exact_snapshot",
        sampling_config: { temperature: 0.2 },
        prompt_asset_version: "prompt-v1",
        grader_set_version: "grader-set-v1",
        benchmark_suite_id: "repo-ci-live-suite",
        source_access_manifest_id:
          compiled.compilation.source_access_manifest.source_access_manifest_id,
        retry_policy: { max_attempts: 1 },
        token_budget: { max_total_tokens: 8000 },
        context_budget: { max_context_tokens: 16000 },
        execution_mode: "benchmark",
        tool_catalog_version: "tool-catalog-v1",
        tool_allowlist: ["read", "exec"],
        tool_contract_version: "tool-contract-v1",
        retrieval_config: { policy: "baseline" },
        verifier_config: { pack: "verifier-v1" },
      };
      const candidateManifest = {
        candidate_manifest_id: "candidate-manifest-template",
        based_on_baseline_manifest_id: "baseline-manifest-template",
        niche_program_id: "repo-ci-specialist",
        created_at: "2026-03-13T12:01:00.000Z",
        planner_runtime: {
          component_id: "planner-primary",
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
        capability_snapshot_at: "2026-03-13T12:01:00.000Z",
        provider_metadata_quality: "exact_snapshot",
        sampling_config: { temperature: 0.2 },
        prompt_asset_version: "prompt-v2",
        grader_set_version: "grader-set-v1",
        benchmark_suite_id: "repo-ci-live-suite",
        source_access_manifest_id:
          compiled.compilation.source_access_manifest.source_access_manifest_id,
        retry_policy: { max_attempts: 1 },
        token_budget: { max_total_tokens: 8000 },
        context_budget: { max_context_tokens: 16000 },
        execution_mode: "benchmark",
        domain_pack_id: compiled.compilation.domain_pack.domain_pack_id,
        action_policy_id: "action-policy-v1",
        retrieval_stack_id: "retrieval-stack-v1",
        verifier_pack_id: "verifier-pack-v1",
        tool_catalog_version: "tool-catalog-v1",
        tool_allowlist: ["read", "exec"],
        tool_contract_version: "tool-contract-v1",
        retrieval_config: { policy: "baseline" },
        verifier_config: { pack: "verifier-v1" },
        optional_student_model_ids: [],
        candidate_recipe: "candidate-recipe-v1",
      };
      const baselineManifestPath = path.join(dir, "baseline.json");
      const candidateManifestPath = path.join(dir, "candidate.json");
      saveJsonFile(baselineManifestPath, baselineManifest);
      saveJsonFile(candidateManifestPath, candidateManifest);

      const candidateTemplateSeed = prepareNicheRunSeed({
        manifest_kind: "candidate",
        manifest: candidateManifest,
        domain_pack: compiled.compilation.domain_pack,
        source_access_manifest: compiled.compilation.source_access_manifest,
        action_policy_runtime: {
          allowed_tools: ["read", "exec"],
        },
        verifier_pack_id: "verifier-pack-v1",
        verifier_pack_version: "verifier-pack-v1",
        mode: "live",
        runtime_snapshot_id: "candidate-runtime-template",
        context_bundle_id: "candidate-context-template",
        determinism_policy_id: "determinism-v1",
        random_seed: "seed-template",
        replayability_status: "non_replayable",
        determinism_notes: "Candidate runtime template.",
        readiness_report_id: compiled.compilation.readiness_report.readiness_report_id,
      });
      upsertActiveNicheStackRecord(makeActiveStackRecord(candidateTemplateSeed), process.env);

      const result = await nicheBenchmarkCommand({
        live: true,
        baselineManifestPath,
        candidateManifestPath,
        suitePath,
        json: false,
      });

      const storedRecord = getBenchmarkResultRecord(result.benchmark_result_record_id, process.env);
      const baselineRuntimeId = path.basename(result.baseline_runtime_manifest_path ?? "", ".json");
      const candidateRuntimeId = path.basename(
        result.candidate_runtime_manifest_path ?? "",
        ".json",
      );

      expect(result.input_mode).toBe("live_runtime");
      expect(result.authority_mode).toBe("promotion_authoritative");
      expect(result.baseline_runtime_manifest_path).toBeTruthy();
      expect(result.candidate_runtime_manifest_path).toBeTruthy();
      expect(storedRecord?.run_trace_refs.length).toBeGreaterThan(0);
      expect(storedRecord?.replay_bundle_refs.length).toBeGreaterThan(0);
      expect(storedRecord?.evidence_bundle_ids.length).toBeGreaterThan(0);
      expect(getBaselineManifest(baselineRuntimeId, process.env)?.baseline_manifest_id).toBe(
        storedRecord?.baseline_manifest_id,
      );
      expect(getCandidateManifest(candidateRuntimeId, process.env)?.candidate_manifest_id).toBe(
        storedRecord?.candidate_manifest_id,
      );
      expect(
        getActiveNicheStackRecordForCandidateManifest("candidate-manifest-template", process.env),
      ).not.toBeNull();
    });
  });

  it("executes live episode benchmarks through the runtime substrate", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      const sourcePaths = makeSourceFiles(dir);
      const suitePath = makeEpisodeBenchmarkSuite(dir);

      await nicheCreateCommand({ programPath, json: false });
      const compiled = await nicheCompileCommand({
        nicheProgramId: "repo-ci-specialist",
        sourcePaths,
        version: "compile-v1",
        compiledAt: "2026-03-13T12:00:00.000Z",
        json: false,
      });

      const baselineManifest = {
        baseline_manifest_id: "baseline-manifest-template",
        niche_program_id: "repo-ci-specialist",
        created_at: "2026-03-13T12:01:00.000Z",
        planner_runtime: {
          component_id: "planner-primary",
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
        capability_snapshot_at: "2026-03-13T12:01:00.000Z",
        provider_metadata_quality: "exact_snapshot",
        sampling_config: { temperature: 0.2 },
        prompt_asset_version: "prompt-v1",
        grader_set_version: "grader-set-v1",
        benchmark_suite_id: "repo-ci-live-episode-suite",
        source_access_manifest_id:
          compiled.compilation.source_access_manifest.source_access_manifest_id,
        retry_policy: { max_attempts: 1 },
        token_budget: { max_total_tokens: 8000 },
        context_budget: { max_context_tokens: 16000 },
        execution_mode: "benchmark",
        tool_catalog_version: "tool-catalog-v1",
        tool_allowlist: ["read", "exec"],
        tool_contract_version: "tool-contract-v1",
        retrieval_config: { policy: "baseline" },
        verifier_config: { pack: "verifier-v1" },
      };
      const candidateManifest = {
        candidate_manifest_id: "candidate-manifest-template",
        based_on_baseline_manifest_id: "baseline-manifest-template",
        niche_program_id: "repo-ci-specialist",
        created_at: "2026-03-13T12:01:00.000Z",
        planner_runtime: {
          component_id: "planner-primary",
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
        capability_snapshot_at: "2026-03-13T12:01:00.000Z",
        provider_metadata_quality: "exact_snapshot",
        sampling_config: { temperature: 0.2 },
        prompt_asset_version: "prompt-v2",
        grader_set_version: "grader-set-v1",
        benchmark_suite_id: "repo-ci-live-episode-suite",
        source_access_manifest_id:
          compiled.compilation.source_access_manifest.source_access_manifest_id,
        retry_policy: { max_attempts: 1 },
        token_budget: { max_total_tokens: 8000 },
        context_budget: { max_context_tokens: 16000 },
        execution_mode: "benchmark",
        domain_pack_id: compiled.compilation.domain_pack.domain_pack_id,
        action_policy_id: "action-policy-v1",
        retrieval_stack_id: "retrieval-stack-v1",
        verifier_pack_id: "verifier-pack-v1",
        tool_catalog_version: "tool-catalog-v1",
        tool_allowlist: ["read", "exec"],
        tool_contract_version: "tool-contract-v1",
        retrieval_config: { policy: "baseline" },
        verifier_config: { pack: "verifier-v1" },
        optional_student_model_ids: [],
        candidate_recipe: "candidate-recipe-v1",
      };
      const baselineManifestPath = path.join(dir, "baseline-episode.json");
      const candidateManifestPath = path.join(dir, "candidate-episode.json");
      saveJsonFile(baselineManifestPath, baselineManifest);
      saveJsonFile(candidateManifestPath, candidateManifest);

      const candidateTemplateSeed = prepareNicheRunSeed({
        manifest_kind: "candidate",
        manifest: candidateManifest,
        domain_pack: compiled.compilation.domain_pack,
        source_access_manifest: compiled.compilation.source_access_manifest,
        action_policy_runtime: {
          allowed_tools: ["read", "exec"],
        },
        verifier_pack_id: "verifier-pack-v1",
        verifier_pack_version: "verifier-pack-v1",
        mode: "live",
        runtime_snapshot_id: "candidate-runtime-template",
        context_bundle_id: "candidate-context-template",
        determinism_policy_id: "determinism-v1",
        random_seed: "seed-template",
        replayability_status: "non_replayable",
        determinism_notes: "Candidate runtime template.",
        readiness_report_id: compiled.compilation.readiness_report.readiness_report_id,
      });
      upsertActiveNicheStackRecord(makeActiveStackRecord(candidateTemplateSeed), process.env);

      const result = await nicheBenchmarkCommand({
        live: true,
        baselineManifestPath,
        candidateManifestPath,
        suitePath,
        json: false,
      });

      const storedRecord = getBenchmarkResultRecord(result.benchmark_result_record_id, process.env);
      expect(result.input_mode).toBe("live_runtime");
      expect(result.authority_mode).toBe("promotion_authoritative");
      expect(result.suite_case_kind).toBe("episode_case");
      expect(storedRecord?.summary.case_kind).toBe("episode_case");
      expect(storedRecord?.run_trace_refs.length).toBeGreaterThan(0);
      expect(storedRecord?.replay_bundle_refs.length).toBeGreaterThan(0);
      expect(storedRecord?.evidence_bundle_ids.length).toBeGreaterThan(0);
    });
  });
});
