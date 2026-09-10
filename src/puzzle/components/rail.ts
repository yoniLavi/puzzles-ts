/**
 * **The puzzle screen's one command surface.**
 *
 * It replaces two: a fourteen-item game menu in the top bar and an eight-button
 * toolbar at the bottom right, with **Hint, Reference and Check & save in
 * both** and eleven further commands split between them under no rule. A player
 * had to learn both surfaces and could still miss a command that lived only in
 * the other. The rule now is the one in the `app-shell` spec: *every command has
 * exactly one home, grouped by what it acts on and ordered by how often it is
 * used*, with only the rare and the once-ever behind `More…`.
 *
 * **Being vertical is what pays for the labels.** A horizontal bar has no room
 * for text, which is exactly why the eight toolbar buttons were icon-only and
 * several were unguessable — `Fill all pencil marks` can overwrite a player's
 * notes and had no words on it anywhere. A rail row carries an icon, a label
 * and its shortcut on one line, so labeling everything costs nothing.
 *
 * **One component draws both the desktop rail and the phone sheet** (`variant`).
 * The design asks for the sheet to be "the rail in the same order with the same
 * wording", and the only way two surfaces stay in the same order is for there to
 * be one of them.
 *
 * Every row is a `data-command` control, so `puzzle-screen.ts`'s command bus is
 * the single vocabulary and `puzzle-command-homes.test.ts` can hold the rendered
 * rail and the `commandMap` to each other in both directions — a command
 * offered twice, or offered nowhere, fails.
 */
import { consume } from "@lit/context";
import { SignalWatcher } from "@lit-labs/signals";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { homePageUrl } from "../../routing.ts";
import { savedGames } from "../../store/saved-games.ts";
import { cssWATweaks } from "../../utils/css.ts";
import { puzzleContext } from "../contexts.ts";
import type { Puzzle } from "../puzzle.ts";
import { shortcutLabel } from "../shortcuts.ts";

// Component registration
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "./history.ts";
import "./type-menu.ts";

/** One row of the rail. */
interface Row {
  command: string;
  icon: string;
  label: string;
  /** Absent unless the game supports it — a command a game cannot run is not
   * rendered disabled, it is not rendered. "Present and grayed out" teaches a
   * player that the app is broken for this puzzle. */
  disabled?: boolean;
  /** Drawn as a bordered button rather than a plain row. */
  emphasis?: "bordered";
  /** Drawn quieter than its neighbors — a terminal or rarely-wanted action. */
  quiet?: boolean;
}

