import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import {
  IdentifierString,
  NonEmptyString,
  TimestampString,
  VersionString,
  stringEnum,
} from "./common.js";
import { RuntimeComponentSchema } from "./program.js";

export const PROVIDER_METADATA_QUALITY_VALUES = [
  "exact_snapshot",
  "release_label_only",
  "proxy_resolved",
  "opaque_provider",
] as const;
export const ManifestProviderMetadataQualitySchema = stringEnum(PROVIDER_METADATA_QUALITY_VALUES);

const ScalarConfigValueSchema = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  Type.Null(),
]);

export const SamplingConfigSchema = Type.Record(Type.String(), ScalarConfigValueSchema);

export const RetryPolicySchema = Type.Object(
  {
    max_attempts: Type.Integer({ minimum: 0 }),
    backoff_policy: Type.Optional(NonEmptyString),
    retry_on: Type.Optional(Type.Array(NonEmptyString)),
  },
  { additionalProperties: false },
);

export const TokenBudgetSchema = Type.Object(
  {
    max_input_tokens: Type.Optional(Type.Integer({ minimum: 1 })),
    max_output_tokens: Type.Optional(Type.Integer({ minimum: 1 })),
    max_total_tokens: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

export const ContextBudgetSchema = Type.Object(
  {
    max_context_tokens: Type.Optional(Type.Integer({ minimum: 1 })),
    max_retrieval_items: Type.Optional(Type.Integer({ minimum: 1 })),
    max_exemplars: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const SourceAccessManifestSchema = Type.Object(
  {
    source_access_manifest_id: IdentifierString,
    allowed_tools: Type.Array(NonEmptyString, { minItems: 1 }),
    allowed_retrieval_indices: Type.Array(IdentifierString),
    allowed_live_sources: Type.Array(IdentifierString),
    disallowed_sources: Type.Array(IdentifierString),
    sandbox_policy: NonEmptyString,
    network_policy: NonEmptyString,
    approval_policy: NonEmptyString,
  },
  { additionalProperties: false },
);

const SharedManifestFields = {
  niche_program_id: IdentifierString,
  created_at: TimestampString,
  planner_runtime: RuntimeComponentSchema,
  provider: NonEmptyString,
  model_id: NonEmptyString,
  model_snapshot_id: Type.Optional(NonEmptyString),
  api_mode: NonEmptyString,
  provider_release_label: Type.Optional(NonEmptyString),
  api_revision: Type.Optional(NonEmptyString),
  capability_snapshot_at: Type.Optional(TimestampString),
  routing_proxy_version: Type.Optional(VersionString),
  provider_metadata_quality: ManifestProviderMetadataQualitySchema,
  provider_runtime_notes: Type.Optional(NonEmptyString),
  sampling_config: SamplingConfigSchema,
  prompt_asset_version: NonEmptyString,
  grader_set_version: NonEmptyString,
  benchmark_suite_id: IdentifierString,
  source_access_manifest_id: IdentifierString,
  retry_policy: RetryPolicySchema,
  token_budget: TokenBudgetSchema,
  context_budget: ContextBudgetSchema,
  execution_mode: NonEmptyString,
  notes: Type.Optional(NonEmptyString),
} as const;

const ResolvedExecutionPinFields = {
  tool_catalog_version: NonEmptyString,
  tool_allowlist: Type.Array(NonEmptyString, { minItems: 1 }),
  tool_contract_version: NonEmptyString,
  retrieval_config: Type.Unknown(),
  verifier_config: Type.Unknown(),
} as const;

export const BaselineManifestSchema = Type.Object(
  {
    baseline_manifest_id: IdentifierString,
    ...SharedManifestFields,
    ...ResolvedExecutionPinFields,
  },
  { additionalProperties: false },
);

export const CandidateManifestSchema = Type.Object(
  {
    candidate_manifest_id: IdentifierString,
    based_on_baseline_manifest_id: IdentifierString,
    ...SharedManifestFields,
    domain_pack_id: IdentifierString,
    action_policy_id: IdentifierString,
    retrieval_stack_id: IdentifierString,
    verifier_pack_id: IdentifierString,
    ...ResolvedExecutionPinFields,
    optional_student_model_ids: Type.Array(NonEmptyString),
    candidate_recipe: IdentifierString,
  },
  { additionalProperties: false },
);

export const MANIFEST_COMPARISON_ISSUE_CODES = [
  "benchmark_suite_mismatch",
  "provider_mismatch",
  "model_id_mismatch",
  "planner_runtime_mismatch",
  "source_access_mismatch",
  "execution_invariant_mismatch",
] as const;
export const ManifestComparisonIssueCodeSchema = stringEnum(MANIFEST_COMPARISON_ISSUE_CODES);

export const ManifestComparisonIssueSchema = Type.Object(
  {
    code: ManifestComparisonIssueCodeSchema,
    message: NonEmptyString,
  },
  { additionalProperties: false },
);

export type SourceAccessManifest = Static<typeof SourceAccessManifestSchema>;
export type SamplingConfig = Static<typeof SamplingConfigSchema>;
export type RetryPolicy = Static<typeof RetryPolicySchema>;
export type TokenBudget = Static<typeof TokenBudgetSchema>;
export type ContextBudget = Static<typeof ContextBudgetSchema>;
export type BaselineManifest = Static<typeof BaselineManifestSchema>;
export type CandidateManifest = Static<typeof CandidateManifestSchema>;
export type ManifestProviderMetadataQuality = Static<typeof ManifestProviderMetadataQualitySchema>;
export type ManifestComparisonIssueCode = Static<typeof ManifestComparisonIssueCodeSchema>;
export type ManifestComparisonIssue = Static<typeof ManifestComparisonIssueSchema>;

function stableSerializeComparableValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeComparableValue(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableSerializeComparableValue(nestedValue)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function pushExecutionInvariantIssue(issues: ManifestComparisonIssue[], fieldName: string): void {
  issues.push({
    code: "execution_invariant_mismatch",
    message: `Baseline and candidate must use the same ${fieldName} for comparison.`,
  });
}

export function getManifestComparisonIssues(
  baseline: BaselineManifest,
  candidate: CandidateManifest,
  options: { allowCrossModelExperiment?: boolean } = {},
): ManifestComparisonIssue[] {
  const issues: ManifestComparisonIssue[] = [];

  if (baseline.benchmark_suite_id !== candidate.benchmark_suite_id) {
    issues.push({
      code: "benchmark_suite_mismatch",
      message: "Baseline and candidate must use the same benchmark_suite_id for comparison.",
    });
  }

  if (baseline.source_access_manifest_id !== candidate.source_access_manifest_id) {
    issues.push({
      code: "source_access_mismatch",
      message: "Baseline and candidate must use the same source_access_manifest_id for comparison.",
    });
  }

  if (baseline.provider !== candidate.provider) {
    issues.push({
      code: "provider_mismatch",
      message: "Baseline and candidate must use the same provider unless explicitly cross-model.",
    });
  }

  const crossModelAllowed = options.allowCrossModelExperiment === true;
  if (!crossModelAllowed && baseline.model_id !== candidate.model_id) {
    issues.push({
      code: "model_id_mismatch",
      message: "Baseline and candidate must use the same model_id unless explicitly cross-model.",
    });
  }

  if (
    !crossModelAllowed &&
    baseline.planner_runtime.component_id !== candidate.planner_runtime.component_id
  ) {
    issues.push({
      code: "planner_runtime_mismatch",
      message:
        "Baseline and candidate must use the same planner_runtime.component_id unless explicitly cross-model.",
    });
  }

  if (
    !crossModelAllowed &&
    baseline.planner_runtime.provider !== candidate.planner_runtime.provider
  ) {
    pushExecutionInvariantIssue(issues, "planner_runtime.provider");
  }

  if (
    !crossModelAllowed &&
    baseline.planner_runtime.model_id !== candidate.planner_runtime.model_id
  ) {
    pushExecutionInvariantIssue(issues, "planner_runtime.model_id");
  }

  const invariantComparisons: Array<{
    fieldName: string;
    baselineValue: unknown;
    candidateValue: unknown;
  }> = [
    {
      fieldName: "api_mode",
      baselineValue: baseline.api_mode,
      candidateValue: candidate.api_mode,
    },
    {
      fieldName: "planner_runtime.api_mode",
      baselineValue: baseline.planner_runtime.api_mode,
      candidateValue: candidate.planner_runtime.api_mode,
    },
    {
      fieldName: "sampling_config",
      baselineValue: baseline.sampling_config,
      candidateValue: candidate.sampling_config,
    },
    {
      fieldName: "retry_policy",
      baselineValue: baseline.retry_policy,
      candidateValue: candidate.retry_policy,
    },
    {
      fieldName: "token_budget",
      baselineValue: baseline.token_budget,
      candidateValue: candidate.token_budget,
    },
    {
      fieldName: "context_budget",
      baselineValue: baseline.context_budget,
      candidateValue: candidate.context_budget,
    },
    {
      fieldName: "execution_mode",
      baselineValue: baseline.execution_mode,
      candidateValue: candidate.execution_mode,
    },
    {
      fieldName: "grader_set_version",
      baselineValue: baseline.grader_set_version,
      candidateValue: candidate.grader_set_version,
    },
    {
      fieldName: "routing_proxy_version",
      baselineValue: baseline.routing_proxy_version,
      candidateValue: candidate.routing_proxy_version,
    },
    {
      fieldName: "tool_catalog_version",
      baselineValue: baseline.tool_catalog_version,
      candidateValue: candidate.tool_catalog_version,
    },
    {
      fieldName: "tool_allowlist",
      baselineValue: baseline.tool_allowlist,
      candidateValue: candidate.tool_allowlist,
    },
    {
      fieldName: "tool_contract_version",
      baselineValue: baseline.tool_contract_version,
      candidateValue: candidate.tool_contract_version,
    },
    {
      fieldName: "retrieval_config",
      baselineValue: baseline.retrieval_config,
      candidateValue: candidate.retrieval_config,
    },
    {
      fieldName: "verifier_config",
      baselineValue: baseline.verifier_config,
      candidateValue: candidate.verifier_config,
    },
  ];

  if (!crossModelAllowed) {
    invariantComparisons.push(
      {
        fieldName: "model_snapshot_id",
        baselineValue: baseline.model_snapshot_id,
        candidateValue: candidate.model_snapshot_id,
      },
      {
        fieldName: "provider_release_label",
        baselineValue: baseline.provider_release_label,
        candidateValue: candidate.provider_release_label,
      },
      {
        fieldName: "api_revision",
        baselineValue: baseline.api_revision,
        candidateValue: candidate.api_revision,
      },
    );
  }

  for (const comparison of invariantComparisons) {
    if (
      stableSerializeComparableValue(comparison.baselineValue) !==
      stableSerializeComparableValue(comparison.candidateValue)
    ) {
      pushExecutionInvariantIssue(issues, comparison.fieldName);
    }
  }

  return issues;
}

export function areManifestsBenchmarkComparable(
  baseline: BaselineManifest,
  candidate: CandidateManifest,
  options?: { allowCrossModelExperiment?: boolean },
): boolean {
  return getManifestComparisonIssues(baseline, candidate, options).length === 0;
}
