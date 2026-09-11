import { describe, expect, it } from "vitest";
import { type GameDrawing, Midend, UI_UPDATE } from "../../engine/index.ts";
import { randomNew } from "../../engine/random/index.ts";
import { sizedDrawState } from "../../engine/testing/sized-draw-state.ts";
import { type ChangeNotification, PuzzleButton } from "../../engine/types.ts";
import { type FlipParams, type FlipState, flipGame } from "./index.ts";

/** Recording fake of the full `GameDrawing` surface. */
function recordingDrawing() {
  const ops: Array<{ op: string; color?: number }> = [];
  const rec = (op: string, color?: number) => ops.push({ op, color });
  const dr: GameDrawing = {
    startDraw: () => rec("startDraw"),
    endDraw: () => rec("endDraw"),
    drawUpdate: () => rec("drawUpdate"),
    clip: () => rec("clip"),
    unclip: () => rec("unclip"),
    drawRect: (_r, c) => rec("drawRect", c),
    drawLine: (_a, _b, c) => rec("drawLine", c),
    drawPolygon: (_p, f) => rec("drawPolygon", f),
    drawCircle: (_p, _r, f) => rec("drawCircle", f),
    drawText: (_p, _o, c) => rec("drawText", c),
    blitterNew: () => ({}),
    blitterFree: () => rec("blitterFree"),
    blitterSave: () => rec("blitterSave"),
    blitterLoad: () => rec("blitterLoad"),
  };
  return { dr, ops };
}

const COL_GRID = 3;
const COL_HINT = 5;

// `solve` is optional on the `Game` interface; Flip always has one.
const solveFlip = flipGame.solve as NonNullable<typeof flipGame.solve>;

const PRESETS: FlipParams[] = [
  { w: 3, h: 3, matrixType: "crosses" },
  { w: 4, h: 4, matrixType: "crosses" },
  { w: 5, h: 5, matrixType: "crosses" },
  { w: 3, h: 3, matrixType: "random" },
  { w: 4, h: 4, matrixType: "random" },
  { w: 5, h: 5, matrixType: "random" },
];

function hasDuplicateRows(m: Uint8Array, wh: number): boolean {
  for (let i = 0; i < wh; i++) {
    for (let j = i + 1; j < wh; j++) {
      let same = true;
      for (let c = 0; c < wh; c++) {
        if (m[i * wh + c] !== m[j * wh + c]) {
          same = false;
          break;
        }
      }
      if (same) return true;
    }
  }
  return false;
}

describe("Flip generation", () => {
  for (const p of PRESETS) {
    it(`${p.w}x${p.h} ${p.matrixType}: solvable, non-trivial, no dup rows`, () => {
      const wh = p.w * p.h;
      const rng = randomNew(`flip-${p.w}${p.h}${p.matrixType}`);
      const { desc } = flipGame.newDesc(p, rng);
      expect(flipGame.validateDesc(p, desc)).toBeNull();
      const state = flipGame.newState(p, desc);

      // Non-trivial start: at least one light is on.
      expect([...state.grid].some((g) => g & 1)).toBe(true);
      // No two identical matrix rows (flip.c's acceptance condition).
      expect(hasDuplicateRows(state.matrix, wh)).toBe(false);

      // The solver finds a flip set that turns every light off.
      const result = solveFlip(state, state);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.move.kind).toBe("solve");
      if (result.move.kind !== "solve") return;

      let s: FlipState = state;
      result.move.mask.forEach((bit, idx) => {
        if (bit) {
          s = flipGame.executeMove(s, {
            kind: "flip",
            x: idx % p.w,
            y: (idx / p.w) | 0,
          });
        }
      });
      expect(s.completed).toBe(true);
      expect(flipGame.status(s)).toBe("solved");
    });
  }
});

describe("Flip button codes", () => {
  it("shared button consts still match PuzzleButton", () => {
    // The tests below write button codes as literals; pin them here.
    expect(PuzzleButton.LEFT_BUTTON).toBe(0x0200);
    expect(PuzzleButton.CURSOR_UP).toBe(0x0200 + 9);
    expect(PuzzleButton.CURSOR_DOWN).toBe(0x0200 + 10);
    expect(PuzzleButton.CURSOR_LEFT).toBe(0x0200 + 11);
    expect(PuzzleButton.CURSOR_RIGHT).toBe(0x0200 + 12);
    expect(PuzzleButton.CURSOR_SELECT).toBe(0x0200 + 13);
    expect(PuzzleButton.CURSOR_SELECT2).toBe(0x0200 + 14);
  });
});

