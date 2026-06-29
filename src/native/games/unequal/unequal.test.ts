/**
 * Behavioural tests for the Unequal port (tier 1 + tier 2.5).
 */

import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { LEFT_BUTTON } from "../../engine/pointer.ts";
import { randomNew } from "../../random/index.ts";
import { newUnequalDesc } from "./generator.ts";
import { unequalGame } from "./index.ts";
import { computeSize, coord, PREFERRED_TILE_SIZE } from "./render.ts";
import { DIFF_IMPOSSIBLE, solveUnequal } from "./solver.ts";
import {
  checkComplete,
  cloneState,
  decodeParams,
  diffToLevel,
  encodeParams,
  type Mode,
  newState,
  newUi,
  type UnequalParams,
  type UnequalState,
  validateDesc,
  validateParams,
} from "./state.ts";

function gen(
  order: number,
  mode: Mode,
  diff: UnequalParams["diff"],
  seed: string,
): { p: UnequalParams; desc: string; aux: string; st: UnequalState } {
  const p: UnequalParams = { order, mode, diff };
  const { desc, aux } = newUnequalDesc(p, randomNew(seed));
  return { p, desc, aux, st: newState(p, desc) };
}

/** The unique solution of a board, derived from its givens only. */
function solveBoard(st: UnequalState): Uint8Array {
  const soln = Uint8Array.from(st.immutable);
  const ret = solveUnequal(st.order, st.mode, st.clueFlags, soln, 4);
  expect(ret).not.toBe(DIFF_IMPOSSIBLE);
  return soln;
}

// --- params + codec --------------------------------------------------------

describe("unequal params", () => {
  it("round-trips both modes", () => {
    const u: UnequalParams = { order: 6, mode: "unequal", diff: "extreme" };
    expect(encodeParams(u, true)).toBe("6dx");
    expect(encodeParams(u, false)).toBe("6");
    expect(decodeParams("6dx")).toEqual(u);

    const a: UnequalParams = { order: 5, mode: "adjacent", diff: "tricky" };
    expect(encodeParams(a, true)).toBe("5adk");
    expect(encodeParams(a, false)).toBe("5a");
    expect(decodeParams("5adk")).toEqual(a);
  });

  it("rejects invalid params", () => {
    expect(validateParams({ order: 2, mode: "unequal", diff: "easy" }, true)).not.toBeNull();
    expect(validateParams({ order: 33, mode: "unequal", diff: "easy" }, true)).not.toBeNull();
    // Adjacent below order 5 at Tricky+ is invalid.
    expect(validateParams({ order: 4, mode: "adjacent", diff: "tricky" }, true)).not.toBeNull();
    expect(validateParams({ order: 5, mode: "adjacent", diff: "tricky" }, true)).toBeNull();
  });
});

describe("unequal desc codec", () => {
  it("round-trips through generate and decode", () => {
    const { p, desc, st } = gen(5, "unequal", "tricky", "codec-1");
    expect(validateDesc(p, desc)).toBeNull();
    // Every given appears in both immutable and grid; non-givens empty.
    for (let i = 0; i < st.order * st.order; i++) {
      if (st.immutable[i]) expect(st.grid[i]).toBe(st.immutable[i]);
      else {
        expect(st.grid[i]).toBe(0);
        expect(st.pencil[i]).toBe(0);
      }
    }
  });

  it("rejects malformed descriptions", () => {
    const p: UnequalParams = { order: 4, mode: "unequal", diff: "easy" };
    expect(validateDesc(p, "0,0,0")).not.toBeNull(); // too few cells
    // A flag pointing off the grid (top-left cell with an UP clue).
    expect(validateDesc(p, "0U,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,")).not.toBeNull();
  });
});

// --- generator -------------------------------------------------------------

describe("unequal generator", () => {
  it.each([
    [5, "unequal", "tricky"],
    [5, "adjacent", "tricky"],
    [6, "unequal", "extreme"],
  ] as const)("generates an exactly-graded board: %s %s %s", (order, mode, diff) => {
    const { p, desc, st } = gen(order, mode, diff, `g-${order}-${mode}-${diff}`);
    expect(validateDesc(p, desc)).toBeNull();
    const want = diffToLevel(diff);
    const soln = Uint8Array.from(st.immutable);
    expect(solveUnequal(order, mode, st.clueFlags, soln, want)).toBe(want);
    // Not solvable below the target (a real deduction is needed).
    if (want > 0) {
      const easier = Uint8Array.from(st.immutable);
      expect(solveUnequal(order, mode, st.clueFlags, easier, want - 1)).not.toBe(want - 1);
    }
  }, 30_000);
});

// --- moves -----------------------------------------------------------------

