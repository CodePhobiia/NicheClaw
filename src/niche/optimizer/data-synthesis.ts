import { computeStableContentHash } from "../benchmark/index.js";
import { propagateDerivedRights } from "../domain/rights-propagation.js";
import type {
  ArtifactRef,
  ArtifactRightsState,
  DataZone,
  GovernedDataStatus,
} from "../schema/index.js";

export type SynthesisEmbargoPolicy = {
  embargo_active: boolean;
  evaluation_cycles_remaining?: number;
  contamination_checked: boolean;
  rights_confirmed: boolean;
  reason?: string;
};

export type SynthesisSourceRecord = {
  artifact_ref: ArtifactRef;
  governed_data_status: GovernedDataStatus;
  embargo_policy?: SynthesisEmbargoPolicy;
  task_family_id: string;
  content: string;
  trace_id?: string;
  target_summary?: string;
  failure_labels?: string[];
};

export type SynthesisEligibility = {
  allowed: boolean;
  derived_rights: ArtifactRightsState;
  reason?: string;
};

export type SyntheticTaskInput = {
  synthetic_input_id: string;
  source_artifact_id: string;
  task_family_id: string;
  prompt: string;
  source_content_hash: string;
  rights_state: ArtifactRightsState;
  data_zone: DataZone;
};

export type TraceDerivedExample = {
  example_id: string;
  trace_id: string;
  source_artifact_id: string;
  task_family_id: string;
  input_summary: string;
  target_summary: string;
  failure_labels: string[];
  rights_state: ArtifactRightsState;
  data_zone: DataZone;
};

export type TeacherRolloutRequest = {
  rollout_request_id: string;
  teacher_runtime: string;
  objective: string;
  task_family_id: string;
  input_artifact_refs: ArtifactRef[];
  max_examples: number;
  rights_state: ArtifactRightsState;
  embargo_status: "cleared" | "blocked";
  blocked_reason?: string;
};

type SynthesisPurpose = "synthetic" | "trace_derived" | "teacher_rollout";

function isProhibitedDataZone(zone: DataZone): boolean {
  return zone === "gold_eval" || zone === "hidden_eval" || zone === "quarantined";
}

export function assessSynthesisEligibility(params: {
  source: SynthesisSourceRecord;
  purpose: SynthesisPurpose;
}): SynthesisEligibility {
  const derivedRights = propagateDerivedRights([params.source.artifact_ref.rights_state])
    .rightsState;
  const dataZone = params.source.governed_data_status.data_zone;

  if (params.source.governed_data_status.quarantined || isProhibitedDataZone(dataZone)) {
    return {
      allowed: false,
      derived_rights: derivedRights,
      reason: `Data zone ${dataZone} is not eligible for optimizer synthesis.`,
    };
  }

  const embargo = params.source.embargo_policy;
  if (
    dataZone === "shadow_only" &&
    (embargo?.embargo_active !== false ||
      !embargo?.contamination_checked ||
      !embargo?.rights_confirmed)
  ) {
    return {
      allowed: false,
      derived_rights: derivedRights,
      reason:
        embargo?.reason ??
        "Shadow-only traces remain under embargo until contamination checks and rights confirmation pass.",
    };
  }

  if (!derivedRights.rights_to_derive) {
    return {
      allowed: false,
      derived_rights: derivedRights,
      reason: "Upstream rights do not permit derivative optimizer artifacts.",
    };
  }
  if (!derivedRights.rights_to_generate_synthetic_from) {
    return {
      allowed: false,
      derived_rights: derivedRights,
      reason: "Upstream rights do not permit synthetic generation.",
    };
  }
  if (params.purpose === "teacher_rollout" && !derivedRights.rights_to_train) {
    return {
      allowed: false,
      derived_rights: derivedRights,
      reason: "Teacher rollout inputs must retain rights_to_train for downstream optimization.",
    };
  }
  if (params.purpose === "trace_derived" && !params.source.trace_id) {
    return {
      allowed: false,
      derived_rights: derivedRights,
      reason: "Trace-derived examples require a trace_id.",
    };
  }

  return {
    allowed: true,
    derived_rights: derivedRights,
  };
}

function buildSyntheticPrompt(source: SynthesisSourceRecord): string {
  return `Generate a grounded ${source.task_family_id} task using approved content: ${source.content}`;
}

