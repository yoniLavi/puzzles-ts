/**
 * Behavioral tests for the Ascent port (tier 1 + a midend save round-trip).
 *
 * Generation is solver-gated, so "generates a board that decodes, re-solves
 * to a single completion, and round-trips through the codec" exercises the
 * generator, the four-tier solver, the codec and `checkCompletion` together.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { CURSOR_RIGHT, LEFT_BUTTON, RIGHT_BUTTON } from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { newAscentDesc } from "./generator.ts";
import { ascentGame } from "./index.ts";
import { COL_HIGHLIGHT } from "./render.ts";
import { ascentSolve, SolverScratch } from "./solver.ts";
import {
  type AscentMove,
  type AscentParams,
  checkCompletion,
  DIFFCOUNT,
  encodeGridDesc,
  isNear,
  MODE_EDGES,
  MODE_HEXAGON,
  MODE_HONEYCOMB,
  MODE_ORTHOGONAL,
  MODE_RECT,
  NUMBER_EMPTY,
  newAscentState,
  validateAscentDesc,
} from "./state.ts";
import { keyboardCursor, mouseCursor } from "./ui.ts";

function mk(
  w: number,
  h: number,
  diff: number,
  mode: number,
  removeends = false,
  symmetrical = false,
): AscentParams {
  return { w, h, diff, mode, removeends, symmetrical };
}

const SAMPLE: [string, AscentParams][] = [
  ["5x5 rect easy", mk(5, 5, 0, MODE_RECT)],
  ["5x5 rect hard", mk(5, 5, 3, MODE_RECT)],
  ["6x5 orthogonal normal", mk(6, 5, 1, MODE_ORTHOGONAL)],
  ["5x5 edges normal", mk(5, 5, 1, MODE_EDGES, true)],
  ["7x7 hexagon normal", mk(7, 7, 1, MODE_HEXAGON)],
  ["6x5 honeycomb normal", mk(6, 5, 1, MODE_HONEYCOMB)],
  ["6x5 rect symmetric", mk(6, 5, 1, MODE_RECT, false, true)],
];

describe("ascent generation + solving", () => {
  for (const [name, params] of SAMPLE) {
    it(`${name}: generates a uniquely soluble board`, () => {
      const { desc } = newAscentDesc(params, randomNew(`ascent-${name}`));

      // Desc is well-formed for these params.
      expect(validateAscentDesc(params, desc)).toBeNull();

      // Decode, re-solve at max difficulty, and it completes uniquely.
      const state = newAscentState(params, desc);
      const sc = new SolverScratch(state.w, state.h, state.mode, state.last);
      ascentSolve(state.grid, DIFFCOUNT, sc);
      expect(checkCompletion(sc.grid, state.w, state.h, state.mode)).toBe(true);

      // The solution decodes back to the same clue desc (codec inverse).
      expect(encodeGridDesc(state.grid, state.w * state.h)).toBe(desc);
    });
  }
});

// The tier gate (grade-difficulty-tiers-honestly). Upstream had none, so a
// tier frequently did not bind: 7 of the 22 frozen C fixtures above Easy, and
// 56 of 180 freshly generated boards, fell to a lower tier than requested.
describe("ascent difficulty tiers bind", () => {
  const TIERED: [string, AscentParams][] = [
    ["5x5 rect normal", mk(5, 5, 1, MODE_RECT)],
    ["5x5 rect tricky", mk(5, 5, 2, MODE_RECT)],
    ["5x5 rect hard", mk(5, 5, 3, MODE_RECT)],
    ["6x5 orthogonal normal", mk(6, 5, 1, MODE_ORTHOGONAL)],
    ["6x6 orthogonal hard", mk(6, 6, 3, MODE_ORTHOGONAL)],
    ["7x7 hexagon normal", mk(7, 7, 1, MODE_HEXAGON)],
    ["5x5 edges tricky", mk(5, 5, 2, MODE_EDGES, true)],
  ];

  /** Does the graded solver finish this board with its ladder capped at `cap`? */
  function solvesAt(p: AscentParams, desc: string, cap: number): boolean {
    const state = newAscentState(p, desc);
    const sc = new SolverScratch(state.w, state.h, state.mode, state.last);
    ascentSolve(state.grid, cap, sc);
    return checkCompletion(sc.grid, state.w, state.h, state.mode);
  }

  for (const [name, params] of TIERED) {
    it(`${name}: needs its own tier, not the one below`, () => {
      const { desc } = newAscentDesc(params, randomNew(`ascent-tier-${name}`));
      expect(solvesAt(params, desc, params.diff)).toBe(true);
      expect(solvesAt(params, desc, params.diff - 1)).toBe(false);
    });
  }
});

