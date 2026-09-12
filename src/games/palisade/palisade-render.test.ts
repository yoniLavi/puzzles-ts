// Tier-2 render-ops: drive Palisade's `redraw` against a recording
// `GameDrawing` double — first-draw grid dots, per-edge colors, the
// live error reddening for a wrong-sized region, the findMistakes
// overlay edge, the clue text, and the cursor outline.
import { describe, expect, it } from "vitest";
import { BORDER } from "../../engine/border-grid.ts";
import type { HintStep } from "../../engine/game.ts";
import { newCursor } from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { opsOfKind, RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import { palisadeGame } from "./index.ts";
import {
  COL_CORRECT,
  COL_CURSOR,
  COL_ERROR,
  COL_GRID,
  COL_HINT,
  COL_HINT_CELL,
  COL_LINE_MAYBE,
  newDrawState,
  type PalisadeDrawState,
  redraw,
} from "./render.ts";
import { newDesc, solveToBorders } from "./solver.ts";
import {
  newState,
  type PalisadeHint,
  type PalisadeMove,
  type PalisadeState,
  type PalisadeUi,
} from "./state.ts";

const PALETTE = palisadeGame.colors(DEFAULT_BACKGROUND);

function recordingDrawing(): { dr: RecordingDrawing; ops: RecordingDrawing["ops"] } {
  const dr = new RecordingDrawing(PALETTE);
  return { dr, ops: dr.ops };
}

const TS = 48;
const P = { w: 5, h: 5, k: 5 };

function freshUi(): PalisadeUi {
  return { cursor: newCursor(1, 1) };
}

function freshDs(state: PalisadeState): PalisadeDrawState {
  const ds = newDrawState(state);
  ds.tileSize = TS;
  return ds;
}

function makeState(): PalisadeState {
  return newState(P, newDesc(P, randomNew("palisade-render")).desc);
}

describe("Palisade redraw", () => {
  it("draws clue text and unknown edges in line-maybe on first draw", () => {
    const state = makeState();
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 0, freshUi(), 0, 0);

    // Some clue digit was rendered.
    expect(ops.some((o) => o.op === "text" && /^[0-4]$/.test(o.text ?? ""))).toBe(true);
    // Interior unknown edges are line-maybe colored.
    expect(ops.some((o) => o.op === "rect" && o.color === COL_LINE_MAYBE)).toBe(true);
    // First-draw grid dots are COL_GRID.
    expect(ops.some((o) => o.op === "rect" && o.color === COL_GRID)).toBe(true);
  });

  it("reddens the walls of an undersized region", () => {
    const state = makeState();
    const s = { ...state, borders: state.borders.slice() };
    // Enclose cell (1,1) entirely → a size-1 region (too small) ⇒ error.
    const i = 1 * P.w + 1;
    s.borders[i] |= BORDER(0) | BORDER(1) | BORDER(2) | BORDER(3);
    s.borders[i - P.w] |= BORDER(2); // neighbor up shares the wall
    s.borders[i + 1] |= BORDER(3);
    s.borders[i + P.w] |= BORDER(0);
    s.borders[i - 1] |= BORDER(1);

    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(s), null, s, 0, freshUi(), 0, 0);
    expect(ops.some((o) => o.op === "rect" && o.color === COL_ERROR)).toBe(true);
  });

  it("shades completed correct regions, but not the untouched board", () => {
    const state = makeState();

    // Untouched board: one big undivided region ⇒ no correct shade.
    {
      const { dr, ops } = recordingDrawing();
      redraw(dr, freshDs(state), null, state, 0, freshUi(), 0, 0);
      expect(ops.some((o) => o.op === "rect" && o.color === COL_CORRECT)).toBe(false);
    }

    // The unique solution: every region is size k with satisfied clues and no
    // interior wall ⇒ all regions shade COL_CORRECT.
    const sol = solveToBorders(P, state.clues);
    expect(sol).not.toBeNull();
    if (!sol) return;
    const solved = { ...state, borders: sol.slice() };
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(solved), null, solved, 0, freshUi(), 0, 0);
    expect(ops.some((o) => o.op === "rect" && o.color === COL_CORRECT)).toBe(true);
  });

  it("reddens a findMistakes overlay edge", () => {
    const state = makeState();
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 0, freshUi(), 0, 0, undefined, [
      { x: 1, y: 1, dir: 1 },
    ]);
    expect(ops.some((o) => o.op === "rect" && o.color === COL_ERROR)).toBe(true);
  });

  it("paints every forced edge of the firing in COL_HINT, plus the shaded cells", () => {
    const state = makeState();
    const hint: HintStep<PalisadeMove, PalisadeHint> = {
      move: { type: "edges", edits: [] },
      explanation: "test",
      highlights: {
        x: 1,
        y: 1,
        dir: 1,
        kind: "nowall",
        cells: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
        edges: [{ x: 1, y: 1, dir: 2 }],
      },
    };
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 0, freshUi(), 0, 0, hint);
    // The action edge AND its sibling both paint COL_HINT (they share a
    // fate, so they share a color); referenced cells get a COL_HINT_CELL
    // outline. Each edge paints on both of its cells, so a bare count cannot
    // tell one edge from two: compare against the action edge alone.
    const hintRects = (o: RecordingDrawing["ops"]) =>
      opsOfKind(o, "rect").filter((op) => op.color === COL_HINT).length;
    const alone = recordingDrawing();
    redraw(alone.dr, freshDs(state), null, state, 0, freshUi(), 0, 0, {
      ...hint,
      highlights: { x: 1, y: 1, dir: 1, kind: "nowall" },
    });
    expect(hintRects(alone.ops)).toBeGreaterThan(0);
    expect(hintRects(ops)).toBeGreaterThan(hintRects(alone.ops));
    expect(ops.some((o) => o.op === "rect" && o.color === COL_HINT_CELL)).toBe(true);

    // With no hint, none of the hint colors appear.
    const { dr: dr2, ops: ops2 } = recordingDrawing();
    redraw(dr2, freshDs(state), null, state, 0, freshUi(), 0, 0);
    expect(
      ops2.some(
        (o) => "color" in o && (o.color === COL_HINT || o.color === COL_HINT_CELL),
      ),
    ).toBe(false);
  });

  it("draws the cursor outline when shown", () => {
    const state = makeState();
    const ui = freshUi();
    ui.cursor.visible = true;
    ui.cursor.x = 1;
    ui.cursor.y = 2; // a left-border position
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 0, ui, 0, 0);
    expect(ops.some((o) => o.op === "line" && o.color === COL_CURSOR)).toBe(true);
  });
});
