import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { store } from '../../state/app-state.js';
import { fetchNotes, upsertNote, type NoteView } from '../../state/task-api.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';

@customElement('notes-panel')
export class NotesPanel extends LitElement {
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

    .note-tabs {
      display: flex;
      gap: 0.25rem;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }

    .note-tab {
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-tertiary);
      background: transparent;
      border: 1px solid transparent;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .note-tab:hover {
      color: var(--text-secondary);
    }

    .note-tab.active {
      color: var(--text-primary);
      background: var(--surface-active, rgba(255,255,255,0.08));
      border-color: var(--border-color);
    }

    .note-tab.add {
      color: var(--sl-color-primary-400);
      font-weight: 600;
    }

    .note-content {
      background: var(--surface-3, rgba(255,255,255,0.04));
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 0.75rem;
      min-height: 80px;
    }

    .note-display {
      font-size: 0.8rem;
      color: var(--text-secondary);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      cursor: pointer;
    }

    .note-display:hover {
      color: var(--text-primary);
    }

    .note-display:empty::before {
      content: 'Click to add notes...';
      color: var(--text-tertiary);
      font-style: italic;
    }

    .note-editor {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .editor-actions {
      display: flex;
      gap: 0.4rem;
    }

    .note-meta {
      font-size: 0.65rem;
      color: var(--text-tertiary);
      margin-top: 0.4rem;
    }

    .empty-state {
      font-size: 0.8rem;
      color: var(--text-tertiary);
      text-align: center;
      padding: 1rem 0;
    }
  `;

  @property({ attribute: 'session-code' }) sessionCode = '';
  @state() private _notes: NoteView[] = [];
  @state() private _activeSlug: string | null = null;
  @state() private _editing = false;
  @state() private _editContent = '';
  @state() private _saving = false;

  private _unsub: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._unsub = store.subscribe((event) => {
      if (event.type === 'notes-changed') {
        this._loadNotes();
      }
    });
    this._loadNotes();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
  }

  private async _loadNotes() {
    if (!this.sessionCode) return;
    try {
      this._notes = await fetchNotes(this.sessionCode);
      if (this._notes.length > 0 && !this._activeSlug) {
        this._activeSlug = this._notes[0].slug;
      }
    } catch {
      // silent
    }
  }

  private _selectNote(slug: string) {
    this._activeSlug = slug;
    this._editing = false;
  }

  private _startEditing() {
    const note = this._notes.find(n => n.slug === this._activeSlug);
    this._editContent = note?.content ?? '';
    this._editing = true;
  }

  private _cancelEditing() {
    this._editing = false;
  }

  private async _save() {
    if (!this._activeSlug || this._saving) return;
    this._saving = true;
    try {
      await upsertNote(this.sessionCode, this._activeSlug, this._editContent);
      this._editing = false;
      await this._loadNotes();
    } catch {
      // silent
    } finally {
      this._saving = false;
    }
  }

  private async _createNote() {
    const slug = `note-${Date.now()}`;
    try {
      await upsertNote(this.sessionCode, slug, '', 'New Note');
      this._activeSlug = slug;
      this._editing = true;
      this._editContent = '';
      await this._loadNotes();
    } catch {
      // silent
    }
  }

  render() {
    const activeNote = this._notes.find(n => n.slug === this._activeSlug);

    return html`
      <div class="section-label">
        <sl-icon name="journal-text"></sl-icon>
        Notes
        ${this._notes.length > 0 ? html`
          <sl-badge variant="neutral" pill>${this._notes.length}</sl-badge>
        ` : nothing}
      </div>

      <div class="note-tabs">
        ${this._notes.map(n => html`
          <button class="note-tab ${n.slug === this._activeSlug ? 'active' : ''}"
                  @click=${() => this._selectNote(n.slug)}>
            ${n.title}
          </button>
        `)}
        <button class="note-tab add" @click=${this._createNote}>+</button>
      </div>

      ${activeNote ? html`
        <div class="note-content">
          ${this._editing ? html`
            <div class="note-editor">
              <sl-textarea
                rows="6"
                size="small"
                .value=${this._editContent}
                @sl-input=${(e: Event) => this._editContent = (e.target as HTMLTextAreaElement).value}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    this._save();
                  }
                  if (e.key === 'Escape') {
                    this._cancelEditing();
                  }
                }}
              ></sl-textarea>
              <div class="editor-actions">
                <sl-button size="small" variant="primary" ?loading=${this._saving}
                           @click=${this._save}>Save</sl-button>
                <sl-button size="small" variant="text" @click=${this._cancelEditing}>Cancel</sl-button>
              </div>
            </div>
          ` : html`
            <div class="note-display" @click=${this._startEditing}>
              ${activeNote.content || ''}
            </div>
          `}
          ${activeNote.updated_by_name ? html`
            <div class="note-meta">
              Last edited by ${activeNote.updated_by_name} · ${this._relativeTime(activeNote.updated_at)}
            </div>
          ` : nothing}
        </div>
      ` : html`
        <div class="empty-state">No notes yet. Click + to create one.</div>
      `}
    `;
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
}

declare global {
  interface HTMLElementTagNameMap {
    'notes-panel': NotesPanel;
  }
}
