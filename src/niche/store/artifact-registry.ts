import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { readJsonFileStrict } from "../json.js";
import {
  ArtifactGovernedDataStatusSchema,
  ArtifactRefSchema,
  ArtifactSchema,
  type Artifact,
  type ArtifactGovernedDataStatus,
  type ArtifactRef,
  type ArtifactRightsState,
  type ArtifactTeacherRolloutAuthority,
} from "../schema/index.js";
import {
  resolveArtifactsStoreRoot,
  resolveArtifactStorePath,
  resolveArtifactStoreRoot,
  resolveArtifactVersionDirectory,
} from "./paths.js";

type StoredArtifactRecord = {
  artifact: Artifact;
  ref: ArtifactRef;
};

const TEACHER_ROLLOUT_ELIGIBLE_ARTIFACT_TYPES = new Set<Artifact["artifact_type"]>([
  "dataset",
  "run_trace",
]);

const STORED_ARTIFACT_RECORD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    artifact: ArtifactSchema,
    ref: ArtifactRefSchema,
  },
  required: ["artifact", "ref"],
} as const;

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).toSorted(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertArtifactValid<T>(
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
  if (!result.ok) {
    const details = result.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid ${label}: ${details}`);
  }
  return value;
}

export function computeArtifactContentHash(artifact: Artifact): string {
  const hash = createHash("sha256");
  hash.update(
    stableSerialize(
      assertArtifactValid(ArtifactSchema, "niche-store-artifact", artifact, "artifact"),
    ),
  );
  return hash.digest("hex");
}

function assertArtifactRecord(record: StoredArtifactRecord): StoredArtifactRecord {
  return assertArtifactValid(
    STORED_ARTIFACT_RECORD_SCHEMA,
    "niche-store-artifact-record",
    record,
    "artifact record",
  );
}

export function requiresTeacherRolloutAuthority(artifactType: Artifact["artifact_type"]): boolean {
  return TEACHER_ROLLOUT_ELIGIBLE_ARTIFACT_TYPES.has(artifactType);
}

export function computeTeacherRolloutAuthority(params: {
  artifactType: Artifact["artifact_type"];
  governedDataStatus: ArtifactGovernedDataStatus;
  rightsState: ArtifactRightsState;
}): ArtifactTeacherRolloutAuthority {
  if (!requiresTeacherRolloutAuthority(params.artifactType)) {
    throw new Error(
      `Artifact type ${params.artifactType} is not eligible for teacher rollout authority.`,
    );
  }
  if (params.governedDataStatus.quarantined) {
    return {
      embargo_status: "blocked",
      blocked_reason:
        params.governedDataStatus.quarantine_reason ??
        `Artifact type ${params.artifactType} is quarantined for rollout reuse.`,
    };
  }
  if (params.governedDataStatus.data_zone === "gold_eval") {
    return {
      embargo_status: "blocked",
      blocked_reason: "Gold-eval artifacts cannot be reused for teacher rollout.",
    };
  }
  if (params.governedDataStatus.data_zone === "hidden_eval") {
    return {
      embargo_status: "blocked",
      blocked_reason: "Hidden-eval artifacts cannot be reused for teacher rollout.",
    };
  }
  if (params.governedDataStatus.data_zone === "shadow_only") {
    return {
      embargo_status: "blocked",
      blocked_reason: "Shadow-only artifacts remain embargoed for teacher rollout by default.",
    };
  }
  if (!params.rightsState.rights_to_train) {
    return {
      embargo_status: "blocked",
      blocked_reason: "Teacher rollout inputs must retain rights_to_train.",
    };
  }
  return {
    embargo_status: "cleared",
  };
}

function normalizeArtifactForStorage(params: {
  artifact: Artifact;
  rightsState: ArtifactRightsState;
}): Artifact {
  const validatedArtifact = assertArtifactValid(
    ArtifactSchema,
    "niche-store-artifact",
    params.artifact,
    "artifact",
  );
  const {
    governed_data_status: initialGovernedDataStatus,
    teacher_rollout_authority: initialTeacherRolloutAuthority,
    ...restArtifact
  } = validatedArtifact;
  const artifact: Artifact = {
    ...restArtifact,
    ...(initialGovernedDataStatus ? { governed_data_status: initialGovernedDataStatus } : {}),
    ...(initialTeacherRolloutAuthority
      ? { teacher_rollout_authority: initialTeacherRolloutAuthority }
      : {}),
  };
  if (!requiresTeacherRolloutAuthority(artifact.artifact_type)) {
    return artifact;
  }
  if (!artifact.governed_data_status) {
    throw new Error(
      `Artifact ${artifact.artifact_id} requires governed_data_status for rollout authority.`,
    );
  }
  const governedDataStatus = assertArtifactValid(
    ArtifactGovernedDataStatusSchema,
    "niche-store-artifact-governed-data-status",
    artifact.governed_data_status,
    `governed data status for ${artifact.artifact_id}`,
  );
  return {
    ...artifact,
    teacher_rollout_authority: computeTeacherRolloutAuthority({
      artifactType: artifact.artifact_type,
      governedDataStatus,
      rightsState: params.rightsState,
    }),
  };
}

function buildArtifactRef(artifact: Artifact, rightsState: ArtifactRightsState): ArtifactRef {
  return assertArtifactValid(
    ArtifactRefSchema,
    "niche-store-artifact-ref",
    {
      artifact_id: artifact.artifact_id,
      artifact_type: artifact.artifact_type,
      version: artifact.version,
      content_hash: computeArtifactContentHash(artifact),
      rights_state: rightsState,
      created_at: artifact.created_at,
    },
    "artifact ref",
  );
}

function walkArtifactFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const pathname = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkArtifactFiles(pathname));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(pathname);
    }
  }
  return files.toSorted((left, right) => left.localeCompare(right));
}

function readStoredArtifact(pathname: string): StoredArtifactRecord | null {
  const raw = readJsonFileStrict(pathname, `artifact record ${pathname}`);
  if (raw === undefined) {
    return null;
  }
  const record = assertArtifactRecord(raw as StoredArtifactRecord);
  const computedHash = computeArtifactContentHash(record.artifact);
  if (computedHash !== record.ref.content_hash) {
    throw new Error(
      `Artifact hash mismatch for ${pathname}: expected ${record.ref.content_hash}, computed ${computedHash}.`,
    );
  }
  return record;
}

export function createArtifactRecord(params: {
  artifact: Artifact;
  rightsState: ArtifactRightsState;
  env?: NodeJS.ProcessEnv;
}): { path: string; ref: ArtifactRef } {
  const artifact = normalizeArtifactForStorage({
    artifact: params.artifact,
    rightsState: params.rightsState,
  });
  const ref = buildArtifactRef(artifact, params.rightsState);

  const versionDir = resolveArtifactVersionDirectory(
    artifact.artifact_type,
    artifact.artifact_id,
    params.env,
  );
  if (fs.existsSync(versionDir)) {
    const duplicateVersion = fs
      .readdirSync(versionDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .some((entry) => entry.name.startsWith(`${artifact.version}--`));
    if (duplicateVersion) {
      throw new Error(
        `Refusing to overwrite existing artifact version ${artifact.version} for ${artifact.artifact_id}.`,
      );
    }
  }

  const pathname = resolveArtifactStorePath(ref, params.env);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing artifact record: ${pathname}`);
  }

  saveJsonFile(pathname, assertArtifactRecord({ artifact, ref }));
  return { path: pathname, ref };
}

