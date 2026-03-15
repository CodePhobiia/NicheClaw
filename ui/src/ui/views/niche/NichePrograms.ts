import { html, nothing } from "lit";

export type NicheProgramEntry = {
  id: string;
  name: string;
  riskClass: string;
};

export type NicheProgramsProps = {
  loading: boolean;
  error: string | null;
  programs: NicheProgramEntry[];
  onRefresh: () => void;
};

export function renderNichePrograms(props: NicheProgramsProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Niche Programs</div>
          <div class="card-sub">Compiled niche programs and their risk classes.</div>
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
        props.programs.length === 0 && !props.loading
          ? html`
              <div class="muted" style="margin-top: 16px">No programs found.</div>
            `
          : nothing
      }
      ${
        props.programs.length > 0
          ? html`
            <div style="margin-top: 16px; overflow-x: auto;">
              <table class="data-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Name</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Risk Class</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Program ID</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.programs.map(
                    (program) => html`
                      <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">${program.name}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">
                          <span class="chip">${program.riskClass}</span>
                        </td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">
                          <span class="mono">${program.id}</span>
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
