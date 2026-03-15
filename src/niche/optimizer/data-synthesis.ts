import { computeStableContentHash } from "../benchmark/index.js";
import { propagateDerivedRights } from "../domain/rights-propagation.js";
import type {
  ArtifactRef,
  ArtifactTeacherRolloutAuthority,
  ArtifactRightsState,
  DataZone,
  GovernedDataStatus,
} from "../schema/index.js";
import { getArtifactRecord, getParentsForArtifact } from "../store/index.js";

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

export type TeacherRolloutIntent = {
  teacher_runtime: string;
  objective: string;
  task_family_id: string;
  input_artifact_refs: ArtifactRef[];
  max_examples: number;
};

type SynthesisPurpose = "synthetic" | "trace_derived" | "teacher_rollout";

type AuthoritativeSynthesisSource = {
  artifact_ref: ArtifactRef;
  governed_data_status: GovernedDataStatus;
};

type AuthoritativeTeacherRolloutInput = {
  artifact_ref: ArtifactRef;
  governed_data_status: GovernedDataStatus;
  teacher_rollout_authority: ArtifactTeacherRolloutAuthority;
};

function isProhibitedDataZone(zone: DataZone): boolean {
  return zone === "gold_eval" || zone === "hidden_eval" || zone === "quarantined";
}