describe("Flip solver", () => {
  it("reports no solution for an insoluble position", () => {
    const wh = 4;
    // All-zero matrix: clicking does nothing, but a light is on.
    const state: FlipState = {
      w: 2,
      h: 2,
      matrix: new Uint8Array(wh * wh),
      grid: Uint8Array.from([1, 0, 0, 0]),
      moves: 0,
      completed: false,
      cheated: false,
      hintsActive: false,
    };
    const result = solveFlip(state, state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/No solution/);
  });
});

describe("Flip params", () => {
  it("round-trips and accepts upstream's lenient forms", () => {
    expect(flipGame.decodeParams("5")).toEqual({
      w: 5,
      h: 5,
      matrixType: "crosses",
    });
    expect(flipGame.decodeParams("5x4")).toEqual({
      w: 5,
      h: 4,
      matrixType: "crosses",
    });
    expect(flipGame.decodeParams("5x5r")).toEqual({
      w: 5,
      h: 5,
      matrixType: "random",
    });
    const p: FlipParams = { w: 4, h: 6, matrixType: "random" };
    expect(flipGame.decodeParams(flipGame.encodeParams(p, true))).toEqual(p);
    expect(flipGame.encodeParams(p, false)).toBe("4x6");
    expect(
      flipGame.validateParams({ w: 0, h: 3, matrixType: "crosses" }, true),
    ).toMatch(/greater than zero/);
  });
});

describe("Flip interpretMove", () => {
  const p: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
  const desc = flipGame.newDesc(p, randomNew("flip-im")).desc;
  const tile = flipGame.preferredTileSize ?? 32;
  const border = tile >> 1;
  const at = (cx: number, cy: number) =>
    ({ x: cx * tile + border + 1, y: cy * tile + border + 1 }) as const;

  it("left-click in a cell yields a flip move at that cell", () => {
    const s = flipGame.newState(p, desc);
    const ui = flipGame.newUi(s);
    const m = flipGame.interpretMove(
      s,
      ui,
      sizedDrawState(flipGame, s),
      at(2, 1),
      0x0200,
    );
    expect(m).toEqual({ kind: "flip", x: 2, y: 1 });
    expect(ui.cursor.visible).toBe(false);
  });

  it("left-click outside the grid is a UI update, not a move", () => {
    const s = flipGame.newState(p, desc);
    const ui = flipGame.newUi(s);
    expect(
      flipGame.interpretMove(
        s,
        ui,
        sizedDrawState(flipGame, s),
        { x: 9999, y: 9999 },
        0x0200,
      ),
    ).toBe(UI_UPDATE);
  });

  it("cursor move is a UI update and advances the cursor; select acts", () => {
    const s = flipGame.newState(p, desc);
    const ui = flipGame.newUi(s);
    expect(
      flipGame.interpretMove(
        s,
        ui,
        sizedDrawState(flipGame, s),
        { x: 0, y: 0 },
        0x0200 + 12,
      ),
    ).toBe(UI_UPDATE); // CURSOR_RIGHT
    expect(ui.cursor.x).toBe(1);
    expect(ui.cursor.visible).toBe(true);
    const m = flipGame.interpretMove(
      s,
      ui,
      sizedDrawState(flipGame, s),
      { x: 0, y: 0 },
      0x0200 + 13,
    );
    expect(m).toEqual({ kind: "flip", x: 1, y: 0 }); // CURSOR_SELECT
  });

  it("a cell whose matrix row is empty makes no move (no-effect)", () => {
    const wh = 4;
    const s: FlipState = {
      w: 2,
      h: 2,
      matrix: new Uint8Array(wh * wh), // all zero ⇒ nothing toggles
      grid: new Uint8Array(wh),
      moves: 0,
      completed: false,
      cheated: false,
      hintsActive: false,
    };
    expect(
      flipGame.interpretMove(
        s,
        flipGame.newUi(s),
        sizedDrawState(flipGame, s),
        at(0, 0),
        0x0200,
      ),
    ).toBeNull();
  });

  it("an unhandled button yields null", () => {
    const s = flipGame.newState(p, desc);
    expect(
      flipGame.interpretMove(
        s,
        flipGame.newUi(s),
        sizedDrawState(flipGame, s),
        at(0, 0),
        0x0201,
      ),
    ).toBeNull();
  });
});

