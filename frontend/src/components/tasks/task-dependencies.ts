import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { t } from "../../lib/i18n.js";
import {
  type TaskDetailView,
  TASK_TYPE_ICONS,
  TASK_TYPE_COLORS,
  STATUS_LABELS,
  STATUS_VARIANTS,
} from "../../state/task-types.js";

import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";

export interface BlockerAddedDetail {
  blockerId: string;
}

export interface BlockerRemovedDetail {
  blockerId: string;
}

export interface BlocksRemovedDetail {
  blockedId: string;
}

/**
 * Dependencies section: blocked-by and blocks lists with add/remove.
 *
 * Properties:
 *   - task: TaskDetailView (provides blocked_by and blocks arrays)
 *   - allTasks: flat list of { id, ticket_id, title } for the blocker picker
 *
 * Events:
 *   - blocker-added: BlockerAddedDetail
 *   - blocker-removed: BlockerRemovedDetail
 *   - blocks-removed: BlocksRemovedDetail
 *   - navigate-task: { detail: taskId }
 *   - load-all-tasks: fired when the picker is opened and allTasks may be empty
 */
@customElement("task-dependencies")
export class TaskDependencies extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .section-heading {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .dep-section {
      margin-bottom: 1.25rem;
    }

    .dep-list {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .dep-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.75rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s;
    }

    .dep-item:hover {
      background: var(--surface-card-hover);
    }

    .dep-item .dep-title {
      flex: 1;
      color: var(--text-primary);
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dep-item .remove-dep {
      opacity: 0;
      transition: opacity 0.15s;
    }

    .dep-item:hover .remove-dep {
      opacity: 1;
    }

    .dep-add-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-top: 0.5rem;
    }
  `;

  @property({ type: Object }) task!: TaskDetailView;
  @property({ type: Array }) allTasks: {
    id: string;
    ticket_id: string;
    title: string;
  }[] = [];

  @state() private _addingBlocker = false;

  private _openBlockerPicker() {
    this._addingBlocker = true;
    this.dispatchEvent(
      new CustomEvent("load-all-tasks", { bubbles: true, composed: true }),
    );
  }

  render() {
    const task = this.task;
    const hasBlockedBy = task.blocked_by.length > 0;
    const hasBlocks = task.blocks.length > 0;

    if (!hasBlockedBy && !hasBlocks && !this._addingBlocker) {
      return html`
        <div class="dep-section">
          <div
            class="section-heading"
            style="display: flex; align-items: center; justify-content: space-between;"
          >
            <span>${t("taskDetail.dependencies")}</span>
            <sl-button
              size="small"
              variant="text"
              @click=${() => this._openBlockerPicker()}
            >
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${t("taskDetail.add")}
            </sl-button>
          </div>
        </div>
      `;
    }

    const existingBlockerIds = new Set(task.blocked_by.map((b) => b.id));
    existingBlockerIds.add(task.id);
    const availableTasks = this.allTasks.filter(
      (tk) => !existingBlockerIds.has(tk.id),
    );

    return html`
      <div class="dep-section">
        <div
          class="section-heading"
          style="display: flex; align-items: center; justify-content: space-between;"
        >
          <span>Dependencies</span>
          <sl-button
            size="small"
            variant="text"
            @click=${() => this._openBlockerPicker()}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            ${t("taskDetail.addBlocker")}
          </sl-button>
        </div>

