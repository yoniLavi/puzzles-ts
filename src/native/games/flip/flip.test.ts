import { describe, expect, it } from "vitest";
import { type ChangeNotification, PuzzleButton } from "../../../puzzle/types.ts";
import { type GameDrawing, Midend, UI_UPDATE } from "../../engine/index.ts";
import { randomNew } from "../../random/index.ts";
import { type FlipParams, type FlipState, flipGame } from "./index.ts";

/** Recording fake of the full `GameDrawing` surface. */
function recordingDrawing() {
  const ops: Array<{ op: string; colour?: number }> = [];
  const rec = (op: string, colour?: number) => ops.push({ op, colour });
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
  it("flip's local button consts still match PuzzleButton", () => {
    // Flip mirrors these as plain consts (enum-free import graph); pin
    // the upstream codes so any drift is caught here, not silently.
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
    expect(flipGame.validateParams({ w: 0, h: 3, matrixType: "crosses" }, true))
      .toMatch(/greater than zero/);
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
    const m = flipGame.interpretMove(s, ui, null, at(2, 1), 0x0200);
    expect(m).toEqual({ kind: "flip", x: 2, y: 1 });
    expect(ui.cursorVisible).toBe(false);
  });

  it("left-click outside the grid is a UI update, not a move", () => {
    const s = flipGame.newState(p, desc);
    const ui = flipGame.newUi(s);
    expect(flipGame.interpretMove(s, ui, null, { x: 9999, y: 9999 }, 0x0200))
      .toBe(UI_UPDATE);
  });

  it("cursor move is a UI update and advances the cursor; select acts", () => {
    const s = flipGame.newState(p, desc);
    const ui = flipGame.newUi(s);
    expect(flipGame.interpretMove(s, ui, null, { x: 0, y: 0 }, 0x0200 + 12))
      .toBe(UI_UPDATE); // CURSOR_RIGHT
    expect(ui.cx).toBe(1);
    expect(ui.cursorVisible).toBe(true);
    const m = flipGame.interpretMove(s, ui, null, { x: 0, y: 0 }, 0x0200 + 13);
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
    expect(flipGame.interpretMove(s, flipGame.newUi(s), null, at(0, 0), 0x0200))
      .toBeNull();
  });

  it("an unhandled button yields null", () => {
    const s = flipGame.newState(p, desc);
    expect(flipGame.interpretMove(s, flipGame.newUi(s), null, at(0, 0), 0x0201))
      .toBeNull();
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

/** Build a Midend with Flip loaded onto a known board, sized so the
 * preferred tile size applies. Returns the midend and a "render to
 * recording GameDrawing" helper. */
function flipMidend(p: FlipParams, descSeed: string) {
  const { desc } = flipGame.newDesc(p, randomNew(descSeed));
  const me = new Midend(flipGame);
  me.setCallbacks(
    () => {},
    () => {},
  );
  // newGameFromId needs full params (including matrix-type letter).
  const id = `${flipGame.encodeParams(p, true)}:${desc}`;
  expect(me.newGameFromId(id)).toBeUndefined();
  me.size({ w: 1000, h: 1000 }, true, 1);
  return { me, desc };
}

describe("Flip scene (was: Flip redraw)", () => {
  it("first scene paints the bg + grid lines + tiles; second is a no-op", () => {
    const { me } = flipMidend({ w: 3, h: 3, matrixType: "crosses" }, "flip-rd");

    const a = recordingDrawing();
    me.redraw(a.dr);
    // (w+1)+(h+1) = 8 grid lines, all COL_GRID, drawn once.
    const firstGridLines = a.ops.filter(
      (o) => o.op === "drawLine" && o.colour === COL_GRID,
    );
    expect(firstGridLines.length).toBe(8);
    // The bg rect (palette index 0) appears as the first drawn fill.
    expect(
      a.ops.some((o) => o.op === "drawRect" && o.colour === 0),
    ).toBe(true);

    // Same state, second redraw: the reconciler short-circuits every
    // tile (per-tile memo returns the same node refs; bg/grid are
    // deep-equal). Only the midend's frame brackets remain.
    const b = recordingDrawing();
    me.redraw(b.dr);
    const drawing = b.ops.filter(
      (o) => o.op !== "startDraw" && o.op !== "endDraw",
    );
    expect(drawing).toEqual([]);
  });

  it("renders solver hint outlines when hints are active", () => {
    const { me } = flipMidend({ w: 3, h: 3, matrixType: "crosses" }, "flip-rd");
    // Apply a solve move (sets hint markers + hintsActive) by going
    // through Midend.solve which marks the position and applies the
    // hint move.
    expect(me.solve()).toBeUndefined();
    const a = recordingDrawing();
    me.redraw(a.dr);
    expect(a.ops.some((o) => o.op === "drawLine" && o.colour === COL_HINT))
      .toBe(true);
  });

  it("a per-tile change repaints only that tile (clip stays narrow)", () => {
    const p: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
    const { me } = flipMidend(p, "flip-narrow-clip");

    // Paint the initial frame so memo is populated.
    const a = recordingDrawing();
    me.redraw(a.dr);
    expect(a.ops.length).toBeGreaterThan(0);

    // Move the keyboard cursor: a UI_UPDATE that doesn't push a move
    // but changes one tile's appearance (cursor highlight). Pick
    // cursor-right so the cursor lands on (1,0). Mirror previous
    // tile (0,0) gets uncursored.
    me.processInput(0, 0, 0x0200 + 12); // CURSOR_RIGHT
    me.processInput(0, 0, 0x0200 + 9); // CURSOR_UP (cursor visible at 1,0)

    // Repaint. Only the tiles whose cursor state changed should
    // produce clip+draws. There are at most 2 affected tiles (the
    // one losing the cursor and the one gaining it), so we should
    // see at most a small number of clip ops — definitely fewer than
    // the 9 a wholesale repaint would emit.
    const b = recordingDrawing();
    me.redraw(b.dr);
    const tileClips = b.ops.filter((o) => o.op === "clip");
    expect(tileClips.length).toBeLessThanOrEqual(2);
    expect(tileClips.length).toBeGreaterThanOrEqual(1);
  });

  it("returns the same tile node reference across frames when its visible state is unchanged", () => {
    const p: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
    const { me } = flipMidend(p, "flip-ref-eq");
    // Drive one redraw to populate the memo cache.
    me.redraw(recordingDrawing().dr);

    // Call scene() twice in a row with the same midend state — the
    // returned scene's tile group at each position must be the same
    // JS object reference across the two invocations.
    // (Scene is purposefully pure of any external state mutation, so
    // calling it directly through the game is safe.)
    const internals = me as unknown as {
      state: FlipState;
      ui: { cx: number; cy: number; cursorVisible: boolean };
      drawState: import("./index.ts").FlipDrawState;
    };
    if (!flipGame.scene) throw new Error("flip should define scene");
    const s1 = flipGame.scene(
      internals.state,
      internals.ui,
      internals.drawState,
      0,
      0,
      null,
      1,
    );
    const s2 = flipGame.scene(
      internals.state,
      internals.ui,
      internals.drawState,
      0,
      0,
      null,
      1,
    );
    // Compare every tile-* group by reference.
    for (let i = 0; i < s1.length; i++) {
      if (s1[i].id.startsWith("tile-")) {
        expect(s2[i]).toBe(s1[i]);
      }
    }
  });
});

describe("Flip reshape (regression: black canvas when shapes share a tile size)", () => {
  // The bug owner reported: switching to a new board shape rendered
  // full black until the first click. Root cause (imperative-redraw
  // era): same-tile-size reshape was a no-op for setTileSize, so the
  // next redraw skipped the grid lines + border and the canvas stayed
  // mostly black. The scene-graph era structurally avoids this — there
  // is no per-tile pixel cache and no `!ds.started` branch; the
  // framework reconciles the new scene against null (after
  // canvasCleared resets `lastScene`) and paints everything.
  it("canvasCleared after a same-tile reshape repaints bg + grid lines", () => {
    const p3: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
    const p5: FlipParams = { w: 5, h: 5, matrixType: "crosses" };
    const { desc: desc3 } = flipGame.newDesc(p3, randomNew("flip-reshape-3"));
    const { desc: desc5 } = flipGame.newDesc(p5, randomNew("flip-reshape-5"));

    const me = new Midend(flipGame);
    me.setCallbacks(
      () => {},
      () => {},
    );
    // First game (3x3): size + first redraw paints bg + grid + tiles.
    expect(me.newGameFromId(`3x3c:${desc3}`)).toBeUndefined();
    me.size({ w: 1000, h: 1000 }, true, 1);
    const first = recordingDrawing();
    me.redraw(first.dr);
    const firstGridLines = first.ops.filter(
      (o) => o.op === "drawLine" && o.colour === COL_GRID,
    ).length;
    expect(firstGridLines).toBeGreaterThan(0); // grid drawn once

    // Switch to 5x5 — at typical viewports the tile resolves to 48
    // for both shapes (the bug-1 trigger). `newGameFromId` builds a
    // fresh drawstate for the new game and nulls `lastScene`; the
    // app's reshape would then call `resizeDrawing` →
    // engine.canvasCleared (we invoke it directly here since this is
    // a midend-level test).
    expect(me.newGameFromId(`5x5c:${desc5}`)).toBeUndefined();
    me.size({ w: 1000, h: 1000 }, true, 1);
    me.canvasCleared(); // app calls this from `resizeDrawing`
    const second = recordingDrawing();
    me.redraw(second.dr);

    // The reconciler paints the bg rect + grid lines from scratch
    // because lastScene was null after canvasCleared.
    expect(
      second.ops.some((o) => o.op === "drawRect" && o.colour === 0),
    ).toBe(true);
    const secondGridLines = second.ops.filter(
      (o) => o.op === "drawLine" && o.colour === COL_GRID,
    ).length;
    expect(secondGridLines).toBeGreaterThan(0);
  });
});

describe("Flip flash-overlay isolation (regression: wave through every cell)", () => {
  // The owner reported (2026-05-20) "a wave causing every single
  // cell to briefly switch between white and black before settling
  // back to its original value" on every animated move. Root cause:
  // Midend.timer was incrementing flashTime on every tick during
  // animation, even when flashLength === 0 (non-solving moves).
  // Flip's redraw used to check `flashTime ? Math.floor(... /
  // FLASH_FRAME) : -1` and activated its flash-ring overlay whenever
  // flashTime > 0. The fix (preserved here in the midend) mirrors
  // `midend.c` lines 1429-1432: reset flashTime when the flash is
  // done OR was never armed. This test reaches into midend internals
  // — independent of the redraw vs scene path — so it survives the
  // scene-graph rewrite.
  it("flashTime stays 0 throughout a non-solving move's animation", () => {
    const params: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
    const { desc } = flipGame.newDesc(params, randomNew("flip-flash-iso"));
    const me = new Midend(flipGame);
    me.setCallbacks(
      () => {},
      () => {},
    );
    expect(me.newGameFromId(`3x3c:${desc}`)).toBeUndefined();

    // Pick a cell that does NOT solve the puzzle. We click (0,0)
    // and verify the state is still ongoing — the specific seed
    // shouldn't matter for a 3x3 Crosses where a single click
    // rarely solves it.
    const tile = flipGame.preferredTileSize ?? 32;
    const border = tile >> 1;
    expect(me.processInput(border + 1, border + 1, 0x0200)).toBe(true);
    // Sanity: the click didn't solve (so flashLength should be 0).
    // If it did solve, pick a different seed for this test.
    const state = (me as unknown as { history: FlipState[]; pos: number });
    expect(state.history[state.pos].completed).toBe(false);

    // Drive the animation timer through its whole 0.25s lifecycle.
    // After each tick, midend's flashTime/flashLength must both
    // remain 0 — Flip's scene computes
    // `flashFrame = flashTime ? ... : -1`, so any positive
    // flashTime would activate the flash-ring overlay.
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
    // Solve a 3x3 Crosses puzzle to completion, then verify the
    // final solving click activates flashLength > 0 — the
    // overlay is *supposed* to fire here (it's the
    // solve-celebration wave). This is the positive case the
    // regression test above is the complement of.
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
    me.processInput(
      last.x * tile + border + 1,
      last.y * tile + border + 1,
      0x0200,
    );
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
    // An animated move does NOT paint synchronously (that frame-0 paint
    // is the flicker we removed); it arms the rAF timer instead.
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
      me.newGameFromId(`${flipGame.encodeParams(params, true)}:${desc}`),
    ).toBeUndefined();

    // Reveal the solution (a hint move; marks usedSolve), then click
    // the hinted cells via processInput at tile centres.
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

    const last = [...notes]
      .reverse()
      .find((n) => n.type === "game-state-change");
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

describe("Flip scene shape (spec scenarios)", () => {
  it("emits one group per tile with id 'tile-x,y' and explicit clip", () => {
    const p: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
    const { me } = flipMidend(p, "flip-shape");
    if (!flipGame.scene) throw new Error("flip should define scene");
    const internals = me as unknown as {
      state: FlipState;
      ui: { cx: number; cy: number; cursorVisible: boolean };
      drawState: import("./index.ts").FlipDrawState;
    };
    const scene = flipGame.scene(
      internals.state,
      internals.ui,
      internals.drawState,
      0,
      0,
      null,
      1,
    );
    const tileGroups = scene.filter((n) => n.id.startsWith("tile-"));
    expect(tileGroups).toHaveLength(p.w * p.h);
    for (const t of tileGroups) {
      expect(t.kind).toBe("group");
      if (t.kind !== "group") return;
      expect(t.clip).toBeDefined();
    }
    // bg + grid present as separate top-level nodes.
    expect(scene.some((n) => n.id === "bg")).toBe(true);
    expect(scene.some((n) => n.id === "grid")).toBe(true);
  });

  it("has no imperative redraw on flipGame", () => {
    // Spec scenario: "Flip has no imperative redraw" — the post-port
    // shape exposes scene, not redraw.
    expect(flipGame.redraw).toBeUndefined();
    expect(flipGame.scene).toBeDefined();
  });
});
