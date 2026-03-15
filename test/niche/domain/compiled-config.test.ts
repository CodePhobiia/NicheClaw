import { afterEach, describe, expect, it } from "vitest";
import {
  compileDomainConfig,
  type CompiledDomainConfig,
} from "../../../src/niche/domain/compiled-config.js";
import { prepareNicheRunSeed } from "../../../src/niche/runtime/prepare-run-seed.js";
import {
  clearAllNicheRunTraceContextsForTest,
  getCompiledDomainConfig,
  registerPreparedNicheRunTraceContext,
} from "../../../src/niche/runtime/run-trace-capture.js";
import type { DomainPack } from "../../../src/niche/schema/index.js";
import type {
  CandidateManifest,
  PreparedNicheActionPolicyRuntime,
  SourceAccessManifest,
} from "../../../src/niche/schema/index.js";

function makeDomainPack(): DomainPack {
  return {
    domain_pack_id: "test-domain-pack",
    niche_program_id: "test-niche-program",
    version: "1.0.0",
    ontology: {
      concepts: [
        { id: "concept-a", label: "Concept A", description: "First concept" },
        { id: "concept-b", label: "Concept B" },
      ],
      relations: [
        {
          relation_id: "rel-a-b",
          source_concept_id: "concept-a",
          target_concept_id: "concept-b",
          relation_type: "depends_on",
        },
      ],
    },
    task_taxonomy: [
      {
        task_family_id: "task-family-alpha",
        label: "Alpha tasks",
        description: "Tasks in the alpha family",
        benchmarkable: true,
        required_capabilities: ["reasoning", "evidence_grounding"],
      },
      {
        task_family_id: "task-family-beta",
        label: "Beta tasks",
        benchmarkable: false,
        required_capabilities: ["summarization"],
      },
    ],
    terminology_map: {
      api: {
        canonical_term: "API endpoint",
        synonyms: ["endpoint", "route"],
        definition: "A network-accessible service interface.",
      },
      db: {
        canonical_term: "database",
        synonyms: ["DB", "datastore"],
      },
    },
    constraints: [
      {
        constraint_id: "constraint-grounding",
        category: "evidence",
        rule: "All claims must be grounded in approved sources.",
        severity: "high",
        rationale: "Prevents hallucination of domain facts.",
      },
      {
        constraint_id: "constraint-no-pii",
        category: "privacy",
        rule: "Never include PII in outputs.",
        severity: "high",
      },
      {
        constraint_id: "constraint-formatting",
        category: "style",
        rule: "Use markdown formatting for structured responses.",
        severity: "low",
        rationale: "Improves readability.",
      },
    ],
    tool_contracts: [
      {
        tool_name: "search",
        intent_summary: "Search the knowledge base for relevant documents.",
        required_arguments: ["query"],
        optional_arguments: ["max_results", "filter"],
        failure_modes: ["no_results", "timeout"],
      },
      {
        tool_name: "execute",
        intent_summary: "Execute a command in the sandbox.",
        required_arguments: ["command"],
        optional_arguments: ["cwd", "timeout"],
        failure_modes: ["command_failed", "sandbox_violation"],
      },
    ],
    evidence_source_registry: [
      {
        source_id: "knowledge-base",
        source_kind: "documents",
        title: "Internal Knowledge Base",
        access_pattern: "search_api",
        freshness_expectation: "updated_daily",
        trust_notes: "Curated by domain experts.",
      },
      {
        source_id: "repo-docs",
        source_kind: "repos",
        title: "Repository Documentation",
        access_pattern: "file_read",
      },
    ],
    failure_taxonomy: [
      {
        failure_id: "hallucination",
        label: "Hallucination",
        description: "Agent produces claims not grounded in evidence.",
        severity: "high",
        detection_hints: ["unsupported claim", "no source cited"],
      },
      {
        failure_id: "stale-data",
        label: "Stale data usage",
        description: "Agent uses outdated information.",
        severity: "moderate",
        detection_hints: ["outdated reference", "deprecated api"],
      },
    ],
    verifier_defaults: {
      required_checks: ["evidence_grounding", "constraint_compliance"],
      blocking_failure_ids: ["hallucination"],
      output_requirements: ["cite_sources", "structured_response"],
      escalation_policy: "Escalate all high-severity findings to operator.",
    },
    benchmark_seed_specs: [
      {
        seed_id: "seed-alpha-1",
        task_family_id: "task-family-alpha",
        prompt: "Explain how the API endpoint handles authentication.",
        source_refs: ["knowledge-base"],
        pass_conditions: ["mentions_auth_mechanism", "cites_source"],
        hard_fail_conditions: ["fabricated_endpoint"],
      },
      {
        seed_id: "seed-beta-1",
        task_family_id: "task-family-beta",
        prompt: "Summarize the database migration strategy.",
        source_refs: ["repo-docs"],
        pass_conditions: ["accurate_summary"],
        hard_fail_conditions: [],
      },
    ],
  };
}

