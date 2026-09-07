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
import { css, html, nothing, unsafeCSS } from "lit";
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
        ${settings.showIntro ? this.renderIntro() : nothing}
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
        <wa-dropdown>
          <wa-button slot="trigger" appearance="plain" variant="brand" with-caret>
            <wa-icon slot="start" name="options"></wa-icon>
            Options
          </wa-button>
          ${this.renderOptionsMenuContent()}
        </wa-dropdown>
        <wa-button href="help/" appearance="plain" variant="brand">
          <wa-icon name="help" slot="start"></wa-icon>
          Help
        </wa-button>
      </div>
    `;
  }

  private renderCompactHeader() {
    // When space is tight, turn the title into the options menu trigger
    // (but keep the separate help button)
    return html`
      <img class="logo" src="/favicon.svg" alt="" role="presentation">
      <div class="title">
        <wa-dropdown>
          <wa-button slot="trigger" appearance="plain" variant="brand" with-caret>
            <h1 translate="no">${APP_NAME}</h1>
          </wa-button>
          ${this.renderOptionsMenuContent()}
        </wa-dropdown>
      </div>
      <div class="subtitle">${APP_TAGLINE}</div>

      <div class="controls">
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

  private renderOptionsMenuContent() {
    return html`
      <wa-dropdown-item
          data-command="toggle-intro"
          type="checkbox"
          ?checked=${settings.showIntro}
      >
        Show intro message
      </wa-dropdown-item>
      <wa-divider></wa-divider>
      <wa-dropdown-item data-command="settings">
        <wa-icon slot="icon" name="settings"></wa-icon>
        Preferences
      </wa-dropdown-item>
      <wa-dropdown-item data-command="about">
        <wa-icon slot="icon" name="info"></wa-icon>
        About
      </wa-dropdown-item>
    `;
  }

  private renderIntro() {
    return html`
      <div part="intro">
        <slot name="intro"></slot>
      </div>
    `;
  }

  /**
   * The games with an auto-save — where the player actually left off.
   *
   * **Below the search box and the filters, not above them.** It sat above at
   * first, which put a list in front of the controls that govern the list — a
   * returning player met their own history before they met the way to look for
   * anything else. It is now the first rows *inside* the catalog, under the
   * controls, which is where a shortcut belongs relative to the thing it
   * shortcuts.
   *
   * Absent, not empty, when there are none: a heading over nothing is a
   * promise the page cannot keep, and a first-time visitor should meet the
   * catalog, not a hole where their history would go. Absent too while a
   * search or a filter is narrowing the list — the player has said what they
   * are looking for, and it is not "where was I".
   */
  private renderResume() {
    if (this.search.trim() || this.filter !== "all") {
      return nothing;
    }
    const inProgress = this.visibleIds.filter((id) =>
      savedGames.autoSavedPuzzles.has(id),
    );
    if (inProgress.length < 1) {
      return nothing;
    }
    return html`
      <div part="subsection">
        <h3 part="subheading">Continue</h3>
        <div part="list">
          ${repeat(
            inProgress,
            (id) => id,
            (id) => this.renderCatalogRow(id),
          )}
        </div>
      </div>
    `;
  }

  /** Every puzzle this player can see — the catalog, less the experimental ones
   * unless they asked for those. The search and the filters narrow *this*, so
   * neither can surface a game the setting hides. */
  private get visibleIds(): readonly string[] {
    return settings.showUnfinishedPuzzles
      ? puzzleIds
      : puzzleIds.filter((puzzleId) => !puzzleDataMap[puzzleId].unfinished);
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

        ${this.renderResume()}
        ${
          listed.length > 0
            ? html`<div part="subsection">
                ${
                  this.showsResumeAbove
                    ? html`<h3 part="subheading">All puzzles</h3>`
                    : nothing
                }
                <div part="list">
                  ${repeat(
                    listed,
                    (id) => id,
                    (id) => this.renderCatalogRow(id),
                  )}
                </div>
              </div>`
            : html`<p part="empty">${this.emptyMessage}</p>`
        }
      </section>
    `;
  }

  /** Whether a Continue block is above the full list — which is the only time
   * the list needs a heading of its own to say where Continue stopped. A lone
   * list under the search box needs no label; the search box already says what
   * it is a list of. */
  private get showsResumeAbove(): boolean {
    return (
      !this.search.trim() &&
      this.filter === "all" &&
      this.visibleIds.some((id) => savedGames.autoSavedPuzzles.has(id))
    );
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
    const { name, description, objective, unfinished } = puzzleDataMap[puzzleId];
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
        ?unfinished=${unfinished}
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
      "toggle-intro": this.toggleIntro,
      "switch-puzzle": this.openPuzzleSwitcher,
    });
  }

  private toggleIntro() {
    settings.showIntro = !settings.showIntro;
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
