import fs from "node:fs";
import path from "node:path";
import { saveJsonFile } from "../../infra/json-file.js";
import { withSyncFileLock } from "../../infra/sync-file-lock.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { readJsonFileStrict } from "../json.js";
import {
  ActiveNicheAgentDefaultBindingSchema,
  ActiveNicheRuntimeStateSchema,
  ActiveNicheStackRecordSchema,
  ActiveNicheRouteOverlaySchema,
  type ActiveNicheAgentDefaultBinding,
  type ActiveNicheRuntimeState,
  type ActiveNicheRouteOverlay,
  type ActiveNicheStackRecord,
} from "../schema/index.js";
import { resolveActiveNicheRuntimeStatePath } from "./paths.js";

const ACTIVE_NICHE_RUNTIME_STATE_CACHE_KEY = "niche-active-runtime-state";

function withStateLock<T>(env: NodeJS.ProcessEnv | undefined, fn: () => T): T {
  const statePath = resolveActiveNicheRuntimeStatePath(env);
  const lockPath = `${statePath}.lock`;
  const dir = path.dirname(lockPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return withSyncFileLock(lockPath, fn, {
    maxRetries: 10,
    retryDelayMs: 50,
    staleLockMaxAgeMs: 30_000,
  });
}

const EMPTY_ACTIVE_NICHE_RUNTIME_STATE: ActiveNicheRuntimeState = {
  stacks: [],
  agent_defaults: [],
  route_overlays: [],
};

function assertSchemaValue<T>(
  schema: Record<string, unknown>,
  cacheKey: string,
  value: T,
  label: string,
): T {
  const validation = validateJsonSchemaValue({
    schema,
    cacheKey,
    value,
  });
  if (!validation.ok) {
    const details = validation.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid ${label}: ${details}`);
  }
  return value;
}

function assertActiveNicheRuntimeState(value: ActiveNicheRuntimeState): ActiveNicheRuntimeState {
  return assertSchemaValue(
    ActiveNicheRuntimeStateSchema,
    ACTIVE_NICHE_RUNTIME_STATE_CACHE_KEY,
    value,
    "active Niche runtime state",
  );
}

function readActiveNicheRuntimeState(
  env: NodeJS.ProcessEnv = process.env,
): ActiveNicheRuntimeState {
  const pathname = resolveActiveNicheRuntimeStatePath(env);
  if (!fs.existsSync(pathname)) {
    return structuredClone(EMPTY_ACTIVE_NICHE_RUNTIME_STATE);
  }
  const raw = readJsonFileStrict(pathname, "active Niche runtime state");
  if (raw === undefined) {
    return structuredClone(EMPTY_ACTIVE_NICHE_RUNTIME_STATE);
  }
  return assertActiveNicheRuntimeState(raw as ActiveNicheRuntimeState);
}

function writeActiveNicheRuntimeState(
  state: ActiveNicheRuntimeState,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const normalized = assertActiveNicheRuntimeState({
    stacks: [...state.stacks].toSorted((left, right) =>
      left.active_stack_id.localeCompare(right.active_stack_id),
    ),
    agent_defaults: [...state.agent_defaults].toSorted((left, right) =>
      left.agent_id.localeCompare(right.agent_id),
    ),
    route_overlays: [...state.route_overlays].toSorted((left, right) =>
      left.overlay_id.localeCompare(right.overlay_id),
    ),
  });
  const pathname = resolveActiveNicheRuntimeStatePath(env);
  saveJsonFile(pathname, normalized);
  return pathname;
}

function assertCandidateRunSeedTemplate(record: ActiveNicheStackRecord): void {
  if (record.run_seed_template.manifest_kind !== "candidate") {
    throw new Error(
      `Active Niche stack ${record.active_stack_id} must compile from a candidate manifest template.`,
    );
  }
  if (record.run_seed_template.baseline_or_candidate_manifest_id !== record.candidate_manifest_id) {
    throw new Error(
      `Active Niche stack ${record.active_stack_id} candidate_manifest_id must match the run seed template manifest id.`,
    );
  }
}

export function getActiveNicheRuntimeState(
  env: NodeJS.ProcessEnv = process.env,
): ActiveNicheRuntimeState {
  return readActiveNicheRuntimeState(env);
}

export function getActiveNicheStackRecord(
  activeStackId: string,
  env: NodeJS.ProcessEnv = process.env,
): ActiveNicheStackRecord | null {
  return (
    readActiveNicheRuntimeState(env).stacks.find(
      (record) => record.active_stack_id === activeStackId,
    ) ?? null
  );
}

export function getActiveNicheStackRecordForCandidateManifest(
  candidateManifestId: string,
  env: NodeJS.ProcessEnv = process.env,
): ActiveNicheStackRecord | null {
  return (
    readActiveNicheRuntimeState(env).stacks.find(
      (record) => record.candidate_manifest_id === candidateManifestId,
    ) ?? null
  );
}

export function upsertActiveNicheStackRecord(
  record: ActiveNicheStackRecord,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertSchemaValue(
    ActiveNicheStackRecordSchema,
    "niche-active-stack-record",
    record,
    `active Niche stack ${record.active_stack_id}`,
  );
  assertCandidateRunSeedTemplate(validated);
  return withStateLock(env, () => {
    const state = readActiveNicheRuntimeState(env);
    const nextStacks = state.stacks.filter(
      (existing) => existing.active_stack_id !== validated.active_stack_id,
    );
    nextStacks.push(validated);
    return writeActiveNicheRuntimeState(
      {
        ...state,
        stacks: nextStacks,
      },
      env,
    );
  });
}

export function setActiveNicheAgentDefault(
  binding: ActiveNicheAgentDefaultBinding,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertSchemaValue(
    ActiveNicheAgentDefaultBindingSchema,
    "niche-active-agent-default",
    binding,
    `active Niche agent default for ${binding.agent_id}`,
  );
  return withStateLock(env, () => {
    const state = readActiveNicheRuntimeState(env);
    const nextBindings = state.agent_defaults.filter(
      (existing) => existing.agent_id !== validated.agent_id,
    );
    nextBindings.push(validated);
    return writeActiveNicheRuntimeState(
      {
        ...state,
        agent_defaults: nextBindings,
      },
      env,
    );
  });
}

export function removeActiveNicheAgentDefault(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return withStateLock(env, () => {
    const state = readActiveNicheRuntimeState(env);
    const nextBindings = state.agent_defaults.filter((existing) => existing.agent_id !== agentId);
    if (nextBindings.length === state.agent_defaults.length) {
      return false;
    }
    writeActiveNicheRuntimeState(
      {
        ...state,
        agent_defaults: nextBindings,
      },
      env,
    );
    return true;
  });
}

export function clearRouteOverlaysForStack(
  activeStackId: string,
  env: NodeJS.ProcessEnv = process.env,
): number {
  return withStateLock(env, () => {
    const state = readActiveNicheRuntimeState(env);
    const nextOverlays = state.route_overlays.filter(
      (existing) => existing.active_stack_id !== activeStackId,
    );
    const cleared = state.route_overlays.length - nextOverlays.length;
    if (cleared > 0) {
      writeActiveNicheRuntimeState(
        {
          ...state,
          route_overlays: nextOverlays,
        },
        env,
      );
    }
    return cleared;
  });
}

export function setActiveNicheRouteOverlay(
  overlay: ActiveNicheRouteOverlay,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertSchemaValue(
    ActiveNicheRouteOverlaySchema,
    "niche-active-route-overlay",
    overlay,
    `active Niche route overlay ${overlay.overlay_id}`,
  );
  if (!validated.channel && !validated.account_id && !validated.to) {
    throw new Error(
      `Active Niche route overlay ${validated.overlay_id} must constrain at least one of channel, account_id, or to.`,
    );
  }
  return withStateLock(env, () => {
    const state = readActiveNicheRuntimeState(env);
    const nextOverlays = state.route_overlays.filter(
      (existing) => existing.overlay_id !== validated.overlay_id,
    );
    nextOverlays.push(validated);
    return writeActiveNicheRuntimeState(
      {
        ...state,
        route_overlays: nextOverlays,
      },
      env,
    );
  });
}
