import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { computeStableContentHash } from "../benchmark/index.js";
import { propagateDerivedRights } from "../domain/rights-propagation.js";
import {
  ArtifactSchema,
  CandidateRecipeSchema,
  type Artifact,
  type ArtifactRef,
  type ArtifactRightsState,
  type BenchmarkResultSummary,
  type CandidateRecipe,
  type CandidateRecipeStep,
  type DomainPack,
} from "../schema/index.js";

export type CandidateRecipeBuildInput = {
  candidateRecipeId: string;
  nicheProgramId: string;
  createdAt: string;
  recipeType: string;
  teacherRuntimes: string[];
  inputDatasetRefs: ArtifactRef[];
  synthesisPromptRefs?: ArtifactRef[];
  graderRefs: ArtifactRef[];
  evaluationInputs: ArtifactRef[];
  promotionInputs: ArtifactRef[];
  domainPackRef: ArtifactRef;
  actionPolicyRef: ArtifactRef;
  verifierPackRef: ArtifactRef;
  retrievalStackRef: ArtifactRef;
  benchmarkEvidence: BenchmarkResultSummary[];
  domainPack: DomainPack;
  hyperparameters?: Record<string, string | number | boolean | null>;
  studentModelRefs?: ArtifactRef[];
};

export type CandidateRecipeMaterialization = {
  recipe: CandidateRecipe;
  artifact: Artifact;
  rightsState: ArtifactRightsState;
};

function sortArtifactRefs(refs: ArtifactRef[]): ArtifactRef[] {
  return [...refs].toSorted((left, right) => {
    const typeDelta = left.artifact_type.localeCompare(right.artifact_type);
    if (typeDelta !== 0) {
      return typeDelta;
    }
    const idDelta = left.artifact_id.localeCompare(right.artifact_id);
    if (idDelta !== 0) {
      return idDelta;
    }
    const versionDelta = left.version.localeCompare(right.version);
    if (versionDelta !== 0) {
      return versionDelta;
    }
    return left.content_hash.localeCompare(right.content_hash);
  });
}

function dedupeArtifactRefs(refs: ArtifactRef[]): ArtifactRef[] {
  const seen = new Set<string>();
  const output: ArtifactRef[] = [];
  for (const ref of sortArtifactRefs(refs)) {
    const key = `${ref.artifact_type}:${ref.artifact_id}:${ref.version}:${ref.content_hash}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(ref);
  }
  return output;
}

function stableHyperparameters(
  value: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> {
  if (!value) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function makeStep(
  stepId: string,
  summary: string,
  outputArtifactRefs: ArtifactRef[],
): CandidateRecipeStep {
  return {
    step_id: stepId,
    summary,
    output_artifact_refs: dedupeArtifactRefs(outputArtifactRefs),
  };
}

function assertCandidateRecipe(recipe: CandidateRecipe): CandidateRecipe {
  const validation = validateJsonSchemaValue({
    schema: CandidateRecipeSchema,
    cacheKey: "optimizer-candidate-recipe",
    value: recipe,
  });
  if (!validation.ok) {
    const details = validation.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid candidate recipe: ${details}`);
  }
  return recipe;
}