function makeCandidateManifest(): CandidateManifest {
  return {
    candidate_manifest_id: "candidate-manifest-test",
    based_on_baseline_manifest_id: "baseline-manifest-test",
    niche_program_id: "test-niche-program",
    created_at: "2026-03-14T12:00:00.000Z",
    planner_runtime: {
      component_id: "planner-primary-v1",
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
    capability_snapshot_at: "2026-03-14T11:59:00.000Z",
    routing_proxy_version: "2026.3.14",
    provider_metadata_quality: "exact_snapshot",
    provider_runtime_notes: "Test candidate metadata.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.14",
    grader_set_version: "grader-set-v1",
    benchmark_suite_id: "test-suite",
    source_access_manifest_id: "source-access-test",
    retry_policy: { max_attempts: 2 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Test candidate manifest",
    domain_pack_id: "test-domain-pack",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    tool_catalog_version: "2026.3.14",
    tool_allowlist: ["search", "execute"],
    tool_contract_version: "2026.3.14",
    retrieval_config: { policy: "baseline" },
    verifier_config: { pack: "baseline" },
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
  };
}

function makeSourceAccessManifest(): SourceAccessManifest {
  return {
    source_access_manifest_id: "source-access-test",
    allowed_tools: ["search", "execute"],
    allowed_retrieval_indices: ["knowledge-base"],
    allowed_live_sources: [],
    disallowed_sources: [],
    sandbox_policy: "workspace-only",
    network_policy: "deny",
    approval_policy: "never",
  };
}

function makeActionPolicyRuntime(): PreparedNicheActionPolicyRuntime {
  return {
    allowed_tools: ["search", "execute"],
    required_arguments_by_tool: {
      search: ["query"],
      execute: ["command"],
    },
    max_retry_attempts: 2,
  };
}

describe("compileDomainConfig", () => {
  it("produces a valid CompiledDomainConfig from a domain pack", () => {
    const domainPack = makeDomainPack();
    const config = compileDomainConfig(domainPack);

    expect(config.niche_program_id).toBe("test-niche-program");
    expect(config.domain_pack_id).toBe("test-domain-pack");
    expect(config.version).toBe("1.0.0");
    expect(config.compiled_at).toBeTruthy();
    expect(config.planner).toBeDefined();
    expect(config.tools).toBeDefined();
    expect(config.observation).toBeDefined();
    expect(config.retrieval).toBeDefined();
    expect(config.exemplars).toBeDefined();
    expect(config.constraints).toBeDefined();
  });

  it("builds planner directives that include constraint text", () => {
    const domainPack = makeDomainPack();
    const config = compileDomainConfig(domainPack);

    expect(config.planner.domain_identity).toContain("test-niche-program");
    expect(config.planner.domain_identity).toContain("specialist");

    expect(config.planner.reasoning_constraints).toHaveLength(3);
    expect(config.planner.reasoning_constraints[0]).toContain(
      "All claims must be grounded in approved sources.",
    );
    expect(config.planner.reasoning_constraints[0]).toContain("[high]");
    expect(config.planner.reasoning_constraints[0]).toContain(
      "Prevents hallucination of domain facts.",
    );
    // Constraint without rationale should not include the separator
    expect(config.planner.reasoning_constraints[1]).toContain("Never include PII in outputs.");
    expect(config.planner.reasoning_constraints[1]).not.toContain(" — ");
  });

  it("builds planner directives with terminology guidance", () => {
    const domainPack = makeDomainPack();
    const config = compileDomainConfig(domainPack);

    expect(config.planner.terminology_guidance).toHaveLength(2);
    const apiGuidance = config.planner.terminology_guidance.find((t) => t.includes("API endpoint"));
    expect(apiGuidance).toBeDefined();
    expect(apiGuidance).toContain("endpoint");
    expect(apiGuidance).toContain("route");
    expect(apiGuidance).toContain("network-accessible service interface");
  });

  it("builds planner directives with task decomposition hints", () => {
    const domainPack = makeDomainPack();
    const config = compileDomainConfig(domainPack);

    expect(config.planner.task_decomposition_hints).toHaveLength(2);
    expect(config.planner.task_decomposition_hints[0]).toContain("Alpha tasks");
    expect(config.planner.task_decomposition_hints[0]).toContain("reasoning");
    expect(config.planner.task_decomposition_hints[0]).toContain("evidence_grounding");
  });

  it("builds planner directives with failure awareness", () => {
    const domainPack = makeDomainPack();
    const config = compileDomainConfig(domainPack);

    expect(config.planner.failure_awareness).toHaveLength(2);
    expect(config.planner.failure_awareness[0]).toContain("Hallucination");
    expect(config.planner.failure_awareness[0]).toContain("high");
    expect(config.planner.failure_awareness[0]).toContain("unsupported claim");
  });

  it("builds planner directives with evidence requirements from verifier defaults", () => {
    const domainPack = makeDomainPack();
    const config = compileDomainConfig(domainPack);

    expect(config.planner.evidence_requirements).toEqual(["cite_sources", "structured_response"]);
  });

  it("builds tool directives that match tool contracts", () => {
    const domainPack = makeDomainPack();
    const config = compileDomainConfig(domainPack);

    expect(config.tools).toHaveLength(2);

    const searchTool = config.tools.find((t) => t.tool_name === "search");
    expect(searchTool).toBeDefined();
    expect(searchTool!.domain_relevance_score).toBe(1.0);
    expect(searchTool!.domain_intent).toBe("Search the knowledge base for relevant documents.");
    expect(searchTool!.failure_modes).toEqual(["no_results", "timeout"]);
    expect(searchTool!.required_arguments).toEqual(["query"]);
    expect(searchTool!.preferred_arguments).toEqual({});

    const executeTool = config.tools.find((t) => t.tool_name === "execute");
    expect(executeTool).toBeDefined();
    expect(executeTool!.required_arguments).toEqual(["command"]);
    expect(executeTool!.failure_modes).toEqual(["command_failed", "sandbox_violation"]);
  });

  it("builds observation directives from evidence sources and failure taxonomy", () => {
    const domainPack = makeDomainPack();
    const config = compileDomainConfig(domainPack);

    expect(config.observation.signal_patterns).toHaveLength(2);
    expect(config.observation.signal_patterns[0]!.source_id).toBe("knowledge-base");
    expect(config.observation.signal_patterns[0]!.pattern_description).toBe(
      "Internal Knowledge Base",
    );
    expect(config.observation.signal_patterns[0]!.extraction_hint).toContain("search_api");
    expect(config.observation.signal_patterns[0]!.extraction_hint).toContain(
      "Curated by domain experts.",
    );

    // Source without trust_notes should show "standard"
    expect(config.observation.signal_patterns[1]!.extraction_hint).toContain("standard");

    expect(config.observation.failure_indicators).toHaveLength(2);
    expect(config.observation.failure_indicators[0]!.failure_id).toBe("hallucination");
    expect(config.observation.failure_indicators[0]!.detection_hints).toEqual([
      "unsupported claim",
      "no source cited",
    ]);
    expect(config.observation.failure_indicators[0]!.severity).toBe("high");
  });

  it("builds retrieval directives from evidence source registry", () => {
    const domainPack = makeDomainPack();
    const config = compileDomainConfig(domainPack);

    expect(config.retrieval.approved_source_ids).toEqual(["knowledge-base", "repo-docs"]);
    expect(config.retrieval.source_descriptions["knowledge-base"]).toBe("Internal Knowledge Base");
    expect(config.retrieval.source_descriptions["repo-docs"]).toBe("Repository Documentation");

    // Only knowledge-base has freshness_expectation
    expect(config.retrieval.freshness_expectations["knowledge-base"]).toBe("updated_daily");
    expect(config.retrieval.freshness_expectations["repo-docs"]).toBeUndefined();
  });

  it("builds exemplar directives from benchmark seed specs", () => {
    const domainPack = makeDomainPack();
    const config = compileDomainConfig(domainPack);

    expect(config.exemplars).toHaveLength(2);

    expect(config.exemplars[0]!.seed_id).toBe("seed-alpha-1");
    expect(config.exemplars[0]!.task_family_id).toBe("task-family-alpha");
    expect(config.exemplars[0]!.prompt).toBe(
      "Explain how the API endpoint handles authentication.",
    );
    expect(config.exemplars[0]!.pass_conditions).toEqual([
      "mentions_auth_mechanism",
      "cites_source",
    ]);
    expect(config.exemplars[0]!.hard_fail_conditions).toEqual(["fabricated_endpoint"]);

    expect(config.exemplars[1]!.seed_id).toBe("seed-beta-1");
    expect(config.exemplars[1]!.task_family_id).toBe("task-family-beta");
    expect(config.exemplars[1]!.hard_fail_conditions).toEqual([]);
  });

  it("builds constraint enforcement directives from domain constraints", () => {
    const domainPack = makeDomainPack();
    const config = compileDomainConfig(domainPack);

    expect(config.constraints).toHaveLength(3);

    expect(config.constraints[0]!.constraint_id).toBe("constraint-grounding");
    expect(config.constraints[0]!.category).toBe("evidence");
    expect(config.constraints[0]!.rule).toBe("All claims must be grounded in approved sources.");
    expect(config.constraints[0]!.severity).toBe("high");
    expect(config.constraints[0]!.rationale).toBe("Prevents hallucination of domain facts.");

    expect(config.constraints[1]!.constraint_id).toBe("constraint-no-pii");
    expect(config.constraints[1]!.rationale).toBeUndefined();

    expect(config.constraints[2]!.severity).toBe("low");
  });

  it("handles empty terminology map gracefully", () => {
    const domainPack = makeDomainPack();
    domainPack.terminology_map = {};
    const config = compileDomainConfig(domainPack);

    expect(config.planner.terminology_guidance).toEqual([]);
  });

  it("handles terminology entries with empty synonyms array", () => {
    const domainPack = makeDomainPack();
    domainPack.terminology_map = {
      widget: {
        canonical_term: "widget",
        synonyms: [],
        definition: "A reusable UI component.",
      },
    };
    const config = compileDomainConfig(domainPack);

    expect(config.planner.terminology_guidance).toHaveLength(1);
    expect(config.planner.terminology_guidance[0]).toContain("N/A");
  });
});

describe("getCompiledDomainConfig", () => {
  afterEach(() => {
    clearAllNicheRunTraceContextsForTest();
  });

  it("returns the compiled config after registration via registerPreparedNicheRunTraceContext", () => {
    const domainPack = makeDomainPack();
    const seed = prepareNicheRunSeed({
      manifest_kind: "candidate",
      manifest: makeCandidateManifest(),
      domain_pack: domainPack,
      source_access_manifest: makeSourceAccessManifest(),
      action_policy_runtime: makeActionPolicyRuntime(),
      verifier_pack_id: "verifier-pack-v1",
      verifier_pack_version: "1.0.0",
      mode: "benchmark",
      runtime_snapshot_id: "runtime-snapshot-1",
      context_bundle_id: "context-bundle-1",
      determinism_policy_id: "determinism-policy-1",
      random_seed: "seed-42",
      replayability_status: "non_replayable",
      determinism_notes: "Test seed for compiled config binding.",
      readiness_report_id: "readiness-report-1",
    });

    const runId = "compiled-config-test-run";
    registerPreparedNicheRunTraceContext({ runId, seed });

    const config = getCompiledDomainConfig(runId);
    expect(config).toBeDefined();
    expect(config!.niche_program_id).toBe("test-niche-program");
    expect(config!.domain_pack_id).toBe("test-domain-pack");
    expect(config!.version).toBe("1.0.0");
    expect(config!.planner.domain_identity).toContain("test-niche-program");
    expect(config!.tools).toHaveLength(2);
    expect(config!.exemplars).toHaveLength(2);
    expect(config!.constraints).toHaveLength(3);
  });

  it("returns undefined for an unknown runId", () => {
    const config = getCompiledDomainConfig("nonexistent-run-id");
    expect(config).toBeUndefined();
  });
});
