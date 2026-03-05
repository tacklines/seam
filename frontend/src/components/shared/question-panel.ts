import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { store } from '../../state/app-state.js';
import { fetchQuestions, answerQuestion, cancelQuestion, type QuestionView } from '../../state/task-api.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';

@customElement('question-panel')
export class QuestionPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .section-label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .question-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .question-card {
      background: var(--surface-3, rgba(255,255,255,0.04));
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 0.75rem;
      transition: border-color 0.15s ease;
    }

    .question-card.pending {
      border-left: 3px solid var(--sl-color-warning-500);
    }

    .question-card.answered {
      border-left: 3px solid var(--sl-color-success-500);
      opacity: 0.7;
    }

    .question-card.cancelled {
      border-left: 3px solid var(--text-tertiary);
      opacity: 0.5;
    }

    .question-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.4rem;
    }

    .asker-name {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--sl-color-primary-400);
    }

    .question-time {
      font-size: 0.65rem;
      color: var(--text-tertiary);
      margin-left: auto;
    }

    .question-text {
      font-size: 0.85rem;
      color: var(--text-primary);
      line-height: 1.5;
      margin-bottom: 0.5rem;
      word-break: break-word;
    }

    .answer-form {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .answer-actions {
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }

    .answer-block {
      margin-top: 0.4rem;
      padding: 0.5rem;
      background: var(--surface-2, rgba(255,255,255,0.02));
      border-radius: 4px;
    }

    .answer-label {
      font-size: 0.7rem;
      color: var(--text-tertiary);
      margin-bottom: 0.2rem;
    }

    .answer-text {
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .empty-state {
      font-size: 0.8rem;
      color: var(--text-tertiary);
      text-align: center;
      padding: 1rem 0;
    }

    .status-tabs {
      display: flex;
      gap: 0.25rem;
      margin-bottom: 0.5rem;
    }

    .status-tab {
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-tertiary);
      background: transparent;
      border: 1px solid transparent;
      transition: all 0.15s;
    }

    .status-tab:hover {
      color: var(--text-secondary);
    }

    .status-tab.active {
      color: var(--text-primary);
      background: var(--surface-active, rgba(255,255,255,0.08));
      border-color: var(--border-color);
    }
  `;

  @property({ attribute: 'session-code' }) sessionCode = '';
  @state() private _questions: QuestionView[] = [];
  @state() private _statusFilter: 'pending' | 'all' = 'pending';
  @state() private _answeringId: string | null = null;
  @state() private _answerText = '';
  @state() private _submitting = false;

  private _unsub: (() => void) | null = null;
  private _refreshInterval: ReturnType<typeof setInterval> | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._unsub = store.subscribe((event) => {
      if (event.type === 'questions-changed') {
        this._loadQuestions();
      }
    });
    this._loadQuestions();
    this._refreshInterval = setInterval(() => this._loadQuestions(), 15000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    if (this._refreshInterval) clearInterval(this._refreshInterval);
  }

  private async _loadQuestions() {
    if (!this.sessionCode) return;
    try {
      this._questions = await fetchQuestions(this.sessionCode, this._statusFilter);
    } catch {
      // silent
    }
  }

  private _setFilter(filter: 'pending' | 'all') {
    this._statusFilter = filter;
    this._loadQuestions();
  }

  private _startAnswering(id: string) {
    this._answeringId = id;
    this._answerText = '';
  }

  private _cancelAnswering() {
    this._answeringId = null;
    this._answerText = '';
  }

  private async _submitAnswer(questionId: string) {
    if (!this._answerText.trim() || this._submitting) return;
    this._submitting = true;
    try {
      await answerQuestion(this.sessionCode, questionId, this._answerText.trim());
      this._answeringId = null;
      this._answerText = '';
      await this._loadQuestions();
    } catch {
      // silent
    } finally {
      this._submitting = false;
    }
  }

  private async _dismissQuestion(questionId: string) {
    try {
      await cancelQuestion(this.sessionCode, questionId);
      await this._loadQuestions();
    } catch {
      // silent
    }
  }

  private _relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  get pendingCount(): number {
    return this._questions.filter(q => q.status === 'pending').length;
  }

  render() {
    const pendingCount = this._statusFilter === 'pending'
      ? this._questions.length
      : this._questions.filter(q => q.status === 'pending').length;

    return html`
      <div class="section-label">
        <sl-icon name="question-circle"></sl-icon>
        Questions
        ${pendingCount > 0 ? html`
          <sl-badge variant="warning" pill>${pendingCount}</sl-badge>
        ` : nothing}
      </div>

      <div class="status-tabs">
        <button class="status-tab ${this._statusFilter === 'pending' ? 'active' : ''}"
                @click=${() => this._setFilter('pending')}>Pending</button>
        <button class="status-tab ${this._statusFilter === 'all' ? 'active' : ''}"
                @click=${() => this._setFilter('all')}>All</button>
      </div>

      <div class="question-list">
        ${this._questions.length === 0
          ? html`<div class="empty-state">No ${this._statusFilter} questions</div>`
          : this._questions.map(q => this._renderQuestion(q))
        }
      </div>
    `;
  }

  private _renderQuestion(q: QuestionView) {
    const isAnswering = this._answeringId === q.id;

    return html`
      <div class="question-card ${q.status}">
        <div class="question-header">
          <sl-icon name="robot" style="font-size: 0.8rem; color: var(--sl-color-primary-400);"></sl-icon>
          <span class="asker-name">${q.asked_by_name}</span>
          <span class="question-time">${this._relativeTime(q.created_at)}</span>
        </div>
        <div class="question-text">${q.question_text}</div>

        ${q.status === 'pending' ? html`
          ${isAnswering ? html`
            <div class="answer-form">
              <sl-textarea
                placeholder="Type your answer..."
                rows="2"
                size="small"
                .value=${this._answerText}
                @sl-input=${(e: Event) => this._answerText = (e.target as HTMLTextAreaElement).value}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    this._submitAnswer(q.id);
                  }
                }}
              ></sl-textarea>
              <div class="answer-actions">
                <sl-button size="small" variant="primary" ?loading=${this._submitting}
                           @click=${() => this._submitAnswer(q.id)}>
                  <sl-icon slot="prefix" name="send"></sl-icon>
                  Answer
                </sl-button>
                <sl-button size="small" variant="text" @click=${this._cancelAnswering}>Cancel</sl-button>
                <sl-button size="small" variant="text" style="margin-left: auto; color: var(--text-tertiary);"
                           @click=${() => this._dismissQuestion(q.id)}>Dismiss</sl-button>
              </div>
            </div>
          ` : html`
            <div class="answer-actions">
              <sl-button size="small" variant="primary" outline @click=${() => this._startAnswering(q.id)}>
                <sl-icon slot="prefix" name="chat-dots"></sl-icon>
                Answer
              </sl-button>
              <sl-button size="small" variant="text" style="color: var(--text-tertiary);"
                         @click=${() => this._dismissQuestion(q.id)}>Dismiss</sl-button>
            </div>
          `}
        ` : nothing}

        ${q.status === 'answered' && q.answer_text ? html`
          <div class="answer-block">
            <div class="answer-label">
              Answered by ${q.answered_by_name ?? 'Unknown'}
              ${q.answered_at ? ` · ${this._relativeTime(q.answered_at)}` : ''}
            </div>
            <div class="answer-text">${q.answer_text}</div>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'question-panel': QuestionPanel;
  }
}
