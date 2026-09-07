import { SignalWatcher } from "@lit-labs/signals";
import { css, html, nothing, type TemplateResult } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property, state } from "lit/decorators.js";
import { showAlert } from "../dialogs/alert-dialog.ts";
import { showToast } from "../dialogs/toast.ts";
import { type PuzzleData, puzzleDataMap } from "../puzzle/catalog.ts";
import type { PuzzleEvent } from "../puzzle/components/context.ts";
import type { PuzzleKeyUnhandledEvent } from "../puzzle/components/view-interactive.ts";
import type { Puzzle } from "../puzzle/puzzle.ts";
import { checkAndSave, quickLoadPuzzle } from "../puzzle/quick-save-actions.ts";
import { bareCommand, chordCommand } from "../puzzle/shortcuts.ts";
import { helpUrl, homePageUrl } from "../routing.ts";
import { savedGames } from "../store/saved-games.ts";
import { settings } from "../store/settings.ts";
import { cssWATweaks } from "../utils/css.ts";
import { closeOnBackdropClick } from "../utils/dialog.ts";
import { preventDoubleTapZoomOnButtons } from "../utils/events.ts";
import { debounced, sleep } from "../utils/timing.ts";
import { Screen } from "./screen.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/radio/radio.js";
import "@awesome.me/webawesome/dist/components/radio-group/radio-group.js";
import "@awesome.me/webawesome/dist/components/skeleton/skeleton.js";
import "../components/dynamic-content.ts";
import "../components/reference-panel.ts";
import "../puzzle/components/context.ts";
import "../puzzle/components/history.ts";
import "../puzzle/components/keys.ts";
import "../puzzle/components/type-menu.ts";
import "../puzzle/components/rail.ts";
import "../components/puzzle-switcher.ts";
import "../puzzle/components/view-interactive.ts";
import "../puzzle/components/end-notification.ts";

// How often to show the warning for unfinished puzzles, in milliseconds.
// (Maybe make this a setting: hourly, daily, weekly, never. Then default to 1 hour.)
const UNFINISHED_WARNING_REPEAT = 24 * 60 * 60 * 1000;

@customElement("puzzle-screen")
export class PuzzleScreen extends SignalWatcher(Screen) {
  /** The puzzle type, e.g. "blackbox" */
  @property({ type: String, attribute: "puzzleid" })
  puzzleId = "";

  /** A game ID or random seed, including encoded params */
  @property({ type: String, attribute: "gameid" })
  gameId?: string;

  /** Encoded params (ignored when puzzle-gameid provided) */
  @property({ type: String, attribute: "params" })
  params?: string;

  /** Dev-only icon-capture mode (set by `?screenshot`; see
   * `src/puzzle/icon-capture.ts`). Honored only in dev builds. */
  @property({ type: Boolean })
  screenshot = false;

  @state()
  private puzzleData?: PuzzleData;

  @state()
  private puzzleLoaded = false;

  @state()
  swapMouseButtons = false; // MouseButtonToggle current value

  /** Whether the (non-blocking) reference panel is docked open. Only meaningful
   * for a game whose `hasReference` is true (the toggle button only shows then). */
  @state()
  private referenceOpen = false;

  @query("puzzle-context")
  private puzzleContext?: HTMLElementTagNameMap["puzzle-context"];

  get puzzle(): Puzzle | undefined {
    return this.puzzleContext?.puzzle;
  }

  /** If the current game has been saved or loaded, its filename. */
  savedFilename?: string;
  savedGameId?: string;

  private _autoSaveFilename?: string;
  private get autoSaveFilename(): string | undefined {
    return this._autoSaveFilename;
  }
  private set autoSaveFilename(value: string | undefined) {
    // Persist autoSaveFilename in history state; restored in connectedCallback
    this._autoSaveFilename = value;
    const newState = {
      ...window.history.state,
      puzzleAutoSavePuzzleId: this.puzzleId,
      puzzleAutoSaveFilename: value,
    };
    window.history.replaceState(newState, "");
  }

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", preventDoubleTapZoomOnButtons);
    window.addEventListener("keydown", this.handleBubbledKeyDown);
    const { puzzleAutoSaveFilename, puzzleAutoSavePuzzleId } =
      window.history.state ?? {};
    if (
      typeof puzzleAutoSaveFilename === "string" &&
      puzzleAutoSavePuzzleId === this.puzzleId
    ) {
      this._autoSaveFilename = puzzleAutoSaveFilename;
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("click", preventDoubleTapZoomOnButtons);
    window.removeEventListener("keydown", this.handleBubbledKeyDown);
  }

