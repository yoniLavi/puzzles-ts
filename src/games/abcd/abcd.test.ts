/**
 * Behavioural tests for the ABCD port.
 *
 * Tier 1 — params/desc codec, the deductive solver's three verdicts, the
 * generator, move semantics, findMistakes, completion — all pure.
 * Tier 2.5 — render-scenario snapshots + targeted op assertions for the initial
 * frame, cursor, pencil marks, a live adjacency error, the completion flash,
 * and the Check-&-Save mistake overlay (including the diff-key repaint
 * regression).
 */

import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { LEFT_BUTTON, RIGHT_BUTTON } from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { newAbcdDesc } from "./generator.ts";
import { abcdGame } from "./index.ts";
import {
  COL_ERROR,
  COL_HIGHLIGHT,
  COL_PENCIL_BODY,
  newDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import { solveAbcd } from "./solver.ts";
import {
  type AbcdMove,
  type AbcdParams,
  type AbcdState,
  type AbcdUi,
  cuboid,
  decodeParams,
  EMPTY,
  encodeParams,
  horClue,
  NO_NUMBER,
  newState,
  newUi,
  parseNumbers,
  validateDesc,
  validateParams,
} from "./state.ts";

const P = (
  w: number,
  h: number,
  n: number,
  diag = false,
  removenums = false,
): AbcdParams => ({ w, h, n, diag, removenums });

const RENDER_ID = "5x5n4#abcd-render";

/** Reach into a driven Midend for its live state. */
function stateOf(
  me: Midend<AbcdParams, AbcdState, AbcdMove, unknown, unknown>,
): AbcdState {
  return (me as unknown as { state: AbcdState }).state;
}

// --- tier 1: params / desc codec -------------------------------------------

describe("abcd params codec", () => {
  it("round-trips every preset and the diag/removenums flags", () => {
    const cases = [
      P(4, 4, 4),
      P(5, 5, 4, false, true),
      P(7, 7, 3),
      P(5, 5, 5, true),
      P(6, 4, 5, true, true),
    ];
    for (const p of cases) {
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
    }
  });

  it("omits removenums (R) from the non-full encoding, keeps diag (D)", () => {
    const p = P(5, 5, 5, true, true);
    expect(encodeParams(p, true)).toBe("5x5n5DR");
    expect(encodeParams(p, false)).toBe("5x5n5D");
  });

  it("defaults height to width and letters to the default when omitted", () => {
    // "4" → 4x4, letters default (from defaultParams = 5x5n4).
    const p = decodeParams("4");
    expect(p.w).toBe(4);
    expect(p.h).toBe(4);
  });

  it("validates params in upstream order", () => {
    expect(validateParams(P(1, 5, 4), true)).toMatch(/Width/);
    expect(validateParams(P(5, 1, 4), true)).toMatch(/Height/);
    expect(validateParams(P(5, 5, 2), true)).toMatch(/at least 3/);
    expect(validateParams(P(5, 5, 4, true), true)).toMatch(/Diagonal/);
    expect(validateParams(P(5, 5, 10), true)).toMatch(/no more than 9/);
    expect(validateParams(P(5, 5, 4), true)).toBeNull();
    expect(validateParams(P(5, 5, 5, true), true)).toBeNull();
  });
});

describe("abcd desc codec", () => {
  it("accepts a generated desc and round-trips the numbers", () => {
    const p = P(5, 5, 4);
    const { desc } = newAbcdDesc(p, randomNew("desc-1"));
    expect(validateDesc(p, desc)).toBeNull();
    const numbers = parseNumbers(p, desc);
    expect(numbers.length).toBe((p.w + p.h) * p.n);
  });

  it("rejects wrong clue counts, invalid characters and out-of-range clues", () => {
    const p = P(3, 3, 3); // (3+3)*3 = 18 clues expected
    expect(validateDesc(p, "1,".repeat(17))).toMatch(/not enough/);
    expect(validateDesc(p, "1,".repeat(19))).toMatch(/too many/);
    expect(validateDesc(p, `${"1,".repeat(17)}Z,`)).toMatch(/Invalid character/);
    // A row clue may not exceed 1 + w/2 = 2 for w=3.
    expect(validateDesc(p, `9,${"1,".repeat(17)}`)).toMatch(/invalid number/);
  });
});

// --- tier 1: solver --------------------------------------------------------

describe("abcd solver", () => {
  it("solves a generated board to a unique grid", () => {
    const p = P(5, 5, 4);
    const { desc } = newAbcdDesc(p, randomNew("solve-1"));
    const res = solveAbcd(p, parseNumbers(p, desc));
    expect(res.status).toBe("solved");
    // Every cell filled with a valid letter.
    for (const g of res.grid) expect(g).toBeGreaterThanOrEqual(0);
  });

  it("reports an all-hidden clue set as ambiguous", () => {
    const p = P(3, 3, 3);
    const numbers = new Int32Array((p.w + p.h) * p.n).fill(NO_NUMBER);
    expect(solveAbcd(p, numbers).status).toBe("ambiguous");
  });

  it("reports a contradictory clue set as a contradiction", () => {
    // Row 0 forbids every letter (all three counts = 0), so both of its cells
    // lose all candidates — a dead end.
    const p = P(2, 2, 3);
    const numbers = new Int32Array((p.w + p.h) * p.n).fill(NO_NUMBER);
    for (let c = 0; c < p.n; c++) numbers[horClue(0, c, p.n)] = 0;
    expect(solveAbcd(p, numbers).status).toBe("contradiction");
  });
});

// --- tier 1: move semantics + completion + findMistakes --------------------

describe("abcd moves through a Midend", () => {
  it("enters and clears a letter, and toggles a pencil mark", () => {
    const me = new Midend(abcdGame);
    expect(me.newGameFromId(RENDER_ID)).toBeUndefined();
    const w = stateOf(me).params.w;

    me.playMoves([{ type: "enter", x: 1, y: 1, letter: 2 }]);
    expect(stateOf(me).grid[1 * w + 1]).toBe(2);

    me.playMoves([{ type: "enter", x: 1, y: 1, letter: null }]);
    expect(stateOf(me).grid[1 * w + 1]).toBe(EMPTY);

    const n = stateOf(me).params.n;
    me.playMoves([{ type: "pencil", x: 0, y: 0, letter: 1 }]);
    expect(stateOf(me).pencil[cuboid(0, 0, 1, n, w)]).toBe(1);
    me.playMoves([{ type: "pencil", x: 0, y: 0, letter: 1 }]); // toggle off
    expect(stateOf(me).pencil[cuboid(0, 0, 1, n, w)]).toBe(0);
  });

  it("costs no undo step for an entry that would change nothing", () => {
    // Upstream's own `TODO Prevent operations which do nothing`: re-typing the
    // letter already in a cell, or clearing an already-empty one, used to be a
    // committed move the player then had to undo.
    const p = P(5, 5, 4);
    const ts = abcdGame.preferredTileSize ?? 36;
    const st = newState(p, newAbcdDesc(p, randomNew("noop-1")).desc);
    const ds = newDrawState(st);
    setTileSize(ds, ts);
    const at = (s: AbcdState, x: number, y: number): AbcdUi => {
      const ui = newUi(s);
      ui.hshow = true;
      ui.hcursor = true;
      ui.hx = x;
      ui.hy = y;
      return ui;
    };
    const KEY_A = 97; // 'a' — letter 0
    const KEY_B = 98; // 'b' — letter 1
    const CLEAR = 8; // Backspace

    // An empty cell: clearing it changes nothing, typing into it does.
    expect(abcdGame.interpretMove(st, at(st, 0, 0), ds, { x: 0, y: 0 }, CLEAR)).toBe(
      null,
    );
    const first = abcdGame.interpretMove(st, at(st, 0, 0), ds, { x: 0, y: 0 }, KEY_A);
    expect(first).toEqual({ type: "enter", x: 0, y: 0, letter: 0 });

    // With that letter placed, re-typing it is a no-op; a different one is not.
    const s1 = abcdGame.executeMove(st, first as AbcdMove);
    expect(abcdGame.interpretMove(s1, at(s1, 0, 0), ds, { x: 0, y: 0 }, KEY_A)).toBe(
      null,
    );
    expect(abcdGame.interpretMove(s1, at(s1, 0, 0), ds, { x: 0, y: 0 }, KEY_B)).toEqual(
      { type: "enter", x: 0, y: 0, letter: 1 },
    );
    expect(abcdGame.interpretMove(s1, at(s1, 0, 0), ds, { x: 0, y: 0 }, CLEAR)).toEqual(
      { type: "enter", x: 0, y: 0, letter: null },
    );

    // Clearing an empty cell that still carries notes *does* change something —
    // `executeMove` wipes its pencil cube — so it must stay a real move.
    const noted = abcdGame.executeMove(st, { type: "pencil", x: 1, y: 1, letter: 2 });
    expect(
      abcdGame.interpretMove(noted, at(noted, 1, 1), ds, { x: 0, y: 0 }, CLEAR),
    ).toEqual({ type: "enter", x: 1, y: 1, letter: null });
  });

  it("adaptive mark-all: first M fills empty cells; repeat M only strikes, never resets", () => {
    const p = P(5, 5, 4);
    const ts = abcdGame.preferredTileSize ?? 36;
    const st = newState(p, newAbcdDesc(p, randomNew("m-1")).desc);
    const ui = newUi(st);
    const ds = newDrawState(st);
    setTileSize(ds, ts);
    const { w, n } = p;
    const KEY_M = 77;

    // Put an ink letter down so we can confirm the fill skips filled cells.
    const withLetter = abcdGame.executeMove(st, {
      type: "enter",
      x: 2,
      y: 2,
      letter: 0,
    });

    // First M press → pencilAll.
    const m1 = abcdGame.interpretMove(withLetter, ui, ds, { x: 0, y: 0 }, KEY_M);
    expect(m1).toEqual({ type: "pencilAll" });
    const filled = abcdGame.executeMove(withLetter, m1 as AbcdMove);
    // Every empty cell has all n candidates; the filled cell has none.
    for (let c = 0; c < n; c++) {
      expect(filled.pencil[cuboid(0, 0, c, n, w)]).toBe(1);
      expect(filled.pencil[cuboid(2, 2, c, n, w)]).toBe(0);
    }

    // Manually erase one candidate the player decided against.
    const erased = abcdGame.executeMove(filled, {
      type: "pencil",
      x: 0,
      y: 0,
      letter: 1,
    });
    expect(erased.pencil[cuboid(0, 0, 1, n, w)]).toBe(0);

    // A repeat M press must NEVER re-fill: it is either a strike or a no-op.
    const m2 = abcdGame.interpretMove(erased, ui, ds, { x: 0, y: 0 }, KEY_M);
    expect(m2 === null || (m2 as { type: string }).type === "pencilStrike").toBe(true);
    if (m2 !== null) {
      const after = abcdGame.executeMove(erased, m2 as AbcdMove);
      // The manually-erased candidate stays erased (strike only removes).
      expect(after.pencil[cuboid(0, 0, 1, n, w)]).toBe(0);
    }
  });

  it("mark-all strikes an adjacency-blocked candidate on the second press", () => {
    // Place a letter, fill notes, then M must strike that letter from the
    // orthogonally-adjacent empty cells (the no-touch rule — an obvious removal).
    const p = P(5, 5, 4);
    const ts = abcdGame.preferredTileSize ?? 36;
    const st = newState(p, newAbcdDesc(p, randomNew("m-2")).desc);
    const ui = newUi(st);
    const ds = newDrawState(st);
    setTileSize(ds, ts);
    const { w, n } = p;

    let s = abcdGame.executeMove(st, { type: "enter", x: 1, y: 1, letter: 0 });
    s = abcdGame.executeMove(s, { type: "pencilAll" });
    // A-candidate is still noted in the neighbour (1,0) right after the fill.
    expect(s.pencil[cuboid(1, 0, 0, n, w)]).toBe(1);

    const m = abcdGame.interpretMove(s, ui, ds, { x: 0, y: 0 }, 77);
    expect((m as { type: string }).type).toBe("pencilStrike");
    const after = abcdGame.executeMove(s, m as AbcdMove);
    // The neighbour can no longer be 'A' (adjacent to the placed A).
    expect(after.pencil[cuboid(1, 0, 0, n, w)]).toBe(0);
  });

  it("Solve completes the board and reports solved-with-help", () => {
    const me = new Midend(abcdGame);
    expect(me.newGameFromId(RENDER_ID)).toBeUndefined();
    expect(me.solve()).toBeUndefined();
    expect(stateOf(me).completed).toBe(true);
    expect(stateOf(me).cheated).toBe(true);
  });

  it("filling in the unique solution completes the board", () => {
    const me = new Midend(abcdGame);
    expect(me.newGameFromId(RENDER_ID)).toBeUndefined();
    const st = stateOf(me);
    const { w, h } = st.params;
    const sol = solveAbcd(st.params, st.numbers).grid;
    const moves: AbcdMove[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        moves.push({ type: "enter", x, y, letter: sol[y * w + x] });
    me.playMoves(moves);
    expect(stateOf(me).completed).toBe(true);
    expect(stateOf(me).cheated).toBe(false); // a genuine (non-cheated) solve
  });
});

describe("abcd input (interpretMove)", () => {
  const ts = abcdGame.preferredTileSize ?? 36;
  // Cell (gx, gy) centre in pixels: FROMCOORD is floor(px/ts) - n, so cell x
  // starts at (x + n) * ts.
  const centre = (p: AbcdParams, gx: number, gy: number) => ({
    x: (gx + p.n) * ts + (ts >> 1),
    y: (gy + p.n) * ts + (ts >> 1),
  });

  it("right-click toggles a sticky pencil mode; left-click keeps the mode", () => {
    const p = P(5, 5, 4);
    const st = newState(p, newAbcdDesc(p, randomNew("in-1")).desc);
    const ui = newUi(st);
    const ds = newDrawState(st);
    setTileSize(ds, ts);
    expect(ui.pencilSticky).toBe(true); // fork default

    // Left-click selects a cell for ink.
    abcdGame.interpretMove(st, ui, ds, centre(p, 2, 3), LEFT_BUTTON);
    expect(ui.hshow).toBe(true);
    expect(ui.hpencil).toBe(false);
    expect([ui.hx, ui.hy]).toEqual([2, 3]);

    // Right-click toggles pencil mode ON and moves the highlight onto the cell.
    abcdGame.interpretMove(st, ui, ds, centre(p, 1, 1), RIGHT_BUTTON);
    expect(ui.hpencil).toBe(true);
    expect([ui.hx, ui.hy]).toEqual([1, 1]);

    // A left-click on a new cell keeps pencil mode ON (sticky).
    abcdGame.interpretMove(st, ui, ds, centre(p, 0, 0), LEFT_BUTTON);
    expect(ui.hpencil).toBe(true);
    expect([ui.hx, ui.hy]).toEqual([0, 0]);

    // Right-click again toggles pencil mode OFF (stays on until right-clicked again).
    abcdGame.interpretMove(st, ui, ds, centre(p, 0, 0), RIGHT_BUTTON);
    expect(ui.hpencil).toBe(false);

    // A left-click on the already-highlighted cell deselects it.
    abcdGame.interpretMove(st, ui, ds, centre(p, 0, 0), LEFT_BUTTON);
    expect(ui.hshow).toBe(false);
  });

  it("a letter key on a selected cell emits an enter move", () => {
    const p = P(5, 5, 4);
    const st = newState(p, newAbcdDesc(p, randomNew("in-2")).desc);
    const ui = newUi(st);
    const ds = newDrawState(st);
    setTileSize(ds, ts);
    abcdGame.interpretMove(st, ui, ds, centre(p, 0, 0), LEFT_BUTTON);
    // 'C' (67) → letter index 2; bare '3' (51) → index 2 as well.
    expect(abcdGame.interpretMove(st, ui, ds, { x: 0, y: 0 }, 67)).toEqual({
      type: "enter",
      x: 0,
      y: 0,
      letter: 2,
    });
    ui.hshow = true;
    expect(abcdGame.interpretMove(st, ui, ds, { x: 0, y: 0 }, 51)).toEqual({
      type: "enter",
      x: 0,
      y: 0,
      letter: 2,
    });
  });
});

describe("abcd findMistakes", () => {
  it("flags a wrong entry and clears on the correct one", () => {
    const p = P(5, 5, 4);
    const { desc } = newAbcdDesc(p, randomNew("mist-1"));
    const st = newState(p, desc);
    const sol = solveAbcd(p, st.numbers).grid;
    const wrong = (sol[0] + 1) % p.n;

    const bad = abcdGame.executeMove(st, { type: "enter", x: 0, y: 0, letter: wrong });
    expect(abcdGame.findMistakes?.(bad)).toContainEqual({ x: 0, y: 0 });

    const good = abcdGame.executeMove(st, {
      type: "enter",
      x: 0,
      y: 0,
      letter: sol[0],
    });
    expect(abcdGame.findMistakes?.(good) ?? []).toHaveLength(0);
  });

  it("reports no mistakes on an empty board", () => {
    const p = P(5, 5, 4);
    const { desc } = newAbcdDesc(p, randomNew("mist-2"));
    expect(abcdGame.findMistakes?.(newState(p, desc)) ?? []).toHaveLength(0);
  });
});

describe("abcd textFormat", () => {
  it("renders a labelled ASCII board and reflects an entered letter", () => {
    const p = P(5, 5, 4);
    const st = newState(p, newAbcdDesc(p, randomNew("txt-1")).desc);
    const withA = abcdGame.executeMove(st, { type: "enter", x: 0, y: 0, letter: 0 });
    const text = abcdGame.textFormat?.(withA);
    expect(text).toBeDefined();
    // The border letters and the entered 'A' are present; empty cells are '.'.
    expect(text).toContain("A");
    expect(text).toContain(".");
    // The grid is outlined with '-' / '|'.
    expect(text).toContain("-");
    expect(text).toContain("|");
  });

  it("returns undefined when a clue could be two digits (w ≥ 19)", () => {
    // Build a wide state directly (generation would be slow); textFormat only
    // reads params/grid/numbers.
    const p = P(19, 3, 4);
    const numbers = new Int32Array((p.w + p.h) * p.n);
    const st = {
      ...newState(P(3, 3, 4), "0,".repeat(18)),
      params: p,
      numbers,
    } as never;
    expect(abcdGame.textFormat?.(st)).toBeUndefined();
  });
});

// --- tier 2.5: rendering ---------------------------------------------------

describe("abcd render", () => {
  it("draws the initial frame with border letters and clues", () => {
    const { recording } = renderScenario({ game: abcdGame, id: RENDER_ID });
    // Border letters + edge clues are text.
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    // The cell grid draws rects (tile backgrounds) and polygons (borders).
    expect(recording.ops.some((o) => o.op === "rect")).toBe(true);
    expect(recording.ops.some((o) => o.op === "polygon")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("paints a cursor highlight and pencil marks in a direct redraw", () => {
    const st = newState(P(5, 5, 4), newAbcdDesc(P(5, 5, 4), randomNew("r-cur")).desc);
    const ui = newUi(st);
    ui.hshow = true;
    ui.hx = 2;
    ui.hy = 2;
    const withMark = abcdGame.executeMove(st, {
      type: "pencil",
      x: 2,
      y: 2,
      letter: 0,
    });
    const palette = abcdGame.colours([0.9, 0.9, 0.9]);
    const ds = newDrawState(withMark);
    setTileSize(ds, abcdGame.preferredTileSize ?? 36);
    const dr = new RecordingDrawing(palette);
    redraw(dr, ds, null, withMark, 1, ui, 0, 0);
    // The highlighted cursor cell fills its background COL_HIGHLIGHT.
    expect(dr.ops.some((o) => o.op === "rect" && o.colour === COL_HIGHLIGHT)).toBe(
      true,
    );
    // The pencil mark 'A' is drawn as text.
    expect(dr.ops.some((o) => o.op === "text" && o.text === "A")).toBe(true);
  });

  it("draws the pencil-mode indicator only while pencil mode is on", () => {
    const st = newState(P(5, 5, 4), newAbcdDesc(P(5, 5, 4), randomNew("r-ind")).desc);
    const palette = abcdGame.colours([0.9, 0.9, 0.9]);
    const render = (hpencil: boolean): RecordingDrawing => {
      const ui = newUi(st);
      ui.hpencil = hpencil;
      ui.hshow = hpencil;
      const ds = newDrawState(st);
      setTileSize(ds, abcdGame.preferredTileSize ?? 36);
      const dr = new RecordingDrawing(palette);
      redraw(dr, ds, null, st, 1, ui, 0, 0);
      return dr;
    };
    const glyph = (r: RecordingDrawing) =>
      r.ops.some((o) => o.op === "polygon" && o.fill === COL_PENCIL_BODY);
    expect(glyph(render(true))).toBe(true);
    expect(glyph(render(false))).toBe(false);
  });

  it("reds a letter that breaks the adjacency rule", () => {
    // Two identical letters side by side must both draw in COL_ERROR.
    const st = newState(P(5, 5, 4), newAbcdDesc(P(5, 5, 4), randomNew("r-adj")).desc);
    let s = abcdGame.executeMove(st, { type: "enter", x: 0, y: 0, letter: 0 });
    s = abcdGame.executeMove(s, { type: "enter", x: 1, y: 0, letter: 0 });
    const palette = abcdGame.colours([0.9, 0.9, 0.9]);
    const ds = newDrawState(s);
    setTileSize(ds, abcdGame.preferredTileSize ?? 36);
    const dr = new RecordingDrawing(palette);
    redraw(dr, ds, null, s, 1, newUi(s), 0, 0);
    expect(dr.ops.some((o) => o.op === "text" && o.colour === COL_ERROR)).toBe(true);
  });

  it("runs the completion flash on a genuine solve", () => {
    const p = P(5, 5, 4);
    const st = newState(p, newAbcdDesc(p, randomNew("r-flash")).desc);
    const sol = solveAbcd(p, st.numbers).grid;
    let s = st;
    const { w, h } = p;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        s = abcdGame.executeMove(s, { type: "enter", x, y, letter: sol[y * w + x] });
    expect(s.completed).toBe(true);
    const flash = abcdGame.flashLength?.(st, s, 1, newUi(s)) ?? 0;
    expect(flash).toBeGreaterThan(0);
    // A flashing frame paints highlight/lowlight stripe backgrounds.
    const palette = abcdGame.colours([0.9, 0.9, 0.9]);
    const ds = newDrawState(s);
    setTileSize(ds, abcdGame.preferredTileSize ?? 36);
    const dr = new RecordingDrawing(palette);
    redraw(dr, ds, null, s, 1, newUi(s), 0, flash);
    expect(dr.ops.some((o) => o.op === "rect" && o.colour === COL_HIGHLIGHT)).toBe(
      true,
    );
  });

  it("Check & Save highlights a mistake even when the cell was already drawn", () => {
    // Regression: the mistake overlay isn't part of the tile value, so it must
    // be in the diff cache key or a findMistakes() a frame after the move
    // repaints nothing.
    const me = new Midend(abcdGame);
    expect(me.newGameFromId(RENDER_ID)).toBeUndefined();
    const st = stateOf(me);
    const sol = solveAbcd(st.params, st.numbers).grid;
    const wrong = (sol[0] + 1) % st.params.n;
    me.playMoves([{ type: "enter", x: 0, y: 0, letter: wrong }]);

    const palette = abcdGame.colours([0.9, 0.9, 0.9]);
    me.redraw(new RecordingDrawing(palette)); // first paint, no overlay yet
    expect(me.findMistakes()).toBeGreaterThan(0);
    const after = new RecordingDrawing(palette);
    me.redraw(after);
    expect(after.ops.some((o) => o.op === "line" && o.colour === COL_ERROR)).toBe(true);
  });
});

// --- tier 3: save round-trip -----------------------------------------------

describe("abcd save round-trip", () => {
  it("restores an equivalent game after some progress", () => {
    const me = new Midend(abcdGame);
    expect(me.newGameFromId(RENDER_ID)).toBeUndefined();
    me.playMoves([
      { type: "enter", x: 0, y: 0, letter: 0 },
      { type: "pencil", x: 1, y: 1, letter: 2 },
    ]);
    const saved = me.saveGame();
    const me2 = new Midend(abcdGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(Array.from(stateOf(me2).grid)).toEqual(Array.from(stateOf(me).grid));
    expect(Array.from(stateOf(me2).pencil)).toEqual(Array.from(stateOf(me).pencil));
  });
});
