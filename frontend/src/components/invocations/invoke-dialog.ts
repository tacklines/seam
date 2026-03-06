import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  createInvocation,
  type InvocationView,
} from "../../state/invocation-api.js";

import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";

@customElement("invoke-dialog")
export class InvokeDialog extends LitElement {
  static styles = css`
    sl-dialog::part(body) {
      padding-top: 0.5rem;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.35rem;
      font-size: 0.85rem;
      color: var(--text-secondary, #a0a4b8);
    }

    .error {
      margin-top: 1rem;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1.5rem;
    }
  `;

  @property({ attribute: "project-id" }) projectId = "";
  @state() private _open = false;
  @state() private _perspective = "coder";
  @state() private _prompt = "";
  @state() private _branch = "";
  @state() private _systemPrompt = "";
  @state() private _submitting = false;
  @state() private _error = "";

  show() {
    this._open = true;
    this._error = "";
    this._submitting = false;
  }

  hide() {
    this._open = false;
  }

  private async _submit() {
    if (!this._prompt.trim()) {
      this._error = "Prompt is required.";
      return;
    }

    this._submitting = true;
    this._error = "";

    try {
      const inv: InvocationView = await createInvocation(this.projectId, {
        agent_perspective: this._perspective,
        prompt: this._prompt.trim(),
        branch: this._branch.trim() || undefined,
        system_prompt_append: this._systemPrompt.trim() || undefined,
      });

      this._open = false;
      this._prompt = "";
      this._systemPrompt = "";
      this._branch = "";

      this.dispatchEvent(
        new CustomEvent("invocation-created", {
          detail: { invocation: inv },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (e) {
      this._error = e instanceof Error ? e.message : "Failed to create invocation";
    } finally {
      this._submitting = false;
    }
  }

  render() {
    return html`
      <sl-dialog
        label="New Invocation"
        ?open=${this._open}
        @sl-after-hide=${() => (this._open = false)}
      >
        <div class="form-group">
          <label>Agent Perspective</label>
          <sl-select
            value=${this._perspective}
            @sl-change=${(e: Event) =>
              (this._perspective = (e.target as HTMLInputElement).value)}
          >
            <sl-option value="coder">Coder</sl-option>
            <sl-option value="reviewer">Reviewer</sl-option>
            <sl-option value="planner">Planner</sl-option>
          </sl-select>
        </div>

        <div class="form-group">
          <label>Prompt</label>
          <sl-textarea
            rows="4"
            placeholder="What should the agent do?"
            value=${this._prompt}
            @sl-input=${(e: Event) =>
              (this._prompt = (e.target as HTMLInputElement).value)}
          ></sl-textarea>
        </div>

        <div class="form-group">
          <label>Branch (optional)</label>
          <sl-input
            placeholder="main"
            value=${this._branch}
            @sl-input=${(e: Event) =>
              (this._branch = (e.target as HTMLInputElement).value)}
          ></sl-input>
        </div>

        <div class="form-group">
          <label>System Prompt Append (optional)</label>
          <sl-textarea
            rows="2"
            placeholder="Additional context for the agent..."
            value=${this._systemPrompt}
            @sl-input=${(e: Event) =>
              (this._systemPrompt = (e.target as HTMLInputElement).value)}
          ></sl-textarea>
        </div>

        ${this._error
          ? html`<sl-alert variant="danger" open class="error"
              >${this._error}</sl-alert
            >`
          : ""}

        <div class="actions">
          <sl-button @click=${() => this.hide()}>Cancel</sl-button>
          <sl-button
            variant="primary"
            ?loading=${this._submitting}
            @click=${() => this._submit()}
          >
            Launch
          </sl-button>
        </div>
      </sl-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "invoke-dialog": InvokeDialog;
  }
}
