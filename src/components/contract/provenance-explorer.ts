import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../lib/i18n.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * A single step in a provenance chain.
 *
 * The chain traces a contract field back through its lineage:
 *   - resolution:  a jam resolution that produced this value
 *   - conflict:    the conflict overlap that required resolution
 *   - artifact:    a submitted YAML artifact that contributed
 *   - participant: a human participant who submitted an artifact
 */
export type ProvenanceStepKind = 'resolution' | 'conflict' | 'artifact' | 'participant';

export interface ProvenanceStep {
  /** Discriminator for which kind of lineage step this is. */
  kind: ProvenanceStepKind;
  /** Short label shown as the node title. */
  label: string;
  /** Optional detail text shown beneath the label. */
  detail?: string;
  /** Optional timestamp (ISO string) shown in the step. */
  timestamp?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STEP_CONFIG: Record<
  ProvenanceStepKind,
  { icon: string; colorClass: string; ariaKindLabel: string }
> = {
  resolution: {
    icon: '✓',
    colorClass: 'step-resolution',
    ariaKindLabel: 'resolution',
  },
  conflict: {
    icon: '!',
    colorClass: 'step-conflict',
    ariaKindLabel: 'conflict overlap',
  },
  artifact: {
    icon: '⊞',
    colorClass: 'step-artifact',
    ariaKindLabel: 'artifact',
  },
  participant: {
    icon: '◉',
    colorClass: 'step-participant',
    ariaKindLabel: 'participant',
  },
};

// ── Component ──────────────────────────────────────────────────────────────

/**
 * `<provenance-explorer>` renders the lineage of a contract field as a
 * vertical timeline. Each step in the chain is a node with a kind indicator
 * (never color alone — each kind has a distinct icon and shape).
 *
 * @property chain    - Array of ProvenanceStep objects (top = most derived)
 * @property subject  - Optional label for what is being traced
 */
@customElement('provenance-explorer')
export class ProvenanceExplorer extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--sl-font-sans);
    }

    .empty {
      text-align: center;
      padding: 1.5rem;
      color: #9ca3af;
      font-size: 0.875rem;
      font-style: italic;
    }

    .subject-heading {
      font-size: 0.8125rem;
      font-weight: 700;
      color: #374151;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .subject-heading sl-badge {
      font-size: 0.6875rem;
    }

    .chain {
      position: relative;
      padding: 0;
      margin: 0;
      list-style: none;
    }

    /* Vertical connector line between steps */
    .chain::before {
      content: '';
      position: absolute;
      left: 0.9375rem;
      top: 1.5rem;
      bottom: 1.5rem;
      width: 2px;
      background: linear-gradient(to bottom, #e5e7eb 0%, #e5e7eb 100%);
      z-index: 0;
    }

    .step {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.5rem 0;
    }

    /* No connector after last step */
    .step:last-child {
      padding-bottom: 0;
    }

    .step-node {
      flex-shrink: 0;
      width: 1.875rem;
      height: 1.875rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      line-height: 1;
      border: 2px solid transparent;
      z-index: 1;
      position: relative;
      /* Touch target minimum */
      min-width: 1.875rem;
    }

    /* Resolution — green, filled circle */
    .step-resolution .step-node {
      background: #16a34a;
      border-color: #15803d;
      color: #fff;
    }

    /* Conflict — amber, diamond-ish */
    .step-conflict .step-node {
      background: #d97706;
      border-color: #b45309;
      color: #fff;
      border-radius: 4px;
      transform: rotate(45deg);
    }

    .step-conflict .step-node span {
      transform: rotate(-45deg);
      display: inline-block;
    }

    /* Artifact — blue, square */
    .step-artifact .step-node {
      background: #2563eb;
      border-color: #1d4ed8;
      color: #fff;
      border-radius: 4px;
    }

    /* Participant — purple, star-ish (triangle via border-radius) */
    .step-participant .step-node {
      background: #7c3aed;
      border-color: #6d28d9;
      color: #fff;
      border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
    }

    .step-body {
      flex: 1;
      min-width: 0;
      padding-top: 0.0625rem;
    }

    .step-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #111827;
      margin-bottom: 0.125rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .step-detail {
      font-size: 0.75rem;
      color: #6b7280;
      line-height: 1.4;
    }

    .step-timestamp {
      font-size: 0.6875rem;
      color: #9ca3af;
      margin-top: 0.125rem;
      font-family: var(--sl-font-mono, monospace);
    }

    .step-kind-pill {
      margin-bottom: 0.25rem;
    }

    /* Legend */
    .legend {
      display: flex;
      gap: 0.75rem;
      margin-top: 1rem;
      flex-wrap: wrap;
      padding-top: 0.75rem;
      border-top: 1px solid #f3f4f6;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .legend-node {
      flex-shrink: 0;
      width: 1rem;
      height: 1rem;
      border-radius: 50%;
      border: 1.5px solid transparent;
      display: inline-block;
    }

    .legend-resolution { background: #16a34a; border-color: #15803d; }
    .legend-conflict { background: #d97706; border-color: #b45309; border-radius: 2px; transform: rotate(45deg); }
    .legend-artifact { background: #2563eb; border-color: #1d4ed8; border-radius: 2px; }
    .legend-participant { background: #7c3aed; border-color: #6d28d9; }
  `;

  /** The provenance chain to render. Index 0 = most-derived (e.g. resolution). */
  @property({ attribute: false }) chain: ProvenanceStep[] = [];

  /** Optional label for the field/contract being traced. */
  @property({ type: String }) subject = '';

  override render() {
    if (this.chain.length === 0) {
      return html`<div class="empty">${t('provenanceExplorer.empty')}</div>`;
    }

    return html`
      ${this.subject
        ? html`
            <div class="subject-heading">
              <span>${t('provenanceExplorer.headingPrefix')}</span>
              <sl-badge variant="neutral">${this.subject}</sl-badge>
            </div>
          `
        : nothing}

      <ol
        class="chain"
        role="list"
        aria-label="${this.subject ? t('provenanceExplorer.ariaLabel', { subject: this.subject }) : t('provenanceExplorer.ariaLabelDefault')}"
      >
        ${this.chain.map((step, i) => this._renderStep(step, i))}
      </ol>

      ${this._renderLegend()}
    `;
  }

  private _renderStep(step: ProvenanceStep, index: number) {
    const config = STEP_CONFIG[step.kind];
    const isLast = index === this.chain.length - 1;

    const kindLabel = t(`provenanceExplorer.kind.${step.kind}`);
    const stepAriaLabel = [
      t('provenanceExplorer.step', { n: index + 1, total: this.chain.length }),
      kindLabel,
      step.label,
      step.detail ? `— ${step.detail}` : '',
      step.timestamp ? t('provenanceExplorer.at', { timestamp: step.timestamp }) : '',
    ]
      .filter(Boolean)
      .join(' ');

    return html`
      <li
        class="step ${config.colorClass}"
        role="listitem"
        aria-label="${stepAriaLabel}"
        aria-setsize="${this.chain.length}"
        aria-posinset="${index + 1}"
        aria-current=${isLast ? 'true' : nothing}
      >
        <sl-tooltip content="${kindLabel}">
          <div class="step-node" aria-hidden="true">
            <span>${config.icon}</span>
          </div>
        </sl-tooltip>

        <div class="step-body">
          <div class="step-kind-pill">
            <sl-badge
              variant=${
                step.kind === 'resolution'
                  ? 'success'
                  : step.kind === 'conflict'
                  ? 'warning'
                  : step.kind === 'artifact'
                  ? 'primary'
                  : 'neutral'
              }
              pill
            >${kindLabel}</sl-badge>
          </div>
          <div class="step-label">${step.label}</div>
          ${step.detail
            ? html`<div class="step-detail">${step.detail}</div>`
            : nothing}
          ${step.timestamp
            ? html`<div class="step-timestamp">${this._formatTimestamp(step.timestamp)}</div>`
            : nothing}
        </div>
      </li>
    `;
  }

  private _formatTimestamp(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  private _renderLegend() {
    const kinds: ProvenanceStepKind[] = ['resolution', 'conflict', 'artifact', 'participant'];
    const usedKinds = new Set(this.chain.map((s) => s.kind));
    const relevantKinds = kinds.filter((k) => usedKinds.has(k));

    if (relevantKinds.length <= 1) return nothing;

    return html`
      <div class="legend" role="list" aria-label="${t('provenanceExplorer.legend')}">
        ${relevantKinds.map((k) => {
          return html`
            <div class="legend-item" role="listitem">
              <span class="legend-node legend-${k}" aria-hidden="true"></span>
              ${t(`provenanceExplorer.kind.${k}`)}
            </div>
          `;
        })}
      </div>
    `;
  }
}
