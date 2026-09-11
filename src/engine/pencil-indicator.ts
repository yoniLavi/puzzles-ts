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
