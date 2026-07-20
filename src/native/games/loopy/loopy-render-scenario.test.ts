/**
 * Tier-2.5 render scenarios for Loopy: drive a real Midend to a target frame
 * and capture `redraw`.
 *
 * Loopy's renderer has no per-tiling code — every geometric difference comes
 * out of `grid.ts` — so the risk it carries is not "did the hexagon branch get
 * written", it is "does the one branch survive contact with eighteen very
 * different geometries". Hence the sweep: nine tilings, including both
 * aperiodic families, each asserted against the invariants that must hold for
 * *any* tiling (one circle per dot, one line per edge, one digit per clued
 * face, every digit on the canvas). These tilings have never been rendered
 * anywhere before, so this is their first check rather than a regression net.
 *
 * The rest are the state-dependent colourings the sweep's opener frames cannot
 * reach: line state, the faint-line preference, vertex errors, the
 * `exactlyOneLoop` clue rule, and the clue-position cache `setTileSize`
 * invalidates.
 */
import { describe, expect, it } from "vitest";
import { gridFindIncentre } from "../../engine/grid.ts";
import { Midend } from "../../engine/midend.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { type LoopyMove, loopyGame } from "./index.ts";
import { DIFF_EASY, encodeParams, type LoopyParams } from "./params.ts";
import {
  border,
  COL_BACKGROUND,
  COL_FAINT,
  COL_FOREGROUND,
  COL_LINEUNKNOWN,
  COL_MISTAKE,
  computeSize,
  PREFERRED_TILE_SIZE,
} from "./render.ts";
import { LINE_NO, LINE_YES, type LoopyState, newState } from "./state.ts";

/**
 * A fixed board for a tiling. The desc is generated from a fixed seed rather
 * than hardcoded, so it stays a *real* board for its tiling; a generator change
 * re-resolves it and churns the snapshot, which is the healthy signal.
 */
function board(
  name: string,
  type: number,
  w: number,
  h: number,
): { p: LoopyParams; id: string; state: LoopyState } {
  const p: LoopyParams = { w, h, diff: DIFF_EASY, type };
  const { desc } = newDesc(p, randomNew(`loopy-render-${name}`));
  return {
    p,
    id: `${encodeParams(p, true)}:${desc}`,
    state: newState(p, desc),
  };
}

/** Mirror of `render.ts`'s `toScreen` (not exported), so a test can say where
 * a given dot or incentre *should* land rather than only how many landed. */
function screenPos(
  state: LoopyState,
  ts: number,
  gx: number,
  gy: number,
): [number, number] {
  const g = state.grid;
  const b = border(ts);
  return [
    Math.round(((gx - g.lowestX) * ts) / g.tileSize) + b,
    Math.round(((gy - g.lowestY) * ts) / g.tileSize) + b,
  ];
}

const setEdges = (edges: readonly number[], state: 0 | 2): LoopyMove => ({
  kind: "set",
  ops: edges.map((edge) => ({ edge, state })),
});

// The tilings under test. Squares is the baseline; triangular / honeycomb /
// great-hexagonal are the hex family (three quite different vertex degrees);
// dodecagonal brings 12-sided faces and so double-digit clues; and the last
// four are both aperiodic families, whose grids are *described* rather than
// computed and whose faces are the least regular anything here will ever draw.
const TILINGS: readonly [string, number, number, number][] = [
  ["squares", 0, 5, 5],
  ["triangular", 1, 5, 5],
  ["honeycomb", 2, 5, 5],
  ["great-hexagonal", 5, 4, 3],
  ["dodecagonal", 9, 3, 3],
  ["penrose-kite-dart", 11, 6, 6],
  ["penrose-rhombs", 12, 6, 6],
  ["hats", 16, 6, 6],
  ["spectres", 17, 6, 6],
];

