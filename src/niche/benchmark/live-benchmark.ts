import { agentCommand } from "../../commands/agent.js";
import { prepareNicheRunSeed } from "../runtime/prepare-run-seed.js";
import {
  type BaselineManifest,
  type CandidateManifest,
  type BenchmarkArmIdentifier,
  type EpisodeCase,
  type PreparedNicheActionPolicyRuntime,
  type PreparedNicheRunSeed,
} from "../schema/index.js";
import {
  ensureStoredBaselineManifest,
  ensureStoredCandidateManifest,
  getActiveNicheStackRecordForCandidateManifest,
  getLatestNicheCompilationRecordForProgram,
  getReplayBundleForTrace,
  queryRunTraces,
} from "../store/index.js";
import {
  runAtomicBenchmark,
  type AtomicCaseExecutionResult,
  type AtomicBenchmarkRunResult,
} from "./atomic-runner.js";
import {
  runEpisodeBenchmark,
  type EpisodeBenchmarkRunResult,
  type EpisodeCaseExecutionResult,
  type EpisodeBenchmarkSuiteRecord,
} from "./episode-runner.js";
import { computeEnvironmentSnapshotHash, computeStableContentHash } from "./fixture-versioning.js";
import { getGraderArtifact } from "./grader-registry.js";
import {
  createBenchmarkArm,
  getBenchmarkArm,
  type AtomicBenchmarkSuiteRecord,
} from "./suite-registry.js";

export function detectBenchmarkContamination(params: {
  cases: Array<{ split?: string; task_family?: string }>;
  compilationSourceFamilies: string[];
}): boolean {
  if (params.compilationSourceFamilies.length === 0) return false;
  const trainFamilies = new Set(params.compilationSourceFamilies);
  return params.cases.some(
    (c) =>
      (c.split === "gold_eval" || c.split === "hidden_eval") &&
      c.task_family !== undefined &&
      trainFamilies.has(c.task_family),
  );
}

type LiveAtomicExecutionEvidence = {
  actualManifest: BaselineManifest | CandidateManifest;
  actualManifestPath: string;
  traceId: string;
  replayBundleId?: string;
  evidenceBundleIds: string[];
  execution: AtomicCaseExecutionResult;
};

function buildBenchmarkArmIdentifier(params: {
  suiteId: string;
  manifestId: string;
  armKind: "baseline" | "candidate";
  mode: BenchmarkArmIdentifier["mode"];
}): BenchmarkArmIdentifier {
  const armHash = computeStableContentHash({
    suiteId: params.suiteId,
    manifestId: params.manifestId,
    armKind: params.armKind,
    mode: params.mode,
  }).slice(0, 24);
  return {
    benchmark_arm_id: `benchmark-arm-${params.armKind}-${armHash}`,
    benchmark_suite_id: params.suiteId,
    manifest_id: params.manifestId,
    arm_kind: params.armKind,
    mode: params.mode,
  };
}

function ensureStoredBenchmarkArmIdentifier(arm: BenchmarkArmIdentifier): BenchmarkArmIdentifier {
  const existing = getBenchmarkArm(arm.benchmark_arm_id, process.env);
  if (!existing) {
    createBenchmarkArm(arm, process.env);
    return arm;
  }
  if (JSON.stringify(existing) !== JSON.stringify(arm)) {
    throw new Error(
      `Benchmark arm ${arm.benchmark_arm_id} is already stored with different metadata.`,
    );
  }
  return existing;
}

function assertCompilationRecordForBenchmark(nicheProgramId: string) {
  const compilation = getLatestNicheCompilationRecordForProgram(nicheProgramId, process.env);
  if (!compilation) {
    throw new Error(
      `No stored compilation record exists for ${nicheProgramId}. Run openclaw niche compile first.`,
    );
  }
  return compilation;
}

function resolveCasePrompt(input: unknown): string {
  if (typeof input === "string" && input.trim()) {
    return input.trim();
  }
  if (input && typeof input === "object" && "prompt" in input) {
    const prompt = (input as { prompt?: unknown }).prompt;
    if (typeof prompt === "string" && prompt.trim()) {
      return prompt.trim();
    }
  }
  return JSON.stringify(input);
}

function normalizeConditionPhrase(value: string): string {
  return value.replace(/[_-]+/g, " ").toLowerCase();
}

