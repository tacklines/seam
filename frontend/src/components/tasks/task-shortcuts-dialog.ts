import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { t } from "../../lib/i18n.js";

/**
 * Keyboard shortcuts overlay. Shown as a modal-style card.
 * Emits `close` when dismissed.
 */
@customElement("task-shortcuts-dialog")
export class TaskShortcutsDialog extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .shortcuts-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .shortcuts-card {
      background: var(--surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.5rem;
      max-width: 340px;
      width: 90%;
      box-shadow: var(--shadow-lg);
    }

    .shortcuts-card h3 {
      margin: 0 0 1rem;
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .shortcut-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.35rem 0;
    }

    .shortcut-row span {
      color: var(--text-secondary);
      font-size: 0.85rem;
    }

    .shortcut-key {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      background: var(--surface-card);
      border: 1px solid var(--border-medium);
      border-radius: 4px;
      font-family: var(--sl-font-mono);
      font-size: 0.75rem;
      color: var(--text-primary);
      min-width: 1.5rem;
      text-align: center;
    }
  `;

  @property({ type: Boolean }) open = false;

  private _handleOverlayClick() {
    this.dispatchEvent(
      new CustomEvent("close", { bubbles: true, composed: true }),
    );
  }

  render() {
    if (!this.open) return html``;
    return html`
      <div class="shortcuts-overlay" @click=${() => this._handleOverlayClick()}>
        <div class="shortcuts-card" @click=${(e: Event) => e.stopPropagation()}>
          <h3>${t("taskBoard.shortcuts.title")}</h3>
          <div class="shortcut-row">
            <span>${t("taskBoard.shortcuts.newTask")}</span
            ><span class="shortcut-key">N</span>
          </div>
          <div class="shortcut-row">
            <span>${t("taskBoard.shortcuts.search")}</span
            ><span class="shortcut-key">/</span>
          </div>
          <div class="shortcut-row">
            <span>${t("taskBoard.shortcuts.escape")}</span
            ><span class="shortcut-key">Esc</span>
          </div>
          <div class="shortcut-row">
            <span>${t("taskBoard.shortcuts.help")}</span
            ><span class="shortcut-key">?</span>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-shortcuts-dialog": TaskShortcutsDialog;
  }
}
