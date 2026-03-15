import fs from "node:fs";
import path from "node:path";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { readJsonFileStrict } from "../json.js";
import { IdentifierString, LineageRefSchema, type LineageRef } from "../schema/index.js";
import { resolveLineageStorePath, resolveNicheStoreRoots } from "./paths.js";

export const StoredLineageEdgeSchema = Type.Object(
  {
    child_artifact_id: IdentifierString,
    parent_artifact_id: IdentifierString,
    relationship: LineageRefSchema.properties.relationship,
    derivation_step: LineageRefSchema.properties.derivation_step,
    notes: LineageRefSchema.properties.notes,
  },
  { additionalProperties: false },
);

export type StoredLineageEdge = Static<typeof StoredLineageEdgeSchema>;

const LINEAGE_EDGE_CACHE_KEY = "niche-store-lineage-edge";

function assertLineageEdge(edge: StoredLineageEdge): StoredLineageEdge {
  const result = validateJsonSchemaValue({
    schema: StoredLineageEdgeSchema,
    cacheKey: LINEAGE_EDGE_CACHE_KEY,
    value: edge,
  });
  if (result.ok) {
    return edge;
  }
  const details = result.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid lineage edge: ${details}`);
}

function resolveLineageRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolveNicheStoreRoots(env).lineage;
}

export function writeLineageEdges(
  childArtifactId: string,
  edges: LineageRef[],
  env: NodeJS.ProcessEnv = process.env,
): string {
  const storedEdges = edges.map((edge) =>
    assertLineageEdge({
      child_artifact_id: childArtifactId,
      parent_artifact_id: edge.parent_artifact_id,
      relationship: edge.relationship,
      derivation_step: edge.derivation_step,
      notes: edge.notes,
    }),
  );
  const pathname = resolveLineageStorePath(childArtifactId, env);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing lineage edges: ${pathname}`);
  }
  saveJsonFile(pathname, storedEdges);
  return pathname;
}

export function getParentsForArtifact(
  childArtifactId: string,
  env: NodeJS.ProcessEnv = process.env,
): LineageRef[] {
  const raw = readJsonFileStrict(
    resolveLineageStorePath(childArtifactId, env),
    `lineage record ${childArtifactId}`,
  );
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid lineage store payload for child artifact ${childArtifactId}.`);
  }
  return raw.map((entry) => {
    const edge = assertLineageEdge(entry as StoredLineageEdge);
    return {
      parent_artifact_id: edge.parent_artifact_id,
      relationship: edge.relationship,
      derivation_step: edge.derivation_step,
      notes: edge.notes,
    };
  });
}

export function listLineageEdges(env: NodeJS.ProcessEnv = process.env): StoredLineageEdge[] {
  const root = resolveLineageRoot(env);
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(root, entry.name))
    .toSorted((left, right) => left.localeCompare(right))
    .flatMap((pathname) => {
      const raw = readJsonFileStrict(pathname, `lineage record ${pathname}`);
      if (raw === undefined) {
        return [];
      }
      if (!Array.isArray(raw)) {
        throw new Error(`Invalid lineage store payload at ${pathname}.`);
      }
      return raw.map((entry) => assertLineageEdge(entry as StoredLineageEdge));
    });
}

export function getChildrenForArtifact(
  parentArtifactId: string,
  env: NodeJS.ProcessEnv = process.env,
): StoredLineageEdge[] {
  return listLineageEdges(env).filter((edge) => edge.parent_artifact_id === parentArtifactId);
}

export function collectDescendantArtifactIds(
  rootArtifactIds: string[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const visited = new Set<string>();
  const queue = [...new Set(rootArtifactIds)];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);

    for (const child of getChildrenForArtifact(current, env)) {
      if (!visited.has(child.child_artifact_id)) {
        queue.push(child.child_artifact_id);
      }
    }
  }

  return [...visited].toSorted((left, right) => left.localeCompare(right));
}
