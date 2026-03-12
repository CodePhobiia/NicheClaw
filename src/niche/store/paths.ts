import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import { NICHE_STATE_DIRNAMES, NICHE_STATE_ROOT_DIRNAME } from "../constants.js";
import type { ArtifactRef, ArtifactType } from "../schema/index.js";

const MANIFEST_DIRNAMES = {
  baseline: "baseline",
  candidate: "candidate",
  sourceAccess: "source-access",
} as const;

export type ManifestStoreKind = keyof typeof MANIFEST_DIRNAMES;

export type NicheStoreRoots = {
  root: string;
  artifacts: string;
  benchmarkRuns: string;
  benchmarkSuites: string;
  domainPacks: string;
  graders: string;
  jobs: string;
  lineage: string;
  manifests: string;
  monitors: string;
  programs: string;
  releases: string;
  replayBundles: string;
  traces: string;
};

export function resolveNicheStateRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), NICHE_STATE_ROOT_DIRNAME);
}

export function resolveNicheStoreRoots(env: NodeJS.ProcessEnv = process.env): NicheStoreRoots {
  const root = resolveNicheStateRoot(env);
  return {
    root,
    artifacts: path.join(root, NICHE_STATE_DIRNAMES.artifacts),
    benchmarkRuns: path.join(root, NICHE_STATE_DIRNAMES.benchmarkRuns),
    benchmarkSuites: path.join(root, NICHE_STATE_DIRNAMES.benchmarkSuites),
    domainPacks: path.join(root, NICHE_STATE_DIRNAMES.domainPacks),
    graders: path.join(root, NICHE_STATE_DIRNAMES.graders),
    jobs: path.join(root, NICHE_STATE_DIRNAMES.jobs),
    lineage: path.join(root, NICHE_STATE_DIRNAMES.lineage),
    manifests: path.join(root, NICHE_STATE_DIRNAMES.manifests),
    monitors: path.join(root, NICHE_STATE_DIRNAMES.monitors),
    programs: path.join(root, NICHE_STATE_DIRNAMES.programs),
    releases: path.join(root, NICHE_STATE_DIRNAMES.releases),
    replayBundles: path.join(root, NICHE_STATE_DIRNAMES.replayBundles),
    traces: path.join(root, NICHE_STATE_DIRNAMES.traces),
  };
}

export function resolveManifestStoreRoot(
  kind: ManifestStoreKind,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveNicheStoreRoots(env).manifests, MANIFEST_DIRNAMES[kind]);
}

export function resolveManifestStorePath(
  kind: ManifestStoreKind,
  manifestId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveManifestStoreRoot(kind, env), `${manifestId}.json`);
}

export function resolveArtifactStoreRoot(
  artifactType: ArtifactType,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveNicheStoreRoots(env).artifacts, artifactType);
}

export function resolveArtifactsStoreRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolveNicheStoreRoots(env).artifacts;
}

export function resolveArtifactVersionDirectory(
  artifactType: ArtifactType,
  artifactId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveArtifactStoreRoot(artifactType, env), artifactId);
}

export function resolveArtifactStorePath(
  artifactRef: Pick<ArtifactRef, "artifact_id" | "artifact_type" | "version" | "content_hash">,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(
    resolveArtifactVersionDirectory(artifactRef.artifact_type, artifactRef.artifact_id, env),
    `${artifactRef.version}--${artifactRef.content_hash}.json`,
  );
}

export function resolveLineageStorePath(
  artifactId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveNicheStoreRoots(env).lineage, `${artifactId}.json`);
}
