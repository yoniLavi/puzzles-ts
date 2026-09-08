/**
 * The front page.
 *
 * Rebuilt to the Index direction (`design-front-page-and-chrome` design.md §4).
 * Four things changed, three of them defects measured against the running app:
 *
 * 1. **One content axis.** The intro was `max-width: 61ch; margin: 0 auto` and
 *    the catalog was `max-width: 75rem` from the left padding, so at desktop
 *    width the prose floated mid-viewport while the cards sat hard left — a
 *    visible jag down the page. Everything now shares one column and one left
 *    edge; the intro keeps a reading measure by *capping* its width, not by
 *    centering itself in a wider one.
 * 2. **A dense list instead of a card grid**, two columns at desktop and one on
 *    a phone: ~26 games a screen rather than ~12, so the collection can be
 *    browsed without three scrolls. The row is `catalog-card`, restyled.
 * 3. **Search and filters.** 57 games is more than a page of rows, and a player
 *    who knows what they want should not have to hunt. `All / Favorites /
 *    In progress` replaces the separate Favorites *section* — a section and a
 *    filter are two answers to one question, and the filter is the one that
 *    also covers "what have I got going?".
 * 4. **A Resume row.** `savedGames.autoSavedPuzzles` already knew which games
 *    are part-played and spent that knowledge on a corner badge. It is the
 *    first thing a returning player wants, so it is the first thing on the page.
 *
 * The search and filter state is deliberately **not** persisted: it is a way of
 * looking at this page right now, not a preference, and a player who returns to
 * a filtered catalog they do not remember setting has lost the other 50 games.
 */
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, unsafeCSS } from "lit";
import { customElement, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import type { FavoriteChangeEvent } from "../components/catalog-card.ts";
import rawHomeScreenCSS from "../css/home-screen.css?inline";
import { APP_NAME, APP_TAGLINE } from "../project-identity.ts";
import { puzzleDataMap, puzzleIds } from "../puzzle/catalog.ts";
import { matchesQuery } from "../puzzle/catalog-search.ts";
import { puzzlePageUrl } from "../routing.ts";
import { savedGames } from "../store/saved-games.ts";
import { settings } from "../store/settings.ts";
import { cssNative, cssWATweaks } from "../utils/css.ts";
import { ScrollAnimationController } from "../utils/scroll-animation-controller.ts";
import { Screen } from "./screen.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "../components/catalog-card.ts";
import "../components/command-link";
import "../components/dynamic-content.ts";
import "../components/puzzle-switcher.ts";

/** Which slice of the catalog the list is showing. */
type CatalogFilter = "all" | "favorites" | "in-progress";

const FILTERS: { id: CatalogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "favorites", label: "Favorites" },
  { id: "in-progress", label: "In progress" },
];

@customElement("home-screen")
export class HomeScreen extends SignalWatcher(Screen) {
  constructor() {
    super();
    // Fallback for shrinking sticky header using animation-timeline: scroll()
    new ScrollAnimationController(this, {
      scrollContainer: document.documentElement,
      animationElement: (): Element => this.shadowRoot?.querySelector("header") ?? this,
    });
  }

  @state()
  private search = "";

  @state()
  private filter: CatalogFilter = "all";

  protected override render() {
    // Deliberately skip <slot name="header"> and <slot="footer">
    // to substitute our interactive versions for the static ones in index.html.
    return html`
      <header part="header">
        <div part="header-inner">${
          this.size === "large" ? this.renderWideHeader() : this.renderCompactHeader()
        }</div>
      </header>

      <div part="page" @favorite-change=${this.handleFavoriteChange}>
        ${this.renderIntro()}
        ${this.renderCatalog()}
      </div>

      <footer slot="footer">
        <div>Credits, privacy info, copyright notices and licenses are in the
          <command-link command="about" hide-icon>about box</command-link>.</div>
        <div><small>In some countries, names of similar/related puzzles may be
          trademarks belonging to others. Use here does not imply affiliation
          or endorsement by their owners.</small></div>
      </footer>

      <puzzle-switcher></puzzle-switcher>
      <dynamic-content></dynamic-content>
    `;
  }

