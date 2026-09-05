/**
 * The note-taking cell: the input mechanic eleven games share.
 *
 * The mechanic the player operates is one design — *highlight a cell, type a
 * value into it, pencil candidate marks in it* — and Abcd, Crossing, Group,
 * Keen, Mathrax, Salad, Seismic, Solo, Towers, Undead and Unequal each carried
 * their own copy of it. `jscpd` measured **514 duplicated lines** across their
 * `index.ts` files (2026-09-05, ≥10 lines / ≥70 tokens), 60% of the clone-sides
 * inside `interpretMove`. Extracting the *press* arm here took that to **331**;
 * the rest is the symbol-entry block, which is the next thing to move.
 *
 * WHAT LIVES HERE is only what would have to change in every copy at once to
 * keep them correct, by [`border-grid.ts`](./border-grid.ts)'s test — not "is
 * this the same text" but *"would a change here have to happen in every copy at
 * once?"*: what a left and a right press do to the highlight, how the fork's
 * sticky pencil mode behaves, and the rule that a pointer press hands the
 * cursor's provenance back to the mouse. Change how sticky pencil works and one
 * edit here is the whole change; before this module it was eleven.
 *
 * WHAT DOES NOT live here is everything about the *puzzle*. Each game keeps its
 * own coordinate mapping, its own symbol vocabulary (digits, letters past nine,
 * circles and crosses, ghosts and vampires), its own `Move` type — the shared
 * code reports what the press did to the highlight and never a move, exactly as
 * `border-grid.ts` reports an edge and never one — and everything it layers on
 * top: Crossing's across/down flip, Group's multifill anchors, Undead's count
 * blocks, Towers' 3D tower-top hit retarget.
 *
 * The two things a game genuinely answers for itself arrive as {@link CellEntry}:
 * *may the player type into this cell* and *may it carry pencil marks*. Eleven
 * games spelled those two predicates eleven ways — `immutable`, a flag bit,
 * `!walls[i]`, a clue ring, "is it still empty" — and that is a real difference
 * about the puzzle. Everything around them was not.
 *
 * WHAT WAS EVALUATED AND DECLINED, recorded so it is not re-proposed each time.
 * After both arms moved here, `jscpd` still reports a ~28-line clone between
 * Keen, Solo, Towers and Unequal's entry blocks. It is the *move literal* —
 * `{ type: "set", x, y, n, pencil, autoElim }` — plus the two predicates around
 * it that read each game's own `grid` and `pencil` arrays. Lifting it would mean
 * a shared `Move`, and `border-grid.ts` already answered that: the shared code
 * reports what the player did and never a move, because a shared move type
 * couples save formats that have no reason to be identical. The remaining
 * duplication is four games agreeing about their own data, which is where the
 * line is.
 */

import { UI_UPDATE, type UiUpdate } from "./game.ts";
import type { GridCursor } from "./pointer.ts";
import { LEFT_BUTTON, RIGHT_BUTTON } from "./pointer.ts";

/**
 * The three `Ui` fields the mechanic owns. A game's `Ui` structurally satisfies
 * this by carrying them; there is no base class and no wrapper object, so a
 * game's own fields sit beside these untouched.
 *
 * `pencilSticky` is optional because Group does not offer the preference, and
 * that is **derived from the game's own declaration** rather than from an
 * exemption roster here — a roster rots exactly as quietly as the membership
 * list it replaces (AGENTS.md § "Convention over configuration").
 */
export interface NoteTakingUi {
  cursor: GridCursor;
  /** Typing enters a pencil mark rather than a value. */
  pencilMode: boolean;
  /** The keyboard revealed or moved the highlight, so an entry keeps it. */
  cursorFromKeyboard: boolean;
  /** The fork's CapsLock-style pencil toggle, where the game offers it. */
  pencilSticky?: boolean;
  /** Keep the mouse highlight through a pencil change, where the game offers
   * the preference. See {@link releaseHighlightAfterEntry} for why its absence
   * reads as `true`, and for the split that leaves standing. */
  pencilKeepHighlight?: boolean;
}

/** What the game says about the cell under the press. */
export interface CellEntry {
  /** May the player type a value into it? A given, a wall or a clue says no. */
  canEnter: boolean;
  /** May it carry pencil marks? Universally "and it is still empty", but
   * "empty" is the game's own word. */
  canMark: boolean;
}

/**
 * What a press did to the highlight. `"moved"` means it is now on the pressed
 * cell — shown or hidden — which is what a game layering something on the
 * selection needs to know (Crossing snaps its across/down direction, Group
 * resets its multifill anchors). `"unmoved"` covers both a press that put the
 * highlight away and a sticky toggle that deliberately left it alone: what
 * those share, and all a caller cares about, is that the highlight is not on
 * the pressed cell.
 *
 * A button the mechanic does not own comes back as **`null`**, not as a third
 * word, so the common caller — *"did you take this press?"* — is a plain truth
 * test that cannot misfire. A string sentinel there would be truthy, and every
 * one of the eleven would have started reporting a repaint for every button on
 * the keyboard. `interpretMove` spells "not mine" the same way.
 */
export type NoteTakingPress = "moved" | "unmoved";

/** Is the highlight showing on this cell right now? The mechanic's own notion
 * of "you pressed the cell you already had", exported because a game that acts
 * on a re-press (Crossing's crossword flip) has to agree with it. */
