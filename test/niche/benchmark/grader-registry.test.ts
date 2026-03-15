import { describe, expect, it } from "vitest";
import {
  computeBenchmarkFixturePackHash,
  computeBenchmarkSuiteHash,
  computeCalibrationMetrics,
  computeEnvironmentSnapshotHash,
  createArbitrationArtifact,
  createBenchmarkFixtureMetadata,
  createGraderArtifact,
  createGraderSet,
  getArbitrationArtifact,
  getBenchmarkFixtureMetadata,
  getGraderArtifact,
  getGraderSet,
  listArbitrationArtifacts,
  listBenchmarkFixtureMetadata,
  listGraderArtifacts,
  listGraderSets,
  requiredSmeSampleCount,
} from "../../../src/niche/benchmark/index.js";
import type {
  ArbitrationArtifact,
  ArtifactRef,
  GraderArtifact,
} from "../../../src/niche/schema/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeArtifactRef(): ArtifactRef {
  return {
    artifact_id: "artifact-grader-1",
    artifact_type: "grader",
    version: "2026.3.12",
    content_hash: "0123456789abcdef0123456789abcdef",
    rights_state: {
      rights_to_store: true,
      rights_to_train: false,
      rights_to_benchmark: true,
      rights_to_derive: false,
      rights_to_distill: false,
      rights_to_generate_synthetic_from: false,
    },
    created_at: "2026-03-12T11:30:00.000Z",
  };
}

function makeGraderArtifact(): GraderArtifact {
  return {
    grader_id: "grader-task-success",
    grader_type: "deterministic_rule",
    version: "2026.3.12",
    owner: "quality-team",
    calibration_suite_id: "calibration-suite-v1",
    prompt_or_rule_hash: "hash-rule-v1",
    decision_schema: "binary-pass-fail",
    expected_failure_modes: ["false_positive", "false_negative"],
    created_at: "2026-03-12T11:30:00.000Z",
  };
}

function makeArbitrationArtifact(): ArbitrationArtifact {
  return {
    arbitration_policy_id: "arbitration-policy-v1",
    grader_refs: [makeArtifactRef()],
    conflict_resolution_mode: "sme_required_on_conflict",
    sme_sampling_rate: 0.2,
    promotion_blocking_conflict_types: ["hard_fail_conflict"],
  };
}

describe("grader registry", () => {
  it("creates, loads, and lists grader, arbitration, fixture, and grader-set records", async () => {
    await withTempHome(async () => {
      const grader = makeGraderArtifact();
      const arbitration = makeArbitrationArtifact();
      const fixtureMetadata = {
        fixture_metadata_id: "fixture-metadata-v1",
        benchmark_suite_id: "repo-ci-suite",
        suite_hash: computeBenchmarkSuiteHash({ suite: "repo-ci-suite", version: "1" }),
        fixture_pack_hash: computeBenchmarkFixturePackHash({ fixtures: ["a", "b"] }),
        environment_snapshot_hash: computeEnvironmentSnapshotHash({
          cwd: "C:\\Users\\talme\\NicheClaw",
        }),
        created_at: "2026-03-12T11:31:00.000Z",
      } as const;
      const graderSet = {
        grader_set_id: "grader-set-v1",
        grader_refs: [makeArtifactRef()],
        arbitration_policy_id: "arbitration-policy-v1",
        fixture_metadata_id: "fixture-metadata-v1",
        created_at: "2026-03-12T11:32:00.000Z",
      } as const;

      createGraderArtifact(grader, process.env);
      createArbitrationArtifact(arbitration, process.env);
      createBenchmarkFixtureMetadata(fixtureMetadata, process.env);
      createGraderSet(graderSet, process.env);

      expect(getGraderArtifact(grader.grader_id, process.env)).toEqual(grader);
      expect(getArbitrationArtifact(arbitration.arbitration_policy_id, process.env)).toEqual(
        arbitration,
      );
      expect(getBenchmarkFixtureMetadata(fixtureMetadata.fixture_metadata_id, process.env)).toEqual(
        fixtureMetadata,
      );
      expect(getGraderSet(graderSet.grader_set_id, process.env)).toEqual(graderSet);
      expect(listGraderArtifacts(process.env)).toEqual([grader]);
      expect(listArbitrationArtifacts(process.env)).toEqual([arbitration]);
      expect(listBenchmarkFixtureMetadata(process.env)).toEqual([fixtureMetadata]);
      expect(listGraderSets(process.env)).toEqual([graderSet]);
    });
  });
});

describe("calibration", () => {
  it("enforces SME sampling minimums before marking a grader promotion-eligible", () => {
    expect(requiredSmeSampleCount(10)).toBe(10);
    expect(requiredSmeSampleCount(50)).toBe(20);
    expect(requiredSmeSampleCount(250)).toBe(25);

    const insufficient = computeCalibrationMetrics({
      goldBenchmarkCaseCount: 50,
      examples: [
        {
          caseId: "case-1",
          expectedOutcome: "fail",
          graderOutcome: "fail",
          smeOutcome: "fail",
        },
      ],
    });
    const sufficient = computeCalibrationMetrics({
      goldBenchmarkCaseCount: 50,
      examples: Array.from({ length: 20 }, (_, index) => ({
        caseId: `case-${index + 1}`,
        expectedOutcome: index % 2 === 0 ? "fail" : "pass",
        graderOutcome: index % 2 === 0 ? "fail" : "pass",
        smeOutcome: index % 2 === 0 ? "fail" : "pass",
      })),
    });

    expect(insufficient.promotionEligible).toBe(false);
    expect(insufficient.requiredSmeSampleCount).toBe(20);
    expect(sufficient.promotionEligible).toBe(true);
    expect(sufficient.agreementRate).toBe(1);
  });
});

describe("fixture versioning", () => {
  it("hashes suite, fixture, and environment data stably across ordering and path separators", () => {
    const suiteHashA = computeBenchmarkSuiteHash({
      version: "1",
      taskFamilies: ["ci_repair", "repo_navigation"],
    });
    const suiteHashB = computeBenchmarkSuiteHash({
      taskFamilies: ["ci_repair", "repo_navigation"],
      version: "1",
    });
    const fixtureHashA = computeBenchmarkFixturePackHash({
      root: "C:\\Users\\talme\\NicheClaw\\fixtures",
      items: ["a", "b"],
    });
    const fixtureHashB = computeBenchmarkFixturePackHash({
      root: "/Users/talme/NicheClaw/fixtures",
      items: ["a", "b"],
    });
    const environmentHashA = computeEnvironmentSnapshotHash({
      cwd: "C:\\Users\\talme\\NicheClaw",
      platform: "win32",
    });
    const environmentHashB = computeEnvironmentSnapshotHash({
      cwd: "/Users/talme/NicheClaw",
      platform: "win32",
    });

    expect(suiteHashA).toBe(suiteHashB);
    expect(fixtureHashA).toBe(fixtureHashB);
    expect(environmentHashA).toBe(environmentHashB);
  });
});