describe("Flip executeMove is pure and toggles the matrix row", () => {
  const p: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
  const desc = flipGame.newDesc(p, randomNew("flip-em")).desc;

  it("returns a new state, shares the matrix, never mutates input", () => {
    const from = flipGame.newState(p, desc);
    const gridBefore = from.grid.slice();
    const next = flipGame.executeMove(from, { kind: "flip", x: 1, y: 1 });
    expect(next).not.toBe(from);
    expect(next.matrix).toBe(from.matrix); // shared by reference
    expect(next.grid).not.toBe(from.grid);
    expect([...from.grid]).toEqual([...gridBefore]); // input untouched
    // Clicking (1,1) XORs the matrix row for cell 4 into the grid.
    const wh = 9;
    for (let j = 0; j < wh; j++) {
      const expected = (gridBefore[j] ^ from.matrix[4 * wh + j]) & 1;
      expect(next.grid[j] & 1).toBe(expected);
    }
    expect(next.moves).toBe(from.moves + 1);
  });

  it("a solve move marks the hint bit per the mask and sets cheated", () => {
    const from = flipGame.newState(p, desc);
    const mask = [1, 0, 1, 0, 0, 0, 0, 0, 1];
    const next = flipGame.executeMove(from, { kind: "solve", mask });
    expect(next.cheated).toBe(true);
    expect(next.hintsActive).toBe(true);
    mask.forEach((bit, i) => {
      expect((next.grid[i] >> 1) & 1).toBe(bit);
    });
  });
});

describe("Flip redraw", () => {
  const p: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
  const desc = flipGame.newDesc(p, randomNew("flip-rd")).desc;

  it("draws the grid once, then the per-tile cache suppresses redundant redraws", () => {
    const s = flipGame.newState(p, desc);
    const ui = flipGame.newUi(s);
    const ds = flipGame.newDrawState?.(s);
    if (!ds || !flipGame.redraw) throw new Error("flip has redraw + drawState");
    flipGame.setTileSize?.(ds, flipGame.preferredTileSize ?? 32);

    const a = recordingDrawing();
    flipGame.redraw(a.dr, ds, null, s, 1, ui, 0, 0);
    // (w+1)+(h+1) = 8 grid lines, all COL_GRID, drawn once.
    const gridLines = a.ops.filter((o) => o.op === "drawLine" && o.color === COL_GRID);
    expect(gridLines.length).toBe(8);
    expect(a.ops.some((o) => o.op === "drawRect")).toBe(true);

    // Re-drawing the identical state: grid already started, every tile
    // unchanged ⇒ no new tile/grid ops (the cache that keeps animation
    // from repainting the whole board every frame).
    const b = recordingDrawing();
    flipGame.redraw(b.dr, ds, null, s, 1, ui, 0, 0);
    expect(b.ops.filter((o) => o.op === "drawLine").length).toBe(0);
    expect(b.ops.filter((o) => o.op === "drawRect").length).toBe(0);
  });

  it("renders solver hint outlines when hints are active", () => {
    const base = flipGame.newState(p, desc);
    const hinted = flipGame.executeMove(base, {
      kind: "solve",
      mask: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    });
    const ui = flipGame.newUi(hinted);
    const ds = flipGame.newDrawState?.(hinted);
    if (!ds || !flipGame.redraw) throw new Error("flip has redraw + drawState");
    flipGame.setTileSize?.(ds, flipGame.preferredTileSize ?? 32);
    const a = recordingDrawing();
    flipGame.redraw(a.dr, ds, null, hinted, 1, ui, 0, 0);
    expect(a.ops.some((o) => o.op === "drawLine" && o.color === COL_HINT)).toBe(true);
  });
});

