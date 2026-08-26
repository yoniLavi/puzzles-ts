/**
 * Render scenarios for Slide (tier 2.5 — a real `Midend` driven to a target
 * frame, captured with the shared recording `GameDrawing`).
 *
 * Slide has no interpolated animation, so *all* of its movement feedback is in
 * the frame: the dragged block following the pointer lit up, the target area
 * tinted, the Solve route's next block highlighted with a shadow where it should
 * land, and the completion flash. Each of those gets a targeted assertion plus a
 * snapshot — the assertions are the real guarantee, the snapshot catches drift.
 *
 * The drag and Solve frames are captured on a **warm** draw state (a frame has
 * already been painted), because that is the case where an overlay left out of
 * the cache diff key silently fails to repaint (docs/games/rendering.md § "Overlay sidecars"). Slide packs
 * every overlay into the one per-tile word, so this is structurally safe — but
 * a cold frame would not prove it.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import {
  CURSOR_DOWN,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
} from "../../engine/pointer.ts";
import type { DrawOp } from "../../engine/testing/recording-drawing.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import type { Colour } from "../../engine/types.ts";
import { slideGame } from "./index.ts";
import {
  COL_BACKGROUND,
  COL_BLOCK,
  COL_CURSOR,
  COL_GRABBED,
  COL_HIGHLIGHT,
  COL_LOWLIGHT,
  COL_MAIN,
  COL_MAIN_GRABBED,
  COL_ROUTE,
  COL_ROUTE_SHADOW,
  COL_TARGET,
  COL_WALL,
  COL_WALL_HIGHLIGHT,
  COL_WALL_LOWLIGHT,
  PREFERRED_TILE_SIZE as TS,
} from "./render.ts";
import {
  ANCHOR,
  EMPTY,
  encodeDesc,
  MAINANCHOR,
  type SlideMove,
  type SlideParams,
  type SlideState,
  type SlideUi,
  WALL,
} from "./state.ts";

// --- a fixed board, so every frame below is deterministic ---------------

const W = 6;
const H = 5;
const WH = W * H;
const idx = (x: number, y: number): number => y * W + x;

/**
 * ```
 * # # # # # #
 * # M m A . #     M/m = the main 2x2's squares, A = a 1x1 block
 * # m m . . #     the target is (2,1): main one square right
 * # . . . . #
 * # # # # # #
 * ```
 * Two moves: nudge `A` out of (3,1), then slide the main block right. The board
 * is spelled out here rather than generated so the frames are stable and the
 * assertions can name particular tiles (see `slide.test.ts` for the same shape
 * used by the logic tests).
 */
const DESC = (() => {
  const board = new Uint8Array(WH).fill(EMPTY);
  for (let x = 0; x < W; x++) {
    board[x] = WALL;
    board[(H - 1) * W + x] = WALL;
  }
  for (let y = 0; y < H; y++) {
    board[y * W] = WALL;
    board[y * W + (W - 1)] = WALL;
  }
  board[idx(1, 1)] = MAINANCHOR;
  board[idx(2, 1)] = 1;
  board[idx(1, 2)] = W - 1;
  board[idx(2, 2)] = 1;
  board[idx(3, 1)] = ANCHOR;
  return encodeDesc(WH, board, new Uint8Array(WH), 2, 1, 2);
})();
const ID = `6x5u:${DESC}`;

/**
 * The same board with a two-square **exit gate** at (4,1)-(4,2) — the squares
 * only the key block may cross. It sits partly on the exit area, which is the
 * normal arrangement and the case the gate marking has to survive: the two
 * markings overlap, so one of them cannot be a fill.
 */
const GATE_CELLS = [
  [3, 1],
  [3, 2],
] as const;
const GATE_ID = (() => {
  const board = new Uint8Array(WH).fill(EMPTY);
  for (let x = 0; x < W; x++) {
    board[x] = WALL;
    board[(H - 1) * W + x] = WALL;
  }
  for (let y = 0; y < H; y++) {
    board[y * W] = WALL;
    board[y * W + (W - 1)] = WALL;
  }
  board[idx(1, 1)] = MAINANCHOR;
  board[idx(2, 1)] = 1;
  board[idx(1, 2)] = W - 1;
  board[idx(2, 2)] = 1;
  const ff = new Uint8Array(WH);
  for (const [x, y] of GATE_CELLS) ff[idx(x, y)] = 1;
  return `6x5u:${encodeDesc(WH, board, ff, 2, 1, 2)}`;
})();

