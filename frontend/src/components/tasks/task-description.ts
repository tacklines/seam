import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { t } from "../../lib/i18n.js";
import "../shared/markdown-content.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";

export interface DescriptionChangedDetail {
  description: string | null;
}

/**
 * Inline description editor.
 *
 * Properties:
 *   - description: current text (null = no description)
 *
 * Events:
 *   - description-changed: DescriptionChangedDetail — user saved a new value
 */
@customElement("task-description")
export class TaskDescription extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .description-section {
      margin-bottom: 1.25rem;
    }

    .section-heading {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .description-content {
      color: var(--text-secondary);
      line-height: 1.6;
      font-size: 0.9rem;
      padding: 0.75rem 0.75rem 0.75rem 1rem;
      background: var(--surface-card);
      border-radius: 6px;
      border-left: 3px solid var(--sl-color-primary-500);
      cursor: default;
      position: relative;
    }

    .description-content:hover {
      border-left-color: var(--sl-color-primary-400);
    }

    .description-content:hover .edit-hint {
      display: inline;
    }

    .no-description {
      color: var(--text-tertiary);
      font-style: italic;
      font-size: 0.85rem;
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 6px;
      border: 1px dashed var(--border-subtle);
      text-align: center;
    }

    .no-description:hover {
      background: var(--surface-card);
      border-color: var(--border-medium);
    }

    .edit-hint {
      display: none;
      font-size: 0.7rem;
      width: 0.7rem;
      height: 0.7rem;
      color: var(--text-tertiary);
    }
  `;

  @property({ type: String }) description: string | null = null;

  @state() private _editing = false;

  render() {
    return html`
      <div class="description-section">
        <div class="section-heading">${t("taskDetail.description")}</div>
        ${this._editing
          ? html`
              <div>
                <sl-textarea
                  value=${this.description ?? ""}
                  rows="4"
                  resize="auto"
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Escape") this._editing = false;
                  }}
                ></sl-textarea>
                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                  <sl-button
                    size="small"
                    variant="primary"
                    @click=${(e: Event) => {
                      const textarea = (e.target as HTMLElement)
                        .closest(".description-section")
                        ?.querySelector("sl-textarea");
                      const val =
                        (textarea as unknown as HTMLTextAreaElement)?.value ??
                        "";
                      this.dispatchEvent(
                        new CustomEvent<DescriptionChangedDetail>(
                          "description-changed",
                          {
                            detail: { description: val || null },
                            bubbles: true,
                            composed: true,
                          },
                        ),
                      );
                      this._editing = false;
                    }}
                    >${t("taskDetail.save")}</sl-button
                  >
                  <sl-button
                    size="small"
                    @click=${() => {
                      this._editing = false;
                    }}
                    >${t("taskDetail.cancel")}</sl-button
                  >
                </div>
              </div>
            `
          : this.description
            ? html`
                <div
                  class="description-content"
                  @click=${() => {
                    this._editing = true;
                  }}
                >
                  <markdown-content
                    .content=${this.description}
                  ></markdown-content>
                  <sl-icon
                    class="edit-hint"
                    name="pencil"
                    style="position: absolute; top: 0.5rem; right: 0.5rem;"
                  ></sl-icon>
                </div>
              `
            : html`
                <div
                  class="no-description"
                  @click=${() => {
                    this._editing = true;
                  }}
                >
                  ${t("taskDetail.clickToAdd")}
                </div>
              `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-description": TaskDescription;
  }
}
