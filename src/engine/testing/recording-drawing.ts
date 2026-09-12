/**
 * A shared, deterministic recording `GameDrawing` for in-process render
 * tests. It captures *every* drawing primitive with *all* its arguments into
 * one normalized, ordered record — the basis for both targeted op assertions
 * and `toMatchSnapshot` regression snapshots. Dev/test-only; never imported by
 * production code.
 *
 * Determinism (so a snapshot changes only when the render changes):
 *  - coordinates are rounded to integers;
 *  - colors, which a game passes as palette *indices*, are resolved
 *    through the game's `colors(defaultBackground)` palette to a stable
 *    `rgb(r, g, b)` label (the raw index is kept too, so assertions can
 *    still match `op.color === COL_HINT`);
 *  - ops are recorded in draw order (the order the game emits them,
 *    which is also their z-order — last drawn on top).
 *
 * `startDraw`/`endDraw`/`drawUpdate` are framework bookkeeping, not
 * visual content, so they are accepted and ignored. Blitter operations
 * (drag sprites) are no-ops: an in-process frame has nothing to save or
 * restore, and a captured drag sprite is not what these tests assert.
 */

import type { GameDrawing } from "../game.ts";
import type { Color, DrawTextOptions, Point, Rect } from "../types.ts";

/** One captured draw primitive. `color` is the palette index the game
 * passed; `rgb`/`fillRgb`/`outlineRgb` are that index resolved through
 * the palette to a stable label. Coordinates are integer-rounded. */
export type DrawOp =
  | {
      op: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      color: number;
      rgb: string;
    }
  | {
      op: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      thickness: number;
      color: number;
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
      color: number;
      rgb: string;
    }
  | { op: "clip"; x: number; y: number; w: number; h: number }
  | { op: "unclip" };

const round = (n: number): number => Math.round(n);

const roundRect = (r: Rect): Rect => ({
  x: round(r.x),
  y: round(r.y),
  w: round(r.w),
  h: round(r.h),
});

export class RecordingDrawing implements GameDrawing {
  readonly ops: DrawOp[] = [];

  constructor(private readonly palette: readonly Color[]) {}

  /** A palette index as a stable `rgb(r, g, b)` label (components 0..255). An
   * index with no palette entry (e.g. a game drawing with a color it forgot to
   * define) resolves to `color#<index>` rather than throwing, so a bug surfaces
   * as a visible, diffable label. */
  private rgb(index: number): string {
    const c = this.palette[index];
    if (!c) return `color#${index}`;
    return `rgb(${round(c[0] * 255)}, ${round(c[1] * 255)}, ${round(c[2] * 255)})`;
  }

  /**
   * The rects handed to `drawUpdate`, kept OUT of `ops` deliberately.
   *
   * A `drawUpdate` is bookkeeping — it tells the frontend which region to blit,
   * not what was drawn — so putting it in `ops` would add a line to every
   * snapshot in the collection for something no reviewer is reading a frame to
   * check. But it is not nothing: a redraw that stops emitting one repaints
   * nothing on a real canvas, and Cube's render test is the one that says so.
   * Counted here, asserted there, invisible to snapshots.
   */
  readonly updates: Rect[] = [];

  startDraw(): void {}
  endDraw(): void {}
  drawUpdate(rect: Rect): void {
    this.updates.push(roundRect(rect));
  }

  clip(rect: Rect): void {
    this.ops.push({ op: "clip", ...roundRect(rect) });
  }

  unclip(): void {
    this.ops.push({ op: "unclip" });
  }

  drawRect(rect: Rect, color: number): void {
    this.ops.push({ op: "rect", ...roundRect(rect), color, rgb: this.rgb(color) });
  }

  drawLine(p1: Point, p2: Point, color: number, thickness: number): void {
    this.ops.push({
      op: "line",
      x1: round(p1.x),
      y1: round(p1.y),
      x2: round(p2.x),
      y2: round(p2.y),
      thickness: round(thickness),
      color,
      rgb: this.rgb(color),
    });
  }

  drawPolygon(coords: Point[], fillColor: number, outlineColor: number): void {
    this.ops.push({
      op: "polygon",
      points: coords.map((p) => [round(p.x), round(p.y)] as const),
      fill: fillColor,
      fillRgb: this.rgb(fillColor),
      outline: outlineColor,
      outlineRgb: this.rgb(outlineColor),
    });
  }

  drawCircle(
    center: Point,
    radius: number,
    fillColor: number,
    outlineColor: number,
  ): void {
    this.ops.push({
      op: "circle",
      cx: round(center.x),
      cy: round(center.y),
      r: round(radius),
      fill: fillColor,
      fillRgb: this.rgb(fillColor),
      outline: outlineColor,
      outlineRgb: this.rgb(outlineColor),
    });
  }

  drawText(origin: Point, options: DrawTextOptions, color: number, text: string): void {
    this.ops.push({
      op: "text",
      x: round(origin.x),
      y: round(origin.y),
      text,
      align: options.align,
      baseline: options.baseline,
      fontType: options.fontType,
      size: round(options.size),
      color,
      rgb: this.rgb(color),
    });
  }

  blitterNew(): unknown {
    return {};
  }
  blitterFree(): void {}
  blitterSave(): void {}
  blitterLoad(): void {}
}

/**
 * The ops of one kind, narrowed — so `rects(ops).map((o) => o.color)` typechecks
 * where `ops.filter((o) => o.op === "rect").map(…)` does not.
 *
 * `Array.prototype.filter` does not narrow a discriminated union through a
 * predicate it was not told is a type guard, and every migrating render test
 * hits that on its first assertion. One helper rather than a cast per file: a
 * cast would be the `as unknown as GameDrawing` this recorder exists to remove,
 * reappearing one level down.
 */
export function opsOfKind<K extends DrawOp["op"]>(
  ops: readonly DrawOp[],
  kind: K,
): Extract<DrawOp, { op: K }>[] {
  return ops.filter((o): o is Extract<DrawOp, { op: K }> => o.op === kind);
}
