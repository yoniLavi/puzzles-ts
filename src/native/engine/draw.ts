/**
 * Shared `GameDrawing` primitives.
 *
 * `drawRecessedBorder` is the two-pentagon bevel that frames a playfield
 * (upstream games inline it; Fifteen, Sixteen, Twiddle, Samegame, and
 * Flood all carried the same pair of `drawPolygon` calls). It is keyed on
 * the already-computed outer pixel bounds rather than `(w, h, hw)` so that
 * games deriving their edges differently (Samegame's constant highlight
 * width + gap offset) fit the same helper.
 *
 * `drawRectOutline` is the faithful port of upstream `draw_rect_outline`:
 * a 1px rectangle border via four lines, inclusive corners
 * (`(x, y)`..`(x + w - 1, y + h - 1)`).
 */
import type { GameDrawing } from "./game.ts";

/** Outer pixel bounds of a bevelled frame; edges are inclusive pixels. */
export interface BevelBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Draw the upstream recessed bevel: a top-right `highlight` wedge and a
 * bottom-left `lowlight` wedge, each a filled pentagon inset by `inset`
 * (the tile size). The two pentagons share their two diagonal vertices,
 * so together they bevel the whole border. Winding is irrelevant to the
 * fill, so a single canonical ordering reproduces every caller's pixels.
 */
export function drawRecessedBorder(
  dr: GameDrawing,
  bounds: BevelBounds,
  inset: number,
  highlight: number,
  lowlight: number,
): void {
  const { left, top, right, bottom } = bounds;

  // Highlight wedge (top/right).
  dr.drawPolygon(
    [
      { x: right, y: bottom },
      { x: right, y: top },
      { x: right - inset, y: top + inset },
      { x: left + inset, y: bottom - inset },
      { x: left, y: bottom },
    ],
    highlight,
    highlight,
  );

  // Lowlight wedge (bottom/left): the same pentagon's complementary half.
  dr.drawPolygon(
    [
      { x: left, y: top },
      { x: right, y: top },
      { x: right - inset, y: top + inset },
      { x: left + inset, y: bottom - inset },
      { x: left, y: bottom },
    ],
    lowlight,
    lowlight,
  );
}

/**
 * Upstream `draw_rect_outline`: a 1px-thick rectangle border, inclusive
 * corners from `(x, y)` to `(x + w - 1, y + h - 1)`.
 */
export function drawRectOutline(
  dr: GameDrawing,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: number,
): void {
  const r = x + w - 1;
  const b = y + h - 1;
  dr.drawLine({ x, y }, { x: r, y }, colour, 1);
  dr.drawLine({ x: r, y }, { x: r, y: b }, colour, 1);
  dr.drawLine({ x: r, y: b }, { x, y: b }, colour, 1);
  dr.drawLine({ x, y: b }, { x, y }, colour, 1);
}
