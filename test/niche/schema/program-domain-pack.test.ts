import AjvPkg from "ajv";
import { describe, expect, it } from "vitest";
import {
  DomainPackSchema,
  NicheProgramSchema,
  type DomainPack,
  type NicheProgram,
  RiskClassSchema,
  SourceKindSchema,
  SpecializationLaneSchema,
  stringEnum,
} from "../../../src/niche/schema/index.js";

const Ajv = AjvPkg as unknown as new (opts?: object) => import("ajv").default;
const ajv = new Ajv({ allErrors: true, strict: false });
const validateProgram = ajv.compile(NicheProgramSchema);
const validateDomainPack = ajv.compile(DomainPackSchema);
const validateRiskClass = ajv.compile(RiskClassSchema);
const validateSourceKind = ajv.compile(SourceKindSchema);
const validateSpecializationLane = ajv.compile(SpecializationLaneSchema);

const makeProgram = (): NicheProgram => ({
  niche_program_id: "repo-ci-specialist",
  name: "Repo CI Specialist",
  objective: "Improve repo, terminal, and CI execution quality for a coding niche.",
  risk_class: "moderate",
  runtime_stack: {
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
      notes: "Same-model control arm and candidate arm share the planner family.",
    },
    retrieval_components: [
      {
        component_id: "retrieval-default",
        provider: "local",
        model_id: "bm25-rerank",
        notes: "Seed retrieval for repo evidence.",
      },
    ],
    verifier_components: [
      {
        component_id: "verifier-default",
        provider: "local",
        model_id: "rule-pack-v1",
        notes: "Blocking checks for unsupported claims and format regressions.",
      },
    ],
    specialization_lanes: ["system_specialization", "distillation"],
  },
  allowed_tools: ["read", "edit", "exec", "apply_patch"],
  allowed_sources: [
    {
      source_id: "repo-root",
      source_kind: "repos",
      description: "Primary repository workspace.",
      access_pattern: "read_write_workspace",
    },
    {
      source_id: "ci-logs",
      source_kind: "logs",
      description: "Recent CI failure logs.",
      access_pattern: "read_only_logs",
    },
  ],
  success_metrics: [
    {
      metric_id: "task_success",
      label: "Task success",
      objective: "maximize",
      target_description: "Increase held-out task completion rate.",
      measurement_method: "paired benchmark grading",
    },
    {
      metric_id: "hard_fail_rate",
      label: "Hard-fail rate",
      objective: "minimize",
      target_description: "Reduce release-blocking failures.",
      measurement_method: "benchmark hard-fail aggregation",
    },
  ],
  rights_and_data_policy: {
    storage_policy: "Store approved niche sources and traces under governed state roots.",
    training_policy: "Reuse only sources with explicit training rights.",
    benchmark_policy: "Keep held-out evaluation sources out of training artifacts.",
    retention_policy: "Retain artifacts according to operator policy and governance review.",
    redaction_policy: "Redact sensitive material before trace reuse.",
    pii_policy: "Do not ingest unreviewed PII into training or benchmark artifacts.",
    live_trace_reuse_policy: "Embargo live traces until contamination checks pass.",
    operator_review_required: true,
  },
});