describe("ascent generator determinism", () => {
  it("same seed reproduces the same desc", () => {
    const p = mk(6, 5, 1, MODE_RECT);
    const a = newAscentDesc(p, randomNew("determinism")).desc;
    const b = newAscentDesc(p, randomNew("determinism")).desc;
    expect(a).toBe(b);
  });
});

describe("ascent solve + completion", () => {
  it("Solve marks the board completed and cheated (no win flash)", () => {
    const p = mk(5, 5, 1, MODE_RECT);
    const { desc } = newAscentDesc(p, randomNew("solve-seed"));
    const state = newAscentState(p, desc);
    const res = ascentGame.solve?.(state, state);
    expect(res?.ok).toBe(true);
    if (!res?.ok) throw new Error("solve failed");
    const solved = ascentGame.executeMove(state, res.move);
    expect(solved.completed).toBe(true);
    expect(solved.cheated).toBe(true);
    expect(ascentGame.status(solved)).toBe("solved");
    expect(ascentGame.flashLength?.(state, solved, 1, ascentGame.newUi(state))).toBe(0);
  });

  it("Solve completes through a real Midend and save round-trips", () => {
    const me = new Midend(ascentGame);
    const id = `${ascentGame.encodeParams(mk(5, 5, 1, MODE_RECT), true)}#save-seed`;
    expect(me.newGameFromId(id)).toBeUndefined();
    expect(me.solve()).toBeUndefined();
    const text = me.formatAsText();
    expect(text).toBeDefined();
    expect(text).not.toContain(".");
    const saved = me.saveGame();
    const me2 = new Midend(ascentGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).not.toContain(".");
  });
});

