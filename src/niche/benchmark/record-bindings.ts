import {
  getManifestComparisonIssues,
  type BaselineManifest,
  type BenchmarkResultRecord,
  type CandidateManifest,
} from "../schema/index.js";
import { getBaselineManifest, getCandidateManifest } from "../store/index.js";
import { getBenchmarkArm } from "./suite-registry.js";

export function resolveBenchmarkRecordTemplateManifestIds(record: BenchmarkResultRecord): {
  baselineTemplateManifestId: string;
  candidateTemplateManifestId: string;
} {
  return {
    baselineTemplateManifestId: record.baseline_template_manifest_id ?? record.baseline_manifest_id,
    candidateTemplateManifestId:
      record.candidate_template_manifest_id ?? record.candidate_manifest_id,
  };
}

export function validateBenchmarkRecordBindingsAgainstInput(params: {
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  results: BenchmarkResultRecord[];
  usageLabel: "policy comparison" | "release";
}): string[] {
  const issues: string[] = [];

  for (const result of params.results) {
    const templateManifestIds = resolveBenchmarkRecordTemplateManifestIds(result);
    if (
      templateManifestIds.baselineTemplateManifestId !==
      params.baselineManifest.baseline_manifest_id
    ) {
      issues.push(
        `Benchmark result ${result.summary.benchmark_result_id} is bound to baseline template manifest ${templateManifestIds.baselineTemplateManifestId}, expected ${params.baselineManifest.baseline_manifest_id}.`,
      );
    }
    if (
      templateManifestIds.candidateTemplateManifestId !==
      params.candidateManifest.candidate_manifest_id
    ) {
      issues.push(
        `Benchmark result ${result.summary.benchmark_result_id} is bound to candidate template manifest ${templateManifestIds.candidateTemplateManifestId}, expected ${params.candidateManifest.candidate_manifest_id}.`,
      );
    }

    const runtimeBaselineManifest = getBaselineManifest(result.baseline_manifest_id, process.env);
    if (
      !runtimeBaselineManifest &&
      result.baseline_manifest_id !== params.baselineManifest.baseline_manifest_id
    ) {
      issues.push(
        `Benchmark result ${result.summary.benchmark_result_id} references missing runtime baseline manifest ${result.baseline_manifest_id}.`,
      );
    }
    const runtimeCandidateManifest = getCandidateManifest(
      result.candidate_manifest_id,
      process.env,
    );
    if (
      !runtimeCandidateManifest &&
      result.candidate_manifest_id !== params.candidateManifest.candidate_manifest_id
    ) {
      issues.push(
        `Benchmark result ${result.summary.benchmark_result_id} references missing runtime candidate manifest ${result.candidate_manifest_id}.`,
      );
    }

    if (runtimeBaselineManifest && runtimeCandidateManifest) {
      const comparisonIssues = getManifestComparisonIssues(
        runtimeBaselineManifest,
        runtimeCandidateManifest,
      );
      for (const comparisonIssue of comparisonIssues) {
        issues.push(
          `Benchmark result ${result.summary.benchmark_result_id} runtime manifests are incompatible: ${comparisonIssue.message}`,
        );
      }
    }

    if (
      result.run_trace_refs.length === 0 ||
      result.replay_bundle_refs.length === 0 ||
      result.evidence_bundle_ids.length === 0
    ) {
      issues.push(
        `Benchmark result ${result.summary.benchmark_result_id} lacks durable run/replay/evidence refs required for ${params.usageLabel}.`,
      );
    }
    if (!result.arbitration_outcome_summary) {
      issues.push(
        `Benchmark result ${result.summary.benchmark_result_id} is missing an arbitration outcome summary.`,
      );
    }

    const expectedBaselineManifestId =
      runtimeBaselineManifest?.baseline_manifest_id ?? params.baselineManifest.baseline_manifest_id;
    const baselineArm = getBenchmarkArm(result.summary.baseline_arm_id, process.env);
    if (!baselineArm) {
      issues.push(
        `Benchmark result ${result.summary.benchmark_result_id} references missing baseline arm ${result.summary.baseline_arm_id}.`,
      );
    } else {
      if (baselineArm.manifest_id !== expectedBaselineManifestId) {
        issues.push(
          `Benchmark result ${result.summary.benchmark_result_id} baseline arm ${baselineArm.benchmark_arm_id} is bound to manifest ${baselineArm.manifest_id}, expected ${expectedBaselineManifestId}.`,
        );
      }
      if (baselineArm.benchmark_suite_id !== result.summary.benchmark_suite_id) {
        issues.push(
          `Benchmark result ${result.summary.benchmark_result_id} baseline arm ${baselineArm.benchmark_arm_id} targets suite ${baselineArm.benchmark_suite_id}, expected ${result.summary.benchmark_suite_id}.`,
        );
      }
    }

    const expectedCandidateManifestId =
      runtimeCandidateManifest?.candidate_manifest_id ??
      params.candidateManifest.candidate_manifest_id;
    const candidateArm = getBenchmarkArm(result.summary.candidate_arm_id, process.env);
    if (!candidateArm) {
      issues.push(
        `Benchmark result ${result.summary.benchmark_result_id} references missing candidate arm ${result.summary.candidate_arm_id}.`,
      );
    } else {
      if (candidateArm.manifest_id !== expectedCandidateManifestId) {
        issues.push(
          `Benchmark result ${result.summary.benchmark_result_id} candidate arm ${candidateArm.benchmark_arm_id} is bound to manifest ${candidateArm.manifest_id}, expected ${expectedCandidateManifestId}.`,
        );
      }
      if (candidateArm.benchmark_suite_id !== result.summary.benchmark_suite_id) {
        issues.push(
          `Benchmark result ${result.summary.benchmark_result_id} candidate arm ${candidateArm.benchmark_arm_id} targets suite ${candidateArm.benchmark_suite_id}, expected ${result.summary.benchmark_suite_id}.`,
        );
      }
    }
  }

  return issues;
}
