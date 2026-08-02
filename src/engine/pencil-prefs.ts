/**
 * The `GamePref` declarations every pencil-mark game shares, so the wording a
 * player reads has **one** source. Ten games offer sticky pencil mode and five
 * offer keep-highlight, each previously repeating the same sentence verbatim;
 * a preference whose label is copied is a preference whose label drifts.
 *
 * Each is its own factory rather than one options-bag helper, so each carries
 * the precise `Ui` constraint for the field it drives — a game that offers
 * keep-highlight without a `pencilKeepHighlight` field fails to compile rather
 * than silently reading `undefined`. Separate items also drop into any position
 * in a game's `prefs` array (Crossing lists sticky-pencil fourth, after three
 * of its own).
 *
 * `auto-pencil` is deliberately **not** unconditioned: its label names the
 * regions the placement clears ("its row, column and block" in Solo, "its row
 * and column" in Keen and Unequal, and Towers places a *tower* rather than a
 * number), so the sentence is a per-game fact and is passed in. Sharing only
 * the keyword and plumbing is the honest amount to share.
 */

import type { GamePref } from "./game.ts";

/**
 * Upstream's `auto-pencil`: placing a value clears it from the pencil marks it
 * can no longer be in. `name` is the game's own sentence, because the regions
 * it names differ per game.
 */
export function autoPencilPref<Ui extends { autoPencil: boolean }>(
  name: string,
): GamePref<Ui> {
  return {
    kw: "auto-pencil",
    name,
    type: "boolean",
    get: (ui) => ui.autoPencil,
    set: (ui, v) => {
      ui.autoPencil = v;
    },
  };
}

/** Right-click latches pencil mode instead of applying to one cell. */
export function stickyPencilPref<Ui extends { pencilSticky: boolean }>(): GamePref<Ui> {
  return {
    kw: "sticky-pencil-mode",
    name: "Right-click toggles a sticky pencil mode (stays on until right-clicked again)",
    type: "boolean",
    get: (ui) => ui.pencilSticky,
    set: (ui, v) => {
      ui.pencilSticky = v;
    },
  };
}

/** Keep the mouse highlight on the cell after a pencil mark changes. */
export function pencilKeepHighlightPref<
  Ui extends { pencilKeepHighlight: boolean },
>(): GamePref<Ui> {
  return {
    kw: "pencil-keep-highlight",
    name: "Keep mouse highlight after changing a pencil mark",
    type: "boolean",
    get: (ui) => ui.pencilKeepHighlight,
    set: (ui, v) => {
      ui.pencilKeepHighlight = v;
    },
  };
}
