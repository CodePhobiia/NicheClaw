import { describe, expect, it } from "vitest";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import {
  backfillTeacherRolloutAuthority,
  computeArtifactContentHash,
  getArtifactRecord,
  resolveArtifactStorePath,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

describe("artifact rollout authority backfill", () => {
  it("backfills teacher rollout authority onto legacy rollout-eligible artifacts", async () => {
    await withTempHome(async () => {
      const artifact = {
        artifact_id: "legacy-dataset",
        artifact_type: "dataset" as const,
        version: "2026.3.12",
        producer: "legacy-test",
        source_trace_refs: [],
        dataset_refs: [],
        metrics: {},
        governed_data_status: {
          data_zone: "shadow_only",
          retention_policy: "retain",
          redaction_status: "clean",
          pii_status: "none",
          provenance_status: "verified",
          quarantined: false,
        },
        created_at: "2026-03-12T12:00:00.000Z",
        lineage: [
          {
            parent_artifact_id: "source-legacy-dataset",
            relationship: "derived_from",
            derivation_step: "legacy-test-seed",
            notes: "Legacy seeded artifact.",
          },
        ],
      };
      const ref = {
        artifact_id: "legacy-dataset",
        artifact_type: "dataset" as const,
        version: "2026.3.12",
        content_hash: computeArtifactContentHash(artifact),
        rights_state: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: true,
          rights_to_generate_synthetic_from: true,
        },
        created_at: "2026-03-12T12:00:00.000Z",
      };
      saveJsonFile(resolveArtifactStorePath(ref, process.env), { artifact, ref });

      const result = backfillTeacherRolloutAuthority(process.env);

      expect(result.scanned).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.blocked_missing_governed_status).toEqual([]);
      const updated = getArtifactRecord(
        {
          ...ref,
          content_hash: computeArtifactContentHash({
            ...artifact,
            teacher_rollout_authority: {
              embargo_status: "blocked",
              blocked_reason:
                "Shadow-only artifacts remain embargoed for teacher rollout by default.",
            },
          }),
        },
        process.env,
      );
      expect(updated?.artifact.teacher_rollout_authority).toEqual({
        embargo_status: "blocked",
        blocked_reason: "Shadow-only artifacts remain embargoed for teacher rollout by default.",
      });
    });
  });

  it("returns zero counts when no artifacts exist", async () => {
    await withTempHome(async () => {
      const result = backfillTeacherRolloutAuthority(process.env);
      expect(result.scanned).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.blocked_missing_governed_status).toEqual([]);
    });
  });

  it("does not double-update artifacts that already have correct teacher_rollout_authority", async () => {
    await withTempHome(async () => {
      // Create an artifact that already has teacher_rollout_authority set correctly
      const governedDataStatus = {
        data_zone: "dev" as const,
        retention_policy: "retain",
        redaction_status: "clean",
        pii_status: "none",
        provenance_status: "verified",
        quarantined: false,
      };
      const teacherRolloutAuthority = {
        embargo_status: "cleared" as const,
      };
      const artifact = {
        artifact_id: "already-backfilled",
        artifact_type: "dataset" as const,
        version: "2026.3.12",
        producer: "test",
        source_trace_refs: [],
        dataset_refs: [],
        metrics: {},
        governed_data_status: governedDataStatus,
        teacher_rollout_authority: teacherRolloutAuthority,
        created_at: "2026-03-12T12:00:00.000Z",
        lineage: [],
      };
      const ref = {
        artifact_id: "already-backfilled",
        artifact_type: "dataset" as const,
        version: "2026.3.12",
        content_hash: computeArtifactContentHash(artifact),
        rights_state: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: true,
          rights_to_generate_synthetic_from: true,
        },
        created_at: "2026-03-12T12:00:00.000Z",
      };
      saveJsonFile(resolveArtifactStorePath(ref, process.env), { artifact, ref });

      const result = backfillTeacherRolloutAuthority(process.env);

      expect(result.scanned).toBe(1);
      // Already has the correct authority, so no update needed
      expect(result.updated).toBe(0);
      expect(result.blocked_missing_governed_status).toEqual([]);
    });
  });

  it("blocks teacher_rollout for quarantined artifacts", async () => {
    await withTempHome(async () => {
      const artifact = {
        artifact_id: "quarantined-dataset",
        artifact_type: "dataset" as const,
        version: "2026.3.12",
        producer: "test",
        source_trace_refs: [],
        dataset_refs: [],
        metrics: {},
        governed_data_status: {
          data_zone: "dev" as const,
          retention_policy: "retain",
          redaction_status: "clean",
          pii_status: "none",
          provenance_status: "verified",
          quarantined: true,
          quarantine_reason: "Data quality issue detected.",
        },
        created_at: "2026-03-12T12:00:00.000Z",
        lineage: [],
      };
      const ref = {
        artifact_id: "quarantined-dataset",
        artifact_type: "dataset" as const,
        version: "2026.3.12",
        content_hash: computeArtifactContentHash(artifact),
        rights_state: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: true,
          rights_to_generate_synthetic_from: true,
        },
        created_at: "2026-03-12T12:00:00.000Z",
      };
      saveJsonFile(resolveArtifactStorePath(ref, process.env), { artifact, ref });

      const result = backfillTeacherRolloutAuthority(process.env);

      expect(result.scanned).toBe(1);
      expect(result.updated).toBe(1);
      // Verify the updated artifact has blocked status due to quarantine
      const updated = getArtifactRecord(
        {
          ...ref,
          content_hash: computeArtifactContentHash({
            ...artifact,
            teacher_rollout_authority: {
              embargo_status: "blocked",
              blocked_reason: "Data quality issue detected.",
            },
          }),
        },
        process.env,
      );
      expect(updated?.artifact.teacher_rollout_authority?.embargo_status).toBe("blocked");
    });
  });

  it("blocks teacher_rollout for gold_eval data zone artifacts", async () => {
    await withTempHome(async () => {
      const artifact = {
        artifact_id: "gold-eval-dataset",
        artifact_type: "dataset" as const,
        version: "2026.3.12",
        producer: "test",
        source_trace_refs: [],
        dataset_refs: [],
        metrics: {},
        governed_data_status: {
          data_zone: "gold_eval" as const,
          retention_policy: "retain",
          redaction_status: "clean",
          pii_status: "none",
          provenance_status: "verified",
          quarantined: false,
        },
        created_at: "2026-03-12T12:00:00.000Z",
        lineage: [],
      };
      const ref = {
        artifact_id: "gold-eval-dataset",
        artifact_type: "dataset" as const,
        version: "2026.3.12",
        content_hash: computeArtifactContentHash(artifact),
        rights_state: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: true,
          rights_to_generate_synthetic_from: true,
        },
        created_at: "2026-03-12T12:00:00.000Z",
      };
      saveJsonFile(resolveArtifactStorePath(ref, process.env), { artifact, ref });

      const result = backfillTeacherRolloutAuthority(process.env);

      expect(result.scanned).toBe(1);
      expect(result.updated).toBe(1);
      const updated = getArtifactRecord(
        {
          ...ref,
          content_hash: computeArtifactContentHash({
            ...artifact,
            teacher_rollout_authority: {
              embargo_status: "blocked",
              blocked_reason: "Gold-eval artifacts cannot be reused for teacher rollout.",
            },
          }),
        },
        process.env,
      );
      expect(updated?.artifact.teacher_rollout_authority).toEqual({
        embargo_status: "blocked",
        blocked_reason: "Gold-eval artifacts cannot be reused for teacher rollout.",
      });
    });
  });
});