const NUDGE: SlideMove = { kind: "move", from: idx(3, 1), to: idx(4, 1) };
const WIN: SlideMove = { kind: "move", from: idx(1, 1), to: idx(2, 1) };

type SlideMidend = Midend<SlideParams, SlideState, SlideMove, SlideUi, unknown>;

const PALETTE: Colour[] = slideGame.colours(DEFAULT_BACKGROUND);

function newBoard(): SlideMidend {
  const me: SlideMidend = new Midend(slideGame);
  expect(me.newGameFromId(ID)).toBeUndefined();
  return me;
}

function capture(me: SlideMidend): readonly DrawOp[] {
  const rec = new RecordingDrawing(PALETTE);
  me.redraw(rec);
  return rec.ops;
}

/**
 * How light a palette entry is, as the ordinary sRGB-weighted sum. Deliberately
 * not OKLCH: `utils/color.ts` is in the app layer, and `module-layering.test.ts`
 * holds games (tests included) to importing nothing outside the engine and their
 * own directory. The assertions below need an *ordering* and a floor on the gaps,
 * which this ranks the same way a perceptual measure would.
 */
const lightness = (c: Colour): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** The middle of cell `(gx, gy)` in pixels, at the preferred tile size. */
const at = (gx: number, gy: number): [number, number] => [
  gx * TS + Math.floor(TS / 2),
  gy * TS + Math.floor(TS / 2),
];

type RectOp = Extract<DrawOp, { op: "rect" }>;

/** Every filled rect that falls inside cell `(gx, gy)`. */
function rectsInTile(ops: readonly DrawOp[], gx: number, gy: number): RectOp[] {
  const x0 = gx * TS;
  const y0 = gy * TS;
  return ops.filter(
    (o): o is RectOp =>
      o.op === "rect" && o.x >= x0 && o.x < x0 + TS && o.y >= y0 && o.y < y0 + TS,
  );
}

/**
 * The colour of a tile's *largest* rect — for a tile holding part of a block
 * that is the block's central fill, which is exactly the section `draw_tile`
 * recolours to signal "held" or "next in the Solve route". Ignores the
 * full-tile background rect so the piece's own fill is what we read.
 */
function pieceFillColour(
  ops: readonly DrawOp[],
  gx: number,
  gy: number,
): number | undefined {
  const inner = rectsInTile(ops, gx, gy).filter((o) => o.w < TS || o.h < TS);
  let best: RectOp | undefined;
  for (const o of inner) if (!best || o.w * o.h > best.w * best.h) best = o;
  return best?.colour;
}

// --- the opening frame -------------------------------------------------

