import type WaButton from "@awesome.me/webawesome/dist/components/button/button.js";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { isTsPorted } from "../native/games/ts-ported-ids.ts";
import { homePageUrl, puzzlePageUrl } from "../routing.ts";
import { settings } from "../store/settings.ts";
import { cssWATweaks } from "../utils/css.ts";
import { puzzleDataMap, puzzleIds } from "./catalog.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

/**
 * A top-level header menu (peer of `puzzle-type-menu` and the game menu) that
 * opens a big multi-column dropdown of every puzzle in the collection — a quick
 * jump to any other game without first returning to the home screen — plus a
 * link at the top to the full home page. Replaces the single "Other puzzles"
 * item that used to live buried in the game menu.
 */
@customElement("other-puzzles-menu")
export class OtherPuzzlesMenu extends SignalWatcher(LitElement) {
  @property({ type: String })
  label = "Other puzzles";

  @property({ type: String })
  appearance?: WaButton["appearance"];

  @property({ type: String })
  variant?: WaButton["variant"];

  /** Icon-only trigger (tight horizontal layouts). */
  @property({ type: Boolean, attribute: "without-label" })
  withoutLabel = false;

  /** The puzzle currently open, marked in the grid so it stands out. */
  @property({ type: String })
  current?: string;

  @property({ type: String })
  placement: HTMLElementTagNameMap["wa-dropdown"]["placement"] = "bottom";

  override render(): TemplateResult {
    // Mirror the home screen's catalog filtering: hide unfinished puzzles
    // unless the user opted in.
    const ids = settings.showUnfinishedPuzzles
      ? puzzleIds
      : puzzleIds.filter((id) => !puzzleDataMap[id].unfinished);

    return html`
      <wa-dropdown placement=${this.placement}>
        <wa-button
            slot="trigger"
            part="trigger"
            exportparts="base:trigger-base"
            appearance=${this.appearance ?? nothing}
            variant=${this.variant ?? nothing}
            with-caret
        >${this.renderTriggerContent()}</wa-button>
        <nav class="panel" aria-label="All puzzles">
          <a class="home-link" href=${homePageUrl().href}>
            <wa-icon name="back-to-catalog"></wa-icon>
            <span>Puzzle collection home</span>
          </a>
          <wa-divider></wa-divider>
          <div class="games-grid">
            ${repeat(
              ids,
              (id) => id,
              (id) => {
                const isCurrent = id === this.current;
                // Same committed thumbnails the home catalog uses (presence
                // asserted by src/asset-integrity.test.ts).
                const icon1x = new URL(
                  `../assets/icons/${id}-64d8.png?no-inline`,
                  import.meta.url,
                ).href;
                const icon2x = new URL(
                  `../assets/icons/${id}-128d8.png?no-inline`,
                  import.meta.url,
                ).href;
                return html`<a
                    class=${classMap({ "game-link": true, current: isCurrent })}
                    href=${puzzlePageUrl({ puzzleId: id }).href}
                    aria-current=${isCurrent ? "page" : nothing}
                  >
                    <span class="thumb">
                      <img
                          srcset="${icon1x}, ${icon2x} 2x"
                          src=${icon1x}
                          alt=""
                          loading="lazy"
                          width="32"
                          height="32"
                      >
                      ${
                        // Mirror the home catalog: a green "TS" chip flags a
                        // game on the native engine; unported (C/WASM) games
                        // carry no chip — the unmarked state.
                        isTsPorted(id)
                          ? html`<span
                              class="ts-badge"
                              title="Ported to the native TypeScript engine"
                            >TS</span>`
                          : nothing
                      }
                    </span>
                    <span class="game-name">${puzzleDataMap[id].name}</span>
                  </a>`;
              },
            )}
          </div>
        </nav>
      </wa-dropdown>
    `;
  }

  private renderTriggerContent(): TemplateResult {
    if (this.withoutLabel) {
      return html`<wa-icon name="back-to-catalog" label=${this.label}></wa-icon>`;
    }
    return html`
      <wa-icon slot="start" name="back-to-catalog"></wa-icon>
      ${this.label}
    `;
  }

  static styles = [
    cssWATweaks,
    css`
      :host {
        display: block;
      }

      .panel {
        /* A wide, multi-column picker, capped so it never runs off the
         * viewport; the grid scrolls if the collection outgrows the height. */
        max-width: min(46rem, 90vw);
        padding: var(--wa-space-xs);
      }

      .home-link {
        display: flex;
        align-items: center;
        gap: var(--wa-space-s);
        padding: var(--wa-space-xs) var(--wa-space-s);
        border-radius: var(--wa-border-radius-s, 0.25rem);
        color: var(--wa-color-text-normal);
        text-decoration: none;
        font-weight: var(--wa-font-weight-semibold, 600);
      }

      wa-divider {
        margin-block: var(--wa-space-xs);
      }

      .games-grid {
        display: grid;
        /* A *definite* width is required for auto-fill to lay out more than one
         * column — inside the shrink-to-fit dropdown popup there is otherwise no
         * width to fill, so the grid would collapse to a single column. */
        width: min(48rem, 88vw);
        grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
        gap: 0.125rem;
        max-height: min(60vh, 26rem);
        overflow-y: auto;
      }

      .game-link {
        display: flex;
        align-items: center;
        gap: var(--wa-space-s);
        padding: var(--wa-space-2xs) var(--wa-space-xs);
        border-radius: var(--wa-border-radius-s, 0.25rem);
        color: var(--wa-color-text-normal);
        text-decoration: none;
      }

      .thumb {
        position: relative;
        flex: none;
        width: 32px;
        height: 32px;

        img {
          width: 32px;
          height: 32px;
          border-radius: var(--wa-border-radius-s, 0.25rem);
          background-color: var(--wa-color-neutral-fill-quiet);
        }
      }

      /* Green "TS" chip pinned to the thumbnail's bottom-right corner, exactly
       * as on the home catalog card. */
      .ts-badge {
        position: absolute;
        inset-block-end: -2px;
        inset-inline-end: -2px;

        padding-inline: 0.25em;
        border-radius: var(--wa-border-radius-s, 0.2em);

        font-size: 9px;
        font-weight: var(--wa-font-weight-semibold, 600);
        line-height: 1.3;
        letter-spacing: 0.03em;

        color: var(--wa-color-success-on-loud, white);
        background-color: var(--wa-color-success-fill-loud, #2e7d32);
        user-select: none;
      }

      .game-name {
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .home-link:hover,
      .game-link:hover,
      .home-link:focus-visible,
      .game-link:focus-visible {
        background-color: var(--wa-color-neutral-fill-normal);
      }

      .game-link.current {
        background-color: var(--wa-color-brand-fill-loud);
        color: var(--wa-color-brand-on-loud);
        font-weight: var(--wa-font-weight-semibold, 600);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "other-puzzles-menu": OtherPuzzlesMenu;
  }
}
