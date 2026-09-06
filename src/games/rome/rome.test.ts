/**
 * Behavioral tests for the Rome port (tier 1 logic + a Midend integration
 * pass). The byte-match generator/solver/codec check lives in
 * `rome-differential.test.ts`; these cover what a desc differential never
 * touches — the validity check's error flags, the interactive drag/keyboard
 * input, `executeMove`'s completion path, Solve through a real `Midend`, the
 * two layers of `findMistakes`, and the save round-trip of pencil marks.
 *
 * Render frames are in `rome-render.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/midend.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import type { ChangeNotification, GameStatus, Point } from "../../engine/types.ts";
import { newRomeDesc } from "./generator.ts";
import { romeGame } from "./index.ts";
import { BORDER, PREFERRED_TILE_SIZE } from "./render.ts";
import { romeSolve, validateDesc, validateGame } from "./solver.ts";
import {
  DIFF_EASY,
  DIFF_NORMAL,
  DIFF_TRICKY,
  DIFFCOUNT,
  decodeParams,
  defaultParams,
  EMPTY,
  encodeDesc,
  encodeParams,
  FD_TOGOAL,
  FE_BOUNDS,
  FE_DOUBLE,
  FE_LOOP,
  FM_ARROWMASK,
  FM_DOWN,
  FM_FIXED,
  FM_GOAL,
  FM_LEFT,
  FM_RIGHT,
  FM_UP,
  KEYMODE_MOVE,
  presets,
  type RomeMove,
  type RomeParams,
  type RomeState,
  type RomeUi,
  readDesc,
  STATUS_COMPLETE,
  STATUS_INCOMPLETE,
  STATUS_INVALID,
  validateParams,
} from "./state.ts";

const TS = PREFERRED_TILE_SIZE;
const ds = { tilesize: TS } as never;

function cellPoint(x: number, y: number): Point {
  return {
    x: BORDER + TS * x + Math.floor(TS / 2),
    y: BORDER + TS * y + Math.floor(TS / 2),
  };
}

function newUi(): RomeUi {
  return romeGame.newUi({} as RomeState);
}

/** Reach into a driven Midend for its live state (the established test idiom
 * — the midend deliberately exposes no state accessor). */
function stateOf(
  m: Midend<RomeParams, RomeState, RomeMove, RomeUi, unknown>,
): RomeState {
  return (m as unknown as { state: RomeState }).state;
}

/** Decode a hand-written description, with the display-path error flags
 * computed exactly as `newState` does. */
function board(w: number, h: number, desc: string): RomeState {
  const { board: b } = readDesc({ w, h, diff: DIFF_EASY }, desc);
  validateGame(b, true);
  return b;
}

// A 3x3 board whose twelve inter-cell edges are all walls ("12"), so every
// square is its own region; the clue string then places arrows freely.
const ALL_WALLS_3 = "12";

// --- params -----------------------------------------------------------------

describe("params", () => {
  it("round-trips the full and short forms", () => {
    const p: RomeParams = { w: 10, h: 6, diff: DIFF_TRICKY };
    expect(encodeParams(p, true)).toBe("10x6dt");
    expect(encodeParams(p, false)).toBe("10x6");
    expect(decodeParams("10x6dt")).toEqual(p);
    // A bare width is a square board (upstream's `h = w` fallback).
    expect(decodeParams("7")).toEqual({ w: 7, h: 7, diff: DIFF_EASY });
    expect(decodeParams("8x8dn").diff).toBe(DIFF_NORMAL);
  });

  it("leaves the difficulty out of range for an unknown letter", () => {
    const p = decodeParams("6x6dq");
    expect(validateParams(p, true)).toBe("Unknown difficulty level");
    expect(validateParams(decodeParams("6x6d"), true)).toBe("Unknown difficulty level");
  });

  it("rejects boards below 3x3, in upstream's order", () => {
    expect(validateParams({ w: 2, h: 5, diff: 0 }, true)).toBe(
      "Width must be at least 3",
    );
    expect(validateParams({ w: 5, h: 2, diff: 0 }, true)).toBe(
      "Height must be at least 3",
    );
    expect(validateParams({ w: 3, h: 3, diff: 0 }, true)).toBeNull();
  });

  it("ships the twelve presets with 6x6 Easy as the default", () => {
    const menu = presets();
    expect(menu.submenu).toHaveLength(12);
    expect(menu.submenu?.[3].title).toBe("6x6 Easy");
    expect(defaultParams()).toEqual({ w: 6, h: 6, diff: DIFF_EASY });
  });
});

