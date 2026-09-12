/**
 * The pencil-mode indicator's own test, and the reason it exists.
 *
 * Before this helper the nine games each painted their own indicator, and every
 * one of them was covered only through a render snapshot. That turned out to
 * cover almost none of it: `RecordingDrawing` keeps `drawUpdate` **out** of
 * `ops` on purpose (it is bookkeeping, not paint), so deleting the
 * invalidation from all nine games at once failed **zero** tests in the
 * collection — measured, not assumed, by doing exactly that. The invalidation
 * is what erases the glyph on a real canvas when the mode goes off, so its
 * absence is the difference between a working indicator and one that never
 * comes back down.
 *
 * Nine copies made that nine tests nobody wrote. One helper makes it one.
 */

import { describe, expect, it } from "vitest";
import {
  type PencilIndicatorBox,
  type PencilIndicatorCache,
  type PencilIndicatorStyle,
  repaintPencilIndicator,
} from "./pencil-indicator.ts";
import { RecordingDrawing } from "./testing/recording-drawing.ts";

/** Three distinguishable palette slots; the values only have to differ. */
const STYLE: PencilIndicatorStyle = { background: 0, body: 1, ink: 2 };
const PALETTE: [number, number, number][] = [
  [1, 1, 1],
  [1, 0.8, 0.2],
  [0, 0, 0],
];

const OX = 40;
const OY = 8;
const SIZE = 24;
const BOX: PencilIndicatorBox = { x: OX, y: OY, size: SIZE };

function paint(cache: PencilIndicatorCache, on: boolean): RecordingDrawing {
  const dr = new RecordingDrawing(PALETTE);
  repaintPencilIndicator(dr, cache, on, BOX, STYLE);
  return dr;
}

const glyphOps = (dr: RecordingDrawing): number =>
  dr.ops.filter((o) => o.op === "polygon").length;
const boxRects = (dr: RecordingDrawing): number =>
  dr.ops.filter(
    (o) => o.op === "rect" && o.x === OX && o.y === OY && o.w === SIZE && o.h === SIZE,
  ).length;

describe("repaintPencilIndicator", () => {
  it("paints the box and the glyph when the mode goes on", () => {
    const cache = { pencilModeShown: false };
    const dr = paint(cache, true);
    expect(boxRects(dr)).toBe(1);
    expect(glyphOps(dr)).toBeGreaterThan(0);
    expect(cache.pencilModeShown).toBe(true);
  });

  it("erases the glyph when the mode goes off, and says so", () => {
    const cache = { pencilModeShown: true };
    const dr = paint(cache, false);
    // The box is repainted in the background color and the glyph is gone —
    // painting nothing would leave the last frame's pencil on screen.
    expect(boxRects(dr)).toBe(1);
    expect(glyphOps(dr)).toBe(0);
    expect(cache.pencilModeShown).toBe(false);
  });

  it("invalidates the box whenever it paints, in both directions", () => {
    // The assertion the nine games' snapshots could not make: `drawUpdate` is
    // kept out of `ops` deliberately, so only `updates` can see it. Without
    // this the glyph is drawn into a region the frontend never blits.
    for (const [was, now] of [
      [false, true],
      [true, false],
    ] as const) {
      const dr = paint({ pencilModeShown: was }, now);
      expect(dr.updates).toEqual([{ x: OX, y: OY, w: SIZE, h: SIZE }]);
    }
  });

  it("does nothing at all when the mode has not changed", () => {
    for (const on of [false, true]) {
      const dr = paint({ pencilModeShown: on }, on);
      expect(dr.ops).toEqual([]);
      expect(dr.updates).toEqual([]);
    }
  });

  it("paints on a draw state that has never painted, though nothing changed", () => {
    // A fresh draw state — a new game, or a resize — has an empty canvas under
    // the indicator, so "unchanged" is not "already on screen". `null` carries
    // that, which is why there is no first-frame argument: the nine games this
    // replaced each passed their own flag for it, spelled three ways.
    const dr = paint({ pencilModeShown: null }, false);
    expect(boxRects(dr)).toBe(1);
    expect(glyphOps(dr)).toBe(0);
    expect(dr.updates).toHaveLength(1);
  });

  it("paints the box in the background color and the glyph in the other two", () => {
    const dr = paint({ pencilModeShown: false }, true);
    const rect = dr.ops.find((o) => o.op === "rect");
    expect(rect && "color" in rect && rect.color).toBe(STYLE.background);
    const used = new Set(
      dr.ops.flatMap((o) => (o.op === "polygon" ? [o.fill, o.outline] : [])),
    );
    expect(used).toEqual(new Set([STYLE.body, STYLE.ink]));
  });
});
