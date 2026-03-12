import fs from "node:fs";
import path from "node:path";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";
import { NicheProgramSchema, type NicheProgram } from "../../niche/schema/index.js";
import { resolveNicheStoreRoots, resolveNicheStateRoot } from "../../niche/store/index.js";

type AnchorName = "PRD.md" | "ARCHITECTURE.md";

export type NicheInitOptions = {
  json?: boolean;
  writeStarterProgram?: boolean;
  starterProgramId?: string;
  starterProgramName?: string;
};

export type NicheInitAnchorStatus = {
  name: AnchorName;
  path: string;
  exists: boolean;
  mentions_nicheclaw: boolean;
};

export type NicheInitResult = {
  state_root: string;
  ensured_directories: string[];
  anchors: NicheInitAnchorStatus[];
  starter_program_path?: string;
  starter_program?: NicheProgram;
};

function assertStarterProgram(program: NicheProgram): NicheProgram {
  const validation = validateJsonSchemaValue({
    schema: NicheProgramSchema,
    cacheKey: "niche-cli-starter-program",
    value: program,
  });
  if (validation.ok) {
    return program;
  }
  const details = validation.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid starter niche program: ${details}`);
}

function validateAnchor(repoRoot: string, name: AnchorName): NicheInitAnchorStatus {
  const pathname = path.join(repoRoot, name);
  if (!fs.existsSync(pathname)) {
    return {
      name,
      path: pathname,
      exists: false,
      mentions_nicheclaw: false,
    };
  }
  const content = fs.readFileSync(pathname, "utf8");
  return {
    name,
    path: pathname,
    exists: true,
    mentions_nicheclaw: /nicheclaw/i.test(content),
  };
}

function buildStarterProgram(params: {
  programId: string;
  programName: string;
}): NicheProgram {
  return assertStarterProgram({
    niche_program_id: params.programId,
    name: params.programName,
    objective:
      "Specialize OpenClaw for benchmarked repo, terminal, and CI workflows without changing the serving substrate outside explicit NicheClaw paths.",
    risk_class: "moderate",
    runtime_stack: {
      planner_runtime: {
        component_id: "openclaw-planner-runtime",
        provider: "openclaw",
        model_id: "same-model-baseline",
        api_mode: "cli_control_plane",
        notes:
          "Starter niche program keeps the same-model baseline discipline and specializes around the OpenClaw runtime.",
      },
      retrieval_components: [
        {
          component_id: "repo-evidence-retrieval",
          provider: "openclaw",
          model_id: "file-backed-registry",
          api_mode: "local",
          notes: "Approved repo and CI evidence registry for benchmarkable task grounding.",
        },
      ],
      verifier_components: [
        {
          component_id: "repo-ci-verifier-pack",
          provider: "openclaw",
          model_id: "policy-pack",
          api_mode: "local",
          notes: "Starter verifier pack for grounding, constraint, and delivery checks.",
        },
      ],
      specialization_lanes: [
        "system_specialization",
        "distillation",
        "prompt_policy_assets",
      ],
    },
    allowed_tools: ["read_file", "run_command", "write_file"],
    allowed_sources: [
      {
        source_id: "approved-repo-assets",
        source_kind: "repos",
        description: "Approved repository sources and fixture packs for repo, terminal, and CI workflows.",
        access_pattern: "local_checkout_and_frozen_fixtures",
      },
      {
        source_id: "approved-ci-logs",
        source_kind: "logs",
        description: "Approved CI outputs and terminal traces retained for benchmark and verifier evidence.",
        access_pattern: "stored_ci_artifacts_and_replay_bundles",
      },
      {
        source_id: "approved-tool-contracts",
        source_kind: "tool_schemas",
        description: "Typed tool contracts and allowed-source declarations for the niche boundary.",
        access_pattern: "versioned_local_contracts",
      },
    ],
    success_metrics: [
      {
        metric_id: "held-out-task-success",
        label: "Held-out task success",
        objective: "maximize",
        target_description: "Improve held-out repo, terminal, and CI task success over the same-model baseline.",
        measurement_method: "paired benchmark deltas on atomic and episode suites",
      },
      {
        metric_id: "hard-fail-rate",
        label: "Hard-fail rate",
        objective: "minimize",
        target_description: "Reduce hard failures without contaminating held-out evaluation.",
        measurement_method: "benchmark and promoted-monitor hard-fail tracking",
      },
      {
        metric_id: "grounded-delivery",
        label: "Grounded delivery",
        objective: "maximize",
        target_description: "Keep final outputs verifier-approved and grounded in declared evidence bundles.",
        measurement_method: "verifier pass-through and false-veto-sensitive review",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "Persist only approved niche artifacts and traces under the NicheClaw state root.",
      training_policy: "Train only on inputs that retain explicit rights_to_train and derivative authorization.",
      benchmark_policy: "Benchmark with held-out, same-model comparable manifests and contamination-audited suites.",
      retention_policy: "Retain reproducibility artifacts needed for lineage, replay, and release governance.",
      redaction_policy: "Redact operator secrets, credentials, and non-approved sensitive content before persistence.",
      pii_policy: "Do not store or reuse unapproved PII in optimizer or benchmark artifacts.",
      live_trace_reuse_policy:
        "Live traces remain embargoed until contamination checks, rights confirmation, and policy gates clear reuse.",
      operator_review_required: true,
    },
  });
}

function formatInitSummary(result: NicheInitResult): string {
  const lines = [
    "NicheClaw workspace initialized.",
    `State root: ${result.state_root}`,
    `Ensured directories: ${result.ensured_directories.length}`,
  ];
  for (const anchor of result.anchors) {
    lines.push(
      `Anchor ${anchor.name}: ${anchor.exists && anchor.mentions_nicheclaw ? "ok" : "invalid"} (${anchor.path})`,
    );
  }
  if (result.starter_program_path) {
    lines.push(`Starter program: ${result.starter_program_path}`);
  }
  return lines.join("\n");
}

export async function nicheInitCommand(
  opts: NicheInitOptions = {},
  runtime: RuntimeEnv = defaultRuntime,
  env: NodeJS.ProcessEnv = process.env,
): Promise<NicheInitResult> {
  const repoRoot = process.cwd();
  const anchors = [
    validateAnchor(repoRoot, "PRD.md"),
    validateAnchor(repoRoot, "ARCHITECTURE.md"),
  ];
  const invalidAnchor = anchors.find(
    (anchor) => !anchor.exists || !anchor.mentions_nicheclaw,
  );
  if (invalidAnchor) {
    throw new Error(
      `Missing or invalid NicheClaw architecture anchor: ${invalidAnchor.name} (${invalidAnchor.path}).`,
    );
  }

  const roots = resolveNicheStoreRoots(env);
  const ensuredDirectories = Object.values(roots);
  for (const dirname of ensuredDirectories) {
    fs.mkdirSync(dirname, { recursive: true, mode: 0o700 });
  }

  let starterProgramPath: string | undefined;
  let starterProgram: NicheProgram | undefined;
  if (opts.writeStarterProgram) {
    const programId = opts.starterProgramId?.trim() || "repo-ci-specialist";
    const programName = opts.starterProgramName?.trim() || "Repo Terminal CI Specialist";
    starterProgram = buildStarterProgram({
      programId,
      programName,
    });
    starterProgramPath = path.join(roots.programs, `${starterProgram.niche_program_id}.json`);
    if (fs.existsSync(starterProgramPath)) {
      throw new Error(`Refusing to overwrite existing starter program: ${starterProgramPath}`);
    }
    saveJsonFile(starterProgramPath, starterProgram);
  }

  const result: NicheInitResult = {
    state_root: resolveNicheStateRoot(env),
    ensured_directories: ensuredDirectories,
    anchors,
    starter_program_path: starterProgramPath,
    starter_program: starterProgram,
  };

  runtime.log(opts.json ? JSON.stringify(result, null, 2) : formatInitSummary(result));
  return result;
}
