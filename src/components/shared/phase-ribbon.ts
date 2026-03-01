import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { UX_PHASES, inferUxPhase, isPhaseComplete, type UxPhase } from '../../lib/ux-phases.js';
import type { WorkflowStatus } from '../../lib/workflow-engine.js';

/**
 * Phase Ribbon — thin horizontal strip shown below the header indicating
 * which of the seven UX phases the session is currently in.
 *
 * Seven circles connected by a line: Spark → Explore → Rank → Slice → Agree → Build → Ship.
 *
 * - Completed phases: filled circle with a checkmark icon
 * - Current phase: outlined circle with a gentle pulse animation
 * - Future phases: dimmed appearance
 *
 * Clicking a circle emits a `phase-navigate` CustomEvent with `{ phase: UxPhase }`.
 * Left/Right arrow keys move focus between phases; Enter/Space activates.
 *
 * @fires phase-navigate - Fired when a phase circle is clicked or activated.
 *   `detail: { phase: UxPhase }`
 */
@customElement('phase-ribbon')
export class PhaseRibbon extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    nav {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.5rem 1rem;
      background: var(--surface-1, var(--sl-color-neutral-0));
      border-bottom: 1px solid var(--border-color, var(--sl-color-neutral-200));
      gap: 0;
      position: relative;
    }

    /* Connector line between circles */
    .connector {
      flex: 1;
      height: 2px;
      background: var(--sl-color-neutral-300);
      max-width: 3rem;
      min-width: 0.5rem;
    }

    .connector.completed {
      background: var(--sl-color-primary-500);
    }

    /* Phase step */
    .phase-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    /* Circle button */
    .phase-circle {
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      border: 2px solid var(--sl-color-neutral-400);
      background: var(--sl-color-neutral-0);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.2s ease, background 0.2s ease, opacity 0.2s ease;
      position: relative;
      padding: 0;
      /* Minimum 44x44px touch target via padding trick using pseudo-element */
    }

    /* Expand touch target without enlarging the visual */
    .phase-circle::after {
      content: '';
      position: absolute;
      inset: -0.375rem;
      border-radius: 50%;
    }

    .phase-circle:focus-visible {
      outline: 2px solid var(--sl-color-primary-500);
      outline-offset: 3px;
    }

    /* Current phase */
    .phase-circle.current {
      border-color: var(--sl-color-primary-500);
      background: var(--sl-color-neutral-0);
    }

    /* Completed phase */
    .phase-circle.completed {
      border-color: var(--sl-color-primary-500);
      background: var(--sl-color-primary-500);
      color: white;
    }

    /* Future (dimmed) */
    .phase-circle.future {
      border-color: var(--sl-color-neutral-300);
      background: var(--sl-color-neutral-0);
      opacity: 0.45;
    }

    /* Pulse animation for current phase */
    @keyframes phase-pulse {
      0%, 100% {
        box-shadow: 0 0 0 0 rgba(var(--sl-color-primary-500-rgb, 59, 130, 246), 0.4);
      }
      50% {
        box-shadow: 0 0 0 6px rgba(var(--sl-color-primary-500-rgb, 59, 130, 246), 0);
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      .phase-circle.current {
        animation: phase-pulse 2s ease-in-out infinite;
      }
    }

    /* Circle icon / dot */
    .phase-icon {
      width: 0.6rem;
      height: 0.6rem;
      border-radius: 50%;
      background: var(--sl-color-primary-500);
      display: block;
    }

    .phase-circle.future .phase-icon {
      background: var(--sl-color-neutral-400);
    }

    /* Checkmark SVG for completed phases */
    .check-icon {
      width: 1rem;
      height: 1rem;
      stroke: white;
      stroke-width: 2.5;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      display: block;
    }

    /* Phase label */
    .phase-label {
      font-size: 0.6875rem;
      line-height: 1;
      color: var(--sl-color-neutral-600);
      white-space: nowrap;
      user-select: none;
      transition: color 0.2s ease, opacity 0.2s ease;
    }

    .phase-label.current {
      color: var(--sl-color-primary-600);
      font-weight: var(--sl-font-weight-semibold);
    }

    .phase-label.completed {
      color: var(--sl-color-primary-600);
    }

    .phase-label.future {
      opacity: 0.45;
    }
  `;

  /** Current workflow status; when undefined all phases render dimmed */
  @property({ type: Object }) status?: WorkflowStatus;

  private get _currentPhase(): UxPhase | null {
    return this.status ? inferUxPhase(this.status) : null;
  }

  private _phaseState(phase: UxPhase): 'completed' | 'current' | 'future' {
    const current = this._currentPhase;
    if (!current) return 'future';
    if (this.status && isPhaseComplete(phase, this.status)) return 'completed';
    if (phase === current) return 'current';
    return 'future';
  }

  render() {
    return html`
      <nav
        role="navigation"
        aria-label="Session phases"
      >
        ${UX_PHASES.map((phaseInfo, index) => {
          const state = this._phaseState(phaseInfo.id);
          const isCurrent = state === 'current';
          const isCompleted = state === 'completed';

          // Connector before this phase (all except the first)
          const connector = index > 0 ? html`
            <div
              class="connector ${isCompleted || (UX_PHASES[index - 1] && this._phaseState(UX_PHASES[index - 1].id) === 'completed') ? 'completed' : ''}"
              aria-hidden="true"
            ></div>
          ` : nothing;

          return html`
            ${connector}
            <div class="phase-step">
              <button
                class="phase-circle ${state}"
                role="button"
                aria-label="${phaseInfo.label} phase"
                aria-current=${isCurrent ? 'step' : nothing}
                tabindex=${isCurrent ? '0' : '-1'}
                @click=${() => this._handlePhaseClick(phaseInfo.id)}
                @keydown=${(e: KeyboardEvent) => this._handleKeydown(e, index)}
                data-phase-index=${index}
              >
                ${isCompleted
                  ? html`<svg class="check-icon" viewBox="0 0 16 16" aria-hidden="true">
                      <polyline points="3,8 6.5,12 13,4"></polyline>
                    </svg>`
                  : html`<span class="phase-icon" aria-hidden="true"></span>`
                }
              </button>
              <span class="phase-label ${state}">${phaseInfo.label}</span>
            </div>
          `;
        })}
      </nav>
    `;
  }

  private _handlePhaseClick(phase: UxPhase) {
    this.dispatchEvent(
      new CustomEvent('phase-navigate', {
        detail: { phase },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _handleKeydown(e: KeyboardEvent, index: number) {
    let nextIndex: number | null = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = Math.min(index + 1, UX_PHASES.length - 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = Math.max(index - 1, 0);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._handlePhaseClick(UX_PHASES[index].id);
      return;
    }

    if (nextIndex !== null && nextIndex !== index) {
      e.preventDefault();
      const buttons = this.renderRoot.querySelectorAll<HTMLButtonElement>('.phase-circle');
      const target = buttons[nextIndex];
      if (target) {
        // Update tabindex: only focused element gets 0
        buttons.forEach((btn, i) => {
          btn.tabIndex = i === nextIndex ? 0 : -1;
        });
        target.focus();
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'phase-ribbon': PhaseRibbon;
  }
}
