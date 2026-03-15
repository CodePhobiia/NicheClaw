import { html, nothing } from "lit";

export type NicheBenchmarkEntry = {
  recordId: string;
  suite: string;
  caseKind: string;
  meanDelta: number | null;
  caseCount: number;
  createdAt: string;
};

export type NicheBenchmarksProps = {
  loading: boolean;
  error: string | null;
  benchmarks: NicheBenchmarkEntry[];
  onRefresh: () => void;
};

function formatDelta(value: number | null): string {
  if (value == null) {
    return "n/a";
  }
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}`;
}

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

export function renderNicheBenchmarks(props: NicheBenchmarksProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Niche Benchmarks</div>
          <div class="card-sub">Benchmark records, suites, and accuracy deltas.</div>
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
        props.benchmarks.length === 0 && !props.loading
          ? html`
              <div class="muted" style="margin-top: 16px">No benchmark records found.</div>
            `
          : nothing
      }
      ${
        props.benchmarks.length > 0
          ? html`
            <div style="margin-top: 16px; overflow-x: auto;">
              <table class="data-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Record ID</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Suite</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Case Kind</th>
                    <th style="text-align: right; padding: 8px 12px; border-bottom: 1px solid var(--border);">Mean Delta</th>
                    <th style="text-align: right; padding: 8px 12px; border-bottom: 1px solid var(--border);">Case Count</th>
                    <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border);">Created At</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.benchmarks.map(
                    (entry) => html`
                      <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">
                          <span class="mono">${entry.recordId}</span>
                        </td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">${entry.suite}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">
                          <span class="chip">${entry.caseKind}</span>
                        </td>
                        <td style="text-align: right; padding: 8px 12px; border-bottom: 1px solid var(--border);">
                          <span class="mono">${formatDelta(entry.meanDelta)}</span>
                        </td>
                        <td style="text-align: right; padding: 8px 12px; border-bottom: 1px solid var(--border);">${entry.caseCount}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid var(--border);">${formatTimestamp(entry.createdAt)}</td>
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