describe("slide opening frame", () => {
  it("paints the board, the target tint and the main block", () => {
    const ops = capture(newBoard());

    // The engine paints no pixels of its own, so the game fills its own
    // background on the first frame (docs/games/rendering.md § "The rendering doctrine" doctrine).
    expect(ops[0]).toMatchObject({
      op: "rect",
      x: 0,
      y: 0,
      w: W * TS,
      h: H * TS,
      colour: COL_BACKGROUND,
    });

    // The target area — where the main block has to end up — is tinted, and it
    // is the main block's *shape*, so all four of its squares are tinted.
    for (const [gx, gy] of [
      [2, 1],
      [3, 1],
      [2, 2],
      [3, 2],
    ] as const) {
      expect(
        rectsInTile(ops, gx, gy).some((o) => o.colour === COL_TARGET),
        `target tint at (${gx},${gy})`,
      ).toBe(true);
    }
    // ...and a square outside it is not tinted.
    expect(rectsInTile(ops, 1, 3).some((o) => o.colour === COL_TARGET)).toBe(false);

    // The main block is blue; the ordinary block beside it is its own grey.
    expect(pieceFillColour(ops, 1, 1)).toBe(COL_MAIN);
    expect(pieceFillColour(ops, 2, 2)).toBe(COL_MAIN);
    expect(pieceFillColour(ops, 3, 1)).toBe(COL_BLOCK);

    // Walls are bevelled, and their mitred corners are drawn as polygons.
    expect(
      rectsInTile(ops, 0, 0).some(
        (o) => o.colour === COL_WALL_HIGHLIGHT || o.colour === COL_WALL_LOWLIGHT,
      ),
    ).toBe(true);
    expect(ops.some((o) => o.op === "polygon")).toBe(true);
  });

  it("gives the floor, the wall and an ordinary block three different fills", () => {
    // The point of the whole change, and the one assertion that would have
    // failed against upstream: `game_colours` derived all three from a single
    // `game_mkhighlight` trio, so a board could only be read off its bevels.
    const ops = capture(newBoard());
    const floor = ops[0]; // the opening background fill
    expect(floor).toMatchObject({ op: "rect", colour: COL_BACKGROUND });

    // The *last* full-tile rect, not the first: `draw_tile` lays the floor down
    // under every square before the wall goes on top of it.
    const fullTile = rectsInTile(ops, 0, 0).filter((o) => o.w === TS && o.h === TS);
    const wall = fullTile.at(-1);
    expect(fullTile[0]?.colour).toBe(COL_BACKGROUND);
    expect(wall?.colour).toBe(COL_WALL);
    const block = pieceFillColour(ops, 3, 1);

    const distinct = new Set([COL_BACKGROUND, wall?.colour, block, COL_MAIN]);
    expect(distinct.size).toBe(4);
  });

  it("keeps the four fills apart by lightness, not merely by index", () => {
    // An index check alone would pass on four names for one colour, which is
    // the state this change found the game in. Assert the *ladder*: each
    // material is a visible step from the next, and the exit stays the palest
    // thing on the board. Thresholds are deliberately loose — this pins the
    // ordering and a minimum separation, not the constants.
    const l = (i: number) => lightness(PALETTE[i]);

    expect(l(COL_TARGET)).toBeGreaterThan(l(COL_BACKGROUND));
    expect(l(COL_BACKGROUND)).toBeGreaterThan(l(COL_BLOCK));
    expect(l(COL_BLOCK)).toBeGreaterThan(l(COL_WALL));

    for (const [a, b] of [
      [COL_TARGET, COL_BACKGROUND],
      [COL_BACKGROUND, COL_BLOCK],
      [COL_BLOCK, COL_WALL],
    ] as const) {
      expect(l(a) - l(b), `${a} vs ${b}`).toBeGreaterThan(0.05);
    }
  });

  it("matches its snapshot", () => {
    expect(capture(newBoard())).toMatchSnapshot();
  });
});

// --- a drag in progress ------------------------------------------------

describe("slide drag frame", () => {
  /** Grab the main block and drag it onto the target, without releasing. */
  function midDrag(): SlideMidend {
    const me = newBoard();
    me.playMoves([NUDGE]); // clear (3,1) so the main block can move
    capture(me); // warm the draw state, so the drag overlay must beat the cache
    me.processInput(...at(1, 1), LEFT_BUTTON);
    me.processInput(...at(2, 1), LEFT_DRAG);
    return me;
  }

  it("draws the held block lit up, at the square it would land on", () => {
    const before = capture(newBoard());
    expect(pieceFillColour(before, 1, 1)).toBe(COL_MAIN);

    const ops = capture(midDrag());
    // The block is drawn where it will come to rest, in its held colour...
    expect(pieceFillColour(ops, 2, 1)).toBe(COL_MAIN_GRABBED);
    expect(pieceFillColour(ops, 3, 2)).toBe(COL_MAIN_GRABBED);
    // ...and the square it came from is now empty floor.
    expect(pieceFillColour(ops, 1, 1)).toBeUndefined();
  });

  it("lights up an ordinary block in its own held colour", () => {
    const me = newBoard();
    capture(me);
    me.processInput(...at(3, 1), LEFT_BUTTON);
    me.processInput(...at(4, 3), LEFT_DRAG);
    expect(pieceFillColour(capture(me), 4, 3)).toBe(COL_GRABBED);
  });

  it("puts the block back to its committed colour on release", () => {
    const me = midDrag();
    me.processInput(...at(2, 1), LEFT_RELEASE);
    const ops = capture(me);
    expect(pieceFillColour(ops, 2, 1)).toBe(COL_MAIN);
    expect(pieceFillColour(ops, 1, 1)).toBeUndefined();
  });

  it("matches its snapshot", () => {
    expect(capture(midDrag())).toMatchSnapshot();
  });
});

