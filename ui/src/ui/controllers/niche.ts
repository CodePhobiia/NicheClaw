import type { GatewayBrowserClient } from "../gateway.ts";
import type { NicheBenchmarkEntry } from "../views/niche/NicheBenchmarks.ts";
import type { NicheProgramEntry } from "../views/niche/NichePrograms.ts";
import type { NicheRuntimeState } from "../views/niche/NicheRuntime.ts";

export type NicheState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  nicheProgramsLoading: boolean;
  nicheProgramsError: string | null;
  nichePrograms: NicheProgramEntry[];
  nicheBenchmarksLoading: boolean;
  nicheBenchmarksError: string | null;
  nicheBenchmarks: NicheBenchmarkEntry[];
  nicheRuntimeLoading: boolean;
  nicheRuntimeError: string | null;
  nicheRuntimeState: NicheRuntimeState | null;
};

export async function loadNichePrograms(state: NicheState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.nicheProgramsLoading) {
    return;
  }
  state.nicheProgramsLoading = true;
  state.nicheProgramsError = null;
  try {
    const res = await state.client.request<{ programs?: NicheProgramEntry[] }>(
      "niche.programs.list",
      {},
    );
    state.nichePrograms = Array.isArray(res.programs) ? res.programs : [];
  } catch (err) {
    state.nicheProgramsError = `Failed to load programs: ${String(err)}`;
  } finally {
    state.nicheProgramsLoading = false;
  }
}

export async function loadNicheBenchmarks(state: NicheState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.nicheBenchmarksLoading) {
    return;
  }
  state.nicheBenchmarksLoading = true;
  state.nicheBenchmarksError = null;
  try {
    const res = await state.client.request<{ benchmarks?: NicheBenchmarkEntry[] }>(
      "niche.benchmarks.list",
      {},
    );
    state.nicheBenchmarks = Array.isArray(res.benchmarks) ? res.benchmarks : [];
  } catch (err) {
    state.nicheBenchmarksError = `Failed to load benchmarks: ${String(err)}`;
  } finally {
    state.nicheBenchmarksLoading = false;
  }
}

export async function loadNicheRuntime(state: NicheState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.nicheRuntimeLoading) {
    return;
  }
  state.nicheRuntimeLoading = true;
  state.nicheRuntimeError = null;
  try {
    const res = await state.client.request<NicheRuntimeState>("niche.runtime.state", {});
    state.nicheRuntimeState = {
      stacks: Array.isArray(res.stacks) ? res.stacks : [],
      agentDefaults: Array.isArray(res.agentDefaults) ? res.agentDefaults : [],
      routeOverlays: Array.isArray(res.routeOverlays) ? res.routeOverlays : [],
    };
  } catch (err) {
    state.nicheRuntimeError = `Failed to load runtime state: ${String(err)}`;
  } finally {
    state.nicheRuntimeLoading = false;
  }
}
