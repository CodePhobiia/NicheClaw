import { AtomicCaseExecutionResultSchema } from "../../niche/benchmark/atomic-runner.js";
import {
  EpisodeBenchmarkSuiteRecordSchema,
  computeStableContentHash,
  createBenchmarkArm,
  getBenchmarkArm,
  EpisodeCaseExecutionResultSchema,
  runLiveAtomicBenchmark,
  runLiveEpisodeBenchmark,
  runAtomicBenchmark,
  runEpisodeBenchmark,
  type AtomicBenchmarkRunResult,
  type AtomicBenchmarkSuiteRecord,
  type AtomicCaseExecutionResult,
  type EpisodeBenchmarkRunResult,
  type EpisodeBenchmarkSuiteRecord,
  type EpisodeCaseExecutionResult,
} from "../../niche/benchmark/index.js";
import { AtomicBenchmarkSuiteRecordSchema } from "../../niche/benchmark/suite-registry.js";
import { resolveSpecializationReadiness } from "../../niche/domain/index.js";
import { readRequiredJsonFileStrict } from "../../niche/json.js";
import {
  BaselineManifestSchema,
  type BenchmarkResultRecord,
  CandidateManifestSchema,
  EpisodeCaseSchema,
  type BenchmarkArmIdentifier,
  type BaselineManifest,
  type CandidateManifest,
} from "../../niche/schema/index.js";
import {
  resolveCompilationArtifacts,
  resolveManifestArtifacts,
  writeBenchmarkResultRecord,
} from "../../niche/store/index.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type NicheBenchmarkOptions = {
  baselineManifestPath?: string;
  candidateManifestPath?: string;
  suitePath: string;
  baselineExecutionPath?: string;
  candidateExecutionPath?: string;
  live?: boolean;
  bootstrapSeed?: number;
  contaminationDetected?: boolean;
  actualSuiteHash?: string;
  actualFixtureVersion?: string;
  actualGraderVersion?: string;
  readinessReportPath?: string;
  nicheProgramId?: string;
  json?: boolean;
};

export type NicheBenchmarkCommandResult = {
  input_mode: "typed_execution_bundle" | "live_runtime";
  authority_mode: "legacy_non_authoritative" | "promotion_authoritative";
  suite_case_kind: "atomic_case" | "episode_case";
  baseline_arm: BenchmarkArmIdentifier;
  candidate_arm: BenchmarkArmIdentifier;
  suite_hash: string;
  fixture_version: string;
  benchmark_result_record_id: string;
  benchmark_result_record_path: string;
  baseline_runtime_manifest_path?: string;
  candidate_runtime_manifest_path?: string;
  result: AtomicBenchmarkRunResult | EpisodeBenchmarkRunResult;
};

type ExecutionLookup<T> = Record<string, T>;

