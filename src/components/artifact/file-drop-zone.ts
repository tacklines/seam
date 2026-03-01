import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { loadFile } from '../../lib/yaml-loader.js';
import { store } from '../../state/app-state.js';

import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';

@customElement('file-drop-zone')
export class FileDropZone extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* ── Hero mode ── */

    .hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      min-height: 100dvh;
      padding: 2rem;
      background:
        repeating-radial-gradient(circle at 20% 50%, transparent 0, transparent 40px, rgba(99,102,241,0.03) 41px, transparent 42px),
        repeating-radial-gradient(circle at 80% 20%, transparent 0, transparent 60px, rgba(99,102,241,0.03) 61px, transparent 62px),
        repeating-radial-gradient(circle at 50% 80%, transparent 0, transparent 50px, rgba(99,102,241,0.03) 51px, transparent 52px),
        var(--surface-1, #f8fafc);
    }

    .hero-icon {
      font-size: 4rem;
      color: var(--sl-color-primary-500, #6366f1);
      margin-bottom: 1.5rem;
    }

    .hero h1 {
      margin: 0 0 0.5rem;
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--sl-color-neutral-900, #0f172a);
      letter-spacing: -0.025em;
    }

    .hero .subtitle {
      margin: 0 0 2.5rem;
      font-size: 1.125rem;
      color: var(--sl-color-neutral-500, #64748b);
      max-width: 28rem;
      text-align: center;
      line-height: 1.6;
    }

    /* ── Drop zone (shared by both modes) ── */

    .drop-zone {
      border: 2px dashed var(--sl-color-neutral-300, #cbd5e1);
      border-radius: var(--sl-border-radius-large, 0.5rem);
      padding: 2rem 3rem;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background-color 0.2s;
      background: var(--sl-color-neutral-0, #ffffff);
    }

    .drop-zone:hover,
    .drop-zone.dragging {
      border-color: var(--sl-color-primary-500, #6366f1);
      background: var(--sl-color-primary-50, #eef2ff);
    }

    .drop-zone .drop-icon {
      font-size: 2rem;
      color: var(--sl-color-neutral-400, #94a3b8);
    }

    .drop-zone .cta {
      margin: 0.75rem 0 0;
      font-size: 1rem;
      color: var(--sl-color-neutral-700, #334155);
      font-weight: 500;
    }

    .drop-zone .cta-secondary {
      margin: 0.25rem 0 0;
      font-size: var(--sl-font-size-small, 0.875rem);
      color: var(--sl-color-primary-600, #4f46e5);
    }

    .hero-hint {
      margin: 1rem 0 0;
      font-size: var(--sl-font-size-x-small, 0.75rem);
      color: var(--sl-color-neutral-400, #94a3b8);
    }

    /* ── Compact mode ── */

    :host([mode="compact"]) .drop-zone {
      padding: 1.25rem 1.5rem;
    }

    input[type="file"] {
      display: none;
    }
  `;

  @property() mode: 'hero' | 'compact' = 'hero';

  @state() private dragging = false;

  render() {
    if (this.mode === 'compact') {
      return this.renderCompact();
    }
    return this.renderHero();
  }

  private renderDropZone() {
    return html`
      <div
        class="drop-zone ${this.dragging ? 'dragging' : ''}"
        role="button"
        tabindex="0"
        aria-label="Drop storm-prep YAML files here, or press Enter or Space to browse for files"
        aria-dropeffect="copy"
        aria-live="polite"
        @dragover=${this.onDragOver}
        @dragleave=${this.onDragLeave}
        @drop=${this.onDrop}
        @click=${this.onClick}
        @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onClick(); } }}
      >
        <sl-icon name="cloud-arrow-up" class="drop-icon" aria-hidden="true"></sl-icon>
        <p class="cta">${this.dragging ? 'Release to upload files' : 'Drop storm-prep YAML files here'}</p>
        <p class="cta-secondary">or click to browse</p>
      </div>
      <input
        type="file"
        accept=".yaml,.yml"
        multiple
        aria-label="Choose storm-prep YAML files to upload"
        @change=${this.onFileInput}
      />
    `;
  }

  private renderHero() {
    return html`
      <div class="hero">
        <sl-icon name="cloud-arrow-up" class="hero-icon"></sl-icon>
        <h1>Storm-Prep Visualizer</h1>
        <p class="subtitle">Visualize and compare domain event candidates across roles</p>
        ${this.renderDropZone()}
        <p class="hero-hint">Supports multiple files for cross-role comparison</p>
      </div>
    `;
  }

  private renderCompact() {
    return this.renderDropZone();
  }

  private onDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragging = true;
  }

  private onDragLeave() {
    this.dragging = false;
  }

  private async onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging = false;
    if (e.dataTransfer?.files) {
      await this.processFiles(e.dataTransfer.files);
    }
  }

  private onClick() {
    this.renderRoot.querySelector<HTMLInputElement>('input[type="file"]')?.click();
  }

  private async onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) {
      await this.processFiles(input.files);
      input.value = '';
    }
  }

  private async processFiles(files: FileList) {
    store.clearErrors();
    for (const file of Array.from(files)) {
      const result = await loadFile(file);
      if (result.ok) {
        store.addFile(result.file);
      } else {
        store.addError(result.filename, result.errors);
      }
    }
  }
}
