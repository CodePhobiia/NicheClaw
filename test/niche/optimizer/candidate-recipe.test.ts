import { describe, expect, it } from "vitest";
import { computeStableContentHash } from "../../../src/niche/benchmark/index.js";
import {
  buildTeacherRolloutRequest,
  generateSyntheticTaskInputs,
  generateTraceDerivedExamples,
  materializeCandidateRecipeArtifact,
  materializeOptimizerArtifact,
} from "../../../src/niche/optimizer/index.js";
import {
  CandidateRecipeSchema,
  type Artifact,
  type ArtifactRef,
  type ArtifactRightsState,
  type GovernedDataStatus,
} from "../../../src/niche/schema/index.js";
import {
  createArtifactRecord,
  getArtifactRecord,
  getParentsForArtifact,
  writeLineageEdges,
} from "../../../src/niche/store/index.js";
import { validateJsonSchemaValue } from "../../../src/plugins/schema-validator.js";
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
  governedDataStatus?: GovernedDataStatus;
}): Artifact {
  return {
    artifact_id: params.artifactId,
    artifact_type: params.artifactType,
    version: "2026.3.12",
    producer: "test",
    source_trace_refs: [],
    dataset_refs: [],
    metrics: {},
    governed_data_status: params.governedDataStatus,
    created_at: "2026-03-12T13:00:00.000Z",
    lineage: [],
  };
}

function makeGovernedStatus(
  dataZone: GovernedDataStatus["data_zone"],
  overrides: Partial<GovernedDataStatus> = {},
): GovernedDataStatus {
  return {
    data_zone: dataZone,
    retention_policy: "retain",
    redaction_status: "clean",
    pii_status: "none",
    provenance_status: "verified",
    quarantined: false,
    ...overrides,
  };
}

function makeRef(
  artifactId: string,
  artifactType: Artifact["artifact_type"],
  rightsState: ArtifactRightsState,
): ArtifactRef {
  return {
    artifact_id: artifactId,
    artifact_type: artifactType,
    version: "2026.3.12",
    content_hash: computeStableContentHash({ artifactId, artifactType }),
    rights_state: rightsState,
    created_at: "2026-03-12T13:00:00.000Z",
  };
}

function materializeStoreBackedArtifact(params: {
  artifactId: string;
  artifactType: Artifact["artifact_type"];
  rightsState?: ArtifactRightsState;
  governedDataStatus?: GovernedDataStatus;
}) {
  const record = createArtifactRecord({
    artifact: makeArtifact({
      artifactId: params.artifactId,
      artifactType: params.artifactType,
      governedDataStatus: params.governedDataStatus,
    }),
    rightsState: params.rightsState ?? FULL_RIGHTS,
    env: process.env,
  });
  writeLineageEdges(
    params.artifactId,
    [
      {
        parent_artifact_id: `source-${params.artifactId}`,
        relationship: "derived_from",
        derivation_step: "test-seed",
        notes: `Store-backed test artifact for ${params.artifactId}.`,
      },
    ],
    process.env,
  );
  return record;
}