export function highlightIsOn(ui: NoteTakingUi, x: number, y: number): boolean {
  return ui.cursor.visible && ui.cursor.x === x && ui.cursor.y === y;
}

/**
 * Apply a pointer press to the highlight, so a caller reads:
 *
 * ```ts
 * if (inGrid(w, tx, ty) && pressNoteTakingCell(ui, button, tx, ty, entryAt(tx, ty)))
 *   return UI_UPDATE;
 * ```
 *
 * Every press it handles is a repaint, because the highlight is part of the
 * frame even when the press changed nothing else.
 *
 * Two rules, and both replaced a disagreement rather than recording one:
 *
 * **A press moves the highlight to the pressed cell.** The eleven games
 * disagreed, and Towers disagreed with itself — its left press moved the hidden
 * highlight onto a given while its right press left it behind. A pointer press
 * takes the board over (`docs/games/input.md`), which is only true if the
 * highlight goes where the player pointed; and the position matters even while
 * hidden, because the next arrow key resumes from it.
 *
 * **The highlight is shown only where the mode it is in could write** — against
 * `canMark` in pencil mode and `canEnter` otherwise. Crossing was the one game
 * that got this right, with a `(pencil && filled)` clause the others lacked;
 * everywhere else, a left press in sticky pencil mode onto a filled cell lit a
 * highlight that no keystroke could act on. One rule covers both its clause and
 * the four separate placements of "never leave a given highlighted".
 *
 * The single carve-out is the sticky toggle, which says why at its branch.
 */
export function pressNoteTakingCell(
  ui: NoteTakingUi,
  button: number,
  x: number,
  y: number,
  cell: CellEntry,
): NoteTakingPress | null {
  const primary = button === LEFT_BUTTON;
  if (!primary && button !== RIGHT_BUTTON) return null;

  const sticky = ui.pencilSticky ?? false;
  const onHighlight = highlightIsOn(ui, x, y);
  ui.cursorFromKeyboard = false;

  if (!primary && sticky) {
    // The CapsLock-style toggle is a *mode switch*, not a selection, so a press
    // on a cell that could take no mark leaves the highlight exactly where it
    // was. Moving or hiding it would make the mode key double as a selection
    // key, which is the confusion sticky mode exists to remove.
    ui.pencilMode = !ui.pencilMode;
    if (!cell.canMark) return "unmoved";
  } else if (onHighlight && (primary ? sticky || !ui.pencilMode : ui.pencilMode)) {
    // A repeat press puts the highlight away. The left button's exception is
    // that its *other* job is dropping back to real entry, and there is nothing
    // else to press for that — so without sticky mode, pressing a
    // pencil-selected cell re-selects it for ink instead of deselecting it.
    ui.cursor.visible = false;
    return "unmoved";
  } else if (primary) {
    if (!sticky) ui.pencilMode = false;
  } else {
    ui.pencilMode = true; // upstream's per-cell pencil select
  }

  ui.cursor.x = x;
  ui.cursor.y = y;
  ui.cursor.visible = ui.pencilMode ? cell.canMark : cell.canEnter;
  return "moved";
}

// --- what a symbol entry does to the highlight ------------------------------
//
// The *decoding* of a keystroke is each game's own — digits to `w`, letters
// past nine, circles and crosses, ghosts and vampires — and so is the predicate
// that decides whether a write is a no-op, because it reads that game's grid
// and marks. What is shared is only what happens to the **highlight**, which is
// where the fork's two pencil preferences meet the keyboard.

/**
 * What `interpretMove` should return for a keystroke that would write what is
 * already there.
 *
 * Not simply `null`: a mouse-driven entry still puts the highlight away, so
 * there is a frame to repaint even though the board did not move. Writing this
 * by hand is how Seismic came to return a bare `null` while the other ten
 * hid the highlight.
 */
export function noOpEntryResult(ui: NoteTakingUi): UiUpdate | null {
  if (ui.cursorFromKeyboard) return null;
  ui.cursor.visible = false;
  return UI_UPDATE;
}

/**
 * Put the highlight away after a real entry — unless the keyboard is driving
 * it, or this was a pencil change the player asked to keep the highlight
 * through.
 *
 * **A missing `pencilKeepHighlight` reads as `true`**, which is the convention a
 * game gets without declaring anything. All eleven do declare it today; the
 * default is here so a twelfth inherits the right behavior rather than the
 * absence of one.
 *
 * **The collection was split on this and no longer is.** Five games kept the
 * highlight unconditionally, having no preference at all; the other six offered
 * the preference and defaulted it **off**, so out of the box the same
 * mouse-driven pencil mark kept the highlight in Mathrax and lost it in Solo.
 * Keeping it is the better default — entering two or three candidates in a row
 * is the ordinary case with a mouse, and re-clicking between each is the
 * annoyance the preference was added to remove — so the six flipped and the
 * five gained the preference. Every player can still choose; nobody has to
 * choose twice for the same puzzle family.
 */
export function releaseHighlightAfterEntry(ui: NoteTakingUi): void {
  if (ui.cursorFromKeyboard) return;
  if (ui.pencilMode && (ui.pencilKeepHighlight ?? true)) return;
  ui.cursor.visible = false;
}