  private renderWideHeader() {
    // When we have space, render separate title, options menu, and help button
    return html`
      <img class="logo" src="/favicon.svg" alt="" role="presentation">
      <div class="title">
        <h1 translate="no">${APP_NAME}</h1>
      </div>
      <div class="subtitle">${APP_TAGLINE}</div>

      <div class="controls">
        <wa-button data-command="settings" appearance="plain" variant="brand">
          <wa-icon name="settings" slot="start"></wa-icon>
          Preferences
        </wa-button>
        <wa-button href="help/" appearance="plain" variant="brand">
          <wa-icon name="help" slot="start"></wa-icon>
          Help
        </wa-button>
      </div>
    `;
  }

  private renderCompactHeader() {
    // The title is a title. It used to be the options menu's trigger, which is
    // an odd thing for a page's own name to be; with the menu gone it has no
    // reason to be a control.
    return html`
      <img class="logo" src="/favicon.svg" alt="" role="presentation">
      <div class="title">
        <h1 translate="no">${APP_NAME}</h1>
      </div>
      <div class="subtitle">${APP_TAGLINE}</div>

      <div class="controls">
        <wa-button data-command="settings" appearance="plain" variant="brand">${
          this.size === "small"
            ? html`<wa-icon name="settings" label="Preferences"></wa-icon>`
            : html`
                <wa-icon name="settings" slot="start"></wa-icon>
                Preferences
              `
        }</wa-button>
        <wa-button href="help/" appearance="plain" variant="brand">${
          this.size === "small"
            ? html`<wa-icon name="help" label="Help"></wa-icon>`
            : html`
                <wa-icon name="help" slot="start"></wa-icon>
                Help
              `
        }</wa-button>
      </div>
    `;
  }

  /*
   * There is no Options menu.
   *
   * It held three items: a "Show intro message" checkbox, Preferences and
   * About. The intro is one line now, so a control for hiding it costs a player
   * more attention than it saves them — and with it gone the menu held two
   * items, which is a dropdown standing between the player and two taps.
   *
   * About did not need a home here: the footer already links to it in prose,
   * naming exactly what is inside ("Credits, privacy info, copyright notices
   * and licenses are in the about box"), which is a better signpost than a menu
   * row labeled "About" ever was.
   *
   * So Preferences is a button beside Help, and the compact header's title went
   * back to being a title rather than a menu trigger.
   */

  private renderIntro() {
    return html`
      <div part="intro">
        <slot name="intro"></slot>
      </div>
    `;
  }

  /*
   * There is no separate "Continue" block, deliberately.
   *
   * One was tried: the games with an auto-save, lifted to the top of the
   * catalog. It duplicates rows that are already in the list a screen below,
   * and it moves a game *out of alphabetical order* on the one page whose job
   * is to let you find a game by name — so the row you know is in the Cs is
   * suddenly at the top, and also still in the Cs.
   *
   * A game in progress is marked **in place** instead, by the blue triangle on
   * its row, exactly as a favorite is marked in place by its filled heart
   * (owner, 2026-09-07). The `In progress` filter is what turns that mark into
   * a list, and it costs one tap rather than a permanent second copy of part of
   * the catalog.
   */

  /** Every puzzle this player can see, which is all of them. The search and the
   * filters narrow *this*.
   *
   * It used to subtract the catalog's `unfinished` games unless a preference
   * asked for them. No puzzle has ever set that flag — all 57 ship finished, and
   * new games are implemented in one go — so the preference, this filter, the
   * card's badge and the puzzle screen's warning were four surfaces over an
   * empty set. */
  private get visibleIds(): readonly string[] {
    return puzzleIds;
  }

