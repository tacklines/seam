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
  state?: string;
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

@customElement("auth-registration-page")
export class AuthRegistrationPage extends LitElement {
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

  connectedCallback() {
    super.connectedCallback();
    this._fetchFlow();
  }

  private async _fetchFlow() {
    try {
      const params = new URLSearchParams(window.location.search);
      const flowId = params.get("flow");

      let url: string;
      if (flowId) {
        url = `/kratos/self-service/registration/flows?id=${encodeURIComponent(flowId)}`;
      } else {
        url = "/kratos/self-service/registration/browser";
      }

      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(
          `Failed to initialize registration flow: ${res.status}`,
        );
      }

      const flow: KratosFlow = await res.json();
      this._flow = flow;
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("auth.register.errorLoad");
    } finally {
      this._loading = false;
    }
  }

  /**
   * Single-form registration that handles Kratos v1.3's two-step flow
   * transparently. Collects email, name, and password in one form, then:
   * 1. POST traits with method=profile (step 1)
   * 2. POST password with method=password (step 2)
   */
  private async _handleSubmit(e: Event) {
    e.preventDefault();
    if (!this._flow || this._submitting) return;

    this._submitting = true;
    this._error = null;

    try {
      const emailInput = this.shadowRoot!.querySelector(
        'sl-input[name="traits.email"]',
      ) as HTMLInputElement | null;
      const nameInput = this.shadowRoot!.querySelector(
        'sl-input[name="traits.name"]',
      ) as HTMLInputElement | null;
      const passwordInput = this.shadowRoot!.querySelector(
        'sl-input[name="password"]',
      ) as HTMLInputElement | null;

      const email = emailInput?.value ?? "";
      const name = nameInput?.value ?? "";
      const password = passwordInput?.value ?? "";

      // Find csrf_token from the flow
      const csrfNode = this._flow.ui.nodes.find(
        (n) => n.attributes.name === "csrf_token",
      );
      const csrfToken = csrfNode?.attributes.value ?? "";

      // Step 1: Submit traits with method=profile
      const step1Body = {
        method: "profile",
        "traits.email": email,
        "traits.name": name,
        csrf_token: csrfToken,
      };

      const step1Res = await fetch(this._flow.ui.action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify(step1Body),
      });

      const step1Data = await step1Res.json();

      // If step 1 returned a session directly (unlikely but handle it)
      if (step1Res.ok && step1Data.session) {
        await this._handlePostRegistration(step1Data.session as KratosSession);
        return;
      }

      // Check for validation errors on step 1
      if (step1Data.ui?.messages?.some((m: { type: string }) => m.type === "error")) {
        this._flow = step1Data as KratosFlow;
        this._error = step1Data.ui.messages
          .filter((m: { type: string }) => m.type === "error")
          .map((m: { text: string }) => m.text)
          .join(" ");
        return;
      }

      // Check for field-level errors on step 1
      const fieldErrors = step1Data.ui?.nodes
        ?.flatMap((n: KratosUiNode) => n.messages ?? [])
        .filter((m: { type: string }) => m.type === "error");
      if (fieldErrors?.length) {
        this._flow = step1Data as KratosFlow;
        this._error = fieldErrors.map((m: { text: string }) => m.text).join(" ");
        return;
      }

      if (!step1Data.ui) {
        this._error = t("auth.register.errorGeneric");
        return;
      }

      // Step 2: Submit password + all hidden fields from the updated flow
      const step2Flow = step1Data as KratosFlow;
      const step2Body: Record<string, string> = {
        method: "password",
        password: password,
      };
      // Include all hidden fields (csrf_token, traits.email, traits.name, etc.)
      for (const node of step2Flow.ui.nodes) {
        if (node.attributes.type === "hidden" && node.attributes.value != null) {
          step2Body[node.attributes.name] = node.attributes.value;
        }
      }

      const step2Res = await fetch(step2Flow.ui.action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify(step2Body),
      });

      const step2Data = await step2Res.json();

      if (step2Res.ok && step2Data.session) {
        await this._handlePostRegistration(step2Data.session as KratosSession);
      } else if (step2Data.ui) {
        // Password validation error (too short, etc.)
        this._flow = step2Data as KratosFlow;
        const msgs = [
          ...(step2Data.ui.messages ?? []),
          ...(step2Data.ui.nodes?.flatMap((n: KratosUiNode) => n.messages ?? []) ?? []),
        ].filter((m: { type: string }) => m.type === "error");
        if (msgs.length) {
          this._error = msgs.map((m: { text: string }) => m.text).join(" ");
        } else {
          this._error = t("auth.register.errorGeneric");
        }
      } else {
        this._error = t("auth.register.errorGeneric");
      }
    } catch (err) {
      this._error =
        err instanceof Error ? err.message : t("auth.register.errorGeneric");
    } finally {
      this._submitting = false;
    }
  }

  private async _handlePostRegistration(session: KratosSession) {
    const pendingChallenge = sessionStorage.getItem("seam_login_challenge");
    if (pendingChallenge) {
      sessionStorage.removeItem("seam_login_challenge");
      try {
        const res = await fetch(
          `/api/auth/login/accept?login_challenge=${encodeURIComponent(pendingChallenge)}`,
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
        if (res.ok) {
          const data = await res.json();
          if (data.redirect_to) {
            window.location.href = data.redirect_to;
            return;
          }
        }
      } catch {
        // Fall through to home redirect
      }
    }
    navigateTo("/");
  }

  render() {
    return html`
      <div class="card">
        <h1>${t("auth.register.title")}</h1>
        <p class="subtitle">${t("auth.register.subtitle")}</p>

        ${this._loading
          ? html`<div class="loading">
              <sl-spinner></sl-spinner> ${t("auth.register.loading")}
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
                <div class="form-fields">
                  <sl-input
                    name="traits.email"
                    type="email"
                    label="Email"
                    required
                    ?disabled="${this._submitting}"
                    autocomplete="email"
                  ></sl-input>
                  <sl-input
                    name="traits.name"
                    type="text"
                    label="Display Name"
                    ?disabled="${this._submitting}"
                  ></sl-input>
                  <sl-input
                    name="password"
                    type="password"
                    label="Password"
                    required
                    ?disabled="${this._submitting}"
                    autocomplete="new-password"
                    minlength="8"
                  ></sl-input>
                </div>
                <sl-button
                  class="submit-btn"
                  type="submit"
                  variant="primary"
                  ?loading="${this._submitting}"
                  ?disabled="${this._submitting}"
                  style="margin-top: 1rem; width: 100%;"
                >
                  ${t("auth.register.submit")}
                </sl-button>
              </form>
            `
          : nothing}

        <div class="footer">
          ${t("auth.register.haveAccount")}
          <a @click=${() => navigateTo("/auth/login")}
            >${t("auth.register.signIn")}</a
          >
        </div>
      </div>
    `;
  }
}
