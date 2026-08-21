/**
 * Behavioural tests for the Slide port (tier 1 — pure logic).
 *
 * The desc/generator/solver correctness bar is carried by
 * `slide-differential.test.ts`, which byte-matches the C on every preset. What
 * lives here is everything that differential cannot see: the param and desc
 * codecs' *rejection* paths, the drag reachability rules, the move-counting
 * quirks, the interactive completion path, the Solve route and its step key,
 * and the deliberate divergences from the C.
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import {
  CURSOR_SELECT2,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MOD_STYLUS,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { sizedDrawState } from "../../engine/testing/sized-draw-state.ts";
import type { ChangeNotification, GameStatus } from "../../engine/types.ts";
import { newSlideDesc } from "./generator.ts";
import { slideGame } from "./index.ts";
import { computeReachable, executeMove, movePiece } from "./moves.ts";
import { PREFERRED_TILE_SIZE } from "./render.ts";
import { solveBoard } from "./solver.ts";
import {
  ANCHOR,
  boardTextFormat,
  decodeParams,
  defaultParams,
  describeParams,
  EMPTY,
  encodeDesc,
  encodeParams,
  MAINANCHOR,
  MAX_CELLS,
  newState,
  newUi,
  type SlideMove,
  type SlideParams,
  type SlideState,
  type SlideUi,
  validateDesc,
  validateParams,
  WALL,
} from "./state.ts";

const P = (w: number, h: number, maxmoves: number): SlideParams => ({
  w,
  h,
  maxmoves,
});

type SlideMidend = Midend<SlideParams, SlideState, SlideMove, SlideUi, unknown>;

/** The live state, reached the way every other port's tests reach it. */
function stateOf(me: SlideMidend): SlideState {
  return (me as unknown as { state: SlideState }).state;
}