describe("Flip reshape (regression: black canvas when shapes share a tile size)", () => {
  // `Drawing.resize` clears the canvas to opaque black, and a reshape that
  // keeps the tile size gives `setTileSize` nothing to invalidate. So the
  // engine treats `canvasCleared` as the one canvas-invalidation signal, and
  // Flip's `!ds.started` branch repaints the background and grid lines on it.
  it("canvasCleared after a same-tile reshape repaints bg + grid lines", () => {
    const p3: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
    const p5: FlipParams = { w: 5, h: 5, matrixType: "crosses" };
    const TILE = flipGame.preferredTileSize ?? 32;
    const { desc: desc3 } = flipGame.newDesc(p3, randomNew("flip-reshape-3"));
    const { desc: desc5 } = flipGame.newDesc(p5, randomNew("flip-reshape-5"));

    const me = new Midend(flipGame);
    me.setCallbacks(
      () => {},
      () => {},
    );
    // First game (3x3): size + first redraw paints bg + grid + tiles.
    //
    // The slot is the board's own size at tile 48, so `size()` resolves to
    // exactly 48 — and the same is done for the 5x5 below, which is what makes
    // this a *same-tile* reshape. One shared viewport would give the two boards
    // different tiles, and `setTileSize` would then do the invalidating.
    expect(me.newGameFromId(`3x3c:${desc3}`)).toBeUndefined();
    me.size(flipGame.computeSize(p3, TILE));
    const first = recordingDrawing();
    me.redraw(first.dr);
    const firstGridLines = first.ops.filter(
      (o) => o.op === "drawLine" && o.color === COL_GRID,
    ).length;
    expect(firstGridLines).toBeGreaterThan(0); // grid drawn once

    // Switch to 5x5 at the *same* tile size, so `setTileSize` has nothing to
    // change. `newGameFromId` builds a fresh
    // drawstate for the new game; the app's reshape would then call
    // `resizeDrawing` → engine.canvasCleared (we invoke it directly here since
    // this is a midend-level test).
    expect(me.newGameFromId(`5x5c:${desc5}`)).toBeUndefined();
    const reshaped = me.size(flipGame.computeSize(p5, TILE));
    // The claim the test's name makes, asserted rather than assumed: both
    // boards were laid out at the same tile size.
    expect(reshaped).toEqual(flipGame.computeSize(p5, TILE));

    // Before `canvasCleared`, the drawstate must be a *live cache* — otherwise
    // the assertion after it is vacuous. This paint is the one that arms it:
    // `newGameFromId` builds a fresh drawstate, so this first paint of the 5x5
    // board draws the grid whatever `canvasCleared` does. Without it the test
    // passes with `canvasCleared` gutted to a bare `return`.
    const armed = recordingDrawing();
    me.redraw(armed.dr);
    const idle = recordingDrawing();
    me.redraw(idle.dr);
    expect(
      idle.ops.filter((o) => o.op === "drawLine" && o.color === COL_GRID).length,
    ).toBe(0);

    me.canvasCleared(); // app calls this from `resizeDrawing`
    const second = recordingDrawing();
    me.redraw(second.dr);

    // Flip's `!ds.started` branch fired: full-window bg fill +
    // grid lines.
    expect(second.ops.some((o) => o.op === "drawRect" && o.color === 0)).toBe(true);
    const secondGridLines = second.ops.filter(
      (o) => o.op === "drawLine" && o.color === COL_GRID,
    ).length;
    expect(secondGridLines).toBeGreaterThan(0);
  });
});

describe("Flip flash-overlay isolation (regression: wave through every cell)", () => {
  // `Midend.timer` must not advance flashTime while flashLength is 0: Flip's
  // redraw shows the win flash for any positive flashTime, which would sweep
  // a wave through every cell on every animated move. Like upstream's
  // midend.c, the timer resets flashTime when the flash ends or was never armed.
  it("flashTime stays 0 throughout a non-solving move's animation", () => {
    const params: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
    const { desc } = flipGame.newDesc(params, randomNew("flip-flash-iso"));
    const me = new Midend(flipGame);
    me.setCallbacks(
      () => {},
      () => {},
    );
    expect(me.newGameFromId(`3x3c:${desc}`)).toBeUndefined();

    // Click (0,0), which must not solve this seed's board (so flashLength
    // stays 0); if a changed seed ever makes it solve, pick another seed.
    const tile = flipGame.preferredTileSize ?? 32;
    const border = tile >> 1;
    expect(me.processInput(border + 1, border + 1, 0x0200)).toBe(true);
    const state = me as unknown as { history: FlipState[]; pos: number };
    expect(state.history[state.pos].completed).toBe(false);

    // Drive the animation timer through its whole 0.25s; flashTime and
    // flashLength must stay 0 on every tick.
    const internals = me as unknown as {
      flashTime: number;
      flashLength: number;
    };
    for (let t = 0; t < 20; t++) {
      me.timer(0.02);
      expect(internals.flashTime).toBe(0);
      expect(internals.flashLength).toBe(0);
    }
  });

  it("flashTime accumulates only for a solving move", () => {
    // The complement of the test above: the click that solves the board
    // does arm the win flash.
    const params: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
    const { desc } = flipGame.newDesc(params, randomNew("flip-flash-solve"));
    const me = new Midend(flipGame);
    me.setCallbacks(
      () => {},
      () => {},
    );
    expect(me.newGameFromId(`3x3c:${desc}`)).toBeUndefined();

    // Use the solver to find the moves, then play each in turn.
    const initial = flipGame.newState(params, desc);
    const result = solveFlip(initial, initial);
    expect(result.ok).toBe(true);
    if (!result.ok || result.move.kind !== "solve") return;
    const tile = flipGame.preferredTileSize ?? 32;
    const border = tile >> 1;
    const cells: Array<{ x: number; y: number }> = [];
    result.move.mask.forEach((bit, idx) => {
      if (bit) cells.push({ x: idx % params.w, y: (idx / params.w) | 0 });
    });
    expect(cells.length).toBeGreaterThan(0);

    const internals = me as unknown as {
      flashLength: number;
      history: FlipState[];
      pos: number;
    };
    // Play all but the last hinted cell; flashLength stays 0
    // because each move keeps `completed=false`.
    for (let i = 0; i < cells.length - 1; i++) {
      me.processInput(
        cells[i].x * tile + border + 1,
        cells[i].y * tile + border + 1,
        0x0200,
      );
      // Drain the timer between clicks so the next setupAnimation
      // starts from a settled state.
      for (let t = 0; t < 20; t++) me.timer(0.02);
      expect(internals.history[internals.pos].completed).toBe(false);
      expect(internals.flashLength).toBe(0);
    }

    // Final click solves the puzzle ⇒ flashLength must be positive.
    const last = cells[cells.length - 1];
    me.processInput(last.x * tile + border + 1, last.y * tile + border + 1, 0x0200);
    expect(internals.history[internals.pos].completed).toBe(true);
    expect(internals.flashLength).toBeGreaterThan(0);
  });
});