// --- the keyboard cursor -----------------------------------------------

describe("slide keyboard frame", () => {
  /** Every line drawn in the cursor's colour inside cell `(gx, gy)`. The mark
   * is `drawRectCorners`, i.e. eight short strokes — two per corner. */
  function cursorLines(ops: readonly DrawOp[], gx: number, gy: number) {
    const x0 = gx * TS;
    const y0 = gy * TS;
    return ops.filter(
      (o) =>
        o.op === "line" &&
        o.colour === COL_CURSOR &&
        o.x1 >= x0 &&
        o.x1 < x0 + TS &&
        o.y1 >= y0 &&
        o.y1 < y0 + TS,
    );
  }

  /** Cursor onto the 1×1 block at (3,1), on a **warm** draw state — the case
   * where an overlay missing from the per-tile diff key silently fails to
   * repaint. It starts at (0,0), so it takes three rights and one down. */
  function cursorOnBlock(): SlideMidend {
    const me = newBoard();
    capture(me);
    for (let i = 0; i < 3; i++) me.processInput(0, 0, CURSOR_RIGHT);
    me.processInput(0, 0, CURSOR_DOWN);
    return me;
  }

  it("draws nothing until the first cursor key", () => {
    const ops = capture(newBoard());
    expect(ops.filter((o) => o.op === "line" && o.colour === COL_CURSOR)).toHaveLength(
      0,
    );
  });

  it("marks the cursor's cell, and only that cell", () => {
    const ops = capture(cursorOnBlock());
    expect(cursorLines(ops, 3, 1)).toHaveLength(8);
    // The vacuity guard this file's doctrine asks for: count what was looked
    // at, so "no cursor drawn anywhere" cannot pass as "drawn in one place".
    expect(ops.filter((o) => o.op === "line" && o.colour === COL_CURSOR)).toHaveLength(
      8,
    );
  });

  it("rides the block it has picked up, and lights it as a drag would", () => {
    const me = cursorOnBlock();
    me.processInput(0, 0, CURSOR_SELECT);
    me.processInput(0, 0, CURSOR_RIGHT);
    const ops = capture(me);

    // The held block is drawn where it would land, in the same held colour the
    // pointer drag uses — there is one grab, not two.
    expect(pieceFillColour(ops, 4, 1)).toBe(COL_GRABBED);
    expect(pieceFillColour(ops, 3, 1)).toBeUndefined();
    // ...with the cursor on it, having travelled with it.
    expect(cursorLines(ops, 4, 1)).toHaveLength(8);
    expect(cursorLines(ops, 3, 1)).toHaveLength(0);
  });

  it("takes the cursor off the board when a pointer press takes over", () => {
    const me = cursorOnBlock();
    expect(cursorLines(capture(me), 3, 1)).toHaveLength(8);
    me.processInput(...at(4, 3), LEFT_BUTTON);
    me.processInput(...at(4, 3), LEFT_RELEASE);
    expect(
      capture(me).filter((o) => o.op === "line" && o.colour === COL_CURSOR),
    ).toHaveLength(0);
  });

  it("matches its snapshot", () => {
    const me = cursorOnBlock();
    me.processInput(0, 0, CURSOR_SELECT);
    me.processInput(0, 0, CURSOR_RIGHT);
    expect(capture(me)).toMatchSnapshot();
  });
});

// --- the exit gate -----------------------------------------------------

