/**
 * One puzzle in the catalog, as a **list row**.
 *
 * This was a 64px-icon card in a `minmax(16rem, 1fr)` grid — about twelve games
 * per screen, so browsing all 57 meant scrolling three times. The Index
 * direction (`design-front-page-and-chrome` design.md §2, §4.2) trades the card
 * for a dense two-column list: 32px icon, name, objective on the same line, ~26
 * games per desktop screen and twelve on a phone.
 *
 * **The element keeps its name and its event.** `catalog-card` is what
 * `home-screen.ts` renders and `favorite-change` is what it listens for; only
 * the drawing changed, so nothing above had to learn a new vocabulary. The
 * `srcset` pair and the lazy `loading`/opacity fade are unchanged — the icons
 * are the committed 64/128 PNGs either way.
 *
 * **`Experimental` stopped being a rubber stamp.** The stamp was positioned
 * absolutely against a 64px icon and rotated; at 32px there is nowhere to put
 * it and nothing to rotate against, so it is a small label on the name line,
 * which also stops it covering the icon it used to sit on.
 */
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

  @property({ type: String })
  href = "";

  @property({ type: Boolean, attribute: "game-in-progress" })
  gameInProgress = false;

  @property({ type: Boolean })
  favorite = false;

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
      ? html`<wa-icon
          part="in-progress"
          name="game-in-progress"
          label="(Game in progress)"
        ></wa-icon>`
      : nothing;
  }

  protected override render() {
    // (The tabindex should be automatic for an <a>, but Safari seems to need it)
    return html`
      <a part="base" href=${this.href} draggable="false" tabindex="0">
        ${this.renderIcon()}
        <span part="name-line">
          <span part="title">${this.name}</span>
          ${this.renderGameInProgressBadge()}
        </span>
        <span part="description">${this.objective}</span>
        ${this.renderFavoriteToggle()}
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

  static override styles = [
    cssWATweaks,
    css`
      * {
        box-sizing: border-box;
      }

      :host {
        display: block;
        touch-action: manipulation;
        /* Big enough to read the puzzle *from*: at 32px these were a texture,
         * and the icon is the fastest way to recognize a game you have played
         * before. The committed PNGs are 64/128, so 48 is still served by the
         * 1x file on a plain display and the 2x on a dense one. */
        --icon-size: 48px;
      }

      [part="base"] {
        width: 100%;
        /* Fill the grid cell, so every rule in a row lands on the same line.
         * The host stretches (grid's default), but without this the row's own
         * box stayed content-height and its bottom border rose with it —
         * leaving the list ruled raggedly, one step per card. */
        height: 100%;
        min-height: var(--app-row-list);

        display: grid;
        grid-template-areas: "icon name favorite" "icon description favorite";
        grid-template-columns: var(--icon-size) minmax(0, 1fr) auto;
        grid-template-rows: auto auto;
        align-content: center;
        align-items: center;
        column-gap: 0.75rem;
        row-gap: 1px;

        padding-block: 0.375rem;
        padding-inline: 0.5rem;
        border-radius: var(--app-radius-control);

        color: var(--app-color-text);
        text-decoration: none;
        cursor: pointer;

        /* The rule between rows *is* the list's structure in this direction —
         * there are no card borders left to carry it. Drawn on the row rather
         * than the container so the two columns rule independently. */
        border-block-end: 1px solid var(--app-color-row-rule);

        &:focus-visible {
          outline: var(--wa-focus-ring);
          outline-offset: var(--wa-focus-ring-offset);
        }
      }

      /* A row is a tap target before it is a hover target: on a phone it grows
       * to the 64px row and never below the 44px floor. */
      @media (max-width: 40rem) {
        [part="base"] {
          min-height: var(--app-row-list-phone);
        }
      }

      @media (hover: hover) {
        [part="base"]:hover {
          background-color: var(--app-color-rail);
        }
      }

      [part="icon"] {
        grid-area: icon;
        width: var(--icon-size);
        height: var(--icon-size);
        border-radius: var(--app-radius-icon);

        opacity: 1;
        &.loading {
          opacity: 0;
        }
        transition: opacity var(--wa-transition-fast) var(--wa-transition-easing);
      }

      [part="name-line"] {
        grid-area: name;
        display: flex;
        align-items: center;
        gap: 0.375rem;
        min-width: 0;
      }

      [part="title"] {
        font-size: var(--app-font-size-item);
        font-weight: var(--wa-font-weight-semibold);
        line-height: var(--wa-line-height-condensed);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      [part="description"] {
        grid-area: description;
        font-size: var(--app-font-size-detail);
        color: var(--app-color-text-quiet);
        line-height: var(--wa-line-height-condensed);

        /* **Wrapped, not clipped.** A single clipped line ended in an ellipsis
         * for most of the catalog once the columns got narrower, and an
         * objective cut off mid-sentence is worse than no objective: it reads
         * as a defect and it teaches nothing.
         *
         * Three lines rather than two, measured rather than chosen: at the
         * narrowest track the grid produces (~344px, the two-column band around
         * 768px) two lines still clipped six of the 57, and three clips none of
         * them at any width. It is a *maximum* — the median objective is 57
         * characters and still takes one or two — so the extra line costs
         * nothing on the rows that do not need it. */
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        overflow: hidden;
      }


      [part="in-progress"] {
        flex: 0 0 auto;
        font-size: var(--app-font-size-detail);
        color: var(--app-color-link);
        &::part(svg) {
          fill: currentColor;
        }
      }

      [part="favorite"] {
        grid-area: favorite;
        color: var(--app-color-text-faintest);

        &::part(base) {
          padding: var(--wa-space-xs);
          height: auto;
          width: auto;
          min-height: var(--app-tap-min);
          min-width: var(--app-tap-min);
        }

        /* Filled when on — the heart is the only place a color other than the
         * link navy appears in a row, so it stays the accent's neighbor rather
         * than a second accent. */
        &[aria-pressed="true"] {
          color: var(--app-color-text-secondary);
          wa-icon::part(svg) {
            fill: currentColor;
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
