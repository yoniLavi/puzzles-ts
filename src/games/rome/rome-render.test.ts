/**
 * Rome rendering tests (tier 2 / 2.5): targeted draw-op assertions plus
 * snapshots of whole frames, driven either through a real `Midend`
 * (`renderScenario`) or by calling `redraw` directly where the frame depends
 * on `Ui` state a scenario cannot set (an in-flight drag, the keyboard mode).
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/midend.ts";
import { newCursor } from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { newRomeDesc } from "./generator.ts";
import { romeGame } from "./index.ts";
import {
  BORDER,
  COL_ARROW_ENTRY,
  COL_ARROW_ERROR,
  COL_ARROW_FIXED,
  COL_ARROW_GUESS,
  COL_ARROW_PENCIL,
  COL_BORDER,
  COL_ERRORBG,
  COL_GOAL,
  COL_GOALBG,
  COL_HIGHLIGHT,
  COL_LOWLIGHT,
  computeSize,
  newDrawState,
  PREFERRED_TILE_SIZE,
  type RomeDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import { romeSolve, validateGame } from "./solver.ts";
import {
  DIFF_EASY,
  DIFFCOUNT,
  EMPTY,
  FM_ARROWMASK,
  FM_DOWN,
  FM_LEFT,
  FM_RIGHT,
  FM_UP,
  KEYMODE_PENCIL,
  KEYMODE_PLACE,
  MOUSEMODE_PLACE,
  type RomeMove,
  type RomeParams,
  type RomeState,
  type RomeUi,
  readDesc,
  STATUS_COMPLETE,
  STATUS_INCOMPLETE,
} from "./state.ts";

const TS = PREFERRED_TILE_SIZE;
const PALETTE = romeGame.colors([0.827, 0.827, 0.827]);
/** A fixed board used by most frames — 6x6 Easy, one seed. */
const RENDER_ID = "6x6de#rome-render";

function board(w: number, h: number, desc: string): RomeState {
  const { board: b } = readDesc({ w, h, diff: DIFF_EASY }, desc);
  validateGame(b, true);
  return b;
}

function newUi(): RomeUi {
  return romeGame.newUi({} as RomeState);
}

/** Render one frame directly, so a test can set `Ui` fields a scenario can't. */
function frame(
  state: RomeState,
  ui: RomeUi,
  flashTime = 0,
): { dr: RecordingDrawing; ds: RomeDrawState } {
  const ds = newDrawState(state);
  setTileSize(ds, TS);
  const dr = new RecordingDrawing(PALETTE);
  redraw(dr, ds, null, state, 1, ui, 0, flashTime);
  return { dr, ds };
}

const ALL_WALLS_3 = "12";

// --- geometry ---------------------------------------------------------------

describe("geometry", () => {
  it("uses the NARROW_BORDERS arm, compensating for the outer outline", () => {
    // BORDER = GRIDEXTRA*2 = 2, and computeSize subtracts GRIDEXTRA*2 back off
    // because that outline is drawn inside the border area — not the desktop
    // `tileSize / 2` (docs/games/rendering.md § "The tile cache and the diff key").
    expect(BORDER).toBe(2);
    expect(computeSize({ w: 6, h: 6, diff: 0 }, 40)).toEqual({ w: 242, h: 242 });
  });
});

// --- the grid is negative space ---------------------------------------------