describe("unequal moves", () => {
  it("enters and pencil-toggles numbers", () => {
    const { st } = gen(5, "unequal", "easy", "moves-1");
    const i = [...st.immutable].indexOf(0);
    const x = i % st.order;
    const y = (i / st.order) | 0;

    const after = unequalGame.executeMove(st, { type: "set", x, y, n: 3, pencil: false });
    expect(after.grid[i]).toBe(3);

    const pen = unequalGame.executeMove(st, { type: "set", x, y, n: 2, pencil: true });
    expect(pen.pencil[i] & (1 << 2)).toBeTruthy();
    const pen2 = unequalGame.executeMove(pen, { type: "set", x, y, n: 2, pencil: true });
    expect(pen2.pencil[i] & (1 << 2)).toBeFalsy();
  });

  it("auto-pencil strikes the placed number from its row and column", () => {
    const { st } = gen(5, "unequal", "easy", "moves-auto");
    const o = st.order;
    // Pencil-fill the board, then place a number with autoElim.
    const all = unequalGame.executeMove(st, { type: "pencilAll" });
    const i = [...all.immutable].indexOf(0);
    const x = i % o;
    const y = (i / o) | 0;
    const after = unequalGame.executeMove(all, { type: "set", x, y, n: 3, pencil: false, autoElim: true });
    for (let k = 0; k < o; k++) {
      if (k !== x) expect(after.pencil[y * o + k] & (1 << 3)).toBeFalsy();
      if (k !== y) expect(after.pencil[k * o + x] & (1 << 3)).toBeFalsy();
    }
  });

  it("toggles a clue's spent flag", () => {
    const { st } = gen(5, "unequal", "tricky", "moves-spent");
    // Find a cell with a RIGHT clue.
    let idx = -1;
    for (let i = 0; i < st.order * st.order; i++) if (st.clueFlags[i] & 4) { idx = i; break; }
    expect(idx).toBeGreaterThanOrEqual(0);
    const x = idx % st.order;
    const y = (idx / st.order) | 0;
    const after = unequalGame.executeMove(st, { type: "spent", x, y, flag: 2048 });
    expect(after.spent[idx] & 2048).toBeTruthy();
    const back = unequalGame.executeMove(after, { type: "spent", x, y, flag: 2048 });
    expect(back.spent[idx] & 2048).toBeFalsy();
  });

  it("completes when the final correct number is placed", () => {
    const { st } = gen(5, "unequal", "easy", "complete-1");
    const o = st.order;
    const soln = solveBoard(st);
    let cur = cloneState(st);
    // Fill every empty cell with the solution; the last one completes.
    const empties: number[] = [];
    for (let i = 0; i < o * o; i++) if (!st.immutable[i]) empties.push(i);
    empties.forEach((i, k) => {
      cur = unequalGame.executeMove(cur, {
        type: "set",
        x: i % o,
        y: (i / o) | 0,
        n: soln[i],
        pencil: false,
      });
      if (k < empties.length - 1) expect(cur.completed).toBe(false);
    });
    expect(cur.completed).toBe(true);
    expect(checkComplete(cur)).toBe(1);
  });
});

// --- findMistakes ----------------------------------------------------------

describe("unequal findMistakes", () => {
  it("flags a wrong number, a note-mistake, and ignores ordinary notes", () => {
    const { st } = gen(5, "unequal", "tricky", "mistake-1");
    const o = st.order;
    const soln = solveBoard(st);
    const empties: number[] = [];
    for (let i = 0; i < o * o; i++) if (!st.immutable[i]) empties.push(i);
    const wrongAt = empties[0];
    const noteAt = empties[1];

    const s = cloneState(st);
    // A wrong number (one off the solution, kept in 1..o).
    s.grid[wrongAt] = soln[wrongAt] === o ? 1 : soln[wrongAt] + 1;
    // A note set that has crossed out the solution value (mistake).
    s.pencil[noteAt] = ((1 << (o + 1)) - (1 << 1)) & ~(1 << soln[noteAt]);
    // An ordinary note (still contains the solution value) elsewhere — not flagged.
    if (empties[2] !== undefined) s.pencil[empties[2]] = 1 << soln[empties[2]];

    const m = unequalGame.findMistakes?.(s) ?? [];
    const has = (x: number, y: number, kind: string) =>
      m.some((e) => e.x === x && e.y === y && e.kind === kind);
    expect(has(wrongAt % o, (wrongAt / o) | 0, "cell")).toBe(true);
    expect(has(noteAt % o, (noteAt / o) | 0, "note")).toBe(true);
    if (empties[2] !== undefined)
      expect(has(empties[2] % o, (empties[2] / o) | 0, "note")).toBe(false);
  });
});

// --- Solve via a real Midend ----------------------------------------------

