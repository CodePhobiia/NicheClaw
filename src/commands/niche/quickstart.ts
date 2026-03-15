import fs from "node:fs";
import path from "node:path";
import {
  cancel,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import type { StructuredTextSourceDescriptor } from "../../niche/domain/index.js";
import {
  buildStarterManifests,
  compileNicheProgramFlow,
  generateReadinessGuidance,
  formatReadinessGuidance,
} from "../../niche/domain/index.js";
import {
  METRIC_OBJECTIVES,
  RISK_CLASS_VALUES,
  type MetricObjective,
  type NicheProgram,
  type RiskClass,
} from "../../niche/schema/index.js";
import {
  ensureStoredNicheProgram,
  ensureStoredBaselineManifest,
  ensureStoredCandidateManifest,
} from "../../niche/store/index.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type NicheQuickstartOptions = {
  json?: boolean;
};

type QuickstartResult = {
  niche_program_id: string;
  program_path: string;
  compilation_record_path: string;
  source_access_manifest_path: string;
  readiness_report_path: string;
  baseline_manifest_path: string;
  candidate_manifest_path: string;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function readSourceContent(sourcePath: string): string {
  const resolved = path.resolve(sourcePath);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    const content = fs.readFileSync(resolved, "utf-8").trim();
    if (content.length > 0) {
      return content;
    }
  }
  return `Source content placeholder for ${sourcePath}. Replace with actual content.`;
}

function buildSourceDescriptors(
  sourcePaths: string[],
  nicheProgramId: string,
): StructuredTextSourceDescriptor[] {
  return sourcePaths.map((sourcePath, index) => {
    const sourceId = `${nicheProgramId}-source-${index}`;
    const title = path.basename(sourcePath);
    return {
      sourceId,
      sourceKind: "repos" as const,
      inputKind: "structured_text" as const,
      title,
      accessPattern: "read-only",
      rights: {
        rights_to_store: true,
        rights_to_train: true,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: true,
        rights_to_generate_synthetic_from: true,
        retention_policy: "project-lifetime",
        redaction_status: "clean",
        pii_status: "none",
        provenance_status: "verified",
        data_zone: "train" as const,
      },
      text: readSourceContent(sourcePath),
    };
  });
}

function buildNicheProgram(params: {
  nicheProgramId: string;
  name: string;
  objective: string;
  riskClass: RiskClass;
  provider: string;
  model: string;
  apiMode: string;
  allowedTools: string[];
  sourcePaths: string[];
  metricLabel: string;
  metricObjective: MetricObjective;
  metricTargetDescription: string;
  metricMeasurementMethod: string;
}): NicheProgram {
  return {
    niche_program_id: params.nicheProgramId,
    name: params.name,
    objective: params.objective,
    risk_class: params.riskClass,
    runtime_stack: {
      planner_runtime: {
        component_id: "planner-primary",
        provider: params.provider,
        model_id: params.model,
        api_mode: params.apiMode,
      },
      specialization_lanes: ["prompt_policy_assets"],
    },
    allowed_tools: params.allowedTools,
    allowed_sources: params.sourcePaths.map((sourcePath, index) => ({
      source_id: `${params.nicheProgramId}-source-${index}`,
      source_kind: "repos" as const,
    })),
    success_metrics: [
      {
        metric_id: `${params.nicheProgramId}-metric-0`,
        label: params.metricLabel,
        objective: params.metricObjective,
        target_description: params.metricTargetDescription,
        measurement_method: params.metricMeasurementMethod,
      },
    ],
    rights_and_data_policy: {
      storage_policy: "Store governed artifacts in local NicheClaw state roots only.",
      training_policy: "Training data derived from operator-approved sources only.",
      benchmark_policy: "Benchmark data isolated from training data via data zone separation.",
      retention_policy: "Retain artifacts for the lifetime of the niche program.",
      redaction_policy: "Redact PII before ingestion; quarantine unverified sources.",
      pii_policy: "No PII permitted in governed data zones.",
      live_trace_reuse_policy: "Live traces require explicit operator approval before reuse.",
      operator_review_required: true,
    },
  };
}

