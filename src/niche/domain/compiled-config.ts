import type { DomainPack } from "../schema/index.js";

export type PlannerDirectives = {
  domain_identity: string;
  reasoning_constraints: string[];
  terminology_guidance: string[];
  task_decomposition_hints: string[];
  failure_awareness: string[];
  evidence_requirements: string[];
};

export type ToolDirective = {
  tool_name: string;
  domain_relevance_score: number;
  preferred_arguments: Record<string, string>;
  domain_intent: string;
  failure_modes: string[];
  required_arguments: string[];
};

export type ObservationDirective = {
  signal_patterns: Array<{
    source_id: string;
    pattern_description: string;
    extraction_hint: string;
  }>;
  failure_indicators: Array<{
    failure_id: string;
    detection_hints: string[];
    severity: string;
  }>;
};

export type RetrievalDirective = {
  approved_source_ids: string[];
  source_descriptions: Record<string, string>;
  freshness_expectations: Record<string, string>;
};

export type ExemplarDirective = {
  seed_id: string;
  task_family_id: string;
  prompt: string;
  pass_conditions: string[];
  hard_fail_conditions: string[];
};

export type ConstraintEnforcementDirective = {
  constraint_id: string;
  category: string;
  rule: string;
  severity: string;
  rationale?: string;
};

export type CompiledDomainConfig = {
  niche_program_id: string;
  domain_pack_id: string;
  version: string;
  compiled_at: string;
  planner: PlannerDirectives;
  tools: ToolDirective[];
  observation: ObservationDirective;
  retrieval: RetrievalDirective;
  exemplars: ExemplarDirective[];
  constraints: ConstraintEnforcementDirective[];
};

export function compileDomainConfig(
  domainPack: DomainPack,
  compiledAt?: string,
): CompiledDomainConfig {
  const now = compiledAt ?? new Date().toISOString();

  const planner: PlannerDirectives = {
    domain_identity: `You are a specialist in ${domainPack.niche_program_id}. Your responses must be grounded in approved domain evidence.`,
    reasoning_constraints: domainPack.constraints.map(
      (c) => `[${c.severity}] ${c.rule}${c.rationale ? ` — ${c.rationale}` : ""}`,
    ),
    terminology_guidance: Object.entries(domainPack.terminology_map).map(
      ([_term, entry]) =>
        `Use "${entry.canonical_term}" (not ${entry.synonyms.length > 0 ? entry.synonyms.join(", ") : "N/A"}): ${entry.definition ?? ""}`,
    ),
    task_decomposition_hints: domainPack.task_taxonomy.map(
      (t) => `Task family "${t.label}": requires [${t.required_capabilities.join(", ")}]`,
    ),
    failure_awareness: domainPack.failure_taxonomy.map(
      (f) =>
        `Avoid "${f.label}" (${f.severity}): ${f.description}. Detection hints: ${f.detection_hints.join(", ")}`,
    ),
    evidence_requirements: [...domainPack.verifier_defaults.output_requirements],
  };

  const tools: ToolDirective[] = domainPack.tool_contracts.map((tc) => ({
    tool_name: tc.tool_name,
    domain_relevance_score: 1.0,
    preferred_arguments: {},
    domain_intent: tc.intent_summary,
    failure_modes: [...tc.failure_modes],
    required_arguments: [...tc.required_arguments],
  }));

  const observation: ObservationDirective = {
    signal_patterns: domainPack.evidence_source_registry.map((src) => ({
      source_id: src.source_id,
      pattern_description: src.title,
      extraction_hint: `Access via ${src.access_pattern}. Trust: ${src.trust_notes ?? "standard"}.`,
    })),
    failure_indicators: domainPack.failure_taxonomy.map((f) => ({
      failure_id: f.failure_id,
      detection_hints: [...f.detection_hints],
      severity: f.severity,
    })),
  };

  const retrieval: RetrievalDirective = {
    approved_source_ids: domainPack.evidence_source_registry.map((src) => src.source_id),
    source_descriptions: Object.fromEntries(
      domainPack.evidence_source_registry.map((src) => [src.source_id, src.title]),
    ),
    freshness_expectations: Object.fromEntries(
      domainPack.evidence_source_registry
        .filter((src) => src.freshness_expectation)
        .map((src) => [src.source_id, src.freshness_expectation!]),
    ),
  };

  const exemplars: ExemplarDirective[] = domainPack.benchmark_seed_specs.map((seed) => ({
    seed_id: seed.seed_id,
    task_family_id: seed.task_family_id,
    prompt: seed.prompt,
    pass_conditions: [...seed.pass_conditions],
    hard_fail_conditions: [...seed.hard_fail_conditions],
  }));

  const constraints: ConstraintEnforcementDirective[] = domainPack.constraints.map((c) => ({
    constraint_id: c.constraint_id,
    category: c.category,
    rule: c.rule,
    severity: c.severity,
    rationale: c.rationale,
  }));

  return {
    niche_program_id: domainPack.niche_program_id,
    domain_pack_id: domainPack.domain_pack_id,
    version: domainPack.version,
    compiled_at: now,
    planner,
    tools,
    observation,
    retrieval,
    exemplars,
    constraints,
  };
}