  protected override willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("puzzleId") && this.puzzleId) {
      const data = puzzleDataMap[this.puzzleId];
      if (!data) {
        throw new Error(`Unknown puzzleId ${this.puzzleId}`);
      }
      this.puzzleData = data;
      this.autoSaveFilename = undefined;
      this.puzzleLoaded = false;
      this.referenceOpen = false; // a new puzzle type may have no reference
      this.defaultHelpLabel = `${this.puzzleData.name} Help`;
    }
  }

  protected override updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has("puzzleId")) {
      void this.showUnfinishedWarning();
    }
  }

  override render() {
    if (!this.puzzleData) {
      throw new Error("PuzzleScreen.render without puzzleData");
    }

    if (this.screenshot && import.meta.env.DEV) {
      return this.renderCaptureMode();
    }

    return html`
      <puzzle-context 
          puzzleid=${this.puzzleId}
          @puzzle-loaded=${this.handlePuzzleLoaded}
          @puzzle-params-change=${this.handlePuzzleParamsChange}
          @puzzle-game-state-change=${this.handlePuzzleGameStateChange}
      >
        <main class=${this.referenceOpen ? "reference-open" : nothing}>
          ${this.chrome === "rail" ? this.renderRail() : this.renderTopBar()}

          <div class="board-area">
            <puzzle-view-interactive
                role="figure"
                aria-label="interactive puzzle displayed as an image"
                ?longPress=${settings.rightButtonLongPress}
                ?swapMouseButtons=${this.swapMouseButtons}
                ?twoFingerTap=${settings.rightButtonTwoFingerTap}
                secondaryButtonAudioVolume=${settings.rightButtonAudioVolume}
                secondaryButtonHoldTime=${settings.rightButtonHoldTime}
                secondaryButtonDragThreshold=${settings.rightButtonDragThreshold}
                max-scale=${settings.maxScale}
                @puzzle-key-unhandled=${this.handleUnhandledPuzzleKey}
            >
              <wa-skeleton slot="loading" effect="sheen"></wa-skeleton>
            </puzzle-view-interactive>

            <div class="board-controls">
              ${
                settings.showPuzzleKeyboard
                  ? html`<puzzle-keys></puzzle-keys>`
                  : nothing
              }
              ${this.renderMouseButtonToggle()}
            </div>
          </div>

          ${this.chrome === "bar" ? this.renderPhoneChrome() : nothing}
          ${
            this.referenceOpen
              ? html`<reference-panel
                  @reference-close=${this.handleReferenceClose}
                ></reference-panel>`
              : nothing
          }
        </main>

        <puzzle-switcher current=${this.puzzleId}></puzzle-switcher>
        ${settings.showEndNotification ? this.renderEndNotification() : nothing}
        <dynamic-content></dynamic-content>
      </puzzle-context>
    `;
  }

  /** The desktop command surface. One `puzzle-rail`, drawn as a column. */
  private renderRail(): TemplateResult {
    return html`
      <puzzle-rail
          variant="rail"
          gameName=${this.puzzleData?.name ?? ""}
          helpHref=${helpUrl(this.puzzleId).href}
          ?reference-open=${this.referenceOpen}
          @click=${this.handleChromeClick}
      ></puzzle-rail>
    `;
  }

  /**
   * The phone's top bar: back, the game's name, its two parameter chips and
   * the move count. **Four items**, which is the point — the bar this replaces
   * was a non-wrapping flex row with no minimum-width budget, so at 390px
   * "Other puzzles" ran underneath Help and the type menu truncated to `7…`.
   * The overflow cannot recur here because the commands are not laid out
   * horizontally at all any more; they are in the bottom bar and behind it.
   */
  private renderTopBar(): TemplateResult {
    return html`
      <header class="top-bar">
        <a class="top-back" href="/" data-command="home" aria-label="All puzzles">
          <wa-icon name="back-to-catalog"></wa-icon>
        </a>
        <span class="top-name">${this.puzzleData?.name ?? ""}</span>
        <puzzle-type-menu
            class="top-chips"
            presentation="chips"
            placement="bottom"
        ></puzzle-type-menu>
        <puzzle-history class="top-counter" @click=${this.handleChromeClick}>
        </puzzle-history>
      </header>
    `;
  }

  /**
   * The phone's own chrome: the hint's words above the bar, then a persistent
   * bar of exactly five.
   *
   * **The explanation sits above the bar** so a thumb resting on the controls
   * cannot cover the sentence that explains the move — the whole point of an
   * explained hint. **`Check & save` holds a permanent slot** by owner request
   * (2026-09-07: *"I am very interested in it being in a highly accessible
   * quick-access position"*), outlined rather than filled so the hint stays the
   * one accent on the screen.
   */
  private renderPhoneChrome(): TemplateResult {
    const puzzle = this.puzzle;
    const explanation = puzzle?.activeHintExplanation || puzzle?.autoHintMessage;
    const status = puzzle?.wantsStatusbar ? puzzle.statusbarText : null;
    return html`
      ${
        // The nine games that print a status line need it while *playing*, not
        // behind a sheet: Flood's move limit and Mines' remaining count are
        // part of the board, not a command. So on a phone it rides above the
        // bar with the hint rather than in the rail, which is where the rail
        // is not.
        status ? html`<div class="phone-status" role="status">${status}</div>` : nothing
      }
      ${
        explanation
          ? html`<div class="phone-hint" role="status">
              ${
                puzzle?.hintJourney
                  ? html`<span class="phone-hint-journey">${puzzle.hintJourney}</span>`
                  : nothing
              }
              ${explanation}
            </div>`
          : nothing
      }
      <nav class="phone-bar" aria-label="Puzzle commands" @click=${this.handleChromeClick}>
        ${this.renderPhoneAction("undo", "undo", "Undo", !puzzle?.canUndo)}
        ${this.renderPhoneAction("redo", "redo", "Redo", !puzzle?.canRedo)}
        ${
          puzzle?.canHint
            ? html`
              <button
                  class="phone-action hint"
                  type="button"
                  data-command="hint"
                  ?disabled=${puzzle.status === "solved"}
              >
                <wa-icon name="hint"></wa-icon>
                <span>Next hint</span>
              </button>`
            : nothing
        }
        ${this.renderPhoneAction(
          "check-and-save",
          "check-and-save",
          "Check & save",
          false,
          "outlined",
        )}
        <button class="phone-action" type="button" @click=${this.openMoreSheet}>
          <wa-icon name="more"></wa-icon>
          <span>More</span>
        </button>
      </nav>

      <dialog
          class="more-sheet"
          @click=${this.handleSheetClick}
          @keydown=${this.handleSheetKeyDown}
      >
        <puzzle-rail
            variant="sheet"
            gameName=${this.puzzleData?.name ?? ""}
            helpHref=${helpUrl(this.puzzleId).href}
            ?reference-open=${this.referenceOpen}
        ></puzzle-rail>
      </dialog>
    `;
  }

  private renderPhoneAction(
    command: string,
    icon: string,
    label: string,
    disabled: boolean,
    variant?: "outlined",
  ): TemplateResult {
    return html`
      <button
          class=${variant ? `phone-action ${variant}` : "phone-action"}
          type="button"
          data-command=${command}
          ?disabled=${disabled}
      >
        <wa-icon name=${icon}></wa-icon>
        <span>${label}</span>
      </button>
    `;
  }

  /**
   * Minimal dev-only layout for `?screenshot` icon capture: just the
   * canvas plus a capture bar (re-roll the board, then capture both
   * committed icon PNGs). Keeps `puzzle-context` so the puzzle still
   * loads and renders. See `src/puzzle/icon-capture.ts`.
   */
  private renderCaptureMode(): TemplateResult {
    return html`
      <puzzle-context
          puzzleid=${this.puzzleId}
          @puzzle-loaded=${this.handlePuzzleLoaded}
          @puzzle-params-change=${this.handlePuzzleParamsChange}
          @puzzle-game-state-change=${this.handlePuzzleGameStateChange}
      >
        <main class="capture-mode">
          <header class="capture-bar">
            <span class="capture-title">Icon capture · ${
              this.puzzleData?.name ?? this.puzzleId
            }</span>
            <wa-button
                size="small" appearance="filled" variant="neutral"
                data-command="new-game"
            >
              <wa-icon slot="start" name="new-game"></wa-icon>
              New game
            </wa-button>
            <wa-button
                size="small" appearance="filled" variant="brand"
                data-command="capture-icons"
                ?disabled=${!this.puzzleLoaded}
            >
              <wa-icon slot="start" name="copy-image"></wa-icon>
              Capture icons
            </wa-button>
          </header>

          <puzzle-view-interactive
              role="figure"
              aria-label="interactive puzzle displayed as an image"
              max-scale=${settings.maxScale}
          >
            <wa-skeleton slot="loading" effect="sheen"></wa-skeleton>
          </puzzle-view-interactive>
        </main>

        <dynamic-content></dynamic-content>
      </puzzle-context>
    `;
  }

  private renderEndNotification() {
    const otherPuzzlesUrl = homePageUrl().href;
    return html`
      <puzzle-end-notification>
        <wa-button
            slot="extra-actions-solved"
            data-command="share"
        >
          <wa-icon slot="start" name="share"></wa-icon>
          Share
        </wa-button>
        <wa-button
            slot="extra-actions-solved"
            data-command="change-type"
        >
          <wa-icon slot="start" name="puzzle-type"></wa-icon>
          Change type
        </wa-button>
        <wa-button
            slot="extra-actions-solved"
            href=${otherPuzzlesUrl}
        >
          <wa-icon slot="start" name="back-to-catalog"></wa-icon>
          Other puzzles
        </wa-button>
      </puzzle-end-notification>
    `;
  }

  private renderMouseButtonToggle() {
    if (!settings.showMouseButtonToggle) {
      return nothing;
    }
    return html`
      <wa-radio-group
          id="mouse-button-toggle"
          appearance="button" 
          orientation="horizontal" 
          aria-label="Tap on puzzle means"
          .value=${this.swapMouseButtons ? "right" : "left"}
          @change=${() => {
            this.swapMouseButtons = !this.swapMouseButtons;
          }}
      >
        <wa-radio appearance="button" value="left"><wa-icon name="mouse-left-button" label="left click"></wa-radio>
        <wa-radio appearance="button" value="right"><wa-icon name="mouse-right-button" label="right click"></wa-radio>
      </wa-radio-group>
    `;
  }

  //
  // Commands
  //

  protected override registerCommandHandlers() {
    super.registerCommandHandlers();
    Object.assign(this.commandMap, {
      "capture-icons": this.handleCaptureIcons,
      "change-type": this.showTypeMenu,
      "check-and-save": this.handleCheckAndSave,
      "check-only": this.handleCheckOnly,
      "quick-load": this.handleQuickLoad,
      undo: () => this.puzzle?.undo(),
      redo: () => this.puzzle?.redo(),
      "mark-all": this.handleMarkAll,
      "toggle-auto-hint": this.handleAutoHintToggle,
      "show-timeline": this.showTimeline,
      "switch-puzzle": this.openPuzzleSwitcher,
      "copy-image": () => this.puzzle?.copyImage(),
      "enter-gameid": this.showEnterGameIDDialog,
      "load-game": this.showLoadGameDialog,
      "new-game": () => this.puzzle?.newGame(),
      redraw: () => this.shadowRoot?.querySelector("puzzle-view-interactive")?.redraw(),
      "restart-game": () => this.puzzle?.restartGame(),
      "save-game": this.showSaveGameDialog,
      "toggle-reference": this.toggleReference,
      share: this.showShareDialog,
      solve: () => this.puzzle?.solve(),
      hint: () => this.puzzle?.hint(),
    });
  }

  /**
   * Give the keyboard back to the board.
   *
   * Every control on this screen is a one-shot action on the puzzle, and the
   * board is what the player wants to be typing at once it has run. Without
   * this it isn't: the game menu focuses its own trigger button as it closes,
   * a clicked toolbar button keeps focus on itself, and the stray-key redirect
   * in `handleBubbledKeyDown` only steps in when *nothing at all* is focused.
   * So a single click on any control left the board deaf to the keyboard until
   * you clicked it again — Enter reopened the menu, and the cursor keys went
   * nowhere. Inertia shows this up worst (its solution-following aid is
   * literally "pick Solve from the menu, then press Enter to walk the route"),
   * but it swallowed the cursor keys in every keyboard-playable game.
   *
   * Always deferred a microtask, because both `wa-dropdown` (as it closes) and
   * a clicked button focus themselves out from under us otherwise.
   */
  private focusBoard() {
    queueMicrotask(() => {
      this.shadowRoot
        ?.querySelector("puzzle-view-interactive")
        ?.focus({ preventScroll: true });
    });
  }

  /**
   * Commands — the game menu, and every `data-command` control.
   *
   * Commands that open a dialog need no exception: the dialog takes focus for
   * itself when it opens, and because we moved focus first it hands it back to
   * the *board* when it closes, rather than to whichever button opened it.
   */
  protected override handleCommand(command: string): boolean {
    const handled = super.handleCommand(command);
    if (handled) {
      // A command chosen from the phone sheet has been chosen: the sheet is a
      // menu, and a menu that stays open over the result of its own command is
      // covering the thing the player asked to see.
      this.closeMoreSheet();
      this.focusBoard();
    }
    return handled;
  }

  /**
   * A click anywhere in the chrome hands the keyboard back to the board.
   *
   * Two things must NOT hand focus over. A click that *opens* a menu, because
   * the open menu needs the focus for its own arrow-key navigation — hence the
   * `slot="trigger"` test. And a keyboard activation (tab to the control, press
   * Enter), which arrives as a click with `detail === 0`: that user is moving
   * through the tab order deliberately and would not thank us for throwing them
   * out of it. Only a real pointer click hands the keyboard back.
   *
   * This is separate from `handleCommand`'s own `focusBoard` because a control
   * may be a `data-command` *and* a menu trigger; the composed-path test is
   * what tells them apart, and only a real event carries a path.
   */
  private handleChromeClick = (event: MouseEvent) => {
    if (event.detail === 0) return;
    const opensAMenu = event
      .composedPath()
      .some((el) => el instanceof HTMLElement && el.getAttribute("slot") === "trigger");
    if (!opensAMenu) this.focusBoard();
  };

  /** Toggle the non-blocking reference panel (the toolbar reference button and
   * the game menu both route here via `data-command="toggle-reference"`).
   * Closing deliberately KEEPS any board spotlight: on a small screen the common
   * flow is mark a domino, close the (large) panel to see the board, then place
   * it. Escape (or re-clicking the chip) clears the spotlight. */
  private toggleReference() {
    this.referenceOpen = !this.referenceOpen;
  }

  private handleReferenceClose = () => {
    this.referenceOpen = false;
  };

  private async showShareDialog(panel?: string) {
    await import("../dialogs/share-dialog.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "share-dialog",
      render: () => html`<share-dialog></share-dialog>`,
    });
    if (dialog && !dialog.open) {
      await dialog.reset();
      dialog.open = true;
    }
    if (dialog && panel) {
      await dialog.updateComplete;
      await dialog.showPanel(panel);
    }
  }

  private async showLoadGameDialog() {
    await import("../dialogs/saved-game-dialogs.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "load-game-dialog",
      render: () => html`
        <load-game-dialog
            puzzleid=${this.puzzleId}
            @load-game-import=${this.handleImportGame}
            @load-game-load=${this.handleLoadGame}
        ></load-game-dialog>
      `,
    });
    if (dialog && !dialog.open) {
      const puzzle = this.shadowRoot?.querySelector("puzzle-context")?.puzzle;
      dialog.gameInProgress = (puzzle?.totalMoves ?? 0) > 0;
      dialog.open = true;
    }
  }

  private async showSaveGameDialog() {
    await import("../dialogs/saved-game-dialogs.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "save-game-dialog",
      render: () => html`
        <save-game-dialog
            puzzleid=${this.puzzleId}
            @save-game-export=${this.handleExportGame}
            @save-game-save=${this.handleSaveGame}
        ></save-game-dialog>
      `,
    });
    if (dialog && !dialog.open) {
      dialog.filename =
        this.savedFilename ?? (await savedGames.makeUntitledFilename(this.puzzleId));
      dialog.open = true;
    }
  }

  private async showEnterGameIDDialog() {
    await import("../dialogs/enter-gameid-dialog.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "enter-gameid-dialog",
      render: () => html`<enter-gameid-dialog></enter-gameid-dialog>`,
    });
    if (dialog && !dialog.open) {
      dialog.reset();
      dialog.open = true;
    }
  }

  private handleLoadGame = async (event: HTMLElementEventMap["load-game-load"]) => {
    // (dynamic-content event listener: must be self-bound function)
    const dialog = event.target as HTMLElementTagNameMap["load-game-dialog"];
    const { filename } = event.detail;
    const puzzle = this.shadowRoot?.querySelector("puzzle-context")?.puzzle;
    if (puzzle && filename) {
      event.preventDefault(); // we'll close the dialog if successful
      const { error, gameId } = await savedGames.loadGame(puzzle, filename);
      if (error !== undefined) {
        // TODO: display error in dialog (like enter-gameid-dialog does)
        await showAlert({
          label: "Unable to load game",
          message: error,
          type: "error",
        });
      } else if (gameId) {
        this.savedGameId = gameId;
        this.savedFilename = filename;
        dialog.open = false;
      }
    }
  };

  private handleSaveGame = async (event: HTMLElementEventMap["save-game-save"]) => {
    // (dynamic-content event listener: must be self-bound function)
    const dialog = event.target as HTMLElementTagNameMap["save-game-dialog"];
    const { filename } = event.detail;
    const puzzle = this.shadowRoot?.querySelector("puzzle-context")?.puzzle;
    if (puzzle && filename) {
      event.preventDefault(); // we'll close the dialog if successful
      await savedGames.saveGame(puzzle, filename);
      this.savedGameId = puzzle.currentGameId;
      this.savedFilename = filename;
      dialog.open = false;
    }
  };

  private handleImportGame = async (
    _event: HTMLElementEventMap["load-game-import"],
  ) => {
    // (dynamic-content event listener: must be self-bound function)
    const puzzle = this.shadowRoot?.querySelector("puzzle-context")?.puzzle;
    if (puzzle) {
      const input = Object.assign(document.createElement("input"), {
        type: "file",
        multiple: false,
        accept: ".sav,.sgt,.sgtpuzzle,.txt",
        onchange: async () => {
          const file = input.files?.[0];
          if (file) {
            const data = new Uint8Array(await file.arrayBuffer());
            const errorMessage = await puzzle.loadGame(data);
            if (errorMessage) {
              await showAlert({
                label: "Unable to import game",
                message: `${file.name}: ${errorMessage}`,
                type: "error",
              });
            }
          }
        },
        onerror: async (error: unknown) => {
          await showAlert({
            label: "Unable to import game",
            message: String(error),
            type: "error",
          });
        },
      });
      input.click();
    }
  };

  private handleExportGame = async (event: HTMLElementEventMap["save-game-export"]) => {
    // (dynamic-content event listener: must be self-bound function)
    const puzzle = this.shadowRoot?.querySelector("puzzle-context")?.puzzle;
    if (puzzle) {
      const type = "application/octet-stream"; // or text/plain, or a type registered to us (upstream uses octet-stream)
      const data = await puzzle.saveGame();
      const blob = new Blob([data], { type });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toLocaleString();
      const filename = event.detail.filename || `${puzzle.displayName} ${dateStr}`;
      const anchor = Object.assign(document.createElement("a"), {
        href: url,
        download: `${filename}.sav`,
        type,
      });
      anchor.click();
      await sleep(10);
      URL.revokeObjectURL(url);
    }
  };

  private async handleCaptureIcons() {
    // Dev-only: produce the two committed icon PNGs from the live board.
    // (A prototype method, not an arrow field, so it is defined when the
    // base-class constructor calls registerCommandHandlers.)
    const puzzle = this.puzzle;
    if (!puzzle) return;
    const { captureIcons } = await import("../puzzle/icon-capture.ts");
    await captureIcons(puzzle, this.puzzleId);
  }

  /**
   * Combined Check-&-Save (shared with the toolbar button and Cmd/Ctrl+S
   * — logic in `quick-save-actions.ts`). A prototype method, not an arrow
   * field, so it is defined when the base-class constructor calls
   * `registerCommandHandlers`.
   */
  private async handleCheckAndSave() {
    if (this.puzzle) await checkAndSave(this.puzzle);
  }

  /** Restore the quick-save slot for the current puzzle — `Back to last save`. */
  private async handleQuickLoad() {
    if (this.puzzle) await quickLoadPuzzle(this.puzzle);
  }

  /**
   * `Check without saving` — the quiet sibling of Check & save, and the first
   * caller of `findMistakes` other than it.
   *
   * The combined command is deliberate and is what most players want: it
   * verifies first and refuses to save over a mistake, so a saved checkpoint is
   * a known-good one. What it cannot serve is a narrow case created by the
   * store: **the quick-save slot is one per puzzle**, so checking overwrites
   * it. A player who saved deliberately before a speculative branch, and then
   * checks while the board is still consistent, silently loses the position
   * they were keeping. That player wants this.
   *
   * The engine has already highlighted the mistakes by the time this resolves,
   * so the report is a non-blocking toast either way — including the clean
   * case, which the combined command reports too. An interrupting modal is what
   * Check & save uses to say "and I did not save"; there is nothing here to not
   * do, so there is nothing to interrupt for.
   */
  private async handleCheckOnly() {
    const puzzle = this.puzzle;
    if (!puzzle?.canFindMistakes) return;
    const n = await puzzle.findMistakes();
    showToast(
      n > 0
        ? {
            label: `${n} mistake${n === 1 ? "" : "s"} found`,
            message:
              `The problem ${n === 1 ? "cell is" : "cells are"} highlighted. ` +
              "Your last save is untouched.",
            type: "warning",
          }
        : {
            label: "No mistakes",
            message: "Nothing on the board is wrong so far.",
            type: "success",
          },
    );
  }

  /** Inject the 'M' key (ASCII 77): the game's adaptive Mark-all press — fill
   * every cell that has no pencil marks yet, else clear the candidates already
   * ruled out by a placed value. Only ever adds or removes, so a press can't
   * undo the player's own deductions. Only games with `canMarkAll` show this
   * control. */
  private async handleMarkAll() {
    await this.puzzle?.processKey(77);
  }

  /** `Play hints for me` — a mode, so the rail draws it as a switch. */
  private handleAutoHintToggle() {
    const puzzle = this.puzzle;
    if (!puzzle) return;
    if (puzzle.autoHintActive) {
      puzzle.stopAutoHint();
    } else {
      puzzle.startAutoHint();
    }
  }

  /**
   * Open the timeline.
   *
   * The move counter *is* the control, so a real click on it opens its own
   * dropdown and never reaches here; this exists for the command bus — a
   * keyboard shortcut, or any other surface that wants to name the timeline —
   * and it drives the same dropdown rather than a second copy of it.
   */
  private showTimeline() {
    const history = this.shadowRoot?.querySelector("puzzle-history");
    history?.showTimeline();
  }

  /** The quick-switch, shared with the home screen: `Ctrl/Cmd+K`, and the
   * `Switch puzzle…` row in `More…` so touch keeps the capability the
   * `Other puzzles` menu used to provide. */
  private openPuzzleSwitcher() {
    this.shadowRoot?.querySelector("puzzle-switcher")?.open();
  }

  /** The phone's `More…`: the rail, as a sheet, in the same order. */
  private openMoreSheet = () => {
    this.shadowRoot?.querySelector<HTMLDialogElement>(".more-sheet")?.showModal();
  };

  private closeMoreSheet() {
    this.shadowRoot?.querySelector<HTMLDialogElement>(".more-sheet")?.close();
  }

  /** Escape closes the sheet and goes no further — the board must not also see
   * it and drop a reference spotlight the player never asked to lose. */
  private handleSheetKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") event.stopPropagation();
  };

  /** A tap in the sheet does both jobs: outside the panel it dismisses, inside
   * it hands the keyboard back like any other chrome click. */
  private handleSheetClick = (event: MouseEvent) => {
    closeOnBackdropClick(event);
    this.handleChromeClick(event);
  };

  private async showTypeMenu() {
    // (from the button in the puzzle-end-notification)
    await this.shadowRoot?.querySelector("puzzle-end-notification")?.hide();
    this.shadowRoot?.querySelector("puzzle-type-menu")?.show();
  }

  private async handlePuzzleLoaded(event: PuzzleEvent) {
    const { puzzle } = event.detail;
    event.preventDefault(); // We'll set up our own new game (or restore one from autoSave)

    await settings.loaded;
    const prefs = await settings.getPuzzlePreferences(puzzle.puzzleId);
    await puzzle.setPreferences(prefs);

    // Set up the default params for all new games in this session.
    // Prefer the url's ?type=<params> if provided from the router and valid.
    // Otherwise, try the last used params stored in our settings.
    // (If nothing works, every puzzle has its own defaults.)
    // This applies even when puzzleGameId is provided, to set the default
    // params for subsequent new games.
    const settingsParams = await settings.getParams(puzzle.puzzleId);
    for (const params of [this.params, settingsParams]) {
      if (params) {
        const error = await puzzle.setParams(params);
        if (!error) {
          break; // successfully set default params
        }
        console.warn(
          `Error setting puzzle ${puzzle.puzzleId} params to "${params}": ` +
            `${error}. Ignoring.`,
        );
        if (params === settingsParams) {
          // Don't try those again
          await settings.setParams(puzzle.puzzleId, undefined);
        } else {
          void showAlert({
            label: `Ignoring invalid type in URL`,
            message: `type=${params}: ${error}`,
            type: "warning",
          });
        }
      }
    }

    // TODO: restore custom presets from settings

    // Ensure there's a game, from (in order of preference)
    // - puzzleGameId (URL hash from router)
    // - the most recent autoSave
    // - the board this puzzle last dealt
    // - a new game
    let hasGame = false;

    if (this.gameId) {
      const error = await puzzle.newGameFromId(this.gameId);
      if (!error) {
        hasGame = true;
        this.autoSaveFilename = savedGames.makeAutoSaveFilename();
      } else {
        void showAlert({
          label: `Ignoring invalid id in URL`,
          message: `id=${this.gameId}: ${error}`,
          type: "warning",
        });
      }
    }

    if (!this.autoSaveFilename) {
      this.autoSaveFilename = await savedGames.findMostRecentAutoSave(puzzle.puzzleId);
    }
    if (!hasGame && !this.params && this.autoSaveFilename) {
      // Restore a recent autosave, unless params in url (which might not match)
      hasGame = await savedGames.restoreAutoSavedGame(puzzle, this.autoSaveFilename);
    }

    if (!hasGame && !this.params) {
      // No autosave, which means no move was ever made on the board this puzzle
      // was last showing — so re-deal *that* board rather than a new one. Same
      // `!this.params` condition as the autosave above: a type asked for in the
      // URL wins over a remembered board that may not match it.
      const lastGameId = await settings.getLastGameId(puzzle.puzzleId);
      if (lastGameId) {
        const error = await puzzle.newGameFromId(lastGameId);
        if (error) {
          // The player never asked for this board, so its loss is not a decision
          // to put in front of them — unlike the URL case above, which alerts.
          // Forget it so the next load does not retry, and deal a fresh game.
          console.warn(
            `Dropping unusable remembered board for ${puzzle.puzzleId}: ` +
              `${lastGameId}: ${error}`,
          );
          await settings.setLastGameId(puzzle.puzzleId, undefined);
        } else {
          hasGame = true;
        }
      }
    }

    if (!hasGame) {
      await puzzle.newGame();
    }

    this.puzzleLoaded = true;
    await this.shadowRoot?.querySelector("puzzle-context")?.updateComplete;
  }

  private async handlePuzzleParamsChange(event: PuzzleEvent) {
    // (Ignore params change as puzzle is loading -- that's its default value.)
    const { puzzle } = event.detail;
    if (
      this.puzzleLoaded &&
      puzzle.params &&
      puzzle.params !== (await settings.getParams(puzzle.puzzleId))
    ) {
      await settings.setParams(puzzle.puzzleId, puzzle.params);
    }
  }

  @debounced(250)
  private async handlePuzzleGameStateChange(event: PuzzleEvent) {
    const { puzzle } = event.detail;
    if (puzzle.currentGameId) {
      if (puzzle.currentGameId !== this.savedGameId) {
        this.savedFilename = undefined;
        this.savedGameId = puzzle.currentGameId;
        // Remember the board itself, so reopening this puzzle shows it again
        // rather than dealing a new one. Inside this guard rather than beside
        // it: the handler fires on every state change, so an unguarded write
        // would put a DB round-trip behind every move to store a value that did
        // not change. Not an autosave — see `PuzzleSettings.lastGameId`.
        //
        // `restoreGameId`, NOT `currentGameId`: the latter is the id to share,
        // and it omits difficulty by design, so remembering it re-opened every
        // tiered puzzle at its default tier and then wrote that tier back into
        // settings. `currentGameId` stays the change-detection key above — it
        // changes exactly when the board does, and it is what `savedGameId` has
        // always compared.
        await settings.setLastGameId(puzzle.puzzleId, puzzle.restoreGameId);
      }
      if (puzzle.totalMoves > 0 && !puzzle.isSolved) {
        // Wait to autosave until the user has made at least one actual move,
        // to avoid autosaving from just browsing through puzzles.
        this.autoSaveFilename ??= savedGames.makeAutoSaveFilename();
        await savedGames.autoSaveGame(puzzle, this.autoSaveFilename);
      } else if (this.autoSaveFilename) {
        // Don't retain autosave for solved or unstarted puzzle.
        const autoSaveFilename = this.autoSaveFilename;
        this.autoSaveFilename = undefined;
        await savedGames.removeAutoSavedGame(puzzle, autoSaveFilename);
      }
    }
  }

  /**
   * The always-on chords, from `shortcuts.ts` — the same table the rail reads
   * to label each row, so a shown key is a bound key by construction.
   *
   * `preventDefault` on a match, which is what suppresses the browser's own
   * `Ctrl/Cmd+S` save dialog; the modifier means these can never collide with a
   * game's letter input, because the board declines a key with Ctrl held
   * (`wantsKeyEvent`).
   */
  private handleBubbledKeyDown = async (event: KeyboardEvent) => {
    const chord = chordCommand(event);
    if (chord) {
      event.preventDefault();
      this.handleCommand(chord);
      return;
    }
    // Escape clears a reference spotlight — the quick dismiss for a highlight
    // that (deliberately) persists after the panel is closed. When the panel is
    // open, route through it so the chip deselects too; when closed, clear the
    // board spotlight directly. Doesn't preventDefault/stop, so it still
    // composes with any other Escape handling (e.g. closing a dialog).
    if (event.key === "Escape") {
      const panel = this.shadowRoot?.querySelector("reference-panel");
      if (panel) panel.clearSelection();
      else if (this.puzzle?.hasReference) void this.puzzle.selectReference(null);
    }
    // If a key event arrives at the document when nothing else is focused,
    // focus the puzzle and redirect the event to it.
    if (event.key === "Tab") {
      // Don't redirect keyboard navigation
      return;
    }
    const activeElement = document.activeElement;
    if (activeElement === document.body || activeElement === document.documentElement) {
      // Only redirect keys that are potentially handled by the puzzle.
      // (Don't focus the puzzle on Shift or Alt or NextTrack or FnLock.)
      const puzzleView = this.shadowRoot?.querySelector("puzzle-view-interactive");
      if (puzzleView?.wantsKeyEvent(event)) {
        puzzleView.focus();
        await puzzleView.handleKeyEvent(event);
      }
    }
  };

  /**
   * A bare letter the game turned down.
   *
   * This is where `u` / `r` / `n` / `h` become Undo / Redo / New game / Next
   * hint — **after** the game has had the key and declined it, which is what
   * makes the suppression a derivation rather than a roster. Undead keeps its
   * `z`/`v`/`g`, Salad keeps its letters, and neither had to say so anywhere.
   *
   * Behind `settings.oneKeyShortcuts` (default on), the same preference
   * upstream's `midend.c` carries — but where upstream must intercept the key
   * *before* the game runs, and therefore takes the letter away from every game
   * whenever the preference is on, this only ever spends a keypress nothing
   * else wanted.
   */
  private handleUnhandledPuzzleKey = (event: PuzzleKeyUnhandledEvent) => {
    if (!settings.oneKeyShortcuts) return;
    const command = bareCommand(event.detail);
    if (command) this.handleCommand(command);
  };

  private async showUnfinishedWarning() {
    // Show an alert for unfinished puzzles, at most once per UNFINISHED_WARNING_REPEAT.
    if (this.puzzleId && this.puzzleData?.unfinished) {
      await settings.loaded;
      const lastShown = await settings.getLastUnfinishedAlert(this.puzzleId);
      const now = Date.now();
      if (lastShown === undefined || now - lastShown > UNFINISHED_WARNING_REPEAT) {
        await settings.setLastUnfinishedAlert(this.puzzleId, now);
        await showAlert({
          label: "Experimental puzzle",
          message:
            // showAlert doesn't support html. (Could render alert-dialog instead.)
            `“${this.puzzleData.name}” is an experimental, unfinished puzzle.` +
            " Don’t be surprised if you find bugs or unexpected behavior." +
            " (Check “Help” for the current status.)",
          type: "warning",
          icon: "unfinished",
          lightDismiss: true,
        });
      }
    }
  }

  //
  // Styles
  //

  static override styles = [
    cssWATweaks,
    css`
      :host {
        display: block;
        box-sizing: border-box;
        /* Dynamic viewport units Baseline 2023 */
        width: 100vw;
        height: 100vh;
        width: 100dvw;
        height: 100dvh;
      }
      
      main {
        height: 100%;
        box-sizing: border-box;
        position: relative;
  
        display: flex;
        flex-direction: column;
        align-items: stretch;
  
        background-color: var(--wa-color-brand-fill-quiet);
        color: var(--wa-color-text-normal);
      }

      /* When the non-blocking reference panel is docked, reserve space for it so
       * the ResizeController-driven canvas reflows smaller and stays fully
       * visible/interactive beside (wide) or above (narrow) the panel. The
       * conditions mirror reference-panel.ts's :host media query: a side dock by
       * default, a bottom sheet on a narrow viewport OR in "horizontal"
       * orientation (short landscape, where a side dock would shove the board
       * off-center against the toolbar column). */
      main.reference-open {
        padding-inline-end: min(340px, 42vw);
      }
      @media (max-width: 640px) {
        main.reference-open {
          padding-inline-end: 0;
          padding-block-end: min(45vh, 22rem);
        }
      }
      :host([orientation="horizontal"]) main.reference-open {
        padding-inline-end: 0;
        padding-block-end: min(45vh, 22rem);
      }

      /* Dev-only icon-capture mode (?screenshot). */
      .capture-bar {
        align-items: center;
        gap: var(--wa-space-s);
        padding: var(--wa-space-xs) var(--wa-space-s);
        background-color: var(--app-theme-color);

        .capture-title {
          margin-inline-end: auto;
          font-weight: var(--wa-font-weight-semibold);
        }
      }

      /*
       * Two layouts, chosen by --app-chrome (common.css).
       *
       * rail: a 284px command column beside the board.
       * bar:  a four-item top bar, the board, and a five-slot bottom bar.
       *
       * The board area is the flex child that grows in both, which is the fix
       * for the third finding behind this redesign: the canvas used to be
       * centered small inside a gray panel that filled the whole flex region,
       * so at desktop width the board was roughly a third of its own panel,
       * framed by dead surface.
       */

      :host([chrome="rail"]) main {
        flex-direction: row;
      }

      /* The 284px column, and only there: the same component is the phone's
       * More sheet, which wants the whole width. Scoped by the layout
       * attribute rather than by the component, so one selector cannot make the
       * sheet a narrow strip in the middle of a phone. */
      :host([chrome="rail"]) puzzle-rail {
        flex: 0 0 284px;
        max-width: 284px;
        overflow-y: auto;
        background-color: var(--app-color-rail);
        border-inline-end: 1px solid var(--app-color-hairline);
      }

      .board-area {
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        padding: var(--app-spacing);
        gap: var(--app-spacing);
      }

      .board-controls {
        flex: 0 0 auto;
        display: flex;
        align-items: end;
        justify-content: center;
        gap: var(--app-spacing);

        /* Empty for most games (no keypad, no button toggle): collapse rather
         * than leaving a gap under the board. */
        &:empty {
          display: none;
        }
      }

      puzzle-view-interactive {
        flex: 1 1 auto;
        min-height: 5rem; /* allows flexing */
        min-width: 5rem;

        --spacing: var(--app-spacing);
        --background-color: var(--wa-color-surface-default);
        --border-radius: var(--app-radius-container);
      }

      /* The phone's top bar: back, name, chips, move count. Four items, which
       * is why the overflow that broke the old header at 390px cannot recur. */
      .top-bar {
        flex: 0 0 auto;
        box-sizing: border-box;
        width: 100%;
        display: flex;
        align-items: center;
        gap: var(--wa-space-s);
        padding-inline: var(--wa-space-m);
        padding-block: var(--wa-space-2xs);
        background-color: var(--app-color-rail);
        border-block-end: 1px solid var(--app-color-hairline);
      }

      .top-back {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: var(--app-tap-min);
        min-height: var(--app-tap-min);
        color: var(--app-color-text-quiet);
        text-decoration: none;
      }

      .top-name {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--app-font-size-item);
        font-weight: var(--wa-font-weight-bold);
      }

      .top-chips {
        flex: 0 1 auto;
        min-width: 0;
      }

      .top-counter {
        flex: 0 0 auto;
        margin-inline-start: auto;
      }

      /* The status line and the hint sit ABOVE the bar, where a thumb resting
       * on the controls cannot cover them — the whole point of an explained
       * hint is that it can be read. */
      .phone-status,
      .phone-hint {
        flex: 0 0 auto;
        margin-inline: var(--app-spacing);
        margin-block-end: var(--wa-space-2xs);
        font-size: var(--app-font-size-support);
        line-height: var(--wa-line-height-normal);
      }

      .phone-status {
        text-align: center;
        color: var(--app-color-text-secondary);
        font-variant-numeric: tabular-nums;
      }

      .phone-hint {
        padding: 0.5rem 0.625rem;
        border: 1px solid var(--app-color-hint-border);
        border-radius: var(--app-radius-hint);
        background-color: var(--app-color-hint-surface);
        color: var(--app-color-hint-ink);
      }

      .phone-hint-journey {
        display: block;
        font-family: var(--app-font-mono);
        font-size: var(--app-font-size-micro);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        opacity: 0.75;
      }

      .phone-bar {
        flex: 0 0 auto;
        display: flex;
        align-items: stretch;
        gap: var(--wa-space-2xs);
        padding: var(--wa-space-2xs);
        /* Below the home indicator on a phone with one. */
        padding-block-end: max(var(--wa-space-2xs), env(safe-area-inset-bottom));
        background-color: var(--app-color-rail);
        border-block-start: 1px solid var(--app-color-hairline);
      }

      .phone-action {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        min-width: var(--app-tap-min);
        min-height: var(--app-row-tool-phone);
        padding-inline: 0.5rem;
        border: 1px solid transparent;
        border-radius: var(--app-radius-control);
        background: none;
        color: var(--app-color-text);
        font: inherit;
        font-size: var(--app-font-size-micro);
        cursor: pointer;
        touch-action: pinch-zoom;

        &:disabled {
          color: var(--app-color-text-faintest);
        }

        wa-icon {
          font-size: 1.125rem;
        }

        span {
          white-space: nowrap;
        }
      }

      /* Next hint takes the free space and is the one filled control on the
       * screen: it is what this fork is for. */
      .phone-action.hint {
        flex: 1 1 auto;
        flex-direction: row;
        gap: 0.375rem;
        background-color: var(--app-color-accent);
        color: var(--app-color-hint-ink);
        font-size: var(--app-font-size-body);
        font-weight: var(--wa-font-weight-semibold);

        &:disabled {
          background-color: var(--app-color-row-rule);
          color: var(--app-color-text-faintest);
        }
      }

      /* Check & save holds a permanent slot by owner request, outlined rather
       * than filled so the hint stays the only accent. */
      .phone-action.outlined {
        border-color: var(--app-color-control-border);
      }

      .more-sheet {
        width: 100%;
        max-width: none;
        max-height: 80dvh;
        margin: 0;
        margin-block-start: auto;
        padding: 0;
        border: none;
        border-start-start-radius: var(--app-radius-container);
        border-start-end-radius: var(--app-radius-container);
        background-color: var(--app-color-rail);
        color: var(--app-color-text);
        overflow-y: auto;

        &::backdrop {
          background-color: var(--wa-color-overlay-modal);
        }
      }

      puzzle-end-notification {
        &::part(dialog) {
          /* Position at bottom, aligned with puzzle controls */
          margin-block-end: var(--app-padding);
        }

        :has(share-dialog[open]) & {
          /* Hide the end notification and its extra backdrop
           * while share-dialog is open above it */
          --opacity: 0;
        }

        & wa-button::part(label) {
          /* Align icons at left of buttons, center labels */
          flex: 1 1 auto;
          text-align: center;
        }
      }

      /* Short landscape: the keypad reads better as a column beside the board
       * than as a row under it. The rail is already a column, so nothing else
       * needs to change here — which is the point of deciding the chrome on
       * width alone rather than on orientation. */
      :host([orientation="horizontal"]) {
        .board-area {
          flex-direction: row;
        }
        puzzle-keys::part(group) {
          flex-direction: column;
        }
      }
      wa-skeleton {
        --color: var(--wa-color-brand-fill-quiet);
        --sheen-color: var(--wa-color-brand-fill-normal);
        &::part(indicator) {
          border-radius: 0;
        }
      }
  
      @media (prefers-reduced-motion: no-preference) {
        .game-menu-trigger {
          transition: font-size var(--wa-transition-fast) var(--wa-transition-easing);
        }
      }
      
      #mouse-button-toggle {
        flex: 0 0 auto;
        wa-radio {
          /* Make it square with icon-only label (1em wide) */
          padding-inline: calc(
              (var(--wa-form-control-height) - 1em) / 2 
              - var(--wa-form-control-border-width));
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-screen": PuzzleScreen;
  }
}
