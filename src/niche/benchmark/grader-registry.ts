import fs from "node:fs";
import path from "node:path";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { loadJsonFile, saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import {
  ArbitrationArtifactSchema,
  ArtifactRefSchema,
  GraderArtifactSchema,
  IdentifierString,
  NonEmptyString,
  TimestampString,
  type ArbitrationArtifact,
  type GraderArtifact,
} from "../schema/index.js";
import { resolveNicheStoreRoots } from "../store/index.js";

export const BenchmarkFixtureMetadataSchema = Type.Object(
  {
    fixture_metadata_id: IdentifierString,
    benchmark_suite_id: IdentifierString,
    suite_hash: NonEmptyString,
    fixture_pack_hash: NonEmptyString,
    environment_snapshot_hash: NonEmptyString,
    created_at: TimestampString,
  },
  { additionalProperties: false },
);

export const GraderSetRecordSchema = Type.Object(
  {
    grader_set_id: IdentifierString,
    grader_refs: Type.Array(ArtifactRefSchema, { minItems: 1 }),
    arbitration_policy_id: IdentifierString,
    fixture_metadata_id: IdentifierString,
    created_at: TimestampString,
  },
  { additionalProperties: false },
);

export type BenchmarkFixtureMetadata = Static<typeof BenchmarkFixtureMetadataSchema>;
export type GraderSetRecord = Static<typeof GraderSetRecordSchema>;

const GRADER_ARTIFACT_CACHE_KEY = "niche-benchmark-grader-artifact";
const ARBITRATION_ARTIFACT_CACHE_KEY = "niche-benchmark-arbitration-artifact";
const FIXTURE_METADATA_CACHE_KEY = "niche-benchmark-fixture-metadata";
const GRADER_SET_CACHE_KEY = "niche-benchmark-grader-set";

function resolveGradersRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolveNicheStoreRoots(env).graders;
}

function resolveSubdir(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGradersRoot(env), name);
}

function resolveRecordPath(root: string, recordId: string): string {
  return path.join(root, `${recordId}.json`);
}

function assertValue<T>(
  schema: Record<string, unknown>,
  cacheKey: string,
  value: T,
  label: string,
): T {
  const result = validateJsonSchemaValue({
    schema,
    cacheKey,
    value,
  });
  if (result.ok) {
    return value;
  }
  const details = result.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid ${label}: ${details}`);
}

function writeUniqueRecord<T extends { [key: string]: unknown }>(
  root: string,
  recordId: string,
  value: T,
): string {
  const pathname = resolveRecordPath(root, recordId);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing record: ${pathname}`);
  }
  saveJsonFile(pathname, value);
  return pathname;
}

function readRecord<T>(root: string, recordId: string): T | null {
  const raw = loadJsonFile(resolveRecordPath(root, recordId));
  if (raw === undefined) {
    return null;
  }
  return raw as T;
}

function listRecords<T>(root: string): T[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right))
    .map((filename) => readRecord<T>(root, filename.replace(/\.json$/u, "")))
    .filter((value): value is T => value !== null);
}

export function createGraderArtifact(
  grader: GraderArtifact,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertValue(
    GraderArtifactSchema,
    GRADER_ARTIFACT_CACHE_KEY,
    grader,
    "grader artifact",
  );
  return writeUniqueRecord(resolveSubdir("grader-artifacts", env), validated.grader_id, validated);
}

export function getGraderArtifact(
  graderId: string,
  env: NodeJS.ProcessEnv = process.env,
): GraderArtifact | null {
  const raw = readRecord<GraderArtifact>(resolveSubdir("grader-artifacts", env), graderId);
  if (!raw) {
    return null;
  }
  return assertValue(
    GraderArtifactSchema,
    GRADER_ARTIFACT_CACHE_KEY,
    raw,
    "grader artifact",
  );
}

export function listGraderArtifacts(
  env: NodeJS.ProcessEnv = process.env,
): GraderArtifact[] {
  return listRecords<GraderArtifact>(resolveSubdir("grader-artifacts", env)).map((grader) =>
    assertValue(
      GraderArtifactSchema,
      GRADER_ARTIFACT_CACHE_KEY,
      grader,
      "grader artifact",
    ),
  );
}

