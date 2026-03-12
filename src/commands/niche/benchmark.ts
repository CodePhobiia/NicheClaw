import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";
import { readRequiredJsonFileStrict } from "../../niche/json.js";
import {
  BaselineManifestSchema,
  CandidateManifestSchema,
  EpisodeCaseSchema,
  type BenchmarkArmIdentifier,
  type BaselineManifest,
  type CandidateManifest,
} from "../../niche/schema/index.js";
import {
  EpisodeBenchmarkSuiteRecordSchema,
  EpisodeCaseExecutionResultSchema,
  runAtomicBenchmark,
  runEpisodeBenchmark,
  type AtomicBenchmarkRunResult,
  type AtomicBenchmarkSuiteRecord,
  type AtomicCaseExecutionResult,
  type EpisodeBenchmarkRunResult,
  type EpisodeBenchmarkSuiteRecord,
  type EpisodeCaseExecutionResult,
} from "../../niche/benchmark/index.js";
import { AtomicCaseExecutionResultSchema } from "../../niche/benchmark/atomic-runner.js";
import { AtomicBenchmarkSuiteRecordSchema } from "../../niche/benchmark/suite-registry.js";

export type NicheBenchmarkOptions = {
  baselineManifestPath: string;
  candidateManifestPath: string;
  suitePath: string;
  baselineExecutionPath: string;
  candidateExecutionPath: string;
  bootstrapSeed?: number;
  contaminationDetected?: boolean;
  actualSuiteHash?: string;
  actualFixtureVersion?: string;
  actualGraderVersion?: string;
  json?: boolean;
};

export type NicheBenchmarkCommandResult = {
  suite_case_kind: "atomic_case" | "episode_case";
  baseline_arm: BenchmarkArmIdentifier;
  candidate_arm: BenchmarkArmIdentifier;
  suite_hash: string;
  fixture_version: string;
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
  return {
    benchmark_arm_id: `${params.suiteId}-${params.armKind}-${params.manifestId}`,
    benchmark_suite_id: params.suiteId,
    manifest_id: params.manifestId,
    arm_kind: params.armKind,
    mode: params.mode,
  };
}

function formatBenchmarkSummary(result: NicheBenchmarkCommandResult): string {
  const summary = result.result.summary;
  const lines = [
    `Niche benchmark completed for suite ${summary.benchmark_suite_id}.`,
    `Case kind: ${result.suite_case_kind}`,
    `Mode: ${summary.mode}`,
    `Suite hash: ${result.suite_hash}`,
    `Fixture version: ${result.fixture_version}`,
    `Provider metadata quality: ${summary.provider_metadata_quality ?? "unknown"}`,
    `Case count: ${summary.case_count}`,
    `Mean delta: ${summary.paired_delta_summary.mean_delta.toFixed(4)}`,
    `Confidence interval: ${summary.paired_delta_summary.confidence_interval_low.toFixed(4)} .. ${summary.paired_delta_summary.confidence_interval_high.toFixed(4)}`,
    `Invalidated: ${summary.invalidated ? "yes" : "no"}`,
  ];
  if (summary.invalidation_reasons.length > 0) {
    lines.push(`Invalidation reasons: ${summary.invalidation_reasons.join("; ")}`);
  }
  return lines.join("\n");
}

export async function nicheBenchmarkCommand(
  opts: NicheBenchmarkOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NicheBenchmarkCommandResult> {
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

  const suiteRaw = readRequiredJsonFileStrict(opts.suitePath) as {
    metadata?: { case_kind?: string };
  };
  if (suiteRaw.metadata?.case_kind === "episode_case") {
    const suite = loadEpisodeSuite(opts.suitePath);
    const baselineExecutions = loadEpisodeExecutions(opts.baselineExecutionPath);
    const candidateExecutions = loadEpisodeExecutions(opts.candidateExecutionPath);
    const result = await runEpisodeBenchmark({
      suite,
      baselineManifest,
      candidateManifest,
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
      contaminationDetected: opts.contaminationDetected,
      actualSuiteHash: opts.actualSuiteHash,
      actualFixtureVersion: opts.actualFixtureVersion,
      actualGraderVersion: opts.actualGraderVersion,
    });
    const commandResult: NicheBenchmarkCommandResult = {
      suite_case_kind: "episode_case",
      baseline_arm: buildBenchmarkArm({
        suiteId: suite.metadata.benchmark_suite_id,
        manifestId: baselineManifest.baseline_manifest_id,
        armKind: "baseline",
        mode: suite.metadata.mode,
      }),
      candidate_arm: buildBenchmarkArm({
        suiteId: suite.metadata.benchmark_suite_id,
        manifestId: candidateManifest.candidate_manifest_id,
        armKind: "candidate",
        mode: suite.metadata.mode,
      }),
      suite_hash: suite.metadata.suite_hash,
      fixture_version: suite.metadata.fixture_version,
      result,
    };
    runtime.log(
      opts.json ? JSON.stringify(commandResult, null, 2) : formatBenchmarkSummary(commandResult),
    );
    return commandResult;
  }

  const suite = loadAtomicSuite(opts.suitePath);
  const baselineExecutions = loadAtomicExecutions(opts.baselineExecutionPath);
  const candidateExecutions = loadAtomicExecutions(opts.candidateExecutionPath);
  const result = await runAtomicBenchmark({
    suite,
    baselineManifest,
    candidateManifest,
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
    contaminationAuditNotes: opts.contaminationDetected
      ? "Contamination was flagged by the CLI benchmark input bundle."
      : undefined,
  });
  const commandResult: NicheBenchmarkCommandResult = {
    suite_case_kind: "atomic_case",
    baseline_arm: buildBenchmarkArm({
      suiteId: suite.metadata.benchmark_suite_id,
      manifestId: baselineManifest.baseline_manifest_id,
      armKind: "baseline",
      mode: suite.metadata.mode,
    }),
    candidate_arm: buildBenchmarkArm({
      suiteId: suite.metadata.benchmark_suite_id,
      manifestId: candidateManifest.candidate_manifest_id,
      armKind: "candidate",
      mode: suite.metadata.mode,
    }),
    suite_hash: suite.metadata.suite_hash,
    fixture_version: suite.metadata.fixture_version,
    result,
  };
  runtime.log(
    opts.json ? JSON.stringify(commandResult, null, 2) : formatBenchmarkSummary(commandResult),
  );
  return commandResult;
}
