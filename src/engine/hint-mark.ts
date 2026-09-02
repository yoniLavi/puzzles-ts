/**
 * A hint's board marks — the **ring** around the cell a deduction acts on and
 * the **outline** around the region it reasons from.
 *
 * Both replace the cell's *border* rather than its background, which is the
 * whole point: a fill behind content cannot be rescued by choosing a different
 * color. Measured, `HINT_FILL` scores 1.91:1 against a pencil mark in light and
 * 1.96:1 in dark, and a joint search over both hint roles, every hue and both
 * schemes returns no feasible arrangement — the pale end of the palette holds
 * exactly one cool wash and the evidence has it, and the hues that clear ~2.6:1
 * sit beside `ERROR_WASH`, which would make the cell a hint points at look like
 * the cell that is *wrong* (`walk-tactic-hint-chains` D7). A mark drawn on the
 * border is read *against* a surface rather than *through* it, so the constraint
 * disappears instead of being traded and the mark can take a strong color.
 *
 * **Where the border lives differs by game, and {@link MarkBand} is how a game
 * says so.** Keen and Solo sit on a `COL_GRID` backing rectangle with a
 * `2·GRIDEXTRA + 1` gutter between cells, so their band is entirely *outside*
 * the content box and costs the content nothing. Towers, Group, Undead, Filling
 * and Crossing draw their own per-cell outline on abutting tiles, so their band
 * is *inside* the box, over the pixels that outline already occupies. Unequal
 * splits the difference: it has a `TILESIZE/2` gap, but the greater-than
 * chevrons live in it, so only the quarter nearest the cell is free.
 *
 * **Who undoes a mark follows from that.** A band inside the box is undone by
 * the cell's own repaint, which the hint `OverlaySidecar` already triggers when
 * the overlay changes — so `gutterColor` is omitted and {@link HintMarks} keeps
 * no history. A band outside the box belongs to no tile: nothing repaints it, so
 * a mark that moved has to be painted back to the gutter's resting color
 * explicitly, and a mark that stayed has to be restamped every frame, because a
 * neighbor repainting for its own reasons widens its background into the shared
 * gutter and would clip a side off.
 */

import type { GameDrawing } from "./game.ts";
import type { Rect } from "./types.ts";

export const MARK_TOP = 1;
export const MARK_LEFT = 2;
export const MARK_BOTTOM = 4;
export const MARK_RIGHT = 8;
export const MARK_ALL = MARK_TOP | MARK_LEFT | MARK_BOTTOM | MARK_RIGHT;

export interface MarkCell {
  readonly x: number;
  readonly y: number;
}

/**
 * Where one cell's mark band sits, in pixels.
 *
 * `outer + inner` is the band's thickness on every side. A band reads as a
 * highlight by **color**, not by weight, so it wants the width of the border it
 * replaces rather than the heaviest line that fits.
 */
export interface MarkBand {
  /** The cell's content box — what its tile painter fills. */
  readonly box: Rect;
  /** Pixels the band takes *outside* the box, in the shared gutter. */
  readonly outer: number;
  /** Pixels it takes *inside* the box, over the cell's own border. */
  readonly inner: number;
}

/** Paint `sides` of `band` in `color`. */
export function drawMarkSides(
  dr: GameDrawing,
  band: MarkBand,
  sides: number,
  color: number,
): void {
  if (!sides) return;
  const { box, outer, inner } = band;
  const t = outer + inner;
  const x = box.x - outer;
  const y = box.y - outer;
  const w = box.w + 2 * outer;
  const h = box.h + 2 * outer;
  if (sides & MARK_TOP) dr.drawRect({ x, y, w, h: t }, color);
  if (sides & MARK_LEFT) dr.drawRect({ x, y, w: t, h }, color);
  if (sides & MARK_BOTTOM) dr.drawRect({ x, y: y + h - t, w, h: t }, color);
  if (sides & MARK_RIGHT) dr.drawRect({ x: x + w - t, y, w: t, h }, color);
  dr.drawUpdate({ x, y, w, h });
}

/**
 * The one rule that draws both shapes an evidence area needs: **paint a side
 * wherever the neighbor across it is not also evidence.**
 *
 * A contiguous region (a cage, a row, a line of sight) comes out as a single
 * contour, concave corners and all; a scattered set (a forcing chain's cells)
 * comes out as one ring per cell, which is honest — they really are separate
 * cells, and joining them would draw a boundary around board the deduction never
 * touched.
 */
export function outlineSides(
  x: number,
  y: number,
  inRegion: (x: number, y: number) => boolean,
): number {
  return (
    (inRegion(x, y - 1) ? 0 : MARK_TOP) |
    (inRegion(x - 1, y) ? 0 : MARK_LEFT) |
    (inRegion(x, y + 1) ? 0 : MARK_BOTTOM) |
    (inRegion(x + 1, y) ? 0 : MARK_RIGHT)
  );
}

export interface HintMarkStyle {
  /** Where cell `(x, y)`'s band sits. */
  band(x: number, y: number): MarkBand;
  /** The ring around a cell the deduction acts on. */
  targetColor: number;
  /** The outline around the region it reasons from. */
  evidenceColor: number;
  /**
   * The resting color of the pixels *outside* the content box, for undoing a
   * mark that moved or went. Omit when {@link MarkBand.outer} is 0: the band is
   * then wholly inside the cell, and the cell's own repaint undoes it.
   */
  gutterColor?: number;
}

const key = (c: MarkCell): number => c.y * 8192 + c.x;

/**
 * The pass that paints a frame's hint marks, run **after** the tile loop and
 * outside every clip.
 *
 * After, because a mark that straddles the gutter has to survive its neighbors'
 * repaints and, in a game whose tiles overlap (Towers' 3D towers spill into the
 * cell up-left), has to sit on top of them. Once per frame, not once per tile:
 * Towers repaints each tile up to four times inside a single clip.
 */
export class HintMarks {
  private signature = "";
  private painted: MarkCell[] = [];

  /** Forget what is on the canvas — for a game whose first frame repaints it. */
  reset(): void {
    this.signature = "";
    this.painted = [];
  }

  paint(
    dr: GameDrawing,
    targets: readonly MarkCell[],
    evidence: readonly MarkCell[],
    style: HintMarkStyle,
  ): void {
    const signature = `${targets.map(key).join()}|${evidence.map(key).join()}`;
    // Erase before drawing anything, and all four sides of every cell: a side
    // still wanted is repainted below, and going in this order is what stops a
    // shrinking region leaving an interior edge behind. Only when the marks
    // actually changed — erase-then-repaint every frame would flicker.
    if (signature !== this.signature && style.gutterColor !== undefined) {
      for (const c of this.painted)
        drawMarkSides(dr, style.band(c.x, c.y), MARK_ALL, style.gutterColor);
    }
    const region = new Set(evidence.map(key));
    const inRegion = (x: number, y: number): boolean => region.has(key({ x, y }));
    for (const c of evidence)
      drawMarkSides(
        dr,
        style.band(c.x, c.y),
        outlineSides(c.x, c.y, inRegion),
        style.evidenceColor,
      );
    // The target last, so it wins any border the two share.
    for (const c of targets)
      drawMarkSides(dr, style.band(c.x, c.y), MARK_ALL, style.targetColor);
    this.signature = signature;
    this.painted = [...evidence, ...targets];
  }
}
