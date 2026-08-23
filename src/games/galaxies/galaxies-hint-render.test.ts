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
import { randomNew } from "../../engine/random/index.ts";
import { isThin, markSides } from "../../engine/testing/mark-shape.ts";
import type { DrawOp } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import type { GalaxiesHint } from "./hint.ts";
import { type GalaxiesMove, galaxiesGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL } from "./render.ts";
import { GalaxiesDiff } from "./solver.ts";

/**
 * Drive a board to the first hint step matching `want`, and capture it.
 *
 * The walk runs on the plain `Game` API and the matching position is then
 * *replayed* into a scenario as `moves`, rather than using `hintUntil`:
 * `hintUntil` can only walk the steps of a single plan, and the deductions
 * that argue over an area come later in a board's life than any one plan
 * reaches. Fixed-seed throughout, so it resolves to the same frame every run.
 */
function hintFrame(want: (hl: GalaxiesHint) => boolean, boards = BOARDS) {
  for (const { params, seed } of boards) {
    const { desc } = galaxiesGame.newDesc(params, randomNew(seed));
    const id = `${galaxiesGame.encodeParams(params, true)}:${desc}`;
    let state = galaxiesGame.newState(params, desc);
    const moves: GalaxiesMove[] = [];
    for (let i = 0; i < 400 && galaxiesGame.status(state) === "ongoing"; i++) {
      const res = galaxiesGame.hint?.(state);
      if (!res?.ok) break;
      const step = res.steps[0];
      if (want(step.highlights as GalaxiesHint)) {
        const result = renderScenario({
          game: galaxiesGame,
          id,
          moves,
          showHint: true,
        });
        const hl = result.hint?.highlights as GalaxiesHint | undefined;
        // The replayed midend recomputes at that position, so its first step
        // is the one the walk stopped on.
        expect(hl && want(hl), `${id}: replay did not reproduce the frame`).toBe(true);
        return { ...result, hl: hl as GalaxiesHint };
      }
      moves.push(step.move);
      state = galaxiesGame.executeMove(state, step.move);
    }
  }
  throw new Error("no board in the scan reached the wanted step");
}

const rects = (ops: DrawOp[], colour: number) =>
  ops.filter((o) => o.op === "rect" && o.colour === colour);
const circles = (ops: DrawOp[], outline: number) =>
  ops.filter((o) => o.op === "circle" && o.outline === outline);

const BOARDS = Array.from({ length: 8 }, (_, i) => ({
  params: { w: 7, h: 7, diff: GalaxiesDiff.Normal },
  seed: `hint-render-${i}`,
}));

describe("a displayed hint reaches the canvas", () => {
  it("an association double-rings the deduced cell, rings its partner and the dot", () => {
    // A `focus` is what marks a deduction about *one* cell, whose dot is
    // therefore somewhere else and gets a ring; a dot's-own-cells step has no
    // focus and no ring (the next test).
    const { recording, hl } = hintFrame(
      (h) => h.focus !== null && h.targets.length > 1,
    );
    expect(hl.targetDot).toBeDefined();
    expect(hl.focus).toBeDefined();
    expect(hl.refDots).toHaveLength(0);

    // No solid fill anywhere in the hint colour: a Galaxies cell's fill *is* its
    // association, so a hint that painted over it would take away the premise.
    expect(
      rects(recording.ops, COL_HINT).filter((o) => o.op === "rect" && !isThin(o)),
    ).toHaveLength(0);
    // The focus cell is **doubled** and the partner single: the words say "this
    // cell", so only one cell may look like the thing being said (owner-reported
    // when both were marked alike). Doubling is what says it now the fill is
    // gone — 8 sides for the focus, 4 for each partner.
    const sides = markSides(recording.ops, COL_HINT);
    expect(sides.length).toBe(8 + 4 * (hl.targets.length - 1));
    // Exactly one ring role on screen: "the ringed dot" cannot be ambiguous.
    expect(circles(recording.ops, COL_HINT).length).toBeGreaterThan(0);
    expect(circles(recording.ops, COL_HINT_CELL)).toHaveLength(0);
  });

  it("never rings a dot standing on a cell it has filled", () => {
    // The purple-on-purple case: the ring's own colour on its own colour. A
    // dot's-own-cells step is the one that hits it — no focus, because every
    // cell it claims is equally the point, and the dot is standing on them.
    const { recording, hl } = hintFrame(
      (h) => h.focus === null && h.targets.length > 0,
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

  it("evidence rings the cells the sentence says it reasons over", () => {
    const { recording, hl } = hintFrame(
      (h) => h.area.length > 1 && h.targets.length > 0,
    );
    // One ring per evidence cell, and no fill: an evidence cell's own black or
    // white background is what the deduction is reading, so a wash over it would
    // erase the reading.
    const sides = markSides(recording.ops, COL_HINT_CELL);
    expect(sides.length).toBe(4 * hl.area.length);
    for (const s of sides) expect(isThin(s)).toBe(true);
  });

  it("the opening hint frame is stable", () => {
    const { recording } = hintFrame((h) => h.targets.length > 0);
    expect(recording.ops).toMatchSnapshot();
  });

  it("a frame carrying every mark at once is stable", () => {
    // The opener above is a dot's-own-cells step, which has no evidence, no
    // partner and no ring — so on its own it pinned none of the marks the two
    // acceptance rounds reworked. This frame carries all of them.
    const { recording } = hintFrame(
      (h) => h.focus !== null && h.targets.length > 1 && h.area.length > 0,
    );
    expect(recording.ops).toMatchSnapshot();
  });
});