        ${hasBlockedBy
          ? html`
              <div
                style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.25rem; font-weight: 600;"
              >
                ${t("taskDetail.blockedByLabel")}
              </div>
              <div class="dep-list">
                ${task.blocked_by.map(
                  (b) => html`
                    <div
                      class="dep-item"
                      @click=${() =>
                        this.dispatchEvent(
                          new CustomEvent("navigate-task", {
                            detail: b.id,
                            bubbles: true,
                            composed: true,
                          }),
                        )}
                    >
                      <sl-icon
                        name=${TASK_TYPE_ICONS[b.task_type]}
                        style="color: ${TASK_TYPE_COLORS[
                          b.task_type
                        ]}; font-size: 0.85rem;"
                      ></sl-icon>
                      <span
                        style="font-family: var(--sl-font-mono); opacity: 0.7; font-size: 0.8rem;"
                        >${b.ticket_id}</span
                      >
                      <span class="dep-title">${b.title}</span>
                      <sl-badge
                        variant=${STATUS_VARIANTS[b.status] as string}
                        pill
                        size="small"
                        >${STATUS_LABELS[b.status]}</sl-badge
                      >
                      <sl-icon-button
                        class="remove-dep"
                        name="x-lg"
                        label="Remove"
                        style="font-size: 0.7rem;"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          this.dispatchEvent(
                            new CustomEvent<BlockerRemovedDetail>(
                              "blocker-removed",
                              {
                                detail: { blockerId: b.id },
                                bubbles: true,
                                composed: true,
                              },
                            ),
                          );
                        }}
                      ></sl-icon-button>
                    </div>
                  `,
                )}
              </div>
            `
          : nothing}
        ${hasBlocks
          ? html`
              <div
                style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.25rem; margin-top: ${hasBlockedBy
                  ? "0.75rem"
                  : "0"}; font-weight: 600;"
              >
                ${t("taskDetail.blocksLabel")}
              </div>
              <div class="dep-list">
                ${task.blocks.map(
                  (b) => html`
                    <div
                      class="dep-item"
                      @click=${() =>
                        this.dispatchEvent(
                          new CustomEvent("navigate-task", {
                            detail: b.id,
                            bubbles: true,
                            composed: true,
                          }),
                        )}
                    >
                      <sl-icon
                        name=${TASK_TYPE_ICONS[b.task_type]}
                        style="color: ${TASK_TYPE_COLORS[
                          b.task_type
                        ]}; font-size: 0.85rem;"
                      ></sl-icon>
                      <span
                        style="font-family: var(--sl-font-mono); opacity: 0.7; font-size: 0.8rem;"
                        >${b.ticket_id}</span
                      >
                      <span class="dep-title">${b.title}</span>
                      <sl-badge
                        variant=${STATUS_VARIANTS[b.status] as string}
                        pill
                        size="small"
                        >${STATUS_LABELS[b.status]}</sl-badge
                      >
                      <sl-icon-button
                        class="remove-dep"
                        name="x-lg"
                        label="Remove"
                        style="font-size: 0.7rem;"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          this.dispatchEvent(
                            new CustomEvent<BlocksRemovedDetail>(
                              "blocks-removed",
                              {
                                detail: { blockedId: b.id },
                                bubbles: true,
                                composed: true,
                              },
                            ),
                          );
                        }}
                      ></sl-icon-button>
                    </div>
                  `,
                )}
              </div>
            `
          : nothing}
        ${this._addingBlocker
          ? html`
              <div class="dep-add-row">
                <sl-select
                  size="small"
                  placeholder=${t("taskDetail.selectBlocker")}
                  style="flex: 1;"
                  @sl-change=${(e: Event) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val) {
                      this.dispatchEvent(
                        new CustomEvent<BlockerAddedDetail>("blocker-added", {
                          detail: { blockerId: val },
                          bubbles: true,
                          composed: true,
                        }),
                      );
                      this._addingBlocker = false;
                    }
                  }}
                >
                  ${availableTasks.map(
                    (tk) => html`
                      <sl-option value=${tk.id}
                        >${tk.ticket_id} — ${tk.title}</sl-option
                      >
                    `,
                  )}
                </sl-select>
                <sl-icon-button
                  name="x-lg"
                  label="Cancel"
                  @click=${() => {
                    this._addingBlocker = false;
                  }}
                ></sl-icon-button>
              </div>
            `
          : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-dependencies": TaskDependencies;
  }
}
