import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { cssWATweaks } from "../utils/css.ts";

// Register components
import "@awesome.me/webawesome/dist/components/icon/icon.js";

export interface ToastOptions {
  message: string;
  label?: string;
  type?: "info" | "success" | "warning" | "error";
  icon?: string;
  /** Auto-dismiss delay in ms (default 3000). */
  duration?: number;
}

const TOAST_REGION_ID = "app-toast-region";

/**
 * Show a transient, non-modal confirmation. Unlike `showAlert` (a modal
 * the user must dismiss), a toast auto-dismisses, never blocks input, and
 * is announced politely to assistive tech. Use it for *success* feedback
 * on quick actions (quick-save / quick-load); keep `showAlert` for
 * anything that must interrupt (e.g. a refused save).
 *
 * Toasts replace rather than stack: a new toast clears any current ones,
 * so rapid presses (Cmd/Ctrl+S held) show a single current message rather
 * than a growing pile.
 */
export function showToast(options: ToastOptions): void {
  let region = document.getElementById(TOAST_REGION_ID);
  if (!region) {
    region = document.createElement("div");
    region.id = TOAST_REGION_ID;
    // Politeness lives on the region so each appended toast is announced.
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-relevant", "additions");
    document.body.appendChild(region);
  }
  // Replace any in-flight toasts so they don't pile up.
  for (const existing of Array.from(region.children)) existing.remove();
  const toast = Object.assign(document.createElement("app-toast"), options);
  region.appendChild(toast);
}

@customElement("app-toast")
export class AppToast extends LitElement {
  @property({ type: String })
  label = "";

  @property({ type: String })
  message = "";

  @property({ type: String, reflect: true })
  type: Required<ToastOptions>["type"] = "info";

  @property({ type: String })
  icon: string | undefined = undefined;

  @property({ type: Number })
  duration = 3000;

  private dismissTimer?: ReturnType<typeof setTimeout>;

  override connectedCallback(): void {
    super.connectedCallback();
    // Next frame: flip to the visible state so the fade-in transitions.
    requestAnimationFrame(() => this.setAttribute("data-open", ""));
    this.dismissTimer = setTimeout(() => this.dismiss(), this.duration);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
  }

  /** Fade out, then remove from the DOM. */
  dismiss(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = undefined;
    }
    this.removeAttribute("data-open");
    // Remove after the fade-out; a fallback timer guards the case where
    // the transitionend never fires (reduced motion / detached).
    const remove = () => this.remove();
    this.addEventListener("transitionend", remove, { once: true });
    setTimeout(remove, 250);
  }

  protected override render() {
    return html`
      <div class="toast" role="status" @click=${() => this.dismiss()}>
        <wa-icon part="icon" name=${this.icon || this.type}></wa-icon>
        <div class="body">
          ${this.label ? html`<div class="label">${this.label}</div>` : nothing}
          ${this.message ? html`<div class="message">${this.message}</div>` : nothing}
        </div>
        <button
          class="close"
          type="button"
          aria-label="Dismiss"
          @click=${(e: Event) => {
            e.stopPropagation();
            this.dismiss();
          }}
        >
          <wa-icon name="xmark"></wa-icon>
        </button>
      </div>
    `;
  }

  static styles = [
    cssWATweaks,
    css`
      :host {
        position: fixed;
        inset-block-end: var(--wa-space-xl, 2rem);
        inset-inline: 0;
        display: flex;
        justify-content: center;
        z-index: 1000;
        pointer-events: none;
      }

      .toast {
        pointer-events: auto;
        display: flex;
        gap: var(--wa-space-s);
        align-items: flex-start;
        max-width: min(28rem, calc(100vw - 2 * var(--wa-space-l)));
        padding: var(--wa-space-s) var(--wa-space-m);
        background-color: var(--wa-color-surface-raised, var(--wa-color-surface-default));
        color: var(--wa-color-text-normal);
        border: var(--wa-border-width-s) var(--wa-border-style) var(--wa-color-neutral-border-normal);
        border-inline-start-width: var(--wa-border-width-l);
        border-radius: var(--wa-border-radius-m);
        box-shadow: var(--wa-shadow-m);
        cursor: pointer;
        /* fade/slide in from below; reduced-motion users see opacity only */
        opacity: 0;
        transform: translateY(0.5rem);
        transition:
          opacity 0.18s ease,
          transform 0.18s ease;
      }

      :host([data-open]) .toast {
        opacity: 1;
        transform: translateY(0);
      }

      @media (prefers-reduced-motion: reduce) {
        .toast {
          transform: none;
          transition: opacity 0.12s ease;
        }
      }

      .body {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .label {
        font-weight: var(--wa-font-weight-semibold, 600);
      }
      .message {
        color: var(--wa-color-text-quiet);
      }

      wa-icon[part="icon"] {
        margin-block-start: 0.125em;
        font-size: 1.1em;
      }

      .close {
        margin-inline-start: auto;
        padding: 0;
        background: none;
        border: none;
        color: var(--wa-color-text-quiet);
        cursor: pointer;
        line-height: 1;
      }
      .close:hover {
        color: var(--wa-color-text-normal);
      }

      :host([type="success"]) .toast {
        border-inline-start-color: var(--wa-color-success-fill-loud);
      }
      :host([type="success"]) wa-icon[part="icon"] {
        color: var(--wa-color-success-fill-loud);
      }
      :host([type="info"]) .toast {
        border-inline-start-color: var(--wa-color-brand-fill-loud);
      }
      :host([type="info"]) wa-icon[part="icon"] {
        color: var(--wa-color-brand-fill-loud);
      }
      :host([type="warning"]) .toast {
        border-inline-start-color: var(--wa-color-warning-fill-loud);
      }
      :host([type="warning"]) wa-icon[part="icon"] {
        color: var(--wa-color-warning-fill-loud);
      }
      :host([type="error"]) .toast {
        border-inline-start-color: var(--wa-color-danger-fill-loud);
      }
      :host([type="error"]) wa-icon[part="icon"] {
        color: var(--wa-color-danger-fill-loud);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "app-toast": AppToast;
  }
}
