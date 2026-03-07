import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { t } from "../../lib/i18n.js";
import { formatDate, relativeTime } from "../../lib/date-utils.js";
import { getParticipantName } from "../../lib/participant-utils.js";
import type { SessionParticipant } from "../../state/app-state.js";
import type { CommentView } from "../../state/task-types.js";
import type { ActivityEvent } from "../../state/task-api.js";
import "../shared/markdown-content.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";

export interface CommentAddedDetail {
  text: string;
}

/**
 * Comment thread with unified activity timeline.
 *
 * Properties:
 *   - comments: CommentView[] from task
 *   - activity: ActivityEvent[] from fetchActivity
 *   - participants: for resolving author display names
 *
 * Events:
 *   - comment-added: CommentAddedDetail — user submitted a comment
 */
@customElement("task-comment-thread")
export class TaskCommentThread extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .comments-section {
      margin-bottom: 1rem;
    }

    .section-heading {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .comment-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .comment {
      padding: 0.75rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
    }

    .comment-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.35rem;
    }

    .comment-author {
      font-weight: 600;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .comment-time {
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }

    .comment-content {
      color: var(--text-primary);
      font-size: 0.875rem;
      line-height: 1.5;
    }

    /* ── Collapsed comment input ── */
    .comment-input-collapsed {
      padding: 0.5rem 0.75rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      color: var(--text-tertiary);
      font-size: 0.85rem;
      cursor: text;
      transition: border-color 0.15s;
    }

    .comment-input-collapsed:hover {
      border-color: var(--border-medium);
      color: var(--text-secondary);
    }

    .add-comment {
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
    }

    .add-comment sl-textarea {
      flex: 1;
    }

    /* ── Activity events ── */
    .activity-event {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      color: var(--text-tertiary);
    }

    .activity-event sl-icon {
      font-size: 0.75rem;
      margin-top: 0.15rem;
      flex-shrink: 0;
    }

    .activity-summary {
      flex: 1;
      line-height: 1.4;
    }

    .activity-actor {
      color: var(--text-secondary);
      font-weight: 500;
    }

    .activity-time {
      font-size: 0.7rem;
      white-space: nowrap;
      flex-shrink: 0;
    }
  `;

  @property({ type: Array }) comments: CommentView[] = [];
  @property({ type: Array }) activity: ActivityEvent[] = [];
  @property({ type: Array }) participants: SessionParticipant[] = [];

  @state() private _newComment = "";
  @state() private _submittingComment = false;
  @state() private _expanded = false;

  private _activityIcon(eventType: string): string {
    switch (eventType) {
      case "task_created":
        return "plus-circle";
      case "task_status_changed":
        return "arrow-right-circle";
      case "task_assigned":
        return "person-check";
      case "task_unassigned":
        return "person-dash";
      case "task_updated":
        return "pencil-square";
      case "task_closed":
        return "check-circle";
      case "task_deleted":
        return "trash";
      case "comment_added":
        return "chat-dots";
      case "dependency_added":
        return "link-45deg";
      case "dependency_removed":
        return "link-45deg";
      default:
        return "clock-history";
    }
  }

  private async _handleAddComment() {
    const text = this._newComment.trim();
    if (!text || this._submittingComment) return;
    this._submittingComment = true;
    try {
      this.dispatchEvent(
        new CustomEvent<CommentAddedDetail>("comment-added", {
          detail: { text },
          bubbles: true,
          composed: true,
        }),
      );
      this._newComment = "";
      this._expanded = false;
    } finally {
      this._submittingComment = false;
    }
  }

  render() {
    type TimelineItem =
      | { kind: "comment"; created_at: string; data: CommentView }
      | { kind: "activity"; created_at: string; data: ActivityEvent };

    const items: TimelineItem[] = [
      ...this.comments.map((c) => ({
        kind: "comment" as const,
        created_at: c.created_at,
        data: c,
      })),
      ...this.activity
        .filter((a) => a.event_type !== "comment_added")
        .map((a) => ({
          kind: "activity" as const,
          created_at: a.created_at,
          data: a,
        })),
    ];
    items.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    return html`
      <div class="comments-section">
        <div class="section-heading">
          ${t("taskDetail.activityCount", { count: items.length })}
        </div>

        ${items.length > 0
          ? html`
              <div class="comment-list">
                ${items.map((item) =>
                  item.kind === "comment"
                    ? html`
                        <div class="comment">
                          <div class="comment-header">
                            <span class="comment-author"
                              >${getParticipantName(
                                item.data.author_id,
                                this.participants,
                              )}</span
                            >
                            <sl-tooltip content=${formatDate(item.created_at)}>
                              <span class="comment-time"
                                >${relativeTime(item.created_at)}</span
                              >
                            </sl-tooltip>
                          </div>
                          <div class="comment-content">
                            <markdown-content
                              .content=${item.data.content}
                            ></markdown-content>
                          </div>
                        </div>
                      `
                    : html`
                        <div class="activity-event">
                          <sl-icon
                            name=${this._activityIcon(item.data.event_type)}
                          ></sl-icon>
                          <span class="activity-summary">
                            <span class="activity-actor"
                              >${item.data.actor_name}</span
                            >
                            ${item.data.summary}
                          </span>
                          <sl-tooltip content=${formatDate(item.created_at)}>
                            <span class="activity-time"
                              >${relativeTime(item.created_at)}</span
                            >
                          </sl-tooltip>
                        </div>
                      `,
                )}
              </div>
            `
          : nothing}
        ${this._expanded
          ? html`
              <div class="add-comment">
                <sl-textarea
                  placeholder=${t("taskDetail.commentPlaceholder")}
                  value=${this._newComment}
                  @sl-input=${(e: Event) => {
                    this._newComment = (e.target as HTMLTextAreaElement).value;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (
                      e.key === "Enter" &&
                      (e.ctrlKey || e.metaKey) &&
                      this._newComment.trim()
                    ) {
                      e.preventDefault();
                      void this._handleAddComment();
                    }
                    if (e.key === "Escape" && !this._newComment.trim()) {
                      this._expanded = false;
                    }
                  }}
                  rows="2"
                  resize="auto"
                ></sl-textarea>
                <sl-button
                  variant="primary"
                  size="small"
                  ?loading=${this._submittingComment}
                  ?disabled=${!this._newComment.trim()}
                  @click=${() => void this._handleAddComment()}
                >
                  <sl-icon slot="prefix" name="send"></sl-icon>
                  ${t("taskDetail.commentSend")}
                </sl-button>
              </div>
            `
          : html`
              <div
                class="comment-input-collapsed"
                @click=${() => {
                  this._expanded = true;
                  this.updateComplete.then(() => {
                    const ta = this.shadowRoot?.querySelector(
                      ".add-comment sl-textarea",
                    ) as HTMLElement | null;
                    ta?.focus();
                  });
                }}
              >
                ${t("taskDetail.commentPlaceholderShort")}
              </div>
            `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-comment-thread": TaskCommentThread;
  }
}