function summarizePayloadText(payloads: Array<{ text?: string }>): string {
  return payloads
    .map((payload) => payload.text?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

function buildEvidenceBundleRefs(params: {
  allowedSourceIds: string[];
  compilation: ReturnType<typeof assertCompilationRecordForBenchmark>;
  query: string;
}): PreparedNicheRunSeed["evidence_bundle_refs"] {
  const allowedSources = params.compilation.normalized_sources.filter((source) =>
    params.allowedSourceIds.includes(source.sourceId),
  );
  const selectedSources =
    allowedSources.length > 0 ? allowedSources : params.compilation.normalized_sources;
  return [
    {
      evidence_bundle_id: `evidence-bundle-${computeStableContentHash({
        allowed_sources: selectedSources.map((source) => source.sourceId),
        query: params.query,
      }).slice(0, 16)}`,
      source_refs: selectedSources.map((source) => ({
        source_id: source.sourceId,
        source_hash_or_ref: computeStableContentHash(source.provenance),
      })),
      retrieval_query: params.query,
      reranker_output: selectedSources.map((source) => source.sourceId),
      delivered_evidence: selectedSources.map((source) => source.normalizedContent.slice(0, 240)),
    },
  ];
}

function buildEnvironmentSnapshot(): PreparedNicheRunSeed["environment_snapshot"] {
  const snapshot = {
    platform: process.platform,
    cwd: process.cwd(),
  };
  return {
    environment_hash: computeEnvironmentSnapshotHash(snapshot),
    platform: process.platform,
    notes: "Live benchmark runtime host snapshot.",
  };
}

function buildGenericActionPolicyRuntime(allowedTools: string[]): PreparedNicheActionPolicyRuntime {
  return {
    allowed_tools: [...allowedTools].toSorted((left, right) => left.localeCompare(right)),
  };
}

function buildSyntheticPreparedSeed(params: {
  manifest: BaselineManifest | CandidateManifest;
  manifestKind: "baseline" | "candidate";
  suite: AtomicBenchmarkSuiteRecord;
  arm: BenchmarkArmIdentifier;
  evalCase: AtomicBenchmarkSuiteRecord["cases"][number];
}): PreparedNicheRunSeed {
  const candidateManifest =
    params.manifestKind === "candidate" ? (params.manifest as CandidateManifest) : undefined;
  const compilation = assertCompilationRecordForBenchmark(params.manifest.niche_program_id);
  if (
    compilation.source_access_manifest.source_access_manifest_id !==
    params.manifest.source_access_manifest_id
  ) {
    throw new Error(
      `Manifest ${"baseline_manifest_id" in params.manifest ? params.manifest.baseline_manifest_id : params.manifest.candidate_manifest_id} does not match the latest compiled source access manifest ${compilation.source_access_manifest.source_access_manifest_id}.`,
    );
  }

  const candidateActiveStack = candidateManifest
    ? getActiveNicheStackRecordForCandidateManifest(
        candidateManifest.candidate_manifest_id,
        process.env,
      )
    : null;

  if (candidateActiveStack) {
    const template = structuredClone(candidateActiveStack.run_seed_template);
    return {
      ...template,
      seed_id: `benchmark-seed-${computeStableContentHash({
        arm: params.arm.benchmark_arm_id,
        case: params.evalCase.eval_case_id,
      }).slice(0, 20)}`,
      prepared_at: new Date().toISOString(),
      mode: "benchmark",
      benchmark_suite_id: params.suite.metadata.benchmark_suite_id,
      benchmark_arm_id: params.arm.benchmark_arm_id,
      benchmark_case_ref: {
        case_kind: "atomic_case",
        case_id: params.evalCase.eval_case_id,
      },
      suite_hash: params.suite.metadata.suite_hash,
      fixture_version: params.suite.metadata.fixture_version,
      environment_snapshot: buildEnvironmentSnapshot(),
      replayability_status: "replayable",
      determinism_policy_id: params.suite.metadata.determinism_policy_id,
      random_seed: params.evalCase.seed,
      evidence_bundle_refs: buildEvidenceBundleRefs({
        compilation,
        allowedSourceIds: params.evalCase.allowed_sources,
        query: resolveCasePrompt(params.evalCase.input),
      }),
      artifact_refs: [
        ...compilation.source_artifact_refs,
        compilation.compiled_domain_pack_artifact_ref,
      ],
      domain_pack: compilation.domain_pack,
      source_access_manifest: compilation.source_access_manifest,
      readiness_report_id: compilation.readiness_report.readiness_report_id,
    };
  }

  return prepareNicheRunSeed({
    manifest_kind: params.manifestKind,
    manifest: params.manifest,
    domain_pack: compilation.domain_pack,
    source_access_manifest: compilation.source_access_manifest,
    action_policy_runtime: buildGenericActionPolicyRuntime(params.manifest.tool_allowlist),
    verifier_pack_id: candidateManifest
      ? candidateManifest.verifier_pack_id
      : `baseline-verifier-${computeStableContentHash(params.manifest.verifier_config).slice(0, 12)}`,
    verifier_pack_version: candidateManifest
      ? `candidate-verifier-${computeStableContentHash(params.manifest.verifier_config).slice(0, 12)}`
      : `baseline-verifier-${computeStableContentHash(params.manifest.verifier_config).slice(0, 12)}`,
    mode: "benchmark",
    runtime_snapshot_id: `runtime-snapshot-${params.arm.benchmark_arm_id}`,
    context_bundle_id: `context-bundle-${params.arm.benchmark_arm_id}`,
    determinism_policy_id: params.suite.metadata.determinism_policy_id,
    random_seed: params.evalCase.seed,
    replayability_status: "replayable",
    determinism_notes: `Live benchmark execution for ${params.arm.benchmark_arm_id}.`,
    readiness_report_id: compilation.readiness_report.readiness_report_id,
    planner_version_id: params.manifest.planner_runtime.component_id,
    action_policy_version_id: candidateManifest
      ? candidateManifest.action_policy_id
      : `baseline-action-policy-${computeStableContentHash(params.manifest.tool_allowlist).slice(0, 12)}`,
    verifier_pack_version_id: candidateManifest
      ? candidateManifest.verifier_pack_id
      : `baseline-verifier-${computeStableContentHash(params.manifest.verifier_config).slice(0, 12)}`,
    retrieval_stack_version_id: candidateManifest
      ? candidateManifest.retrieval_stack_id
      : `baseline-retrieval-${computeStableContentHash(params.manifest.retrieval_config).slice(0, 12)}`,
    grader_set_version_id: params.manifest.grader_set_version,
    artifact_refs: [
      ...compilation.source_artifact_refs,
      compilation.compiled_domain_pack_artifact_ref,
    ],
    evidence_bundle_refs: buildEvidenceBundleRefs({
      compilation,
      allowedSourceIds: params.evalCase.allowed_sources,
      query: resolveCasePrompt(params.evalCase.input),
    }),
    benchmark_suite_id: params.suite.metadata.benchmark_suite_id,
    benchmark_arm_id: params.arm.benchmark_arm_id,
    benchmark_case_ref: {
      case_kind: "atomic_case",
      case_id: params.evalCase.eval_case_id,
    },
    suite_hash: params.suite.metadata.suite_hash,
    fixture_version: params.suite.metadata.fixture_version,
    environment_snapshot: buildEnvironmentSnapshot(),
  });
}

function buildRuntimeDerivedManifest(params: {
  manifestKind: "baseline" | "candidate";
  manifestTemplate: BaselineManifest | CandidateManifest;
  runSeed: PreparedNicheRunSeed;
  actualProvider: string;
  actualModel: string;
  benchmarkSuiteId: string;
}): BaselineManifest | CandidateManifest {
  const manifestTimestamp = params.manifestTemplate.created_at;
  const hash = computeStableContentHash({
    manifest_kind: params.manifestKind,
    benchmark_suite_id: params.benchmarkSuiteId,
    actual_provider: params.actualProvider,
    actual_model: params.actualModel,
    baseline_or_candidate_manifest_id: params.runSeed.baseline_or_candidate_manifest_id,
    runtime_snapshot_id: params.runSeed.runtime_snapshot_id,
    context_bundle_id: params.runSeed.context_bundle_id,
  }).slice(0, 16);
  const commonFields = {
    niche_program_id: params.manifestTemplate.niche_program_id,
    created_at: manifestTimestamp,
    planner_runtime: {
      ...params.manifestTemplate.planner_runtime,
      provider: params.actualProvider,
      model_id: params.actualModel,
    },
    provider: params.actualProvider,
    model_id: params.actualModel,
    model_snapshot_id: params.manifestTemplate.model_snapshot_id,
    api_mode: params.manifestTemplate.api_mode,
    provider_release_label: params.manifestTemplate.provider_release_label ?? params.actualModel,
    api_revision: params.manifestTemplate.api_revision,
    capability_snapshot_at: manifestTimestamp,
    routing_proxy_version: params.manifestTemplate.routing_proxy_version,
    provider_metadata_quality: params.manifestTemplate.provider_metadata_quality,
    provider_runtime_notes:
      params.manifestTemplate.provider_runtime_notes ??
      "Runtime-derived from live benchmark execution.",
    sampling_config: params.manifestTemplate.sampling_config,
    prompt_asset_version: params.manifestTemplate.prompt_asset_version,
    grader_set_version: params.manifestTemplate.grader_set_version,
    benchmark_suite_id: params.benchmarkSuiteId,
    source_access_manifest_id: params.runSeed.source_access_manifest.source_access_manifest_id,
    retry_policy: params.manifestTemplate.retry_policy,
    token_budget: params.manifestTemplate.token_budget,
    context_budget: params.manifestTemplate.context_budget,
    execution_mode: "benchmark",
    notes: "Runtime-derived from live benchmark execution.",
    tool_catalog_version:
      "tool_catalog_version" in params.manifestTemplate
        ? params.manifestTemplate.tool_catalog_version
        : params.runSeed.action_policy_version_id,
    tool_allowlist: [...params.runSeed.action_policy_runtime.allowed_tools],
    tool_contract_version:
      "tool_contract_version" in params.manifestTemplate
        ? params.manifestTemplate.tool_contract_version
        : params.runSeed.action_policy_version_id,
    retrieval_config:
      "retrieval_config" in params.manifestTemplate
        ? params.manifestTemplate.retrieval_config
        : { retrieval_stack_id: params.runSeed.retrieval_stack_version_id },
    verifier_config:
      "verifier_config" in params.manifestTemplate
        ? params.manifestTemplate.verifier_config
        : {
            verifier_pack_id: params.runSeed.verifier_pack_config.verifier_pack_id,
            version: params.runSeed.verifier_pack_config.version,
          },
  };

  if (params.manifestKind === "baseline") {
    return {
      baseline_manifest_id: `baseline-runtime-${hash}`,
      ...commonFields,
    };
  }
  const template = params.manifestTemplate as CandidateManifest;
  return {
    candidate_manifest_id: `candidate-runtime-${hash}`,
    based_on_baseline_manifest_id: template.based_on_baseline_manifest_id,
    ...commonFields,
    domain_pack_id: params.runSeed.domain_pack_id,
    action_policy_id: params.runSeed.action_policy_version_id,
    retrieval_stack_id: params.runSeed.retrieval_stack_version_id,
    verifier_pack_id: params.runSeed.verifier_pack_version_id,
    optional_student_model_ids: template.optional_student_model_ids,
    candidate_recipe: template.candidate_recipe,
  };
}

function buildAtomicExecutionResult(params: {
  payloads: Array<{ text?: string }>;
  runTrace: ReturnType<typeof queryRunTraces>[number];
  graderVersion: string;
  passConditions: string[];
  hardFailConditions: string[];
  graderRefs?: string[];
  env?: NodeJS.ProcessEnv;
}): AtomicCaseExecutionResult {
  const payloadText = summarizePayloadText(params.payloads).toLowerCase();

  // Attempt grader-registry-based evaluation when grader refs are available.
  // Falls back to substring matching when no registered grader is found.
  let graderUsed = "fallback_substring_match";
  if (params.graderRefs?.length) {
    try {
      const graderRecord = getGraderArtifact(params.graderRefs[0], params.env);
      if (graderRecord?.grader_type === "deterministic_rule") {
        // Deterministic rule graders use the same pass/fail logic but are versioned and auditable
        graderUsed = `registry:${params.graderRefs[0]}`;
      }
    } catch {
      // Fall through to substring matching
    }
  }

  const passHits = params.passConditions.filter((condition) =>
    payloadText.includes(normalizeConditionPhrase(condition)),
  ).length;
  const hardFail =
    params.hardFailConditions.some((condition) =>
      payloadText.includes(normalizeConditionPhrase(condition)),
    ) || params.runTrace.verifier_decisions.some((decision) => decision.outcome === "vetoed");
  return {
    score: hardFail
      ? 0
      : params.passConditions.length === 0
        ? 1
        : passHits / params.passConditions.length,
    hard_fail: hardFail,
    latency_ms: params.runTrace.latency.end_to_end_ms,
    cost: params.runTrace.cost?.total_cost ?? 0,
    verifier_outcome: params.runTrace.verifier_decisions.at(-1)?.outcome ?? "approved",
    grader_version: params.graderVersion,
    grader_used: graderUsed,
  };
}

async function executePreparedSeedCase(params: {
  runId: string;
  message: string;
  seed: PreparedNicheRunSeed;
}): Promise<{
  payloads: Array<{ text?: string }>;
  actualProvider: string;
  actualModel: string;
  runTrace: ReturnType<typeof queryRunTraces>[number];
  replayBundleId?: string;
}> {
  const result = await agentCommand({
    message: params.message,
    sessionId: `benchmark-${params.runId}`,
    runId: params.runId,
    nicheRunSeed: params.seed,
  });
  const runTrace = queryRunTraces({ runId: params.runId }, process.env)[0];
  if (!runTrace) {
    throw new Error(`No persisted run trace was captured for benchmark run ${params.runId}.`);
  }
  const replayBundle = getReplayBundleForTrace(runTrace.trace_id, process.env);
  return {
    payloads: result.payloads ?? [],
    actualProvider: result.meta.agentMeta?.provider ?? "openclaw",
    actualModel: result.meta.agentMeta?.model ?? "unknown",
    runTrace,
    replayBundleId: replayBundle?.replay_bundle_id,
  };
}

function buildEpisodePrompt(episodeCase: EpisodeCase): string {
  return [
    "Run this long-horizon workflow episode through the real runtime path.",
    `Initial state: ${JSON.stringify(episodeCase.initial_state)}`,
    `Step constraints: ${episodeCase.step_constraints.join("; ")}`,
    `Termination conditions: ${episodeCase.termination_conditions.join("; ")}`,
  ].join("\n");
}

function buildEpisodeExecutionResult(params: {
  payloads: Array<{ text?: string }>;
  runTrace: ReturnType<typeof queryRunTraces>[number];
  graderVersion: string;
  episodeCase: EpisodeCase;
}): EpisodeCaseExecutionResult {
  const payloadText = summarizePayloadText(params.payloads).toLowerCase();
  const hardFail =
    params.episodeCase.hard_fail_conditions.some((condition) =>
      payloadText.includes(normalizeConditionPhrase(condition)),
    ) || params.runTrace.verifier_decisions.some((decision) => decision.outcome === "vetoed");
  const terminationHits = params.episodeCase.termination_conditions.filter((condition) =>
    payloadText.includes(normalizeConditionPhrase(condition)),
  ).length;
  const toolCalls = params.runTrace.tool_calls;
  const stepCount = Math.max(1, toolCalls.length);
  const stepLatency = Math.round(params.runTrace.latency.tool_ms / stepCount);
  const stepCost = (params.runTrace.cost?.total_cost ?? 0) / stepCount;
  const stepResults =
    toolCalls.length > 0
      ? toolCalls.map((toolCall, index) => ({
          step_index: index,
          score: toolCall.status === "completed" ? 1 / stepCount : 0,
          success: toolCall.status === "completed",
          hard_fail: toolCall.status === "failed",
          latency_ms: stepLatency,
          cost: stepCost,
          tool_misuse: false,
          verifier_intervention: params.runTrace.verifier_decisions.some(
            (decision) => decision.outcome !== "approved",
          ),
          recovery_used: index > 0,
          notes: toolCall.output_summary ?? toolCall.error_summary,
        }))
      : [
          {
            step_index: 0,
            score: hardFail ? 0 : 1,
            success: !hardFail,
            hard_fail: hardFail,
            latency_ms: params.runTrace.latency.end_to_end_ms,
            cost: params.runTrace.cost?.total_cost ?? 0,
            tool_misuse: false,
            verifier_intervention: params.runTrace.verifier_decisions.some(
              (decision) => decision.outcome !== "approved",
            ),
            recovery_used: false,
            notes: params.runTrace.final_output?.content_summary,
          },
        ];

  return {
    total_score: hardFail
      ? 0
      : params.episodeCase.termination_conditions.length === 0
        ? 1
        : terminationHits / params.episodeCase.termination_conditions.length,
    success: !hardFail && terminationHits === params.episodeCase.termination_conditions.length,
    hard_fail: hardFail,
    step_results: stepResults,
    verifier_outcome: params.runTrace.verifier_decisions.at(-1)?.outcome ?? "approved",
    grader_version: params.graderVersion,
    retry_count: params.runTrace.failure_labels.filter((label) => label.includes("retry")).length,
    memory_effect_summary: params.runTrace.determinism_notes,
  };
}

export async function runLiveAtomicBenchmark(params: {
  suite: AtomicBenchmarkSuiteRecord;
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  baselineArm: BenchmarkArmIdentifier;
  candidateArm: BenchmarkArmIdentifier;
  bootstrapSeed?: number;
}): Promise<{
  result: AtomicBenchmarkRunResult;
  baselineRuntimeManifest: BaselineManifest;
  baselineRuntimeManifestPath: string;
  candidateRuntimeManifest: CandidateManifest;
  candidateRuntimeManifestPath: string;
  runTraceRefs: string[];
  replayBundleRefs: string[];
  evidenceBundleIds: string[];
}> {
  let baselineRuntimeManifest: BaselineManifest | undefined;
  let candidateRuntimeManifest: CandidateManifest | undefined;
  let baselineRuntimeManifestPath: string | undefined;
  let candidateRuntimeManifestPath: string | undefined;
  const runTraceRefs = new Set<string>();
  const replayBundleRefs = new Set<string>();
  const evidenceBundleIds = new Set<string>();

  const compilation = assertCompilationRecordForBenchmark(params.baselineManifest.niche_program_id);
  const compilationSourceFamilies = [
    ...new Set(compilation.benchmark_seed_hints.map((hint) => hint.taskFamilyId)),
  ];
  const contaminationDetected = detectBenchmarkContamination({
    cases: params.suite.cases,
    compilationSourceFamilies,
  });

  const result = await runAtomicBenchmark({
    suite: params.suite,
    baselineManifest: params.baselineManifest,
    candidateManifest: params.candidateManifest,
    baselineArm: params.baselineArm,
    candidateArm: params.candidateArm,
    bootstrapSeed: params.bootstrapSeed,
    contaminationDetected,
    actualSuiteHash: params.suite.metadata.suite_hash,
    actualFixtureVersion: params.suite.metadata.fixture_version,
    actualGraderVersion: params.suite.cases[0]?.grader_spec.grader_refs[0] ?? "unknown",
    executeBaselineCase: async ({ evalCase }) => {
      const seed = buildSyntheticPreparedSeed({
        manifest: params.baselineManifest,
        manifestKind: "baseline",
        suite: params.suite,
        arm: params.baselineArm,
        evalCase,
      });
      const execution = await executePreparedSeedCase({
        runId: `benchmark-${params.baselineArm.benchmark_arm_id}-${evalCase.eval_case_id}`,
        message: resolveCasePrompt(evalCase.input),
        seed,
      });
      const runtimeManifest = buildRuntimeDerivedManifest({
        manifestKind: "baseline",
        manifestTemplate: params.baselineManifest,
        runSeed: seed,
        actualProvider: execution.actualProvider,
        actualModel: execution.actualModel,
        benchmarkSuiteId: params.suite.metadata.benchmark_suite_id,
      }) as BaselineManifest;
      const storedManifest = ensureStoredBaselineManifest(runtimeManifest, process.env);
      baselineRuntimeManifest ??= storedManifest.manifest;
      baselineRuntimeManifestPath ??= storedManifest.path;
      runTraceRefs.add(execution.runTrace.trace_id);
      if (execution.replayBundleId) {
        replayBundleRefs.add(execution.replayBundleId);
      }
      execution.runTrace.evidence_bundle_refs.forEach((bundle) =>
        evidenceBundleIds.add(bundle.evidence_bundle_id),
      );
      return buildAtomicExecutionResult({
        payloads: execution.payloads,
        runTrace: execution.runTrace,
        graderVersion: evalCase.grader_spec.grader_refs[0] ?? "unknown",
        passConditions: evalCase.pass_conditions,
        hardFailConditions: evalCase.hard_fail_conditions,
      });
    },
    executeCandidateCase: async ({ evalCase }) => {
      const seed = buildSyntheticPreparedSeed({
        manifest: params.candidateManifest,
        manifestKind: "candidate",
        suite: params.suite,
        arm: params.candidateArm,
        evalCase,
      });
      const execution = await executePreparedSeedCase({
        runId: `benchmark-${params.candidateArm.benchmark_arm_id}-${evalCase.eval_case_id}`,
        message: resolveCasePrompt(evalCase.input),
        seed,
      });
      const runtimeManifest = buildRuntimeDerivedManifest({
        manifestKind: "candidate",
        manifestTemplate: params.candidateManifest,
        runSeed: seed,
        actualProvider: execution.actualProvider,
        actualModel: execution.actualModel,
        benchmarkSuiteId: params.suite.metadata.benchmark_suite_id,
      }) as CandidateManifest;
      const storedManifest = ensureStoredCandidateManifest(runtimeManifest, process.env);
      candidateRuntimeManifest ??= storedManifest.manifest;
      candidateRuntimeManifestPath ??= storedManifest.path;
      runTraceRefs.add(execution.runTrace.trace_id);
      if (execution.replayBundleId) {
        replayBundleRefs.add(execution.replayBundleId);
      }
      execution.runTrace.evidence_bundle_refs.forEach((bundle) =>
        evidenceBundleIds.add(bundle.evidence_bundle_id),
      );
      return buildAtomicExecutionResult({
        payloads: execution.payloads,
        runTrace: execution.runTrace,
        graderVersion: evalCase.grader_spec.grader_refs[0] ?? "unknown",
        passConditions: evalCase.pass_conditions,
        hardFailConditions: evalCase.hard_fail_conditions,
      });
    },
  });

  if (!baselineRuntimeManifest || !baselineRuntimeManifestPath) {
    throw new Error("Live benchmark did not produce a persisted baseline runtime manifest.");
  }
  if (!candidateRuntimeManifest || !candidateRuntimeManifestPath) {
    throw new Error("Live benchmark did not produce a persisted candidate runtime manifest.");
  }

  const baselineRuntimeArm = ensureStoredBenchmarkArmIdentifier(
    buildBenchmarkArmIdentifier({
      suiteId: params.suite.metadata.benchmark_suite_id,
      manifestId: baselineRuntimeManifest.baseline_manifest_id,
      armKind: "baseline",
      mode: params.suite.metadata.mode,
    }),
  );
  const candidateRuntimeArm = ensureStoredBenchmarkArmIdentifier(
    buildBenchmarkArmIdentifier({
      suiteId: params.suite.metadata.benchmark_suite_id,
      manifestId: candidateRuntimeManifest.candidate_manifest_id,
      armKind: "candidate",
      mode: params.suite.metadata.mode,
    }),
  );

  return {
    result: {
      ...result,
      summary: {
        ...result.summary,
        baseline_arm_id: baselineRuntimeArm.benchmark_arm_id,
        candidate_arm_id: candidateRuntimeArm.benchmark_arm_id,
        baseline_provider_metadata_quality: baselineRuntimeManifest.provider_metadata_quality,
        candidate_provider_metadata_quality: candidateRuntimeManifest.provider_metadata_quality,
      },
    },
    baselineRuntimeManifest,
    baselineRuntimeManifestPath,
    candidateRuntimeManifest,
    candidateRuntimeManifestPath,
    runTraceRefs: [...runTraceRefs].toSorted((left, right) => left.localeCompare(right)),
    replayBundleRefs: [...replayBundleRefs].toSorted((left, right) => left.localeCompare(right)),
    evidenceBundleIds: [...evidenceBundleIds].toSorted((left, right) => left.localeCompare(right)),
  };
}

export async function runLiveEpisodeBenchmark(params: {
  suite: EpisodeBenchmarkSuiteRecord;
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  baselineArm: BenchmarkArmIdentifier;
  candidateArm: BenchmarkArmIdentifier;
  bootstrapSeed?: number;
}): Promise<{
  result: EpisodeBenchmarkRunResult;
  baselineRuntimeManifest: BaselineManifest;
  baselineRuntimeManifestPath: string;
  candidateRuntimeManifest: CandidateManifest;
  candidateRuntimeManifestPath: string;
  runTraceRefs: string[];
  replayBundleRefs: string[];
  evidenceBundleIds: string[];
}> {
  let baselineRuntimeManifest: BaselineManifest | undefined;
  let candidateRuntimeManifest: CandidateManifest | undefined;
  let baselineRuntimeManifestPath: string | undefined;
  let candidateRuntimeManifestPath: string | undefined;
  const runTraceRefs = new Set<string>();
  const replayBundleRefs = new Set<string>();
  const evidenceBundleIds = new Set<string>();

  const episodeCompilation = assertCompilationRecordForBenchmark(
    params.baselineManifest.niche_program_id,
  );
  const episodeCompilationSourceFamilies = [
    ...new Set(episodeCompilation.benchmark_seed_hints.map((hint) => hint.taskFamilyId)),
  ];
  const episodeContaminationDetected = detectBenchmarkContamination({
    cases: params.suite.cases,
    compilationSourceFamilies: episodeCompilationSourceFamilies,
  });

  const result = await runEpisodeBenchmark({
    suite: params.suite,
    baselineManifest: params.baselineManifest,
    candidateManifest: params.candidateManifest,
    baselineArm: params.baselineArm,
    candidateArm: params.candidateArm,
    bootstrapSeed: params.bootstrapSeed,
    contaminationDetected: episodeContaminationDetected,
    actualSuiteHash: params.suite.metadata.suite_hash,
    actualFixtureVersion: params.suite.metadata.fixture_version,
    actualGraderVersion: params.suite.cases[0]?.grader_spec.grader_refs[0] ?? "unknown",
    executeBaselineCase: async ({ episodeCase }) => {
      const seed = buildSyntheticPreparedSeed({
        manifest: params.baselineManifest,
        manifestKind: "baseline",
        suite: params.suite as unknown as AtomicBenchmarkSuiteRecord,
        arm: params.baselineArm,
        evalCase: {
          eval_case_id: episodeCase.episode_case_id,
          input: buildEpisodePrompt(episodeCase),
          allowed_sources: episodeCase.allowed_sources,
          seed: episodeCase.seed,
          hard_fail_conditions: episodeCase.hard_fail_conditions,
          pass_conditions: episodeCase.termination_conditions,
        } as AtomicBenchmarkSuiteRecord["cases"][number],
      });
      const execution = await executePreparedSeedCase({
        runId: `benchmark-${params.baselineArm.benchmark_arm_id}-${episodeCase.episode_case_id}`,
        message: buildEpisodePrompt(episodeCase),
        seed,
      });
      const runtimeManifest = buildRuntimeDerivedManifest({
        manifestKind: "baseline",
        manifestTemplate: params.baselineManifest,
        runSeed: seed,
        actualProvider: execution.actualProvider,
        actualModel: execution.actualModel,
        benchmarkSuiteId: params.suite.metadata.benchmark_suite_id,
      }) as BaselineManifest;
      const storedManifest = ensureStoredBaselineManifest(runtimeManifest, process.env);
      baselineRuntimeManifest ??= storedManifest.manifest;
      baselineRuntimeManifestPath ??= storedManifest.path;
      runTraceRefs.add(execution.runTrace.trace_id);
      if (execution.replayBundleId) {
        replayBundleRefs.add(execution.replayBundleId);
      }
      execution.runTrace.evidence_bundle_refs.forEach((bundle) =>
        evidenceBundleIds.add(bundle.evidence_bundle_id),
      );
      return buildEpisodeExecutionResult({
        payloads: execution.payloads,
        runTrace: execution.runTrace,
        graderVersion: episodeCase.grader_spec.grader_refs[0] ?? "unknown",
        episodeCase,
      });
    },
    executeCandidateCase: async ({ episodeCase }) => {
      const seed = buildSyntheticPreparedSeed({
        manifest: params.candidateManifest,
        manifestKind: "candidate",
        suite: params.suite as unknown as AtomicBenchmarkSuiteRecord,
        arm: params.candidateArm,
        evalCase: {
          eval_case_id: episodeCase.episode_case_id,
          input: buildEpisodePrompt(episodeCase),
          allowed_sources: episodeCase.allowed_sources,
          seed: episodeCase.seed,
          hard_fail_conditions: episodeCase.hard_fail_conditions,
          pass_conditions: episodeCase.termination_conditions,
        } as AtomicBenchmarkSuiteRecord["cases"][number],
      });
      const execution = await executePreparedSeedCase({
        runId: `benchmark-${params.candidateArm.benchmark_arm_id}-${episodeCase.episode_case_id}`,
        message: buildEpisodePrompt(episodeCase),
        seed,
      });
      const runtimeManifest = buildRuntimeDerivedManifest({
        manifestKind: "candidate",
        manifestTemplate: params.candidateManifest,
        runSeed: seed,
        actualProvider: execution.actualProvider,
        actualModel: execution.actualModel,
        benchmarkSuiteId: params.suite.metadata.benchmark_suite_id,
      }) as CandidateManifest;
      const storedManifest = ensureStoredCandidateManifest(runtimeManifest, process.env);
      candidateRuntimeManifest ??= storedManifest.manifest;
      candidateRuntimeManifestPath ??= storedManifest.path;
      runTraceRefs.add(execution.runTrace.trace_id);
      if (execution.replayBundleId) {
        replayBundleRefs.add(execution.replayBundleId);
      }
      execution.runTrace.evidence_bundle_refs.forEach((bundle) =>
        evidenceBundleIds.add(bundle.evidence_bundle_id),
      );
      return buildEpisodeExecutionResult({
        payloads: execution.payloads,
        runTrace: execution.runTrace,
        graderVersion: episodeCase.grader_spec.grader_refs[0] ?? "unknown",
        episodeCase,
      });
    },
  });

  if (!baselineRuntimeManifest || !baselineRuntimeManifestPath) {
    throw new Error("Live benchmark did not produce a persisted baseline runtime manifest.");
  }
  if (!candidateRuntimeManifest || !candidateRuntimeManifestPath) {
    throw new Error("Live benchmark did not produce a persisted candidate runtime manifest.");
  }

  const baselineRuntimeArm = ensureStoredBenchmarkArmIdentifier(
    buildBenchmarkArmIdentifier({
      suiteId: params.suite.metadata.benchmark_suite_id,
      manifestId: baselineRuntimeManifest.baseline_manifest_id,
      armKind: "baseline",
      mode: params.suite.metadata.mode,
    }),
  );
  const candidateRuntimeArm = ensureStoredBenchmarkArmIdentifier(
    buildBenchmarkArmIdentifier({
      suiteId: params.suite.metadata.benchmark_suite_id,
      manifestId: candidateRuntimeManifest.candidate_manifest_id,
      armKind: "candidate",
      mode: params.suite.metadata.mode,
    }),
  );

  return {
    result: {
      ...result,
      summary: {
        ...result.summary,
        baseline_arm_id: baselineRuntimeArm.benchmark_arm_id,
        candidate_arm_id: candidateRuntimeArm.benchmark_arm_id,
        baseline_provider_metadata_quality: baselineRuntimeManifest.provider_metadata_quality,
        candidate_provider_metadata_quality: candidateRuntimeManifest.provider_metadata_quality,
      },
    },
    baselineRuntimeManifest,
    baselineRuntimeManifestPath,
    candidateRuntimeManifest,
    candidateRuntimeManifestPath,
    runTraceRefs: [...runTraceRefs].toSorted((left, right) => left.localeCompare(right)),
    replayBundleRefs: [...replayBundleRefs].toSorted((left, right) => left.localeCompare(right)),
    evidenceBundleIds: [...evidenceBundleIds].toSorted((left, right) => left.localeCompare(right)),
  };
}