  /** The rows the list is showing, after the filter and the search box. */
  private get listedIds(): readonly string[] {
    return this.visibleIds.filter((puzzleId) => {
      switch (this.filter) {
        case "favorites":
          if (!settings.favoritePuzzles.has(puzzleId)) return false;
          break;
        case "in-progress":
          if (!savedGames.autoSavedPuzzles.has(puzzleId)) return false;
          break;
        case "all":
          break;
      }
      return matchesQuery(puzzleId, this.search);
    });
  }

  private renderCatalog() {
    const listed = this.listedIds;
    return html`
      <section part="section">
        <div part="catalog-controls">
          <label part="search">
            <wa-icon name="search" label="Search puzzles"></wa-icon>
            <input
                type="search"
                placeholder="Search ${this.visibleIds.length} puzzles"
                .value=${this.search}
                @input=${this.handleSearchInput}
            >
          </label>
          <div part="filters" role="group" aria-label="Show">
            ${FILTERS.map(
              ({ id, label }) => html`
                <button
                    part="filter"
                    type="button"
                    aria-pressed=${String(this.filter === id)}
                    @click=${() => {
                      this.filter = id;
                    }}
                >${label}</button>
              `,
            )}
          </div>
        </div>

        ${
          listed.length > 0
            ? html`<div part="list">
                ${repeat(
                  listed,
                  (id) => id,
                  (id) => this.renderCatalogRow(id),
                )}
              </div>`
            : html`<p part="empty">${this.emptyMessage}</p>`
        }
      </section>
    `;
  }

  /** Why the list is empty, in the words of whichever narrowing emptied it —
   * "no results" would leave a player who pressed Favorites by accident with
   * nothing to undo. */
  private get emptyMessage(): string {
    if (this.search.trim()) {
      return `No puzzle matches “${this.search.trim()}”.`;
    }
    return this.filter === "favorites"
      ? "No favorites yet — tap a heart to add one."
      : "No games in progress. Start one from All.";
  }

  private renderCatalogRow(puzzleId: string) {
    const { name, description, objective } = puzzleDataMap[puzzleId];
    const isFavorite = settings.favoritePuzzles.has(puzzleId);
    const href = puzzlePageUrl({ puzzleId });
    return html`
      <catalog-card
        puzzleid=${puzzleId}
        href=${href}
        name=${name}
        description=${description}
        objective=${objective}
        ?game-in-progress=${savedGames.autoSavedPuzzles.has(puzzleId)}
        ?favorite=${isFavorite}
      ></catalog-card>
    `;
  }

  private handleSearchInput(event: Event) {
    this.search = (event.target as HTMLInputElement).value;
  }

  //
  // Command handling
  //

  protected override registerCommandHandlers() {
    super.registerCommandHandlers();
    Object.assign(this.commandMap, {
      "switch-puzzle": this.openPuzzleSwitcher,
    });
  }

  /** The quick-switch, which works from here too: on the home screen it is a
   * faster search than the box, and it is the same one the puzzle screen
   * opens, so a player learns it once. */
  private openPuzzleSwitcher() {
    this.shadowRoot?.querySelector("puzzle-switcher")?.open();
  }

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleAppKeyDown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.handleAppKeyDown);
  }

  private handleAppKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.openPuzzleSwitcher();
    }
  };

  private handleFavoriteChange(event: FavoriteChangeEvent) {
    const { puzzleId, isFavorite } = event.detail;
    settings.setFavoritePuzzle(puzzleId, isFavorite);
  }

  //
  // Styles
  //

  static override styles = [
    cssWATweaks,
    cssNative,
    css`${unsafeCSS(rawHomeScreenCSS)}`,
    css`
      :host {
        display: block;
        box-sizing: border-box;
      }

      .title wa-button[slot="trigger"] {
        margin-block: calc(
          (var(--wa-font-size-xl) * var(--wa-line-height-condensed)
           - var(--wa-form-control-height)
          ) / 2
        );
        margin-inline: calc(-1 * (
            var(--wa-form-control-padding-inline) +
            var(--wa-border-width-s))
        );
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "home-screen": HomeScreen;
  }
}