describe("unequal Solve via Midend", () => {
  it("solves a freshly generated board (aux path)", () => {
    const me = new Midend(unequalGame);
    expect(me.newGameFromId("5dk#unequal-solve")).toBeUndefined();
    expect(me.solve()).toBeUndefined();
    const solved = (me as unknown as { state: UnequalState }).state;
    expect(solved.completed).toBe(true);
    expect(unequalGame.status(solved)).toBe("solved");
  });

  it("save round-trips a played board", () => {
    const me = new Midend(unequalGame);
    expect(me.newGameFromId("5de#unequal-save")).toBeUndefined();
    const st = (me as unknown as { state: UnequalState }).state;
    const i = [...st.immutable].indexOf(0);
    me.playMoves([{ type: "set", x: i % st.order, y: (i / st.order) | 0, n: 1, pencil: false }]);
    const saved = me.saveGame();
    const me2 = new Midend(unequalGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect((me2 as unknown as { state: UnequalState }).state.grid[i]).toBe(1);
  });
});

// --- interpretMove ---------------------------------------------------------

describe("unequal interpretMove", () => {
  const ts = PREFERRED_TILE_SIZE;
  const center = (cx: number, cy: number) => ({
    x: coord(cx, ts) + Math.floor(ts / 2),
    y: coord(cy, ts) + Math.floor(ts / 2),
  });

  it("rejects digit entry into an immutable cell", () => {
    const { st } = gen(5, "unequal", "easy", "im-1");
    const ui = newUi(st);
    const i = [...st.immutable].findIndex((v) => v !== 0);
    const x = i % st.order;
    const y = (i / st.order) | 0;
    // Select the immutable cell (highlight is suppressed for givens).
    unequalGame.interpretMove?.(st, ui, null, center(x, y), LEFT_BUTTON);
    ui.hshow = true;
    ui.hx = x;
    ui.hy = y;
    const move = unequalGame.interpretMove?.(st, ui, null, { x: 0, y: 0 }, 49); // '1'
    expect(move).toBeNull();
  });

  it("maps 'M' to a fill-all-pencil-marks move", () => {
    const { st } = gen(5, "unequal", "easy", "mk-1");
    const ui = newUi(st);
    const move = unequalGame.interpretMove?.(st, ui, null, { x: 0, y: 0 }, 109); // 'm'
    expect(move).toEqual({ type: "pencilAll" });
  });
});

// --- tier 2.5: render scenarios --------------------------------------------

describe("unequal render", () => {
  it("draws greater-than chevrons in Unequal mode", () => {
    const { desc } = gen(5, "unequal", "tricky", "render-u");
    const r = renderScenario({ game: unequalGame, id: `5dk:${desc}` });
    // The chevrons are filled polygons; some clue must be present.
    const polys = r.recording.ops.filter((o) => o.op === "polygon");
    expect(polys.length).toBeGreaterThan(0);
    expect(r.recording.ops).toMatchSnapshot();
  });

  it("draws adjacency bars in Adjacent mode", () => {
    const { desc } = gen(5, "adjacent", "tricky", "render-a");
    const r = renderScenario({ game: unequalGame, id: `5adk:${desc}` });
    // Adjacency bars are filled rects in the gaps; the board has many of them.
    const rects = r.recording.ops.filter((o) => o.op === "rect");
    expect(rects.length).toBeGreaterThan(0);
    expect(r.recording.ops).toMatchSnapshot();
  });

  it("renders pencil marks on a partially-filled board", () => {
    const { p, desc, st } = gen(5, "unequal", "easy", "render-p");
    void p;
    const size = computeSize({ order: st.order }, PREFERRED_TILE_SIZE);
    expect(size.w).toBeGreaterThan(0);
    const r = renderScenario({
      game: unequalGame,
      id: `5de:${desc}`,
      moves: [{ type: "pencilAll" }],
    });
    const texts = r.recording.ops.filter((o) => o.op === "text");
    expect(texts.length).toBeGreaterThan(0);
  });
});

describe("on-screen keys (requestKeys)", () => {
  const keysFor = (order: number) =>
    unequalGame.requestKeys?.({ ...unequalGame.defaultParams(), order });

  it("offers '1'..order plus clear for order < 10", () => {
    expect(keysFor(4)).toEqual([
      ..."1234".split("").map((d) => ({ button: d.charCodeAt(0), label: d })),
      { button: 8, label: "Clear" },
    ]);
  });

  it("switches to a '0'-based keypad for order ≥ 10 (faithful to c2n)", () => {
    // order 10: '0'..'9' = values 1..10, then clear.
    expect(keysFor(10)).toEqual([
      ..."0123456789".split("").map((d) => ({ button: d.charCodeAt(0), label: d })),
      { button: 8, label: "Clear" },
    ]);
    // order 11: '0'..'9' then 'a' (value 11), then clear.
    expect(keysFor(11)).toEqual([
      ..."0123456789a".split("").map((c) => ({ button: c.charCodeAt(0), label: c })),
      { button: 8, label: "Clear" },
    ]);
  });
});
