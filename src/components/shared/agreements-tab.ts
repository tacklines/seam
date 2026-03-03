import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { Overlap } from '../../lib/comparison.js';
import type { ConflictResolution, UnresolvedItem } from '../../schema/types.js';
import type { ResolutionSuggestion } from '../../lib/integration-heuristics.js';

import '../agreement/resolution-recorder.js';
import '../agreement/ownership-grid.js';
import '../agreement/flag-manager.js';
import './help-tip.js';
import './empty-state.js';

/**
 * `<agreements-tab>` — Tab panel wrapper for the Phase V "Agree" conflict resolution view.
 *
 * Renders resolution-recorders for each overlap (with help-tip on the first),
 * the ownership-grid for aggregate ownership assignment, and the flag-manager
 * for tracking unresolved items.
 *
 * Manages its own flaggedItems state internally and re-fires events upward.
 *
 * @fires resolution-recorded - A conflict resolution was submitted.
 * @fires suggestion-requested - User requested an AI suggestion for an overlap.
 * @fires item-flagged - User flagged an unresolved item.
 */
@customElement('agreements-tab')
export class AgreementsTab extends LitElement {
  static styles = css`:host { display: contents; }`;

  /** Overlap list derived from comparison controller */
  @property({ attribute: false }) overlaps: Overlap[] = [];
  /** All unique aggregate names across files (for ownership-grid rows) */
  @property({ attribute: false }) aggregates: string[] = [];
  /** All unique role names across files (for ownership-grid columns) */
  @property({ attribute: false }) roles: string[] = [];
  /** Session join code — passed to resolution-recorder and ownership-grid */
  @property() sessionCode = '';
  /** Current participant name — passed to resolution-recorder and ownership-grid */
  @property() participantName = '';
  /** Map of overlapLabel -> suggestion from the AI heuristic */
  @property({ attribute: false }) suggestions: Map<string, ResolutionSuggestion> = new Map();
  /** Set of overlap labels currently awaiting a suggestion response */
  @property({ attribute: false }) suggestionLoadingLabels: Set<string> = new Set();
  /** All recorded resolutions for this session */
  @property({ attribute: false }) resolutions: ConflictResolution[] = [];
  /** Already-flagged unresolved items */
  @property({ attribute: false }) flaggedItems: UnresolvedItem[] = [];

  /** Local state so flag-manager additions are immediately visible */
  @state() private _localFlaggedItems: UnresolvedItem[] = [];

  override willUpdate(changedProps: Map<string, unknown>) {
    if (changedProps.has('flaggedItems')) {
      this._localFlaggedItems = this.flaggedItems;
    }
  }

  render() {
    return html`
      <help-tip tip-key="agreements-tab" message=${t('helpTip.agreementsTab')} ?active=${this.overlaps.length > 0}>
        ${this.overlaps.length > 0
          ? this.overlaps.map((overlap, i) => {
              const recorder = html`
                <resolution-recorder
                  .overlap=${overlap}
                  sessionCode=${this.sessionCode}
                  participantName=${this.participantName}
                  .suggestion=${this.suggestions.get(overlap.label) ?? null}
                  ?suggestionLoading=${this.suggestionLoadingLabels.has(overlap.label)}
                  .existingResolution=${this.resolutions.find((r) => r.overlapLabel === overlap.label) ?? null}
                  @resolution-recorded=${(e: Event) =>
                    this.dispatchEvent(
                      new CustomEvent('resolution-recorded', {
                        detail: (e as CustomEvent).detail,
                        bubbles: true,
                        composed: true,
                      })
                    )}
                  @suggestion-requested=${(e: Event) =>
                    this.dispatchEvent(
                      new CustomEvent('suggestion-requested', {
                        detail: (e as CustomEvent).detail,
                        bubbles: true,
                        composed: true,
                      })
                    )}
                ></resolution-recorder>
              `;
              return i === 0
                ? html`<help-tip tip-key="conflict-resolve" message=${t('helpTip.conflictResolve')} ?active=${true}>${recorder}</help-tip>`
                : recorder;
            })
          : html`<empty-state
              icon="people"
              heading="${t('emptyState.agreements.heading')}"
              description="${t('emptyState.agreements.description')}"
              actionLabel="${t('emptyState.agreements.action')}"
              @empty-state-action=${this._onEmptyStateAction}
            ></empty-state>`
        }
        <ownership-grid
          .aggregates=${this.aggregates}
          .roles=${this.roles}
          sessionCode=${this.sessionCode}
          participantName=${this.participantName}
        ></ownership-grid>
        <flag-manager
          .items=${this._localFlaggedItems}
          sessionCode=${this.sessionCode}
          participantName=${this.participantName}
          .overlapLabels=${this.overlaps.map((o) => o.label)}
          @item-flagged=${this._onItemFlagged}
        ></flag-manager>
      </help-tip>
    `;
  }

  private _onEmptyStateAction() {
    this.dispatchEvent(
      new CustomEvent('suggestion-navigate', {
        detail: { panel: 'cards' },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onItemFlagged(e: CustomEvent<{ item: UnresolvedItem }>) {
    this._localFlaggedItems = [...this._localFlaggedItems, e.detail.item];
    this.dispatchEvent(
      new CustomEvent('item-flagged', {
        detail: e.detail,
        bubbles: true,
        composed: true,
      })
    );
  }
}
