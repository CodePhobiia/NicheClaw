import type { DomainPack, FailureMode, NicheProgram } from "../schema/index.js";
import type {
  CompilerBenchmarkSeedHint,
  NormalizedSourceRecord,
} from "./source-types.js";

function toIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function buildFailureTaxonomy(sources: NormalizedSourceRecord[]): FailureMode[] {
  const failures: FailureMode[] = [
    {
      failure_id: "missing_evidence",
      label: "Missing evidence",
      description: "The compiled domain could not ground the output in approved evidence.",
      severity: "high",
      detection_hints: ["missing citation", "no evidence"],
    },
    {
      failure_id: "stale_source",
      label: "Stale source",
      description: "The source is outdated or no longer reflects the live workflow.",
      severity: "moderate",
      detection_hints: ["outdated file", "stale data"],
    },
  ];

  if (sources.some((source) => !source.rights.rights_to_train)) {
    failures.push({
      failure_id: "insufficient_training_rights",
      label: "Insufficient training rights",
      description: "One or more sources cannot be reused for training artifacts.",
      severity: "high",
      detection_hints: ["rights mismatch", "training not permitted"],
    });
  }

  return failures;
}

export function compileDomainPack(params: {
  nicheProgram: NicheProgram;
  version: string;
  sources: NormalizedSourceRecord[];
}): {
  domainPack: DomainPack;
  benchmarkSeedHints: CompilerBenchmarkSeedHint[];
  evidenceSourceRegistry: DomainPack["evidence_source_registry"];
} {
  const sources = [...params.sources].toSorted((left, right) =>
    left.sourceId.localeCompare(right.sourceId),
  );
  const failureTaxonomy = buildFailureTaxonomy(sources);

  const benchmarkSeedHints: CompilerBenchmarkSeedHint[] = sources
    .filter((source) => source.benchmarkSeed !== undefined)
    .map((source) => ({
      seedId: `${source.sourceId}-seed`,
      taskFamilyId: source.benchmarkSeed?.taskFamilyId ?? `${toIdentifier(source.sourceKind)}-analysis`,
      prompt: source.benchmarkSeed?.prompt ?? source.normalizedContent,
      sourceRefs: [source.sourceId],
      passConditions: source.benchmarkSeed?.passConditions ?? ["grounded_response"],
      hardFailConditions:
        source.benchmarkSeed?.hardFailConditions ?? ["unapproved_source_use"],
    }));

  if (benchmarkSeedHints.length === 0 && sources.length > 0) {
    const first = sources[0];
    benchmarkSeedHints.push({
      seedId: `${first.sourceId}-seed`,
      taskFamilyId: `${toIdentifier(first.sourceKind)}-analysis`,
      prompt: `Analyze the approved source "${first.title}" and extract grounded workflow evidence.`,
      sourceRefs: [first.sourceId],
      passConditions: ["grounded_response"],
      hardFailConditions: ["unapproved_source_use"],
    });
  }

  const taskFamilies = [...new Set(benchmarkSeedHints.map((hint) => hint.taskFamilyId))]
    .map((taskFamilyId) => ({
      task_family_id: taskFamilyId,
      label: taskFamilyId.replace(/-/g, " "),
      description: `Compiled task family for ${taskFamilyId}.`,
      benchmarkable: true,
      required_capabilities: ["evidence_grounding", "tool_selection"],
    }))
    .toSorted((left, right) => left.task_family_id.localeCompare(right.task_family_id));

  const evidenceSourceRegistry = sources.map((source) => ({
    source_id: source.sourceId,
    source_kind: source.sourceKind,
    title: source.title,
    access_pattern: source.accessPattern,
    freshness_expectation: source.freshnessExpectation,
    trust_notes: source.trustNotes,
  }));

  const domainPack: DomainPack = {
    domain_pack_id: `${params.nicheProgram.niche_program_id}-pack`,
    niche_program_id: params.nicheProgram.niche_program_id,
    version: params.version,
    ontology: {
      concepts: sources.map((source) => ({
        id: source.sourceId,
        label: source.title,
        description: source.normalizedContent.slice(0, 160) || source.title,
      })),
      relations: [],
    },
    task_taxonomy: taskFamilies,
    terminology_map: Object.fromEntries(
      sources.map((source) => [
        toIdentifier(source.title),
        {
          canonical_term: source.title,
          synonyms: [source.sourceKind.replaceAll("_", " ")],
          definition: source.normalizedContent.slice(0, 160) || source.title,
        },
      ]),
    ),
    constraints: [
      {
        constraint_id: "allowed-tools-only",
        category: "tooling",
        rule: "Only operator-approved tools may be used during execution.",
        rationale: "Keeps the niche bounded to the declared workflow surface.",
        severity: params.nicheProgram.risk_class,
      },
    ],
    tool_contracts: params.nicheProgram.allowed_tools.map((toolName) => ({
      tool_name: toolName,
      intent_summary: `Use ${toolName} only when it advances the approved niche workflow.`,
      required_arguments: [],
      optional_arguments: [],
      failure_modes: failureTaxonomy.map((failure) => failure.failure_id),
    })),
    evidence_source_registry: evidenceSourceRegistry,
    failure_taxonomy: failureTaxonomy,
    verifier_defaults: {
      required_checks: ["evidence_grounding", "output_constraints"],
      blocking_failure_ids: failureTaxonomy.map((failure) => failure.failure_id),
      output_requirements: ["grounded_response"],
      escalation_policy: "Escalate when benchmark evidence or source rights are insufficient.",
    },
    benchmark_seed_specs: benchmarkSeedHints.map((hint) => ({
      seed_id: hint.seedId,
      task_family_id: hint.taskFamilyId,
      prompt: hint.prompt,
      source_refs: hint.sourceRefs,
      pass_conditions: hint.passConditions,
      hard_fail_conditions: hint.hardFailConditions,
    })),
  };

  return {
    domainPack,
    benchmarkSeedHints,
    evidenceSourceRegistry,
  };
}
