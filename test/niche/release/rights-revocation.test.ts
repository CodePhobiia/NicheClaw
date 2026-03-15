import { describe, expect, it } from "vitest";
import {
  compileDomainPack,
  materializeCompiledDomainPackArtifact,
  materializeNormalizedSourceArtifacts,
  normalizeSourceDescriptors,
  type SourceDescriptor,
} from "../../../src/niche/domain/index.js";
import {
  buildInvalidationPlan,
  traceRightsRevocationImpact,
} from "../../../src/niche/release/index.js";
import type {
  Artifact,
  ArtifactRightsState,
  CandidateManifest,
  CandidateRelease,
} from "../../../src/niche/schema/index.js";
import { createArtifactRecord, writeLineageEdges } from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const FULL_RIGHTS: ArtifactRightsState = {
  rights_to_store: true,
  rights_to_train: true,
  rights_to_benchmark: true,
  rights_to_derive: true,
  rights_to_distill: true,
  rights_to_generate_synthetic_from: true,
};

function makeArtifact(params: {
  artifactId: string;
  artifactType: Artifact["artifact_type"];
  governedDataStatus?: Artifact["governed_data_status"];
  lineage?: Artifact["lineage"];
}): Artifact {
  return {
    artifact_id: params.artifactId,
    artifact_type: params.artifactType,
    version: "2026.3.12",
    producer: "nicheclaw",
    source_trace_refs: [],
    dataset_refs: [],
    metrics: {},
    governed_data_status: params.governedDataStatus,
    created_at: "2026-03-12T12:40:00.000Z",
    lineage: params.lineage ?? [],
  };
}

function makeCandidateManifest(): CandidateManifest {
  return {
    candidate_manifest_id: "candidate-manifest-v1",
    based_on_baseline_manifest_id: "baseline-manifest-v1",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T12:41:00.000Z",
    planner_runtime: {
      component_id: "planner-runtime-v1",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
    },
    provider: "openai",
    model_id: "gpt-5",
    api_mode: "responses",
    provider_release_label: "2026.03",
    api_revision: "2026-03-01",
    capability_snapshot_at: "2026-03-12T12:41:00.000Z",
    provider_metadata_quality: "release_label_only",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "prompt-v2",
    grader_set_version: "grader-set-v2",
    benchmark_suite_id: "repo-ci-suite",
    source_access_manifest_id: "source-access-v1",
    retry_policy: {
      max_attempts: 1,
    },
    token_budget: {
      max_total_tokens: 8000,
    },
    context_budget: {
      max_context_tokens: 16000,
    },
    execution_mode: "benchmark",
    domain_pack_id: "domain-pack-v1",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    tool_catalog_version: "tool-catalog-v1",
    tool_allowlist: ["exec", "read"],
    tool_contract_version: "tool-contract-v1",
    retrieval_config: {
      stack: "retrieval-v1",
    },
    verifier_config: {
      pack: "verifier-v1",
    },
    optional_student_model_ids: ["student-model-v1"],
    candidate_recipe: "candidate-recipe-v1",
  };
}

function makeCandidateRelease(): CandidateRelease {
  return {
    candidate_release_id: "candidate-release-v1",
    niche_program_id: "repo-ci-specialist",
    baseline_release_id: "baseline-release-v1",
    stack_manifest: {
      baseline_manifest_id: "baseline-manifest-v1",
      candidate_manifest_id: "candidate-manifest-v1",
      component_artifact_refs: [
        {
          artifact_id: "release-bundle-v1",
          artifact_type: "release_bundle",
          version: "2026.3.12",
          content_hash: "0123456789abcdef0123456789abcdef",
          rights_state: FULL_RIGHTS,
          created_at: "2026-03-12T12:42:00.000Z",
        },
      ],
    },
    benchmark_results: [
      {
        benchmark_result_id: "benchmark-1",
        benchmark_suite_id: "repo-ci-suite",
        case_kind: "atomic_case",
        mode: "offline_gold",
        baseline_arm_id: "baseline-manifest-v1",
        candidate_arm_id: "candidate-manifest-v1",
        baseline_provider_metadata_quality: "release_label_only",
        candidate_provider_metadata_quality: "release_label_only",
        primary_metric: "task_success",
        case_count: 120,
        paired_delta_summary: {
          mean_delta: 0.08,
          median_delta: 0.08,
          p10_delta: 0.03,
          p90_delta: 0.1,
          confidence_interval_low: 0.02,
          confidence_interval_high: 0.12,
        },
        task_family_summaries: [
          {
            task_family: "repo-ci-verification",
            case_count: 120,
            score_mean: 0.82,
            hard_fail_rate: 0.02,
            mean_delta: 0.08,
          },
        ],
        contamination_audit_summary: {
          contamination_detected: false,
          audited_case_count: 120,
        },
        invalidated: false,
        invalidation_reasons: [],
      },
    ],
    shadow_results: [],
    decision: "promoted",
    decision_reason: "Strong benchmark and shadow evidence.",
    approved_by: ["release-operator"],
    rollback_target: "baseline-release-v1",
  };
}

