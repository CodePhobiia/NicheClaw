import fs from "node:fs";
import { saveJsonFile } from "../../infra/json-file.js";
import type { ArtifactTeacherRolloutAuthority } from "../schema/index.js";
import {
  computeArtifactContentHash,
  computeTeacherRolloutAuthority,
  listArtifactRecords,
  requiresTeacherRolloutAuthority,
} from "./artifact-registry.js";
import { resolveArtifactStorePath } from "./paths.js";

export type TeacherRolloutAuthorityBackfillResult = {
  scanned: number;
  updated: number;
  blocked_missing_governed_status: string[];
};

function authoritiesEqual(
  left: ArtifactTeacherRolloutAuthority | undefined,
  right: ArtifactTeacherRolloutAuthority,
): boolean {
  return (
    left?.embargo_status === right.embargo_status && left?.blocked_reason === right.blocked_reason
  );
}

export function backfillTeacherRolloutAuthority(
  env: NodeJS.ProcessEnv = process.env,
): TeacherRolloutAuthorityBackfillResult {
  let scanned = 0;
  let updated = 0;
  const blockedMissingGovernedStatus: string[] = [];

  for (const record of listArtifactRecords({ env })) {
    if (!requiresTeacherRolloutAuthority(record.ref.artifact_type)) {
      continue;
    }
    scanned += 1;
    if (!record.artifact.governed_data_status) {
      blockedMissingGovernedStatus.push(record.ref.artifact_id);
      continue;
    }
    const authority = computeTeacherRolloutAuthority({
      artifactType: record.ref.artifact_type,
      governedDataStatus: record.artifact.governed_data_status,
      rightsState: record.ref.rights_state,
    });
    if (authoritiesEqual(record.artifact.teacher_rollout_authority, authority)) {
      continue;
    }
    const nextRecord = {
      artifact: {
        ...record.artifact,
        teacher_rollout_authority: authority,
      },
      ref: {
        ...record.ref,
        content_hash: computeArtifactContentHash({
          ...record.artifact,
          teacher_rollout_authority: authority,
        }),
      },
    };
    const currentPath = resolveArtifactStorePath(record.ref, env);
    const nextPath = resolveArtifactStorePath(nextRecord.ref, env);
    saveJsonFile(nextPath, nextRecord);
    if (nextPath !== currentPath) {
      fs.unlinkSync(currentPath);
    }
    updated += 1;
  }

  return {
    scanned,
    updated,
    blocked_missing_governed_status: blockedMissingGovernedStatus.toSorted((left, right) =>
      left.localeCompare(right),
    ),
  };
}