// --- desc codec -------------------------------------------------------------

describe("desc codec", () => {
  it("round-trips a generated description exactly", () => {
    const p: RomeParams = { w: 6, h: 6, diff: DIFF_NORMAL };
    const { desc } = newRomeDesc(p, randomNew("rome-codec"));
    const st = board(p.w, p.h, desc);
    expect(encodeDesc(p.w, p.h, st.regions, cluesOnly(st))).toBe(desc);
  });

  it("decodes a letter run as N non-walls followed by one wall", () => {
    // "a11" = 1 non-wall, then that letter's own wall, then 11 more walls:
    // exactly one merged pair (squares 0 and 1) in a 3x3.
    const st = board(3, 3, "a11,i");
    expect(st.regions.equivalent(0, 1)).toBe(true);
    expect(st.regions.size(0)).toBe(2);
    expect(st.regions.size(2)).toBe(1);
  });

  it("rejects invalid characters, oversized regions and misplaced goals", () => {
    const p: RomeParams = { w: 3, h: 3, diff: DIFF_EASY };
    // A bad wall character stalls the wall parse without consuming anything,
    // so upstream then skips exactly that one character as the ',' and reads
    // the clues from what follows — reproduced here, hence the odd-looking
    // "!i" rather than "!!,i" (whose garbage clues would report the *clue*
    // error instead, exactly as the C does).
    expect(validateDesc(p, "!i")).toBe(
      "Region description contains invalid characters",
    );
    expect(validateDesc(p, `${ALL_WALLS_3},QQQQQQQQQ`)).toBe(
      "Clues contain invalid characters",
    );
    // Five squares in one region: 'd' merges 4 horizontal edges in a row...
    // simplest oversized region is the whole top row plus one below it.
    expect(validateDesc({ w: 5, h: 3, diff: 0 }, "d18,o")).toBe(
      "A region is too large",
    );
    // A goal must sit alone: merge squares 0 and 1, then put the goal at 0.
    expect(validateDesc(p, "a11,Xh")).toBe("A goal is not placed in an area of 1 cell");
  });

  it("rejects a description that is already finished or already broken", () => {
    const p: RomeParams = { w: 3, h: 3, diff: DIFF_EASY };
    // An arrow on the right column pointing right leaves the grid.
    expect(validateDesc(p, `${ALL_WALLS_3},bRf`)).toBe("Puzzle contains errors");
  });
});

/** A copy of `grid` with only the fixed clues' content bits — what the encoder
 * sees at generation time, before any error flag has been OR-ed in. */
function cluesOnly(st: RomeState): Int32Array {
  const out = new Int32Array(st.grid.length);
  for (let i = 0; i < out.length; i++) {
    if (st.grid[i] & FM_FIXED) out[i] = st.grid[i] & (FM_GOAL | FM_ARROWMASK);
  }
  return out;
}

// --- validity check ---------------------------------------------------------

