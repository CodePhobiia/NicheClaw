import fs from "node:fs";
import path from "node:path";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import {
  BenchmarkArmIdentifierSchema,
  BenchmarkSuiteMetadataSchema,
  EvalCaseSchema,
  type BenchmarkArmIdentifier,
} from "../schema/index.js";
import { readJsonFileStrict } from "../json.js";
import { resolveNicheStoreRoots } from "../store/index.js";

export const AtomicBenchmarkSuiteRecordSchema = Type.Object(
  {
    metadata: BenchmarkSuiteMetadataSchema,
    cases: Type.Array(EvalCaseSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export type AtomicBenchmarkSuiteRecord = Static<typeof AtomicBenchmarkSuiteRecordSchema>;

const ATOMIC_BENCHMARK_SUITE_CACHE_KEY = "niche-benchmark-atomic-suite";
const BENCHMARK_ARM_CACHE_KEY = "niche-benchmark-arm";

function resolveBenchmarkSuiteRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolveNicheStoreRoots(env).benchmarkSuites;
}

function resolveBenchmarkArmRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveNicheStoreRoots(env).benchmarkRuns, "arms");
}

function resolveBenchmarkSuitePath(
  suiteId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveBenchmarkSuiteRoot(env), `${suiteId}.json`);
}

function resolveBenchmarkArmPath(
  benchmarkArmId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveBenchmarkArmRoot(env), `${benchmarkArmId}.json`);
}

function assertAtomicSuite(record: AtomicBenchmarkSuiteRecord): AtomicBenchmarkSuiteRecord {
  const result = validateJsonSchemaValue({
    schema: AtomicBenchmarkSuiteRecordSchema,
    cacheKey: ATOMIC_BENCHMARK_SUITE_CACHE_KEY,
    value: record,
  });
  if (!result.ok) {
    const details = result.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid atomic benchmark suite: ${details}`);
  }
  if (record.metadata.case_kind !== "atomic_case") {
    throw new Error("Atomic benchmark suite metadata.case_kind must be atomic_case.");
  }
  const caseMismatches = record.cases.filter(
    (testCase) => testCase.suite_id !== record.metadata.benchmark_suite_id,
  );
  if (caseMismatches.length > 0) {
    throw new Error("Atomic benchmark suite contains cases with mismatched suite_id values.");
  }
  return record;
}

function assertBenchmarkArm(arm: BenchmarkArmIdentifier): BenchmarkArmIdentifier {
  const result = validateJsonSchemaValue({
    schema: BenchmarkArmIdentifierSchema,
    cacheKey: BENCHMARK_ARM_CACHE_KEY,
    value: arm,
  });
  if (result.ok) {
    return arm;
  }
  const details = result.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid benchmark arm metadata: ${details}`);
}

export function createAtomicBenchmarkSuite(
  record: AtomicBenchmarkSuiteRecord,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertAtomicSuite(record);
  const pathname = resolveBenchmarkSuitePath(validated.metadata.benchmark_suite_id, env);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing atomic benchmark suite: ${pathname}`);
  }
  saveJsonFile(pathname, validated);
  return pathname;
}

export function getAtomicBenchmarkSuite(
  suiteId: string,
  env: NodeJS.ProcessEnv = process.env,
): AtomicBenchmarkSuiteRecord | null {
  const raw = readJsonFileStrict(
    resolveBenchmarkSuitePath(suiteId, env),
    `atomic benchmark suite ${suiteId}`,
  );
  if (raw === undefined) {
    return null;
  }
  return assertAtomicSuite(raw as AtomicBenchmarkSuiteRecord);
}

export function listAtomicBenchmarkSuites(
  env: NodeJS.ProcessEnv = process.env,
): AtomicBenchmarkSuiteRecord[] {
  const root = resolveBenchmarkSuiteRoot(env);
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right))
    .map((filename) => {
      const suiteId = filename.replace(/\.json$/u, "");
      const suite = getAtomicBenchmarkSuite(suiteId, env);
      if (!suite) {
        throw new Error(`Benchmark suite disappeared while listing: ${suiteId}`);
      }
      return suite;
    });
}

export function createBenchmarkArm(
  arm: BenchmarkArmIdentifier,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertBenchmarkArm(arm);
  const pathname = resolveBenchmarkArmPath(validated.benchmark_arm_id, env);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing benchmark arm metadata: ${pathname}`);
  }
  saveJsonFile(pathname, validated);
  return pathname;
}

export function getBenchmarkArm(
  benchmarkArmId: string,
  env: NodeJS.ProcessEnv = process.env,
): BenchmarkArmIdentifier | null {
  const raw = readJsonFileStrict(
    resolveBenchmarkArmPath(benchmarkArmId, env),
    `benchmark arm ${benchmarkArmId}`,
  );
  if (raw === undefined) {
    return null;
  }
  return assertBenchmarkArm(raw as BenchmarkArmIdentifier);
}

export function listBenchmarkArms(
  params: { benchmarkSuiteId?: string; armKind?: BenchmarkArmIdentifier["arm_kind"] } = {},
  env: NodeJS.ProcessEnv = process.env,
): BenchmarkArmIdentifier[] {
  const root = resolveBenchmarkArmRoot(env);
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right))
    .map((filename) => {
      const benchmarkArmId = filename.replace(/\.json$/u, "");
      const arm = getBenchmarkArm(benchmarkArmId, env);
      if (!arm) {
        throw new Error(`Benchmark arm disappeared while listing: ${benchmarkArmId}`);
      }
      return arm;
    })
    .filter((arm) => {
      if (params.benchmarkSuiteId && arm.benchmark_suite_id !== params.benchmarkSuiteId) {
        return false;
      }
      if (params.armKind && arm.arm_kind !== params.armKind) {
        return false;
      }
      return true;
    });
}
