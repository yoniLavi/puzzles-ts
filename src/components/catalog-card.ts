import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { cssWATweaks } from "../utils/css.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

interface FavoriteChangeDetail {
  puzzleId: string;
  isFavorite: boolean;
}
export type FavoriteChangeEvent = CustomEvent<FavoriteChangeDetail>;

@customElement("catalog-card")
export class CatalogCard extends LitElement {
  @property({ type: String, attribute: "puzzleid" })
  puzzleId = "";

  @property({ type: String })
  name = "";

  @property({ type: String })
  description = "";

  @property({ type: String })
  objective = "";

  @property({ type: Boolean })
  unfinished = false;

  @property({ type: String })
  href = "";

  @property({ type: Boolean, attribute: "game-in-progress" })
  gameInProgress = false;

  @property({ type: Boolean })
  favorite = false;

  @property({ type: Boolean, attribute: "ts-ported" })
  tsPorted = false;

  @state()
  private icon1x = "";

  @state()
  private icon2x = "";

  @state()
  private iconLoaded = false;

  protected override willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("puzzleId")) {
      // Presence of these PNGs is asserted by src/asset-integrity.test.ts.
      this.icon1x = new URL(
        `../assets/icons/${this.puzzleId}-64d8.png?no-inline`,
        import.meta.url,
      ).href;
      this.icon2x = new URL(
        `../assets/icons/${this.puzzleId}-128d8.png?no-inline`,
        import.meta.url,
      ).href;
      this.iconLoaded = false;
    }
  }

  private renderIcon() {
    return html`
      <img
          part="icon"
          class=${this.iconLoaded ? nothing : "loading"}
          srcset="${this.icon1x}, ${this.icon2x} 2x"
          src=${this.icon2x}
          alt=""
          loading="lazy"
          @load=${this.handleIconLoaded}
      >`;
  }

  private renderFavoriteToggle() {
    return html`
      <wa-button
          part="favorite"
          aria-pressed=${String(this.favorite)}
          appearance="plain"
          @click=${this.handleFavoriteToggle}
      >
        <wa-icon name="favorite" label="Favorite"></wa-icon>
      </wa-button>
    `;
  }

  private renderGameInProgressBadge() {
    return this.gameInProgress
      ? html`<wa-icon name="game-in-progress" label="(Game in progress)"></wa-icon>`
      : nothing;
  }

  private renderUnfinishedBadge() {
    return this.unfinished ? html`<div part="unfinished">Experimental</div>` : nothing;
  }

  private renderEngineBadge() {
    // Mirrors the in-game engine badge (puzzle-screen.ts): a green "TS"
    // chip flagging a game that's been ported to the native TypeScript
    // engine, so migration progress is visible at a glance across the
    // catalog grid. Unported games carry no chip (the C/WASM default is
    // the unmarked state here, unlike the in-game badge).
    const title = "This game has been ported to the native TypeScript engine";
    return this.tsPorted
      ? html`<span part="engine-badge" title=${title} aria-label=${title}>TS</span>`
      : nothing;
  }

  protected override render() {
    // (The tabindex should be automatic for an <a>, but Safari seems to need it)
    return html`
      <a part="base" href=${this.href} draggable="false" tabindex="0">
        ${this.renderIcon()}
        ${this.renderEngineBadge()}
        <h3 part="title">${this.name}</h3>
        ${this.renderUnfinishedBadge()}
        ${this.renderGameInProgressBadge()}
        ${this.renderFavoriteToggle()}
        <div part="description">${this.objective}</div>
      </a>
    `;
  }

  private handleFavoriteToggle(event: Event) {
    // Don't navigate to the game
    event.stopPropagation();
    event.preventDefault();

    this.favorite = !this.favorite;
    this.dispatchEvent(
      new CustomEvent<FavoriteChangeDetail>("favorite-change", {
        bubbles: true,
        composed: true,
        detail: { puzzleId: this.puzzleId, isFavorite: this.favorite },
      }),
    );
  }

  private handleIconLoaded() {
    this.iconLoaded = true;
  }

  static styles = [
    cssWATweaks,
    css`
      * {
        box-sizing: border-box;
      }
      
      :host {
        display: block;
        touch-action: manipulation;
        --icon-size: 64px;
        --padding: var(--wa-space-m);
        --spacing: var(--wa-space-xs);
      }
      
      [part="base"] {
        height: 100%;
        width: 100%;
  
        position: relative;
        
        display: grid;
        grid-template-areas:
          "icon title          favorite"
          "icon description description";
        grid-template-columns: var(--icon-size) 1fr auto;
        grid-template-rows: auto 1fr;
  
        padding: var(--padding);
        column-gap: var(--padding);
        row-gap: var(--spacing);
  
        background-color: var(--wa-color-surface-default);
        color: var(--wa-color-text-normal);
        border-color: var(--wa-color-surface-border);
        border-radius: var(--wa-panel-border-radius);
        border-style: var(--wa-panel-border-style);
        border-width: var(--wa-panel-border-width);
        
        &:focus-visible {
          outline: var(--wa-focus-ring);
          outline-offset: var(--wa-focus-ring-offset);
        }
        
        &:is(a) {
          /* Remove some <a> styles and behaviors */
          cursor: pointer;
          text-decoration: none;
        }
      }
  
      @media (hover: hover) {
        @media (prefers-reduced-motion: no-preference) {
          [part="base"] {
            transition:
                transform var(--wa-transition-normal) var(--wa-transition-easing),
                box-shadow var(--wa-transition-normal) var(--wa-transition-easing);
          }
  
          [part="base"]:hover {
            transform: translateY(calc(-1 * var(--wa-space-2xs)));
            box-shadow: var(--wa-shadow-l);
          }
        }
      }
  
      [part="icon"] {
        grid-area: icon;

        width: var(--icon-size);
        height: var(--icon-size);
        border-radius: var(--wa-border-radius-s);

        display: flex;
        align-items: center;
        justify-content: center;

        font-size: calc(var(--icon-size) - 2 * var(--wa-space-xs));
        background-color: var(--wa-color-neutral-fill-quiet);
        color: var(--wa-color-neutral-on-quiet);
        :host([unfinished]) & {
          color: var(--wa-color-warning-fill-loud);
        }

        &:is(wa-icon)::part(svg) {
          width: unset;
        }

        opacity: 1;
        &.loading {
          opacity: 0;
        }
        transition: opacity var(--wa-transition-fast) var(--wa-transition-easing);
      }
  
      [part="title"] {
        grid-area: title;
        min-width: 1em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      h3 {
        margin: 0;
        line-height: var(--wa-line-height-condensed);
        color: var(--wa-color-text-normal);
        font-size: var(--wa-font-size-l);
        font-weight: var(--wa-font-weight-semibold);
      }

      [part="favorite"] {
        grid-area: favorite;
        
        /* Exclude padding from layout calculations */
        margin: calc(-1 * var(--wa-space-xs));
        
        /* Remove some button padding and allow natural size */
        &::part(base) {
          padding: var(--wa-space-xs);
          height: auto;
          width: auto;
        }
        
        /* Toggled-on appearance */
        color: var(--wa-color-text-quiet);
        &[aria-pressed="true"] wa-icon {
          /*color: var(--wa-color-brand-fill-loud);*/
          &::part(svg) {
            fill: currentColor;
          }
        }
      }
  
      [part="description"] {
        grid-area: description;
  
        color: var(--wa-color-text-quiet);
        font-size: var(--wa-font-size-m);
        font-weight: var(--wa-font-weight-normal);
        line-height: var(--wa-line-height-normal);
      }
      
      [part="unfinished"] {
        position: absolute;
        inset-block-start: calc(var(--padding) + var(--icon-size));
        inset-inline-start: calc(var(--padding) + var(--icon-size)/2);
        transform: translate(-50%, -40%) rotate(-7.5deg);
        transform-origin: 50% 50%;
        
        padding: var(--wa-space-3xs);
        font-size: var(--wa-font-size-2xs);
        line-height: 1;

        background-color: var(--wa-color-surface-default);
        color: var(--wa-color-text-normal);
        
        --border-width: var(--wa-border-width-m);
        border-style: solid;
        border-width: var(--border-width);
        border-image-source: repeating-linear-gradient(
            -45deg,
            var(--wa-color-warning-border-loud),
            var(--wa-color-warning-border-loud) calc(2 * var(--border-width)),
            var(--wa-color-surface-default) calc(2 * var(--border-width)),
            var(--wa-color-surface-default)  calc(3 * var(--border-width))
        );
        border-image-slice: 1;
      }
  
      [part="engine-badge"] {
        /* Pinned to the icon's bottom-right corner by sharing the icon
           grid area — tracks the icon box at any card size. Green "TS"
           chip matches the in-game engine badge (puzzle-screen.ts). */
        grid-area: icon;
        align-self: end;
        justify-self: end;
        z-index: 1;

        margin: var(--wa-space-3xs);
        padding-inline: 0.4em;
        padding-block: 0.05em;
        border-radius: var(--wa-border-radius-s, 0.25em);

        font-size: var(--wa-font-size-2xs);
        font-weight: var(--wa-font-weight-semibold, 600);
        line-height: 1.3;
        letter-spacing: 0.04em;

        color: var(--wa-color-success-on-loud, white);
        background-color: var(--wa-color-success-fill-loud, #2e7d32);
        user-select: none;
      }

      wa-icon[name="game-in-progress"] {
        position: absolute;
        inset-block-start: calc(var(--padding) - 0.5em);
        inset-inline-start: calc(var(--padding) - 0.5em);
        
        color: var(--wa-color-brand-fill-loud);
        &::part(svg) {
          fill: currentColor;
          
          @supports (paint-order: stroke) {
            /* Add a background outline to stand off from icon */
            stroke: var(--wa-color-surface-default);
            stroke-width: calc(2 * var(--wa-border-width-m));
            paint-order: stroke;
          }
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "catalog-card": CatalogCard;
  }

  interface HTMLElementEventMap {
    "favorite-change": FavoriteChangeEvent;
  }
}
