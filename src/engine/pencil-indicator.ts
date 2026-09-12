/**
 * The CapsLock-style "pencil mode is on" indicator glyph — a small diagonal #2
 * pencil (yellow body + sharpened graphite tip), pointing down-left. Shared by
 * every pencil-mark game so the indicator looks identical across the
 * collection.
 *
 * The glyph is drawn into a `size × size` box at `(ox, oy)`, scaled by the same
 * fractions wherever each game places it. `bodyColor` is the pencil body
 * palette index, `gridColor` the outline/graphite index.
 */

import type { GameDrawing } from "./game.ts";

/**
 * A game's three palette indices for the indicator. An object rather than three
 * more positional arguments: they are constant per game, so naming them once at
 * module scope keeps the call site to the part that varies.
 */
export interface PencilIndicatorStyle {
  /** What the box is painted with when the glyph is absent — and behind it. */
  background: number;
  /** The pencil's body. */
  body: number;
  /** Its outline and graphite. */
  ink: number;
}

/**
 * What the indicator remembers between frames. A game's draw state satisfies
 * this by carrying the field; there is no base class.
 *
 * **`null` means "this draw state has never painted it"**, which is why there
 * is no `firstFrame` argument. A fresh draw state — a new game, or a resize —
 * has an empty canvas under the indicator, so it must paint even when the mode
 * has not changed; `null` is never equal to a boolean, so that falls out of the
 * same comparison. The nine games this replaced each passed their own flag for
 * it, under three different spellings, and the thing that actually knows
 * whether anything has been painted is the cache.
 */
export interface PencilIndicatorCache {
  pencilModeShown: boolean | null;
}

/** Where it goes. Square rather than a rect: {@link drawPencilGlyph} scales
 * into a square, and a helper taking `w` and `h` would invite one that is
 * not. */
export interface PencilIndicatorBox {
  x: number;
  y: number;
  size: number;
}

/**
 * Paint the pencil-mode indicator into a `size × size` box, but only when what
 * it shows has changed — including the case where it has never been shown (see
 * {@link PencilIndicatorCache}).
 *
 * The cache lives here rather than at each call site because it is the part
 * that was drifting: nine games had three spellings of the same guard, and
 * establishing that they agreed took two passes over the collection.
 *
 * The box is invalidated whether or not the glyph was drawn — the `drawUpdate`
 * is what erases the glyph when the mode goes off, so it is not conditional on
 * `on`.
 */
export function repaintPencilIndicator(
  dr: GameDrawing,
  cache: PencilIndicatorCache,
  on: boolean,
  where: PencilIndicatorBox,
  style: PencilIndicatorStyle,
): void {
  if (cache.pencilModeShown === on) return;
  cache.pencilModeShown = on;
  const { x, y, size } = where;
  const box = { x, y, w: size, h: size };
  dr.drawRect(box, style.background);
  if (on) drawPencilGlyph(dr, x, y, size, style.body, style.ink);
  dr.drawUpdate(box);
}

export function drawPencilGlyph(
  dr: GameDrawing,
  ox: number,
  oy: number,
  size: number,
  bodyColor: number,
  gridColor: number,
): void {
  const at = (fx: number, fy: number) => ({
    x: ox + Math.round(size * fx),
    y: oy + Math.round(size * fy),
  });
  // Body: a crisp parallelogram from the (flat) eraser end to the tip.
  dr.drawPolygon(
    [at(0.729, 0.129), at(0.871, 0.271), at(0.463, 0.679), at(0.321, 0.537)],
    bodyColor,
    gridColor,
  );
  // Sharpened graphite point.
  dr.drawPolygon(
    [at(0.321, 0.537), at(0.463, 0.679), at(0.2, 0.8)],
    gridColor,
    gridColor,
  );
}
