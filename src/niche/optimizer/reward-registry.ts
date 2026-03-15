import fs from "node:fs";
import path from "node:path";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { propagateDerivedRights } from "../domain/rights-propagation.js";
import { readJsonFileStrict } from "../json.js";
import {
  ArtifactRefSchema,
  IdentifierString,
  RewardArtifactSchema,
  TimestampString,
  type ArtifactRef,
  type LineageRef,
  type RewardArtifact,
} from "../schema/index.js";
import { resolveNicheStoreRoots } from "../store/index.js";

export const RewardCalibrationMetadataSchema = Type.Object(
  {
    reward_artifact_id: IdentifierString,
    created_at: TimestampString,
    agreement_rate: Type.Number({ minimum: 0, maximum: 1 }),
    sme_sample_count: Type.Integer({ minimum: 0 }),
    required_sme_sample_count: Type.Integer({ minimum: 0 }),
    promotion_eligible: Type.Boolean(),
    notes: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export type RewardCalibrationMetadata = Static<typeof RewardCalibrationMetadataSchema>;

const REWARD_CACHE_KEY = "optimizer-reward-artifact";
const REWARD_CALIBRATION_CACHE_KEY = "optimizer-reward-calibration";

function resolveRewardsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveNicheStoreRoots(env).graders, "reward-artifacts");
}

function resolveRewardCalibrationsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveNicheStoreRoots(env).graders, "reward-calibrations");
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
  const raw = readJsonFileStrict(
    resolveRecordPath(root, recordId),
    `reward registry record ${recordId}`,
  );
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

export function createRewardArtifact(
  rewardArtifact: RewardArtifact,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertValue(
    RewardArtifactSchema,
    REWARD_CACHE_KEY,
    rewardArtifact,
    "reward artifact",
  );
  return writeUniqueRecord(resolveRewardsRoot(env), validated.reward_artifact_id, validated);
}

export function getRewardArtifact(
  rewardArtifactId: string,
  env: NodeJS.ProcessEnv = process.env,
): RewardArtifact | null {
  const raw = readRecord<RewardArtifact>(resolveRewardsRoot(env), rewardArtifactId);
  if (!raw) {
    return null;
  }
  return assertValue(RewardArtifactSchema, REWARD_CACHE_KEY, raw, "reward artifact");
}

export function listRewardArtifacts(env: NodeJS.ProcessEnv = process.env): RewardArtifact[] {
  return listRecords<RewardArtifact>(resolveRewardsRoot(env)).map((record) =>
    assertValue(RewardArtifactSchema, REWARD_CACHE_KEY, record, "reward artifact"),
  );
}

export function createRewardCalibrationMetadata(
  calibration: RewardCalibrationMetadata,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertValue(
    RewardCalibrationMetadataSchema,
    REWARD_CALIBRATION_CACHE_KEY,
    calibration,
    "reward calibration metadata",
  );
  return writeUniqueRecord(
    resolveRewardCalibrationsRoot(env),
    validated.reward_artifact_id,
    validated,
  );
}

export function getRewardCalibrationMetadata(
  rewardArtifactId: string,
  env: NodeJS.ProcessEnv = process.env,
): RewardCalibrationMetadata | null {
  const raw = readRecord<RewardCalibrationMetadata>(
    resolveRewardCalibrationsRoot(env),
    rewardArtifactId,
  );
  if (!raw) {
    return null;
  }
  return assertValue(
    RewardCalibrationMetadataSchema,
    REWARD_CALIBRATION_CACHE_KEY,
    raw,
    "reward calibration metadata",
  );
}

export function listRewardCalibrationMetadata(
  env: NodeJS.ProcessEnv = process.env,
): RewardCalibrationMetadata[] {
  return listRecords<RewardCalibrationMetadata>(resolveRewardCalibrationsRoot(env)).map((record) =>
    assertValue(
      RewardCalibrationMetadataSchema,
      REWARD_CALIBRATION_CACHE_KEY,
      record,
      "reward calibration metadata",
    ),
  );
}

export function listRewardArtifactLineage(
  rewardArtifactId: string,
  env: NodeJS.ProcessEnv = process.env,
): LineageRef[] {
  return getRewardArtifact(rewardArtifactId, env)?.lineage_refs ?? [];
}

export function buildRewardArtifactRef(params: {
  rewardArtifact: RewardArtifact;
  contentHash: string;
}): ArtifactRef {
  const derivedRights =
    params.rewardArtifact.training_inputs.length > 0
      ? propagateDerivedRights(
          params.rewardArtifact.training_inputs.map((input) => input.rights_state),
        ).rightsState
      : {
          rights_to_store: false,
          rights_to_train: false,
          rights_to_benchmark: false,
          rights_to_derive: false,
          rights_to_distill: false,
          rights_to_generate_synthetic_from: false,
        };
  return assertValue(
    ArtifactRefSchema,
    "optimizer-reward-artifact-ref",
    {
      artifact_id: params.rewardArtifact.reward_artifact_id,
      artifact_type: "reward",
      version: params.rewardArtifact.version,
      content_hash: params.contentHash,
      rights_state: derivedRights,
      created_at: params.rewardArtifact.created_at,
    },
    "reward artifact ref",
  );
}
