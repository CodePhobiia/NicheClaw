import { html, nothing } from "lit";

export type NicheRuntimeStack = {
  id: string;
  program: string;
  manifest: string;
  mode: string;
};

export type NicheRuntimeAgentDefault = {
  agent: string;
  stack: string;
  updated: string;
};

export type NicheRuntimeRouteOverlay = {
  id: string;
  agent: string;
  channel: string;
  stack: string;
};

export type NicheRuntimeState = {
  stacks: NicheRuntimeStack[];
  agentDefaults: NicheRuntimeAgentDefault[];
  routeOverlays: NicheRuntimeRouteOverlay[];
};

export type NicheRuntimeProps = {
  loading: boolean;
  error: string | null;
  state: NicheRuntimeState | null;
  onRefresh: () => void;
};

function formatTimestamp(iso: string): string {
  if (!iso) {
    return "n/a";
  }
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function renderNicheRuntime(props: NicheRuntimeProps) {
  const stacks = props.state?.stacks ?? [];
  const agentDefaults = props.state?.agentDefaults ?? [];
  const routeOverlays = props.state?.routeOverlays ?? [];

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Active Stacks</div>
          <div class="card-sub">Currently loaded niche runtime stacks.</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading\u2026" : "Refresh"}
        </button>
      </div>
      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }
      ${
        stacks.length === 0 && !props.loading
          ? html`
              <div class="muted" style="margin-top: 16px">No active stacks.</div>
            `
          : nothing
      }
      ${
        stacks.length > 0
          ? html`
            <div style="margin-top: 16px; overflow-x: auto;">
              <table class="data-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">ID</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Program</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Manifest</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Mode</th>
                  </tr>
                </thead>
                <tbody>
                  ${stacks.map(
                    (stack) => html`
                      <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">
                          <span class="mono">${stack.id}</span>
                        </td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">${stack.program}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">
                          <span class="mono">${stack.manifest}</span>
                        </td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">
                          <span class="chip">${stack.mode}</span>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
          : nothing
      }
    </section>

    <section class="card" style="margin-top: 18px;">
      <div>
        <div class="card-title">Agent Defaults</div>
        <div class="card-sub">Default stack assignment per agent.</div>
      </div>
      ${
        agentDefaults.length === 0 && !props.loading
          ? html`
              <div class="muted" style="margin-top: 16px">No agent defaults configured.</div>
            `
          : nothing
      }
      ${
        agentDefaults.length > 0
          ? html`
            <div style="margin-top: 16px; overflow-x: auto;">
              <table class="data-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Agent</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Stack</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  ${agentDefaults.map(
                    (entry) => html`
                      <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">${entry.agent}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">
                          <span class="mono">${entry.stack}</span>
                        </td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">${formatTimestamp(entry.updated)}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
          : nothing
      }
    </section>

    <section class="card" style="margin-top: 18px;">
      <div>
        <div class="card-title">Route Overlays</div>
        <div class="card-sub">Channel-specific stack overrides per agent.</div>
      </div>
      ${
        routeOverlays.length === 0 && !props.loading
          ? html`
              <div class="muted" style="margin-top: 16px">No route overlays configured.</div>
            `
          : nothing
      }
      ${
        routeOverlays.length > 0
          ? html`
            <div style="margin-top: 16px; overflow-x: auto;">
              <table class="data-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">ID</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Agent</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Channel</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Stack</th>
                  </tr>
                </thead>
                <tbody>
                  ${routeOverlays.map(
                    (overlay) => html`
                      <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">
                          <span class="mono">${overlay.id}</span>
                        </td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">${overlay.agent}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">${overlay.channel}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">
                          <span class="mono">${overlay.stack}</span>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
          : nothing
      }
    </section>
  `;
}
