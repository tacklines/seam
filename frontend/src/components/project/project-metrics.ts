import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  fetchMetricsSummary,
  type MetricsSummary,
  type PerspectiveMetric,
  type ModelMetric,
} from "../../state/metrics-api.js";
import { t } from "../../lib/i18n.js";

import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/card/card.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

function successRateColor(rate: number): string {
  if (rate >= 90) return "var(--sl-color-success-500, #22c55e)";
  if (rate >= 70) return "var(--sl-color-warning-500, #f59e0b)";
  return "var(--sl-color-danger-500, #ef4444)";
}

@customElement("project-metrics")
export class ProjectMetrics extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .metrics-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
    }

    .metrics-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-primary, #e2e4ed);
      margin: 0;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3rem;
    }

    .error-state {
      padding: 1rem 0;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 2rem;
      color: var(--text-tertiary, #8b8fa3);
      font-size: 0.9rem;
    }

    /* ── Metrics grid ── */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    @media (max-width: 768px) {
      .metrics-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 1024px) {
      .metrics-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    /* ── Bottom tables ── */
    .tables-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    @media (max-width: 768px) {
      .tables-grid {
        grid-template-columns: 1fr;
      }
    }

    /* ── Card content ── */
    sl-card {
      --padding: 1.25rem;
    }

    .card-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-tertiary, #8b8fa3);
      margin-bottom: 0.5rem;
    }

    .big-number {
      font-size: 2.5rem;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 0.25rem;
    }

    .card-subtitle {
      font-size: 0.8rem;
      color: var(--text-secondary, #b0b3c5);
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 0.35rem 0;
      border-bottom: 1px solid var(--border-subtle, #2a2d3e);
      font-size: 0.85rem;
    }

    .stat-row:last-child {
      border-bottom: none;
    }

    .stat-label {
      color: var(--text-secondary, #b0b3c5);
    }

    .stat-value {
      font-weight: 500;
      color: var(--text-primary, #e2e4ed);
      font-family: var(--sl-font-mono);
    }

    /* ── Tables ── */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
    }

    .data-table th {
      text-align: left;
      padding: 0.4rem 0.5rem;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-tertiary, #8b8fa3);
      border-bottom: 1px solid var(--border-subtle, #2a2d3e);
    }

    .data-table td {
      padding: 0.45rem 0.5rem;
      border-bottom: 1px solid var(--border-subtle, #2a2d3e);
      color: var(--text-primary, #e2e4ed);
      font-family: var(--sl-font-mono);
    }

    .data-table tbody tr:last-child td {
      border-bottom: none;
    }

    .data-table td.label-cell {
      font-family: inherit;
      font-weight: 500;
    }

    .data-table td.success-high {
      color: var(--sl-color-success-400, #4ade80);
    }

    .data-table td.success-med {
      color: var(--sl-color-warning-400, #fbbf24);
    }

    .data-table td.success-low {
      color: var(--sl-color-danger-400, #f87171);
    }

    /* ── Workspace status ── */
    .status-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .pending-alert {
      color: var(--sl-color-warning-500, #f59e0b);
      font-size: 0.8rem;
      margin-top: 0.25rem;
    }
  `;

  @property({ attribute: "project-id" }) projectId = "";

  @state() private _summary: MetricsSummary | null = null;
  @state() private _loading = true;
  @state() private _error = "";
  @state() private _period = "24h";

  connectedCallback() {
    super.connectedCallback();
    if (this.projectId) {
      void this._load();
    }
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("projectId") && this.projectId) {
      void this._load();
    }
  }

  private async _load() {
    if (!this.projectId) return;
    this._loading = true;
    this._error = "";
    try {
      this._summary = await fetchMetricsSummary(this.projectId, this._period);
    } catch (err) {
      this._error = err instanceof Error ? err.message : t("metrics.errorLoad");
    } finally {
      this._loading = false;
    }
  }

  private _onPeriodChange(e: Event) {
    const select = e.target as HTMLSelectElement & { value: string };
    this._period = select.value;
    void this._load();
  }

  render() {
    return html`
      <div>
        <div class="metrics-header">
          <h2 class="metrics-title">${t("metrics.title")}</h2>
          <sl-select
            value=${this._period}
            size="small"
            style="min-width: 160px;"
            @sl-change=${this._onPeriodChange}
          >
            <sl-option value="1h">${t("metrics.period.1h")}</sl-option>
            <sl-option value="24h">${t("metrics.period.24h")}</sl-option>
            <sl-option value="7d">${t("metrics.period.7d")}</sl-option>
            <sl-option value="30d">${t("metrics.period.30d")}</sl-option>
          </sl-select>
        </div>

        ${this._loading
          ? html`<div class="loading">
              <sl-spinner style="font-size: 2rem;"></sl-spinner>
            </div>`
          : this._error
            ? html`
                <sl-alert variant="danger" open class="error-state">
                  ${this._error}
                </sl-alert>
              `
            : this._summary
              ? this._renderDashboard(this._summary)
              : html`<div class="empty-state">${t("metrics.noData")}</div>`}
      </div>
    `;
  }

  private _renderDashboard(s: MetricsSummary) {
    return html`
      <div class="metrics-grid">
        ${this._renderSuccessRateCard(s)} ${this._renderDurationCard(s)}
        ${this._renderPendingCard(s)}
      </div>

      <div class="tables-grid">
        ${this._renderPerspectiveTable(s.by_perspective)}
        ${this._renderModelTable(s.by_model)}
      </div>

      ${this._renderWorkspaceStatus(s.workspace_status)}
    `;
  }

  private _renderSuccessRateCard(s: MetricsSummary) {
    const rate = Math.round(s.success_rate);
    const color = successRateColor(s.success_rate);
    return html`
      <sl-card>
        <div class="card-label">${t("metrics.successRate")}</div>
        <div class="big-number" style="color: ${color}">${rate}%</div>
        <div class="card-subtitle">
          ${s.success_count} ${t("metrics.completed")}, ${s.failure_count}
          ${t("metrics.failed")} (${s.invocation_count} ${t("metrics.total")})
        </div>
      </sl-card>
    `;
  }

  private _renderDurationCard(s: MetricsSummary) {
    return html`
      <sl-card>
        <div class="card-label">${t("metrics.duration")}</div>
        <div class="stat-row">
          <span class="stat-label">${t("metrics.avg")}</span>
          <span class="stat-value"
            >${formatDuration(s.avg_duration_seconds)}</span
          >
        </div>
        <div class="stat-row">
          <span class="stat-label">${t("metrics.p50")}</span>
          <span class="stat-value"
            >${formatDuration(s.p50_duration_seconds)}</span
          >
        </div>
        <div class="stat-row">
          <span class="stat-label">${t("metrics.p95")}</span>
          <span class="stat-value"
            >${formatDuration(s.p95_duration_seconds)}</span
          >
        </div>
      </sl-card>
    `;
  }

  private _renderPendingCard(s: MetricsSummary) {
    const isHigh = s.pending_count > 5;
    return html`
      <sl-card>
        <div class="card-label">${t("metrics.pending")}</div>
        <div
          class="big-number"
          style="color: ${isHigh
            ? "var(--sl-color-warning-500, #f59e0b)"
            : "var(--text-primary, #e2e4ed)"}"
        >
          ${s.pending_count}
        </div>
        ${isHigh
          ? html`<div class="pending-alert">
              <sl-icon name="exclamation-triangle"></sl-icon>
              ${t("metrics.pendingHigh")}
            </div>`
          : nothing}
        <div class="card-subtitle">${t("metrics.pendingSubtitle")}</div>
      </sl-card>
    `;
  }

  private _renderPerspectiveTable(rows: PerspectiveMetric[]) {
    if (!rows || rows.length === 0) {
      return html`
        <sl-card>
          <div class="card-label">${t("metrics.perspective")}</div>
          <div class="empty-state">${t("metrics.noData")}</div>
        </sl-card>
      `;
    }

    return html`
      <sl-card>
        <div class="card-label">${t("metrics.perspective")}</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>${t("metrics.perspectiveCol")}</th>
              <th>${t("metrics.countCol")}</th>
              <th>${t("metrics.successRateCol")}</th>
              <th>${t("metrics.avgDurationCol")}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const total = r.count || 1;
              const rate = Math.round((r.success_count / total) * 100);
              const rateClass =
                rate >= 90
                  ? "success-high"
                  : rate >= 70
                    ? "success-med"
                    : "success-low";
              return html`
                <tr>
                  <td class="label-cell">${r.perspective}</td>
                  <td>${r.count}</td>
                  <td class="${rateClass}">${rate}%</td>
                  <td>${formatDuration(r.avg_duration_seconds)}</td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </sl-card>
    `;
  }

  private _renderModelTable(rows: ModelMetric[]) {
    if (!rows || rows.length === 0) {
      return html`
        <sl-card>
          <div class="card-label">${t("metrics.model")}</div>
          <div class="empty-state">${t("metrics.noData")}</div>
        </sl-card>
      `;
    }

    const sorted = [...rows].sort((a, b) => b.cost_usd - a.cost_usd);

    return html`
      <sl-card>
        <div class="card-label">${t("metrics.model")}</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>${t("metrics.modelCol")}</th>
              <th>${t("metrics.countCol")}</th>
              <th>${t("metrics.costCol")}</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(
              (r) => html`
                <tr>
                  <td class="label-cell">${r.model}</td>
                  <td>${r.count}</td>
                  <td>$${r.cost_usd.toFixed(4)}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </sl-card>
    `;
  }

  private _renderWorkspaceStatus(status: Record<string, number>) {
    if (!status || Object.keys(status).length === 0) return nothing;

    const VARIANT: Record<string, string> = {
      running: "success",
      stopped: "neutral",
      failed: "danger",
      pending: "warning",
      starting: "primary",
    };

    return html`
      <sl-card>
        <div class="card-label">${t("metrics.workspaceStatus")}</div>
        <div class="status-badges">
          ${Object.entries(status).map(
            ([state, count]) => html`
              <sl-badge variant=${VARIANT[state] ?? "neutral"} pill>
                ${count} ${state}
              </sl-badge>
            `,
          )}
        </div>
      </sl-card>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "project-metrics": ProjectMetrics;
  }
}