describe("Flip animation/redraw lifecycle (regression: clicks not rendered)", () => {
  it("a click repaints, runs the anim timer, then settles", () => {
    const params: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
    const { desc } = flipGame.newDesc(params, randomNew("flip-anim-seed"));
    let timerActive = false;
    let redraws = 0;
    const me = new Midend(flipGame);
    me.setCallbacks(
      () => {},
      (a) => {
        timerActive = a;
      },
      () => {
        redraws++;
      },
    );
    expect(me.newGameFromId(`3x3c:${desc}`)).toBeUndefined();
    expect(timerActive).toBe(false); // settled, no animation yet
    const afterLoad = redraws;

    const tile = flipGame.preferredTileSize ?? 32;
    const border = tile >> 1;
    // Click cell (0,0): a crosses cell always toggles ⇒ a real move.
    expect(me.processInput(border + 1, border + 1, 0x0200)).toBe(true);
    // An animated move does NOT paint synchronously (a frame-0 paint
    // flickers); it arms the rAF timer instead.
    expect(redraws).toBe(afterLoad);
    expect(timerActive).toBe(true); // ANIM_TIME>0 ⇒ rAF loop requested

    me.timer(0.1); // first timer tick paints the first animation frame
    expect(redraws).toBeGreaterThan(afterLoad);
    expect(timerActive).toBe(true);

    const midAnim = redraws;
    me.timer(0.3); // past ANIM_TIME ⇒ final settle paint, timer released
    expect(redraws).toBeGreaterThan(midAnim);
    expect(timerActive).toBe(false);
  });
});

describe("Flip through the midend", () => {
  it("plays to solved-with-help and round-trips a save", () => {
    const params: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
    const { desc } = flipGame.newDesc(params, randomNew("flip-midend-seed"));
    const initial = flipGame.newState(params, desc);
    const solved = solveFlip(initial, initial);
    expect(solved.ok).toBe(true);
    if (!solved.ok || solved.move.kind !== "solve") return;

    const notes: ChangeNotification[] = [];
    const me = new Midend(flipGame);
    me.setCallbacks(
      (m) => notes.push(m),
      () => {},
    );
    expect(
      me.newGameFromId(`${flipGame.encodeParams(params, false)}:${desc}`),
    ).toBeUndefined();

    // Reveal the solution (a hint move; marks usedSolve), then click
    // the hinted cells via processInput at tile centers.
    expect(me.solve()).toBeUndefined();
    const tile = flipGame.preferredTileSize ?? 32;
    const border = tile >> 1;
    solved.move.mask.forEach((bit, idx) => {
      if (bit) {
        const x = idx % params.w;
        const y = (idx / params.w) | 0;
        me.processInput(
          x * tile + border + 1,
          y * tile + border + 1,
          0x0200, // LEFT_BUTTON
        );
      }
    });

    const last = [...notes].reverse().find((n) => n.type === "game-state-change");
    expect(last && last.type === "game-state-change" && last.status).toBe(
      "solved-with-help",
    );

    const saved = me.saveGame();
    const me2 = new Midend(flipGame);
    me2.setCallbacks(
      () => {},
      () => {},
    );
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).toContain("+");
  });
});