function validateValue<T>(
  schema: Record<string, unknown>,
  cacheKey: string,
  value: T,
  label: string,
): T {
  const validation = validateJsonSchemaValue({
    schema,
    cacheKey,
    value,
  });
  if (validation.ok) {
    return value;
  }
  const details = validation.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid ${label}: ${details}`);
}

function loadManifest<T extends BaselineManifest | CandidateManifest>(params: {
  pathname: string;
  schema: Record<string, unknown>;
  cacheKey: string;
  label: string;
}): T {
  return validateValue(
    params.schema,
    params.cacheKey,
    readRequiredJsonFileStrict(params.pathname) as T,
    params.label,
  );
}

function loadAtomicSuite(pathname: string): AtomicBenchmarkSuiteRecord {
  const suite = validateValue(
    AtomicBenchmarkSuiteRecordSchema,
    "niche-cli-benchmark-atomic-suite",
    readRequiredJsonFileStrict(pathname) as AtomicBenchmarkSuiteRecord,
    "atomic benchmark suite",
  );
  if (suite.metadata.case_kind !== "atomic_case") {
    throw new Error(`Atomic benchmark suite must declare case_kind=atomic_case: ${pathname}`);
  }
  return suite;
}

function loadEpisodeSuite(pathname: string): EpisodeBenchmarkSuiteRecord {
  const suite = validateValue(
    EpisodeBenchmarkSuiteRecordSchema,
    "niche-cli-benchmark-episode-suite",
    readRequiredJsonFileStrict(pathname) as EpisodeBenchmarkSuiteRecord,
    "episode benchmark suite",
  );
  if (suite.metadata.case_kind !== "episode_case") {
    throw new Error(`Episode benchmark suite must declare case_kind=episode_case: ${pathname}`);
  }
  for (const episodeCase of suite.cases) {
    validateValue(
      EpisodeCaseSchema,
      `niche-cli-benchmark-episode-case-${episodeCase.episode_case_id}`,
      episodeCase,
      `episode case ${episodeCase.episode_case_id}`,
    );
  }
  return suite;
}

function normalizeExecutionLookup<T>(raw: unknown, label: string): ExecutionLookup<T> {
  if (raw && typeof raw === "object" && "cases" in raw) {
    const cases = (raw as { cases?: unknown }).cases;
    if (cases && typeof cases === "object" && !Array.isArray(cases)) {
      return cases as ExecutionLookup<T>;
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as ExecutionLookup<T>;
  }
  throw new Error(`Invalid ${label}: expected a JSON object keyed by case id.`);
}

function loadAtomicExecutions(pathname: string): ExecutionLookup<AtomicCaseExecutionResult> {
  const lookup = normalizeExecutionLookup<AtomicCaseExecutionResult>(
    readRequiredJsonFileStrict(pathname),
    "atomic execution bundle",
  );
  for (const [caseId, result] of Object.entries(lookup)) {
    validateValue(
      AtomicCaseExecutionResultSchema,
      `niche-cli-benchmark-atomic-result-${caseId}`,
      result,
      `atomic execution result ${caseId}`,
    );
  }
  return lookup;
}

function loadEpisodeExecutions(pathname: string): ExecutionLookup<EpisodeCaseExecutionResult> {
  const lookup = normalizeExecutionLookup<EpisodeCaseExecutionResult>(
    readRequiredJsonFileStrict(pathname),
    "episode execution bundle",
  );
  for (const [caseId, result] of Object.entries(lookup)) {
    validateValue(
      EpisodeCaseExecutionResultSchema,
      `niche-cli-benchmark-episode-result-${caseId}`,
      result,
      `episode execution result ${caseId}`,
    );
  }
  return lookup;
}

function buildBenchmarkArm(params: {
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

function ensureStoredBenchmarkArm(arm: BenchmarkArmIdentifier): BenchmarkArmIdentifier {
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

function formatBenchmarkSummary(result: NicheBenchmarkCommandResult): string {
  const summary = result.result.summary;
  const lines = [
    `Niche benchmark completed for suite ${summary.benchmark_suite_id}.`,
    `Input mode: ${result.input_mode}`,
    `Authority: ${result.authority_mode}`,
    `Case kind: ${result.suite_case_kind}`,
    `Mode: ${summary.mode}`,
    `Suite hash: ${result.suite_hash}`,
    `Fixture version: ${result.fixture_version}`,
    `Provider metadata quality: baseline=${summary.baseline_provider_metadata_quality}, candidate=${summary.candidate_provider_metadata_quality}`,
    `Stored benchmark record: ${result.benchmark_result_record_id}`,
    `Case count: ${summary.case_count}`,
    `Mean delta: ${summary.paired_delta_summary.mean_delta.toFixed(4)}`,
    `Confidence interval: ${summary.paired_delta_summary.confidence_interval_low.toFixed(4)} .. ${summary.paired_delta_summary.confidence_interval_high.toFixed(4)}`,
    `Invalidated: ${summary.invalidated ? "yes" : "no"}`,
  ];
  if (result.baseline_runtime_manifest_path && result.candidate_runtime_manifest_path) {
    lines.push(`Baseline runtime manifest: ${result.baseline_runtime_manifest_path}`);
    lines.push(`Candidate runtime manifest: ${result.candidate_runtime_manifest_path}`);
  }
  if (summary.invalidation_reasons.length > 0) {
    lines.push(`Invalidation reasons: ${summary.invalidation_reasons.join("; ")}`);
  }
  return lines.join("\n");
}

function computeCaseMembershipHash(params: {
  caseKind: NicheBenchmarkCommandResult["suite_case_kind"];
  caseIds: string[];
}): string {
  return computeStableContentHash({
    case_kind: params.caseKind,
    case_ids: [...params.caseIds].toSorted((left, right) => left.localeCompare(right)),
  });
}

function persistBenchmarkResultRecord(params: {
  summary: AtomicBenchmarkRunResult["summary"] | EpisodeBenchmarkRunResult["summary"];
  baselineManifestId: string;
  candidateManifestId: string;
  baselineTemplateManifestId: string;
  candidateTemplateManifestId: string;
  suiteHash: string;
  fixtureVersion: string;
  actualSuiteHash: string;
  actualFixtureVersion: string;
  actualGraderVersion?: string;
  caseMembershipHash: string;
  runTraceRefs?: string[];
  replayBundleRefs?: string[];
  evidenceBundleIds?: string[];
}): { recordId: string; recordPath: string } {
  const record: BenchmarkResultRecord = {
    benchmark_result_record_id: `benchmark-result-record-${computeStableContentHash({
      benchmark_result_id: params.summary.benchmark_result_id,
      baseline_manifest_id: params.baselineManifestId,
      candidate_manifest_id: params.candidateManifestId,
      actual_suite_hash: params.actualSuiteHash,
      actual_fixture_version: params.actualFixtureVersion,
      case_membership_hash: params.caseMembershipHash,
    }).slice(0, 24)}`,
    summary: params.summary,
    baseline_manifest_id: params.baselineManifestId,
    candidate_manifest_id: params.candidateManifestId,
    baseline_template_manifest_id: params.baselineTemplateManifestId,
    candidate_template_manifest_id: params.candidateTemplateManifestId,
    suite_hash: params.suiteHash,
    fixture_version: params.fixtureVersion,
    actual_suite_hash: params.actualSuiteHash,
    actual_fixture_version: params.actualFixtureVersion,
    actual_grader_version: params.actualGraderVersion,
    case_membership_hash: params.caseMembershipHash,
    run_trace_refs: params.runTraceRefs ?? [],
    replay_bundle_refs: params.replayBundleRefs ?? [],
    evidence_bundle_ids: params.evidenceBundleIds ?? [],
    created_at: new Date().toISOString(),
  };
  return {
    recordId: record.benchmark_result_record_id,
    recordPath: writeBenchmarkResultRecord(record, process.env),
  };
}

export async function nicheBenchmarkCommand(
  opts: NicheBenchmarkOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NicheBenchmarkCommandResult> {
  // Resolve manifest and readiness paths from the program store when --from-program is given
  const nicheProgramId = opts.nicheProgramId;
  if (nicheProgramId) {
    if (!opts.baselineManifestPath || !opts.candidateManifestPath) {
      const manifests = resolveManifestArtifacts(nicheProgramId, process.env);
      if (!opts.baselineManifestPath) {
        opts = { ...opts, baselineManifestPath: manifests.baselineManifestPath };
      }
      if (!opts.candidateManifestPath) {
        opts = { ...opts, candidateManifestPath: manifests.candidateManifestPath };
      }
    }
    if (!opts.readinessReportPath) {
      const compilation = resolveCompilationArtifacts(nicheProgramId, process.env);
      opts = { ...opts, readinessReportPath: compilation.readinessReportPath };
    }
  }
  if (!opts.baselineManifestPath) {
    throw new Error(
      "--baseline-manifest is required (or use --from-program to resolve it automatically).",
    );
  }
  if (!opts.candidateManifestPath) {
    throw new Error(
      "--candidate-manifest is required (or use --from-program to resolve it automatically).",
    );
  }
  if (!opts.live && (!opts.baselineExecutionPath || !opts.candidateExecutionPath)) {
    throw new Error(
      "Pass --live for real runtime execution, or provide both --baseline-execution and --candidate-execution.",
    );
  }
  const baselineManifest = loadManifest<BaselineManifest>({
    pathname: opts.baselineManifestPath,
    schema: BaselineManifestSchema,
    cacheKey: "niche-cli-benchmark-baseline-manifest",
    label: "baseline manifest",
  });
  const candidateManifest = loadManifest<CandidateManifest>({
    pathname: opts.candidateManifestPath,
    schema: CandidateManifestSchema,
    cacheKey: "niche-cli-benchmark-candidate-manifest",
    label: "candidate manifest",
  });
  resolveSpecializationReadiness({
    nicheProgramId: candidateManifest.niche_program_id,
    readinessReportPath: opts.readinessReportPath,
    env: process.env,
  });

  const suiteRaw = readRequiredJsonFileStrict(opts.suitePath) as {
    metadata?: { case_kind?: string };
  };
  if (opts.live) {
    if (suiteRaw.metadata?.case_kind === "episode_case") {
      const suite = loadEpisodeSuite(opts.suitePath);
      const baselineArm = ensureStoredBenchmarkArm(
        buildBenchmarkArm({
          suiteId: suite.metadata.benchmark_suite_id,
          manifestId: baselineManifest.baseline_manifest_id,
          armKind: "baseline",
          mode: suite.metadata.mode,
        }),
      );
      const candidateArm = ensureStoredBenchmarkArm(
        buildBenchmarkArm({
          suiteId: suite.metadata.benchmark_suite_id,
          manifestId: candidateManifest.candidate_manifest_id,
          armKind: "candidate",
          mode: suite.metadata.mode,
        }),
      );
      const live = await runLiveEpisodeBenchmark({
        suite,
        baselineManifest,
        candidateManifest,
        baselineArm,
        candidateArm,
        bootstrapSeed: opts.bootstrapSeed,
      });
      const persistedRecord = persistBenchmarkResultRecord({
        summary: live.result.summary,
        baselineManifestId: live.baselineRuntimeManifest.baseline_manifest_id,
        candidateManifestId: live.candidateRuntimeManifest.candidate_manifest_id,
        baselineTemplateManifestId: baselineManifest.baseline_manifest_id,
        candidateTemplateManifestId: candidateManifest.candidate_manifest_id,
        suiteHash: suite.metadata.suite_hash,
        fixtureVersion: suite.metadata.fixture_version,
        actualSuiteHash: suite.metadata.suite_hash,
        actualFixtureVersion: suite.metadata.fixture_version,
        actualGraderVersion: suite.cases[0]?.grader_spec.grader_refs[0],
        caseMembershipHash: computeCaseMembershipHash({
          caseKind: "episode_case",
          caseIds: suite.cases.map((episodeCase) => episodeCase.episode_case_id),
        }),
        runTraceRefs: live.runTraceRefs,
        replayBundleRefs: live.replayBundleRefs,
        evidenceBundleIds: live.evidenceBundleIds,
      });
      const commandResult: NicheBenchmarkCommandResult = {
        input_mode: "live_runtime",
        authority_mode: "promotion_authoritative",
        suite_case_kind: "episode_case",
        baseline_arm: baselineArm,
        candidate_arm: candidateArm,
        suite_hash: suite.metadata.suite_hash,
        fixture_version: suite.metadata.fixture_version,
        benchmark_result_record_id: persistedRecord.recordId,
        benchmark_result_record_path: persistedRecord.recordPath,
        baseline_runtime_manifest_path: live.baselineRuntimeManifestPath,
        candidate_runtime_manifest_path: live.candidateRuntimeManifestPath,
        result: live.result,
      };
      runtime.log(
        opts.json ? JSON.stringify(commandResult, null, 2) : formatBenchmarkSummary(commandResult),
      );
      return commandResult;
    }
    const suite = loadAtomicSuite(opts.suitePath);
    const baselineArm = ensureStoredBenchmarkArm(
      buildBenchmarkArm({
        suiteId: suite.metadata.benchmark_suite_id,
        manifestId: baselineManifest.baseline_manifest_id,
        armKind: "baseline",
        mode: suite.metadata.mode,
      }),
    );
    const candidateArm = ensureStoredBenchmarkArm(
      buildBenchmarkArm({
        suiteId: suite.metadata.benchmark_suite_id,
        manifestId: candidateManifest.candidate_manifest_id,
        armKind: "candidate",
        mode: suite.metadata.mode,
      }),
    );
    const live = await runLiveAtomicBenchmark({
      suite,
      baselineManifest,
      candidateManifest,
      baselineArm,
      candidateArm,
      bootstrapSeed: opts.bootstrapSeed,
    });
    const persistedRecord = persistBenchmarkResultRecord({
      summary: live.result.summary,
      baselineManifestId: live.baselineRuntimeManifest.baseline_manifest_id,
      candidateManifestId: live.candidateRuntimeManifest.candidate_manifest_id,
      baselineTemplateManifestId: baselineManifest.baseline_manifest_id,
      candidateTemplateManifestId: candidateManifest.candidate_manifest_id,
      suiteHash: suite.metadata.suite_hash,
      fixtureVersion: suite.metadata.fixture_version,
      actualSuiteHash: suite.metadata.suite_hash,
      actualFixtureVersion: suite.metadata.fixture_version,
      actualGraderVersion: suite.cases[0]?.grader_spec.grader_refs[0],
      caseMembershipHash: computeCaseMembershipHash({
        caseKind: "atomic_case",
        caseIds: suite.cases.map((evalCase) => evalCase.eval_case_id),
      }),
      runTraceRefs: live.runTraceRefs,
      replayBundleRefs: live.replayBundleRefs,
      evidenceBundleIds: live.evidenceBundleIds,
    });
    const commandResult: NicheBenchmarkCommandResult = {
      input_mode: "live_runtime",
      authority_mode: "promotion_authoritative",
      suite_case_kind: "atomic_case",
      baseline_arm: baselineArm,
      candidate_arm: candidateArm,
      suite_hash: suite.metadata.suite_hash,
      fixture_version: suite.metadata.fixture_version,
      benchmark_result_record_id: persistedRecord.recordId,
      benchmark_result_record_path: persistedRecord.recordPath,
      baseline_runtime_manifest_path: live.baselineRuntimeManifestPath,
      candidate_runtime_manifest_path: live.candidateRuntimeManifestPath,
      result: live.result,
    };
    runtime.log(
      opts.json ? JSON.stringify(commandResult, null, 2) : formatBenchmarkSummary(commandResult),
    );
    return commandResult;
  }

  if (suiteRaw.metadata?.case_kind === "episode_case") {
    const suite = loadEpisodeSuite(opts.suitePath);
    const baselineArm = ensureStoredBenchmarkArm(
      buildBenchmarkArm({
        suiteId: suite.metadata.benchmark_suite_id,
        manifestId: baselineManifest.baseline_manifest_id,
        armKind: "baseline",
        mode: suite.metadata.mode,
      }),
    );
    const candidateArm = ensureStoredBenchmarkArm(
      buildBenchmarkArm({
        suiteId: suite.metadata.benchmark_suite_id,
        manifestId: candidateManifest.candidate_manifest_id,
        armKind: "candidate",
        mode: suite.metadata.mode,
      }),
    );
    const baselineExecutions = loadEpisodeExecutions(opts.baselineExecutionPath!);
    const candidateExecutions = loadEpisodeExecutions(opts.candidateExecutionPath!);
    const result = await runEpisodeBenchmark({
      suite,
      baselineManifest,
      candidateManifest,
      baselineArm,
      candidateArm,
      executeBaselineCase: async ({ episodeCase }) => {
        const execution = baselineExecutions[episodeCase.episode_case_id];
        if (!execution) {
          throw new Error(
            `Missing baseline episode execution result for ${episodeCase.episode_case_id}.`,
          );
        }
        return execution;
      },
      executeCandidateCase: async ({ episodeCase }) => {
        const execution = candidateExecutions[episodeCase.episode_case_id];
        if (!execution) {
          throw new Error(
            `Missing candidate episode execution result for ${episodeCase.episode_case_id}.`,
          );
        }
        return execution;
      },
      bootstrapSeed: opts.bootstrapSeed,
      contaminationDetected: opts.contaminationDetected ?? false,
      actualSuiteHash: opts.actualSuiteHash ?? suite.metadata.suite_hash,
      actualFixtureVersion: opts.actualFixtureVersion ?? suite.metadata.fixture_version,
      actualGraderVersion: opts.actualGraderVersion ?? suite.cases[0]?.grader_spec.grader_refs[0] ?? "unknown",
    });
    const persistedRecord = persistBenchmarkResultRecord({
      summary: result.summary,
      baselineManifestId: baselineManifest.baseline_manifest_id,
      candidateManifestId: candidateManifest.candidate_manifest_id,
      baselineTemplateManifestId: baselineManifest.baseline_manifest_id,
      candidateTemplateManifestId: candidateManifest.candidate_manifest_id,
      suiteHash: suite.metadata.suite_hash,
      fixtureVersion: suite.metadata.fixture_version,
      actualSuiteHash: opts.actualSuiteHash ?? suite.metadata.suite_hash,
      actualFixtureVersion: opts.actualFixtureVersion ?? suite.metadata.fixture_version,
      actualGraderVersion: opts.actualGraderVersion,
      caseMembershipHash: computeCaseMembershipHash({
        caseKind: "episode_case",
        caseIds: suite.cases.map((episodeCase) => episodeCase.episode_case_id),
      }),
    });
    const commandResult: NicheBenchmarkCommandResult = {
      input_mode: "typed_execution_bundle",
      authority_mode: "legacy_non_authoritative",
      suite_case_kind: "episode_case",
      baseline_arm: baselineArm,
      candidate_arm: candidateArm,
      suite_hash: suite.metadata.suite_hash,
      fixture_version: suite.metadata.fixture_version,
      benchmark_result_record_id: persistedRecord.recordId,
      benchmark_result_record_path: persistedRecord.recordPath,
      result,
    };
    runtime.log(
      opts.json ? JSON.stringify(commandResult, null, 2) : formatBenchmarkSummary(commandResult),
    );
    return commandResult;
  }

  const suite = loadAtomicSuite(opts.suitePath);
  const baselineArm = ensureStoredBenchmarkArm(
    buildBenchmarkArm({
      suiteId: suite.metadata.benchmark_suite_id,
      manifestId: baselineManifest.baseline_manifest_id,
      armKind: "baseline",
      mode: suite.metadata.mode,
    }),
  );
  const candidateArm = ensureStoredBenchmarkArm(
    buildBenchmarkArm({
      suiteId: suite.metadata.benchmark_suite_id,
      manifestId: candidateManifest.candidate_manifest_id,
      armKind: "candidate",
      mode: suite.metadata.mode,
    }),
  );
  const baselineExecutions = loadAtomicExecutions(opts.baselineExecutionPath!);
  const candidateExecutions = loadAtomicExecutions(opts.candidateExecutionPath!);
  const result = await runAtomicBenchmark({
    suite,
    baselineManifest,
    candidateManifest,
    baselineArm,
    candidateArm,
    executeBaselineCase: async ({ evalCase }) => {
      const execution = baselineExecutions[evalCase.eval_case_id];
      if (!execution) {
        throw new Error(`Missing baseline atomic execution result for ${evalCase.eval_case_id}.`);
      }
      return execution;
    },
    executeCandidateCase: async ({ evalCase }) => {
      const execution = candidateExecutions[evalCase.eval_case_id];
      if (!execution) {
        throw new Error(`Missing candidate atomic execution result for ${evalCase.eval_case_id}.`);
      }
      return execution;
    },
    bootstrapSeed: opts.bootstrapSeed,
    contaminationDetected: opts.contaminationDetected ?? false,
    actualSuiteHash: opts.actualSuiteHash ?? suite.metadata.suite_hash,
    actualFixtureVersion: opts.actualFixtureVersion ?? suite.metadata.fixture_version,
    actualGraderVersion: opts.actualGraderVersion ?? suite.cases[0]?.grader_spec.grader_refs[0] ?? "unknown",
    contaminationAuditNotes: opts.contaminationDetected
      ? "Contamination was flagged by the CLI benchmark input bundle."
      : undefined,
  });
  const persistedRecord = persistBenchmarkResultRecord({
    summary: result.summary,
    baselineManifestId: baselineManifest.baseline_manifest_id,
    candidateManifestId: candidateManifest.candidate_manifest_id,
    baselineTemplateManifestId: baselineManifest.baseline_manifest_id,
    candidateTemplateManifestId: candidateManifest.candidate_manifest_id,
    suiteHash: suite.metadata.suite_hash,
    fixtureVersion: suite.metadata.fixture_version,
    actualSuiteHash: opts.actualSuiteHash ?? suite.metadata.suite_hash,
    actualFixtureVersion: opts.actualFixtureVersion ?? suite.metadata.fixture_version,
    actualGraderVersion: opts.actualGraderVersion,
    caseMembershipHash: computeCaseMembershipHash({
      caseKind: "atomic_case",
      caseIds: suite.cases.map((evalCase) => evalCase.eval_case_id),
    }),
  });
  const commandResult: NicheBenchmarkCommandResult = {
    input_mode: "typed_execution_bundle",
    authority_mode: "legacy_non_authoritative",
    suite_case_kind: "atomic_case",
    baseline_arm: baselineArm,
    candidate_arm: candidateArm,
    suite_hash: suite.metadata.suite_hash,
    fixture_version: suite.metadata.fixture_version,
    benchmark_result_record_id: persistedRecord.recordId,
    benchmark_result_record_path: persistedRecord.recordPath,
    result,
  };
  runtime.log(
    opts.json ? JSON.stringify(commandResult, null, 2) : formatBenchmarkSummary(commandResult),
  );
  return commandResult;
}
