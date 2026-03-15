import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { NicheStackReleaseModeSchema, NicheStackResolutionSourceSchema } from "./activation.js";
import {
  HashString,
  IdentifierString,
  NonEmptyString,
  TimestampString,
  stringEnum,
} from "./common.js";
import { DomainPackSchema } from "./domain-pack.js";
import { SourceAccessManifestSchema } from "./manifests.js";
import { ArtifactRefSchema } from "./release.js";
import {
  BenchmarkCaseReferenceSchema,
  EvidenceBundleRefSchema,
  ReplayabilityStatusSchema,
  RunTraceModeSchema,
} from "./trace.js";

export const PREPARED_NICHE_RUN_SEED_MANIFEST_KINDS = ["baseline", "candidate"] as const;
export const PreparedNicheRunSeedManifestKindSchema = stringEnum(
  PREPARED_NICHE_RUN_SEED_MANIFEST_KINDS,
);

export const PreparedNicheActionPolicyToolScoreSchema = Type.Object(
  {
    rationale: Type.Optional(NonEmptyString),
    domain_match_score: Type.Optional(Type.Number()),
    reliability_score: Type.Optional(Type.Number()),
    risk_score: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
);

export const PreparedNicheActionPolicyRuntimeSchema = Type.Object(
  {
    allowed_tools: Type.Array(NonEmptyString, { minItems: 1 }),
    required_arguments_by_tool: Type.Optional(
      Type.Record(Type.String(), Type.Array(NonEmptyString)),
    ),
    permission_denied_tools: Type.Optional(Type.Array(NonEmptyString)),
    domain_constraint_violations_by_tool: Type.Optional(
      Type.Record(Type.String(), Type.Array(NonEmptyString)),
    ),
    release_constraint_violations_by_tool: Type.Optional(
      Type.Record(Type.String(), Type.Array(NonEmptyString)),
    ),
    scoring_by_tool: Type.Optional(
      Type.Record(Type.String(), PreparedNicheActionPolicyToolScoreSchema),
    ),
    max_repair_attempts: Type.Optional(Type.Integer({ minimum: 0 })),
    max_retry_attempts: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const PreparedVerifierReleaseGuardrailsSchema = Type.Object(
  {
    max_latency_added_ms: Type.Optional(Type.Number({ minimum: 0 })),
    max_cost_added: Type.Optional(Type.Number({ minimum: 0 })),
    veto_on_blocking_findings: Type.Optional(Type.Boolean()),
    escalate_on_low_confidence: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const PreparedVerifierPackConfigSnapshotSchema = Type.Object(
  {
    verifier_pack_id: NonEmptyString,
    version: NonEmptyString,
    required_checks: Type.Array(NonEmptyString),
    blocking_failure_ids: Type.Array(IdentifierString),
    output_requirements: Type.Array(NonEmptyString),
    escalation_policy: NonEmptyString,
    min_confidence: Type.Number(),
    max_allowed_ungrounded_claims: Type.Number({ minimum: 0 }),
    require_evidence_bundles: Type.Optional(Type.Boolean()),
    release_guardrails: Type.Optional(PreparedVerifierReleaseGuardrailsSchema),
  },
  { additionalProperties: false },
);

export const PreparedNicheEnvironmentSnapshotSchema = Type.Object(
  {
    environment_hash: HashString,
    platform: NonEmptyString,
    notes: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const PreparedNicheRunSeedSchema = Type.Object(
  {
    seed_id: IdentifierString,
    prepared_at: TimestampString,
    mode: RunTraceModeSchema,
    manifest_kind: PreparedNicheRunSeedManifestKindSchema,
    baseline_or_candidate_manifest_id: IdentifierString,
    readiness_report_id: IdentifierString,
    niche_program_id: IdentifierString,
    domain_pack_id: IdentifierString,
    domain_pack: DomainPackSchema,
    source_access_manifest: SourceAccessManifestSchema,
    action_policy_runtime: PreparedNicheActionPolicyRuntimeSchema,
    verifier_pack_config: PreparedVerifierPackConfigSnapshotSchema,
    planner_version_id: IdentifierString,
    action_policy_version_id: IdentifierString,
    verifier_pack_version_id: IdentifierString,
    retrieval_stack_version_id: IdentifierString,
    grader_set_version_id: IdentifierString,
    runtime_snapshot_id: IdentifierString,
    context_bundle_id: IdentifierString,
    determinism_policy_id: IdentifierString,
    random_seed: NonEmptyString,
    replayability_status: ReplayabilityStatusSchema,
    determinism_notes: NonEmptyString,
    active_stack_id: Type.Optional(IdentifierString),
    resolution_source: Type.Optional(NicheStackResolutionSourceSchema),
    resolved_release_mode: Type.Optional(NicheStackReleaseModeSchema),
    artifact_refs: Type.Array(ArtifactRefSchema),
    evidence_bundle_refs: Type.Array(EvidenceBundleRefSchema),
    benchmark_suite_id: Type.Optional(IdentifierString),
    benchmark_arm_id: Type.Optional(IdentifierString),
    benchmark_case_ref: Type.Optional(BenchmarkCaseReferenceSchema),
    suite_hash: Type.Optional(HashString),
    fixture_version: Type.Optional(NonEmptyString),
    environment_snapshot: Type.Optional(PreparedNicheEnvironmentSnapshotSchema),
  },
  { additionalProperties: false },
);

export type PreparedNicheRunSeedManifestKind = Static<
  typeof PreparedNicheRunSeedManifestKindSchema
>;
export type PreparedNicheActionPolicyRuntime = Static<
  typeof PreparedNicheActionPolicyRuntimeSchema
>;
export type PreparedVerifierReleaseGuardrails = Static<
  typeof PreparedVerifierReleaseGuardrailsSchema
>;
export type PreparedVerifierPackConfigSnapshot = Static<
  typeof PreparedVerifierPackConfigSnapshotSchema
>;
export type PreparedNicheEnvironmentSnapshot = Static<
  typeof PreparedNicheEnvironmentSnapshotSchema
>;
export type PreparedNicheRunSeed = Static<typeof PreparedNicheRunSeedSchema>;