function assertArtifact(artifact: Artifact): Artifact {
  const validation = validateJsonSchemaValue({
    schema: ArtifactSchema,
    cacheKey: "optimizer-candidate-recipe-artifact",
    value: artifact,
  });
  if (!validation.ok) {
    const details = validation.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid candidate recipe artifact: ${details}`);
  }
  return artifact;
}

function summarizeBenchmarkEvidence(results: BenchmarkResultSummary[]): {
  meanDelta: number;
  invalidatedCount: number;
} {
  if (results.length === 0) {
    return {
      meanDelta: 0,
      invalidatedCount: 0,
    };
  }
  const meanDelta =
    results.reduce((sum, result) => sum + result.paired_delta_summary.mean_delta, 0) /
    results.length;
  return {
    meanDelta,
    invalidatedCount: results.filter((result) => result.invalidated).length,
  };
}

export function buildCandidateRecipe(input: CandidateRecipeBuildInput): CandidateRecipe {
  if (input.teacherRuntimes.length === 0) {
    throw new Error("Candidate recipes require at least one teacher runtime.");
  }
  if (input.inputDatasetRefs.length === 0) {
    throw new Error("Candidate recipes require at least one approved input dataset.");
  }
  if (input.graderRefs.length === 0) {
    throw new Error("Candidate recipes require at least one grader reference.");
  }
  if (input.evaluationInputs.length === 0 || input.promotionInputs.length === 0) {
    throw new Error("Candidate recipes require evaluation and promotion inputs.");
  }

  const studentModelRefs = dedupeArtifactRefs(input.studentModelRefs ?? []);
  const recipe = assertCandidateRecipe({
    candidate_recipe_id: input.candidateRecipeId,
    niche_program_id: input.nicheProgramId,
    created_at: input.createdAt,
    recipe_type: input.recipeType,
    teacher_runtimes: [...input.teacherRuntimes].toSorted((left, right) =>
      left.localeCompare(right),
    ),
    input_dataset_refs: dedupeArtifactRefs(input.inputDatasetRefs),
    synthesis_prompt_refs: dedupeArtifactRefs(input.synthesisPromptRefs ?? []),
    distillation_steps: [
      makeStep(
        `${input.candidateRecipeId}-distillation`,
        `Distill approved teacher traces for ${input.domainPack.domain_pack_id}.`,
        studentModelRefs,
      ),
    ],
    sidecar_training_steps: [
      makeStep(
        `${input.candidateRecipeId}-action-policy`,
        `Train sidecar action policy for ${input.domainPack.domain_pack_id}.`,
        [input.actionPolicyRef],
      ),
    ],
    verifier_training_steps: [
      makeStep(
        `${input.candidateRecipeId}-verifier`,
        `Train verifier pack with domain-specific constraints from ${input.domainPack.domain_pack_id}.`,
        [input.verifierPackRef],
      ),
    ],
    retrieval_optimization_steps: [
      makeStep(
        `${input.candidateRecipeId}-retrieval`,
        `Optimize retrieval stack using benchmark evidence for ${input.domainPack.domain_pack_id}.`,
        [input.retrievalStackRef],
      ),
    ],
    hyperparameters: {
      ...stableHyperparameters(input.hyperparameters),
      benchmark_mean_delta: summarizeBenchmarkEvidence(input.benchmarkEvidence).meanDelta,
      domain_pack_hash: computeStableContentHash({
        domainPackId: input.domainPack.domain_pack_id,
        taskFamilies: input.domainPack.task_taxonomy.map((taskFamily) => taskFamily.task_family_id),
      }),
    },
    grader_refs: dedupeArtifactRefs(input.graderRefs),
    evaluation_inputs: dedupeArtifactRefs(input.evaluationInputs),
    promotion_inputs: dedupeArtifactRefs(input.promotionInputs),
  });

  return recipe;
}

export function materializeCandidateRecipeArtifact(
  input: CandidateRecipeBuildInput,
): CandidateRecipeMaterialization {
  const recipe = buildCandidateRecipe(input);
  const lineageRefs = [
    input.domainPackRef,
    input.actionPolicyRef,
    input.verifierPackRef,
    input.retrievalStackRef,
    ...recipe.input_dataset_refs,
    ...recipe.synthesis_prompt_refs,
    ...recipe.grader_refs,
    ...recipe.evaluation_inputs,
    ...recipe.promotion_inputs,
  ];
  const rightsState = propagateDerivedRights(
    dedupeArtifactRefs(lineageRefs).map((ref) => ref.rights_state),
  ).rightsState;
  const benchmarkSummary = summarizeBenchmarkEvidence(input.benchmarkEvidence);

  const artifact = assertArtifact({
    artifact_id: recipe.candidate_recipe_id,
    artifact_type: "candidate_recipe",
    version: computeStableContentHash({
      recipeId: recipe.candidate_recipe_id,
      recipeType: recipe.recipe_type,
      teacherRuntimes: recipe.teacher_runtimes,
      inputDatasets: recipe.input_dataset_refs.map((ref) => ref.artifact_id),
      benchmarkEvidence: input.benchmarkEvidence.map((result) => result.benchmark_result_id),
    }),
    producer: "niche.optimizer.candidate-recipe",
    source_trace_refs: dedupeArtifactRefs([...recipe.evaluation_inputs, ...recipe.promotion_inputs])
      .filter((ref) => ref.artifact_type === "run_trace")
      .map((ref) => ref.artifact_id),
    dataset_refs: recipe.input_dataset_refs.map((ref) => ref.artifact_id),
    metrics: {
      benchmark_mean_delta: benchmarkSummary.meanDelta,
      invalidated_benchmark_count: benchmarkSummary.invalidatedCount,
      input_dataset_count: recipe.input_dataset_refs.length,
      teacher_runtime_count: recipe.teacher_runtimes.length,
    },
    created_at: recipe.created_at,
    lineage: dedupeArtifactRefs(lineageRefs).map((ref) => ({
      parent_artifact_id: ref.artifact_id,
      relationship: "candidate_recipe_input",
      derivation_step: "candidate_recipe_materialization",
      notes: `Candidate recipe depends on ${ref.artifact_type} ${ref.artifact_id}.`,
    })),
  });

  return {
    recipe,
    artifact,
    rightsState,
  };
}
