/** Shared `GameDrawing` primitives. */
import type { GameDrawing } from "./game.ts";

/** Outer pixel bounds of a beveled frame; edges are inclusive pixels. */
export interface BevelBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Draw the upstream recessed bevel that frames a playfield: a top-right
 * `highlight` wedge and a bottom-left `lowlight` wedge, each a filled pentagon
 * inset by `inset` (the tile size). The two pentagons share their two diagonal
 * vertices, so together they bevel the whole border. Winding is irrelevant to
 * the fill, so a single canonical ordering reproduces every caller's pixels.
 *
 * Keyed on the outer pixel bounds rather than `(w, h, hw)`, so a game deriving
 * its edges differently (Samegame's constant highlight width and gap offset)
 * fits the same helper.
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
 * How wide the raised bevel's border reads at a given tile size: one formula,
 * so the same visual idiom has the same border in every game that draws it.
 *
 * **The `max(1, …)` is not optional.** Without it the width reaches 0 at small
 * tile sizes, at which point the caller's inner rect covers both triangles
 * completely and the bevel *disappears* rather than thinning.
 */
export function raisedBevelWidth(tileSize: number): number {
  return Math.max(1, Math.floor(tileSize / 16));
}

/**
 * The raised block: a `lowlight` triangle over the bottom-right half and a
 * `highlight` triangle over the top-left, which a caller then covers with its
 * own inner rect so both show as a border. {@link drawRecessedBorder}'s
 * sibling, in the opposite direction.
 *
 * **Takes bounds rather than a tile**, because each game's tile body differs
 * for a real reason and a rect keeps that the caller's fact: Fifteen, Sixteen
 * and Mines bevel `(x, y) … (x+ts−1, y+ts−1)`, while Inertia and Sokoban inset
 * by one to leave a grid line and bevel `(x+1, y+1) … (x+ts, y+ts)`.
 *
 * **The inner fill stays with the caller**, which is why no highlight width is
 * passed: the two triangles do not depend on it, and each game covers them with
 * its own color and its own inset.
 *
 * Lowlight is drawn first, then highlight. The two share their diagonal, so the
 * order decides a hairline, fixed here so it is one decision.
 */
export function drawRaisedBevel(
  dr: GameDrawing,
  bounds: BevelBounds,
  highlight: number,
  lowlight: number,
): void {
  const { left, top, right, bottom } = bounds;
  dr.drawPolygon(
    [
      { x: right, y: bottom },
      { x: right, y: top },
      { x: left, y: bottom },
    ],
    lowlight,
    lowlight,
  );
  dr.drawPolygon(
    [
      { x: left, y: top },
      { x: right, y: top },
      { x: left, y: bottom },
    ],
    highlight,
    highlight,
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
 * A rectangle outline `thickness` pixels wide, drawn as four filled rects:
 * the collection's "this is wrong" frame, and upstream's
 * `*_draw_err_rectangle` in every game that has one.
 *
 * **What stays with the game** is the two things it actually chooses: how thick
 * the frame is (`ts/10`, `ts/16`, or its own) and whether it is inset from the
 * cell (five games inset by `ts/20`; three draw flush to a span). Pass the rect
 * you want framed and the thickness you want — this only draws it.
 *
 * The four rects are emitted top, left, bottom, right. All four are one color,
 * so the order cannot affect the composited frame; it is fixed only so that a
 * recording is stable.
 */
export function drawThickRectOutline(
  dr: GameDrawing,
  x: number,
  y: number,
  w: number,
  h: number,
  thickness: number,
  color: number,
): void {
  dr.drawRect({ x, y, w, h: thickness }, color);
  dr.drawRect({ x, y, w: thickness, h }, color);
  dr.drawRect({ x, y: y + h - thickness, w, h: thickness }, color);
  dr.drawRect({ x: x + w - thickness, y, w: thickness, h }, color);
}

/**
 * Upstream `misc.c draw_rect_corners`: four L-shaped corner brackets on the
 * square of radius `r` centered at `(cx, cy)`, each arm reaching halfway along
 * its side: the collection's standard "keyboard cursor is here" mark. The
 * emitted line order is upstream's.
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
