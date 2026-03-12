import fs from "node:fs";
import path from "node:path";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import {
  EvidenceBundleRefSchema,
  HashString,
  IdentifierString,
  NonEmptyString,
  ReplayabilityStatusSchema,
  TimestampString,
} from "../schema/index.js";
import { readJsonFileStrict } from "../json.js";
import { resolveNicheStoreRoots } from "./paths.js";

export const ReplayBundleEnvironmentSnapshotSchema = Type.Object(
  {
    environment_hash: HashString,
    platform: NonEmptyString,
    notes: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ReplayBundleRecordSchema = Type.Object(
  {
    replay_bundle_id: IdentifierString,
    trace_id: IdentifierString,
    context_bundle_id: IdentifierString,
    runtime_snapshot_id: IdentifierString,
    determinism_policy_id: IdentifierString,
    evidence_bundle_refs: Type.Array(EvidenceBundleRefSchema, { minItems: 1 }),
    benchmark_suite_id: IdentifierString,
    suite_hash: HashString,
    fixture_version: NonEmptyString,
    environment_snapshot: ReplayBundleEnvironmentSnapshotSchema,
    replayability_status: ReplayabilityStatusSchema,
    created_at: TimestampString,
  },
  { additionalProperties: false },
);

export type ReplayBundleEnvironmentSnapshot = Static<
  typeof ReplayBundleEnvironmentSnapshotSchema
>;
export type ReplayBundleRecord = Static<typeof ReplayBundleRecordSchema>;

const REPLAY_BUNDLE_CACHE_KEY = "niche-store-replay-bundle";

function assertReplayBundle(bundle: ReplayBundleRecord): ReplayBundleRecord {
  const result = validateJsonSchemaValue({
    schema: ReplayBundleRecordSchema,
    cacheKey: REPLAY_BUNDLE_CACHE_KEY,
    value: bundle,
  });
  if (result.ok) {
    return bundle;
  }
  const details = result.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid replay bundle: ${details}`);
}

function resolveReplayBundleRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolveNicheStoreRoots(env).replayBundles;
}

function resolveReplayBundlePath(
  replayBundleId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveReplayBundleRoot(env), `${replayBundleId}.json`);
}

export function createReplayBundle(
  bundle: ReplayBundleRecord,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertReplayBundle(bundle);
  const pathname = resolveReplayBundlePath(validated.replay_bundle_id, env);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing replay bundle: ${pathname}`);
  }
  saveJsonFile(pathname, validated);
  return pathname;
}

export function getReplayBundle(
  replayBundleId: string,
  env: NodeJS.ProcessEnv = process.env,
): ReplayBundleRecord | null {
  const raw = readJsonFileStrict(
    resolveReplayBundlePath(replayBundleId, env),
    `replay bundle ${replayBundleId}`,
  );
  if (raw === undefined) {
    return null;
  }
  return assertReplayBundle(raw as ReplayBundleRecord);
}