export function assessSynthesisEligibility(params: {
  source: SynthesisSourceRecord;
  purpose: SynthesisPurpose;
  env?: NodeJS.ProcessEnv;
}): SynthesisEligibility {
  const authoritativeSource = resolveAuthoritativeSynthesisSource(params.source, params.env);
  if ("reason" in authoritativeSource) {
    return {
      allowed: false,
      derived_rights: params.source.artifact_ref.rights_state,
      reason: authoritativeSource.reason,
    };
  }

  const derivedRights = propagateDerivedRights([
    authoritativeSource.artifact_ref.rights_state,
  ]).rightsState;
  const dataZone = authoritativeSource.governed_data_status.data_zone;

  if (authoritativeSource.governed_data_status.quarantined || isProhibitedDataZone(dataZone)) {
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

function resolveAuthoritativeSynthesisSource(
  source: SynthesisSourceRecord,
  env: NodeJS.ProcessEnv = process.env,
): AuthoritativeSynthesisSource | { reason: string } {
  const stored = getArtifactRecord(source.artifact_ref, env);
  if (!stored) {
    return {
      reason: `Artifact ${source.artifact_ref.artifact_id} is not present in the store and cannot be reused for optimization.`,
    };
  }
  if (getParentsForArtifact(stored.ref.artifact_id, env).length === 0) {
    return {
      reason: `Artifact ${stored.ref.artifact_id} has no authoritative lineage and is ineligible by default.`,
    };
  }
  if (!stored.artifact.governed_data_status) {
    return {
      reason: `Artifact ${stored.ref.artifact_id} is missing store-backed governed data status.`,
    };
  }
  return {
    artifact_ref: stored.ref,
    governed_data_status: stored.artifact.governed_data_status as GovernedDataStatus,
  };
}

function buildSyntheticPrompt(source: SynthesisSourceRecord): string {
  return `Generate a grounded ${source.task_family_id} task using approved content: ${source.content}`;
}

export function generateSyntheticTaskInputs(params: {
  sources: SynthesisSourceRecord[];
  maxItems?: number;
  env?: NodeJS.ProcessEnv;
}): {
  synthetic_inputs: SyntheticTaskInput[];
  blocked_sources: Array<{ source_artifact_id: string; reason: string }>;
} {
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
      env: params.env,
    });
    if (!eligibility.allowed) {
      blockedSources.push({
        source_artifact_id: source.artifact_ref.artifact_id,
        reason: eligibility.reason ?? "Synthesis blocked by policy.",
      });
      continue;
    }
    const authoritativeSource = resolveAuthoritativeSynthesisSource(source, params.env);
    if ("reason" in authoritativeSource) {
      blockedSources.push({
        source_artifact_id: source.artifact_ref.artifact_id,
        reason: authoritativeSource.reason,
      });
      continue;
    }

    syntheticInputs.push({
      synthetic_input_id: computeStableContentHash({
        artifactId: authoritativeSource.artifact_ref.artifact_id,
        taskFamilyId: source.task_family_id,
        content: source.content,
      }),
      source_artifact_id: authoritativeSource.artifact_ref.artifact_id,
      task_family_id: source.task_family_id,
      prompt: buildSyntheticPrompt(source),
      source_content_hash: computeStableContentHash(source.content),
      rights_state: eligibility.derived_rights,
      data_zone: authoritativeSource.governed_data_status.data_zone,
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
  env?: NodeJS.ProcessEnv;
}): {
  examples: TraceDerivedExample[];
  blocked_sources: Array<{ source_artifact_id: string; reason: string }>;
} {
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
      env: params.env,
    });
    if (!eligibility.allowed) {
      blockedSources.push({
        source_artifact_id: source.artifact_ref.artifact_id,
        reason: eligibility.reason ?? "Trace-derived example blocked by policy.",
      });
      continue;
    }
    const authoritativeSource = resolveAuthoritativeSynthesisSource(source, params.env);
    if ("reason" in authoritativeSource) {
      blockedSources.push({
        source_artifact_id: source.artifact_ref.artifact_id,
        reason: authoritativeSource.reason,
      });
      continue;
    }

    examples.push({
      example_id: computeStableContentHash({
        traceId: source.trace_id,
        artifactId: authoritativeSource.artifact_ref.artifact_id,
        content: source.content,
        targetSummary: source.target_summary,
      }),
      trace_id: source.trace_id!,
      source_artifact_id: authoritativeSource.artifact_ref.artifact_id,
      task_family_id: source.task_family_id,
      input_summary: source.content.slice(0, 240),
      target_summary: source.target_summary ?? source.content.slice(0, 120),
      failure_labels: [...(source.failure_labels ?? [])].toSorted((left, right) =>
        left.localeCompare(right),
      ),
      rights_state: eligibility.derived_rights,
      data_zone: authoritativeSource.governed_data_status.data_zone,
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
  env?: NodeJS.ProcessEnv;
}): TeacherRolloutRequest {
  const sortedSources = [...params.sources].toSorted((left, right) =>
    left.artifact_ref.artifact_id.localeCompare(right.artifact_ref.artifact_id),
  );
  const eligibleSources = sortedSources.flatMap((source) => {
    const eligibility = assessSynthesisEligibility({
      source,
      purpose: "teacher_rollout",
      env: params.env,
    });
    if (!eligibility.allowed) {
      return [];
    }
    const authoritativeSource = resolveAuthoritativeSynthesisSource(source, params.env);
    return "reason" in authoritativeSource
      ? []
      : [{ artifact_ref: authoritativeSource.artifact_ref, original: source }];
  });

  const rightsLineage =
    eligibleSources.length > 0
      ? eligibleSources.map((source) => source.artifact_ref.rights_state)
      : sortedSources.map((source) => source.artifact_ref.rights_state);
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
      : (sortedSources
          .map(
            (source) =>
              assessSynthesisEligibility({
                source,
                purpose: "teacher_rollout",
                env: params.env,
              }).reason,
          )
          .filter((value): value is string => Boolean(value))[0] ??
        "Teacher rollout request is blocked by optimizer policy.");

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

function resolveAuthoritativeTeacherRolloutInput(
  artifactRef: ArtifactRef,
  env: NodeJS.ProcessEnv = process.env,
): AuthoritativeTeacherRolloutInput | { reason: string } {
  const stored = getArtifactRecord(artifactRef, env);
  if (!stored) {
    return {
      reason: `Artifact ${artifactRef.artifact_id} is not present in the store and cannot be reused for teacher rollout.`,
    };
  }
  if (getParentsForArtifact(stored.ref.artifact_id, env).length === 0) {
    return {
      reason: `Artifact ${stored.ref.artifact_id} has no authoritative lineage and is ineligible by default.`,
    };
  }
  if (!stored.artifact.governed_data_status) {
    return {
      reason: `Artifact ${stored.ref.artifact_id} is missing store-backed governed data status.`,
    };
  }
  if (!stored.artifact.teacher_rollout_authority) {
    return {
      reason: `Artifact ${stored.ref.artifact_id} is missing store-backed teacher rollout authority.`,
    };
  }
  return {
    artifact_ref: stored.ref,
    governed_data_status: stored.artifact.governed_data_status as GovernedDataStatus,
    teacher_rollout_authority: stored.artifact
      .teacher_rollout_authority as ArtifactTeacherRolloutAuthority,
  };
}

export function buildTeacherRolloutRequestFromIntent(params: {
  intent: TeacherRolloutIntent;
  env?: NodeJS.ProcessEnv;
}): TeacherRolloutRequest {
  const sortedRefs = [...params.intent.input_artifact_refs].toSorted((left, right) =>
    left.artifact_id.localeCompare(right.artifact_id),
  );
  const resolvedInputs = sortedRefs.map((ref) =>
    resolveAuthoritativeTeacherRolloutInput(ref, params.env),
  );
  const eligibleInputs = resolvedInputs.filter(
    (input): input is AuthoritativeTeacherRolloutInput =>
      !("reason" in input) && input.teacher_rollout_authority.embargo_status === "cleared",
  );
  const resolvedRefs = resolvedInputs.filter(
    (input): input is AuthoritativeTeacherRolloutInput => !("reason" in input),
  );
  const rightsLineage = (eligibleInputs.length > 0 ? eligibleInputs : resolvedRefs).map(
    (input) => input.artifact_ref.rights_state,
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
    eligibleInputs.length > 0
      ? undefined
      : (resolvedInputs
          .map((input) =>
            "reason" in input
              ? input.reason
              : (input.teacher_rollout_authority.blocked_reason ??
                "Teacher rollout inputs remain under authoritative embargo."),
          )
          .filter((value): value is string => Boolean(value))[0] ??
        "Teacher rollout request is blocked by optimizer policy.");

  return {
    rollout_request_id: computeStableContentHash({
      teacherRuntime: params.intent.teacher_runtime,
      objective: params.intent.objective,
      taskFamilyId: params.intent.task_family_id,
      sourceIds: sortedRefs.map((source) => source.artifact_id),
      maxExamples: params.intent.max_examples,
    }),
    teacher_runtime: params.intent.teacher_runtime,
    objective: params.intent.objective,
    task_family_id: params.intent.task_family_id,
    input_artifact_refs: eligibleInputs.map((input) => input.artifact_ref),
    max_examples: params.intent.max_examples,
    rights_state: rightsState,
    embargo_status: eligibleInputs.length > 0 ? "cleared" : "blocked",
    blocked_reason: blockedReason,
  };
}
