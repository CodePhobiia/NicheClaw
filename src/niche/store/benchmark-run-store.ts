import fs from "node:fs";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { readJsonFileStrict } from "../json.js";
import {
  BenchmarkResultRecordSchema,
  type BenchmarkCaseKind,
  type BenchmarkResultRecord,
} from "../schema/index.js";
import { resolveBenchmarkRunStorePath, resolveNicheStoreRoots } from "./paths.js";

const BENCHMARK_RESULT_RECORD_CACHE_KEY = "niche-store-benchmark-result-record";

function assertBenchmarkResultRecord(
  record: BenchmarkResultRecord,
  label = "benchmark result record",
): BenchmarkResultRecord {
  const result = validateJsonSchemaValue({
    schema: BenchmarkResultRecordSchema,
    cacheKey: BENCHMARK_RESULT_RECORD_CACHE_KEY,
    value: record,
  });
  if (result.ok) {
    return record;
  }
  const details = result.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid ${label}: ${details}`);
}

export function writeBenchmarkResultRecord(
  record: BenchmarkResultRecord,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertBenchmarkResultRecord(record);
  const pathname = resolveBenchmarkRunStorePath(validated.benchmark_result_record_id, env);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing benchmark result record: ${pathname}`);
  }
  saveJsonFile(pathname, validated);
  return pathname;
}

export function getBenchmarkResultRecord(
  benchmarkResultRecordId: string,
  env: NodeJS.ProcessEnv = process.env,
): BenchmarkResultRecord | null {
  const raw = readJsonFileStrict(
    resolveBenchmarkRunStorePath(benchmarkResultRecordId, env),
    `benchmark result record ${benchmarkResultRecordId}`,
  );
  if (raw === undefined) {
    return null;
  }
  return assertBenchmarkResultRecord(raw as BenchmarkResultRecord);
}

export function listBenchmarkResultRecords(
  params: {
    caseKind?: BenchmarkCaseKind;
    benchmarkSuiteId?: string;
    baselineManifestId?: string;
    candidateManifestId?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): BenchmarkResultRecord[] {
  const root = resolveNicheStoreRoots(params.env).benchmarkRuns;
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/u, ""))
    .toSorted((left, right) => left.localeCompare(right))
    .map((recordId) => getBenchmarkResultRecord(recordId, params.env))
    .filter((record): record is BenchmarkResultRecord => record !== null)
    .filter((record) => {
      if (params.caseKind && record.summary.case_kind !== params.caseKind) {
        return false;
      }
      if (
        params.benchmarkSuiteId &&
        record.summary.benchmark_suite_id !== params.benchmarkSuiteId
      ) {
        return false;
      }
      if (params.baselineManifestId && record.baseline_manifest_id !== params.baselineManifestId) {
        return false;
      }
      if (
        params.candidateManifestId &&
        record.candidate_manifest_id !== params.candidateManifestId
      ) {
        return false;
      }
      return true;
    });
}