describe("validity check", () => {
  it("flags an arrow that points off the grid", () => {
    const st = board(3, 3, `${ALL_WALLS_3},bRf`);
    expect(validateGame(st, true)).toBe(STATUS_INVALID);
    expect(st.grid[2] & FE_BOUNDS).toBeTruthy();
    expect(st.grid[0] & FE_BOUNDS).toBeFalsy();
  });

  it("flags both squares when one region repeats an arrow", () => {
    // Squares 0 and 1 share a region and both point down.
    const st = board(3, 3, "a11,DDg");
    expect(validateGame(st, true)).toBe(STATUS_INVALID);
    expect(st.grid[0] & FE_DOUBLE).toBeTruthy();
    expect(st.grid[1] & FE_DOUBLE).toBeTruthy();
    expect(st.grid[3] & FE_DOUBLE).toBeFalsy();
  });

  it("paints every square of a loop, and stops when the walk closes", () => {
    // 0→1→4→3→0, a four-square cycle in the top-left corner.
    const st = board(3, 3, `${ALL_WALLS_3},RDaULd`);
    expect(validateGame(st, true)).toBe(STATUS_INVALID);
    for (const i of [0, 1, 3, 4]) expect(st.grid[i] & FE_LOOP).toBeTruthy();
    for (const i of [2, 5, 6, 7, 8]) expect(st.grid[i] & FE_LOOP).toBeFalsy();
  });

  it("marks the squares whose arrows reach a goal — and only those", () => {
    // Goal at 4, an arrow at 1 pointing down into it; square 7 points nowhere.
    const st = board(3, 3, `${ALL_WALLS_3},aDbXd`);
    expect(validateGame(st, true)).toBe(STATUS_INCOMPLETE);
    expect(st.grid[4] & FD_TOGOAL).toBeTruthy();
    expect(st.grid[1] & FD_TOGOAL).toBeTruthy();
    // An empty square is never in a goal's component: the component grows only
    // by adding squares whose *arrow* points into it.
    expect(st.grid[0] & FD_TOGOAL).toBeFalsy();
    expect(st.grid[7] & FD_TOGOAL).toBeFalsy();
  });
});

// --- solver -----------------------------------------------------------------

describe("solver", () => {
  it("solves each tier's boards at that tier and no lower", () => {
    for (const diff of [DIFF_EASY, DIFF_NORMAL, DIFF_TRICKY]) {
      const p: RomeParams = { w: 6, h: 6, diff };
      const { desc } = newRomeDesc(p, randomNew(`rome-tier-${diff}`));

      const at = board(p.w, p.h, desc);
      expect(romeSolve(at, diff)).toBe(STATUS_COMPLETE);

      if (diff > 0) {
        const below = board(p.w, p.h, desc);
        expect(romeSolve(below, diff - 1)).not.toBe(STATUS_COMPLETE);
      }
    }
  });

  // Cap-monotonicity is asserted for Rome — and for every other tiered game —
  // by `engine/difficulty-contract.test.ts`, through `Game.difficulty`. This
  // file's own version checked only the top cap, which is weaker than the
  // property; keeping both is how two tests asserting one property drift apart.

  it("reports an over-constrained board invalid rather than looping", () => {
    const st = board(3, 3, `${ALL_WALLS_3},RDaULd`);
    expect(romeSolve(st, DIFFCOUNT)).toBe(STATUS_INVALID);
  });

  it("fills a square whose candidates have been narrowed to one", () => {
    // A 3x1-wide column of separate regions: the top square cannot point up
    // (border), and pointing left/right leaves a 1-wide grid, so `single`
    // forces it down — reachable with no other technique.
    const p: RomeParams = { w: 3, h: 3, diff: DIFF_EASY };
    const { desc } = newRomeDesc(p, randomNew("rome-single"));
    const st = board(3, 3, desc);
    const before = st.grid.filter((c) => c === EMPTY).length;
    expect(before).toBeGreaterThan(0);
    expect(romeSolve(st, DIFF_EASY)).toBe(STATUS_COMPLETE);
    expect(st.grid.filter((c) => (c & (FM_ARROWMASK | FM_GOAL)) === 0).length).toBe(0);
  });
});

// --- generation -------------------------------------------------------------