describe("slide exit gate", () => {
  function gateBoard(): SlideMidend {
    const me: SlideMidend = new Midend(slideGame);
    expect(me.newGameFromId(GATE_ID)).toBeUndefined();
    return me;
  }

  it("outlines the gate region, and only where it faces out of it", () => {
    const ops = capture(gateBoard());
    const marks = (gx: number, gy: number) =>
      rectsInTile(ops, gx, gy).filter((o) => o.colour === COL_WALL);

    // Both gate squares are marked...
    for (const [gx, gy] of GATE_CELLS) {
      expect(marks(gx, gy).length, `gate mark at (${gx},${gy})`).toBeGreaterThan(0);
    }
    // ...and a floor square next to the gate is not.
    expect(marks(4, 1)).toHaveLength(0);

    // The shared edge between the two gate squares carries no mark: this is an
    // outline around the *region*, not a box drawn per square. Only horizontal
    // marks can lie on a horizontal edge — a vertical side's dashes start at the
    // top of their square and would otherwise be mistaken for a top edge.
    const horizontal = (gx: number, gy: number) =>
      marks(gx, gy).filter((o) => o.w > o.h);
    expect(horizontal(3, 1).some((o) => o.y + o.h >= 2 * TS - 1)).toBe(false);
    expect(horizontal(3, 2).some((o) => o.y <= 2 * TS + 1)).toBe(false);

    // The edges that face out of the region do carry one: (3,1)'s top, against
    // the wall above it, and its left and right sides.
    expect(horizontal(3, 1).some((o) => o.y <= TS + 1)).toBe(true);
    expect(marks(3, 1).some((o) => o.h > o.w && o.x <= 3 * TS + 1)).toBe(true);
    expect(marks(3, 1).some((o) => o.h > o.w && o.x >= 4 * TS - TS / 4)).toBe(true);
  });

  it("marks the gate without covering the exit area underneath it", () => {
    // The gate usually lies on the exit, so the marking has to be a boundary
    // rather than a fill. Upstream's "cattle grid" ruled the whole square with
    // bars in both directions; the test is that the tint still gets drawn and
    // the marking is a small fraction of the square.
    const ops = capture(gateBoard());
    const gate = rectsInTile(ops, 3, 1);
    expect(gate.some((o) => o.colour === COL_TARGET && o.w === TS && o.h === TS)).toBe(
      true,
    );

    const marked = gate
      .filter((o) => o.colour === COL_WALL)
      .reduce((sum, o) => sum + o.w * o.h, 0);
    expect(marked).toBeLessThan(TS * TS * 0.25);
  });

  it("matches its snapshot", () => {
    expect(capture(gateBoard())).toMatchSnapshot();
  });
});

// --- a Solve route on display ------------------------------------------

