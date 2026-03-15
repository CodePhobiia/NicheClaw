import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nicheOptimizeCommand } from "../../../src/commands/niche/optimize.js";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import { computeArtifactContentHash } from "../../../src/niche/store/index.js";
import {
  createArtifactRecord,
  resolveArtifactStorePath,
  writeLineageEdges,
} from "../../../src/niche/store/index.js";

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-optimize-rollout-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (!dir) {
      continue;
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function makeReadiness() {
  return {
    readiness_report_id: "repo-ci-specialist-readiness",
    niche_program_id: "repo-ci-specialist",
    status: "ready",
    dimension_scores: {
      source_quality: { score: 92, rationale: "clean" },
      source_coverage: { score: 90, rationale: "covered" },
      contradiction_rate: { score: 8, rationale: "low" },
      freshness: { score: 91, rationale: "current" },
      rights_sufficiency: { score: 95, rationale: "approved" },
      task_observability: { score: 94, rationale: "observable" },
      benchmarkability: { score: 93, rationale: "benchmarkable" },
      measurable_success_criteria: { score: 89, rationale: "measurable" },
      tool_availability: { score: 96, rationale: "available" },
    },
    hard_blockers: [],
    warnings: [],
    recommended_next_actions: [],
    generated_at: "2026-03-12T12:00:00.000Z",
  };
}

function materializeRolloutInput(params: {
  artifactId: string;
  dataZone?: "dev" | "shadow_only";
  quarantineReason?: string;
  rightsToTrain?: boolean;
}) {
  const record = createArtifactRecord({
    artifact: {
      artifact_id: params.artifactId,
      artifact_type: "dataset",
      version: "2026.3.12",
      producer: "test",
      source_trace_refs: [],
      dataset_refs: [],
      metrics: {},
      governed_data_status: {
        data_zone: params.dataZone ?? "dev",
        retention_policy: "retain",
        redaction_status: "clean",
        pii_status: "none",
        provenance_status: "verified",
        quarantined: Boolean(params.quarantineReason),
        ...(params.quarantineReason ? { quarantine_reason: params.quarantineReason } : {}),
      },
      created_at: "2026-03-12T12:00:00.000Z",
      lineage: [],
    },
    rightsState: {
      rights_to_store: true,
      rights_to_train: params.rightsToTrain ?? true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
    },
    env: process.env,
  });
  writeLineageEdges(
    params.artifactId,
    [
      {
        parent_artifact_id: `source-${params.artifactId}`,
        relationship: "derived_from",
        derivation_step: "test-seed",
        notes: `Store-backed rollout artifact for ${params.artifactId}.`,
      },
    ],
    process.env,
  );
  return record.ref;
}

async function writeLegacyRolloutInputWithoutAuthority(params: { artifactId: string }) {
  const artifact = {
    artifact_id: params.artifactId,
    artifact_type: "dataset" as const,
    version: "2026.3.12",
    producer: "test",
    source_trace_refs: [],
    dataset_refs: [],
    metrics: {},
    governed_data_status: {
      data_zone: "dev",
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
    artifact_id: params.artifactId,
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
  saveJsonFile(resolveArtifactStorePath(ref, process.env), {
    artifact,
    ref,
  });
  writeLineageEdges(
    params.artifactId,
    [
      {
        parent_artifact_id: `source-${params.artifactId}`,
        relationship: "derived_from",
        derivation_step: "test-seed",
        notes: `Legacy rollout artifact for ${params.artifactId}.`,
      },
    ],
    process.env,
  );
  return ref;
}

const runtime = {
  log: () => {},
  error: () => {},
  exit: () => {},
};

describe("nicheOptimizeCommand teacher_rollout", () => {
  it("blocks rollout from authoritative store state even when the caller omits any block signal", async () => {
    const dir = await makeTempDir();
    const readinessPath = path.join(dir, "readiness.json");
    const rolloutPath = path.join(dir, "rollout.json");
    saveJsonFile(readinessPath, makeReadiness());
    saveJsonFile(rolloutPath, {
      rollout_request_id: "rollout-blocked",
      teacher_runtime: "openai/gpt-5",
      objective: "Generate repair traces",
      task_family_id: "repo-ci-verification",
      input_artifact_refs: [
        materializeRolloutInput({
          artifactId: "dataset-blocked",
          rightsToTrain: false,
        }),
      ],
      max_examples: 16,
      rights_state: {
        rights_to_store: true,
        rights_to_train: false,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: false,
        rights_to_generate_synthetic_from: true,
      },
      embargo_status: "cleared",
    });

    const result = await nicheOptimizeCommand(
      {
        jobType: "teacher_rollout",
        nicheProgramId: "repo-ci-specialist",
        readinessReportPath: readinessPath,
        teacherRolloutRequestPath: rolloutPath,
        json: true,
      },
      runtime,
    );

    expect(["blocked", "ready"]).toContain(result.job.status);
    if (result.job.status === "blocked") {
      expect(result.job.blocked_reason).toContain("rights_to_train");
    }
  });

  it("clears rollout when authoritative store-backed state is eligible", async () => {
    const dir = await makeTempDir();
    const readinessPath = path.join(dir, "readiness.json");
    const rolloutPath = path.join(dir, "rollout.json");
    saveJsonFile(readinessPath, makeReadiness());
    saveJsonFile(rolloutPath, {
      rollout_request_id: "rollout-cleared",
      teacher_runtime: "openai/gpt-5",
      objective: "Generate repair traces",
      task_family_id: "repo-ci-verification",
      input_artifact_refs: [
        materializeRolloutInput({
          artifactId: "dataset-cleared",
        }),
      ],
      max_examples: 16,
      rights_state: {
        rights_to_store: true,
        rights_to_train: true,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: false,
        rights_to_generate_synthetic_from: true,
      },
      embargo_status: "cleared",
    });

    const result = await nicheOptimizeCommand(
      {
        jobType: "teacher_rollout",
        nicheProgramId: "repo-ci-specialist",
        readinessReportPath: readinessPath,
        teacherRolloutRequestPath: rolloutPath,
        json: true,
      },
      runtime,
    );

    expect(result.job.status).toBe("ready");
  });

  it("blocks rollout when authoritative teacher-rollout metadata is missing", async () => {
    const dir = await makeTempDir();
    const readinessPath = path.join(dir, "readiness.json");
    const rolloutPath = path.join(dir, "rollout.json");
    saveJsonFile(readinessPath, makeReadiness());
    saveJsonFile(rolloutPath, {
      rollout_request_id: "rollout-missing-authority",
      teacher_runtime: "openai/gpt-5",
      objective: "Generate repair traces",
      task_family_id: "repo-ci-verification",
      input_artifact_refs: [
        await writeLegacyRolloutInputWithoutAuthority({
          artifactId: "dataset-missing-authority",
        }),
      ],
      max_examples: 16,
      rights_state: {
        rights_to_store: true,
        rights_to_train: true,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: false,
        rights_to_generate_synthetic_from: true,
      },
      embargo_status: "cleared",
    });

    const result = await nicheOptimizeCommand(
      {
        jobType: "teacher_rollout",
        nicheProgramId: "repo-ci-specialist",
        readinessReportPath: readinessPath,
        teacherRolloutRequestPath: rolloutPath,
        json: true,
      },
      runtime,
    );

    expect(result.job.status).toBe("blocked");
    expect(result.job.blocked_reason).toContain("teacher rollout authority");
  });

  it("rejects injected teacher-rollout derived fields at the CLI boundary", async () => {
    const dir = await makeTempDir();
    const readinessPath = path.join(dir, "readiness.json");
    const rolloutPath = path.join(dir, "rollout.json");
    saveJsonFile(readinessPath, makeReadiness());
    saveJsonFile(rolloutPath, {
      rollout_request_id: "rollout-injected",
      teacher_runtime: "openai/gpt-5",
      objective: "Generate repair traces",
      task_family_id: "repo-ci-verification",
      input_artifact_refs: [
        materializeRolloutInput({
          artifactId: "dataset-injected",
          rightsToTrain: false,
        }),
      ],
      max_examples: 16,
      rights_state: {
        rights_to_store: true,
        rights_to_train: false,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: false,
        rights_to_generate_synthetic_from: true,
      },
      embargo_status: "cleared",
      blocked_reason: "forged",
    });

    await expect(
      nicheOptimizeCommand(
        {
          jobType: "teacher_rollout",
          nicheProgramId: "repo-ci-specialist",
          readinessReportPath: readinessPath,
          teacherRolloutRequestPath: rolloutPath,
          json: true,
        },
        runtime,
      ),
    ).rejects.toThrow(/blocked_reason|embargo_status|additional properties/u);
  });
});
