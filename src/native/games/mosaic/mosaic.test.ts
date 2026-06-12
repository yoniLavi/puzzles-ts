// Tier-1 logic: params codec, desc codec, move execution (toggle cycle,
// paint semantics, solve bitmap), clue SOLVED/ERROR flagging, completion
// counting, status / status bar, text format, and input mapping.
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import {
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { mosaicGame } from "./index.ts";
import {
  decodeParams,
  encodeBoard,
  encodeParams,
  executeMove,
  type MosaicState,
  type MosaicUi,
  newState,
  STATE_BLANK,
  STATE_ERROR,
  STATE_MARKED,
  STATE_SOLVED,
  status,
  statusbarText,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// 3×3 all-black image: every clue saturates its clipped neighbourhood
// (4 corner / 6 edge / 9 centre), so marking everything black solves it.
const ALL_BLACK_DESC = "464696464";
const P3 = { width: 3, height: 3, aggressive: true };

function freshUi(): MosaicUi {
  return { lastX: -1, lastY: -1, lastState: 0, curX: 0, curY: 0, cursorVisible: false };
}

describe("Mosaic params", () => {
  it("encodes WxH and elides default aggressiveness", () => {
    expect(encodeParams({ width: 10, height: 8, aggressive: true }, true)).toBe("10x8");
    expect(encodeParams({ width: 50, height: 50, aggressive: false }, true)).toBe(
      "50x50h0",
    );
    // Short (non-full) encoding never carries the suffix.
    expect(encodeParams({ width: 50, height: 50, aggressive: false }, false)).toBe(
      "50x50",
    );
  });

  it("decodes round-trips and square shorthand", () => {
    expect(decodeParams("10x8")).toEqual({ width: 10, height: 8, aggressive: true });
    expect(decodeParams("50x50h0")).toEqual({
      width: 50,
      height: 50,
      aggressive: false,
    });
    expect(decodeParams("7")).toEqual({ width: 7, height: 7, aggressive: true });
  });

  it("validates size bounds", () => {
    expect(validateParams({ width: 2, height: 3, aggressive: true }, true)).toBeTruthy();
    expect(validateParams({ width: 3, height: 3, aggressive: true }, true)).toBeNull();
    expect(
      validateParams({ width: 101, height: 100, aggressive: true }, true),
    ).toBeTruthy();
    expect(
      validateParams({ width: 100, height: 100, aggressive: true }, true),
    ).toBeNull();
  });
});

describe("Mosaic desc codec", () => {
  it("parses digits and letter runs", () => {
    const state = newState({ width: 3, height: 3, aggressive: true }, "4b69c4");
    // 4, [2 hidden], 6, 9, [3 hidden], 4 — scan order.
    expect(Array.from(state.board.clues)).toEqual([4, -1, -1, 6, 9, -1, -1, -1, 4]);
    expect(state.notCompletedClues).toBe(4);
  });

  it("round-trips through encodeBoard", () => {
    for (const desc of [ALL_BLACK_DESC, "4b69c4", "a0a0a0a0a"]) {
      const state = newState(P3, desc);
      expect(encodeBoard(state.board)).toBe(desc);
    }
  });

  it("encodes a >26-cell hidden run with a z boundary", () => {
    // 6×5 board, clue at the first cell, 29 hidden cells: z (26) + c (3).
    const p = { width: 6, height: 5, aggressive: true };
    const desc = "5zc";
    expect(validateDesc(p, desc)).toBeNull();
    const state = newState(p, desc);
    expect(state.board.clues[0]).toBe(5);
    expect(encodeBoard(state.board)).toBe(desc);
  });

  it("rejects malformed descs", () => {
    expect(validateDesc(P3, "46469646!")).toBeTruthy(); // bad char
    expect(validateDesc(P3, "4646")).toBeTruthy(); // too short
    expect(validateDesc(P3, ALL_BLACK_DESC)).toBeNull();
  });
});

describe("Mosaic moves", () => {
  it("toggles a cell through marked → blank → unmarked", () => {
    let s = newState(P3, ALL_BLACK_DESC);
    s = executeMove(s, { type: "toggle", x: 1, y: 1, double: false });
    expect(s.cells[4] & 3).toBe(STATE_MARKED);
    s = executeMove(s, { type: "toggle", x: 1, y: 1, double: false });
    expect(s.cells[4] & 3).toBe(STATE_BLANK);
    s = executeMove(s, { type: "toggle", x: 1, y: 1, double: false });
    expect(s.cells[4] & 3).toBe(0);
  });

  it("double-toggle cycles the other way", () => {
    let s = newState(P3, ALL_BLACK_DESC);
    s = executeMove(s, { type: "toggle", x: 1, y: 1, double: true });
    expect(s.cells[4] & 3).toBe(STATE_BLANK);
  });

  it("is pure: the input state is untouched", () => {
    const s = newState(P3, ALL_BLACK_DESC);
    executeMove(s, { type: "toggle", x: 0, y: 0, double: false });
    expect(s.cells[0]).toBe(0);
  });

  it("throws on an out-of-bounds toggle", () => {
    const s = newState(P3, ALL_BLACK_DESC);
    expect(() => executeMove(s, { type: "toggle", x: 3, y: 0, double: false })).toThrow();
  });

  it("paints only still-unmarked cells along the run", () => {
    let s = newState(P3, ALL_BLACK_DESC);
    // Pre-mark the middle of the top row black.
    s = executeMove(s, { type: "toggle", x: 1, y: 0, double: false });
    // Paint blank from (2,0) back toward the (0,0) anchor.
    s = executeMove(s, {
      type: "paint",
      x: 2,
      y: 0,
      srcX: 0,
      srcY: 0,
      paintState: STATE_BLANK,
    });
    expect(s.cells[2] & 3).toBe(STATE_BLANK); // painted
    expect(s.cells[1] & 3).toBe(STATE_MARKED); // untouched (already marked)
    expect(s.cells[0] & 3).toBe(0); // anchor excluded
  });

  it("flags a satisfied clue SOLVED and counts completion", () => {
    let s = newState(P3, ALL_BLACK_DESC);
    expect(s.notCompletedClues).toBe(9);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        s = executeMove(s, { type: "toggle", x, y, double: false });
      }
    }
    expect(s.notCompletedClues).toBe(0);
    expect(s.cells[4] & STATE_SOLVED).toBeTruthy();
    expect(status(s)).toBe("solved");
  });

  it("flags an overcommitted clue ERROR", () => {
    // All-white board: every clue is 0; marking a cell black contradicts
    // its neighbouring clues (clue < marked).
    let s = newState(P3, "000000000");
    s = executeMove(s, { type: "toggle", x: 1, y: 1, double: false });
    expect(s.cells[0] & STATE_ERROR).toBeTruthy();
    expect(s.cells[4] & STATE_ERROR).toBeTruthy();
  });

  it("clears the ERROR flag when the contradiction is undone", () => {
    let s = newState(P3, "000000000");
    s = executeMove(s, { type: "toggle", x: 1, y: 1, double: false });
    expect(s.cells[0] & STATE_ERROR).toBeTruthy();
    // marked → blank: no contradiction left.
    s = executeMove(s, { type: "toggle", x: 1, y: 1, double: false });
    expect(s.cells[0] & STATE_ERROR).toBeFalsy();
  });

  it("applies a solve bitmap with SOLVED flags and zero clues left", () => {
    const s = newState(P3, ALL_BLACK_DESC);
    // 9 cells all marked: 0xff 0x80.
    const solved = executeMove(s, { type: "solve", solution: "ff80" });
    expect(solved.cheating).toBe(true);
    expect(solved.notCompletedClues).toBe(0);
    for (let i = 0; i < 9; i++) {
      expect(solved.cells[i] & 3).toBe(STATE_MARKED);
      expect(solved.cells[i] & STATE_SOLVED).toBeTruthy();
    }
    expect(statusbarText(solved, freshUi())).toBe("Auto solved");
  });

  it("rejects a truncated solve bitmap", () => {
    const s = newState(P3, ALL_BLACK_DESC);
    expect(() => executeMove(s, { type: "solve", solution: "ff" })).toThrow();
  });
});

