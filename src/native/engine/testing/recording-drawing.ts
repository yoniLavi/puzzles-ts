/**
 * A shared, deterministic recording `GameDrawing` for in-process render
 * tests.
 *
 * Where the ad-hoc tier-2 doubles each capture a partial slice of the
 * draw calls, this captures *every* drawing primitive with *all* its
 * arguments into one normalised, ordered record — the reusable basis
 * for both targeted op assertions and `toMatchSnapshot` regression
 * snapshots. It is dev/test-only and never imported by production code.
 *
 * Determinism (so a snapshot changes only when the render changes):
 *  - coordinates are rounded to integers;
 *  - colours, which a game passes as palette *indices*, are resolved
 *    through the game's `colours(defaultBackground)` palette to a stable
 *    `rgb(r, g, b)` label (the raw index is kept too, so assertions can
 *    still match `op.colour === COL_HINT`);
 *  - ops are recorded in draw order (the order the game emits them,
 *    which is also their z-order — last drawn on top).
 *
 * `startDraw`/`endDraw`/`drawUpdate` are framework bookkeeping, not
 * visual content, so they are accepted and ignored. Blitter operations
 * (drag sprites) are no-ops: an in-process frame has nothing to save or
 * restore, and a captured drag sprite is not what these tests assert.
 */

import type { Colour, DrawTextOptions, Point, Rect } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../game.ts";

/** One captured draw primitive. `colour` is the palette index the game
 * passed; `rgb`/`fillRgb`/`outlineRgb` are that index resolved through
 * the palette to a stable label. Coordinates are integer-rounded. */
export type DrawOp =
  | { op: "rect"; x: number; y: number; w: number; h: number; colour: number; rgb: string }
  | {
      op: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      thickness: number;
      colour: number;
      rgb: string;
    }
  | {
      op: "polygon";
      points: ReadonlyArray<readonly [number, number]>;
      fill: number;
      fillRgb: string;
      outline: number;
      outlineRgb: string;
    }
  | {
      op: "circle";
      cx: number;
      cy: number;
      r: number;
      fill: number;
      fillRgb: string;
      outline: number;
      outlineRgb: string;
    }
  | {
      op: "text";
      x: number;
      y: number;
      text: string;
      align: string;
      baseline: string;
      fontType: string;
      size: number;
      colour: number;
      rgb: string;
    }
  | { op: "clip"; x: number; y: number; w: number; h: number }
  | { op: "unclip" };

const round = (n: number): number => Math.round(n);

/** Resolve a palette index to a stable `rgb(r, g, b)` label (components
 * 0..255). An index with no palette entry (e.g. a game drawing with a
 * colour it forgot to define) resolves to `colour#<index>` rather than
 * throwing, so a bug surfaces as a visible, diffable label. */
function rgbLabel(palette: readonly Colour[], index: number): string {
  const c = palette[index];
  if (!c) return `colour#${index}`;
  return `rgb(${round(c[0] * 255)}, ${round(c[1] * 255)}, ${round(c[2] * 255)})`;
}

export class RecordingDrawing implements GameDrawing {
  readonly ops: DrawOp[] = [];

  constructor(private readonly palette: readonly Colour[]) {}

  private rgb(index: number): string {
    return rgbLabel(this.palette, index);
  }

  startDraw(): void {}
  endDraw(): void {}
  drawUpdate(_rect: Rect): void {}

  clip(rect: Rect): void {
    this.ops.push({
      op: "clip",
      x: round(rect.x),
      y: round(rect.y),
      w: round(rect.w),
      h: round(rect.h),
    });
  }

  unclip(): void {
    this.ops.push({ op: "unclip" });
  }

  drawRect(rect: Rect, colour: number): void {
    this.ops.push({
      op: "rect",
      x: round(rect.x),
      y: round(rect.y),
      w: round(rect.w),
      h: round(rect.h),
      colour,
      rgb: this.rgb(colour),
    });
  }

  drawLine(p1: Point, p2: Point, colour: number, thickness: number): void {
    this.ops.push({
      op: "line",
      x1: round(p1.x),
      y1: round(p1.y),
      x2: round(p2.x),
      y2: round(p2.y),
      thickness: round(thickness),
      colour,
      rgb: this.rgb(colour),
    });
  }

  drawPolygon(coords: Point[], fillColour: number, outlineColour: number): void {
    this.ops.push({
      op: "polygon",
      points: coords.map((p) => [round(p.x), round(p.y)] as const),
      fill: fillColour,
      fillRgb: this.rgb(fillColour),
      outline: outlineColour,
      outlineRgb: this.rgb(outlineColour),
    });
  }

  drawCircle(
    centre: Point,
    radius: number,
    fillColour: number,
    outlineColour: number,
  ): void {
    this.ops.push({
      op: "circle",
      cx: round(centre.x),
      cy: round(centre.y),
      r: round(radius),
      fill: fillColour,
      fillRgb: this.rgb(fillColour),
      outline: outlineColour,
      outlineRgb: this.rgb(outlineColour),
    });
  }

  drawText(
    origin: Point,
    options: DrawTextOptions,
    colour: number,
    text: string,
  ): void {
    this.ops.push({
      op: "text",
      x: round(origin.x),
      y: round(origin.y),
      text,
      align: options.align,
      baseline: options.baseline,
      fontType: options.fontType,
      size: round(options.size),
      colour,
      rgb: this.rgb(colour),
    });
  }

  // Blitter (drag-sprite) operations are no-ops in-process.
  blitterNew(): unknown {
    return {};
  }
  blitterFree(): void {}
  blitterSave(): void {}
  blitterLoad(): void {}
}