describe("region outlines", () => {
  /** The background rect of the top-left square, whose inset encodes which of
   * its sides border another region. */
  function topLeftTile(desc: string): { w: number; h: number } {
    const { dr } = frame(board(3, 3, desc), newUi());
    const rect = dr.ops.find(
      (o) => o.op === "rect" && o.x === BORDER + 1 && o.y === BORDER + 1,
    );
    if (!rect || rect.op !== "rect") throw new Error("no top-left tile rect");
    return { w: rect.w, h: rect.h };
  }

  it("insets a square's fill on each side that meets a different region", () => {
    // Nothing draws a grid line: each square's rect is inset, and what shows
    // through the COL_BORDER flood is the outline. So a square whose right
    // neighbor shares its region draws *wider* than one whose doesn't.
    const merged = topLeftTile("a11,i"); // squares 0 and 1 share a region
    const separate = topLeftTile(`${ALL_WALLS_3},i`); // every square alone
    expect(merged.w).toBeGreaterThan(separate.w);
    // Vertically both are boundaries, so the heights agree.
    expect(merged.h).toBe(separate.h);
  });

  it("floods the grid color once, on the first frame only", () => {
    const state = board(3, 3, `${ALL_WALLS_3},i`);
    const ds = newDrawState(state);
    setTileSize(ds, TS);

    const first = new RecordingDrawing(PALETTE);
    redraw(first, ds, null, state, 1, newUi(), 0, 0);
    expect(first.ops.some((o) => o.op === "rect" && o.color === COL_BORDER)).toBe(true);

    // A second redraw of an unchanged board repaints nothing at all.
    const second = new RecordingDrawing(PALETTE);
    redraw(second, ds, null, state, 1, newUi(), 0, 0);
    expect(second.ops).toHaveLength(0);
  });
});

// --- content ----------------------------------------------------------------

describe("board contents", () => {
  it("draws the opening frame: fixed arrows, a goal circle, stable snapshot", () => {
    const result = renderScenario({ game: romeGame, id: RENDER_ID });
    const { ops } = result.recording;
    expect(ops.some((o) => o.op === "line" && o.color === COL_ARROW_FIXED)).toBe(true);
    expect(ops.some((o) => o.op === "circle" && o.fill === COL_GOAL)).toBe(true);
    expect(ops).toMatchSnapshot();
  });

  it("draws a player's own arrow in the guess color, not the clue color", () => {
    const state = board(3, 3, `${ALL_WALLS_3},i`);
    const placed = romeGame.executeMove(state, {
      kind: "place",
      x: 1,
      y: 1,
      dir: FM_UP,
    });
    const { dr } = frame(placed, newUi());
    expect(dr.ops.some((o) => o.op === "line" && o.color === COL_ARROW_GUESS)).toBe(
      true,
    );
  });

  it("reds a duplicated arrow the player placed, but not the clue it repeats", () => {
    // Squares 0 and 1 share a region; 0 is a fixed down-arrow clue and the
    // player adds a second one at 1. Upstream's color precedence puts
    // `FM_FIXED` ahead of `FE_DOUBLE`, so a clue never turns red however
    // wrong the region becomes — only the arrow the player can actually fix.
    const state = romeGame.executeMove(board(3, 3, "a11,Dh"), {
      kind: "place",
      x: 1,
      y: 0,
      dir: FM_DOWN,
    });
    const { dr } = frame(state, newUi());
    const red = dr.ops.filter((o) => o.op === "line" && o.color === COL_ARROW_ERROR);
    // One arrow's worth of strokes: a shaft plus two head lines.
    expect(red).toHaveLength(3);
    expect(dr.ops.some((o) => o.op === "line" && o.color === COL_ARROW_FIXED)).toBe(
      true,
    );
  });

  it("reddens the background of an arrow that leaves the grid", () => {
    const { dr } = frame(board(3, 3, `${ALL_WALLS_3},bRf`), newUi());
    expect(dr.ops.some((o) => o.op === "rect" && o.color === COL_ERRORBG)).toBe(true);
  });

  it("draws pencil marks as small arrows in the four quadrants", () => {
    let state = board(3, 3, `${ALL_WALLS_3},i`);
    state = romeGame.executeMove(state, { kind: "pencil", x: 1, y: 1, dir: FM_UP });
    state = romeGame.executeMove(state, { kind: "pencil", x: 1, y: 1, dir: FM_RIGHT });
    const { dr } = frame(state, newUi());
    const pencilLines = dr.ops.filter(
      (o) => o.op === "line" && o.color === COL_ARROW_PENCIL,
    );
    // Two marks × (one shaft + two head strokes).
    expect(pencilLines).toHaveLength(6);
  });

  it("hides pencil marks once the square holds an arrow", () => {
    let state = board(3, 3, `${ALL_WALLS_3},i`);
    state = romeGame.executeMove(state, { kind: "pencil", x: 1, y: 1, dir: FM_UP });
    state = romeGame.executeMove(state, { kind: "place", x: 1, y: 1, dir: FM_LEFT });
    const { dr } = frame(state, newUi());
    expect(dr.ops.some((o) => o.op === "line" && o.color === COL_ARROW_PENCIL)).toBe(
      false,
    );
  });
});

