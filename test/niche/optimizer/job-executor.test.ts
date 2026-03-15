import { describe, expect, it, vi } from "vitest";
import {
  executeOptimizerJob,
  planCandidateGenerationJob,
  type CandidateGenerationOutput,
  type OptimizerJob,
} from "../../../src/niche/optimizer/index.js";
import type { Artifact, ArtifactRef } from "../../../src/niche/schema/index.js";
import {
  createArtifactRecord,
  getArtifactRecord,
  getParentsForArtifact,
  listArtifactRecords,
  writeLineageEdges,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeArtifactRef(id: string, type: ArtifactRef["artifact_type"] = "dataset"): ArtifactRef {
  return {
    artifact_id: id,
    artifact_type: type,
    version: "2026.3.14",
    content_hash: `hash-${id}-0123456789abcdef`,
    rights_state: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: false,
      rights_to_generate_synthetic_from: true,
    },
    created_at: "2026-03-14T10:00:00.000Z",
  };
}

function makeReadyJob(artifactRefs: ArtifactRef[]): OptimizerJob {
  return {
    job_id: "test-job-001",
    job_type: "candidate_generation",
    status: "ready",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-14T10:00:00.000Z",
    artifact_refs: artifactRefs,
    governance_checks: [
      {
        check_id: "store-binding",
        passed: true,
        blocking: true,
        message: "All inputs present.",
      },
    ],
    input_summary: "Generate candidate from test recipe.",
    reward_artifact_ids: [],
  };
}

function makeOutputArtifact(params: {
  artifactId: string;
  parentRefs: ArtifactRef[];
}): CandidateGenerationOutput["artifacts"][number] {
  return {
    artifact: {
      artifact_id: params.artifactId,
      artifact_type: "dataset",
      version: "2026.3.14",
      producer: "optimizer-test",
      source_trace_refs: [],
      dataset_refs: [],
      metrics: { quality_score: 0.95 },
      governed_data_status: {
        data_zone: "dev",
        retention_policy: "retain_for_90_days",
        redaction_status: "clean",
        pii_status: "none",
        provenance_status: "verified",
        quarantined: false,
      },
      created_at: "2026-03-14T10:05:00.000Z",
      lineage: [],
    },
    parent_refs: params.parentRefs,
  };
}

describe("optimizer job executor", () => {
  it("executes a ready job and persists produced artifacts with lineage", async () => {
    await withTempHome(async () => {
      const parentRef = makeArtifactRef("parent-dataset-v1");
      createArtifactRecord({
        artifact: {
          artifact_id: "parent-dataset-v1",
          artifact_type: "dataset",
          version: "2026.3.14",
          producer: "test-ingest",
          source_trace_refs: [],
          dataset_refs: [],
          metrics: {},
          governed_data_status: {
            data_zone: "dev",
            retention_policy: "retain_for_90_days",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            quarantined: false,
          },
          created_at: "2026-03-14T10:00:00.000Z",
          lineage: [],
        },
        rightsState: parentRef.rights_state,
        env: process.env,
      });
      writeLineageEdges(
        "parent-dataset-v1",
        [
          {
            parent_artifact_id: "root-source",
            relationship: "derived_from",
            derivation_step: "ingest",
            notes: "Root source.",
          },
        ],
        process.env,
      );

      const job = makeReadyJob([parentRef]);

      const result = executeOptimizerJob({
        job,
        executor: ({ job: executedJob }) => ({
          artifacts: [
            makeOutputArtifact({
              artifactId: "output-candidate-v1",
              parentRefs: executedJob.artifact_refs,
            }),
          ],
          notes: "Generated candidate artifacts from test recipe.",
        }),
        env: process.env,
      });

      expect(result.status).toBe("completed");
      expect(result.result_metadata).not.toBeNull();
      expect(result.result_metadata?.produced_artifact_refs).toHaveLength(1);
      expect(result.result_metadata?.produced_artifact_refs[0].artifact_id).toBe(
        "output-candidate-v1",
      );

      const storedOutput = getArtifactRecord(
        result.result_metadata!.produced_artifact_refs[0],
        process.env,
      );
      expect(storedOutput).not.toBeNull();

      const lineage = getParentsForArtifact("output-candidate-v1", process.env);
      expect(lineage).toHaveLength(1);
      expect(lineage[0].parent_artifact_id).toBe("parent-dataset-v1");
    });
  });

  it("rejects non-ready jobs", async () => {
    await withTempHome(async () => {
      const job: OptimizerJob = {
        ...makeReadyJob([]),
        status: "blocked",
        blocked_reason: "Missing inputs.",
      };

      const result = executeOptimizerJob({
        job,
        executor: () => null,
        env: process.env,
      });

      expect(result.status).toBe("blocked");
      expect(result.error).toContain("not in ready status");
    });
  });

  it("fails when executor throws", async () => {
    await withTempHome(async () => {
      const job = makeReadyJob([makeArtifactRef("input-v1")]);

      const result = executeOptimizerJob({
        job,
        executor: () => {
          throw new Error("Provider API failure");
        },
        env: process.env,
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Provider API failure");
    });
  });

  it("fails when executor produces no artifacts", async () => {
    await withTempHome(async () => {
      const job = makeReadyJob([makeArtifactRef("input-v1")]);

      const result = executeOptimizerJob({
        job,
        executor: () => ({ artifacts: [] }),
        env: process.env,
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("no artifacts");
    });
  });

  it("propagates derived rights from parent artifacts", async () => {
    await withTempHome(async () => {
      const parentRef: ArtifactRef = {
        ...makeArtifactRef("parent-limited-v1"),
        rights_state: {
          rights_to_store: true,
          rights_to_train: true,
          rights_to_benchmark: true,
          rights_to_derive: true,
          rights_to_distill: false,
          rights_to_generate_synthetic_from: false,
        },
      };
      createArtifactRecord({
        artifact: {
          artifact_id: "parent-limited-v1",
          artifact_type: "dataset",
          version: "2026.3.14",
          producer: "test",
          source_trace_refs: [],
          dataset_refs: [],
          metrics: {},
          governed_data_status: {
            data_zone: "dev",
            retention_policy: "retain_for_90_days",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            quarantined: false,
          },
          created_at: "2026-03-14T10:00:00.000Z",
          lineage: [],
        },
        rightsState: parentRef.rights_state,
        env: process.env,
      });
      writeLineageEdges(
        "parent-limited-v1",
        [
          {
            parent_artifact_id: "root",
            relationship: "derived_from",
            derivation_step: "ingest",
            notes: "Root.",
          },
        ],
        process.env,
      );

      const job = makeReadyJob([parentRef]);
      const result = executeOptimizerJob({
        job,
        executor: ({ job: executedJob }) => ({
          artifacts: [
            makeOutputArtifact({
              artifactId: "output-limited-v1",
              parentRefs: executedJob.artifact_refs,
            }),
          ],
        }),
        env: process.env,
      });

      expect(result.status).toBe("completed");
      const stored = getArtifactRecord(
        result.result_metadata!.produced_artifact_refs[0],
        process.env,
      );
      expect(stored?.ref.rights_state.rights_to_distill).toBe(false);
      expect(stored?.ref.rights_state.rights_to_generate_synthetic_from).toBe(false);
    });
  });
});
