/**
 * Tier-1/2 behavioural tests for the Rectangles port: params/desc codecs,
 * input mapping (drag-draw / drag-erase / edge-toggle / no-op suppression),
 * completion, `findMistakes`, and the mistake render overlay.
 */
import { describe, expect, it } from "vitest";
import {
  CURSOR_UP,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { rectGame } from "./index.ts";
import { cloneRectState, executeMove, newState, status } from "./moves.ts";
import { COL_MISTAKE, newDrawState, redraw } from "./render.ts";
import {
  decodeParams,
  encodeNumbers,
  encodeParams,
  type RectParams,
  validateDesc,
  validateParams,
} from "./state.ts";

const P = (over: Partial<RectParams> = {}): RectParams => ({
  w: 7,
  h: 7,
  expandfactor: 0,
  unique: true,
  ...over,
});

const TILE = rectGame.preferredTileSize ?? 24;
const BORDER = 1;
// Pixel coords for a grid point (gx, gy in half-integer/grid units).
const px = (g: number) => g * TILE + BORDER;

describe("rect params codec", () => {
  it("round-trips full params including e/a suffixes", () => {
    for (const p of [
      P(),
      P({ w: 9, h: 7 }),
      P({ unique: false }),
      P({ w: 8, h: 8, expandfactor: Math.fround(0.3) }),
      P({ w: 10, h: 10, expandfactor: Math.fround(0.5), unique: false }),
    ]) {
      const s = encodeParams(p, true);
      expect(decodeParams(s)).toEqual(p);
    }
  });

  it("encodes the expected strings", () => {
    expect(encodeParams(P({ w: 9, h: 7, unique: false }), true)).toBe("9x7a");
    expect(encodeParams(P(), true)).toBe("7x7");
    expect(encodeParams(P({ unique: false }), false)).toBe("7x7"); // non-full drops suffixes
  });

  it("rejects invalid params", () => {
    expect(validateParams(P({ w: 1, h: 1 }), true)).not.toBeNull(); // area < 2
    expect(validateParams(P({ w: 0, h: 5 }), true)).not.toBeNull();
    expect(validateParams(P({ expandfactor: -1 }), true)).not.toBeNull();
    expect(validateParams(P(), true)).toBeNull();
  });
});

describe("rect desc codec", () => {
  it("round-trips a generated desc through newState + re-encode", () => {
    for (const seed of ["1", "2", "3"]) {
      const p = P();
      const { desc } = newDesc(p, randomNew(seed));
      expect(validateDesc(p, desc)).toBeNull();
      const st = newState(p, desc);
      expect(encodeNumbers(st.grid, p.w * p.h)).toBe(desc);
    }
  });

  it("rejects malformed descs", () => {
    const p = P({ w: 3, h: 3 }); // area 9
    expect(validateDesc(p, "i")).toBeNull(); // 9 empties exactly fills
    expect(validateDesc(p, "h")).not.toBeNull(); // 8 < 9
    expect(validateDesc(p, "j")).not.toBeNull(); // 10 > 9
    expect(validateDesc(p, "!")).not.toBeNull(); // bad char
  });
});

describe("rect input → moves", () => {
  it("a click on an edge toggles that edge", () => {
    const p = P();
    // Blank board (all empties) so we can toggle edges freely.
    const st = newState(p, "zw"); // 26+23 = 49 = 7*7
    const ui = rectGame.newUi(st);
    // Grid point (2.5, 3.0) is the horizontal edge on top of cell (2,3).
    const point = { x: px(2.5), y: px(3.0) };
    expect(rectGame.interpretMove(st, ui, null, point, LEFT_BUTTON)).toBeDefined();
    const move = rectGame.interpretMove(st, ui, null, point, LEFT_RELEASE);
    expect(move).toEqual({ type: "edge", edge: "h", x: 2, y: 3 });
    const next = executeMove(st, move as never);
    expect(next.hedge[3 * 7 + 2]).toBe(1);
    // Toggling again clears it.
    expect(executeMove(next, move as never).hedge[3 * 7 + 2]).toBe(0);
  });

  it("a left-drag draws a rectangle outline", () => {
    const p = P();
    const st = newState(p, "zw");
    const ui = rectGame.newUi(st);
    // Drag from grid vertex (2,2) to (4,4) → a 2×2 outline at (2,2).
    rectGame.interpretMove(st, ui, null, { x: px(2), y: px(2) }, LEFT_BUTTON);
    rectGame.interpretMove(st, ui, null, { x: px(4), y: px(4) }, LEFT_DRAG);
    const move = rectGame.interpretMove(
      st,
      ui,
      null,
      { x: px(4), y: px(4) },
      LEFT_RELEASE,
    );
    expect(move).toEqual({ type: "rect", erasing: false, x: 2, y: 2, w: 2, h: 2 });
    const next = executeMove(st, move as never);
    // The four boundary edges of the 2×2 are set.
    expect(next.vedge[2 * 7 + 2]).toBe(1); // left of the box (x=2)
    expect(next.vedge[2 * 7 + 4]).toBe(1); // right of the box (x=4)
    expect(next.hedge[2 * 7 + 2]).toBe(1); // top (y=2)
    expect(next.hedge[4 * 7 + 2]).toBe(1); // bottom (y=4)
  });

  it("a right-drag erases interior edges without drawing an outline", () => {
    const p = P();
    let st = newState(p, "zw");
    // First draw a 2×2 outline via a rect move.
    st = executeMove(st, { type: "rect", erasing: false, x: 2, y: 2, w: 2, h: 2 });
    // Draw an interior wall inside it (vedge at x=3).
    st = executeMove(st, { type: "edge", edge: "v", x: 3, y: 2 });
    expect(st.vedge[2 * 7 + 3]).toBe(1);
    // Right-drag over the box erases interior edges, keeping the outline.
    const ui = rectGame.newUi(st);
    rectGame.interpretMove(st, ui, null, { x: px(2), y: px(2) }, RIGHT_BUTTON);
    rectGame.interpretMove(st, ui, null, { x: px(4), y: px(4) }, LEFT_DRAG);
    const move = rectGame.interpretMove(
      st,
      ui,
      null,
      { x: px(4), y: px(4) },
      RIGHT_RELEASE,
    );
    expect(move).toEqual({ type: "rect", erasing: true, x: 2, y: 2, w: 2, h: 2 });
    const next = executeMove(st, move as never);
    expect(next.vedge[2 * 7 + 3]).toBe(0); // interior erased
    expect(next.vedge[2 * 7 + 2]).toBe(1); // outline kept
  });

  it("a no-op edge toggle on the grid boundary yields no move", () => {
    const p = P();
    const st = newState(p, "zw");
    const ui = rectGame.newUi(st);
    // Clicking a cell centre (no edge/corner) is not an edge toggle.
    const centre = { x: px(3.5), y: px(3.5) };
    rectGame.interpretMove(st, ui, null, centre, LEFT_BUTTON);
    const move = rectGame.interpretMove(st, ui, null, centre, LEFT_RELEASE);
    // A centre click maps to no H/V edge, so no move is produced.
    expect(move === null || (move as { type?: string }).type === undefined).toBe(true);
  });

  it("first arrow press only reveals the cursor", () => {
    const st = newState(P(), "zw");
    const ui = rectGame.newUi(st);
    expect(ui.cursorVisible).toBe(false);
    rectGame.interpretMove(st, ui, null, { x: 0, y: 0 }, CURSOR_UP);
    expect(ui.cursorVisible).toBe(true);
  });
});

describe("rect completion + solve", () => {
  it("solving a generated board reports solved", () => {
    for (const seed of ["1", "7", "20"]) {
      const p = P();
      const { desc, aux } = newDesc(p, randomNew(seed));
      const st = newState(p, desc);
      expect(status(st)).toBe("ongoing");
      const solved = rectGame.solve?.(st, st, aux);
      expect(solved?.ok).toBe(true);
      if (solved?.ok) expect(status(executeMove(st, solved.move))).toBe("solved");
    }
  });

  it("the built-in solver (no aux) also completes the board", () => {
    const p = P();
    const { desc } = newDesc(p, randomNew("5"));
    const st = newState(p, desc);
    const solved = rectGame.solve?.(st, st, undefined);
    expect(solved?.ok).toBe(true);
    if (solved?.ok) expect(status(executeMove(st, solved.move))).toBe("solved");
  });
});

describe("rect findMistakes", () => {
  it("flags a wall the unique solution does not contain", () => {
    const p = P();
    const { desc } = newDesc(p, randomNew("3"));
    let st = newState(p, desc);
    // Find an interior vedge that is NOT in the solution and draw it.
    const solveMove = rectGame.solve?.(st, st, undefined);
    if (!solveMove?.ok) throw new Error("unsolvable");
    const solvedEdges = executeMove(st, solveMove.move);
    let wrong: { x: number; y: number } | null = null;
    for (let y = 0; y < p.h && !wrong; y++)
      for (let x = 1; x < p.w; x++)
        if (!solvedEdges.vedge[y * p.w + x]) {
          wrong = { x, y };
          break;
        }
    expect(wrong).not.toBeNull();
    if (wrong)
      st = executeMove(st, { type: "edge", edge: "v", x: wrong.x, y: wrong.y });
    const mistakes = rectGame.findMistakes?.(st) ?? [];
    expect(mistakes).toContainEqual({ edge: "v", x: wrong?.x, y: wrong?.y });
  });

  it("returns [] on an untouched board", () => {
    const p = P();
    const { desc } = newDesc(p, randomNew("3"));
    expect(rectGame.findMistakes?.(newState(p, desc)) ?? []).toEqual([]);
  });

  it("returns [] on a correctly-solved board", () => {
    const p = P();
    const { desc } = newDesc(p, randomNew("3"));
    const st = newState(p, desc);
    const solveMove = rectGame.solve?.(st, st, undefined);
    if (!solveMove?.ok) throw new Error("unsolvable");
    const solved = executeMove(st, solveMove.move);
    expect(rectGame.findMistakes?.(solved) ?? []).toEqual([]);
  });
});

describe("rect render", () => {
  it("draws the grid and number text on the initial frame", () => {
    const p = P();
    const { desc } = newDesc(p, randomNew("1"));
    const st = newState(p, desc);
    const ds = newDrawState(st);
    ds.tileSize = TILE;
    const dr = new RecordingDrawing(rectGame.colours(DEFAULT_BACKGROUND));
    redraw(dr, ds, null, st, 1, rectGame.newUi(st), 0, 0);
    expect(dr.ops.some((o) => o.op === "rect")).toBe(true);
    expect(dr.ops.some((o) => o.op === "text")).toBe(true);
  });

  it("paints the mistake overlay even on an already-drawn tile", () => {
    const p = P();
    const { desc } = newDesc(p, randomNew("3"));
    let st = newState(p, desc);
    const solveMove = rectGame.solve?.(st, st, undefined);
    if (!solveMove?.ok) throw new Error("unsolvable");
    const solvedEdges = executeMove(st, solveMove.move);
    let wrong: { x: number; y: number } | null = null;
    for (let y = 0; y < p.h && !wrong; y++)
      for (let x = 1; x < p.w; x++)
        if (!solvedEdges.vedge[y * p.w + x]) {
          wrong = { x, y };
          break;
        }
    if (wrong)
      st = executeMove(st, { type: "edge", edge: "v", x: wrong.x, y: wrong.y });

    const ds = newDrawState(st);
    ds.tileSize = TILE;
    const ui = rectGame.newUi(st);
    const palette = rectGame.colours(DEFAULT_BACKGROUND);
    // Warm the drawstate without the overlay, then repaint with it.
    redraw(new RecordingDrawing(palette), ds, null, st, 1, ui, 0, 0);
    const mistakes = rectGame.findMistakes?.(st) ?? [];
    expect(mistakes.length).toBeGreaterThan(0);
    const dr = new RecordingDrawing(palette);
    redraw(dr, ds, null, st, 1, ui, 0, 0, undefined, mistakes);
    expect(dr.ops.some((o) => o.op === "rect" && o.colour === COL_MISTAKE)).toBe(true);

    // A third frame without the overlay clears the red.
    const dr2 = new RecordingDrawing(palette);
    redraw(dr2, ds, null, st, 1, ui, 0, 0);
    expect(dr2.ops.some((o) => o.op === "rect" && o.colour === COL_MISTAKE)).toBe(
      false,
    );
  });

  it("clone is independent of the source state", () => {
    const st = newState(P(), "zw");
    const c = cloneRectState(st);
    c.vedge[0] = 1;
    expect(st.vedge[0]).toBe(0);
  });
});