export function ensureArtifactRecord(params: {
  artifact: Artifact;
  rightsState: ArtifactRightsState;
  env?: NodeJS.ProcessEnv;
}): { path: string; ref: ArtifactRef } {
  const artifact = normalizeArtifactForStorage({
    artifact: params.artifact,
    rightsState: params.rightsState,
  });
  const ref = buildArtifactRef(artifact, params.rightsState);
  const existing = getArtifactRecord(ref, params.env);
  if (existing) {
    if (JSON.stringify(existing.artifact) !== JSON.stringify(artifact)) {
      throw new Error(
        `Artifact ${ref.artifact_id}@${ref.version} is already stored with different content.`,
      );
    }
    return {
      path: resolveArtifactStorePath(ref, params.env),
      ref,
    };
  }
  return createArtifactRecord({
    artifact,
    rightsState: params.rightsState,
    env: params.env,
  });
}

export function getArtifactRecord(
  ref: ArtifactRef,
  env: NodeJS.ProcessEnv = process.env,
): StoredArtifactRecord | null {
  const validatedRef = assertArtifactValid(
    ArtifactRefSchema,
    "niche-store-artifact-ref",
    ref,
    "artifact ref",
  );
  return readStoredArtifact(resolveArtifactStorePath(validatedRef, env));
}

export function listArtifactRecords(
  params: {
    artifactId?: string;
    artifactType?: Artifact["artifact_type"];
    env?: NodeJS.ProcessEnv;
  } = {},
): StoredArtifactRecord[] {
  const root = params.artifactType
    ? resolveArtifactStoreRoot(params.artifactType, params.env)
    : resolveArtifactsStoreRoot(params.env);
  const records = walkArtifactFiles(root)
    .map((pathname) => readStoredArtifact(pathname))
    .filter((record): record is StoredArtifactRecord => record !== null);

  return records.filter((record) => {
    if (params.artifactType && record.ref.artifact_type !== params.artifactType) {
      return false;
    }
    if (params.artifactId && record.ref.artifact_id !== params.artifactId) {
      return false;
    }
    return true;
  });
}

export function getArtifactRecordsByIds(
  artifactIds: string[],
  env: NodeJS.ProcessEnv = process.env,
): StoredArtifactRecord[] {
  const requestedIds = new Set(artifactIds);
  return listArtifactRecords({ env }).filter((record) => requestedIds.has(record.ref.artifact_id));
}
