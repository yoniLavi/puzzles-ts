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

/** Outer pixel bounds of a beveled frame; edges are inclusive pixels. */
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
  color: number,
  thickness = 1,
): void {
  const r = x + w - 1;
  const b = y + h - 1;
  dr.drawLine({ x, y }, { x: r, y }, color, thickness);
  dr.drawLine({ x: r, y }, { x: r, y: b }, color, thickness);
  dr.drawLine({ x: r, y: b }, { x, y: b }, color, thickness);
  dr.drawLine({ x, y: b }, { x, y }, color, thickness);
}

/**
 * Upstream `misc.c draw_rect_corners`: four L-shaped corner brackets on the
 * square of radius `r` centered at `(cx, cy)`, each arm reaching halfway along
 * its side — the collection's standard "keyboard cursor is here" mark.
 *
 * Promoted from seven byte-identical private copies (ascent, bricks, dominosa,
 * signpost, singles, spokes, subsets) when Crossing would have been the eighth.
 * The emitted line order matches upstream's, so no render snapshot moves.
 *
 * `thickness` defaults to upstream's hairline. Raise it on a board whose
 * materials are mid-tone rather than ink-on-paper, where a one-pixel stroke has
 * nothing to carry it: Slide scales it with the tile, because its floor, blocks
 * and walls are four shades of the same gray.
 */
export function drawRectCorners(
  dr: GameDrawing,
  cx: number,
  cy: number,
  r: number,
  color: number,
  thickness = 1,
): void {
  const hr = Math.floor(r / 2);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const px = cx + sx * r;
      const py = cy + sy * r;
      dr.drawLine({ x: px, y: py }, { x: px, y: cy + sy * hr }, color, thickness);
      dr.drawLine({ x: px, y: py }, { x: cx + sx * hr, y: py }, color, thickness);
    }
  }
}