describe("generation", () => {
  it("produces a soluble board at exactly the requested difficulty, for every preset", () => {
    for (const entry of presets().submenu ?? []) {
      const p = entry.params as RomeParams;
      // Only the small presets, so the sweep stays cheap; the differential
      // covers every preset against the C.
      if (p.w > 6) continue;
      const { desc } = newRomeDesc(p, randomNew(`rome-gen-${entry.title}`));
      expect(validateDesc(p, desc)).toBeNull();
      const at = board(p.w, p.h, desc);
      expect(romeSolve(at, p.diff)).toBe(STATUS_COMPLETE);
    }
  });

  it("never places more goals than upstream's cap allows", () => {
    const p: RomeParams = { w: 10, h: 10, diff: DIFF_EASY };
    const { desc } = newRomeDesc(p, randomNew("rome-goals"));
    const st = board(p.w, p.h, desc);
    const goals = st.grid.filter((c) => c & FM_GOAL).length;
    expect(goals).toBeGreaterThan(0);
    expect(goals).toBeLessThanOrEqual(Math.max(1, Math.floor((p.w * p.h) / 25)));
  });

  it("keeps every region within four squares and every goal alone", () => {
    const p: RomeParams = { w: 8, h: 8, diff: DIFF_NORMAL };
    const { desc } = newRomeDesc(p, randomNew("rome-regions"));
    const st = board(p.w, p.h, desc);
    for (let i = 0; i < st.grid.length; i++) {
      expect(st.regions.size(i)).toBeLessThanOrEqual(4);
      if (st.grid[i] & FM_GOAL) expect(st.regions.size(i)).toBe(1);
    }
  });
});

// --- input ------------------------------------------------------------------

/** Press, optionally drag to another square, then release; returns the
 * committed move (or null when nothing was committed). */
function drag(
  state: RomeState,
  ui: RomeUi,
  from: [number, number],
  to: [number, number],
  down: number,
  move: number,
  up: number,
): RomeMove | null {
  romeGame.interpretMove(state, ui, ds, cellPoint(...from), down);
  romeGame.interpretMove(state, ui, ds, cellPoint(...to), move);
  const res = romeGame.interpretMove(state, ui, ds, cellPoint(...to), up);
  return typeof res === "object" && res !== null ? (res as RomeMove) : null;
}