describe("candidate recipes and data synthesis", () => {
  it("builds lineage-connected candidate recipe artifacts and preserves restrictive rights", async () => {
    await withTempHome(async () => {
      const datasetRecord = createArtifactRecord({
        artifact: makeArtifact({
          artifactId: "dataset-approved",
          artifactType: "dataset",
          governedDataStatus: makeGovernedStatus("dev"),
        }),
        rightsState: FULL_RIGHTS,
        env: process.env,
      });
      const restrictedDatasetRights: ArtifactRightsState = {
        ...FULL_RIGHTS,
        rights_to_train: false,
      };
      const restrictedDatasetRecord = createArtifactRecord({
        artifact: makeArtifact({
          artifactId: "dataset-restricted",
          artifactType: "dataset",
          governedDataStatus: makeGovernedStatus("dev"),
        }),
        rightsState: restrictedDatasetRights,
        env: process.env,
      });
      const promptRef = makeRef("prompt-asset-v1", "prompt_asset", FULL_RIGHTS);
      const graderRef = makeRef("grader-v1", "grader", FULL_RIGHTS);
      const traceRef = makeRef("trace-v1", "run_trace", FULL_RIGHTS);
      const domainPackRef = makeRef("domain-pack-v1", "domain_pack", FULL_RIGHTS);
      const actionPolicyRef = makeRef("action-policy-v1", "action_policy", FULL_RIGHTS);
      const verifierPackRef = makeRef("verifier-pack-v1", "verifier_pack", FULL_RIGHTS);
      const retrievalStackRef = makeRef("retrieval-stack-v1", "retrieval_stack", FULL_RIGHTS);
      const syntheticDataset = materializeOptimizerArtifact({
        artifact: makeArtifact({
          artifactId: "synthetic-dataset-v1",
          artifactType: "dataset",
        }),
        parents: [
          {
            artifact_ref: datasetRecord.ref,
            relationship: "generated_from",
            derivation_step: "synthetic_task_generation",
            notes: "Synthetic dataset derived from approved dataset.",
          },
        ],
        env: process.env,
      });

      const recipeMaterialization = materializeCandidateRecipeArtifact({
        candidateRecipeId: "candidate-recipe-v1",
        nicheProgramId: "repo-ci-specialist",
        createdAt: "2026-03-12T13:01:00.000Z",
        recipeType: "repo_ci_specialization",
        teacherRuntimes: ["openai/gpt-5", "openai/gpt-5-mini"],
        inputDatasetRefs: [syntheticDataset.ref, restrictedDatasetRecord.ref],
        synthesisPromptRefs: [promptRef],
        graderRefs: [graderRef],
        evaluationInputs: [traceRef],
        promotionInputs: [traceRef],
        domainPackRef,
        actionPolicyRef,
        verifierPackRef,
        retrievalStackRef,
        benchmarkEvidence: [
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
            case_count: 100,
            paired_delta_summary: {
              mean_delta: 0.08,
              median_delta: 0.08,
              p10_delta: 0.04,
              p90_delta: 0.1,
              confidence_interval_low: 0.02,
              confidence_interval_high: 0.12,
            },
            task_family_summaries: [
              {
                task_family: "repo-ci-verification",
                case_count: 100,
                score_mean: 0.82,
                hard_fail_rate: 0.02,
                mean_delta: 0.08,
              },
            ],
            contamination_audit_summary: {
              contamination_detected: false,
              audited_case_count: 100,
            },
            invalidated: false,
            invalidation_reasons: [],
          },
        ],
        domainPack: {
          domain_pack_id: "domain-pack-v1",
          niche_program_id: "repo-ci-specialist",
          version: "2026.3.12",
          ontology: {
            concepts: [
              {
                id: "repo-ci-verification",
                label: "Repo CI verification",
                description: "Repo CI verification domain.",
              },
            ],
            relations: [],
          },
          task_taxonomy: [
            {
              task_family_id: "repo-ci-verification",
              label: "Repo CI verification",
              benchmarkable: true,
              required_capabilities: ["evidence_grounding"],
            },
          ],
          terminology_map: {},
          constraints: [
            {
              constraint_id: "must-mention-tests",
              category: "output",
              rule: "must_include:tests passed",
              severity: "moderate",
            },
          ],
          tool_contracts: [
            {
              tool_name: "exec",
              intent_summary: "Run commands",
              required_arguments: ["command"],
              optional_arguments: [],
              failure_modes: [],
            },
          ],
          evidence_source_registry: [
            {
              source_id: "repo-doc",
              source_kind: "repos",
              title: "Repo doc",
              access_pattern: "read_file",
            },
          ],
          failure_taxonomy: [
            {
              failure_id: "missing-evidence",
              label: "Missing evidence",
              description: "Evidence missing",
              severity: "high",
              detection_hints: ["unsupported claim"],
            },
          ],
          verifier_defaults: {
            required_checks: ["evidence_grounding"],
            blocking_failure_ids: ["missing-evidence"],
            output_requirements: ["grounded_response"],
            escalation_policy: "Escalate low-confidence outputs.",
          },
          benchmark_seed_specs: [
            {
              seed_id: "seed-1",
              task_family_id: "repo-ci-verification",
              prompt: "Verify tests",
              source_refs: ["repo-doc"],
              pass_conditions: ["grounded_response"],
              hard_fail_conditions: [],
            },
          ],
        },
        studentModelRefs: [],
      });

      const recipeValidation = validateJsonSchemaValue({
        schema: CandidateRecipeSchema,
        cacheKey: "candidate-recipe-test",
        value: recipeMaterialization.recipe,
      });
      expect(recipeValidation.ok).toBe(true);
      expect(recipeMaterialization.rightsState.rights_to_train).toBe(false);

      const persistedRecipe = materializeOptimizerArtifact({
        artifact: recipeMaterialization.artifact,
        parents: [
          {
            artifact_ref: syntheticDataset.ref,
            relationship: "candidate_recipe_input",
            derivation_step: "candidate_recipe_materialization",
            notes: "Recipe depends on synthetic dataset.",
          },
          {
            artifact_ref: restrictedDatasetRecord.ref,
            relationship: "candidate_recipe_input",
            derivation_step: "candidate_recipe_materialization",
            notes: "Recipe depends on restricted dataset.",
          },
          {
            artifact_ref: actionPolicyRef,
            relationship: "candidate_recipe_component",
            derivation_step: "candidate_recipe_materialization",
            notes: "Recipe depends on action policy.",
          },
        ],
        explicitRightsState: recipeMaterialization.rightsState,
        env: process.env,
      });

      const storedRecord = getArtifactRecord(persistedRecipe.ref, process.env);
      const parents = getParentsForArtifact("candidate-recipe-v1", process.env);

      expect(storedRecord?.ref.rights_state.rights_to_train).toBe(false);
      expect(parents.map((parent) => parent.parent_artifact_id)).toEqual([
        "action-policy-v1",
        "dataset-restricted",
        "synthetic-dataset-v1",
      ]);
    });
  });

  it("blocks embargoed or rights-restricted synthesis inputs and teacher rollout reuse", async () => {
    await withTempHome(async () => {
      const allowedDataset = materializeStoreBackedArtifact({
        artifactId: "dataset-approved",
        artifactType: "dataset",
        governedDataStatus: makeGovernedStatus("dev"),
      });
      const allowedSource = {
        artifact_ref: allowedDataset.ref,
        governed_data_status: makeGovernedStatus("dev"),
        task_family_id: "repo-ci-verification",
        content: "Use the approved repo workflow to verify that tests passed.",
      };
      const shadowTrace = materializeStoreBackedArtifact({
        artifactId: "trace-shadow",
        artifactType: "run_trace",
        governedDataStatus: makeGovernedStatus("shadow_only"),
      });
      const embargoedShadowTrace = {
        artifact_ref: shadowTrace.ref,
        governed_data_status: makeGovernedStatus("shadow_only"),
        embargo_policy: {
          embargo_active: true,
          contamination_checked: false,
          rights_confirmed: false,
          reason: "Shadow trace is still under live-trace embargo.",
        },
        task_family_id: "repo-ci-verification",
        content: "Shadow trace content",
        trace_id: "trace-shadow",
        target_summary: "Repair failing CI",
      };
      const restrictedDataset = materializeStoreBackedArtifact({
        artifactId: "dataset-no-synth",
        artifactType: "dataset",
        rightsState: {
          ...FULL_RIGHTS,
          rights_to_generate_synthetic_from: false,
        },
        governedDataStatus: makeGovernedStatus("dev"),
      });
      const noSyntheticRights = {
        artifact_ref: restrictedDataset.ref,
        governed_data_status: makeGovernedStatus("dev"),
        task_family_id: "repo-ci-verification",
        content: "This dataset does not permit synthetic generation.",
      };

      const synthetic = generateSyntheticTaskInputs({
        sources: [allowedSource, embargoedShadowTrace, noSyntheticRights],
      });
      expect(synthetic.synthetic_inputs).toHaveLength(1);
      expect(synthetic.synthetic_inputs[0]?.source_artifact_id).toBe("dataset-approved");
      expect(synthetic.blocked_sources).toEqual([
        {
          source_artifact_id: "dataset-no-synth",
          reason: "Upstream rights do not permit synthetic generation.",
        },
        {
          source_artifact_id: "trace-shadow",
          reason: "Shadow trace is still under live-trace embargo.",
        },
      ]);

      const traceExamples = generateTraceDerivedExamples({
        sources: [allowedSource, embargoedShadowTrace],
      });
      expect(traceExamples.examples).toHaveLength(0);
      expect(traceExamples.blocked_sources).toHaveLength(2);

      const blockedRollout = buildTeacherRolloutRequest({
        teacherRuntime: "openai/gpt-5",
        objective: "Generate repair traces",
        taskFamilyId: "repo-ci-verification",
        sources: [embargoedShadowTrace, noSyntheticRights],
        maxExamples: 32,
      });
      expect(blockedRollout.embargo_status).toBe("blocked");
      expect(blockedRollout.blocked_reason).toBeTruthy();

      const allowedRollout = buildTeacherRolloutRequest({
        teacherRuntime: "openai/gpt-5",
        objective: "Generate repair traces",
        taskFamilyId: "repo-ci-verification",
        sources: [allowedSource],
        maxExamples: 32,
      });
      expect(allowedRollout.embargo_status).toBe("cleared");
      expect(allowedRollout.input_artifact_refs).toHaveLength(1);
    });
  });
});
