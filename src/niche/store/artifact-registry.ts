import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadJsonFile, saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import {
  ArtifactRefSchema,
  ArtifactSchema,
  type Artifact,
  type ArtifactRef,
  type ArtifactRightsState,
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

function assertArtifactValid<T>(schema: Record<string, unknown>, cacheKey: string, value: T, label: string): T {
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
  hash.update(stableSerialize(assertArtifactValid(ArtifactSchema, "niche-store-artifact", artifact, "artifact")));
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
  const raw = loadJsonFile(pathname);
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
  const artifact = assertArtifactValid(
    ArtifactSchema,
    "niche-store-artifact",
    params.artifact,
    "artifact",
  );
  const ref = buildArtifactRef(artifact, params.rightsState);

  const versionDir = resolveArtifactVersionDirectory(artifact.artifact_type, artifact.artifact_id, params.env);
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

export function listArtifactRecords(params: {
  artifactId?: string;
  artifactType?: Artifact["artifact_type"];
  env?: NodeJS.ProcessEnv;
} = {}): StoredArtifactRecord[] {
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
