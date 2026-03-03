import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';
import type { WorkItem, Draft, PriorityTier } from '../../schema/types.js';
import type { WorkItemSuggestion } from '../visualization/breakdown-editor.js';

import '../visualization/breakdown-editor.js';
import '../visualization/coverage-matrix.js';
import '../visualization/dependency-graph.js';
import '../session/draft-editor.js';
import './help-tip.js';

/**
 * `<breakdown-tab>` — Tab panel wrapper for the Phase IV "Slice" work breakdown view.
 *
 * Renders the breakdown-editor, coverage-matrix, dependency-graph, and draft-editor
 * in the canonical two-column layout. All events from child components are re-fired
 * upward with `bubbles: true, composed: true`.
 *
 * @fires work-item-created - A new work item was created.
 * @fires work-item-updated - An existing work item was updated.
 * @fires suggestion-accepted - A decomposition suggestion was accepted.
 * @fires suggestion-dismissed - A decomposition suggestion was dismissed.
 * @fires dependency-created - A dependency between work items was created.
 * @fires draft-change - The active draft content changed.
 * @fires draft-publish - The active draft was published.
 */
@customElement('breakdown-tab')
export class BreakdownTab extends LitElement {
  static styles = css`
    :host { display: contents; }

    .breakdown-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      align-items: start;
    }

    .breakdown-sidebar {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    @media (max-width: 900px) {
      .breakdown-layout {
        grid-template-columns: 1fr;
      }
    }
  `;

  /** All unique event names across loaded files (for linked-events dropdowns) */
  @property({ attribute: false }) events: string[] = [];
  /** Current work items */
  @property({ attribute: false }) workItems: WorkItem[] = [];
  /** Decomposition suggestions (already filtered by dismissed IDs by the parent) */
  @property({ attribute: false }) suggestions: WorkItemSuggestion[] = [];
  /** The currently active draft, or null if none */
  @property({ attribute: false }) activeDraft: Draft | null = null;
  /**
   * Map from event name to its priority tier.
   * Forwarded to breakdown-editor to pre-sort work items by priority.
   */
  @property({ attribute: false }) priorities: ReadonlyMap<string, PriorityTier> = new Map();

  render() {
    return html`
      <help-tip tip-key="breakdown-editor" message=${t('helpTip.breakdownEditor')} ?active=${this.events.length > 0}>
        <div class="breakdown-layout">
          <breakdown-editor
            .events=${this.events}
            .workItems=${this.workItems}
            .suggestions=${this.suggestions}
            .priorities=${this.priorities}
            @work-item-created=${(e: Event) =>
              this.dispatchEvent(
                new CustomEvent('work-item-created', {
                  detail: (e as CustomEvent).detail,
                  bubbles: true,
                  composed: true,
                })
              )}
            @work-item-updated=${(e: Event) =>
              this.dispatchEvent(
                new CustomEvent('work-item-updated', {
                  detail: (e as CustomEvent).detail,
                  bubbles: true,
                  composed: true,
                })
              )}
            @suggestion-accepted=${(e: Event) =>
              this.dispatchEvent(
                new CustomEvent('suggestion-accepted', {
                  detail: (e as CustomEvent).detail,
                  bubbles: true,
                  composed: true,
                })
              )}
            @suggestion-dismissed=${(e: Event) =>
              this.dispatchEvent(
                new CustomEvent('suggestion-dismissed', {
                  detail: (e as CustomEvent).detail,
                  bubbles: true,
                  composed: true,
                })
              )}
          ></breakdown-editor>
          <div class="breakdown-sidebar">
            <coverage-matrix
              .events=${this.events}
              .workItems=${this.workItems}
            ></coverage-matrix>
            <dependency-graph
              .workItems=${this.workItems}
              @dependency-created=${(e: Event) =>
                this.dispatchEvent(
                  new CustomEvent('dependency-created', {
                    detail: (e as CustomEvent).detail,
                    bubbles: true,
                    composed: true,
                  })
                )}
            ></dependency-graph>
          </div>
        </div>
        <draft-editor
          .draft=${this.activeDraft}
          @draft-change=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent('draft-change', {
                detail: (e as CustomEvent).detail,
                bubbles: true,
                composed: true,
              })
            )}
          @draft-publish=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent('draft-publish', {
                detail: (e as CustomEvent).detail,
                bubbles: true,
                composed: true,
              })
            )}
        ></draft-editor>
      </help-tip>
    `;
  }
}