describe("ascent hexagonal hit-testing (design F7)", () => {
  it("a click at each hex cell center resolves to that cell", () => {
    const p = mk(7, 7, 1, MODE_HEXAGON);
    const { desc } = newAscentDesc(p, randomNew("hex-hit"));
    const state = newAscentState(p, desc);
    const ds = ascentGame.newDrawState?.(state);
    if (!ds) throw new Error("no drawstate");
    ascentGame.setTileSize?.(ds, ascentGame.preferredTileSize ?? 48);

    const ts = ds.tileSize;
    const R = ts / Math.sqrt(3);
    const vp = (ts * Math.sqrt(3)) / 2;
    const w = state.w;
    const h = state.h;

    let checked = 0;
    for (let i = 0; i < w * h; i++) {
      // Skip padding walls (the triangular hexagon corners).
      if (state.grid[i] === -3 /* NUMBER_BOUND */) continue;
      const col = i % w;
      const row = Math.trunc(i / w);
      const cx = ds.offsetX + col * ts + (row * ts) / 2 + ts / 2;
      const cy = ds.offsetY + R + row * vp;

      const ui = ascentGame.newUi(state);
      ascentGame.interpretMove(state, ui, ds, { x: cx, y: cy }, LEFT_BUTTON);
      expect(ui.held).toBe(i); // a left click on a playable cell holds it
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe("ascent typed-number line preview", () => {
  it("draws the connecting line for a typed preview before it commits", () => {
    const p = mk(6, 5, 1, MODE_RECT);
    const { desc } = newAscentDesc(p, randomNew("preview-line"));
    const state = newAscentState(p, desc);
    const w = state.w;
    const s = w * state.h;

    // Placed positions (number → cell).
    const positions = new Int32Array(s).fill(-1);
    for (let i = 0; i < s; i++) {
      const v = state.grid[i];
      if (v >= 0) positions[v] = i;
    }

    // Find a placed clue A and an adjacent empty cell B where a currently
    // unplaced consecutive number could go.
    let cellB = -1;
    let previewNum = -1; // internal
    outer: for (let a = 0; a < s; a++) {
      const kv = state.grid[a];
      if (kv < 0) continue;
      for (let b = 0; b < s; b++) {
        if (state.grid[b] !== NUMBER_EMPTY) continue;
        if (!isNear(a, b, w, MODE_RECT)) continue;
        for (const pv of [kv - 1, kv + 1]) {
          if (pv < 0 || pv > state.last || positions[pv] >= 0) continue;
          cellB = b;
          previewNum = pv;
          break outer;
        }
      }
    }
    expect(cellB).toBeGreaterThanOrEqual(0);

    const countHighlightLines = (typing: boolean): number => {
      const ui = ascentGame.newUi(state);
      if (typing) {
        ui.typingCell = cellB;
        ui.typingNumber = previewNum + 1; // displayed (1-based)
      }
      const ds = ascentGame.newDrawState?.(state);
      if (!ds) throw new Error("no drawstate");
      ascentGame.setTileSize?.(ds, ascentGame.preferredTileSize ?? 48);
      const rec = new RecordingDrawing(ascentGame.colors([0.83, 0.83, 0.83]));
      ascentGame.redraw?.(rec, ds, null, state, 1, ui, 0, 0);
      return rec.ops.filter((o) => o.op === "line" && o.color === COL_HIGHLIGHT).length;
    };

    // The preview must add at least one highlight (path) line.
    expect(countHighlightLines(true)).toBeGreaterThan(countHighlightLines(false));
  });
});

// A 5x5 rect scratch board: numbers 0, _, 2, 3 in a row (cell 1 is the gap,
// number 4 still open). Holding 0 and placing 1 should skip the placed 2-3 run
// and land the focus on 3, recommending 4. Shared by the auto-advance and
// cursor-provenance blocks below.
function scratch() {
  const w = 5;
  const h = 5;
  const sTot = w * h;
  const grid = new Int16Array(sTot).fill(NUMBER_EMPTY);
  grid[0] = 0;
  grid[2] = 2;
  grid[3] = 3;
  const state = {
    w,
    h,
    mode: MODE_RECT,
    last: sTot - 1,
    grid,
    immutable: new Uint8Array(sTot),
    path: null,
    completed: false,
    cheated: false,
  };
  const ui = ascentGame.newUi(state);
  const ds = ascentGame.newDrawState?.(state);
  if (!ds) throw new Error("no drawstate");
  ascentGame.setTileSize?.(ds, ascentGame.preferredTileSize ?? 48);
  const center = (cell: number) => ({
    x: ds.offsetX + (cell % w) * ds.tileSize + ds.tileSize / 2,
    y: ds.offsetY + Math.trunc(cell / w) * ds.tileSize + ds.tileSize / 2,
  });
  return { state, ui, ds, center };
}

describe("ascent auto-advance past a placed run", () => {
  it("jumps the focus to the run's leading edge and recommends the next open number", () => {
    const { state, ui, ds, center } = scratch();
    ascentGame.interpretMove(state, ui, ds, center(0), LEFT_BUTTON); // hold 0
    expect(ui.select).toBe(1);
    const m = ascentGame.interpretMove(state, ui, ds, center(1), LEFT_BUTTON); // place 1
    expect(m).toMatchObject({ kind: "place", cell: 1, n: 1 });
    expect(ui.held).toBe(3); // jumped past the placed 2-3 run
    expect(ui.select).toBe(4); // now recommends the next open number
  });

  it("stays on the placed cell when the preference is off", () => {
    const { state, ui, ds, center } = scratch();
    ui.autoAdvanceRuns = false;
    ascentGame.interpretMove(state, ui, ds, center(0), LEFT_BUTTON);
    ascentGame.interpretMove(state, ui, ds, center(1), LEFT_BUTTON);
    expect(ui.held).toBe(1); // no jump — focus stays on the placed cell
  });
});

describe("ascent cursor provenance", () => {
  // Ascent draws a mouse hover differently from a keyboard cursor, and a player
  // can see the difference. Nothing pinned which was which until
  // `unify-the-note-taking-cell` renamed the flag and flipped its polarity to
  // match the eleven note-taking games (`cursorFromKeyboard`) — an inversion no
  // test would have caught, because Ascent's suite never pressed an arrow.
  //
  // Both directions are asserted, and both predicates each way: a one-sided
  // check passes just as happily against a flag stuck true.
  it("an arrow reveals a keyboard cursor; a click reveals a mouse hover", () => {
    const { state, ui, ds, center } = scratch();
    expect(keyboardCursor(ui)).toBe(false); // hidden: neither, whatever the flag
    expect(mouseCursor(ui)).toBe(false);

    ascentGame.interpretMove(state, ui, ds, { x: 0, y: 0 }, CURSOR_RIGHT);
    expect(ui.cursor.visible).toBe(true);
    expect(keyboardCursor(ui)).toBe(true);
    expect(mouseCursor(ui)).toBe(false);

    // Cell 1 is the scratch board's gap: a left click on an *empty* cell is
    // the path that reveals a mouse hover. Clicking a placed number instead
    // hides the cursor and picks the number up, which is a different arm.
    ascentGame.interpretMove(state, ui, ds, center(1), LEFT_BUTTON);
    expect(ui.cursor.visible).toBe(true);
    expect(mouseCursor(ui)).toBe(true);
    expect(keyboardCursor(ui)).toBe(false);
  });
});

describe("ascent right-click two-option toggle", () => {
  it("cycles a held-adjacent cell none → lower → higher → none", () => {
    const p = mk(6, 5, 1, MODE_RECT);
    const { desc } = newAscentDesc(p, randomNew("toggle-seed"));
    let state = newAscentState(p, desc);
    const w = state.w;
    const s = w * state.h;

    const positions = new Int32Array(s).fill(-1);
    for (let i = 0; i < s; i++) if (state.grid[i] >= 0) positions[state.grid[i]] = i;

    // Placed number N at A (0 < N < last), adjacent empty B, both N±1 unplaced.
    let cellA = -1;
    let cellB = -1;
    let bigN = -1;
    outerT: for (let a = 0; a < s; a++) {
      const nn = state.grid[a];
      if (nn <= 0 || nn >= state.last) continue;
      if (positions[nn - 1] >= 0 || positions[nn + 1] >= 0) continue;
      for (let b = 0; b < s; b++) {
        if (state.grid[b] !== NUMBER_EMPTY || !isNear(a, b, w, MODE_RECT)) continue;
        cellA = a;
        cellB = b;
        bigN = nn;
        break outerT;
      }
    }
    expect(cellB).toBeGreaterThanOrEqual(0);

    const ui = ascentGame.newUi(state);
    ui.held = cellA;
    const ds = ascentGame.newDrawState?.(state);
    if (!ds) throw new Error("no drawstate");
    ascentGame.setTileSize?.(ds, ascentGame.preferredTileSize ?? 48);
    const ts = ds.tileSize;
    const center = {
      x: ds.offsetX + (cellB % w) * ts + ts / 2,
      y: ds.offsetY + Math.trunc(cellB / w) * ts + ts / 2,
    };

    const rightClick = () => {
      const m = ascentGame.interpretMove(state, ui, ds, center, RIGHT_BUTTON);
      if (m && typeof m === "object") {
        const old = state;
        state = ascentGame.executeMove(state, m as AscentMove);
        ascentGame.changedState?.(ui, old, state);
      }
      return m;
    };

    // Empty → lower (N-1).
    rightClick();
    expect(state.grid[cellB]).toBe(bigN - 1);
    // lower → higher (N+1).
    rightClick();
    expect(state.grid[cellB]).toBe(bigN + 1);
    // higher → empty.
    rightClick();
    expect(state.grid[cellB]).toBe(NUMBER_EMPTY);
  });
});

describe("ascent findMistakes", () => {
  it("flags a wrong number and clears on a correct board", () => {
    const p = mk(5, 5, 1, MODE_RECT);
    const { desc } = newAscentDesc(p, randomNew("mistake-seed"));
    const state = newAscentState(p, desc);

    // Solve to the unique solution.
    const sc = new SolverScratch(state.w, state.h, state.mode, state.last);
    ascentSolve(state.grid, DIFFCOUNT, sc);
    const solved = { ...state, grid: sc.grid.slice() };
    expect(ascentGame.findMistakes?.(solved)).toEqual([]);

    // Corrupt a non-immutable cell to a wrong number.
    let victim = -1;
    for (let i = 0; i < state.w * state.h; i++) {
      if (!state.immutable[i] && solved.grid[i] >= 0) {
        victim = i;
        break;
      }
    }
    expect(victim).toBeGreaterThanOrEqual(0);
    const wrongVal = solved.grid[victim] === 0 ? 1 : 0;
    const dirty = { ...solved, grid: solved.grid.slice() };
    dirty.grid[victim] = wrongVal;
    const mistakes = ascentGame.findMistakes?.(dirty) ?? [];
    expect(mistakes.some((m) => m.cell === victim)).toBe(true);
  });
});
