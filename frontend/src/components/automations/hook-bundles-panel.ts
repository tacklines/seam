import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  getHookBundles,
  installHookBundle,
  type BundleStatus,
} from "../../state/automation-api.js";

import "@shoelace-style/shoelace/dist/components/card/card.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/details/details.js";
import "@shoelace-style/shoelace/dist/components/tag/tag.js";

const BUNDLE_META: Record<
  string,
  { label: string; description: string; icon: string }
> = {
  task_intelligence: {
    label: "Task Intelligence",
    description:
      "Auto-triage new tasks and generate completion summaries when tasks close.",
    icon: "list-task",
  },
  session_awareness: {
    label: "Session Awareness",
    description:
      "Classify comment intent and summarize sessions on close.",
    icon: "chat-dots",
  },
  request_pipeline: {
    label: "Request Pipeline",
    description:
      "Detect duplicate requests and analyze impact on creation.",
    icon: "inbox",
  },
  project_health: {
    label: "Project Health",
    description:
      "Coming soon — scheduled health reports and stale task detection. Requires data-aware inference.",
    icon: "heart-pulse",
  },
};

@customElement("hook-bundles-panel")
export class HookBundlesPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .bundles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
    }

    sl-card {
      --padding: 1rem;
    }

    sl-card::part(base) {
      height: 100%;
    }

    .bundle-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .bundle-header sl-icon {
      font-size: 1.25rem;
      color: var(--sl-color-primary-600);
    }

    .bundle-header h3 {
      margin: 0;
      font-size: 0.95rem;
    }

    .bundle-description {
      color: var(--sl-color-neutral-600);
      font-size: 0.85rem;
      margin-bottom: 0.75rem;
      line-height: 1.4;
    }

    .bundle-items {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-bottom: 0.75rem;
    }

    .bundle-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: auto;
    }

    .loading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem;
      color: var(--sl-color-neutral-500);
    }
  `;

  @property() projectId = "";

  @state() private _bundles: BundleStatus[] = [];
  @state() private _loading = true;
  @state() private _installing: string | null = null;
  @state() private _error = "";

  connectedCallback() {
    super.connectedCallback();
    this._loadBundles();
  }

  private async _loadBundles() {
    if (!this.projectId) return;
    this._loading = true;
    try {
      this._bundles = await getHookBundles(this.projectId);
    } catch (e) {
      this._error = e instanceof Error ? e.message : "Failed to load bundles";
    } finally {
      this._loading = false;
    }
  }

  private async _install(bundleName: string) {
    this._installing = bundleName;
    try {
      await installHookBundle(this.projectId, bundleName);
      await this._loadBundles();
      this.dispatchEvent(
        new CustomEvent("bundle-installed", { detail: { bundleName } }),
      );
    } catch (e) {
      this._error = e instanceof Error ? e.message : "Install failed";
    } finally {
      this._installing = null;
    }
  }

  render() {
    if (this._loading) {
      return html`<div class="loading">
        <sl-spinner></sl-spinner> Loading hook bundles…
      </div>`;
    }

    if (this._error) {
      return html`<sl-alert variant="danger" open>${this._error}</sl-alert>`;
    }

    return html`
      <div class="bundles-grid">
        ${this._bundles.map((b) => this._renderBundle(b))}
      </div>
    `;
  }

  private _renderBundle(bundle: BundleStatus) {
    const meta = BUNDLE_META[bundle.name] ?? {
      label: bundle.name,
      description: "",
      icon: "gear",
    };
    const installing = this._installing === bundle.name;

    return html`
      <sl-card>
        <div class="bundle-header">
          <sl-icon name=${meta.icon}></sl-icon>
          <h3>${meta.label}</h3>
          ${bundle.installed
            ? html`<sl-badge variant="success" pill>Installed</sl-badge>`
            : nothing}
        </div>
        <p class="bundle-description">${meta.description}</p>

        ${bundle.installed_items.length > 0
          ? html`
              <sl-details
                summary="Installed items (${bundle.installed_items.length})"
              >
                <div class="bundle-items">
                  ${bundle.installed_items.map(
                    (name) =>
                      html`<sl-tag size="small" variant="success"
                        >${name}</sl-tag
                      >`,
                  )}
                </div>
              </sl-details>
            `
          : nothing}
        ${bundle.missing_items.length > 0
          ? html`
              <div class="bundle-items" style="margin-top: 0.5rem;">
                ${bundle.missing_items.map(
                  (name) =>
                    html`<sl-tag size="small" variant="neutral"
                      >${name}</sl-tag
                    >`,
                )}
              </div>
            `
          : nothing}

        <div class="bundle-footer">
          ${bundle.installed
            ? html`<span
                style="font-size: 0.8rem; color: var(--sl-color-neutral-500);"
                >All hooks active</span
              >`
            : html`
                <sl-button
                  variant="primary"
                  size="small"
                  ?loading=${installing}
                  ?disabled=${installing}
                  @click=${() => this._install(bundle.name)}
                >
                  Install
                </sl-button>
              `}
        </div>
      </sl-card>
    `;
  }
}