/** A midend plus a reader for the status it last notified. */
function makeMidend(): { m: SlideMidend; status: () => GameStatus | undefined } {
  const notes: ChangeNotification[] = [];
  const m: SlideMidend = new Midend(slideGame);
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

/** A midend already running `id`. */
function play(id: string): SlideMidend {
  const { m } = makeMidend();
  expect(m.newGameFromId(id)).toBeUndefined();
  return m;
}

// --- the shared hand-built fixture ------------------------------------

const FW = 6;
const FH = 5;
const FWH = FW * FH;
const idx = (x: number, y: number): number => y * FW + x;

/**
 * A 6×5 board with the main 2×2 in the corner and one singleton beside it:
 *
 * ```
 * # # # # # #
 * # M m A . #     M/m = the main 2x2's four squares
 * # m m . . #     A   = a 1x1 block
 * # . . . . #     .   = empty
 * # # # # # #
 * ```
 *
 * With the target at (2,1) the puzzle takes exactly two moves: nudge the
 * singleton out of (3,1), then slide the main block one square right. It is
 * *not* possible in one, which makes it a usable move-limit fixture too.
 *
 * (A 5×4 board — the smallest `validateParams` admits — is no good for this:
 * its interior is 3×2, the main 2×2 needs both remaining squares to travel, and
 * a lone singleton can only ever shuffle between them. Every 5×4 board is
 * either trivial or deadlocked, which is also why upstream aborts on them.)
 */
function fixtureBoard(): { board: Uint8Array; forcefield: Uint8Array } {
  const board = new Uint8Array(FWH).fill(EMPTY);
  for (let x = 0; x < FW; x++) {
    board[x] = WALL;
    board[(FH - 1) * FW + x] = WALL;
  }
  for (let y = 0; y < FH; y++) {
    board[y * FW] = WALL;
    board[y * FW + (FW - 1)] = WALL;
  }
  board[idx(1, 1)] = MAINANCHOR;
  board[idx(2, 1)] = 1;
  board[idx(1, 2)] = FW - 1;
  board[idx(2, 2)] = 1;
  board[idx(3, 1)] = ANCHOR;
  return { board, forcefield: new Uint8Array(FWH) };
}

/** The same board with every interior square its own 1×1 block: nothing has
 * anywhere to go, so it is insoluble however you look at it. */
function packedBoard(): Uint8Array {
  const board = new Uint8Array(FWH).fill(ANCHOR);
  for (let x = 0; x < FW; x++) {
    board[x] = WALL;
    board[(FH - 1) * FW + x] = WALL;
  }
  for (let y = 0; y < FH; y++) {
    board[y * FW] = WALL;
    board[y * FW + (FW - 1)] = WALL;
  }
  board[idx(1, 1)] = MAINANCHOR;
  return board;
}

/** The fixture as a `SlideState`, with the target at `(tx, ty)`. */
function fixtureState(
  tx = 2,
  ty = 1,
  minmoves = 2,
  tweak?: (board: Uint8Array, forcefield: Uint8Array) => void,
): SlideState {
  const { board, forcefield } = fixtureBoard();
  tweak?.(board, forcefield);
  return newState(P(FW, FH, -1), encodeDesc(FWH, board, forcefield, tx, ty, minmoves));
}

// --- params -----------------------------------------------------------

describe("slide params", () => {
  it("round-trips every preset through encode/decode", () => {
    const menu = slideGame.presets();
    expect(menu.submenu).toHaveLength(3);
    for (const entry of menu.submenu ?? []) {
      const p = entry.params as SlideParams;
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
    }
  });

  it("encodes a move limit as `m<n>` and no limit as `u`", () => {
    expect(encodeParams(P(7, 6, 25), true)).toBe("7x6m25");
    expect(encodeParams(P(8, 6, -1), true)).toBe("8x6u");
  });

  it("keeps the default move limit when the string carries neither m nor u", () => {
    // Upstream's `decode_params` mutates a `default_params()` struct, so an
    // absent suffix leaves the default rather than clearing it.
    expect(decodeParams("7x6")).toEqual(P(7, 6, defaultParams().maxmoves));
  });

  it("treats a bare number as a square board", () => {
    expect(decodeParams("6u")).toEqual(P(6, 6, -1));
  });

  it("rejects out-of-range params with upstream's messages", () => {
    expect(validateParams(P(7, 6, 25), true)).toBeNull();
    expect(validateParams(P(300, 6, -1), true)).toMatch(/at most 251/);
    expect(validateParams(P(4, 6, -1), true)).toMatch(/at least 5/);
    expect(validateParams(P(7, 3, -1), true)).toMatch(/at least 4/);
  });

  it("rejects a board too large for the exhaustive solver", () => {
    // Not upstream's bound; see MAX_CELLS for the measurements behind it. It is
    // exactly the area of the largest upstream preset, so no preset is lost.
    expect(8 * 6).toBe(MAX_CELLS);
    expect(validateParams(P(8, 6, -1), true)).toBeNull();
    expect(validateParams(P(9, 6, -1), true)).toMatch(/at most 48/);
  });

  it("rejects a zero move limit, which nothing can satisfy", () => {
    expect(validateParams(P(7, 6, 0), true)).toMatch(/at least 1/);
    expect(validateParams(P(7, 6, 1), true)).toBeNull();
    expect(validateParams(P(7, 6, -1), true)).toBeNull();
  });

  it("describes params with the keys augmentation.ts substitutes", () => {
    expect(describeParams(P(7, 6, 25))).toEqual({
      width: "7",
      height: "6",
      "solution-length-limit": "25",
    });
    expect(describeParams(P(8, 6, -1))["solution-length-limit"]).toBe("-1");
  });

  it("round-trips the custom-params form, including a negative limit", () => {
    const items = slideGame.paramConfig ?? [];
    const p = P(7, 6, 25);
    const copy = { ...defaultParams() };
    for (const item of items) {
      if (item.type !== "string") throw new Error("unexpected item type");
      item.set(copy, item.get(p));
    }
    expect(copy).toEqual(p);

    const limit = items.find((i) => i.kw === "solution-length-limit");
    if (limit?.type !== "string") throw new Error("missing limit item");
    const edited = { ...defaultParams() };
    limit.set(edited, "-1");
    expect(edited.maxmoves).toBe(-1);
    // atoi semantics: a blank field is 0, which validateParams then rejects.
    limit.set(edited, "");
    expect(edited.maxmoves).toBe(0);
  });
});

// --- desc codec -------------------------------------------------------

describe("slide desc codec", () => {
  it("round-trips a board through encode and decode", () => {
    const { board, forcefield } = fixtureBoard();
    const p = P(FW, FH, -1);
    const desc = encodeDesc(FWH, board, forcefield, 2, 1, 2);
    expect(validateDesc(p, desc)).toBeNull();
    const s = newState(p, desc);
    expect([...s.board]).toEqual([...board]);
    expect([...s.forcefield]).toEqual([...forcefield]);
    expect(s.tx).toBe(2);
    expect(s.ty).toBe(1);
    expect(s.minmoves).toBe(2);
  });

  it("encodes forcefield squares with an f prefix and round-trips them", () => {
    const s = fixtureState(2, 1, 2, (_board, ff) => {
      ff[idx(4, 1)] = 1;
    });
    expect(s.forcefield[idx(4, 1)]).toBe(1);
    expect(s.forcefield[idx(3, 2)]).toBe(0);
    const { board, forcefield } = fixtureBoard();
    forcefield[idx(4, 1)] = 1;
    expect(encodeDesc(FWH, board, forcefield, 2, 1, 2)).toContain("fe");
  });

  it("makes minmoves optional on read", () => {
    const { board, forcefield } = fixtureBoard();
    const p = P(FW, FH, -1);
    const full = encodeDesc(FWH, board, forcefield, 2, 1, 2);
    const trimmed = full.slice(0, full.lastIndexOf(","));
    expect(validateDesc(p, trimmed)).toBeNull();
    expect(newState(p, trimmed).minmoves).toBe(-1);
  });

  it("starts a desc whose main block already sits on the target as complete", () => {
    const s = fixtureState(1, 1, 0);
    expect(s.completed).toBe(0);
    expect(slideGame.status(s)).toBe("solved");
  });

  it("rejects every malformed desc upstream rejects", () => {
    // Board data for a 5x4 (20-cell) board, so the counts below are readable.
    const p = P(5, 4, -1);
    const cases: [string, RegExp][] = [
      // The letter branch's count overruns the board...
      ["w5a16,3,1", /Too much data/],
      // ...and so does one more cell after a full board.
      ["w5ma14a,3,1", /Too much data/],
      ["w5ma14", /No target coordinates/],
      ["w5a15,3,1", /No main piece/],
      ["w5m2a13,3,1", /More than one main/],
      ["w5ma13,3,1", /Not enough data/], // 19 cells
      ["w5mz13,3,1", /Invalid character/],
      ["w5md,3,1", /Expected a number after 'd'/],
      ["w5md9a12,3,1", /Out-of-range number after 'd'/], // dist 9 > i 6
      ["w5maed1a11,3,1", /Invalid back-reference/], // links to an EMPTY square
      ["w5maf", /Expected another character after 'f'/],
    ];
    for (const [desc, pattern] of cases) {
      expect(validateDesc(p, desc) ?? "", desc).toMatch(pattern);
    }
  });

  it("accepts a desc with the target coordinates but no minmoves", () => {
    expect(validateDesc(P(5, 4, -1), "w5ma14,3,1")).toBeNull();
  });

  it("accepts an uppercase F forcefield prefix, as the C's validator does", () => {
    // Upstream's `validate_desc` accepts `F` while its `new_game` accepts only
    // `f`, so a hand-typed `F…` validated and then silently decoded as a WALL.
    // Accepting both aligns the pair; the generator never emits `F`.
    const p = P(FW, FH, -1);
    const { board, forcefield } = fixtureBoard();
    forcefield[idx(4, 1)] = 1;
    const lower = encodeDesc(FWH, board, forcefield, 2, 1, 2);
    const upper = lower.replace("f", "F");
    expect(upper).not.toBe(lower);
    expect(validateDesc(p, upper)).toBeNull();
    const s = newState(p, upper);
    expect(s.forcefield[idx(4, 1)]).toBe(1);
    expect([...s.board]).toEqual([...board]);
  });
});

// --- text format ------------------------------------------------------

describe("slide text format", () => {
  it("draws block boundaries and marks the main block distinctly", () => {
    const { board } = fixtureBoard();
    const text = boardTextFormat(FW, FH, board);
    const lines = text.split("\n");
    expect(lines).toHaveLength(2 * FH + 1 + 1); // trailing "" after the last \n
    expect(lines[0]).toHaveLength(2 * FW + 1);
    // The main block is drawn `*`, the singleton beside it `%`. Upstream decides
    // this from the dsf *root's* byte, which for a merged block is a DIST — so
    // it could never draw `*` for a multi-square main block at all. We compare
    // class membership instead.
    //
    // A 2x2 block renders as a 3x3 run of its character: its four cell
    // interiors, the two gaps along each internal edge, and the interior corner
    // where all four meet all resolve to the same class.
    expect(text.split("*").length - 1).toBe(9);
    expect(text).toContain("***");
    expect(text).toContain("%");
    expect(text).toContain("#");
  });

  it("is available through the Game hook", () => {
    const text = play("5x5u#slide-text").formatAsText();
    expect(text).toBeDefined();
    expect(text).toContain("*");
  });
});

// --- solver -----------------------------------------------------------

describe("slide solver", () => {
  it("finds the minimum move count on a hand-built board", () => {
    const { board, forcefield } = fixtureBoard();
    const { moves, path } = solveBoard(FW, FH, board, forcefield, 2, 1, -1, true);
    expect(moves).toBe(2);
    expect(path).toHaveLength(2);

    // Replaying the reported path must actually reach the target.
    let cur = board;
    for (const step of path ?? []) {
      const next = cur.slice();
      expect(movePiece(FW, FH, cur, next, forcefield, step.from, step.to)).toBe(true);
      cur = next;
    }
    expect(cur[idx(2, 1)]).toBe(MAINANCHOR);
  });

  it("returns -1 when nothing can move", () => {
    expect(solveBoard(FW, FH, packedBoard(), new Uint8Array(FWH), 3, 2, -1).moves).toBe(
      -1,
    );
  });

  it("honours a move limit, and still finds a solution exactly at it", () => {
    const { board, forcefield } = fixtureBoard();
    expect(solveBoard(FW, FH, board, forcefield, 2, 1, 2).moves).toBe(2);
    expect(solveBoard(FW, FH, board, forcefield, 2, 1, 1).moves).toBe(-1);
  });

  it("makes a non-main block take the long way round a forcefield", () => {
    const { board, forcefield } = fixtureBoard();
    // Fence the singleton in: its only two free neighbours become forcefields,
    // which only the main block may cross. It can no longer step aside in one
    // move, so the main block has to vacate its corner first, the singleton
    // slides into it, and only then can the main block reach the target — three
    // moves instead of two.
    forcefield[idx(4, 1)] = 1;
    forcefield[idx(3, 2)] = 1;
    expect(solveBoard(FW, FH, board, forcefield, 2, 1, -1).moves).toBe(3);
  });

  it("does let the *main* block cross a forcefield", () => {
    const { board, forcefield } = fixtureBoard();
    // Same forcefields, but with the singleton gone the main block can slide
    // straight over them in one move.
    board[idx(3, 1)] = EMPTY;
    forcefield[idx(3, 1)] = 1;
    forcefield[idx(3, 2)] = 1;
    expect(solveBoard(FW, FH, board, forcefield, 2, 1, -1).moves).toBe(1);
  });
});

// --- generator --------------------------------------------------------

describe("slide generator", () => {
  for (const [w, h, maxmoves] of [
    [5, 5, -1],
    [6, 5, -1],
    [6, 5, 10],
  ] as const) {
    it(`${w}x${h} generates a soluble board whose minmoves is exact`, () => {
      const p = P(w, h, maxmoves);
      const { desc } = newSlideDesc(p, randomNew(`slide-gen-${w}-${h}-${maxmoves}`));
      expect(validateDesc(p, desc)).toBeNull();
      const s = newState(p, desc);
      const { moves } = solveBoard(w, h, s.board, s.forcefield, s.tx, s.ty, -1);
      expect(moves).toBeGreaterThan(0);
      expect(moves).toBe(s.minmoves);
      if (maxmoves >= 0) expect(moves).toBeLessThanOrEqual(maxmoves);
    });
  }

  it("generates the smallest legal boards, where upstream aborts", () => {
    // Upstream tests solubility before each singleton removal and never after
    // the last, so a board that only becomes soluble once the final singleton
    // goes hits `assert(!"We shouldn't get here")` — which is every 5x4 and 6x4
    // board. Running the missing final check gives an answer where the C had
    // none (docs/games/solver-and-generator.md § "Divergence and what it costs" rule 1); the boards it yields are trivially easy, which
    // is inherent to a 3x2 interior holding a 2x2 main block.
    for (const [w, h] of [
      [5, 4],
      [6, 4],
    ] as const) {
      const p = P(w, h, -1);
      const { desc } = newSlideDesc(p, randomNew(`slide-tiny-${w}-${h}`));
      expect(validateDesc(p, desc)).toBeNull();
      const s = newState(p, desc);
      expect(s.minmoves).toBeGreaterThan(0);
      expect(solveBoard(w, h, s.board, s.forcefield, s.tx, s.ty, -1).moves).toBe(
        s.minmoves,
      );
    }
  });
});

// --- drag reachability ------------------------------------------------

describe("slide drag reachability", () => {
  it("marks exactly the squares the block can slide to", () => {
    const s = fixtureState();
    const reachable = new Uint8Array(FWH);

    // The singleton can wander the whole connected empty region, plus the
    // square it currently occupies.
    computeReachable(s, idx(3, 1), reachable);
    const reached = [...reachable.keys()]
      .filter((i) => reachable[i])
      .sort((a, b) => a - b);
    expect(reached).toEqual(
      [
        idx(3, 1),
        idx(4, 1),
        idx(3, 2),
        idx(4, 2),
        idx(1, 3),
        idx(2, 3),
        idx(3, 3),
        idx(4, 3),
      ].sort((a, b) => a - b),
    );
  });

  it("will not let a non-main block onto a forcefield", () => {
    const s = fixtureState(2, 1, 2, (_board, ff) => {
      ff[idx(4, 1)] = 1;
      ff[idx(3, 2)] = 1;
    });
    const reachable = new Uint8Array(FWH);
    computeReachable(s, idx(3, 1), reachable);
    // Fenced in: only its own square.
    expect([...reachable.keys()].filter((i) => reachable[i])).toEqual([idx(3, 1)]);
  });

  it("does let the main block onto a forcefield", () => {
    const s = fixtureState(2, 1, 1, (board, ff) => {
      board[idx(3, 1)] = EMPTY;
      ff[idx(3, 1)] = 1;
      ff[idx(3, 2)] = 1;
    });
    const reachable = new Uint8Array(FWH);
    computeReachable(s, idx(1, 1), reachable);
    expect(reachable[idx(2, 1)]).toBe(1);
  });

  it("keeps a block inside the board and out of other blocks", () => {
    const s = fixtureState();
    const reachable = new Uint8Array(FWH);
    computeReachable(s, idx(3, 1), reachable);
    // Never onto the main block, a wall, or off the board.
    expect(reachable[idx(1, 1)]).toBe(0);
    expect(reachable[idx(2, 2)]).toBe(0);
    expect(reachable[idx(0, 1)]).toBe(0);
    expect(reachable[idx(5, 1)]).toBe(0);
  });
});

// --- move counting ----------------------------------------------------

describe("slide move counting", () => {
  const singleton = idx(3, 1);

  it("counts a fresh block's slide as one move", () => {
    const after = executeMove(fixtureState(), {
      kind: "move",
      from: singleton,
      to: idx(4, 1),
    });
    expect(after.movecount).toBe(1);
    expect(after.lastmoved).toBe(idx(4, 1));
    expect(after.lastmovedPos).toBe(singleton);
  });

  it("does not count nudging the same block again", () => {
    let s = fixtureState();
    s = executeMove(s, { kind: "move", from: singleton, to: idx(4, 1) });
    s = executeMove(s, { kind: "move", from: idx(4, 1), to: idx(4, 2) });
    expect(s.movecount).toBe(1); // one slide, made in two nudges
    expect(s.lastmovedPos).toBe(singleton); // still where it started
    expect(s.lastmoved).toBe(idx(4, 2));
  });

  it("decrements the count when a block goes back where it started", () => {
    let s = fixtureState();
    s = executeMove(s, { kind: "move", from: singleton, to: idx(4, 1) });
    s = executeMove(s, { kind: "move", from: idx(4, 1), to: singleton });
    expect(s.movecount).toBe(0);
    expect(s.lastmoved).toBe(-1);
    expect(s.lastmovedPos).toBe(-1);
  });

  it("records completion at the move count, and keeps it", () => {
    let s = fixtureState();
    expect(s.completed).toBe(-1);
    s = executeMove(s, { kind: "move", from: singleton, to: idx(4, 1) });
    s = executeMove(s, { kind: "move", from: idx(1, 1), to: idx(2, 1) });
    expect(s.completed).toBe(2);
    expect(slideGame.status(s)).toBe("solved");
    // Sliding the main block away again keeps the recorded completion.
    s = executeMove(s, { kind: "move", from: idx(2, 1), to: idx(1, 1) });
    expect(s.completed).toBe(2);
  });

  it("refuses an illegal move rather than corrupting the board", () => {
    // Onto a square the main block occupies.
    expect(() =>
      executeMove(fixtureState(), { kind: "move", from: singleton, to: idx(1, 2) }),
    ).toThrow(/illegal move/);
  });
});

// --- input ------------------------------------------------------------

describe("slide input", () => {
  const ts = PREFERRED_TILE_SIZE;
  const at = (cx: number, cy: number) => ({
    x: cx * ts + ts / 2,
    y: cy * ts + ts / 2,
  });

  function scenario(): { s: SlideState; ui: SlideUi } {
    const s = fixtureState();
    return { s, ui: newUi(s) };
  }

  it("grabs a block, follows the pointer and commits on release", () => {
    const { s, ui } = scenario();
    expect(
      slideGame.interpretMove(
        s,
        ui,
        sizedDrawState(slideGame, s),
        at(3, 1),
        LEFT_BUTTON,
      ),
    ).toBe(UI_UPDATE);
    expect(ui.dragging).toBe(true);
    expect(ui.dragAnchor).toBe(idx(3, 1));
    expect(ui.reachable[ui.dragAnchor]).toBe(1);

    // Drag towards the far corner; the block snaps to the nearest reachable
    // square, which here is the corner itself.
    expect(
      slideGame.interpretMove(s, ui, sizedDrawState(slideGame, s), at(4, 3), LEFT_DRAG),
    ).toBe(UI_UPDATE);
    expect(ui.dragCurrpos).toBe(idx(4, 3));

    expect(
      slideGame.interpretMove(
        s,
        ui,
        sizedDrawState(slideGame, s),
        at(4, 3),
        LEFT_RELEASE,
      ),
    ).toEqual({
      kind: "move",
      from: idx(3, 1),
      to: idx(4, 3),
    });
    expect(ui.dragging).toBe(false);
    expect([...ui.reachable].every((v) => v === 0)).toBe(true);
  });

  it("grabs a multi-square block by any of its squares", () => {
    const { s, ui } = scenario();
    // Press the main block's bottom-right square; the drag anchors on its
    // top-left one, and the grab offset remembers which square was held.
    slideGame.interpretMove(s, ui, sizedDrawState(slideGame, s), at(2, 2), LEFT_BUTTON);
    expect(ui.dragAnchor).toBe(idx(1, 1));
    expect(ui.dragOffsetX).toBe(1);
    expect(ui.dragOffsetY).toBe(1);
  });

  it("releases without a move when the block never left its square", () => {
    const { s, ui } = scenario();
    slideGame.interpretMove(s, ui, sizedDrawState(slideGame, s), at(3, 1), LEFT_BUTTON);
    expect(
      slideGame.interpretMove(
        s,
        ui,
        sizedDrawState(slideGame, s),
        at(3, 1),
        LEFT_RELEASE,
      ),
    ).toBe(UI_UPDATE);
    expect(ui.dragging).toBe(false);
  });

  it("ignores a press on empty space, a wall, or off the board", () => {
    const { s, ui } = scenario();
    expect(
      slideGame.interpretMove(
        s,
        ui,
        sizedDrawState(slideGame, s),
        at(0, 0),
        LEFT_BUTTON,
      ),
    ).toBeNull();
    expect(
      slideGame.interpretMove(
        s,
        ui,
        sizedDrawState(slideGame, s),
        at(4, 3),
        LEFT_BUTTON,
      ),
    ).toBeNull();
    expect(
      slideGame.interpretMove(
        s,
        ui,
        sizedDrawState(slideGame, s),
        { x: -5, y: -5 },
        LEFT_BUTTON,
      ),
    ).toBeNull();
    expect(ui.dragging).toBe(false);
  });

  it("does not repaint when a drag event leaves the block where it was", () => {
    const { s, ui } = scenario();
    slideGame.interpretMove(s, ui, sizedDrawState(slideGame, s), at(3, 1), LEFT_BUTTON);
    expect(
      slideGame.interpretMove(s, ui, sizedDrawState(slideGame, s), at(3, 1), LEFT_DRAG),
    ).toBeNull();
  });

  it("ignores a drag or release that no press started", () => {
    const { s, ui } = scenario();
    expect(
      slideGame.interpretMove(s, ui, sizedDrawState(slideGame, s), at(3, 1), LEFT_DRAG),
    ).toBeNull();
    expect(
      slideGame.interpretMove(
        s,
        ui,
        sizedDrawState(slideGame, s),
        at(3, 1),
        LEFT_RELEASE,
      ),
    ).toBeNull();
  });

  it("treats a touch long-press as a primary drag", () => {
    // `detectSecondaryButton` delivers a finger that stays put for 350ms as
    // RIGHT_BUTTON, which is exactly "press, pause to aim, then drag" — the
    // gesture Slide is entirely built from (docs/games/input.md § "A touch hold arrives as the right button").
    const { s, ui } = scenario();
    expect(
      slideGame.interpretMove(
        s,
        ui,
        sizedDrawState(slideGame, s),
        at(3, 1),
        RIGHT_BUTTON | MOD_STYLUS,
      ),
    ).toBe(UI_UPDATE);
    expect(ui.dragging).toBe(true);
    slideGame.interpretMove(
      s,
      ui,
      sizedDrawState(slideGame, s),
      at(4, 3),
      RIGHT_DRAG | MOD_STYLUS,
    );
    expect(ui.dragCurrpos).toBe(idx(4, 3));
    expect(
      slideGame.interpretMove(
        s,
        ui,
        sizedDrawState(slideGame, s),
        at(4, 3),
        RIGHT_RELEASE | MOD_STYLUS,
      ),
    ).toEqual({ kind: "move", from: idx(3, 1), to: idx(4, 3) });
  });

  it("cancels a dangling drag when the board changes under it", () => {
    // Upstream's `game_changed_state` is empty, so a drag held across an undo
    // left `game_redraw` asserting on a block that no longer fits.
    const { s, ui } = scenario();
    slideGame.interpretMove(s, ui, sizedDrawState(slideGame, s), at(3, 1), LEFT_BUTTON);
    expect(ui.dragging).toBe(true);
    slideGame.changedState?.(ui, s, s);
    expect(ui.dragging).toBe(false);
    expect(ui.dragAnchor).toBe(-1);
    expect([...ui.reachable].every((v) => v === 0)).toBe(true);
  });
});

// --- Solve, through a real Midend --------------------------------------

/** Slide some block other than `avoid`, through the midend. Returns whether it
 * found one it could move. */
function slideSomeBlock(me: SlideMidend, avoid = -1): boolean {
  const s = stateOf(me);
  const reachable = new Uint8Array(s.w * s.h);
  for (let i = 0; i < s.w * s.h; i++) {
    if (i === avoid) continue;
    if (s.board[i] !== ANCHOR && s.board[i] !== MAINANCHOR) continue;
    computeReachable(s, i, reachable);
    const to = [...reachable.keys()].find((k) => reachable[k] && k !== i);
    if (to === undefined) continue;
    me.playMoves([{ kind: "move", from: i, to }]);
    return true;
  }
  return false;
}

describe("slide solve", () => {
  it("installs a route the step key walks to completion", () => {
    const { m, status } = makeMidend();
    expect(m.newGameFromId("5x5u#slide-solve")).toBeUndefined();
    const minmoves = stateOf(m).minmoves;
    expect(minmoves).toBeGreaterThan(0);

    expect(m.solve()).toBeUndefined();
    // Slide's Solve deliberately does not fill the board in: it arms a route,
    // exactly as Inertia's does. So the board is untouched but marked cheated.
    expect(stateOf(m).soln).toHaveLength(minmoves);
    expect(stateOf(m).cheated).toBe(true);
    expect(status()).toBe("ongoing");

    // Space arrives as CURSOR_SELECT2 in this frontend, never as ' ' — the key
    // upstream binds. Walking the route with it must finish the puzzle.
    for (let i = 0; i < minmoves; i++) m.processInput(0, 0, CURSOR_SELECT2);
    expect(stateOf(m).completed).toBeGreaterThanOrEqual(0);
    expect(status()).toBe("solved-with-help");
    // The route is dropped once it has been walked to the end.
    expect(stateOf(m).soln).toBeNull();
  });

  it("solves from the current position, not the starting one", () => {
    // Upstream passes `state` (the *initial* board) to its solver although its
    // own comment says "from the current position", so any Solve after any move
    // installs a route whose first step is illegal and the step key does
    // nothing at all.
    const me = play("5x5u#slide-solve-mid");
    expect(slideSomeBlock(me)).toBe(true);

    expect(me.solve()).toBeUndefined();
    const steps = stateOf(me).soln?.length ?? 0;
    expect(steps).toBeGreaterThan(0);
    for (let i = 0; i < steps; i++) me.processInput(0, 0, CURSOR_SELECT2);
    expect(stateOf(me).completed).toBeGreaterThanOrEqual(0);
  });

  it("drops the route when the player strays from it", () => {
    const me = play("6x5u#slide-stray");
    expect(me.solve()).toBeUndefined();
    const route = stateOf(me).soln;
    expect(route).not.toBeNull();

    // Move some *other* block than the one the route wants next.
    expect(slideSomeBlock(me, route?.[0].from ?? -1)).toBe(true);
    expect(stateOf(me).soln).toBeNull();
  });

  it("reports an already-solved board rather than a pointless route", () => {
    // Upstream's own `nmoves == 0` guard is unreachable, because `solve_board`
    // only ever tests the goal on a *newly generated* board and so never
    // answers 0 — on a finished board it happily reports the one irrelevant
    // move that leaves the main block where it is. We test the start board.
    const s = fixtureState(1, 1, 0);
    expect(slideGame.solve?.(s, s)).toEqual({
      ok: false,
      error: "Puzzle is already solved",
    });
  });

  it("reports an insoluble board", () => {
    const packed = packedBoard();
    const s = newState(
      P(FW, FH, -1),
      encodeDesc(FWH, packed, new Uint8Array(FWH), 3, 2, -1),
    );
    expect(slideGame.solve?.(s, s)).toEqual({
      ok: false,
      error: "Unable to find a solution to this puzzle",
    });
  });
});

// --- statusbar and save ------------------------------------------------

describe("slide statusbar", () => {
  it("shows the move count against the generator's minimum", () => {
    const s = fixtureState();
    const ui = newUi(s);
    expect(slideGame.statusbarText?.(s, ui)).toBe("Moves: 0 (min 2)");

    const solved = { ...s, completed: 4, movecount: 4 };
    expect(slideGame.statusbarText?.(solved, ui)).toBe("COMPLETED! Moves: 4 (min 2)");
    expect(slideGame.statusbarText?.({ ...solved, cheated: true }, ui)).toBe(
      "Auto-solved. Moves: 4 (min 2)",
    );
    expect(slideGame.statusbarText?.({ ...s, cheated: true }, ui)).toBe(
      "Auto-solver used. Moves: 0 (min 2)",
    );
    // A desc that carried no minmoves shows none.
    expect(slideGame.statusbarText?.({ ...s, minmoves: -1 }, ui)).toBe("Moves: 0");
  });
});

describe("slide save round-trip", () => {
  it("restores the board, the move count and an armed Solve route", () => {
    const me = play("5x5u#slide-save");
    expect(me.solve()).toBeUndefined();
    me.processInput(0, 0, CURSOR_SELECT2);

    const before = stateOf(me);
    expect(before.movecount).toBe(1);
    const saved = me.saveGame();

    const me2: SlideMidend = new Midend(slideGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    const after = stateOf(me2);

    expect([...after.board]).toEqual([...before.board]);
    expect(after.movecount).toBe(before.movecount);
    expect(after.lastmoved).toBe(before.lastmoved);
    expect(after.lastmovedPos).toBe(before.lastmovedPos);
    expect(after.cheated).toBe(true);
    expect(after.soln?.length).toBe(before.soln?.length);
    expect(after.solnIndex).toBe(before.solnIndex);
    expect(me2.formatAsText()).toBe(me.formatAsText());
  });
});

// --- capabilities -----------------------------------------------------

describe("slide capabilities", () => {
  it("ships no findMistakes: every reachable position is legal", () => {
    // Slide has no notion of a wrong-but-legal board — you are simply nearer to
    // or further from the exit — so Check & Save correctly degrades to a plain
    // quick-save, exactly as for the permutation games (docs/games/solver-and-generator.md § "The solvable-game contract").
    expect(slideGame.findMistakes).toBeUndefined();
    expect(new Midend(slideGame).getStaticProperties().canFindMistakes).toBe(false);
  });

  it("ships no hint and no keypad in this change", () => {
    expect(slideGame.hint).toBeUndefined();
    expect(slideGame.requestKeys).toBeUndefined();
  });

  it("does not animate a slide, but flashes on completion", () => {
    const ongoing = fixtureState();
    const done = { ...ongoing, completed: 2 };
    const ui = newUi(ongoing);
    expect(slideGame.animLength?.(ongoing, done, 1, ui)).toBe(0);
    expect(slideGame.flashLength?.(ongoing, done, 1, ui)).toBeGreaterThan(0);
    expect(slideGame.flashLength?.(ongoing, ongoing, 1, ui)).toBe(0);
    expect(slideGame.flashLength?.(done, done, 1, ui)).toBe(0);
  });
});
