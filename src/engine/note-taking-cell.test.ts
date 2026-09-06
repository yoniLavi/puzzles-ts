/**
 * The note-taking cell's contract, and the collection's membership in it.
 *
 * Two halves, and the split is deliberate:
 *
 *  - **The arms**, unit-tested against a bare `Ui`. Eleven games' pointer
 *    presses now resolve here, so this is where "what does a right press do to
 *    the highlight" is *stated* rather than inferred from eleven copies.
 *  - **The population**, derived from the registry by the *shape* of each
 *    game's `newUi()` — a game is a note-taking game iff it carries the three
 *    fields, which is a fact about the game rather than a roster somebody has
 *    to extend. `cursor-vocabulary.test.ts` does the same thing for the cursor
 *    and for the same reason: a guard blind to a game cannot fire on it.
 *
 * ON THE STANDARDIZATIONS this module made, because a test that merely records
 * today's behavior is worth much less than one that says why. Each is asserted
 * by a case below that names it:
 *
 *  1. **A press moves the highlight to the pressed cell even when the cell
 *     cannot take what the press offers**, and the cell decides only whether
 *     it is *shown*. Five games moved it, five left it behind, and Towers did
 *     both — its left press moved the hidden highlight onto a given while its
 *     right press left it where it was. It is observable: the next arrow key
 *     resumes from wherever the hidden highlight sits.
 *  2. **A right press that puts the highlight away no longer clears pencil
 *     mode.** Only Undead did that, and only on one of its four arms.
 *  3. **The highlight is shown only where the mode it is in could write.**
 *     Crossing alone had the clause; everywhere else a sticky-mode left press
 *     onto a filled cell lit a highlight no keystroke could act on.
 *
 * None was a decision about a puzzle, which is the test AGENTS.md sets for
 * whether a difference is real. The sticky arm is the one place the highlight
 * is deliberately left alone, and {@link pressNoteTakingCell} says why there.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { registerAllGames } from "../games/index.ts";
import { UI_UPDATE } from "./game.ts";
import {
  type CellEntry,
  type NoteTakingUi,
  noOpEntryResult,
  pressNoteTakingCell,
  releaseHighlightAfterEntry,
} from "./note-taking-cell.ts";
import { LEFT_BUTTON, MIDDLE_BUTTON, newCursor, RIGHT_BUTTON } from "./pointer.ts";
import {
  builtGames,
  enrolledIn,
  membersNotMentioning,
  SCANNED_SOURCE_FILES,
} from "./testing/enrollment.ts";

beforeAll(registerAllGames);

const OPEN: CellEntry = { canEnter: true, canMark: true };
const GIVEN: CellEntry = { canEnter: false, canMark: false };
const FILLED: CellEntry = { canEnter: true, canMark: false };

function ui(over: Partial<NoteTakingUi> = {}): NoteTakingUi {
  return {
    cursor: newCursor(),
    pencilMode: false,
    cursorFromKeyboard: true,
    ...over,
  };
}

describe("the left press selects, re-selects for ink, and deselects", () => {
  it("selects an enterable cell and hands provenance back to the pointer", () => {
    const u = ui();
    expect(pressNoteTakingCell(u, LEFT_BUTTON, 2, 3, OPEN)).toBe("moved");
    expect(u.cursor).toMatchObject({ x: 2, y: 3, visible: true });
    expect(u.cursorFromKeyboard).toBe(false);
  });

  it("a second press on the highlighted cell puts the highlight away", () => {
    const u = ui({ cursor: newCursor(2, 3, true) });
    pressNoteTakingCell(u, LEFT_BUTTON, 2, 3, OPEN);
    expect(u.cursor.visible).toBe(false);
  });

  it("without sticky, pressing a pencil-selected cell re-selects it for ink", () => {
    // Not a deselect: the left button's other job is dropping back to real
    // entry, and there is nothing else to press to get there.
    const u = ui({ cursor: newCursor(2, 3, true), pencilMode: true });
    pressNoteTakingCell(u, LEFT_BUTTON, 2, 3, OPEN);
    expect(u).toMatchObject({ pencilMode: false });
    expect(u.cursor.visible).toBe(true);
  });

  it("with sticky, the same press deselects and keeps the mode", () => {
    const u = ui({
      cursor: newCursor(2, 3, true),
      pencilMode: true,
      pencilSticky: true,
    });
    pressNoteTakingCell(u, LEFT_BUTTON, 2, 3, OPEN);
    expect(u.cursor.visible).toBe(false);
    expect(u.pencilMode).toBe(true);
  });

  it("moves the highlight onto a given and hides it there", () => {
    // Standardization 1. The player pointed at (5, 1); the next arrow press
    // resumes from there rather than from wherever the highlight used to be.
    const u = ui({ cursor: newCursor(0, 0, true) });
    pressNoteTakingCell(u, LEFT_BUTTON, 5, 1, GIVEN);
    expect(u.cursor).toMatchObject({ x: 5, y: 1, visible: false });
  });
});

describe("the right press is a pencil select, or the sticky mode toggle", () => {
  it("selects a markable cell for pencil marks", () => {
    const u = ui();
    expect(pressNoteTakingCell(u, RIGHT_BUTTON, 4, 4, OPEN)).toBe("moved");
    expect(u.cursor).toMatchObject({ x: 4, y: 4, visible: true });
    expect(u.pencilMode).toBe(true);
    expect(u.cursorFromKeyboard).toBe(false);
  });

  it("deselects a repeat press, and leaves pencil mode alone doing it", () => {
    // Standardization 2: only Undead cleared the mode here, on one of its arms.
    const u = ui({ cursor: newCursor(4, 4, true), pencilMode: true });
    pressNoteTakingCell(u, RIGHT_BUTTON, 4, 4, OPEN);
    expect(u.cursor.visible).toBe(false);
    expect(u.pencilMode).toBe(true);
  });

  it("moves onto a filled cell and hides, since it can take no mark", () => {
    const u = ui({ cursor: newCursor(0, 0, true) });
    pressNoteTakingCell(u, RIGHT_BUTTON, 6, 2, FILLED);
    expect(u.cursor).toMatchObject({ x: 6, y: 2, visible: false });
  });

  it("sticky: toggles the mode and follows onto a markable cell", () => {
    const u = ui({ pencilSticky: true });
    pressNoteTakingCell(u, RIGHT_BUTTON, 1, 1, OPEN);
    expect(u.pencilMode).toBe(true);
    expect(u.cursor).toMatchObject({ x: 1, y: 1, visible: true });
    pressNoteTakingCell(u, RIGHT_BUTTON, 1, 1, OPEN);
    expect(u.pencilMode).toBe(false);
  });

  it("sticky: a press on a filled cell toggles the mode and moves nothing", () => {
    // The one arm that deliberately leaves the highlight alone: the sticky
    // button is a mode switch, and making it double as a selection key is the
    // confusion sticky mode exists to remove.
    const u = ui({ cursor: newCursor(3, 3, true), pencilSticky: true });
    pressNoteTakingCell(u, RIGHT_BUTTON, 6, 2, FILLED);
    expect(u.pencilMode).toBe(true);
    expect(u.cursor).toMatchObject({ x: 3, y: 3, visible: true });
  });

  it("a game that offers no sticky preference behaves as non-sticky", () => {
    // Group carries no `pencilSticky` at all. Derived from the game's own
    // declaration, never from an exemption list here.
    const u = ui();
    expect(u.pencilSticky).toBeUndefined();
    pressNoteTakingCell(u, RIGHT_BUTTON, 2, 2, OPEN);
    expect(u.pencilMode).toBe(true);
    expect(u.cursor).toMatchObject({ x: 2, y: 2, visible: true });
  });
});

describe("a button the mechanic does not own is left alone", () => {
  it("returns null — falsy, so the common caller cannot misfire — and touches nothing", () => {
    const u = ui({ cursor: newCursor(1, 2, true) });
    expect(pressNoteTakingCell(u, MIDDLE_BUTTON, 9, 9, OPEN)).toBeNull();
    expect(u).toEqual(ui({ cursor: newCursor(1, 2, true) }));
  });
});

describe("the highlight is shown only where the current mode could write", () => {
  it("hides on a filled cell when a sticky left press lands in pencil mode", () => {
    // Standardization 3. Crossing was the one game with this clause; everywhere
    // else the highlight lit up on a cell no keystroke could mark.
    const u = ui({ pencilMode: true, pencilSticky: true });
    expect(pressNoteTakingCell(u, LEFT_BUTTON, 4, 0, FILLED)).toBe("moved");
    expect(u.cursor).toMatchObject({ x: 4, y: 0, visible: false });
  });

  it("shows on that same cell when the mode is ink", () => {
    const u = ui({ pencilMode: false, pencilSticky: true });
    pressNoteTakingCell(u, LEFT_BUTTON, 4, 0, FILLED);
    expect(u.cursor).toMatchObject({ x: 4, y: 0, visible: true });
  });

  it("reports whether the highlight landed on the pressed cell", () => {
    // The distinction Crossing and Group layer on: "moved" is the only outcome
    // after which the highlight is on the cell the player pressed.
    const u = ui({ cursor: newCursor(2, 3, true) });
    expect(pressNoteTakingCell(u, LEFT_BUTTON, 2, 3, OPEN)).toBe("unmoved");
    expect(pressNoteTakingCell(u, LEFT_BUTTON, 2, 3, OPEN)).toBe("moved");
  });
});

describe("what a symbol entry does to the highlight", () => {
  it("a no-op keystroke still puts a mouse-driven highlight away", () => {
    // Not simply `null`: there is a frame to repaint even though the board did
    // not move. Seismic returned a bare `null` here while the other ten hid it.
    const u = ui({ cursor: newCursor(1, 1, true), cursorFromKeyboard: false });
    expect(noOpEntryResult(u)).toBe(UI_UPDATE);
    expect(u.cursor.visible).toBe(false);
  });

  it("a no-op keystroke leaves a keyboard-driven highlight alone", () => {
    const u = ui({ cursor: newCursor(1, 1, true), cursorFromKeyboard: true });
    expect(noOpEntryResult(u)).toBeNull();
    expect(u.cursor.visible).toBe(true);
  });

  it("a real entry keeps the highlight when the keyboard is driving", () => {
    const u = ui({ cursor: newCursor(1, 1, true), cursorFromKeyboard: true });
    releaseHighlightAfterEntry(u);
    expect(u.cursor.visible).toBe(true);
  });

  it("a mouse-driven ink entry puts the highlight away", () => {
    const u = ui({ cursor: newCursor(1, 1, true), cursorFromKeyboard: false });
    releaseHighlightAfterEntry(u);
    expect(u.cursor.visible).toBe(false);
  });

  it("a missing keep-highlight preference reads as 'keep'", () => {
    // The convention a game gets without declaring anything. All eleven declare
    // it today; this is what a twelfth inherits.
    const u = ui({
      cursor: newCursor(1, 1, true),
      cursorFromKeyboard: false,
      pencilMode: true,
    });
    expect(u.pencilKeepHighlight).toBeUndefined();
    releaseHighlightAfterEntry(u);
    expect(u.cursor.visible).toBe(true);
  });

  it("and a player who turns it off loses the highlight", () => {
    // The preference still does what it says; only the default moved.
    const u = ui({
      cursor: newCursor(1, 1, true),
      cursorFromKeyboard: false,
      pencilMode: true,
      pencilKeepHighlight: false,
    });
    releaseHighlightAfterEntry(u);
    expect(u.cursor.visible).toBe(false);
  });

  it("never clears pencil mode", () => {
    // Undead used to, which contradicted its own sticky-pencil preference:
    // the label promises the mode "stays on until right-clicked again", and it
    // is on by default, yet one mouse-driven pencil mark turned it off.
    const u = ui({
      cursor: newCursor(1, 1, true),
      cursorFromKeyboard: false,
      pencilMode: true,
      pencilKeepHighlight: false,
    });
    releaseHighlightAfterEntry(u);
    expect(u.pencilMode).toBe(true);
  });
});

describe("the enrolled population is derived, not listed", () => {
  /** A game is in the mechanic iff its `Ui` carries the fields — a fact about
   * the game, read off what `newUi` actually returns. */
  const noteTaking = enrolledIn(
    (g) =>
      typeof g.ui["pencilMode"] === "boolean" &&
      typeof g.ui["cursorFromKeyboard"] === "boolean",
  );

  it("looked at the whole registry (vacuity guard)", () => {
    // A floor, not an equality: a fifty-eighth game is not this guard's
    // business, and a sweep that found nothing is.
    expect(noteTaking.population).toBeGreaterThanOrEqual(50);
    expect(SCANNED_SOURCE_FILES).toBeGreaterThan(100);
  });

  it("is the eleven note-taking games, by the shape of their Ui", () => {
    // The membership *is* asserted, unlike the population: a twelfth game
    // acquiring the fields should be a decision somebody makes, and a member
    // losing them should fail here rather than silently leave the guards below.
    expect(noteTaking.ids).toEqual([
      "abcd",
      "crossing",
      "group",
      "keen",
      "mathrax",
      "salad",
      "seismic",
      "solo",
      "towers",
      "undead",
      "unequal",
    ]);
  });

  // The family used to answer this two ways: five games kept the highlight
  // through a mouse-driven pencil mark with no preference at all, six offered
  // the preference and defaulted it off. A player moving between Mathrax and
  // Solo met opposite behavior for the same gesture. One answer now, and the
  // preference everywhere so the answer is still the player's.
  it("every member offers keep-highlight, defaulted on", () => {
    const members = builtGames().filter((g) => noteTaking.ids.includes(g.id));
    const off = members.filter((g) => g.ui["pencilKeepHighlight"] !== true);
    const unoffered = members.filter(
      (g) => !g.game.prefs?.some((p) => p.kw === "pencil-keep-highlight"),
    );
    expect(
      off.map((g) => g.id),
      "keep-highlight is not on by default",
    ).toEqual([]);
    expect(
      unoffered.map((g) => g.id),
      "no pencil-keep-highlight preference, so a player cannot turn it off — " +
        "use pencilKeepHighlightPref()",
    ).toEqual([]);
  });

  // The reverse direction, and the one a behavioral test structurally cannot
  // see: a twelfth game could carry the three fields and hand-roll the press
  // arm beside them, which is precisely how eleven copies came to exist. What
  // is being asserted is that no such code exists, so it has to be a source
  // scan — the same reasoning as `emittable-keys.test.ts`'s.
  it("every enrolled game routes its pointer press through the shared arm", () => {
    const missing = membersNotMentioning(noteTaking.ids, "pressNoteTakingCell(");
    expect(
      missing,
      "carry the note-taking Ui but never call pressNoteTakingCell — either " +
        "route the press through it, or drop the fields if the game is not " +
        "really doing this mechanic.",
    ).toEqual([]);
  });
});
