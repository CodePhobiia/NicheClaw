import { describe, expect, it } from "vitest";
import { computeStableContentHash } from "../../../src/niche/benchmark/index.js";
import type {
  ArtifactRef,
  RewardArtifact,
} from "../../../src/niche/schema/index.js";
import {
  buildCandidateRecipe,
  buildTeacherRolloutRequest,
  createRewardArtifact,
  createRewardCalibrationMetadata,
  getRewardArtifact,
  getRewardCalibrationMetadata,
  listRewardArtifactLineage,
  listRewardArtifacts,
  listRewardCalibrationMetadata,
  planCandidateGenerationJob,
  planEvaluationPreparationJob,
  planTeacherRolloutJob,
  planVerifierRefreshJob,
} from "../../../src/niche/optimizer/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const FULL_RIGHTS = {
  rights_to_store: true,
  rights_to_train: true,
  rights_to_benchmark: true,
  rights_to_derive: true,
  rights_to_distill: true,
  rights_to_generate_synthetic_from: true,
} as const;

function makeRef(
  artifactId: string,
  artifactType: ArtifactRef["artifact_type"],
): ArtifactRef {
  return {
    artifact_id: artifactId,
    artifact_type: artifactType,
    version: "2026.3.12",
    content_hash: computeStableContentHash({ artifactId, artifactType }),
    rights_state: FULL_RIGHTS,
    created_at: "2026-03-12T13:20:00.000Z",
  };
}

function makeRewardArtifact(id: string): RewardArtifact {
  return {
    reward_artifact_id: id,
    reward_type: "process_reward",
    version: "2026.3.12",
    training_inputs: [makeRef("dataset-approved", "dataset")],
    calibration_suite_id: "reward-calibration-suite-v1",
    lineage_refs: [
      {
        parent_artifact_id: "dataset-approved",
        relationship: "trained_from",
        derivation_step: "reward-training",
        notes: "Reward artifact derived from approved dataset.",
      },
    ],
    owner: "quality-team",
    created_at: "2026-03-12T13:20:00.000Z",
  };
}

