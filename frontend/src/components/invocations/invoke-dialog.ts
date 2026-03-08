import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { t } from "../../lib/i18n.js";
import {
  createInvocation,
  checkCoderStatus,
  type InvocationView,
  type CoderStatus,
} from "../../state/invocation-api.js";

import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";

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
  @state() private _coderStatus: CoderStatus | null = null;

  private _checkCoder() {
    checkCoderStatus().then((s) => (this._coderStatus = s));
  }

  show() {
    this._open = true;
    this._error = "";
    this._submitting = false;
    this._resumeSessionId = "";
    this._checkCoder();
  }

  showWithPrompt(prompt: string) {
    this._open = true;
    this._error = "";
    this._submitting = false;
    this._resumeSessionId = "";
    this._prompt = prompt;
    this._checkCoder();
  }

  showWithPerspective(perspective: string, prompt: string) {
    this._open = true;
    this._error = "";
    this._submitting = false;
    this._resumeSessionId = "";
    this._perspective = perspective;
    this._prompt = prompt;
    this._checkCoder();
  }

  showContinue(opts: { claude_session_id: string; agent_perspective: string }) {
    this._open = true;
    this._error = "";
    this._submitting = false;
    this._perspective = opts.agent_perspective;
    this._resumeSessionId = opts.claude_session_id;
    this._prompt = "";
    this._checkCoder();
  }

  hide() {
    this._open = false;
  }

  private async _submit() {
    if (!this._prompt.trim()) {
      this._error = t("invoke.errorPromptRequired");
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
          ? t("invoke.titleContinue")
          : t("invoke.titleNew")}
        ?open=${this._open}
        @sl-after-hide=${() => (this._open = false)}
      >
        ${this._coderStatus && !this._coderStatus.enabled
          ? html`<sl-alert variant="warning" open role="alert">
              <sl-icon name="exclamation-triangle" slot="icon"></sl-icon>
              ${t("invoke.coderNotConfigured")}
            </sl-alert>`
          : this._coderStatus && !this._coderStatus.connected
            ? html`<sl-alert variant="warning" open role="alert">
                <sl-icon name="exclamation-triangle" slot="icon"></sl-icon>
                ${t("invoke.coderConnectionIssue")}
                ${this._coderStatus.error || t("invoke.coderConnectionUnknown")}
              </sl-alert>`
            : nothing}
        ${this._resumeSessionId
          ? html`
              <sl-alert variant="primary" open>
                ${t("invoke.continuingSession")}
                (${this._resumeSessionId.substring(0, 8)}...)
              </sl-alert>
            `
          : nothing}
        <div class="form-group">
          <label id="invoke-perspective-label"
            >${t("invoke.perspectiveLabel")}</label
          >
          <sl-select
            aria-labelledby="invoke-perspective-label"
            value=${this._perspective}
            @sl-change=${(e: Event) =>
              (this._perspective = (e.target as HTMLInputElement).value)}
          >
            <sl-option value="coder"
              >${t("invoke.perspective.coder")}</sl-option
            >
            <sl-option value="reviewer"
              >${t("invoke.perspective.reviewer")}</sl-option
            >
            <sl-option value="planner"
              >${t("invoke.perspective.planner")}</sl-option
            >
            <sl-option value="tester"
              >${t("invoke.perspective.tester")}</sl-option
            >
            <sl-option value="researcher"
              >${t("invoke.perspective.researcher")}</sl-option
            >
          </sl-select>
        </div>

        <div class="form-group">
          <label id="invoke-prompt-label">${t("invoke.promptLabel")}</label>
          <sl-textarea
            rows="4"
            aria-labelledby="invoke-prompt-label"
            aria-required="true"
            placeholder=${t("invoke.promptPlaceholder")}
            value=${this._prompt}
            @sl-input=${(e: Event) =>
              (this._prompt = (e.target as HTMLInputElement).value)}
          ></sl-textarea>
        </div>

        <div class="form-group">
          <label id="invoke-branch-label">${t("invoke.branchLabel")}</label>
          <sl-input
            aria-labelledby="invoke-branch-label"
            placeholder="main"
            value=${this._branch}
            @sl-input=${(e: Event) =>
              (this._branch = (e.target as HTMLInputElement).value)}
          ></sl-input>
        </div>

        <div class="form-group">
          <label id="invoke-system-prompt-label"
            >${t("invoke.systemPromptLabel")}</label
          >
          <sl-textarea
            rows="2"
            aria-labelledby="invoke-system-prompt-label"
            placeholder="Additional context for the agent..."
            value=${this._systemPrompt}
            @sl-input=${(e: Event) =>
              (this._systemPrompt = (e.target as HTMLInputElement).value)}
          ></sl-textarea>
        </div>

        <div class="form-group">
          <label id="invoke-model-label">${t("invoke.modelLabel")}</label>
          <sl-input
            aria-labelledby="invoke-model-label"
            placeholder="e.g. qwen3.5, opus, deepseek (uses your default if empty)"
            value=${this._modelHint}
            @sl-input=${(e: Event) =>
              (this._modelHint = (e.target as HTMLInputElement).value)}
          ></sl-input>
        </div>

        <div class="form-group">
          <label id="invoke-budget-label">${t("invoke.budgetLabel")}</label>
          <sl-select
            aria-labelledby="invoke-budget-label"
            placeholder="Use default"
            value=${this._budgetTier}
            clearable
            @sl-change=${(e: Event) =>
              (this._budgetTier = (e.target as HTMLInputElement).value)}
          >
            <sl-option value="free">${t("invoke.budget.free")}</sl-option>
            <sl-option value="economy">${t("invoke.budget.economy")}</sl-option>
            <sl-option value="moderate"
              >${t("invoke.budget.moderate")}</sl-option
            >
            <sl-option value="unlimited"
              >${t("invoke.budget.unlimited")}</sl-option
            >
          </sl-select>
        </div>

        ${this._error
          ? html`<sl-alert variant="danger" open role="alert" class="error">
              <sl-icon name="exclamation-triangle" slot="icon"></sl-icon>
              ${this._error}
              ${this._error.includes("Coder") ||
              this._error.includes("workspace")
                ? html`<br /><small>${t("invoke.coderSettingsHint")}</small>`
                : ""}
            </sl-alert>`
          : ""}

        <div class="actions">
          <sl-button @click=${() => this.hide()}
            >${t("invoke.cancel")}</sl-button
          >
          <sl-button
            variant="primary"
            ?loading=${this._submitting}
            ?disabled=${this._coderStatus != null &&
            (!this._coderStatus.enabled || !this._coderStatus.connected)}
            @click=${() => this._submit()}
          >
            ${t("invoke.launch")}
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