export async function nicheQuickstartCommand(
  opts: NicheQuickstartOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<QuickstartResult | undefined> {
  const defaultName = path.basename(process.cwd());

  if (!opts.json) {
    intro("NicheClaw — Governed AI Agent Specialization");
  }

  // Step 1: Program name
  const nameValue = await text({
    message: "Program name",
    initialValue: defaultName,
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "Program name is required.";
      }
      return undefined;
    },
  });
  if (isCancel(nameValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const name = (nameValue as string).trim();

  // Step 2: Objective
  const objectiveValue = await text({
    message: "Objective (what should this specialization do?)",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "Objective is required.";
      }
      return undefined;
    },
  });
  if (isCancel(objectiveValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const objective = (objectiveValue as string).trim();

  // Step 3: Risk class
  const riskClassValue = await select({
    message: "Risk class",
    options: RISK_CLASS_VALUES.map((rc) => ({
      value: rc,
      label: rc,
    })),
  });
  if (isCancel(riskClassValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const riskClass = riskClassValue as RiskClass;

  // Step 4: Provider
  const providerValue = await text({
    message: "Provider",
    initialValue: "anthropic",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "Provider is required.";
      }
      return undefined;
    },
  });
  if (isCancel(providerValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const provider = (providerValue as string).trim();

  // Step 5: Model
  const modelValue = await text({
    message: "Model",
    initialValue: "claude-sonnet-4-5-20250514",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "Model is required.";
      }
      return undefined;
    },
  });
  if (isCancel(modelValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const model = (modelValue as string).trim();

  // Step 6: API mode
  const apiModeValue = await text({
    message: "API mode",
    initialValue: "messages",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "API mode is required.";
      }
      return undefined;
    },
  });
  if (isCancel(apiModeValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const apiMode = (apiModeValue as string).trim();

  // Step 7: Allowed tools
  const toolChoices = ["exec", "read", "apply_patch", "web_search", "bash"] as const;
  const allowedToolsValue = await multiselect({
    message: "Allowed tools (space to toggle, enter to confirm)",
    options: toolChoices.map((tool) => ({
      value: tool,
      label: tool,
    })),
  });
  if (isCancel(allowedToolsValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const allowedTools = allowedToolsValue as string[];

  // Step 8: Source paths
  const sourcePathsValue = await text({
    message: "Source paths (comma-separated file or directory paths)",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "At least one source path is required.";
      }
      return undefined;
    },
  });
  if (isCancel(sourcePathsValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const sourcePaths = (sourcePathsValue as string)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Step 9: Success metric label
  const metricLabelValue = await text({
    message: "Success metric label",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "Metric label is required.";
      }
      return undefined;
    },
  });
  if (isCancel(metricLabelValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const metricLabel = (metricLabelValue as string).trim();

  // Step 10: Metric objective
  const metricObjectiveValue = await select({
    message: "Metric objective",
    options: METRIC_OBJECTIVES.map((mo) => ({
      value: mo,
      label: mo,
    })),
  });
  if (isCancel(metricObjectiveValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const metricObjective = metricObjectiveValue as MetricObjective;

  // Step 11: Metric target description
  const metricTargetValue = await text({
    message: "Metric target description",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "Metric target description is required.";
      }
      return undefined;
    },
  });
  if (isCancel(metricTargetValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const metricTargetDescription = (metricTargetValue as string).trim();

  // Step 12: Metric measurement method
  const metricMethodValue = await text({
    message: "Metric measurement method",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "Metric measurement method is required.";
      }
      return undefined;
    },
  });
  if (isCancel(metricMethodValue)) {
    cancel("Quickstart cancelled.");
    return undefined;
  }
  const metricMeasurementMethod = (metricMethodValue as string).trim();

  // Build the NicheProgram
  const nicheProgramId = slugify(name);
  const nicheProgram = buildNicheProgram({
    nicheProgramId,
    name,
    objective,
    riskClass,
    provider,
    model,
    apiMode,
    allowedTools,
    sourcePaths,
    metricLabel,
    metricObjective,
    metricTargetDescription,
    metricMeasurementMethod,
  });

  // Store the program
  const spin = spinner();
  spin.start("Storing niche program...");
  const stored = ensureStoredNicheProgram(nicheProgram, process.env);
  spin.stop("Niche program stored.");

  // Build source descriptors
  const sourceDescriptors = buildSourceDescriptors(sourcePaths, nicheProgramId);

  // Compile
  spin.start("Compiling domain pack and evaluating readiness...");
  const compiled = await compileNicheProgramFlow({
    nicheProgram: stored.program,
    sourceDescriptors,
    env: process.env,
  });
  spin.stop("Compilation complete.");

  // Build starter manifests
  spin.start("Building baseline and candidate manifests...");
  const manifests = buildStarterManifests({
    nicheProgramId,
    compilationRecord: compiled.compilation,
    provider,
    modelId: model,
    apiMode,
    toolAllowlist: allowedTools,
  });

  // Store manifests
  const baselineResult = ensureStoredBaselineManifest(manifests.baselineManifest, process.env);
  const candidateResult = ensureStoredCandidateManifest(manifests.candidateManifest, process.env);
  spin.stop("Manifests stored.");

  const result: QuickstartResult = {
    niche_program_id: nicheProgramId,
    program_path: stored.path,
    compilation_record_path: compiled.compilation_record_path,
    source_access_manifest_path: compiled.source_access_manifest_path,
    readiness_report_path: compiled.readiness_report_path,
    baseline_manifest_path: baselineResult.path,
    candidate_manifest_path: candidateResult.path,
  };

  if (opts.json) {
    runtime.log(JSON.stringify(result, null, 2));
    return result;
  }

  // Print summary
  note(
    [
      `Program ID: ${nicheProgramId}`,
      `Program: ${result.program_path}`,
      `Compilation: ${result.compilation_record_path}`,
      `Source access: ${result.source_access_manifest_path}`,
      `Readiness: ${result.readiness_report_path}`,
      `Baseline manifest: ${result.baseline_manifest_path}`,
      `Candidate manifest: ${result.candidate_manifest_path}`,
      `Readiness status: ${compiled.compilation.readiness_report.status}`,
    ].join("\n"),
    "Quickstart Artifacts",
  );

  // Print context-aware next steps based on readiness status.
  const readinessStatus = compiled.compilation.readiness_report.status;
  if (readinessStatus === "not_ready") {
    const guidance = generateReadinessGuidance(compiled.compilation.readiness_report);
    note(
      [
        formatReadinessGuidance(guidance),
        "",
        "Fix the issues above, then recompile:",
        `  openclaw niche compile --niche-program-id ${nicheProgramId} --source <paths...>`,
        "",
        "Check what to do next:",
        `  openclaw niche next --niche-program-id ${nicheProgramId}`,
      ].join("\n"),
      "Readiness: not_ready",
    );
  } else {
    note(
      [
        "1. Prepare benchmark artifacts:",
        `   openclaw niche prepare-benchmark --niche-program-id ${nicheProgramId} --emit-release-artifacts --json`,
        "",
        "2. Run the benchmark (auto-resolves manifests):",
        `   openclaw niche benchmark --from-program ${nicheProgramId} --suite <suite-path> --live --json`,
        "",
        "3. Check status at any time:",
        `   openclaw niche status --niche-program-id ${nicheProgramId}`,
        "",
        "4. See what to do next:",
        `   openclaw niche next --niche-program-id ${nicheProgramId}`,
      ].join("\n"),
      `Next Steps (readiness: ${readinessStatus})`,
    );
  }

  outro("Quickstart complete.");
  return result;
}