describe("Loopy render scenarios: every tiling draws its whole grid", () => {
  for (const [name, type, w, h] of TILINGS) {
    it(name, () => {
      const { id, state } = board(name, type, w, h);
      const g = state.grid;
      const { recording, size } = renderScenario({ game: loopyGame, id });
      const ops = recording.ops;

      // The game paints its own background first; the engine emits no pixels
      // of its own, so a missing opener rect means the board is drawn over
      // whatever was there before (`fix-flip-canvas-reshape`).
      expect(ops[0]).toMatchObject({ op: "rect", x: 0, y: 0, colour: COL_BACKGROUND });

      // Nothing may be dropped or duplicated in the translation from grid to
      // screen: one dot is one circle, one edge is one line. A tiling whose
      // geometry confused the renderer would show up as a count mismatch long
      // before anyone eyeballed the frame.
      const circles = ops.filter((o) => o.op === "circle");
      expect(circles.length).toBe(g.numDots);
      expect(circles.every((o) => o.op === "circle" && o.fill === COL_FOREGROUND)).toBe(
        true,
      );

      const lines = ops.filter((o) => o.op === "line");
      expect(lines.length).toBe(g.numEdges);
      // An untouched board is entirely UNKNOWN, so every line takes that one
      // colour — which also pins that no edge is silently drawn as an error.
      expect(lines.every((o) => o.op === "line" && o.colour === COL_LINEUNKNOWN)).toBe(
        true,
      );

      // Clues are drawn for exactly the clued faces, in face order and with
      // the right digits — the pairing, not just the count, since a tiling
      // whose face list the renderer walked differently would still emit the
      // right *number* of digits.
      const texts = ops.filter((o) => o.op === "text");
      const expected = [...state.clues].filter((c) => c >= 0).map(String);
      expect(texts.map((o) => (o.op === "text" ? o.text : ""))).toEqual(expected);
      expect(expected.length).toBeGreaterThan(0);

      // Every digit lands on the canvas. This is the check that would catch a
      // face incentre computed in the wrong space for an irregular tiling —
      // the failure mode most likely to be unique to hats/spectres/Penrose.
      for (const t of texts) {
        if (t.op !== "text") continue;
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThanOrEqual(size.w);
        expect(t.y).toBeLessThanOrEqual(size.h);
      }

      // And every dot lands where the projection says it should, which pins
      // the geometry itself rather than only its bulk properties.
      const dotKeys = new Set(
        circles.map((o) => (o.op === "circle" ? `${o.cx},${o.cy}` : "")),
      );
      for (const d of g.dots) {
        const [x, y] = screenPos(state, PREFERRED_TILE_SIZE, d.x, d.y);
        expect(dotKeys.has(`${x},${y}`)).toBe(true);
      }

      // The background rect must back everything the game then draws on top
      // of it: the game owns its own pixels, so anything outside it is left
      // showing whatever the canvas held before.
      const bg = ops[0];
      if (bg.op !== "rect") throw new Error("unreachable");
      for (const c of circles) {
        if (c.op !== "circle") continue;
        expect(c.cx + c.r).toBeLessThanOrEqual(bg.w);
        expect(c.cy + c.r).toBeLessThanOrEqual(bg.h);
      }

      expect(ops).toMatchSnapshot();
    });
  }
});

