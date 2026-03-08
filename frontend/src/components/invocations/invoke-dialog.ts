import { LitElement, html, css, nothing } from "lit";
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
  @property({ attribute: "task-id" }) taskId = "";
  @state() private _open = false;
  @state() private _perspective = "coder";
  @state() private _prompt = "";
  @state() private _branch = "";
  @state() private _systemPrompt = "";
  @state() private _submitting = false;
  @state() private _error = "";
  @state() private _resumeSessionId = "";
  @state() private _modelHint = "";
  @state() private _budgetTier = "";

  show() {
    this._open = true;
    this._error = "";
    this._submitting = false;
    this._resumeSessionId = "";
  }

  showWithPrompt(prompt: string) {
    this._open = true;
    this._error = "";
    this._submitting = false;
    this._resumeSessionId = "";
    this._prompt = prompt;
  }

  showWithPerspective(perspective: string, prompt: string) {
    this._open = true;
    this._error = "";
    this._submitting = false;
    this._resumeSessionId = "";
    this._perspective = perspective;
    this._prompt = prompt;
  }

  showContinue(opts: { claude_session_id: string; agent_perspective: string }) {
    this._open = true;
    this._error = "";
    this._submitting = false;
    this._perspective = opts.agent_perspective;
    this._resumeSessionId = opts.claude_session_id;
    this._prompt = "";
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
        task_id: this.taskId || undefined,
        resume_session_id: this._resumeSessionId || undefined,
        model_hint: this._modelHint.trim() || undefined,
        budget_tier: this._budgetTier || undefined,
      });

      this._open = false;
      this._prompt = "";
      this._systemPrompt = "";
      this._branch = "";
      this._resumeSessionId = "";
      this._modelHint = "";
      this._budgetTier = "";

      this.dispatchEvent(
        new CustomEvent("invocation-created", {
          detail: { invocation: inv },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (e) {
      this._error =
        e instanceof Error ? e.message : "Failed to create invocation";
    } finally {
      this._submitting = false;
    }
  }

  render() {
    return html`
      <sl-dialog
        label=${this._resumeSessionId
          ? "Continue Invocation"
          : "New Invocation"}
        ?open=${this._open}
        @sl-after-hide=${() => (this._open = false)}
      >
        ${this._resumeSessionId
          ? html`
              <sl-alert variant="primary" open>
                Continuing previous session
                (${this._resumeSessionId.substring(0, 8)}...)
              </sl-alert>
            `
          : nothing}
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

        <div class="form-group">
          <label>Model (optional)</label>
          <sl-input
            placeholder="e.g. qwen3.5, opus, deepseek (uses your default if empty)"
            value=${this._modelHint}
            @sl-input=${(e: Event) =>
              (this._modelHint = (e.target as HTMLInputElement).value)}
          ></sl-input>
        </div>

        <div class="form-group">
          <label>Budget Tier (optional)</label>
          <sl-select
            placeholder="Use default"
            value=${this._budgetTier}
            clearable
            @sl-change=${(e: Event) =>
              (this._budgetTier = (e.target as HTMLInputElement).value)}
          >
            <sl-option value="free">Free</sl-option>
            <sl-option value="economy">Economy</sl-option>
            <sl-option value="moderate">Moderate</sl-option>
            <sl-option value="unlimited">Unlimited</sl-option>
          </sl-select>
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