export function createArbitrationArtifact(
  arbitration: ArbitrationArtifact,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertValue(
    ArbitrationArtifactSchema,
    ARBITRATION_ARTIFACT_CACHE_KEY,
    arbitration,
    "arbitration artifact",
  );
  return writeUniqueRecord(
    resolveSubdir("arbitration-artifacts", env),
    validated.arbitration_policy_id,
    validated,
  );
}

export function getArbitrationArtifact(
  arbitrationPolicyId: string,
  env: NodeJS.ProcessEnv = process.env,
): ArbitrationArtifact | null {
  const raw = readRecord<ArbitrationArtifact>(
    resolveSubdir("arbitration-artifacts", env),
    arbitrationPolicyId,
  );
  if (!raw) {
    return null;
  }
  return assertValue(
    ArbitrationArtifactSchema,
    ARBITRATION_ARTIFACT_CACHE_KEY,
    raw,
    "arbitration artifact",
  );
}

export function listArbitrationArtifacts(
  env: NodeJS.ProcessEnv = process.env,
): ArbitrationArtifact[] {
  return listRecords<ArbitrationArtifact>(resolveSubdir("arbitration-artifacts", env)).map(
    (artifact) =>
      assertValue(
        ArbitrationArtifactSchema,
        ARBITRATION_ARTIFACT_CACHE_KEY,
        artifact,
        "arbitration artifact",
      ),
  );
}

export function createBenchmarkFixtureMetadata(
  fixtureMetadata: BenchmarkFixtureMetadata,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertValue(
    BenchmarkFixtureMetadataSchema,
    FIXTURE_METADATA_CACHE_KEY,
    fixtureMetadata,
    "benchmark fixture metadata",
  );
  return writeUniqueRecord(
    resolveSubdir("fixture-metadata", env),
    validated.fixture_metadata_id,
    validated,
  );
}

export function getBenchmarkFixtureMetadata(
  fixtureMetadataId: string,
  env: NodeJS.ProcessEnv = process.env,
): BenchmarkFixtureMetadata | null {
  const raw = readRecord<BenchmarkFixtureMetadata>(
    resolveSubdir("fixture-metadata", env),
    fixtureMetadataId,
  );
  if (!raw) {
    return null;
  }
  return assertValue(
    BenchmarkFixtureMetadataSchema,
    FIXTURE_METADATA_CACHE_KEY,
    raw,
    "benchmark fixture metadata",
  );
}

export function listBenchmarkFixtureMetadata(
  env: NodeJS.ProcessEnv = process.env,
): BenchmarkFixtureMetadata[] {
  return listRecords<BenchmarkFixtureMetadata>(resolveSubdir("fixture-metadata", env)).map(
    (fixtureMetadata) =>
      assertValue(
        BenchmarkFixtureMetadataSchema,
        FIXTURE_METADATA_CACHE_KEY,
        fixtureMetadata,
        "benchmark fixture metadata",
      ),
  );
}

export function createGraderSet(
  graderSet: GraderSetRecord,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertValue(
    GraderSetRecordSchema,
    GRADER_SET_CACHE_KEY,
    graderSet,
    "grader set",
  );
  return writeUniqueRecord(resolveSubdir("grader-sets", env), validated.grader_set_id, validated);
}

export function getGraderSet(
  graderSetId: string,
  env: NodeJS.ProcessEnv = process.env,
): GraderSetRecord | null {
  const raw = readRecord<GraderSetRecord>(resolveSubdir("grader-sets", env), graderSetId);
  if (!raw) {
    return null;
  }
  return assertValue(GraderSetRecordSchema, GRADER_SET_CACHE_KEY, raw, "grader set");
}

export function listGraderSets(
  env: NodeJS.ProcessEnv = process.env,
): GraderSetRecord[] {
  return listRecords<GraderSetRecord>(resolveSubdir("grader-sets", env)).map((graderSet) =>
    assertValue(GraderSetRecordSchema, GRADER_SET_CACHE_KEY, graderSet, "grader set"),
  );
}