describe("rights revocation and invalidation planning", () => {
  it("traces revoked upstream sources through derivative artifacts and promoted releases", async () => {
    await withTempHome(async () => {
      createArtifactRecord({
        artifact: makeArtifact({
          artifactId: "dataset-approved",
          artifactType: "dataset",
          governedDataStatus: {
            data_zone: "dev",
            retention_policy: "retain",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            quarantined: false,
          },
        }),
        rightsState: FULL_RIGHTS,
        env: process.env,
      });
      createArtifactRecord({
        artifact: makeArtifact({
          artifactId: "candidate-recipe-v1",
          artifactType: "candidate_recipe",
        }),
        rightsState: FULL_RIGHTS,
        env: process.env,
      });
      createArtifactRecord({
        artifact: makeArtifact({
          artifactId: "release-bundle-v1",
          artifactType: "release_bundle",
        }),
        rightsState: FULL_RIGHTS,
        env: process.env,
      });
      createArtifactRecord({
        artifact: makeArtifact({
          artifactId: "student-model-v1",
          artifactType: "student_model",
        }),
        rightsState: FULL_RIGHTS,
        env: process.env,
      });

      writeLineageEdges(
        "dataset-approved",
        [
          {
            parent_artifact_id: "source-doc-1",
            relationship: "compiled_from",
            derivation_step: "ingest",
            notes: "Derived from approved source.",
          },
        ],
        process.env,
      );
      writeLineageEdges(
        "candidate-recipe-v1",
        [
          {
            parent_artifact_id: "dataset-approved",
            relationship: "trained_from",
            derivation_step: "recipe-build",
            notes: "Candidate recipe uses compiled dataset.",
          },
        ],
        process.env,
      );
      writeLineageEdges(
        "release-bundle-v1",
        [
          {
            parent_artifact_id: "candidate-recipe-v1",
            relationship: "packaged_from",
            derivation_step: "release-build",
            notes: "Release bundle depends on candidate recipe.",
          },
        ],
        process.env,
      );
      writeLineageEdges(
        "student-model-v1",
        [
          {
            parent_artifact_id: "candidate-recipe-v1",
            relationship: "distilled_from",
            derivation_step: "student-model-build",
            notes: "Student model depends on candidate recipe.",
          },
        ],
        process.env,
      );

      const impact = traceRightsRevocationImpact({
        revokedSourceIds: ["source-doc-1"],
        candidateManifests: [makeCandidateManifest()],
        candidateReleases: [makeCandidateRelease()],
        env: process.env,
      });

      expect(impact.impacted_artifact_ids).toEqual([
        "candidate-recipe-v1",
        "dataset-approved",
        "release-bundle-v1",
        "student-model-v1",
      ]);
      expect(impact.impacted_candidate_recipe_ids).toEqual(["candidate-recipe-v1"]);
      expect(impact.impacted_candidate_manifest_ids).toEqual(["candidate-manifest-v1"]);
      expect(impact.impacted_candidate_release_ids).toEqual(["candidate-release-v1"]);
      expect(impact.impacted_promoted_release_ids).toEqual(["candidate-release-v1"]);

      const plan = buildInvalidationPlan({
        impact,
        generatedAt: "2026-03-12T12:45:00.000Z",
        candidateReleases: [makeCandidateRelease()],
        env: process.env,
      });

      expect(plan.summary.quarantine_count).toBeGreaterThanOrEqual(3);
      expect(plan.summary.rebuild_count).toBeGreaterThanOrEqual(2);
      expect(plan.summary.rollback_count).toBe(1);
      expect(
        plan.actions.some(
          (action) =>
            action.target_type === "promoted_release" &&
            action.target_id === "candidate-release-v1" &&
            action.action === "rollback",
        ),
      ).toBe(true);
    });
  });

  it("builds rebuild requirements for revoked upstream artifacts without needing destructive side effects", async () => {
    await withTempHome(async () => {
      createArtifactRecord({
        artifact: makeArtifact({
          artifactId: "candidate-recipe-v1",
          artifactType: "candidate_recipe",
        }),
        rightsState: FULL_RIGHTS,
        env: process.env,
      });
      createArtifactRecord({
        artifact: makeArtifact({
          artifactId: "release-bundle-v1",
          artifactType: "release_bundle",
        }),
        rightsState: FULL_RIGHTS,
        env: process.env,
      });
      writeLineageEdges(
        "release-bundle-v1",
        [
          {
            parent_artifact_id: "candidate-recipe-v1",
            relationship: "packaged_from",
            derivation_step: "release-build",
            notes: "Release bundle depends on candidate recipe.",
          },
        ],
        process.env,
      );

      const impact = traceRightsRevocationImpact({
        revokedArtifactIds: ["candidate-recipe-v1"],
        candidateManifests: [makeCandidateManifest()],
        candidateReleases: [makeCandidateRelease()],
        env: process.env,
      });
      const plan = buildInvalidationPlan({
        impact,
        generatedAt: "2026-03-12T12:46:00.000Z",
        candidateReleases: [makeCandidateRelease()],
        env: process.env,
      });

      expect(impact.impacted_artifact_ids).toContain("candidate-recipe-v1");
      expect(impact.impacted_artifact_ids).toContain("release-bundle-v1");
      expect(
        plan.actions.some(
          (action) =>
            action.target_type === "artifact" &&
            action.target_id === "candidate-recipe-v1" &&
            action.action === "delete",
        ),
      ).toBe(true);
      expect(
        plan.actions.some(
          (action) =>
            action.target_type === "artifact" &&
            action.target_id === "release-bundle-v1" &&
            action.action === "rebuild",
        ),
      ).toBe(true);
    });
  });

  it("uses ingest-authored lineage when tracing revoked source impact", async () => {
    await withTempHome(async () => {
      const sources: SourceDescriptor[] = [
        {
          sourceId: "source-doc-1",
          sourceKind: "documents",
          inputKind: "structured_text",
          title: "Approved Source",
          text: "Approved repo source content.",
          accessPattern: "read_only",
          rights: {
            rights_to_store: true,
            rights_to_train: true,
            rights_to_benchmark: true,
            rights_to_derive: true,
            rights_to_distill: true,
            rights_to_generate_synthetic_from: true,
            retention_policy: "retain",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            data_zone: "dev",
          },
        },
      ];
      const normalizedSources = await normalizeSourceDescriptors(sources);
      const sourceArtifacts = materializeNormalizedSourceArtifacts(normalizedSources, process.env);
      const compiled = compileDomainPack({
        nicheProgram: {
          niche_program_id: "repo-ci-specialist",
          name: "Repo CI Specialist",
          objective: "Improve repo execution quality.",
          risk_class: "moderate",
          runtime_stack: {
            planner_runtime: {
              component_id: "planner-runtime-v1",
              provider: "openai",
              model_id: "gpt-5",
              api_mode: "responses",
            },
            retrieval_components: [],
            verifier_components: [],
            specialization_lanes: ["system_specialization"],
          },
          allowed_tools: ["exec", "read"],
          allowed_sources: [
            {
              source_id: "source-doc-1",
              source_kind: "documents",
              description: "Approved source",
              access_pattern: "read_only",
            },
          ],
          success_metrics: [
            {
              metric_id: "task-success",
              label: "Task success",
              objective: "maximize",
              target_description: "Improve held-out task completion.",
              measurement_method: "benchmark grading",
            },
          ],
          rights_and_data_policy: {
            storage_policy: "store approved sources",
            training_policy: "train only on approved sources",
            benchmark_policy: "keep eval sources held out",
            retention_policy: "retain according to governance policy",
            redaction_policy: "redact sensitive material first",
            pii_policy: "avoid unreviewed PII",
            live_trace_reuse_policy: "embargo live traces before reuse",
            operator_review_required: true,
          },
        },
        version: "2026.3.12",
        sources: normalizedSources,
      });
      materializeCompiledDomainPackArtifact({
        domainPack: compiled.domainPack,
        sourceArtifactRefs: sourceArtifacts.map((artifact) => artifact.ref),
        createdAt: "2026-03-12T12:44:00.000Z",
        env: process.env,
      });

      const impact = traceRightsRevocationImpact({
        revokedSourceIds: ["source-doc-1"],
        candidateManifests: [
          {
            ...makeCandidateManifest(),
            domain_pack_id: compiled.domainPack.domain_pack_id,
          },
        ],
        env: process.env,
      });

      expect(impact.impacted_artifact_ids).toEqual(
        expect.arrayContaining([compiled.domainPack.domain_pack_id, "source-doc-1-dataset"]),
      );
      expect(impact.impacted_candidate_manifest_ids).toEqual(["candidate-manifest-v1"]);
    });
  });

  it("propagates student-model-only revocation into rebuild planning", async () => {
    await withTempHome(async () => {
      createArtifactRecord({
        artifact: makeArtifact({
          artifactId: "student-model-v1",
          artifactType: "student_model",
        }),
        rightsState: FULL_RIGHTS,
        env: process.env,
      });
      writeLineageEdges(
        "student-model-v1",
        [
          {
            parent_artifact_id: "dataset-approved",
            relationship: "distilled_from",
            derivation_step: "student-model-build",
            notes: "Student model distilled from approved dataset.",
          },
        ],
        process.env,
      );

      const impact = traceRightsRevocationImpact({
        revokedArtifactIds: ["student-model-v1"],
        candidateManifests: [
          {
            ...makeCandidateManifest(),
            candidate_recipe: "candidate-recipe-unaffected",
          },
        ],
        candidateReleases: [makeCandidateRelease()],
        env: process.env,
      });
      const plan = buildInvalidationPlan({
        impact,
        generatedAt: "2026-03-12T12:47:00.000Z",
        candidateReleases: [makeCandidateRelease()],
        env: process.env,
      });

      expect(impact.impacted_candidate_manifest_ids).toEqual(["candidate-manifest-v1"]);
      expect(impact.impacted_candidate_recipe_ids).toEqual([]);
      expect(
        plan.actions.some(
          (action) =>
            action.target_type === "artifact" &&
            action.target_id === "student-model-v1" &&
            action.action === "rebuild",
        ),
      ).toBe(true);
    });
  });
});
