import { buildStarterManifests, compileNicheProgramFlow } from "../../niche/domain/index.js";
import type { SourceDescriptor } from "../../niche/domain/index.js";
import { readRequiredJsonFileStrict } from "../../niche/json.js";
import {
  BenchmarkSeedSourceDescriptorSchema,
  LocalFileSourceDescriptorSchema,
  RepoAssetSourceDescriptorSchema,
  StructuredTextSourceDescriptorSchema,
  type NicheCompilationRecord,
} from "../../niche/schema/index.js";
import {
  ensureStoredBaselineManifest,
  ensureStoredCandidateManifest,
  getNicheProgram,
} from "../../niche/store/index.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type NicheCompileOptions = {
  nicheProgramId: string;
  sourcePaths: string[];
  version?: string;
  compiledAt?: string;
  emitManifests?: boolean;
  provider?: string;
  modelId?: string;
  apiMode?: string;
  json?: boolean;
};

export type NicheCompileCommandResult = {
  niche_program_id: string;
  compilation_record_path: string;
  source_access_manifest_path: string;
  readiness_report_path: string;
  baseline_manifest_path?: string;
  candidate_manifest_path?: string;
  compilation: NicheCompilationRecord;
};

function assertSourceDescriptor(value: unknown, label: string): SourceDescriptor {
  const inputKind =
    value && typeof value === "object" && "inputKind" in value
      ? (value as { inputKind?: string }).inputKind
      : undefined;
  const schema =
    inputKind === "local_file"
      ? LocalFileSourceDescriptorSchema
      : inputKind === "repo_asset"
        ? RepoAssetSourceDescriptorSchema
        : inputKind === "structured_text"
          ? StructuredTextSourceDescriptorSchema
          : inputKind === "benchmark_seed"
            ? BenchmarkSeedSourceDescriptorSchema
            : undefined;
  if (!schema) {
    throw new Error(
      `Invalid ${label}: inputKind must be one of local_file, repo_asset, structured_text, or benchmark_seed.`,
    );
  }
  const validation = validateJsonSchemaValue({
    schema,
    cacheKey: `niche-compile-source-${inputKind}`,
    value,
  });
  if (validation.ok) {
    return value as SourceDescriptor;
  }
  const details = validation.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid ${label}: ${details}`);
}

function formatSummary(result: NicheCompileCommandResult): string {
  const lines = [
    `Compiled niche program ${result.niche_program_id}.`,
    `Compilation: ${result.compilation.compilation_id}`,
    `Domain pack version: ${result.compilation.version}`,
    `Source access manifest: ${result.source_access_manifest_path}`,
    `Readiness report: ${result.readiness_report_path}`,
    `Compilation record: ${result.compilation_record_path}`,
    `Readiness status: ${result.compilation.readiness_report.status}`,
  ];
  if (result.baseline_manifest_path) {
    lines.push(`Baseline manifest: ${result.baseline_manifest_path}`);
  }
  if (result.candidate_manifest_path) {
    lines.push(`Candidate manifest: ${result.candidate_manifest_path}`);
  }
  return lines.join("\n");
}

export async function nicheCompileCommand(
  opts: NicheCompileOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NicheCompileCommandResult> {
  if (opts.sourcePaths.length === 0) {
    throw new Error("At least one --source path is required.");
  }
  const nicheProgram = getNicheProgram(opts.nicheProgramId, process.env);
  if (!nicheProgram) {
    throw new Error(
      `Missing niche program "${opts.nicheProgramId}".\nRun: openclaw niche create --program <path>`,
    );
  }
  const sourceDescriptors = opts.sourcePaths.map((sourcePath, index) =>
    assertSourceDescriptor(
      readRequiredJsonFileStrict(sourcePath, `source descriptor ${sourcePath}`),
      `source descriptor ${index + 1} (${sourcePath})`,
    ),
  );

  const compiled = await compileNicheProgramFlow({
    nicheProgram,
    sourceDescriptors,
    version: opts.version,
    compiledAt: opts.compiledAt,
    env: process.env,
  });

  const result: NicheCompileCommandResult = {
    niche_program_id: nicheProgram.niche_program_id,
    compilation_record_path: compiled.compilation_record_path,
    source_access_manifest_path: compiled.source_access_manifest_path,
    readiness_report_path: compiled.readiness_report_path,
    compilation: compiled.compilation,
  };

  if (opts.emitManifests) {
    const provider = opts.provider ?? nicheProgram.runtime_stack.planner_runtime.provider;
    const modelId = opts.modelId ?? nicheProgram.runtime_stack.planner_runtime.model_id;
    const apiMode =
      opts.apiMode ?? nicheProgram.runtime_stack.planner_runtime.api_mode ?? "messages";
    const toolAllowlist = [...nicheProgram.allowed_tools];

    const manifests = buildStarterManifests({
      nicheProgramId: nicheProgram.niche_program_id,
      compilationRecord: compiled.compilation,
      provider,
      modelId,
      apiMode,
      toolAllowlist,
    });
    const baselineResult = ensureStoredBaselineManifest(manifests.baselineManifest, process.env);
    const candidateResult = ensureStoredCandidateManifest(manifests.candidateManifest, process.env);
    result.baseline_manifest_path = baselineResult.path;
    result.candidate_manifest_path = candidateResult.path;
  }

  runtime.log(opts.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return result;
}