export function generateSyntheticTaskInputs(params: {
  sources: SynthesisSourceRecord[];
  maxItems?: number;
}): { synthetic_inputs: SyntheticTaskInput[]; blocked_sources: Array<{ source_artifact_id: string; reason: string }> } {
  const syntheticInputs: SyntheticTaskInput[] = [];
  const blockedSources: Array<{ source_artifact_id: string; reason: string }> = [];

  for (const source of [...params.sources].toSorted((left, right) =>
    left.artifact_ref.artifact_id.localeCompare(right.artifact_ref.artifact_id),
  )) {
    if (params.maxItems !== undefined && syntheticInputs.length >= params.maxItems) {
      break;
    }
    const eligibility = assessSynthesisEligibility({
      source,
      purpose: "synthetic",
    });
    if (!eligibility.allowed) {
      blockedSources.push({
        source_artifact_id: source.artifact_ref.artifact_id,
        reason: eligibility.reason ?? "Synthesis blocked by policy.",
      });
      continue;
    }

    syntheticInputs.push({
      synthetic_input_id: computeStableContentHash({
        artifactId: source.artifact_ref.artifact_id,
        taskFamilyId: source.task_family_id,
        content: source.content,
      }),
      source_artifact_id: source.artifact_ref.artifact_id,
      task_family_id: source.task_family_id,
      prompt: buildSyntheticPrompt(source),
      source_content_hash: computeStableContentHash(source.content),
      rights_state: eligibility.derived_rights,
      data_zone: source.governed_data_status.data_zone,
    });
  }

  return {
    synthetic_inputs: syntheticInputs,
    blocked_sources: blockedSources,
  };
}

export function generateTraceDerivedExamples(params: {
  sources: SynthesisSourceRecord[];
  maxItems?: number;
}): { examples: TraceDerivedExample[]; blocked_sources: Array<{ source_artifact_id: string; reason: string }> } {
  const examples: TraceDerivedExample[] = [];
  const blockedSources: Array<{ source_artifact_id: string; reason: string }> = [];

  for (const source of [...params.sources].toSorted((left, right) =>
    left.artifact_ref.artifact_id.localeCompare(right.artifact_ref.artifact_id),
  )) {
    if (params.maxItems !== undefined && examples.length >= params.maxItems) {
      break;
    }
    const eligibility = assessSynthesisEligibility({
      source,
      purpose: "trace_derived",
    });
    if (!eligibility.allowed) {
      blockedSources.push({
        source_artifact_id: source.artifact_ref.artifact_id,
        reason: eligibility.reason ?? "Trace-derived example blocked by policy.",
      });
      continue;
    }

    examples.push({
      example_id: computeStableContentHash({
        traceId: source.trace_id,
        artifactId: source.artifact_ref.artifact_id,
        content: source.content,
        targetSummary: source.target_summary,
      }),
      trace_id: source.trace_id!,
      source_artifact_id: source.artifact_ref.artifact_id,
      task_family_id: source.task_family_id,
      input_summary: source.content.slice(0, 240),
      target_summary: source.target_summary ?? source.content.slice(0, 120),
      failure_labels: [...(source.failure_labels ?? [])].toSorted((left, right) =>
        left.localeCompare(right),
      ),
      rights_state: eligibility.derived_rights,
      data_zone: source.governed_data_status.data_zone,
    });
  }

  return {
    examples,
    blocked_sources: blockedSources,
  };
}

export function buildTeacherRolloutRequest(params: {
  teacherRuntime: string;
  objective: string;
  taskFamilyId: string;
  sources: SynthesisSourceRecord[];
  maxExamples: number;
}): TeacherRolloutRequest {
  const sortedSources = [...params.sources].toSorted((left, right) =>
    left.artifact_ref.artifact_id.localeCompare(right.artifact_ref.artifact_id),
  );
  const eligibleSources = sortedSources.filter((source) =>
    assessSynthesisEligibility({ source, purpose: "teacher_rollout" }).allowed,
  );

  const rightsLineage = (eligibleSources.length > 0 ? eligibleSources : sortedSources).map(
    (source) => source.artifact_ref.rights_state,
  );
  const rightsState =
    rightsLineage.length > 0
      ? propagateDerivedRights(rightsLineage).rightsState
      : {
          rights_to_store: false,
          rights_to_train: false,
          rights_to_benchmark: false,
          rights_to_derive: false,
          rights_to_distill: false,
          rights_to_generate_synthetic_from: false,
        };
  const blockedReason =
    eligibleSources.length > 0
      ? undefined
      : sortedSources
          .map(
            (source) =>
              assessSynthesisEligibility({
                source,
                purpose: "teacher_rollout",
              }).reason,
          )
          .filter((value): value is string => Boolean(value))[0] ??
        "Teacher rollout request is blocked by optimizer policy.";

  return {
    rollout_request_id: computeStableContentHash({
      teacherRuntime: params.teacherRuntime,
      objective: params.objective,
      taskFamilyId: params.taskFamilyId,
      sourceIds: sortedSources.map((source) => source.artifact_ref.artifact_id),
      maxExamples: params.maxExamples,
    }),
    teacher_runtime: params.teacherRuntime,
    objective: params.objective,
    task_family_id: params.taskFamilyId,
    input_artifact_refs: eligibleSources.map((source) => source.artifact_ref),
    max_examples: params.maxExamples,
    rights_state: rightsState,
    embargo_status: eligibleSources.length > 0 ? "cleared" : "blocked",
    blocked_reason: blockedReason,
  };
}
