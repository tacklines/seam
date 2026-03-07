import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { t } from "../../lib/i18n.js";
import { navigateTo } from "../../router.js";

import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/spinner/spinner.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";

interface KratosUiNode {
  type: string;
  group: string;
  attributes: {
    name: string;
    type?: string;
    value?: string;
    required?: boolean;
    disabled?: boolean;
    node_type?: string;
  };
  messages?: { id: number; text: string; type: string }[];
  meta?: { label?: { text: string } };
}

interface KratosFlow {
  id: string;
  ui: {
    action: string;
    method: string;
    nodes: KratosUiNode[];
    messages?: { id: number; text: string; type: string }[];
  };
}

interface KratosSession {
  identity: { id: string };
}

@customElement("auth-login-page")
export class AuthLoginPage extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--surface-1, #111320);
    }

    .card {
      width: 100%;
      max-width: 400px;
      background: var(--surface-card, #1a1d2e);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    }

    h1 {
      margin: 0 0 0.25rem;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary, #fff);
      letter-spacing: -0.025em;
    }

    .subtitle {
      margin: 0 0 1.5rem;
      color: var(--text-secondary, rgba(255, 255, 255, 0.5));
      font-size: 0.875rem;
    }

    .form-fields {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    sl-input {
      width: 100%;
    }

    sl-button[type="submit"],
    .submit-btn {
      width: 100%;
      margin-top: 0.5rem;
    }

    .footer {
      margin-top: 1.25rem;
      text-align: center;
      font-size: 0.875rem;
      color: var(--text-secondary, rgba(255, 255, 255, 0.5));
    }

    .footer a {
      color: var(--sl-color-primary-400, #7c8cf8);
      text-decoration: none;
      cursor: pointer;
    }

    .footer a:hover {
      text-decoration: underline;
    }

    sl-alert {
      margin-bottom: 1rem;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      color: var(--text-secondary, rgba(255, 255, 255, 0.5));
      padding: 2rem 0;
    }
  `;

  @state() private _flow: KratosFlow | null = null;
  @state() private _loading = true;
  @state() private _submitting = false;
  @state() private _error: string | null = null;
  @state() private _loginChallenge: string | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._init();
  }

  private async _init() {
    const params = new URLSearchParams(window.location.search);
    const challenge = params.get("login_challenge");
    this._loginChallenge = challenge;

    if (challenge) {
      sessionStorage.setItem("seam_login_challenge", challenge);
      await this._handleHydraChallenge(challenge);
    } else {
      await this._fetchKratosFlow();
    }
  }

  private async _handleHydraChallenge(challenge: string) {
    try {
      const res = await fetch(
        `/api/auth/login?login_challenge=${encodeURIComponent(challenge)}`,
      );
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data = await res.json();
      if (data.skip && data.redirect_to) {
        window.location.href = data.redirect_to;
        return;
      }
      // Still need credentials — show Kratos form
      await this._fetchKratosFlow();
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("auth.login.errorLoad");
      this._loading = false;
    }
  }

  private async _fetchKratosFlow() {
    try {
      const params = new URLSearchParams(window.location.search);
      const flowId = params.get("flow");

      let url: string;
      if (flowId) {
        url = `/kratos/self-service/login/flows?id=${encodeURIComponent(flowId)}`;
      } else {
        // Use refresh=true to allow login even with existing session
        url = "/kratos/self-service/login/browser?refresh=true";
      }

      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const errorId = body?.error?.id;

        // If there's already a session, use it to accept the Hydra challenge
        if (errorId === "session_already_available" && this._loginChallenge) {
          await this._useExistingSession();
          return;
        }

        throw new Error(`Failed to initialize login flow: ${res.status} ${JSON.stringify(body)}`);
      }

      const flow: KratosFlow = await res.json();
      this._flow = flow;
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("auth.login.errorLoad");
    } finally {
      this._loading = false;
    }
  }

  private async _useExistingSession() {
    try {
      const res = await fetch("/kratos/sessions/whoami", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("No active session");
      }
      const session: KratosSession = await res.json();
      await this._acceptLoginChallenge(session);
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("auth.login.errorLoad");
      this._loading = false;
    }
  }

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    if (!this._flow || this._submitting) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const body: Record<string, string> = { method: "password" };
    for (const [key, value] of formData.entries()) {
      body[key] = value as string;
    }

    this._submitting = true;
    this._error = null;

    try {
      const res = await fetch(this._flow.ui.action, {
        method: this._flow.ui.method.toUpperCase(),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok && data.session) {
        // Kratos returned a session — accept the Hydra login challenge if present
        await this._acceptLoginChallenge(data.session);
      } else if (data.ui) {
        // Form validation errors — re-render with updated flow
        this._flow = data as KratosFlow;
        const msgs = data.ui?.messages;
        if (msgs?.length) {
          this._error = msgs.map((m: { text: string }) => m.text).join(" ");
        }
      } else {
        this._error = t("auth.login.errorGeneric");
      }
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("auth.login.errorGeneric");
    } finally {
      this._submitting = false;
    }
  }

  private async _acceptLoginChallenge(session: KratosSession) {
    const challenge = this._loginChallenge;
    if (!challenge) {
      // No challenge — just redirect home
      navigateTo("/");
      return;
    }

    try {
      const res = await fetch(
        `/api/auth/login/accept?login_challenge=${encodeURIComponent(challenge)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: session.identity.id,
            remember: true,
            remember_for: 3600,
          }),
        },
      );

      if (!res.ok) {
        throw new Error(`Accept failed: ${res.status}`);
      }

      const data = await res.json();
      if (data.redirect_to) {
        window.location.href = data.redirect_to;
      } else {
        navigateTo("/");
      }
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("auth.login.errorAccept");
    }
  }

  private _renderFlowMessages() {
    const msgs = this._flow?.ui.messages;
    if (!msgs?.length) return nothing;
    return html`
      <sl-alert variant="danger" open>
        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
        ${msgs.map((m) => html`<div>${m.text}</div>`)}
      </sl-alert>
    `;
  }

  private _renderNode(node: KratosUiNode) {
    const attrs = node.attributes;
    if (attrs.type === "hidden") {
      return html`<input
        type="hidden"
        name="${attrs.name}"
        value="${attrs.value ?? ""}"
      />`;
    }
    if (attrs.type === "submit") {
      return nothing; // We render the submit button separately
    }

    const label = node.meta?.label?.text ?? attrs.name;
    const nodeErrors = node.messages?.filter((m) => m.type === "error") ?? [];

    return html`
      <sl-input
        name="${attrs.name}"
        type="${attrs.type ?? "text"}"
        label="${label}"
        value="${attrs.value ?? ""}"
        ?required="${attrs.required}"
        ?disabled="${attrs.disabled || this._submitting}"
        help-text="${nodeErrors.map((e) => e.text).join(" ")}"
      ></sl-input>
    `;
  }

  render() {
    return html`
      <div class="card">
        <h1>${t("auth.login.title")}</h1>
        <p class="subtitle">${t("auth.login.subtitle")}</p>

        ${this._loading
          ? html`<div class="loading">
              <sl-spinner></sl-spinner> ${t("auth.login.loading")}
            </div>`
          : nothing}
        ${this._error && !this._loading
          ? html`
              <sl-alert variant="danger" open>
                <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                ${this._error}
              </sl-alert>
            `
          : nothing}
        ${this._flow && !this._loading
          ? html`
              <form @submit=${this._handleSubmit}>
                ${this._renderFlowMessages()}
                <div class="form-fields">
                  ${this._flow.ui.nodes
                    .filter(
                      (n) => n.group === "default" || n.group === "password",
                    )
                    .map((n) => this._renderNode(n))}
                </div>
                <sl-button
                  class="submit-btn"
                  type="submit"
                  variant="primary"
                  ?loading="${this._submitting}"
                  ?disabled="${this._submitting}"
                  style="margin-top: 1rem; width: 100%;"
                >
                  ${t("auth.login.signIn")}
                </sl-button>
              </form>
            `
          : nothing}

        <div class="footer"></div>
      </div>
    `;
  }
}
