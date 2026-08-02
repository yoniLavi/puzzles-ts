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
 * the cache diff key silently fails to repaint (playbook §3.2). Slide packs
 * every overlay into the one per-tile word, so this is structurally safe — but
 * a cold frame would not prove it.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { LEFT_BUTTON, LEFT_DRAG, LEFT_RELEASE } from "../../engine/pointer.ts";
import type { DrawOp } from "../../engine/testing/recording-drawing.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import type { Colour } from "../../engine/types.ts";
import { slideGame } from "./index.ts";
import {
  COL_BACKGROUND,
  COL_DRAGGING,
  COL_HIGHLIGHT,
  COL_LOWLIGHT,
  COL_MAIN,
  COL_MAIN_DRAGGING,
  COL_MAIN_HIGHLIGHT,
  COL_TARGET,
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
 * recolours to signal "dragging" or "next in the Solve route". Ignores the
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
    // background on the first frame (playbook §3.2 doctrine).
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

    // The main block is blue; the ordinary block beside it is not.
    expect(pieceFillColour(ops, 1, 1)).toBe(COL_MAIN);
    expect(pieceFillColour(ops, 2, 2)).toBe(COL_MAIN);
    expect(pieceFillColour(ops, 3, 1)).toBe(COL_BACKGROUND);

    // Walls are bevelled, and their mitred corners are drawn as polygons.
    expect(
      rectsInTile(ops, 0, 0).some(
        (o) => o.colour === COL_HIGHLIGHT || o.colour === COL_LOWLIGHT,
      ),
    ).toBe(true);
    expect(ops.some((o) => o.op === "polygon")).toBe(true);
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
    // The block is drawn where it will come to rest, in its dragging colour...
    expect(pieceFillColour(ops, 2, 1)).toBe(COL_MAIN_DRAGGING);
    expect(pieceFillColour(ops, 3, 2)).toBe(COL_MAIN_DRAGGING);
    // ...and the square it came from is now empty floor.
    expect(pieceFillColour(ops, 1, 1)).toBeUndefined();
  });

  it("lights up an ordinary block in its own dragging colour", () => {
    const me = newBoard();
    capture(me);
    me.processInput(...at(3, 1), LEFT_BUTTON);
    me.processInput(...at(4, 3), LEFT_DRAG);
    expect(pieceFillColour(capture(me), 4, 3)).toBe(COL_DRAGGING);
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

    // The block the route wants moved is drawn in its highlight colour rather
    // than its usual fill.
    expect(pieceFillColour(plain, fx, fy)).toBe(COL_BACKGROUND);
    expect(pieceFillColour(ops, fx, fy)).toBe(COL_HIGHLIGHT);

    // Its destination — bare floor before — now carries a lowlight shadow of
    // the block, so you can see where it is going.
    expect(rectsInTile(plain, tx, ty).length).toBeLessThan(
      rectsInTile(ops, tx, ty).length,
    );
    expect(rectsInTile(ops, tx, ty).some((o) => o.colour === COL_LOWLIGHT)).toBe(true);
  });

  it("moves the highlight on as the route advances", () => {
    // On an untouched board the main block is drawn plain.
    expect(pieceFillColour(capture(newBoard()), 1, 1)).toBe(COL_MAIN);

    const { me, from } = withRoute();
    expect(from).toBe(idx(3, 1)); // the route starts by moving the singleton
    capture(me); // the frame that paints the route's first highlight
    const stateNow = (): SlideState => (me as unknown as { state: SlideState }).state;

    // Walk the first step. The route now wants the *main* block moved, so its
    // fill takes the highlight — the main block's own highlight, since
    // `draw_tile` derives one from whichever base the block uses.
    const first = stateNow().soln?.[0];
    if (!first) throw new Error("solve installed no route");
    me.playMoves([{ kind: "move", ...first }]);

    const next = stateNow().soln?.[stateNow().solnIndex];
    if (!next) throw new Error("route ended after one step");
    expect(next.from).toBe(idx(1, 1)); // the main block

    // This frame is *warm*, so the main block's tiles appear in it only because
    // the highlight change is part of the per-tile cache key.
    const ops = capture(me);
    expect(pieceFillColour(ops, 1, 1)).toBe(COL_MAIN_HIGHLIGHT);
    // And the block that just moved is drawn ordinarily at its new home.
    expect(pieceFillColour(ops, first.to % W, Math.floor(first.to / W))).toBe(
      COL_BACKGROUND,
    );
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