describe("optimizer orchestrator and reward registry", () => {
  it("registers reward artifacts with calibration metadata and lineage", async () => {
    await withTempHome(async () => {
      const rewardArtifact = makeRewardArtifact("reward-artifact-v1");

      createRewardArtifact(rewardArtifact, process.env);
      createRewardCalibrationMetadata(
        {
          reward_artifact_id: rewardArtifact.reward_artifact_id,
          created_at: "2026-03-12T13:21:00.000Z",
          agreement_rate: 0.92,
          sme_sample_count: 24,
          required_sme_sample_count: 20,
          promotion_eligible: true,
          notes: "Reward artifact is calibrated for promotion-sensitive flows.",
        },
        process.env,
      );

      expect(getRewardArtifact(rewardArtifact.reward_artifact_id, process.env)).toEqual(
        rewardArtifact,
      );
      expect(
        getRewardCalibrationMetadata(rewardArtifact.reward_artifact_id, process.env),
      ).toMatchObject({
        promotion_eligible: true,
        sme_sample_count: 24,
      });
      expect(listRewardArtifacts(process.env)).toHaveLength(1);
      expect(listRewardCalibrationMetadata(process.env)).toHaveLength(1);
      expect(listRewardArtifactLineage(rewardArtifact.reward_artifact_id, process.env)).toEqual(
        rewardArtifact.lineage_refs,
      );
    });
  });

  it("creates candidate generation, teacher rollout, verifier refresh, and evaluation jobs", async () => {
    await withTempHome(async () => {
      const rewardArtifact = makeRewardArtifact("reward-artifact-v1");
      createRewardArtifact(rewardArtifact, process.env);
      createRewardCalibrationMetadata(
        {
          reward_artifact_id: rewardArtifact.reward_artifact_id,
          created_at: "2026-03-12T13:21:00.000Z",
          agreement_rate: 0.92,
          sme_sample_count: 24,
          required_sme_sample_count: 20,
          promotion_eligible: true,
        },
        process.env,
      );

      const domainPackRef = makeRef("domain-pack-v1", "domain_pack");
      const actionPolicyRef = makeRef("action-policy-v1", "action_policy");
      const verifierPackRef = makeRef("verifier-pack-v1", "verifier_pack");
      const retrievalStackRef = makeRef("retrieval-stack-v1", "retrieval_stack");
      const datasetRef = makeRef("dataset-approved", "dataset");
      const promptRef = makeRef("prompt-v1", "prompt_asset");
      const graderRef = makeRef("grader-v1", "grader");
      const traceRef = makeRef("trace-v1", "run_trace");
      const candidateRecipe = buildCandidateRecipe({
        candidateRecipeId: "candidate-recipe-v1",
        nicheProgramId: "repo-ci-specialist",
        createdAt: "2026-03-12T13:22:00.000Z",
        recipeType: "repo_ci_specialization",
        teacherRuntimes: ["openai/gpt-5"],
        inputDatasetRefs: [datasetRef],
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
            provider_metadata_quality: "release_label_only",
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
      });
      const candidateRecipeRef = makeRef("candidate-recipe-v1", "candidate_recipe");

      const candidateJob = planCandidateGenerationJob({
        nicheProgramId: "repo-ci-specialist",
        createdAt: "2026-03-12T13:23:00.000Z",
        candidateRecipe: candidateRecipe,
        candidateRecipeRef,
        rewardArtifactIds: [rewardArtifact.reward_artifact_id],
        promotionEligibleFlow: true,
        env: process.env,
      });
      const teacherRolloutJob = planTeacherRolloutJob({
        nicheProgramId: "repo-ci-specialist",
        createdAt: "2026-03-12T13:23:30.000Z",
        rolloutRequest: buildTeacherRolloutRequest({
          teacherRuntime: "openai/gpt-5",
          objective: "Generate repair traces",
          taskFamilyId: "repo-ci-verification",
          sources: [
            {
              artifact_ref: datasetRef,
              governed_data_status: {
                data_zone: "dev",
                retention_policy: "retain",
                redaction_status: "clean",
                pii_status: "none",
                provenance_status: "verified",
                quarantined: false,
              },
              task_family_id: "repo-ci-verification",
              content: "Use the approved repo workflow to verify that tests passed.",
            },
          ],
          maxExamples: 16,
        }),
        rewardArtifactIds: [rewardArtifact.reward_artifact_id],
        promotionEligibleFlow: true,
        env: process.env,
      });
      const verifierRefreshJob = planVerifierRefreshJob({
        nicheProgramId: "repo-ci-specialist",
        createdAt: "2026-03-12T13:24:00.000Z",
        verifierPackRef,
        evaluationInputRefs: [traceRef],
        rewardArtifactIds: [rewardArtifact.reward_artifact_id],
        promotionEligibleFlow: false,
        env: process.env,
      });
      const evaluationJob = planEvaluationPreparationJob({
        nicheProgramId: "repo-ci-specialist",
        createdAt: "2026-03-12T13:24:30.000Z",
        candidateArtifactRefs: [candidateRecipeRef],
        benchmarkInputRefs: [traceRef],
        rewardArtifactIds: [rewardArtifact.reward_artifact_id],
        promotionEligibleFlow: false,
        env: process.env,
      });

      expect(candidateJob.status).toBe("ready");
      expect(teacherRolloutJob.status).toBe("ready");
      expect(verifierRefreshJob.status).toBe("ready");
      expect(evaluationJob.status).toBe("ready");
      expect(candidateJob.job_type).toBe("candidate_generation");
      expect(teacherRolloutJob.job_type).toBe("teacher_rollout");
      expect(verifierRefreshJob.job_type).toBe("verifier_refresh");
      expect(evaluationJob.job_type).toBe("evaluation_preparation");
    });
  });

  it("blocks promotion-eligible flows when reward artifacts are uncalibrated", async () => {
    await withTempHome(async () => {
      const rewardArtifact = makeRewardArtifact("reward-artifact-uncalibrated");
      createRewardArtifact(rewardArtifact, process.env);

      const candidateJob = planCandidateGenerationJob({
        nicheProgramId: "repo-ci-specialist",
        createdAt: "2026-03-12T13:25:00.000Z",
        candidateRecipe: buildCandidateRecipe({
          candidateRecipeId: "candidate-recipe-v2",
          nicheProgramId: "repo-ci-specialist",
          createdAt: "2026-03-12T13:25:00.000Z",
          recipeType: "repo_ci_specialization",
          teacherRuntimes: ["openai/gpt-5"],
          inputDatasetRefs: [makeRef("dataset-approved", "dataset")],
          graderRefs: [makeRef("grader-v1", "grader")],
          evaluationInputs: [makeRef("trace-v1", "run_trace")],
          promotionInputs: [makeRef("trace-v1", "run_trace")],
          domainPackRef: makeRef("domain-pack-v1", "domain_pack"),
          actionPolicyRef: makeRef("action-policy-v1", "action_policy"),
          verifierPackRef: makeRef("verifier-pack-v1", "verifier_pack"),
          retrievalStackRef: makeRef("retrieval-stack-v1", "retrieval_stack"),
          benchmarkEvidence: [
            {
              benchmark_result_id: "benchmark-1",
              benchmark_suite_id: "repo-ci-suite",
              case_kind: "atomic_case",
              mode: "offline_gold",
              baseline_arm_id: "baseline-manifest-v1",
              candidate_arm_id: "candidate-manifest-v1",
              provider_metadata_quality: "release_label_only",
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
        }),
        candidateRecipeRef: makeRef("candidate-recipe-v2", "candidate_recipe"),
        rewardArtifactIds: [rewardArtifact.reward_artifact_id],
        promotionEligibleFlow: true,
        env: process.env,
      });

      expect(candidateJob.status).toBe("blocked");
      expect(candidateJob.blocked_reason).toContain("lacks promotion-eligible calibration");
    });
  });
});