const makeDomainPack = (): DomainPack => ({
  domain_pack_id: "repo-ci-specialist-pack",
  niche_program_id: "repo-ci-specialist",
  version: "v1.0.0",
  ontology: {
    concepts: [
      {
        id: "repo_state",
        label: "Repository state",
        description: "Current workspace structure, diffs, and relevant files.",
      },
      {
        id: "ci_signal",
        label: "CI signal",
        description: "Actionable test and build failures from automation.",
      },
    ],
    relations: [
      {
        relation_id: "repo_state_drives_ci_signal",
        source_concept_id: "repo_state",
        target_concept_id: "ci_signal",
        relation_type: "influences",
        description: "Repository changes influence CI outcomes.",
      },
    ],
  },
  task_taxonomy: [
    {
      task_family_id: "repo_navigation",
      label: "Repo navigation",
      description: "Find relevant files, entrypoints, and callers.",
      benchmarkable: true,
      required_capabilities: ["code_search", "file_reading"],
    },
    {
      task_family_id: "ci_repair",
      label: "CI repair",
      description: "Diagnose and fix repeatable failing checks.",
      benchmarkable: true,
      required_capabilities: ["terminal_execution", "patch_generation", "verification"],
    },
  ],
  terminology_map: {
    smoke: {
      canonical_term: "smoke build",
      synonyms: ["strict smoke", "smoke test"],
      definition: "A narrow build check that exercises key repo build paths.",
    },
    replay: {
      canonical_term: "replayability",
      synonyms: ["trace replay"],
      definition: "Ability to re-run or inspect evidence for benchmarked executions.",
    },
  },
  constraints: [
    {
      constraint_id: "same_model_honesty",
      category: "benchmarking",
      rule: "Compare baseline and candidate under the same planner runtime family.",
      rationale: "Specialization claims must reflect same-model lift.",
      severity: "high",
    },
    {
      constraint_id: "no_eval_leakage",
      category: "governance",
      rule: "Do not train on held-out benchmark sources.",
      rationale: "Avoid fake lift from contamination.",
      severity: "high",
    },
  ],
  tool_contracts: [
    {
      tool_name: "read",
      intent_summary: "Inspect repo files without mutating them.",
      required_arguments: ["path"],
      optional_arguments: ["offset", "limit"],
      failure_modes: ["missing_file"],
    },
    {
      tool_name: "exec",
      intent_summary: "Run deterministic repo or CI reproduction commands.",
      required_arguments: ["command"],
      optional_arguments: ["cwd", "timeout_ms"],
      failure_modes: ["nonzero_exit", "timeout"],
    },
  ],
  evidence_source_registry: [
    {
      source_id: "repo-root",
      source_kind: "repos",
      title: "Repository workspace",
      access_pattern: "read_write_workspace",
      freshness_expectation: "latest checkout",
      trust_notes: "Primary operator-managed source.",
    },
    {
      source_id: "ci-logs",
      source_kind: "logs",
      title: "CI logs",
      access_pattern: "read_only_logs",
      freshness_expectation: "latest failing run",
      trust_notes: "High-value evidence for repair and regression analysis.",
    },
  ],
  failure_taxonomy: [
    {
      failure_id: "missing_file",
      label: "Missing file",
      description: "Tool call referenced a file that does not exist in the allowed source set.",
      severity: "moderate",
      detection_hints: ["ENOENT", "file not found"],
    },
    {
      failure_id: "nonzero_exit",
      label: "Non-zero exit",
      description: "A command returned a failing exit code.",
      severity: "high",
      detection_hints: ["exit code", "command failed"],
    },
  ],
  verifier_defaults: {
    required_checks: ["evidence_grounding", "output_constraints", "unsupported_claims"],
    blocking_failure_ids: ["nonzero_exit"],
    output_requirements: ["cite_repo_evidence", "report_verifier_decision"],
    escalation_policy: "Retry once, then escalate to operator review on repeated verifier veto.",
  },
  benchmark_seed_specs: [
    {
      seed_id: "repo-search-seed",
      task_family_id: "repo_navigation",
      prompt:
        "Locate the runtime entrypoint for agent execution and identify its main handoff seams.",
      source_refs: ["repo-root"],
      pass_conditions: ["correct_entrypoint", "correct_handoff_files"],
      hard_fail_conditions: ["hallucinated_files", "forbidden_source_use"],
    },
    {
      seed_id: "ci-repair-seed",
      task_family_id: "ci_repair",
      prompt: "Inspect the failing smoke build and propose the smallest valid fix.",
      source_refs: ["repo-root", "ci-logs"],
      pass_conditions: ["correct_failure_root_cause", "scoped_patch"],
      hard_fail_conditions: ["benchmark_leakage", "unsafe_command_use"],
    },
  ],
});

describe("NicheProgram schema", () => {
  it("accepts a complete program definition", () => {
    expect(validateProgram(makeProgram())).toBe(true);
  });

  it("requires the PRD-mandated top-level fields", () => {
    const invalidProgram = {
      ...makeProgram(),
      objective: undefined,
    };

    expect(validateProgram(invalidProgram)).toBe(false);
  });

  it("rejects invalid enum values for constrained fields", () => {
    expect(validateRiskClass("critical")).toBe(false);
    expect(validateSourceKind("tickets")).toBe(false);
    expect(validateSpecializationLane("fine_tuning_only")).toBe(false);
    expect(stringEnum(["one", "two"] as const)).toBeDefined();
  });

  it("round-trips through JSON serialization", () => {
    const roundTripped = JSON.parse(JSON.stringify(makeProgram())) as NicheProgram;
    expect(validateProgram(roundTripped)).toBe(true);
  });
});

describe("DomainPack schema", () => {
  it("accepts a complete domain pack", () => {
    expect(validateDomainPack(makeDomainPack())).toBe(true);
  });

  it("rejects nested objects that drift from the schema", () => {
    const invalidDomainPack = {
      ...makeDomainPack(),
      ontology: {
        ...makeDomainPack().ontology,
        concepts: [
          {
            id: "repo_state",
            label: "Repository state",
            description: "Current workspace structure, diffs, and relevant files.",
            extra: "not allowed",
          },
        ],
      },
    };

    expect(validateDomainPack(invalidDomainPack)).toBe(false);
  });

  it("round-trips through JSON serialization", () => {
    const roundTripped = JSON.parse(JSON.stringify(makeDomainPack())) as DomainPack;
    expect(validateDomainPack(roundTripped)).toBe(true);
  });
});
