import fs from "node:fs";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import {
  BaselineManifestSchema,
  CandidateManifestSchema,
  SourceAccessManifestSchema,
  type BaselineManifest,
  type CandidateManifest,
  type SourceAccessManifest,
} from "../schema/index.js";
import { readJsonFileStrict } from "../json.js";
import { resolveManifestStorePath, resolveManifestStoreRoot, type ManifestStoreKind } from "./paths.js";

type ManifestByKind = {
  baseline: BaselineManifest;
  candidate: CandidateManifest;
  sourceAccess: SourceAccessManifest;
};

const MANIFEST_KIND_CONFIG = {
  baseline: {
    cacheKey: "niche-store-baseline-manifest",
    idField: "baseline_manifest_id",
    schema: BaselineManifestSchema,
  },
  candidate: {
    cacheKey: "niche-store-candidate-manifest",
    idField: "candidate_manifest_id",
    schema: CandidateManifestSchema,
  },
  sourceAccess: {
    cacheKey: "niche-store-source-access-manifest",
    idField: "source_access_manifest_id",
    schema: SourceAccessManifestSchema,
  },
} as const;

function assertManifestValid<T>(kind: ManifestStoreKind, manifest: T): T {
  const config = MANIFEST_KIND_CONFIG[kind];
  const result = validateJsonSchemaValue({
    schema: config.schema,
    cacheKey: config.cacheKey,
    value: manifest,
  });
  if (!result.ok) {
    const details = result.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid ${kind} manifest: ${details}`);
  }
  return manifest;
}

function readManifest<T>(kind: ManifestStoreKind, manifestId: string, env?: NodeJS.ProcessEnv): T | null {
  const pathname = resolveManifestStorePath(kind, manifestId, env);
  const raw = readJsonFileStrict(pathname, `${kind} manifest ${manifestId}`);
  if (raw === undefined) {
    return null;
  }
  return assertManifestValid(kind, raw as T);
}

function listManifestDirectory<T>(kind: ManifestStoreKind, env?: NodeJS.ProcessEnv): T[] {
  const root = resolveManifestStoreRoot(kind, env);
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right))
    .map((name) => {
      const manifestId = name.replace(/\.json$/u, "");
      const manifest = readManifest<T>(kind, manifestId, env);
      if (!manifest) {
        throw new Error(`Manifest disappeared while listing ${kind}: ${manifestId}`);
      }
      return manifest;
    });
}

function writeManifest<T extends ManifestByKind[ManifestStoreKind]>(
  kind: ManifestStoreKind,
  manifest: T,
  env?: NodeJS.ProcessEnv,
): string {
  const validated = assertManifestValid(kind, manifest);
  const idField = MANIFEST_KIND_CONFIG[kind].idField as keyof T;
  const manifestId = validated[idField];
  if (typeof manifestId !== "string" || manifestId.length === 0) {
    throw new Error(`Manifest id field ${String(idField)} must be a non-empty string.`);
  }

  const pathname = resolveManifestStorePath(kind, manifestId, env);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing ${kind} manifest: ${pathname}`);
  }
  saveJsonFile(pathname, validated);
  return pathname;
}

export function writeBaselineManifest(
  manifest: BaselineManifest,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return writeManifest("baseline", manifest, env);
}

export function writeCandidateManifest(
  manifest: CandidateManifest,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return writeManifest("candidate", manifest, env);
}

export function writeSourceAccessManifest(
  manifest: SourceAccessManifest,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return writeManifest("sourceAccess", manifest, env);
}

export function getBaselineManifest(
  manifestId: string,
  env: NodeJS.ProcessEnv = process.env,
): BaselineManifest | null {
  return readManifest<BaselineManifest>("baseline", manifestId, env);
}

export function getCandidateManifest(
  manifestId: string,
  env: NodeJS.ProcessEnv = process.env,
): CandidateManifest | null {
  return readManifest<CandidateManifest>("candidate", manifestId, env);
}

export function getSourceAccessManifest(
  manifestId: string,
  env: NodeJS.ProcessEnv = process.env,
): SourceAccessManifest | null {
  return readManifest<SourceAccessManifest>("sourceAccess", manifestId, env);
}

export function listBaselineManifests(
  env: NodeJS.ProcessEnv = process.env,
): BaselineManifest[] {
  return listManifestDirectory<BaselineManifest>("baseline", env);
}

export function listCandidateManifests(
  env: NodeJS.ProcessEnv = process.env,
): CandidateManifest[] {
  return listManifestDirectory<CandidateManifest>("candidate", env);
}

export function listSourceAccessManifests(
  env: NodeJS.ProcessEnv = process.env,
): SourceAccessManifest[] {
  return listManifestDirectory<SourceAccessManifest>("sourceAccess", env);
}