describe("Loopy render scenarios: line state and preferences", () => {
  const SQUARES = () => board("squares", 0, 5, 5);

  it("draws a YES edge black, a NO edge faint and the rest unknown", () => {
    const { id, state } = SQUARES();
    // Two edges far enough apart that neither creates a vertex error, so the
    // frame shows the three plain line colours and nothing else.
    const yesEdge = 0;
    const noEdge = 40;
    const { recording } = renderScenario({
      game: loopyGame,
      id,
      moves: [setEdges([yesEdge], LINE_YES), setEdges([noEdge], LINE_NO)],
    });
    const lines = recording.ops.filter((o) => o.op === "line");
    const byColour = (c: number) =>
      lines.filter((o) => o.op === "line" && o.colour === c);

    expect(byColour(COL_FOREGROUND).length).toBe(1);
    expect(byColour(COL_FAINT).length).toBe(1);
    expect(byColour(COL_LINEUNKNOWN).length).toBe(state.grid.numEdges - 2);
    expect(byColour(COL_MISTAKE).length).toBe(0);

    // The black line is the edge that was actually set, not merely *an* edge:
    // colour counts alone would survive the renderer colouring the wrong one.
    const e = state.grid.edges[yesEdge];
    const [x1, y1] = screenPos(state, PREFERRED_TILE_SIZE, e.dot1.x, e.dot1.y);
    const [x2, y2] = screenPos(state, PREFERRED_TILE_SIZE, e.dot2.x, e.dot2.y);
    expect(byColour(COL_FOREGROUND)[0]).toMatchObject({ x1, y1, x2, y2 });

    // A NO line is drawn thinner than a laid one — that difference is the
    // whole reason a faint line reads as a mark rather than as a segment.
    const faint = byColour(COL_FAINT)[0];
    const black = byColour(COL_FOREGROUND)[0];
    if (faint.op !== "line" || black.op !== "line") throw new Error("unreachable");
    expect(faint.thickness).toBeLessThan(black.thickness);

    expect(recording.ops).toMatchSnapshot();
  });

  it("omits NO lines entirely when draw-faint-lines is off", () => {
    const { id } = SQUARES();
    const moves = [setEdges([40], LINE_NO)];

    const shown = renderScenario({ game: loopyGame, id, moves });
    expect(
      shown.recording.ops.filter((o) => o.op === "line" && o.colour === COL_FAINT)
        .length,
    ).toBe(1);

    // The preference lives on the ui, which `renderScenario` does not expose,
    // so this one drives the Midend directly — same production path.
    const midend = new Midend(loopyGame);
    expect(midend.newGameFromId(id)).toBeUndefined();
    midend.playMoves(moves);
    expect(midend.setPreferences({ "draw-faint-lines": false })).toBeUndefined();
    const recording = new RecordingDrawing(loopyGame.colours(DEFAULT_BACKGROUND));
    midend.redraw(recording);

    // Not merely recoloured: the phase is skipped, so the NO edge contributes
    // no line op at all.
    expect(
      recording.ops.filter((o) => o.op === "line" && o.colour === COL_FAINT).length,
    ).toBe(0);
    expect(recording.ops.filter((o) => o.op === "line").length).toBe(
      shown.recording.ops.filter((o) => o.op === "line").length - 1,
    );
  });
});

