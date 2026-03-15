import { computeBenchmarkSuiteHash } from "../benchmark/fixture-versioning.js";
import type { AtomicBenchmarkSuiteRecord } from "../benchmark/suite-registry.js";
import type { NicheCompilationRecord } from "../schema/index.js";

/**
 * Builds an atomic benchmark suite from a compilation record's
 * benchmark seed hints and task taxonomy. This bridges the gap between
 * compilation output and benchmark input, eliminating the need for
 * operators to hand-author benchmark suite JSON.
 */
export function buildBenchmarkSuiteFromCompilation(params: {
  compilationRecord: NicheCompilationRecord;
  suiteId?: string;
  suiteVersion?: string;
  fixtureVersion?: string;
  createdAt?: string;
  determinismPolicyId?: string;
}): AtomicBenchmarkSuiteRecord {
  const nicheProgramId = params.compilationRecord.niche_program_id;
  const version = params.compilationRecord.version;
  const now = params.createdAt ?? new Date().toISOString();
  const suiteId = params.suiteId ?? `${nicheProgramId}-suite`;
  const suiteVersion = params.suiteVersion ?? version;
  const fixtureVersion = params.fixtureVersion ?? `${version}-fixtures`;
  const determinismPolicyId = params.determinismPolicyId ?? `${nicheProgramId}-determinism-v1`;

  const seedHints = params.compilationRecord.benchmark_seed_hints;
  const domainPack = params.compilationRecord.domain_pack;

  // Build eval cases from seed hints.
  const cases: AtomicBenchmarkSuiteRecord["cases"] = seedHints.map((hint) => ({
    eval_case_id: hint.seedId,
    suite_id: suiteId,
    split: "gold_eval" as const,
    task_family: hint.taskFamilyId,
    input: { prompt: hint.prompt },
    allowed_tools: domainPack.tool_contracts.map((tc) => tc.tool_name),
    allowed_sources: hint.sourceRefs,
    grader_spec: {
      grader_refs: [`grader-${nicheProgramId}-task-success`],
      primary_metric: "task_success",
    },
    pass_conditions: hint.passConditions,
    hard_fail_conditions: hint.hardFailConditions ?? [],
    difficulty: 1,
    seed: `${hint.seedId}-seed`,
  }));

  if (cases.length === 0) {
    throw new Error(
      "Cannot build a benchmark suite: compilation record has no benchmark seed hints. " +
        "Add benchmark_seed source descriptors and recompile.",
    );
  }

  // Collect unique task families for metadata.
  const taskFamilies = [...new Set(cases.map((c) => c.task_family))].toSorted((a, b) =>
    a.localeCompare(b),
  );

  const metadataBase = {
    benchmark_suite_id: suiteId,
    case_kind: "atomic_case" as const,
    mode: "offline_gold" as const,
    split: "gold_eval" as const,
    created_at: now,
    suite_version: suiteVersion,
    fixture_version: fixtureVersion,
    determinism_policy_id: determinismPolicyId,
    task_families: taskFamilies,
    description: `Auto-generated atomic benchmark suite for ${nicheProgramId}.`,
  };

  const suiteHash = computeBenchmarkSuiteHash({ metadata: metadataBase, cases });

  return {
    metadata: { ...metadataBase, suite_hash: suiteHash },
    cases,
  };
}
