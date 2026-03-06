import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { agentStream, type AgentStreamEvent, type AgentStreamListener } from '../../state/agent-stream.js';
import { authStore } from '../../state/auth-state.js';

import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';
import '@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js';

interface ToolEvent {
  kind: 'tool';
  id: string;
  tool_name: string;
  is_error: boolean;
  duration_ms: number;
  ts: string;
}

interface OutputLine {
  kind: 'output';
  line: string;
  fd: string;
  ts: string;
}

interface StateEvent {
  kind: 'state';
  to: string;
  detail: string;
  ts: string;
}

type ActivityEntry = ToolEvent | OutputLine | StateEvent;

const MAX_ENTRIES = 500;
const MAX_OUTPUT_LINES = 1000;

@customElement('agent-activity-panel')
export class AgentActivityPanel extends LitElement {
  static styles = css`
    :host { display: block; }

    .panel-container {
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
      overflow: hidden;
    }

    sl-tab-group {
      --indicator-color: var(--sl-color-primary-500);
    }

    sl-tab-group::part(base) {
      border-bottom: 1px solid var(--border-subtle);
    }

    .tab-content {
      max-height: 400px;
      overflow-y: auto;
      font-size: 0.8rem;
    }

    /* --- All stream (interleaved) --- */
    .entry {
      display: flex;
      gap: 0.5rem;
      padding: 0.3rem 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
      align-items: baseline;
    }
    .entry:last-child { border-bottom: none; }

    .entry-ts {
      font-size: 0.7rem;
      color: var(--text-tertiary);
      min-width: 5rem;
      flex-shrink: 0;
      font-family: var(--sl-font-mono);
    }

    .entry-kind {
      font-size: 0.65rem;
      text-transform: uppercase;
      font-weight: 700;
      min-width: 3.5rem;
      flex-shrink: 0;
    }
    .entry-kind.tool { color: var(--sl-color-primary-400); }
    .entry-kind.output { color: var(--sl-color-neutral-400); }
    .entry-kind.state { color: var(--sl-color-warning-400); }

    .entry-detail {
      flex: 1;
      color: var(--text-primary);
      font-family: var(--sl-font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .entry-detail.error { color: var(--sl-color-danger-400); }

    .tool-duration {
      font-size: 0.7rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    /* --- Output tab (terminal-like) --- */
    .output-container {
      background: #0d1117;
      color: #c9d1d9;
      padding: 0.5rem 0.75rem;
      font-family: var(--sl-font-mono);
      font-size: 0.78rem;
      line-height: 1.5;
      max-height: 400px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .output-line { display: block; }
    .output-line.stderr { color: #f85149; }

    /* --- Tool list tab --- */
    .tool-item {
      display: flex;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
      align-items: center;
    }
    .tool-item:last-child { border-bottom: none; }

    .tool-name {
      font-family: var(--sl-font-mono);
      font-weight: 600;
      color: var(--text-primary);
      flex: 1;
    }

    .tool-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }

    .empty-state {
      padding: 2rem;
      text-align: center;
      color: var(--text-tertiary);
      font-style: italic;
    }

    .live-indicator {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.7rem;
      color: var(--sl-color-success-500);
      padding: 0 0.75rem 0.5rem;
    }

    .live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--sl-color-success-500);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `;

  @property() sessionCode = '';
  @property() participantId = '';
  @property() workspaceId = '';

  @state() private _allEntries: ActivityEntry[] = [];
  @state() private _outputLines: OutputLine[] = [];
  @state() private _toolEvents: ToolEvent[] = [];
  @state() private _connected = false;
  @state() private _historicalTools: ToolEvent[] = [];
  @state() private _historicalLoaded = false;
  @state() private _currentState = '';

  private _listener: AgentStreamListener = (event: AgentStreamEvent) => {
    if (event.participant_id !== this.participantId) return;

    if (event.stream === 'tool') {
      const entry: ToolEvent = {
        kind: 'tool',
        id: event.data.id,
        tool_name: event.data.tool_name,
        is_error: event.data.is_error,
        duration_ms: event.data.duration_ms,
        ts: event.data.created_at,
      };
      this._toolEvents = [...this._toolEvents.slice(-(MAX_ENTRIES - 1)), entry];
      this._allEntries = [...this._allEntries.slice(-(MAX_ENTRIES - 1)), entry];
    } else if (event.stream === 'output') {
      const entry: OutputLine = {
        kind: 'output',
        line: event.data.line,
        fd: event.data.fd,
        ts: event.data.ts,
      };
      this._outputLines = [...this._outputLines.slice(-(MAX_OUTPUT_LINES - 1)), entry];
      this._allEntries = [...this._allEntries.slice(-(MAX_ENTRIES - 1)), entry];
    } else if (event.stream === 'state') {
      const entry: StateEvent = {
        kind: 'state',
        to: (event.data as any).to ?? '',
        detail: (event.data as any).detail ?? '',
        ts: (event.data as any).ts ?? new Date().toISOString(),
      };
      this._currentState = entry.to;
      this._allEntries = [...this._allEntries.slice(-(MAX_ENTRIES - 1)), entry];
      this.dispatchEvent(new CustomEvent('agent-state-change', {
        detail: { state: entry.to, detail: entry.detail },
        bubbles: true,
        composed: true,
      }));
    }

    this.requestUpdate();
    // Auto-scroll output
    this.updateComplete.then(() => this._scrollToBottom());
  };

  connectedCallback() {
    super.connectedCallback();
    if (this.sessionCode && this.participantId) {
      this._startStreaming();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopStreaming();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('sessionCode') || changed.has('participantId')) {
      this._stopStreaming();
      if (this.sessionCode && this.participantId) {
        this._startStreaming();
      }
    }
  }