describe("Loopy render scenarios: error highlighting", () => {
  it("reddens all three YES edges at a vertex of degree 3", () => {
    const { id, state } = board("squares", 0, 5, 5);
    // Degree 3 at a dot is a hard vertex error whatever else is on the board,
    // so all three edges light up — and nothing else does, since the rest of
    // the grid is untouched.
    const dot = state.grid.dots.find((d) => d.order >= 3);
    if (!dot) throw new Error("a square grid has interior dots of order 4");
    const edges = [0, 1, 2].map((j) => dot.edges[j].index);

    const { recording } = renderScenario({
      game: loopyGame,
      id,
      moves: [setEdges(edges, LINE_YES)],
    });
    const mistakes = recording.ops.filter(
      (o) => o.op === "line" && o.colour === COL_MISTAKE,
    );
    expect(mistakes.length).toBe(3);
    // No black lines survive: every laid edge on this board is one of the
    // three, and an errored edge is drawn in the error colour instead.
    expect(
      recording.ops.filter((o) => o.op === "line" && o.colour === COL_FOREGROUND)
        .length,
    ).toBe(0);

    const positions = new Set(
      mistakes.map((o) => (o.op === "line" ? `${o.x1},${o.y1},${o.x2},${o.y2}` : "")),
    );
    for (const i of edges) {
      const e = state.grid.edges[i];
      const [x1, y1] = screenPos(state, PREFERRED_TILE_SIZE, e.dot1.x, e.dot1.y);
      const [x2, y2] = screenPos(state, PREFERRED_TILE_SIZE, e.dot2.x, e.dot2.y);
      expect(positions.has(`${x1},${y1},${x2},${y2}`)).toBe(true);
    }
    expect(recording.ops).toMatchSnapshot();
  });

  it("reddens an underfilled clue the instant a single loop closes", () => {
    // The `exactlyOneLoop` rule: once the YES edges form one loop and nothing
    // else, UNKNOWN counts as NO for clue checking. Without it a player who
    // never right-clicks could close a loop over an unsatisfied clue and be
    // shown neither a victory flash nor a reason why not.
    const { id, state } = board("squares", 0, 5, 5);
    const g = state.grid;

    // A unit loop around face 0. Faces 1 and 5 share an edge with it, so any
    // *other* clued face still has zero YES edges around it.
    const loop = g.faces[0].edges.filter((e) => e !== null).map((e) => e.index);
    const clued = [...state.clues.keys()].filter((i) => state.clues[i] >= 0);
    const victim = clued.find((i) => i > 5 && state.clues[i] >= 1);
    if (victim === undefined) throw new Error("no clued face away from the unit loop");
    const nth = clued.indexOf(victim);

    // Before the loop closes the same clue is ordinary black: nothing about
    // the clue changed, only whether the board is one loop.
    const before = renderScenario({ game: loopyGame, id });
    const beforeText = before.recording.ops.filter((o) => o.op === "text")[nth];
    expect(beforeText).toMatchObject({
      text: String(state.clues[victim]),
      colour: COL_FOREGROUND,
    });

    const after = renderScenario({
      game: loopyGame,
      id,
      moves: [setEdges(loop, LINE_YES)],
    });
    const afterText = after.recording.ops.filter((o) => o.op === "text")[nth];
    expect(afterText).toMatchObject({
      text: String(state.clues[victim]),
      colour: COL_MISTAKE,
    });

    // The loop itself is a legal single component, so its edges stay black —
    // the error is the clue, not the lines.
    expect(
      after.recording.ops.filter((o) => o.op === "line" && o.colour === COL_MISTAKE)
        .length,
    ).toBe(0);
    expect(
      after.recording.ops.filter((o) => o.op === "line" && o.colour === COL_FOREGROUND)
        .length,
    ).toBe(loop.length);
  });
});

describe("Loopy render scenarios: clue-position cache", () => {
  it("moves the clues when the tile size changes", () => {
    // Design D6b. Upstream never invalidates the `textx`/`texty` cache because
    // its frontends set the size once; this project's ResizeController calls
    // `size()` on every layout perturbation, so a surviving cache would leave
    // every clue at its pre-resize position — the stale-cache class of bug
    // that cost Flip three iterations.
    const { p, id, state } = board("squares", 0, 5, 5);
    const g = state.grid;
    const palette = loopyGame.colours(DEFAULT_BACKGROUND);

    const midend = new Midend(loopyGame);
    expect(midend.newGameFromId(id)).toBeUndefined();

    const big = new RecordingDrawing(palette);
    midend.redraw(big);

    // Shrink to exactly half the preferred tile size. `size()` picks the
    // largest tile that fits, and computeSize is strictly increasing here, so
    // handing it the size of a 16px board pins the tile size at 16.
    const SMALL_TILE = PREFERRED_TILE_SIZE / 2;
    expect(midend.size(computeSize(p, SMALL_TILE), false, 1)).toEqual(
      computeSize(p, SMALL_TILE),
    );
    const small = new RecordingDrawing(palette);
    midend.redraw(small);

    const posOf = (r: RecordingDrawing) =>
      r.ops
        .filter((o) => o.op === "text")
        .map((o) => (o.op === "text" ? [o.x, o.y] : []));
    const bigPos = posOf(big);
    const smallPos = posOf(small);
    expect(smallPos.length).toBe(bigPos.length);
    expect(smallPos).not.toEqual(bigPos);

    // Not merely *different* — correct for the new tile size. A cache that
    // half-invalidated (say, only x) would still fail this.
    const clued = [...state.clues.keys()].filter((i) => state.clues[i] >= 0);
    clued.forEach((face, k) => {
      const f = g.faces[face];
      gridFindIncentre(f);
      expect(smallPos[k]).toEqual(screenPos(state, SMALL_TILE, f.ix, f.iy));
      expect(bigPos[k]).toEqual(screenPos(state, PREFERRED_TILE_SIZE, f.ix, f.iy));
    });
  });
});
