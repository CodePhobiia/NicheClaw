import type { SessionEntry } from "../../config/sessions.js";
import { computeStableContentHash } from "../benchmark/index.js";
import {
  type ActiveNicheRouteOverlay,
  type ActiveNicheStackRecord,
  type NicheStackResolutionSource,
  type PreparedNicheRunSeed,
} from "../schema/index.js";
import { getActiveNicheRuntimeState } from "../store/active-stack-store.js";
import { assertPreparedNicheRunSeed } from "./prepare-run-seed.js";

type ActiveNicheRouteContext = {
  messageChannel?: string;
  accountId?: string;
  to?: string;
};

export type ResolvedActiveNicheStack = {
  record: ActiveNicheStackRecord;
  source: NicheStackResolutionSource;
  runSeed: PreparedNicheRunSeed;
  /** True when the stack is in shadow mode — the candidate runs but output is not delivered. */
  shadow_mode: boolean;
  /** True when this request was canary-routed to the candidate. */
  canary_routed: boolean;
};

function normalizeOptionalString(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildPreparedSeedId(params: { runId: string; activeStackId: string }): string {
  return `active-seed-${computeStableContentHash(params).slice(0, 20)}`;
}

function buildPreparedSeedRandomSeed(params: { runId: string; activeStackId: string }): string {
  return computeStableContentHash(params).slice(0, 16);
}

function materializePreparedSeedForRuntime(params: {
  record: ActiveNicheStackRecord;
  source: NicheStackResolutionSource;
  runId: string;
}): PreparedNicheRunSeed {
  const preparedAt = new Date().toISOString();
  const template = structuredClone(params.record.run_seed_template);
  const liveMode = params.record.release_mode === "shadow" ? "shadow" : "live";

  const materialized = assertPreparedNicheRunSeed({
    ...template,
    seed_id: buildPreparedSeedId({
      runId: params.runId,
      activeStackId: params.record.active_stack_id,
    }),
    prepared_at: preparedAt,
    mode: liveMode,
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: params.record.candidate_manifest_id,
    niche_program_id: params.record.niche_program_id,
    random_seed: buildPreparedSeedRandomSeed({
      runId: params.runId,
      activeStackId: params.record.active_stack_id,
    }),
    active_stack_id: params.record.active_stack_id,
    resolution_source: params.source,
    resolved_release_mode: params.record.release_mode,
    benchmark_suite_id:
      params.record.release_mode === "shadow" ? template.benchmark_suite_id : undefined,
    benchmark_arm_id:
      params.record.release_mode === "shadow" ? template.benchmark_arm_id : undefined,
    benchmark_case_ref:
      params.record.release_mode === "shadow" ? template.benchmark_case_ref : undefined,
    suite_hash: params.record.release_mode === "shadow" ? template.suite_hash : undefined,
    fixture_version: params.record.release_mode === "shadow" ? template.fixture_version : undefined,
    environment_snapshot:
      params.record.release_mode === "shadow" ? template.environment_snapshot : undefined,
  });

  if (materialized.manifest_kind !== "candidate") {
    throw new Error(
      `Active Niche stack ${params.record.active_stack_id} must materialize a candidate manifest seed.`,
    );
  }
  return materialized;
}

/**
 * Deterministic canary routing: uses a hash of runId + activeStackId
 * to decide whether this request falls within the canary fraction.
 * Returns true if the request should use the candidate stack.
 */
function shouldRouteToCanary(params: {
  runId: string;
  activeStackId: string;
  canaryFraction: number;
}): boolean {
  if (params.canaryFraction <= 0) return false;
  if (params.canaryFraction >= 1) return true;
  const hash = computeStableContentHash({
    runId: params.runId,
    activeStackId: params.activeStackId,
    purpose: "canary-routing",
  });
  // Use first 8 hex chars as a uniform [0, 1) fraction.
  const bucket = parseInt(hash.slice(0, 8), 16) / 0x100000000;
  return bucket < params.canaryFraction;
}

function overlayMatchesRoute(
  overlay: ActiveNicheRouteOverlay,
  route: ActiveNicheRouteContext,
): boolean {
  const channel = normalizeOptionalString(route.messageChannel);
  const accountId = normalizeOptionalString(route.accountId);
  const to = normalizeOptionalString(route.to);

  if (overlay.channel && overlay.channel !== channel) {
    return false;
  }
  if (overlay.account_id && overlay.account_id !== accountId) {
    return false;
  }
  if (overlay.to && overlay.to !== to) {
    return false;
  }
  return true;
}

function overlaySpecificity(overlay: ActiveNicheRouteOverlay): number {
  return [overlay.channel, overlay.account_id, overlay.to].filter(Boolean).length;
}

function pickRouteOverlay(params: {
  overlays: ActiveNicheRouteOverlay[];
  agentId: string;
  route: ActiveNicheRouteContext;
}): ActiveNicheRouteOverlay | null {
  const matching = params.overlays.filter(
    (overlay) => overlay.agent_id === params.agentId && overlayMatchesRoute(overlay, params.route),
  );
  if (matching.length === 0) {
    return null;
  }
  return (
    matching.toSorted((left, right) => {
      const specificityDelta = overlaySpecificity(right) - overlaySpecificity(left);
      if (specificityDelta !== 0) {
        return specificityDelta;
      }
      const updatedAtDelta = Date.parse(right.updated_at) - Date.parse(left.updated_at);
      if (updatedAtDelta !== 0) {
        return updatedAtDelta;
      }
      return left.overlay_id.localeCompare(right.overlay_id);
    })[0] ?? null
  );
}

function resolveRequestedStack(params: {
  sessionEntry?: SessionEntry;
  agentId?: string;
  route: ActiveNicheRouteContext;
  env?: NodeJS.ProcessEnv;
}): { record: ActiveNicheStackRecord; source: NicheStackResolutionSource } | null {
  const state = getActiveNicheRuntimeState(params.env);
  const findRecord = (activeStackId: string) => {
    const record = state.stacks.find((r) => r.active_stack_id === activeStackId) ?? null;
    if (record?.release_mode === "rolled_back") {
      return null;
    }
    return record;
  };

  const sessionOverrideId = normalizeOptionalString(
    params.sessionEntry?.niche?.sessionOverrideStackId,
  );
  if (sessionOverrideId) {
    const record = findRecord(sessionOverrideId);
    if (record) {
      return {
        record,
        source: "session_override",
      };
    }
  }

  const agentId = normalizeOptionalString(params.agentId);
  if (!agentId) {
    return null;
  }

  const overlay = pickRouteOverlay({
    overlays: state.route_overlays,
    agentId,
    route: params.route,
  });
  if (overlay) {
    const record = findRecord(overlay.active_stack_id);
    if (record) {
      return {
        record,
        source: "route_override",
      };
    }
  }

  const agentDefault = state.agent_defaults.find((binding) => binding.agent_id === agentId);
  if (!agentDefault) {
    return null;
  }
  const record = findRecord(agentDefault.active_stack_id);
  if (!record) {
    return null;
  }
  return {
    record,
    source: "agent_default",
  };
}

export function resolveActiveNicheStackForRun(params: {
  runId: string;
  sessionEntry?: SessionEntry;
  agentId?: string;
  messageChannel?: string;
  accountId?: string;
  to?: string;
  env?: NodeJS.ProcessEnv;
}): ResolvedActiveNicheStack | null {
  const resolved = resolveRequestedStack({
    sessionEntry: params.sessionEntry,
    agentId: params.agentId,
    route: {
      messageChannel: params.messageChannel,
      accountId: params.accountId,
      to: params.to,
    },
    env: params.env,
  });
  if (!resolved) {
    return null;
  }

  const releaseMode = resolved.record.release_mode;

  // Canary routing: only route a fraction of requests to the candidate.
  // When canary_fraction is explicitly set, use it. Otherwise, route all
  // canary requests (backward-compatible: canary without fraction = 100%).
  if (releaseMode === "canary" && resolved.record.canary_fraction !== undefined) {
    if (
      !shouldRouteToCanary({
        runId: params.runId,
        activeStackId: resolved.record.active_stack_id,
        canaryFraction: resolved.record.canary_fraction,
      })
    ) {
      // This request is not in the canary fraction — fall through to baseline.
      return null;
    }
  }

  return {
    ...resolved,
    runSeed: materializePreparedSeedForRuntime({
      record: resolved.record,
      source: resolved.source,
      runId: params.runId,
    }),
    shadow_mode: releaseMode === "shadow",
    canary_routed: releaseMode === "canary",
  };
}

export function safeResolveActiveNicheStackForRun(
  params: Parameters<typeof resolveActiveNicheStackForRun>[0],
): ResolvedActiveNicheStack | null {
  try {
    return resolveActiveNicheStackForRun(params);
  } catch {
    return null;
  }
}

export function buildResolvedNicheSessionPatch(params: {
  existing?: SessionEntry;
  runSeed?: PreparedNicheRunSeed;
}): Partial<SessionEntry> | null {
  const activeStackId = normalizeOptionalString(params.runSeed?.active_stack_id);
  const resolutionSource = params.runSeed?.resolution_source;
  if (!activeStackId || !resolutionSource) {
    return null;
  }
  return {
    niche: {
      ...(params.existing?.niche?.sessionOverrideStackId
        ? {
            sessionOverrideStackId: params.existing.niche.sessionOverrideStackId,
          }
        : {}),
      lastResolvedStackId: activeStackId,
      lastResolvedSource: resolutionSource,
      lastResolvedAt: Date.now(),
      lastResolvedCandidateManifestId: params.runSeed?.baseline_or_candidate_manifest_id,
      lastResolvedNicheProgramId: params.runSeed?.niche_program_id,
      lastResolvedReleaseMode: params.runSeed?.resolved_release_mode,
    },
  };
}