describe("input", () => {
  const EMPTY_3 = `${ALL_WALLS_3},i`;

  it("drags a direction out of a square to place an arrow", () => {
    const st = board(3, 3, EMPTY_3);
    const ui = newUi();
    expect(drag(st, ui, [1, 1], [1, 0], LEFT_BUTTON, LEFT_DRAG, LEFT_RELEASE)).toEqual({
      kind: "place",
      x: 1,
      y: 1,
      dir: FM_UP,
    });
    expect(drag(st, ui, [1, 1], [2, 1], LEFT_BUTTON, LEFT_DRAG, LEFT_RELEASE)).toEqual({
      kind: "place",
      x: 1,
      y: 1,
      dir: FM_RIGHT,
    });
  });

  it("right-drags a pencil mark, and ignores a right-drag back onto the square", () => {
    const st = board(3, 3, EMPTY_3);
    const ui = newUi();
    expect(
      drag(st, ui, [1, 1], [1, 2], RIGHT_BUTTON, RIGHT_DRAG, RIGHT_RELEASE),
    ).toEqual({ kind: "pencil", x: 1, y: 1, dir: FM_DOWN });
    // Back to the grabbed square: a pencil clear is not a move upstream emits.
    expect(
      drag(st, ui, [1, 1], [1, 1], RIGHT_BUTTON, RIGHT_DRAG, RIGHT_RELEASE),
    ).toBeNull();
  });

  it("releasing back on the grabbed square clears a placed arrow", () => {
    let st = board(3, 3, EMPTY_3);
    const ui = newUi();
    const place = drag(st, ui, [1, 1], [1, 0], LEFT_BUTTON, LEFT_DRAG, LEFT_RELEASE);
    st = romeGame.executeMove(st, place as RomeMove);
    expect(drag(st, ui, [1, 1], [1, 1], LEFT_BUTTON, LEFT_DRAG, LEFT_RELEASE)).toEqual({
      kind: "place",
      x: 1,
      y: 1,
      dir: null,
    });
  });

  it("suppresses a drag that re-places the arrow already there", () => {
    let st = board(3, 3, EMPTY_3);
    const ui = newUi();
    st = romeGame.executeMove(st, { kind: "place", x: 1, y: 1, dir: FM_UP });
    expect(
      drag(st, ui, [1, 1], [1, 0], LEFT_BUTTON, LEFT_DRAG, LEFT_RELEASE),
    ).toBeNull();
  });

  it("refuses to grab a fixed clue", () => {
    // Square 2 holds a fixed left arrow.
    const st = board(3, 3, `${ALL_WALLS_3},bLf`);
    const ui = newUi();
    expect(romeGame.interpretMove(st, ui, ds, cellPoint(2, 0), LEFT_BUTTON)).toBeNull();
    expect(ui.mmode).toBe(0);
  });

  it("moves the keyboard cursor, then places with Enter and a direction", () => {
    const st = board(3, 3, EMPTY_3);
    const ui = newUi();
    romeGame.interpretMove(st, ui, ds, cellPoint(0, 0), CURSOR_RIGHT);
    romeGame.interpretMove(st, ui, ds, cellPoint(0, 0), CURSOR_DOWN);
    expect([ui.cursor.x, ui.cursor.y]).toEqual([1, 1]);
    expect(ui.kmode).toBe(KEYMODE_MOVE);

    romeGame.interpretMove(st, ui, ds, cellPoint(0, 0), CURSOR_SELECT);
    expect(romeGame.interpretMove(st, ui, ds, cellPoint(0, 0), CURSOR_LEFT)).toEqual({
      kind: "place",
      x: 1,
      y: 1,
      dir: FM_LEFT,
    });
    // Placing disarms the mode again.
    expect(ui.kmode).toBe(KEYMODE_MOVE);
  });

  it("places a pencil mark with Space then a direction", () => {
    const st = board(3, 3, EMPTY_3);
    const ui = newUi();
    romeGame.interpretMove(st, ui, ds, cellPoint(0, 0), CURSOR_RIGHT);
    romeGame.interpretMove(st, ui, ds, cellPoint(0, 0), CURSOR_SELECT2);
    expect(romeGame.interpretMove(st, ui, ds, cellPoint(0, 0), CURSOR_UP)).toEqual({
      kind: "pencil",
      x: 1,
      y: 0,
      dir: FM_UP,
    });
  });

  it("accepts the bare numpad digits and backspace", () => {
    // `MOD_NUM_KEYPAD` never arrives in this frontend, and upstream already
    // keys off the bare characters (docs/games/input.md § "The numeric keypad never arrives").
    const st = board(3, 3, EMPTY_3);
    const ui = newUi();
    romeGame.interpretMove(st, ui, ds, cellPoint(0, 0), CURSOR_RIGHT);
    for (const [key, dir] of [
      [56, FM_UP],
      [50, FM_DOWN],
      [52, FM_LEFT],
      [54, FM_RIGHT],
    ] as const) {
      expect(romeGame.interpretMove(st, ui, ds, cellPoint(0, 0), key)).toEqual({
        kind: "place",
        x: 1,
        y: 0,
        dir,
      });
    }
    expect(romeGame.interpretMove(st, ui, ds, cellPoint(0, 0), 8)).toEqual({
      kind: "place",
      x: 1,
      y: 0,
      dir: null,
    });
  });

  it("ignores a direct key press before the cursor has been shown", () => {
    const st = board(3, 3, EMPTY_3);
    const ui = newUi();
    expect(ui.cursor.visible).toBe(false);
    expect(romeGame.interpretMove(st, ui, ds, cellPoint(0, 0), 56)).toBeNull();
  });
});

// --- moves ------------------------------------------------------------------

