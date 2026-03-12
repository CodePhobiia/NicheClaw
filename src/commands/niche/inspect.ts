import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";
import { readRequiredJsonFileStrict } from "../../niche/json.js";
import {
  ArtifactSchema,
  BaselineManifestSchema,
  CandidateManifestSchema,
  CandidateRecipeSchema,
  PromotedReleaseMonitorSchema,
  SourceAccessManifestSchema,
  type Artifact,
  type BaselineManifest,
  type CandidateManifest,
  type CandidateRecipe,
  type PromotedReleaseMonitor,
  type SourceAccessManifest,
} from "../../niche/schema/index.js";
import type { PromotedMonitorDefinition } from "../../niche/release/index.js";

export const NICHE_INSPECT_KINDS = [
  "baseline_manifest",
  "candidate_manifest",
  "source_access_manifest",
  "candidate_recipe",
  "artifact",
  "promoted_monitor",
] as const;

export type NicheInspectKind = (typeof NICHE_INSPECT_KINDS)[number];

export type NicheInspectOptions = {
  kind: string;
  filePath: string;
  json?: boolean;
};

export type NicheInspectResult = {
  kind: NicheInspectKind;
  file_path: string;
  summary: Record<string, unknown>;
  record:
    | BaselineManifest
    | CandidateManifest
    | SourceAccessManifest
    | CandidateRecipe
    | Artifact
    | PromotedReleaseMonitor
    | PromotedMonitorDefinition;
};