// --- highlight preferences --------------------------------------------------

describe("highlight preferences", () => {
  it("tints the squares that reach a goal, and only while the pref is on", () => {
    // Goal at 4, an arrow at 1 pointing down into it.
    const state = board(3, 3, `${ALL_WALLS_3},aDbXd`);
    const goalBg = (sgoals: boolean): boolean =>
      frame(state, { ...newUi(), sgoals }).dr.ops.some(
        (o) => o.op === "rect" && o.color === COL_GOALBG,
      );
    expect(goalBg(true)).toBe(true);
    expect(goalBg(false)).toBe(false);
  });

  it("tints loop squares only when the loop pref is turned on", () => {
    const state = board(3, 3, `${ALL_WALLS_3},RDaULd`);
    const loopBg = (sloops: boolean): number =>
      frame(state, { ...newUi(), sloops }).dr.ops.filter(
        (o) => o.op === "rect" && o.color === COL_ERRORBG,
      ).length;
    // Four looping squares light up; with the pref off (upstream's default)
    // none do, since no arrow here leaves the grid.
    expect(loopBg(true)).toBe(4);
    expect(loopBg(false)).toBe(0);
  });
});

// --- cursor and drag --------------------------------------------------------

describe("cursor and drag", () => {
  it("distinguishes the armed-to-place cursor from the armed-to-pencil one", () => {
    const state = board(3, 3, `${ALL_WALLS_3},i`);
    const place = frame(state, {
      ...newUi(),
      cursor: newCursor(1, 1, true),
      kmode: KEYMODE_PLACE,
    }).dr;
    const pencil = frame(state, {
      ...newUi(),
      cursor: newCursor(1, 1, true),
      kmode: KEYMODE_PENCIL,
    }).dr;
    expect(place.ops.some((o) => o.op === "rect" && o.color === COL_HIGHLIGHT)).toBe(
      true,
    );
    expect(pencil.ops.some((o) => o.op === "rect" && o.color === COL_LOWLIGHT)).toBe(
      true,
    );
    // Pencil mode additionally shows a '?' prompt in the cursor square.
    expect(pencil.ops.some((o) => o.op === "text" && o.text === "?")).toBe(true);
  });

  it("previews the direction an in-flight drag currently points at", () => {
    const state = board(3, 3, `${ALL_WALLS_3},i`);
    const ui: RomeUi = {
      ...newUi(),
      cursor: newCursor(1, 1),
      mmode: MOUSEMODE_PLACE,
      mdir: FM_DOWN,
    };
    const { dr } = frame(state, ui);
    expect(dr.ops.some((o) => o.op === "line" && o.color === COL_ARROW_ENTRY)).toBe(
      true,
    );
  });

  it("marks a grabbed square that has no direction yet with a dot", () => {
    const state = board(3, 3, `${ALL_WALLS_3},i`);
    const ui: RomeUi = {
      ...newUi(),
      cursor: newCursor(1, 1),
      mmode: MOUSEMODE_PLACE,
      mdir: EMPTY,
    };
    const { dr } = frame(state, ui);
    expect(
      dr.ops.some(
        (o) => o.op === "rect" && o.color === COL_ARROW_ENTRY && o.w === 4 && o.h === 4,
      ),
    ).toBe(true);
  });
});