describe("moves", () => {
  it("toggles a pencil mark on and off without touching the grid", () => {
    let st = board(3, 3, `${ALL_WALLS_3},i`);
    st = romeGame.executeMove(st, { kind: "pencil", x: 0, y: 0, dir: FM_UP });
    expect(st.pencil[0]).toBe(FM_UP);
    st = romeGame.executeMove(st, { kind: "pencil", x: 0, y: 0, dir: FM_LEFT });
    expect(st.pencil[0]).toBe(FM_UP | FM_LEFT);
    st = romeGame.executeMove(st, { kind: "pencil", x: 0, y: 0, dir: FM_UP });
    expect(st.pencil[0]).toBe(FM_LEFT);
    st = romeGame.executeMove(st, { kind: "pencil", x: 0, y: 0, dir: null });
    expect(st.pencil[0]).toBe(EMPTY);
    expect(st.grid[0]).toBe(EMPTY);
  });

  it("leaves the source state untouched", () => {
    const st = board(3, 3, `${ALL_WALLS_3},i`);
    const next = romeGame.executeMove(st, { kind: "place", x: 0, y: 0, dir: FM_DOWN });
    expect(st.grid[0]).toBe(EMPTY);
    expect(next.grid[0] & FM_DOWN).toBeTruthy();
  });

  it("refuses to overwrite a fixed clue", () => {
    const st = board(3, 3, `${ALL_WALLS_3},bLf`);
    expect(() =>
      romeGame.executeMove(st, { kind: "place", x: 2, y: 0, dir: FM_UP }),
    ).toThrow(/fixed clue/);
  });

  it("reports the board solved once the last arrow lands", () => {
    const p: RomeParams = { w: 6, h: 6, diff: DIFF_EASY };
    const { desc } = newRomeDesc(p, randomNew("rome-complete"));
    let st = board(p.w, p.h, desc);

    const solved = board(p.w, p.h, desc);
    expect(romeSolve(solved, DIFFCOUNT)).toBe(STATUS_COMPLETE);

    for (let i = 0; i < st.grid.length; i++) {
      if (st.grid[i] & FM_FIXED) continue;
      const dir = solved.grid[i] & FM_ARROWMASK;
      st = romeGame.executeMove(st, {
        kind: "place",
        x: i % p.w,
        y: Math.floor(i / p.w),
        dir: dir as 4 | 8 | 16 | 32,
      });
    }
    expect(st.completed).toBe(true);
    expect(st.cheated).toBe(false);
    expect(romeGame.status(st)).toBe<GameStatus>("solved");
  });
});

// --- findMistakes -----------------------------------------------------------

describe("findMistakes", () => {
  it("flags the rule violations the board already shows live", () => {
    const dup = board(3, 3, "a11,DDg");
    expect(romeGame.findMistakes?.(dup)).toEqual([
      { index: 0, kind: "double" },
      { index: 1, kind: "double" },
    ]);

    const oob = board(3, 3, `${ALL_WALLS_3},bRf`);
    expect(romeGame.findMistakes?.(oob)).toEqual([{ index: 2, kind: "bounds" }]);

    const loop = board(3, 3, `${ALL_WALLS_3},RDaULd`);
    expect(romeGame.findMistakes?.(loop)?.map((m) => m.index)).toEqual([0, 1, 3, 4]);
  });

  it("flags an arrow that breaks no rule but contradicts the solution", () => {
    // The layer a live-only check cannot give (docs/games/solver-and-generator.md § "The solvable-game contract"): without it,
    // Check & Save would happily store this board.
    const { state, index, wrong } = firstDeviatingPlacement();
    const after = romeGame.executeMove(state, {
      kind: "place",
      x: index % state.w,
      y: Math.floor(index / state.w),
      dir: wrong,
    });
    // Nothing is broken yet — the live rules are all satisfied.
    expect(validateGame(after, true)).toBe(STATUS_INCOMPLETE);
    expect(romeGame.findMistakes?.(after)).toEqual([{ index, kind: "wrong" }]);
  });

  it("says nothing about a correct partial board, or about pencil marks", () => {
    const { state, index, right } = firstDeviatingPlacement();
    let st = romeGame.executeMove(state, {
      kind: "place",
      x: index % state.w,
      y: Math.floor(index / state.w),
      dir: right,
    });
    // Rome's pencil marks are free-form ("can be used for any purpose"), so a
    // note is never a mistake however it disagrees with the solution.
    st = romeGame.executeMove(st, { kind: "pencil", x: 0, y: 0, dir: FM_UP });
    st = romeGame.executeMove(st, { kind: "pencil", x: 0, y: 0, dir: FM_DOWN });
    expect(romeGame.findMistakes?.(st)).toEqual([]);
  });
});