function validateValue<T>(
  schema: Record<string, unknown>,
  cacheKey: string,
  value: T,
  label: string,
): T {
  const validation = validateJsonSchemaValue({
    schema,
    cacheKey,
    value,
  });
  if (validation.ok) {
    return value;
  }
  const details = validation.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid ${label}: ${details}`);
}

function assertInspectKind(kind: string): NicheInspectKind {
  const normalized = kind.trim().toLowerCase().replace(/-/g, "_");
  if (NICHE_INSPECT_KINDS.includes(normalized as NicheInspectKind)) {
    return normalized as NicheInspectKind;
  }
  throw new Error(
    `Unsupported inspect kind "${kind}". Expected one of: ${NICHE_INSPECT_KINDS.join(", ")}.`,
  );
}

function describeSummary(summary: Record<string, unknown>): string {
  return Object.entries(summary)
    .map(([key, value]) =>
      `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`,
    )
    .join("\n");
}

function assertPromotedMonitorDefinition(
  value: unknown,
  label: string,
): PromotedMonitorDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  const candidate = value as Partial<PromotedMonitorDefinition>;
  if (!candidate.monitor || !candidate.cadence_defaults) {
    throw new Error(`Invalid ${label}: missing monitor or cadence_defaults.`);
  }
  const monitor = validateValue(
    PromotedReleaseMonitorSchema,
    "niche-cli-inspect-promoted-monitor-definition",
    candidate.monitor,
    `${label} monitor`,
  );
  const cadence = candidate.cadence_defaults;
  if (
    typeof cadence.shadow_recheck_interval_hours !== "number" ||
    typeof cadence.evaluation_window_size !== "number" ||
    typeof cadence.alert_hysteresis_windows !== "number" ||
    typeof cadence.rollback_cooldown_hours !== "number"
  ) {
    throw new Error(`Invalid ${label}: cadence defaults must be numeric.`);
  }
  return {
    monitor,
    cadence_defaults: {
      shadow_recheck_interval_hours: cadence.shadow_recheck_interval_hours,
      evaluation_window_size: cadence.evaluation_window_size,
      alert_hysteresis_windows: cadence.alert_hysteresis_windows,
      rollback_cooldown_hours: cadence.rollback_cooldown_hours,
    },
  };
}

export async function nicheInspectCommand(
  opts: NicheInspectOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NicheInspectResult> {
  const kind = assertInspectKind(opts.kind);
  const raw = readRequiredJsonFileStrict(opts.filePath);

  let result: NicheInspectResult;
  switch (kind) {
    case "baseline_manifest": {
      const record = validateValue(
        BaselineManifestSchema,
        "niche-cli-inspect-baseline-manifest",
        raw as BaselineManifest,
        "baseline manifest",
      );
      result = {
        kind,
        file_path: opts.filePath,
        summary: {
          manifest_id: record.baseline_manifest_id,
          niche_program_id: record.niche_program_id,
          provider: record.provider,
          model_id: record.model_id,
          provider_metadata_quality: record.provider_metadata_quality,
          benchmark_suite_id: record.benchmark_suite_id,
          source_access_manifest_id: record.source_access_manifest_id,
          tool_allowlist_count: record.tool_allowlist.length,
        },
        record,
      };
      break;
    }
    case "candidate_manifest": {
      const record = validateValue(
        CandidateManifestSchema,
        "niche-cli-inspect-candidate-manifest",
        raw as CandidateManifest,
        "candidate manifest",
      );
      result = {
        kind,
        file_path: opts.filePath,
        summary: {
          manifest_id: record.candidate_manifest_id,
          based_on: record.based_on_baseline_manifest_id,
          niche_program_id: record.niche_program_id,
          provider: record.provider,
          model_id: record.model_id,
          provider_metadata_quality: record.provider_metadata_quality,
          benchmark_suite_id: record.benchmark_suite_id,
          domain_pack_id: record.domain_pack_id,
          action_policy_id: record.action_policy_id,
          retrieval_stack_id: record.retrieval_stack_id,
          verifier_pack_id: record.verifier_pack_id,
          candidate_recipe: record.candidate_recipe,
        },
        record,
      };
      break;
    }
    case "source_access_manifest": {
      const record = validateValue(
        SourceAccessManifestSchema,
        "niche-cli-inspect-source-access-manifest",
        raw as SourceAccessManifest,
        "source access manifest",
      );
      result = {
        kind,
        file_path: opts.filePath,
        summary: {
          manifest_id: record.source_access_manifest_id,
          allowed_tools: record.allowed_tools,
          allowed_retrieval_indices: record.allowed_retrieval_indices,
          allowed_live_sources: record.allowed_live_sources,
          disallowed_sources: record.disallowed_sources,
          sandbox_policy: record.sandbox_policy,
          network_policy: record.network_policy,
          approval_policy: record.approval_policy,
        },
        record,
      };
      break;
    }
    case "candidate_recipe": {
      const record = validateValue(
        CandidateRecipeSchema,
        "niche-cli-inspect-candidate-recipe",
        raw as CandidateRecipe,
        "candidate recipe",
      );
      result = {
        kind,
        file_path: opts.filePath,
        summary: {
          candidate_recipe_id: record.candidate_recipe_id,
          niche_program_id: record.niche_program_id,
          recipe_type: record.recipe_type,
          teacher_runtimes: record.teacher_runtimes,
          input_dataset_count: record.input_dataset_refs.length,
          grader_count: record.grader_refs.length,
          evaluation_input_count: record.evaluation_inputs.length,
          promotion_input_count: record.promotion_inputs.length,
        },
        record,
      };
      break;
    }
    case "artifact": {
      const record = validateValue(
        ArtifactSchema,
        "niche-cli-inspect-artifact",
        raw as Artifact,
        "artifact",
      );
      result = {
        kind,
        file_path: opts.filePath,
        summary: {
          artifact_id: record.artifact_id,
          artifact_type: record.artifact_type,
          version: record.version,
          producer: record.producer,
          dataset_ref_count: record.dataset_refs.length,
          source_trace_ref_count: record.source_trace_refs.length,
          lineage_count: record.lineage.length,
          metric_keys: Object.keys(record.metrics).toSorted((left, right) => left.localeCompare(right)),
        },
        record,
      };
      break;
    }
    case "promoted_monitor": {
      const record =
        raw && typeof raw === "object" && "monitor" in raw && "cadence_defaults" in raw
          ? assertPromotedMonitorDefinition(raw, "promoted monitor definition")
          : validateValue(
              PromotedReleaseMonitorSchema,
              "niche-cli-inspect-promoted-monitor",
              raw as PromotedReleaseMonitor,
              "promoted monitor",
            );
      const monitor = "monitor" in record ? record.monitor : record;
      result = {
        kind,
        file_path: opts.filePath,
        summary: {
          promoted_release_id: monitor.promoted_release_id,
          baseline_manifest_id: monitor.baseline_manifest_id,
          candidate_manifest_id: monitor.candidate_manifest_id,
          drift_thresholds: monitor.drift_thresholds,
          verifier_drift_thresholds: monitor.verifier_drift_thresholds,
          grader_drift_thresholds: monitor.grader_drift_thresholds,
          shadow_recheck_policy: monitor.shadow_recheck_policy.summary,
          rollback_policy: monitor.rollback_policy.summary,
          cadence_defaults:
            "cadence_defaults" in record ? record.cadence_defaults : "not_provided",
        },
        record,
      };
      break;
    }
  }

  runtime.log(
    opts.json
      ? JSON.stringify(result, null, 2)
      : `Inspect kind: ${result.kind}\nFile: ${result.file_path}\n${describeSummary(result.summary)}`,
  );
  return result;
}
