import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { GLOSSARY } from '../../lib/glossary.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

/**
 * `<domain-tooltip>` wraps any content with a Shoelace tooltip that explains
 * the given DDD / Event Storming term in plain language.
 *
 * Usage:
 *   <domain-tooltip term="aggregate">Aggregate</domain-tooltip>
 *   <domain-tooltip term="domain-event">Domain Events</domain-tooltip>
 *
 * If the `term` is not found in the GLOSSARY the slot content is rendered as-is
 * without a tooltip, so unknown keys degrade gracefully.
 */
@customElement('domain-tooltip')
export class DomainTooltip extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .term-wrapper {
      display: inline-flex;
      align-items: center;
      gap: 0.2em;
    }

    .help-icon {
      display: inline-block;
      width: 0.875em;
      height: 0.875em;
      border-radius: 50%;
      background: transparent;
      color: var(--sl-color-neutral-400);
      font-size: 0.75em;
      font-weight: 700;
      line-height: 0.875em;
      text-align: center;
      flex-shrink: 0;
      cursor: help;
      user-select: none;
    }

    sl-tooltip {
      --max-width: 250px;
    }

    sl-tooltip::part(body) {
      max-width: 250px;
      font-size: var(--sl-font-size-small);
      line-height: 1.5;
      white-space: normal;
    }
  `;

  /** The glossary key (e.g., 'aggregate', 'domain-event'). */
  @property() term = '';

  render() {
    const entry = GLOSSARY[this.term];
    if (!entry) {
      return html`<slot></slot>`;
    }

    const definition = t(`glossary.${this.term}`);

    return html`
      <sl-tooltip content=${definition} hoist>
        <span class="term-wrapper">
          <slot></slot>
          <span class="help-icon" aria-hidden="true">?</span>
        </span>
      </sl-tooltip>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'domain-tooltip': DomainTooltip;
  }
}