  private _startStreaming() {
    agentStream.connect(this.sessionCode);
    agentStream.subscribe(this.participantId);
    agentStream.addListener(this._listener);
    this._connected = true;
    this._loadHistorical();
  }

  private _stopStreaming() {
    agentStream.removeListener(this._listener);
    if (this.participantId) {
      agentStream.unsubscribe(this.participantId);
    }
    this._connected = false;
  }

  private async _loadHistorical() {
    if (this._historicalLoaded) return;

    const token = authStore.getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Load historical tool invocations
    try {
      const res = await fetch(
        `/api/sessions/${this.sessionCode}/tool-invocations?participant_id=${this.participantId}&limit=50`,
        { headers },
      );
      if (res.ok) {
        const data = await res.json() as Array<{
          id: string;
          tool_name: string;
          is_error: boolean;
          duration_ms: number;
          created_at: string;
        }>;
        this._historicalTools = data.map(d => ({
          kind: 'tool' as const,
          id: d.id,
          tool_name: d.tool_name,
          is_error: d.is_error,
          duration_ms: d.duration_ms,
          ts: d.created_at,
        }));
        const liveIds = new Set(this._toolEvents.map(t => t.id));
        const unique = this._historicalTools.filter(t => !liveIds.has(t.id));
        this._toolEvents = [...unique, ...this._toolEvents];
        this._allEntries = [...unique, ...this._allEntries];
      }
    } catch {
      // Non-critical
    }

    // Load historical output lines from workspace logs
    if (this.workspaceId) {
      try {
        const logRes = await fetch(
          `/api/workspaces/${this.workspaceId}/logs?limit=200`,
          { headers },
        );
        if (logRes.ok) {
          const logData = await logRes.json() as Array<{
            line: string;
            fd: string;
            ts: string;
          }>;
          const historicalOutput: OutputLine[] = logData.map(d => ({
            kind: 'output' as const,
            line: d.line,
            fd: d.fd,
            ts: d.ts,
          }));
          this._outputLines = [...historicalOutput, ...this._outputLines];
          this._allEntries = [...historicalOutput, ...this._allEntries];
        }
      } catch {
        // Non-critical
      }
    }

    this._historicalLoaded = true;
  }

  private _scrollToBottom() {
    const containers = this.shadowRoot?.querySelectorAll('.tab-content, .output-container');
    containers?.forEach(el => {
      el.scrollTop = el.scrollHeight;
    });
  }

  private _formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return '';
    }
  }

  private _formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  render() {
    if (!this.participantId) return nothing;

    return html`
      <div class="panel-container">
        <sl-tab-group>
          <sl-tab slot="nav" panel="all">
            All
            <sl-badge variant="neutral" pill>${this._allEntries.length}</sl-badge>
          </sl-tab>
          <sl-tab slot="nav" panel="tools">
            Tools
            <sl-badge variant="neutral" pill>${this._toolEvents.length}</sl-badge>
          </sl-tab>
          <sl-tab slot="nav" panel="output">Output</sl-tab>

          <sl-tab-panel name="all">
            ${this._connected ? html`
              <div class="live-indicator"><span class="live-dot"></span> Live</div>
            ` : nothing}
            <div class="tab-content">
              ${this._allEntries.length === 0
                ? html`<div class="empty-state">Waiting for agent activity...</div>`
                : this._allEntries.map(e => this._renderEntry(e))}
            </div>
          </sl-tab-panel>

          <sl-tab-panel name="tools">
            <div class="tab-content">
              ${this._toolEvents.length === 0
                ? html`<div class="empty-state">No tool invocations yet.</div>`
                : this._toolEvents.map(t => this._renderToolItem(t))}
            </div>
          </sl-tab-panel>

          <sl-tab-panel name="output">
            <div class="output-container">
              ${this._outputLines.length === 0
                ? html`<span style="color: #8b949e; font-style: italic;">No output captured yet.</span>`
                : this._outputLines.map(o => html`
                    <span class="output-line ${o.fd === 'stderr' ? 'stderr' : ''}">${o.line}\n</span>
                  `)}
            </div>
          </sl-tab-panel>
        </sl-tab-group>
      </div>
    `;
  }

  private _renderEntry(e: ActivityEntry) {
    if (e.kind === 'tool') {
      return html`
        <div class="entry">
          <span class="entry-ts">${this._formatTime(e.ts)}</span>
          <span class="entry-kind tool">tool</span>
          <span class="entry-detail ${e.is_error ? 'error' : ''}">${e.tool_name}</span>
          <span class="tool-duration">${this._formatDuration(e.duration_ms)}</span>
          ${e.is_error ? html`<sl-badge variant="danger" size="small">err</sl-badge>` : nothing}
        </div>
      `;
    }
    if (e.kind === 'state') {
      return html`
        <div class="entry">
          <span class="entry-ts">${this._formatTime(e.ts)}</span>
          <span class="entry-kind state">state</span>
          <span class="entry-detail">${e.to}${e.detail ? ` — ${e.detail}` : ''}</span>
        </div>
      `;
    }
    return html`
      <div class="entry">
        <span class="entry-ts">${this._formatTime(e.ts)}</span>
        <span class="entry-kind output">${e.fd}</span>
        <span class="entry-detail">${e.line}</span>
      </div>
    `;
  }

  private _renderToolItem(t: ToolEvent) {
    return html`
      <div class="tool-item">
        <span class="tool-name">${t.tool_name}</span>
        <div class="tool-meta">
          <span>${this._formatDuration(t.duration_ms)}</span>
          <span>${this._formatTime(t.ts)}</span>
          ${t.is_error ? html`<sl-badge variant="danger" size="small">error</sl-badge>` : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'agent-activity-panel': AgentActivityPanel;
  }
}
