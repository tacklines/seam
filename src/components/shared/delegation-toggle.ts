import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { DelegationLevel } from '../../schema/types.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';

/** Detail emitted when the delegation level changes. */
export interface LevelChangedDetail {
  level: DelegationLevel;
}

/** Autonomy options in display order. */
const LEVELS: DelegationLevel[] = ['assisted', 'semi_autonomous', 'autonomous'];

/** Which levels represent an increase in autonomy vs the given current level. */
function isIncreasingAutonomy(current: DelegationLevel, next: DelegationLevel): boolean {
  return LEVELS.indexOf(next) > LEVELS.indexOf(current);
}

/**
 * Delegation level toggle.
 *
 * Renders an `sl-select` with three autonomy levels. When the user picks a
 * higher autonomy level, a confirmation `sl-dialog` is shown before the change
 * is committed. Fires `level-changed` with the confirmed level.
 *
 * @fires level-changed — CustomEvent<LevelChangedDetail>
 */
@customElement('delegation-toggle')
export class DelegationToggle extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
      font-family: var(--sl-font-sans);
    }

    .wrapper {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .label {
      font-size: var(--sl-font-size-x-small);
      font-weight: var(--sl-font-weight-semibold);
      color: var(--sl-color-neutral-500);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    sl-select {
      min-width: 220px;
    }

    .confirm-body {
      font-size: var(--sl-font-size-medium);
      color: var(--sl-color-neutral-800);
      line-height: 1.6;
    }

    .confirm-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1.25rem;
    }
  `;

  /** Current delegation level. */
  @property({ type: String }) level: DelegationLevel = 'assisted';

  /** Pending level awaiting confirmation (set when dialog is open). */
  @state() private pendingLevel: DelegationLevel | null = null;
  @state() private dialogOpen = false;

  private handleSelectChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    const next = select.value as DelegationLevel;

    if (isIncreasingAutonomy(this.level, next)) {
      this.pendingLevel = next;
      this.dialogOpen = true;
    } else {
      this.commitLevel(next);
    }
  }

  private handleConfirm() {
    if (this.pendingLevel) {
      this.commitLevel(this.pendingLevel);
    }
    this.pendingLevel = null;
    this.dialogOpen = false;
  }

  private handleCancel() {
    this.pendingLevel = null;
    this.dialogOpen = false;
  }

  private commitLevel(level: DelegationLevel) {
    this.dispatchEvent(
      new CustomEvent<LevelChangedDetail>('level-changed', {
        detail: { level },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private confirmationActionDescription(level: DelegationLevel): string {
    if (level === 'semi_autonomous') {
      return t('delegationToggle.confirmAction.semiAutonomous');
    }
    return t('delegationToggle.confirmAction.autonomous');
  }

  render() {
    const pendingLevel = this.pendingLevel ?? 'assisted';

    return html`
      <div class="wrapper">
        <div class="label" id="delegation-label">
          ${t('delegationToggle.label')}
        </div>
        <sl-select
          value=${this.level}
          aria-labelledby="delegation-label"
          @sl-change=${this.handleSelectChange}
        >
          ${LEVELS.map(
            (lvl) => html`
              <sl-option value=${lvl}>
                ${t(`delegationToggle.level.${lvl}`)}
              </sl-option>
            `,
          )}
        </sl-select>
        <div class="level-description" aria-live="polite">
          ${t(`delegationToggle.description.${this.level}`)}
        </div>
      </div>

      <sl-dialog
        label=${t('delegationToggle.confirmTitle')}
        ?open=${this.dialogOpen}
        @sl-request-close=${this.handleCancel}
      >
        <div class="confirm-body">
          <p>
            ${t('delegationToggle.confirmMessage', {
              action: this.confirmationActionDescription(pendingLevel),
            })}
          </p>
          <p>${t('delegationToggle.confirmUndo')}</p>
        </div>
        <div class="confirm-footer" slot="footer">
          <sl-button variant="default" @click=${this.handleCancel}>
            ${t('delegationToggle.cancel')}
          </sl-button>
          <sl-button variant="primary" @click=${this.handleConfirm}>
            ${t('delegationToggle.confirm')}
          </sl-button>
        </div>
      </sl-dialog>
    `;
  }
}
