import { LitElement, html, css, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { t } from "../../lib/i18n.js";
import { formatDate, relativeTime } from "../../lib/date-utils.js";
import { getParticipantName } from "../../lib/participant-utils.js";
import { store, type SessionParticipant } from "../../state/app-state.js";
import {
  type TaskDetailView,
  type TaskStatus,
  TASK_TYPE_LABELS,
  TASK_TYPE_ICONS,
  TASK_TYPE_COLORS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  PRIORITY_LABELS,
  PRIORITY_ICONS,
  PRIORITY_COLORS,
  COMPLEXITY_LABELS,
} from "../../state/task-types.js";
import type { InvokeDialog } from "../invocations/invoke-dialog.js";

import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/menu/menu.js";
import "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/switch/switch.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "../invocations/invoke-dialog.js";

export interface FieldChangedDetail {
  fields: Record<string, unknown>;
}

/**
 * Sidebar metadata panel for task detail view.
 *
 * Properties:
 *   - task: TaskDetailView
 *   - participants: SessionParticipant[]
 *
 * Events:
 *   - field-changed: FieldChangedDetail — user edited a field
 *   - navigate-task: { detail: taskId } — user clicked provenance link
 */
@customElement("task-metadata-panel")
export class TaskMetadataPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .sidebar-heading {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0 0.5rem;
      margin-bottom: 0.25rem;
    }

    .meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.4rem 0.5rem;
      border-radius: 6px;
      font-size: 0.8rem;
      transition: background 0.15s;
      cursor: default;
    }

    .meta-row:hover {
      background: var(--surface-card-hover);
    }

    .meta-row.editable {
      cursor: pointer;
    }

    .meta-row.editable:hover .edit-pencil {
      opacity: 1;
    }

    .meta-label {
      color: var(--text-tertiary);
      font-weight: 500;
    }

    .meta-value {
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    .edit-pencil {
      opacity: 0;
      font-size: 0.7rem;
      color: var(--text-tertiary);
      transition: opacity 0.15s;
    }

    .commit-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      align-items: center;
    }

    .commit-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      font-family: var(--sl-font-mono);
      font-size: 0.7rem;
      background: var(--surface-card);
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      border: 1px solid var(--sl-color-neutral-200);
    }

    .commit-chip .remove {
      cursor: pointer;
      opacity: 0.5;
      font-size: 0.6rem;
    }

    .commit-chip .remove:hover {
      opacity: 1;
    }

    .provenance-link {
      font-size: 0.75rem;
      color: var(--sl-color-purple-400);
      cursor: pointer;
      text-decoration: none;
    }

    .provenance-link:hover {
      text-decoration: underline;
    }

    .link-action {
      font-size: 0.75rem;
      color: var(--sl-color-primary-400);
      cursor: pointer;
    }

    .link-action:hover {
      text-decoration: underline;
    }
  `;

  @property({ type: Object }) task!: TaskDetailView;
  @property({ type: Array }) participants: SessionParticipant[] = [];
  @property({ type: String, attribute: "project-id" }) projectId = "";

  @state() private _editingField: string | null = null;

  @query("invoke-dialog") private _invokeDialog!: InvokeDialog;

  private _emit(fields: Record<string, unknown>) {
    this.dispatchEvent(
      new CustomEvent<FieldChangedDetail>("field-changed", {
        detail: { fields },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _getCurrentParticipantId(): string | null {
    return store.get().sessionState?.participantId ?? null;
  }

  private _renderClaimButton(task: TaskDetailView) {
    const currentPid = this._getCurrentParticipantId();
    if (!currentPid) return nothing;

    if (!task.assigned_to) {
      return html`
        <sl-button
          size="small"
          variant="primary"
          outline
          style="width: 100%; margin-top: 0.25rem;"
          @click=${() => this._emit({ assigned_to: currentPid })}
        >
          <sl-icon slot="prefix" name="hand-index-thumb"></sl-icon>
          ${t("taskBoard.sidebar.claim")}
        </sl-button>
      `;
    }

    if (task.assigned_to === currentPid) {
      return html`
        <sl-button
          size="small"
          variant="neutral"
          outline
          style="width: 100%; margin-top: 0.25rem;"
          @click=${() => this._emit({ assigned_to: null })}
        >
          <sl-icon slot="prefix" name="x-circle"></sl-icon>
          ${t("taskBoard.sidebar.unclaim")}
        </sl-button>
      `;
    }

    return nothing;
  }

  private _handleDispatchAction(e: CustomEvent) {
    const action = (e.detail as { item: { value: string } }).item.value;
    const task = this.task;

    switch (action) {
      case "implement":
        this._invokeDialog.showWithPrompt(
          `Implement the following task: ${task.title}\n\nRead the task context in your system prompt for full details. Follow the definition of done for this task type.`,
        );
        break;
      case "plan":
        this._invokeDialog.showWithPerspective(
          "planner",
          `Explore and plan the implementation for: ${task.title}\n\nAnalyze the codebase to understand what changes are needed. Produce a concrete implementation plan with specific files, functions, and changes. If this is an epic, break it down into actionable subtasks.`,
        );
        break;
      case "review":
        this._invokeDialog.showWithPerspective(
          "reviewer",
          `Review the code related to: ${task.title}\n\nCheck for correctness, security issues, performance problems, and adherence to project conventions. Report findings as task comments.`,
        );
        break;
      case "test":
        this._invokeDialog.showWithPerspective(
          "coder",
          `Run the test suite and verify the implementation for: ${task.title}\n\nRun \`cargo test\` and \`npm test\`. Report results including any failures, coverage gaps, or missing test cases. If tests fail, investigate the root cause.`,
        );
        break;
      case "research":
        this._invokeDialog.showWithPerspective(
          "planner",
          `Research the following topic for task: ${task.title}\n\nGather information from the codebase, documentation, and existing patterns. Report findings with file locations and confidence levels.`,
        );
        break;
      case "custom":
      default:
        this._invokeDialog.show();
        break;
    }
  }

  render() {
    const task = this.task;

    return html`
      <div class="sidebar">
        <div class="sidebar-heading">${t("taskDetail.sidebar.details")}</div>

        <!-- Ticket ID (read-only) -->
        <div class="meta-row">
          <span class="meta-label">${t("taskDetail.sidebar.ticket")}</span>
          <span class="meta-value" style="font-family: var(--sl-font-mono);"
            >${task.ticket_id}</span
          >
        </div>

        <!-- Type -->
        ${this._editingField === "type"
          ? html`
              <div class="meta-row">
                <sl-select
                  size="small"
                  value=${task.task_type}
                  @sl-change=${(e: Event) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val !== task.task_type) this._emit({ task_type: val });
                    this._editingField = null;
                  }}
                  style="width: 100%;"
                >
                  ${(["epic", "story", "task", "subtask", "bug"] as const).map(
                    (tt) => html`
                      <sl-option value=${tt}>
                        <sl-icon
                          slot="prefix"
                          name=${TASK_TYPE_ICONS[tt]}
                          style="color: ${TASK_TYPE_COLORS[tt]}"
                        ></sl-icon>
                        ${TASK_TYPE_LABELS[tt]}
                      </sl-option>
                    `,
                  )}
                </sl-select>
              </div>
            `
          : html`
              <div
                class="meta-row editable"
                @click=${() => {
                  this._editingField = "type";
                }}
              >
                <span class="meta-label">${t("taskDetail.sidebar.type")}</span>
                <span class="meta-value">
                  <sl-icon
                    name=${TASK_TYPE_ICONS[task.task_type]}
                    style="color: ${TASK_TYPE_COLORS[
                      task.task_type
                    ]}; font-size: 0.85rem;"
                  ></sl-icon>
                  ${TASK_TYPE_LABELS[task.task_type]}
                  <sl-icon class="edit-pencil" name="pencil"></sl-icon>
                </span>
              </div>
            `}

        <!-- Status -->
        ${this._editingField === "status"
          ? html`
              <div class="meta-row">
                <sl-select
                  size="small"
                  value=${task.status}
                  @sl-change=${(e: Event) => {
                    this._emit({
                      status: (e.target as HTMLSelectElement).value,
                    });
                    this._editingField = null;
                  }}
                  style="width: 100%;"
                >
                  ${(
                    ["open", "in_progress", "done", "closed"] as TaskStatus[]
                  ).map(
                    (s) => html`
                      <sl-option value=${s}>${STATUS_LABELS[s]}</sl-option>
                    `,
                  )}
                </sl-select>
              </div>
            `
          : html`
              <div
                class="meta-row editable"
                @click=${() => {
                  this._editingField = "status";
                }}
              >
                <span class="meta-label"
                  >${t("taskDetail.sidebar.status")}</span
                >
                <span class="meta-value">
                  <sl-badge
                    variant=${STATUS_VARIANTS[task.status] as string}
                    pill
                    size="small"
                    >${STATUS_LABELS[task.status]}</sl-badge
                  >
                  <sl-icon class="edit-pencil" name="pencil"></sl-icon>
                </span>
              </div>
            `}

        <!-- Priority -->
        ${this._editingField === "priority"
          ? html`
              <div class="meta-row">
                <sl-select
                  size="small"
                  value=${task.priority}
                  @sl-change=${(e: Event) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val !== task.priority) this._emit({ priority: val });
                    this._editingField = null;
                  }}
                  style="width: 100%;"
                >
                  ${(["critical", "high", "medium", "low"] as const).map(
                    (p) => html`
                      <sl-option value=${p}>
                        <sl-icon
                          slot="prefix"
                          name=${PRIORITY_ICONS[p]}
                          style="color: ${PRIORITY_COLORS[p]}"
                        ></sl-icon>
                        ${PRIORITY_LABELS[p]}
                      </sl-option>
                    `,
                  )}
                </sl-select>
              </div>
            `
          : html`
              <div
                class="meta-row editable"
                @click=${() => {
                  this._editingField = "priority";
                }}
              >
                <span class="meta-label"
                  >${t("taskDetail.sidebar.priority")}</span
                >
                <span class="meta-value">
                  <sl-icon
                    name=${PRIORITY_ICONS[task.priority]}
                    style="color: ${PRIORITY_COLORS[
                      task.priority
                    ]}; font-size: 0.85rem;"
                  ></sl-icon>
                  ${PRIORITY_LABELS[task.priority]}
                  <sl-icon class="edit-pencil" name="pencil"></sl-icon>
                </span>
              </div>
            `}

        <!-- Complexity -->
        ${this._editingField === "complexity"
          ? html`
              <div class="meta-row">
                <sl-select
                  size="small"
                  value=${task.complexity}
                  @sl-change=${(e: Event) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val !== task.complexity)
                      this._emit({ complexity: val });
                    this._editingField = null;
                  }}
                  style="width: 100%;"
                >
                  ${(
                    ["xl", "large", "medium", "small", "trivial"] as const
                  ).map(
                    (c) => html`
                      <sl-option value=${c}>${COMPLEXITY_LABELS[c]}</sl-option>
                    `,
                  )}
                </sl-select>
              </div>
            `
          : html`
              <div
                class="meta-row editable"
                @click=${() => {
                  this._editingField = "complexity";
                }}
              >
                <span class="meta-label"
                  >${t("taskDetail.sidebar.complexity")}</span
                >
                <span class="meta-value">
                  ${COMPLEXITY_LABELS[task.complexity]}
                  <sl-icon class="edit-pencil" name="pencil"></sl-icon>
                </span>
              </div>
            `}

        <!-- Assignee -->
        ${this._editingField === "assignee"
          ? html`
              <div class="meta-row">
                <sl-select
                  size="small"
                  value=${task.assigned_to ?? ""}
                  placeholder=${t("taskDetail.sidebar.unassigned")}
                  clearable
                  @sl-change=${(e: Event) => {
                    const val = (e.target as HTMLSelectElement).value;
                    this._emit({ assigned_to: val || null });
                    this._editingField = null;
                  }}
                  style="width: 100%;"
                >
                  ${this.participants.map(
                    (p) => html`
                      <sl-option value=${p.id}>
                        <sl-icon
                          slot="prefix"
                          name=${p.participant_type === "agent"
                            ? "robot"
                            : "person-fill"}
                        ></sl-icon>
                        ${p.display_name}
                      </sl-option>
                    `,
                  )}
                </sl-select>
              </div>
            `
          : html`
              <div
                class="meta-row editable"
                @click=${() => {
                  this._editingField = "assignee";
                }}
              >
                <span class="meta-label"
                  >${t("taskDetail.sidebar.assignee")}</span
                >
                <span class="meta-value">
                  ${task.assigned_to
                    ? html`
                        <sl-icon
                          name=${this.participants.find(
                            (p) => p.id === task.assigned_to,
                          )?.participant_type === "agent"
                            ? "robot"
                            : "person-fill"}
                          style="font-size: 0.8rem;"
                        ></sl-icon>
                        ${getParticipantName(
                          task.assigned_to,
                          this.participants,
                        )}
                      `
                    : html`
                        <span style="color: var(--text-tertiary);"
                          >${t("taskDetail.sidebar.unassigned")}</span
                        >
                      `}
                  <sl-icon class="edit-pencil" name="pencil"></sl-icon>
                </span>
              </div>
              ${this._renderClaimButton(task)}
            `}

        <sl-divider style="--spacing: 0.25rem;"></sl-divider>

        <!-- Creator (read-only) -->
        <div class="meta-row">
          <span class="meta-label">${t("taskDetail.sidebar.creator")}</span>
          <span class="meta-value"
            >${getParticipantName(task.created_by, this.participants)}</span
          >
        </div>

        <!-- Created -->
        <div class="meta-row">
          <span class="meta-label">${t("taskDetail.sidebar.created")}</span>
          <span class="meta-value">
            <sl-tooltip content=${formatDate(task.created_at)}>
              <span>${relativeTime(task.created_at)}</span>
            </sl-tooltip>
          </span>
        </div>

        <!-- Updated -->
        ${task.updated_at !== task.created_at
          ? html`
              <div class="meta-row">
                <span class="meta-label"
                  >${t("taskDetail.sidebar.updated")}</span
                >
                <span class="meta-value">
                  <sl-tooltip content=${formatDate(task.updated_at)}>
                    <span>${relativeTime(task.updated_at)}</span>
                  </sl-tooltip>
                </span>
              </div>
            `
          : nothing}

        <!-- Closed -->
        ${task.closed_at
          ? html`
              <div class="meta-row">
                <span class="meta-label"
                  >${t("taskDetail.sidebar.closed")}</span
                >
                <span class="meta-value">
                  <sl-tooltip content=${formatDate(task.closed_at)}>
                    <span>${relativeTime(task.closed_at)}</span>
                  </sl-tooltip>
                </span>
              </div>
            `
          : nothing}

        <sl-divider style="--spacing: 0.25rem;"></sl-divider>

        <!-- Commits -->
        <div
          class="meta-row"
          style="flex-direction: column; align-items: flex-start; gap: 0.25rem;"
        >
          <span class="meta-label">${t("taskDetail.sidebar.commits")}</span>
          ${task.commit_hashes.length > 0
            ? html`
                <div class="commit-chips">
                  ${task.commit_hashes.map(
                    (sha: string) => html`
                      <span class="commit-chip">
                        ${sha.substring(0, 8)}
                        <span
                          class="remove"
                          @click=${() => {
                            const hashes = task.commit_hashes.filter(
                              (h: string) => h !== sha,
                            );
                            this._emit({ commit_hashes: hashes });
                          }}
                          >x</span
                        >
                      </span>
                    `,
                  )}
                </div>
              `
            : nothing}
          ${this._editingField === "commit"
            ? html`
                <sl-input
                  size="small"
                  placeholder=${t("taskDetail.sidebar.commitPlaceholder")}
                  style="width: 100%; font-family: var(--sl-font-mono); font-size: 0.75rem;"
                  @sl-change=${(e: Event) => {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      const hashes = [...task.commit_hashes, val];
                      this._emit({ commit_hashes: hashes });
                    }
                    this._editingField = null;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Escape") this._editingField = null;
                  }}
                ></sl-input>
              `
            : html`
                <span
                  class="link-action"
                  @click=${() => {
                    this._editingField = "commit";
                  }}
                  >${t("taskDetail.sidebar.addCommit")}</span
                >
              `}
        </div>

        <!-- No Code Change -->
        <div class="meta-row">
          <span class="meta-label"
            >${t("taskDetail.sidebar.noCodeChange")}</span
          >
          <sl-switch
            size="small"
            ?checked=${task.no_code_change}
            @sl-change=${(e: Event) => {
              this._emit({
                no_code_change: (e.target as HTMLInputElement).checked,
              });
            }}
          ></sl-switch>
        </div>

        <!-- Source (provenance) -->
        ${task.source_task_id
          ? html`
              <div class="meta-row">
                <span class="meta-label"
                  >${t("taskDetail.sidebar.derivedFrom")}</span
                >
                <span class="meta-value">
                  <a
                    class="provenance-link"
                    @click=${() =>
                      this.dispatchEvent(
                        new CustomEvent("navigate-task", {
                          detail: task.source_task_id,
                          bubbles: true,
                          composed: true,
                        }),
                      )}
                  >
                    <sl-icon
                      name="arrow-return-left"
                      style="font-size: 0.7rem;"
                    ></sl-icon>
                    ${t("taskDetail.sidebar.sourceTask")}
                  </a>
                </span>
              </div>
            `
          : nothing}

        <sl-divider style="--spacing: 0.25rem;"></sl-divider>

        <!-- Model Config -->
        <div class="sidebar-heading">${t("dispatch.modelConfig")}</div>

        <!-- Model Hint -->
        ${this._editingField === "model_hint"
          ? html`
              <div class="meta-row">
                <sl-input
                  size="small"
                  placeholder="e.g. claude-opus-4-5"
                  value=${task.model_hint ?? ""}
                  style="width: 100%; font-family: var(--sl-font-mono); font-size: 0.75rem;"
                  @sl-change=${(e: Event) => {
                    const val = (e.target as HTMLInputElement).value.trim();
                    this._emit({ model_hint: val || null });
                    this._editingField = null;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Escape") this._editingField = null;
                  }}
                ></sl-input>
              </div>
            `
          : html`
              <div
                class="meta-row editable"
                @click=${() => {
                  this._editingField = "model_hint";
                }}
              >
                <span class="meta-label">${t("dispatch.field.model")}</span>
                <span class="meta-value">
                  ${task.model_hint
                    ? html`<span
                        style="font-family: var(--sl-font-mono); font-size: 0.75rem;"
                        >${task.model_hint}</span
                      >`
                    : html`<span style="color: var(--text-tertiary);"
                        >${t("dispatch.field.default")}</span
                      >`}
                  <sl-icon class="edit-pencil" name="pencil"></sl-icon>
                </span>
              </div>
            `}

        <!-- Budget Tier -->
        ${this._editingField === "budget_tier"
          ? html`
              <div class="meta-row">
                <sl-select
                  size="small"
                  value=${task.budget_tier ?? ""}
                  @sl-change=${(e: Event) => {
                    const val = (e.target as HTMLSelectElement).value;
                    this._emit({ budget_tier: val || null });
                    this._editingField = null;
                  }}
                  style="width: 100%;"
                >
                  <sl-option value="">${t("dispatch.field.default")}</sl-option>
                  <sl-option value="high"
                    >${t("dispatch.budget.high")}</sl-option
                  >
                  <sl-option value="medium"
                    >${t("dispatch.budget.medium")}</sl-option
                  >
                  <sl-option value="low">${t("dispatch.budget.low")}</sl-option>
                </sl-select>
              </div>
            `
          : html`
              <div
                class="meta-row editable"
                @click=${() => {
                  this._editingField = "budget_tier";
                }}
              >
                <span class="meta-label">${t("dispatch.field.budget")}</span>
                <span class="meta-value">
                  ${task.budget_tier
                    ? html`<span>${task.budget_tier}</span>`
                    : html`<span style="color: var(--text-tertiary);"
                        >${t("dispatch.field.default")}</span
                      >`}
                  <sl-icon class="edit-pencil" name="pencil"></sl-icon>
                </span>
              </div>
            `}

        <!-- Provider -->
        ${this._editingField === "provider"
          ? html`
              <div class="meta-row">
                <sl-input
                  size="small"
                  placeholder="e.g. anthropic"
                  value=${task.provider ?? ""}
                  style="width: 100%;"
                  @sl-change=${(e: Event) => {
                    const val = (e.target as HTMLInputElement).value.trim();
                    this._emit({ provider: val || null });
                    this._editingField = null;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Escape") this._editingField = null;
                  }}
                ></sl-input>
              </div>
            `
          : html`
              <div
                class="meta-row editable"
                @click=${() => {
                  this._editingField = "provider";
                }}
              >
                <span class="meta-label">${t("dispatch.field.provider")}</span>
                <span class="meta-value">
                  ${task.provider
                    ? html`<span>${task.provider}</span>`
                    : html`<span style="color: var(--text-tertiary);"
                        >${t("dispatch.field.default")}</span
                      >`}
                  <sl-icon class="edit-pencil" name="pencil"></sl-icon>
                </span>
              </div>
            `}
        ${this.projectId &&
        (task.status === "open" || task.status === "in_progress")
          ? html`
              <sl-divider style="--spacing: 0.25rem;"></sl-divider>
              <sl-dropdown style="width: 100%; margin-top: 0.5rem;">
                <sl-button
                  slot="trigger"
                  caret
                  variant="primary"
                  size="small"
                  outline
                  style="width: 100%;"
                  aria-label=${t("dispatch.button")}
                  aria-haspopup="menu"
                >
                  <sl-icon slot="prefix" name="robot"></sl-icon>
                  ${t("dispatch.button")}
                </sl-button>
                <sl-menu
                  @sl-select=${(e: CustomEvent) =>
                    this._handleDispatchAction(e)}
                >
                  <sl-menu-item value="implement">
                    <sl-icon slot="prefix" name="code-slash"></sl-icon>
                    ${t("dispatch.action.implement")}
                  </sl-menu-item>
                  <sl-menu-item value="plan">
                    <sl-icon slot="prefix" name="diagram-3"></sl-icon>
                    ${t("dispatch.action.plan")}
                  </sl-menu-item>
                  <sl-menu-item value="review">
                    <sl-icon slot="prefix" name="search"></sl-icon>
                    ${t("dispatch.action.review")}
                  </sl-menu-item>
                  <sl-menu-item value="test">
                    <sl-icon slot="prefix" name="check2-circle"></sl-icon>
                    ${t("dispatch.action.test")}
                  </sl-menu-item>
                  <sl-menu-item value="research">
                    <sl-icon slot="prefix" name="book"></sl-icon>
                    ${t("dispatch.action.research")}
                  </sl-menu-item>
                  <sl-divider></sl-divider>
                  <sl-menu-item value="custom">
                    <sl-icon slot="prefix" name="gear"></sl-icon>
                    ${t("dispatch.action.custom")}
                  </sl-menu-item>
                </sl-menu>
              </sl-dropdown>
            `
          : nothing}

        <invoke-dialog
          project-id=${this.projectId}
          task-id=${this.task.id}
        ></invoke-dialog>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-metadata-panel": TaskMetadataPanel;
  }
}