describe("Mosaic status / text", () => {
  it("reports the live clue count then COMPLETED!", () => {
    let s = newState(P3, ALL_BLACK_DESC);
    expect(statusbarText(s, freshUi())).toBe("Clues left: 9");
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        s = executeMove(s, { type: "toggle", x, y, double: false });
      }
    }
    expect(statusbarText(s, freshUi())).toBe("COMPLETED!");
  });

  it("formats the clue grid as text", () => {
    const s = newState(P3, "4b69c4");
    expect(textFormat(s)).toBe("|4|| || |\n|6||9|| |\n| || ||4|\n");
  });
});

describe("Mosaic input mapping", () => {
  const ds = { started: false, tilesize: 32, width: 3, height: 3, cache: new Int32Array(0) };
  const at = (cx: number, cy: number) => ({ x: 16 + 32 * cx + 16, y: 16 + 32 * cy + 16 });

  function fresh(): { s: MosaicState; ui: MosaicUi } {
    return { s: newState(P3, ALL_BLACK_DESC), ui: freshUi() };
  }

  it("maps a left click to a single toggle and captures the paint state", () => {
    const { s, ui } = fresh();
    const move = mosaicGame.interpretMove(s, ui, ds, at(1, 1), LEFT_BUTTON);
    expect(move).toEqual({ type: "toggle", x: 1, y: 1, double: false });
    expect(ui.lastState).toBe(STATE_MARKED); // unmarked cell will become black
    expect(ui.lastX).toBe(1);
  });

  it("maps a right click to a double toggle painting blank", () => {
    const { s, ui } = fresh();
    const move = mosaicGame.interpretMove(s, ui, ds, at(0, 0), RIGHT_BUTTON);
    expect(move).toEqual({ type: "toggle", x: 0, y: 0, double: true });
    expect(ui.lastState).toBe(STATE_BLANK);
  });

  it("ignores clicks in the margin", () => {
    const { s, ui } = fresh();
    expect(mosaicGame.interpretMove(s, ui, ds, { x: 4, y: 40 }, LEFT_BUTTON)).toBeNull();
  });

  it("emits an aligned drag paint and advances the anchor", () => {
    const { s, ui } = fresh();
    mosaicGame.interpretMove(s, ui, ds, at(0, 0), LEFT_BUTTON);
    const move = mosaicGame.interpretMove(s, ui, ds, at(2, 0), LEFT_DRAG);
    expect(move).toEqual({
      type: "paint",
      x: 2,
      y: 0,
      srcX: 0,
      srcY: 0,
      paintState: STATE_MARKED,
    });
    expect(ui.lastX).toBe(2);
  });

  it("suppresses a drag that would change nothing", () => {
    let { s } = fresh();
    const ui = freshUi();
    // Mark the whole top row first.
    for (let x = 0; x < 3; x++) {
      s = executeMove(s, { type: "toggle", x, y: 0, double: false });
    }
    mosaicGame.interpretMove(s, ui, ds, at(0, 0), LEFT_BUTTON);
    // (toggle not applied to s — but the drag's change-check reads s,
    // where every top-row cell is already marked.)
    expect(mosaicGame.interpretMove(s, ui, ds, at(2, 0), LEFT_DRAG)).toBeNull();
  });

  it("resets the anchor on a non-aligned drag", () => {
    const { s, ui } = fresh();
    mosaicGame.interpretMove(s, ui, ds, at(0, 0), LEFT_BUTTON);
    expect(mosaicGame.interpretMove(s, ui, ds, at(2, 2), LEFT_DRAG)).toBeNull();
    expect(ui.lastX).toBe(-1);
  });

  it("a release paints without advancing the anchor", () => {
    const { s, ui } = fresh();
    mosaicGame.interpretMove(s, ui, ds, at(0, 0), LEFT_BUTTON);
    const move = mosaicGame.interpretMove(s, ui, ds, at(0, 2), LEFT_RELEASE);
    expect(move).toMatchObject({ type: "paint", x: 0, y: 2 });
    expect(ui.lastX).toBe(0);
    expect(ui.lastY).toBe(0);
  });

  it("moves the cursor with clamping and toggles via select", () => {
    const { s, ui } = fresh();
    expect(mosaicGame.interpretMove(s, ui, ds, { x: 0, y: 0 }, CURSOR_RIGHT)).toBe(
      UI_UPDATE,
    );
    expect(ui.curX).toBe(1);
    expect(ui.cursorVisible).toBe(true);
    expect(mosaicGame.interpretMove(s, ui, ds, { x: 0, y: 0 }, CURSOR_SELECT)).toEqual({
      type: "toggle",
      x: 1,
      y: 0,
      double: false,
    });
    expect(mosaicGame.interpretMove(s, ui, ds, { x: 0, y: 0 }, CURSOR_SELECT2)).toEqual({
      type: "toggle",
      x: 1,
      y: 0,
      double: true,
    });
  });

  it("the first select only reveals the cursor", () => {
    const { s, ui } = fresh();
    expect(mosaicGame.interpretMove(s, ui, ds, { x: 0, y: 0 }, CURSOR_SELECT)).toBe(
      UI_UPDATE,
    );
    expect(ui.cursorVisible).toBe(true);
  });

  it("freezes everything but cursor movement after completion", () => {
    let { s } = fresh();
    const ui = freshUi();
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        s = executeMove(s, { type: "toggle", x, y, double: false });
      }
    }
    expect(s.notCompletedClues).toBe(0);
    expect(mosaicGame.interpretMove(s, ui, ds, at(0, 0), LEFT_BUTTON)).toBeNull();
    expect(mosaicGame.interpretMove(s, ui, ds, { x: 0, y: 0 }, CURSOR_RIGHT)).toBe(
      UI_UPDATE,
    );
  });
});