describe("slide solve-route frame", () => {
  function withRoute(): { me: SlideMidend; from: number; to: number } {
    const me = newBoard();
    capture(me); // warm the draw state
    expect(me.solve()).toBeUndefined();
    const state = (me as unknown as { state: SlideState }).state;
    const step = state.soln?.[0];
    if (!step) throw new Error("solve installed no route");
    return { me, from: step.from, to: step.to };
  }

  it("highlights the next block to move and shadows where it goes", () => {
    const plain = capture(newBoard());
    const { me, from, to } = withRoute();
    const ops = capture(me);

    const fx = from % W;
    const fy = Math.floor(from / W);
    const tx = to % W;
    const ty = Math.floor(to / W);

    // The block the route wants moved **keeps its own fill** and wears the
    // accent where its bevel would be. Upstream replaced the fill with the
    // block's own highlight — pure white on a light host, which is what its
    // author called excessive.
    expect(pieceFillColour(plain, fx, fy)).toBe(COL_BLOCK);
    expect(pieceFillColour(ops, fx, fy)).toBe(COL_BLOCK);
    expect(rectsInTile(ops, fx, fy).some((o) => o.colour === COL_ROUTE)).toBe(true);

    // Its destination — bare floor before — now carries the piece's outline in
    // the same accent one step weaker, so the two read as one instruction.
    expect(rectsInTile(plain, tx, ty).length).toBeLessThan(
      rectsInTile(ops, tx, ty).length,
    );
    expect(rectsInTile(ops, tx, ty).some((o) => o.colour === COL_ROUTE_SHADOW)).toBe(
      true,
    );
  });

  it("marks the next piece without making it the brightest thing on the board", () => {
    // The other half of the author's complaint, and the one a colour-index
    // assertion cannot state: the cue has to be an ordering cue, not a light
    // source. Nothing the route draws may out-light the exit, which is what
    // names the goal.
    const { me } = withRoute();
    const ops = capture(me);
    const brightest = Math.max(
      ...ops
        .filter((o) => o.op === "rect" && o.w > 2 && o.h > 2)
        .map((o) => lightness(PALETTE[(o as RectOp).colour])),
    );
    expect(brightest).toBeCloseTo(lightness(PALETTE[COL_TARGET]), 5);
    expect(lightness(PALETTE[COL_ROUTE])).toBeLessThan(lightness(PALETTE[COL_TARGET]));
  });

  it("moves the highlight on as the route advances", () => {
    // On an untouched board the main block is drawn plain.
    expect(pieceFillColour(capture(newBoard()), 1, 1)).toBe(COL_MAIN);

    const { me, from } = withRoute();
    expect(from).toBe(idx(3, 1)); // the route starts by moving the singleton
    capture(me); // the frame that paints the route's first highlight
    const stateNow = (): SlideState => (me as unknown as { state: SlideState }).state;

    // Walk the first step. The route now wants the *main* block moved, so the
    // accent band moves onto it — and its blue fill is untouched, which is what
    // stops the cue from being read as "this block has changed".
    const first = stateNow().soln?.[0];
    if (!first) throw new Error("solve installed no route");
    me.playMoves([{ kind: "move", ...first }]);

    const next = stateNow().soln?.[stateNow().solnIndex];
    if (!next) throw new Error("route ended after one step");
    expect(next.from).toBe(idx(1, 1)); // the main block

    // This frame is *warm*, so the main block's tiles appear in it only because
    // the accent band is part of the per-tile cache key.
    const ops = capture(me);
    expect(pieceFillColour(ops, 1, 1)).toBe(COL_MAIN);
    expect(rectsInTile(ops, 1, 1).some((o) => o.colour === COL_ROUTE)).toBe(true);
    // ...and it has left the block that just moved, which is drawn ordinarily
    // at its new home.
    const [tox, toy] = [first.to % W, Math.floor(first.to / W)];
    expect(pieceFillColour(ops, tox, toy)).toBe(COL_BLOCK);
    expect(rectsInTile(ops, tox, toy).some((o) => o.colour === COL_ROUTE)).toBe(false);
  });

  it("matches its snapshot", () => {
    expect(capture(withRoute().me)).toMatchSnapshot();
  });
});

// --- the completion flash ----------------------------------------------

describe("slide completion flash", () => {
  /** Finish the board, then advance the clock into the flash by `t` seconds. */
  function flashAt(t: number): readonly DrawOp[] {
    const me = newBoard();
    me.playMoves([NUDGE, WIN]);
    me.timer(t);
    return capture(me);
  }

  it("recolours the floor while flashing, and moves between phases", () => {
    // FLASH_INTERVAL is 0.1s and the flash alternates high/low each interval,
    // so 0.05s and 0.15s are different phases. Asserting *two* phases is what
    // proves the animation is moving; a snapshot alone would not (playbook
    // §3.2, the Crossing `bool flash` case).
    const early = flashAt(0.05);
    const late = flashAt(0.15);

    // A plain floor square is painted with the flash colour, not the
    // background, and with the opposite one half an interval later.
    const earlyFloor = rectsInTile(early, 1, 3).find((o) => o.w === TS);
    const lateFloor = rectsInTile(late, 1, 3).find((o) => o.w === TS);
    expect(earlyFloor?.colour).not.toBe(COL_BACKGROUND);
    expect(lateFloor?.colour).not.toBe(COL_BACKGROUND);
    expect(earlyFloor?.colour).not.toBe(lateFloor?.colour);
    expect([COL_HIGHLIGHT, COL_LOWLIGHT]).toContain(earlyFloor?.colour);
    expect([COL_HIGHLIGHT, COL_LOWLIGHT]).toContain(lateFloor?.colour);
  });

  it("returns to the ordinary palette once the flash has run out", () => {
    const me = newBoard();
    me.playMoves([NUDGE, WIN]);
    me.timer(60); // far past FLASH_TIME
    const ops = capture(me);
    expect(rectsInTile(ops, 1, 3).find((o) => o.w === TS)?.colour).toBe(COL_BACKGROUND);
  });

  it("matches its snapshot", () => {
    expect(flashAt(0.05)).toMatchSnapshot();
  });
});