// --- completion flash -------------------------------------------------------

describe("completion flash", () => {
  it("cycles three phases, so consecutive frames differ", () => {
    const state = board(3, 3, `${ALL_WALLS_3},i`);
    // Phase index is `floor(flashTime / 0.1) % 3`, so 0.65 and 0.55 are
    // different beats — a snapshot alone would not show the animation moving.
    const phase = (flashTime: number): string =>
      JSON.stringify(
        frame(state, newUi(), flashTime).dr.ops.filter((o) => o.op === "rect"),
      );
    expect(phase(0.65)).not.toBe(phase(0.55));
    const flashing = frame(state, newUi(), 0.65).dr;
    expect(flashing.ops.some((o) => o.op === "rect" && o.color === COL_HIGHLIGHT)).toBe(
      true,
    );
    expect(flashing.ops.some((o) => o.op === "rect" && o.color === COL_LOWLIGHT)).toBe(
      true,
    );
  });

  it("hides the keyboard cursor while the board celebrates", () => {
    const state = board(3, 3, `${ALL_WALLS_3},i`);
    const ui: RomeUi = {
      ...newUi(),
      cursor: newCursor(1, 1, true),
      kmode: KEYMODE_PENCIL,
    };
    expect(frame(state, ui, 0.65).dr.ops.some((o) => o.op === "text")).toBe(false);
  });
});

// --- mistake overlay --------------------------------------------------------

describe("mistake overlay", () => {
  it("highlights a mistake even when the square was already drawn", () => {
    // Regression guard for docs/games/rendering.md § "Overlay sidecars": the overlay isn't part of the tile
    // value, so it must be in the diff cache key. Check & Save runs a frame
    // *after* the move that drew the square, so a cold first frame proves
    // nothing — this asserts the highlight appears on the SECOND paint, and
    // disappears again on a third once the overlay is cleared.
    const { desc, index, wrong } = legalLookingMistake();
    const me = new Midend(romeGame);
    expect(me.newGameFromId(`6x6de:${desc}`)).toBeUndefined();
    const move: RomeMove = {
      kind: "place",
      x: index % 6,
      y: Math.floor(index / 6),
      dir: wrong,
    };
    me.playMoves([move]);

    const first = new RecordingDrawing(PALETTE);
    me.redraw(first);
    const errorOutline = (r: RecordingDrawing): boolean =>
      r.ops.some((o) => o.op === "line" && o.color === COL_ARROW_ERROR);
    // No rule is broken yet, so nothing is red on the first paint.
    expect(errorOutline(first)).toBe(false);

    expect(me.findMistakes()).toBe(1);
    const second = new RecordingDrawing(PALETTE);
    me.redraw(second);
    expect(errorOutline(second)).toBe(true);

    // The overlay is ephemeral: the next move clears it, and the square
    // repaints without the ring.
    me.playMoves([{ ...move, dir: null }]);
    const third = new RecordingDrawing(PALETTE);
    me.redraw(third);
    expect(errorOutline(third)).toBe(false);
  });
});

/**
 * A fixed-seed scan for a 6x6 board with a square where a wrong arrow can be
 * placed that breaks no rule — the case only the re-solve layer of
 * `findMistakes` can catch.
 */
function legalLookingMistake(): {
  desc: string;
  index: number;
  wrong: 4 | 8 | 16 | 32;
} {
  const p: RomeParams = { w: 6, h: 6, diff: DIFF_EASY };
  for (let seed = 0; seed < 40; seed++) {
    const { desc } = newRomeDesc(p, randomNew(`rome-render-mistake-${seed}`));
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
        return { desc, index: i, wrong };
      }
    }
  }
  throw new Error("no legal-looking wrong placement found");
}
