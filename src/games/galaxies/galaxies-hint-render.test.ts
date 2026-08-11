/**
 * Galaxies' hint, as pixels — tier 2.5 (docs/games/testing.md § "Render
 * scenarios"). Each frame is reached through a real `Midend` by a fixed-seed
 * scan, so these are the frames a player sees, not a hand-built drawstate.
 *
 * What is worth asserting here rather than on the highlight object: the hint's
 * *action* colour has to actually reach the canvas, a wall the board does not
 * have yet has to be drawn anyway (nothing else in this renderer paints an
 * unset edge), and the two ring roles have to stay one apiece.
 */
import { describe, expect, it } from "vitest";
import type { DrawOp } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import type { GalaxiesHint } from "./hint.ts";
import { galaxiesGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL } from "./render.ts";

/**
 * Drive a board to the first hint step matching `want`, and capture it.
 *
 * `hintUntil` only ever walks the plan a single `hint()` returned, so a
 * deduction that comes later than the plan cap is unreachable from one board;
 * the scan over seeds is what finds a board that offers it early. Fixed-seed,
 * so it resolves to the same frame every run.
 */
function hintFrame(want: (hl: GalaxiesHint) => boolean, ids = BOARDS) {
  for (const id of ids) {
    const result = renderScenario({
      game: galaxiesGame,
      id,
      showHint: true,
      hintUntil: (step) => {
        const hl = step.highlights as GalaxiesHint | undefined;
        return hl !== undefined && want(hl);
      },
    });
    const hl = result.hint?.highlights as GalaxiesHint | undefined;
    if (hl && want(hl)) return { ...result, hl };
  }
  throw new Error("no board in the scan reached the wanted step");
}

const rects = (ops: DrawOp[], colour: number) =>
  ops.filter((o) => o.op === "rect" && o.colour === colour);
const circles = (ops: DrawOp[], outline: number) =>
  ops.filter((o) => o.op === "circle" && o.outline === outline);

const BOARDS = Array.from({ length: 12 }, (_, i) => `7x7dn#hint-render-${i}`);

describe("a displayed hint reaches the canvas", () => {
  it("an association fills the deduced cell, outlines its partner, rings the dot", () => {
    // A dot standing *on* the filled cells is deliberately not ringed (the
    // ring would be invisible), so hunt a frame whose dot is elsewhere — the
    // reach deduction always has one.
    const { recording, hl } = hintFrame(
      (h) => h.targets.length > 1 && h.area.length > 0,
    );
    expect(hl.targetDot).toBeDefined();
    expect(hl.focus).toBeDefined();
    expect(hl.refDots).toHaveLength(0);

    // Exactly *one* solid fill, however many cells the move claims: the words
    // say "this cell", so only one cell may look like the thing being said
    // (owner-reported when both were filled alike).
    const fills = rects(recording.ops, COL_HINT).filter(
      (o) => o.op === "rect" && o.w > 4 && o.h > 4,
    );
    expect(fills).toHaveLength(1);
    // The partner is still shown — the move claims it — as an outline: four
    // COL_HINT lines, and no fill of its own.
    const outline = recording.ops.filter(
      (o) => o.op === "line" && o.colour === COL_HINT,
    );
    expect(outline.length).toBe(4 * (hl.targets.length - 1));
    // Exactly one ring role on screen: "the ringed dot" cannot be ambiguous.
    expect(circles(recording.ops, COL_HINT).length).toBeGreaterThan(0);
    expect(circles(recording.ops, COL_HINT_CELL)).toHaveLength(0);
  });

  it("never rings a dot standing on a cell it has filled", () => {
    // The purple-on-purple case: the ring's own colour on its own colour.
    const { recording, hl } = hintFrame(
      (h) => h.targets.length > 0 && h.area.length === 0,
    );
    expect(hl.targetDot).toBeDefined();
    expect(circles(recording.ops, COL_HINT)).toHaveLength(0);
  });

  it("a forced wall is drawn even though the board has no wall there", () => {
    const { recording, hl, midend } = hintFrame((h) => h.targetWalls.length > 0);
    expect(hl.targetWalls).toHaveLength(1);
    const wall = hl.targetWalls[0];
    // The premise of the whole assertion: the board really does not have this
    // wall yet, so nothing but the hint could have painted a bar there. Read
    // off the text rendering, which draws a set wall as `|` or `-` — the one
    // view of the midend's board a test can take from outside.
    const text = (midend.formatAsText() ?? "").split("\n");
    expect(text[wall.y]?.[wall.x], "the board already had the hinted wall").toBe(" ");

    // Both tiles the wall separates paint their side of it.
    const bars = rects(recording.ops, COL_HINT);
    expect(bars.length).toBeGreaterThanOrEqual(2);
    // A wall is a bar, never a tile-sized fill: a hint that filled the cell
    // would be saying "this cell", which is a different move.
    for (const bar of bars) {
      if (bar.op !== "rect") continue;
      expect(Math.min(bar.w, bar.h)).toBeLessThan(Math.max(bar.w, bar.h) / 2);
    }
  });

  it("evidence shades the cells the sentence says are shaded", () => {
    const { recording, hl } = hintFrame(
      (h) => h.area.length > 1 && h.targets.length > 0,
    );
    const washes = rects(recording.ops, COL_HINT_CELL).filter(
      (o) => o.op === "rect" && o.w > 4 && o.h > 4,
    );
    expect(washes).toHaveLength(hl.area.length);
  });

  it("the opening hint frame is stable", () => {
    const { recording } = hintFrame((h) => h.targets.length > 0);
    expect(recording.ops).toMatchSnapshot();
  });
});