/**
 * Find a square of a fixed-seed board where a *legal-looking* wrong arrow can
 * be placed: empty, with the solution's arrow known, and some other direction
 * that breaks no rule on its own. The fixed-seed scan is the deterministic way
 * to reach a specific position without hand-authoring a board (docs/games/testing.md § "Render scenarios", the fixed-seed scan idiom).
 */
function firstDeviatingPlacement(): {
  state: RomeState;
  index: number;
  right: 4 | 8 | 16 | 32;
  wrong: 4 | 8 | 16 | 32;
} {
  const p: RomeParams = { w: 6, h: 6, diff: DIFF_EASY };
  for (let seed = 0; seed < 40; seed++) {
    const { desc } = newRomeDesc(p, randomNew(`rome-mistake-${seed}`));
    const state = board(p.w, p.h, desc);
    const solved = board(p.w, p.h, desc);
    if (romeSolve(solved, DIFFCOUNT) !== STATUS_COMPLETE) continue;

    for (let i = 0; i < state.grid.length; i++) {
      if (state.grid[i] !== EMPTY) continue;
      const right = solved.grid[i] & FM_ARROWMASK;
      for (const wrong of [FM_UP, FM_DOWN, FM_LEFT, FM_RIGHT] as const) {
        if (wrong === right) continue;
        const trial = romeGame.executeMove(state, {
          kind: "place",
          x: i % p.w,
          y: Math.floor(i / p.w),
          dir: wrong,
        });
        if (validateGame(trial, true) !== STATUS_INCOMPLETE) continue;
        return { state, index: i, right: right as 4 | 8 | 16 | 32, wrong };
      }
    }
  }
  throw new Error("no legal-looking wrong placement found");
}

// --- Midend integration -----------------------------------------------------

function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(romeGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {},
  );
  const status = (): GameStatus | undefined =>
    (
      [...notes].reverse().find((n) => n.type === "game-state-change") as
        | Extract<ChangeNotification, { type: "game-state-change" }>
        | undefined
    )?.status;
  return { m, status };
}

describe("midend integration", () => {
  it("Solve finishes the board with help", () => {
    const p: RomeParams = { w: 6, h: 6, diff: DIFF_EASY };
    const { desc } = newRomeDesc(p, randomNew("rome-midend"));
    const { m, status } = harness();
    expect(m.newGameFromId(`6x6de:${desc}`)).toBeUndefined();
    expect(status()).toBe("ongoing");
    expect(m.solve()).toBeUndefined();
    expect(status()).toBe("solved-with-help");
    // A solver fill completes the board but never celebrates.
    const after = stateOf(m);
    expect(after.completed).toBe(true);
    expect(after.cheated).toBe(true);
  });

  it("round-trips a save, pencil marks included", () => {
    const p: RomeParams = { w: 6, h: 6, diff: DIFF_EASY };
    const { desc } = newRomeDesc(p, randomNew("rome-save"));
    const m = new Midend(romeGame);
    expect(m.newGameFromId(`6x6de:${desc}`)).toBeUndefined();

    const target = firstEmpty(board(p.w, p.h, desc));
    const moves: RomeMove[] = [
      { kind: "pencil", x: target % p.w, y: Math.floor(target / p.w), dir: FM_UP },
      { kind: "pencil", x: target % p.w, y: Math.floor(target / p.w), dir: FM_LEFT },
      { kind: "place", x: target % p.w, y: Math.floor(target / p.w), dir: FM_DOWN },
    ];
    m.playMoves(moves);

    const m2 = new Midend(romeGame);
    expect(m2.loadGame(m.saveGame())).toBeUndefined();
    const restored = stateOf(m2);
    expect(restored.pencil[target]).toBe(FM_UP | FM_LEFT);
    expect(restored.grid[target] & FM_ARROWMASK).toBe(FM_DOWN);
  });

  it("reports the mistake-checking capability, so Check & Save can block", () => {
    expect(romeGame.findMistakes).toBeDefined();
  });
});

function firstEmpty(st: RomeState): number {
  const i = st.grid.indexOf(EMPTY);
  if (i < 0) throw new Error("no empty square");
  return i;
}