@customElement("puzzle-rail")
export class PuzzleRail extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  /** `rail` is the desktop column; `sheet` is the same content inside the
   * phone's `More…` panel. */
  @property({ type: String, reflect: true })
  variant: "rail" | "sheet" = "rail";

  /** The game's display name, for the heading and the help row's label. */
  @property({ type: String })
  gameName = "";

  /** Where `How to play …` points. */
  @property({ type: String })
  helpHref = "";

  /** Whether the reference panel is docked open, so its row can say which way
   * it will go. */
  @property({ type: Boolean, attribute: "reference-open" })
  referenceOpen = false;

  private get solved(): boolean {
    return this.puzzle?.status === "solved";
  }

  protected override render() {
    return html`
      <div part="base">
        ${this.variant === "rail" ? this.renderHeading() : nothing}
        ${this.renderPosition()}
        ${this.renderHelpMePlay()}
        ${this.renderFooterGroup()}
      </div>
    `;
  }

  /** The way back, the game's name, and its parameters — which open the type
   * menu and *show the current value* rather than hiding it behind a caret. */
  private renderHeading() {
    return html`
      <div part="heading">
        <a part="back" href=${homePageUrl().href}>
          <wa-icon name="back-to-catalog"></wa-icon>
          All puzzles
        </a>
        <h1 part="game-name">${this.gameName}</h1>
        <puzzle-type-menu presentation="chips" placement="bottom-start">
        </puzzle-type-menu>
      </div>
    `;
  }

  /**
   * *Where you are in this game* — one group, because your position, the two
   * ways you move through it and the checkpoint you can return to are one
   * concern. They were spread across a menu and a toolbar.
   */
  private renderPosition() {
    return html`
      <section part="group" aria-label="Your position in this game">
        <h2 part="group-label">Your position</h2>
        <puzzle-history part="timeline"></puzzle-history>
        ${this.renderStatusLine()}
        ${this.renderRow({
          command: "undo",
          icon: "undo",
          label: "Undo",
          disabled: !this.puzzle?.canUndo,
        })}
        ${this.renderRow({
          command: "redo",
          icon: "redo",
          label: "Redo",
          disabled: !this.puzzle?.canRedo,
        })}
        ${this.renderRow({
          command: "check-and-save",
          icon: "check-and-save",
          label: "Check & save",
          emphasis: "bordered",
        })}
        ${this.renderRow({
          command: "quick-load",
          icon: "back-to-last-save",
          label: "Back to last save",
          disabled: !savedGames.hasQuickSave(this.puzzle?.puzzleId ?? ""),
        })}
      </section>
    `;
  }

  /**
   * The game's own status line, for the nine games that print one.
   *
   * It used to live inside the board component, sized to the canvas and placed
   * by a `statusbar-placement` preference offering `start` / `end` / `hidden`.
   * The rail gives it one correct home, so the preference stopped denoting
   * anything and was retired (owner's call,
   * `design-front-page-and-chrome` design.md §4.9 item 2).
   *
   * **Absent, not blank**, for a game with nothing to say: an empty reserved
   * line in a vertical rail is a hole, where in the old horizontal placement it
   * at least kept the board from jumping.
   */
  private renderStatusLine() {
    if (!this.puzzle?.wantsStatusbar) return nothing;
    const text = this.puzzle.statusbarText;
    if (!text) return nothing;
    return html`<div part="status" role="status">${text}</div>`;
  }

  /**
   * *Help me play* — the fork's differentiator, named as a group so a player
   * can see that this is what the app is for.
   */
  private renderHelpMePlay() {
    if (!this.puzzle) return nothing;
    const anything =
      this.puzzle.canHint ||
      this.puzzle.canMarkAll ||
      this.puzzle.hasReference ||
      this.puzzle.canFindMistakes ||
      this.puzzle.canSolve;
    if (!anything) return nothing;

    return html`
      <section part="group" aria-label="Help me play">
        <h2 part="group-label">Help me play</h2>
        ${
          this.puzzle.canHint
            ? html`
              ${this.renderRow({
                command: "hint",
                icon: "hint",
                // The hint button has two beats — show, then play — and it used
                // to say the same word for both, so the second press was a
                // surprise. The label says which beat the next press is.
                //
                // The resting word is just "Hint": it sits under a "Help me
                // play" heading, beside "Auto-solve for me" and "Show
                // solution", so "Next" was doing no work the group did not
                // already do. The armed word stays a full phrase, because it
                // is the state a player has not seen before.
                //
                // A third word for a press that is still being answered
                // (`Puzzle.hintPending`): the button is not dead, it is working.
                label: this.puzzle.hintPending
                  ? "Thinking…"
                  : this.puzzle.hintArmedToApply
                    ? "Apply the hint"
                    : "Hint",
                disabled: this.solved,
              })}
              ${this.renderHintExplanation()}
              ${this.renderAutoHintSwitch()}
            `
            : nothing
        }
        ${
          this.puzzle.canMarkAll
            ? this.renderRow({
                command: "mark-all",
                icon: "mark-all",
                // The press does double duty on purpose — fill the bare cells,
                // or narrow what a placed value has ruled out — and saying
                // "Fill" for both hid the second job entirely.
                label: this.puzzle.hasPencilMarks
                  ? "Update all pencil marks"
                  : "Fill all pencil marks",
                disabled: this.solved,
              })
            : nothing
        }
        ${
          this.puzzle.hasReference
            ? this.renderRow({
                command: "toggle-reference",
                icon: "reference",
                label: this.referenceOpen ? "Hide reference" : "Reference",
              })
            : nothing
        }
        ${
          this.puzzle.canFindMistakes
            ? this.renderRow({
                command: "check-only",
                icon: "check-only",
                label: "Check without saving",
                quiet: true,
              })
            : nothing
        }
        ${
          this.puzzle.canSolve
            ? this.renderRow({
                command: "solve",
                icon: "show-solution",
                label: "Show solution…",
                quiet: true,
                disabled: this.solved,
              })
            : nothing
        }
      </section>
    `;
  }

  /** The hint's own words, directly under the button that asked for it, with
   * its position in a multi-step journey. In the old chrome the explanation was
   * a banner under the board and the button was in the far corner. */
  private renderHintExplanation() {
    const text = this.puzzle?.activeHintExplanation || this.puzzle?.autoHintMessage;
    if (!text) return nothing;
    const journey = this.puzzle?.hintJourney;
    return html`
      <div part="hint-explanation" role="status">
        ${journey ? html`<span part="hint-journey">${journey}</span>` : nothing}
        ${text}
      </div>`;
  }

  /**
   * Auto-solve: one button whose label and icon say what pressing it will do.
   *
   * It was drawn as a switch, on the reasoning that continuous hinting is a
   * *mode*. In front of a player that reads worse than it argues: a switch says
   * "a setting you leave in a position", and this is something that is running
   * right now and that you will want to stop. So it is a button that says
   * `Auto-solve for me`, and while it is running says `Stop auto-solving` with
   * a stop icon — the state is in the words, not in the position of a track
   * whose two ends look alike (owner, 2026-09-07).
   */
  private renderAutoHintSwitch() {
    const active = this.puzzle?.autoHintActive === true;
    return this.renderRow({
      command: "toggle-auto-hint",
      icon: active ? "stop" : "play",
      label: active ? "Stop auto-solving" : "Auto-solve for me",
      disabled: this.solved && !active,
    });
  }

  /** Pinned to the bottom: the two most common non-move actions in a session
   * (which were two levels deep in a menu), the help page, and everything rare. */
  private renderFooterGroup() {
    return html`
      <section part="group" aria-label="This puzzle">
        ${this.renderRow({ command: "new-game", icon: "new-game", label: "New game" })}
        ${this.renderRow({
          command: "restart-game",
          icon: "restart-game",
          label: "Restart this puzzle",
        })}
        <a part="row" href=${this.helpHref}>
          <wa-icon part="row-icon" name="help"></wa-icon>
          <span part="row-label">How to play ${this.gameName}</span>
        </a>
        ${this.renderMoreMenu()}
      </section>
    `;
  }

  /**
   * The rare and the once-ever — the only things left behind a menu.
   *
   * One list, rendered two ways. On the desktop rail it is a dropdown behind a
   * `More…` row, because the rail is already the surface and a fifth group of
   * rarely-wanted rows would bury the four that matter. In the phone sheet the
   * rows are **inline**: the sheet *is* what `More` opened, and a `More…` inside
   * it would be a menu inside a menu.
   *
   * Either way the entries come from here, so "the same order and the same
   * wording" is a fact about the code rather than a promise.
   */
  private get moreEntries(): (Row | "divider")[] {
    // clipboard.write is Baseline 2024 (Firefox 6/2024; others ~2020)
    const supportsClipboardWrite = typeof navigator.clipboard?.write === "function";
    return [
      { command: "switch-puzzle", icon: "switch-puzzle", label: "Switch puzzle…" },
      "divider",
      { command: "share", icon: "share", label: "Share" },
      ...(supportsClipboardWrite
        ? ([
            { command: "copy-image", icon: "copy-image", label: "Copy image" },
          ] as Row[])
        : []),
      "divider",
      { command: "save-game", icon: "save-game", label: "Save game" },
      { command: "load-game", icon: "load-game", label: "Load game" },
      { command: "enter-gameid", icon: "gameid", label: "Enter game ID" },
      "divider",
      { command: "settings", icon: "settings", label: "Preferences" },
      { command: "about", icon: "info", label: "About" },
    ];
  }

  private renderMoreMenu() {
    if (this.variant === "sheet") {
      return html`${this.moreEntries.map((entry) =>
        entry === "divider"
          ? html`<div part="row-divider"></div>`
          : this.renderRow(entry),
      )}`;
    }
    return html`
      <wa-dropdown placement="top-start">
        <button part="row" slot="trigger" type="button">
          <wa-icon part="row-icon" name="more"></wa-icon>
          <span part="row-label">More…</span>
        </button>
        ${this.moreEntries.map((entry) =>
          entry === "divider"
            ? html`<wa-divider></wa-divider>`
            : html`
              <wa-dropdown-item data-command=${entry.command}>
                <wa-icon slot="icon" name=${entry.icon}></wa-icon>
                ${entry.label}
              </wa-dropdown-item>`,
        )}
      </wa-dropdown>
    `;
  }

  /** One row: icon, label, and — where there is one — the key that runs it.
   * The key comes from `shortcuts.ts`, the same table the handler binds from,
   * so the label cannot become decorative. */
  private renderRow(row: Row): TemplateResult {
    const key = shortcutLabel(row.command);
    const classes = [
      row.emphasis === "bordered" ? "bordered" : "",
      row.quiet ? "quiet" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return html`
      <button
          part="row"
          class=${classes || nothing}
          type="button"
          data-command=${row.command}
          ?disabled=${row.disabled === true}
      >
        <wa-icon part="row-icon" name=${row.icon}></wa-icon>
        <span part="row-label">${row.label}</span>
        ${key ? html`<kbd part="row-key">${key}</kbd>` : nothing}
      </button>
    `;
  }

  static override styles = [
    cssWATweaks,
    css`
      :host {
        display: block;
        box-sizing: border-box;
        min-width: 0;
      }

      * {
        box-sizing: border-box;
      }

      [part="base"] {
        display: flex;
        flex-direction: column;
        gap: var(--app-gap-group);
        height: 100%;
        padding: var(--wa-space-m);
      }

      /* The last group is pinned to the bottom of the rail; in the phone sheet
       * there is no spare height to push it into, so the auto margin simply
       * resolves to zero. */
      [part="group"]:last-of-type {
        margin-block-start: auto;
      }

      [part="heading"] {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding-block-end: var(--wa-space-s);
        border-block-end: 1px solid var(--app-color-hairline);
      }

      [part="back"] {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        min-height: var(--app-tap-min);
        font-size: var(--app-font-size-support);
        color: var(--app-color-text-quiet);
        text-decoration: none;

        @media (hover: hover) {
          &:hover {
            color: var(--app-color-link);
          }
        }
      }

      [part="game-name"] {
        margin: 0;
        font-size: var(--app-font-size-title);
        font-weight: var(--wa-font-weight-bold);
        line-height: var(--wa-line-height-condensed);
        color: var(--app-color-text);
      }

      [part="group"] {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      [part="group-label"] {
        margin: 0 0 0.25rem;
        font-size: var(--app-font-size-micro);
        font-weight: var(--wa-font-weight-semibold);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--app-color-text-faint);
      }

      [part="status"] {
        font-size: var(--app-font-size-support);
        color: var(--app-color-text-secondary);
        padding: 0.25rem 0.5rem 0.5rem;
      }

      /* A row is a row whether it is a button, a link or a label wrapping a
       * switch — one selector, so the three cannot drift apart visually. */
      [part="row"] {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        width: 100%;
        min-height: var(--app-row-rail);
        padding-inline: 0.5rem;
        border: 1px solid transparent;
        border-radius: var(--app-radius-control);
        background: none;
        color: var(--app-color-text);
        font: inherit;
        font-size: var(--app-font-size-body);
        text-align: start;
        text-decoration: none;
        cursor: pointer;

        &:disabled {
          color: var(--app-color-text-faintest);
          cursor: default;
        }

        &:focus-visible {
          outline: var(--wa-focus-ring);
          outline-offset: var(--wa-focus-ring-offset);
        }

        @media (hover: hover) {
          &:hover:not(:disabled) {
            background-color: var(--app-color-row-rule);
          }
        }
      }

      /* Phone: every row is a real tap target. */
      :host([variant="sheet"]) [part="row"] {
        min-height: var(--app-tap-min);
      }

      [part="row-icon"] {
        flex: 0 0 auto;
        font-size: 1rem;
        color: var(--app-color-text-quiet);

        [part="row"]:disabled & {
          color: inherit;
        }
      }

      [part="row-label"] {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      [part="row-key"] {
        flex: 0 0 auto;
        font-family: var(--app-font-mono);
        font-size: var(--app-font-size-micro);
        color: var(--app-color-text-faint);
      }

      /* There is no accent row. The hint used to be one — filled amber, the
       * single loudest control in the chrome — on the reasoning that explained
       * hints are what this fork is for. That reasoning is about the fork, and
       * on a player's screen it read as advice: take a hint. The hint is a
       * choice, and a player should be free to want to solve it themselves, so
       * the chrome offers it and does not urge it.
       *
       * The amber is not gone, it moved to where it belongs: the hint
       * explanation panel below, which is the hint *speaking* rather than the
       * chrome *recommending*. */

      /* Check & save reads as a button among plain rows, because it is the one
       * row in this group that writes something. */
      [part="row"].bordered {
        border-color: var(--app-color-control-border);
        background-color: var(--app-color-ground);
      }

      [part="row"].quiet {
        color: var(--app-color-text-quiet);
      }

      [part="row-divider"] {
        height: 1px;
        margin-block: 0.25rem;
        background-color: var(--app-color-row-rule);
      }

      [part="hint-explanation"] {
        margin-block: 0.25rem;
        padding: 0.5rem 0.625rem;
        border: 1px solid var(--app-color-hint-border);
        border-radius: var(--app-radius-hint);
        background-color: var(--app-color-hint-surface);
        color: var(--app-color-hint-ink);
        font-size: var(--app-font-size-support);
        line-height: var(--wa-line-height-normal);
      }

      [part="hint-journey"] {
        display: block;
        font-family: var(--app-font-mono);
        font-size: var(--app-font-size-micro);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        opacity: 0.75;
        margin-block-end: 2px;
      }

      wa-dropdown [part="row"] {
        /* The trigger is a row like any other. */
        width: 100%;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-rail": PuzzleRail;
  }
}
