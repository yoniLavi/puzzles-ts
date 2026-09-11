import type { GameDrawing } from "../engine/game.ts";
import type { DrawTextOptions, FontInfo, Point, Rect, Size } from "../engine/types.ts";

export const defaultFontInfo: FontInfo = {
  fontFamily: "sans-serif",
  fontWeight: "normal",
  fontStyle: "normal",
} as const;

interface Blitter {
  w: number;
  h: number;
  imageData?: ImageData;
  $type: "blitter";
}

/** The `GameDrawing` every game paints through: a 2D canvas context on the
 * `OffscreenCanvas` transferred to the worker. */
export class Drawing implements GameDrawing<Blitter> {
  private context: OffscreenCanvasRenderingContext2D;
  private palette: string[] = [];
  private fontInfo: FontInfo;
  private dpr = 1; // devicePixelRatio of the canvas

  constructor(
    private readonly canvas: OffscreenCanvas,
    fontInfo?: FontInfo,
  ) {
    this.fontInfo = fontInfo ?? defaultFontInfo;
    const context = this.canvas.getContext("2d", {
      alpha: false,
      // willReadFrequently causes lost context when used with
      // OffscreenCanvas transferred to worker in Android Chrome:
      // https://issues.chromium.org/issues/417354558#comment3.
      // (Otherwise it would be helpful for blitter use.)
      //   willReadFrequently: true,
    });
    if (!context) {
      throw new Error("Failed to get canvas 2d context");
    }
    this.context = context;
  }

  /**
   * Install the color palette, which must be CSS color strings
   * in the same order as the game's `colors()` return.
   * (Does not redraw anything already on the canvas.)
   * Returns true if an already set palette was replaced.
   */
  setPalette(colors: string[]): boolean {
    const hadPalette = this.palette.length > 0;
    this.palette = colors;
    return hadPalette;
  }

  // The font is chosen once, at `attachCanvas`, from the host page's computed
  // style. There is no `setFontInfo`, because nothing would call it without a
  // font preference to trigger it: add both together or neither.

  public resize(w: number, h: number, dpr: number): void {
    // https://web.dev/articles/canvas-hidipi
    // Most canvas operations will be scaled by the dpr,
    // allowing the puzzle to work in CSS pixels.
    // The drawing API expects rects and vertical/horizontal lines
    // are constrained to integer pixel boundaries (no anti-aliasing),
    // so round a fractional dpr up. (It's OK that the onscreen results
    // will anti-alias the integral offscreen original.)
    const effectiveDpr = Math.ceil(dpr);
    this.dpr = effectiveDpr;
    this.canvas.width = w * effectiveDpr;
    this.canvas.height = h * effectiveDpr;
    this.context.scale(effectiveDpr, effectiveDpr);
  }

  /**
   * Return a Blob containing the current image of the canvas.
   *
   * Any options are passed to OffscreenCanvas.convertToBlob(); if not provided
   * the result will be type image/png.
   */
  public async getImage(options?: ImageEncodeOptions): Promise<Blob> {
    return this.canvas.convertToBlob(options);
  }

  /*
   * GameDrawing
   */

  // cached text metrics
  private mathematicalBaselineOffset: Record<string, number> = {};

  drawText(
    { x, y }: Point,
    { align, baseline, fontType, size }: DrawTextOptions,
    color: number,
    text: string,
  ): void {
    if (size < 1) return;
    this.context.font = [
      this.fontInfo.fontStyle,
      this.fontInfo.fontWeight,
      `${size}px`,
      fontType === "variable" ? this.fontInfo.fontFamily : "monospace",
    ].join(" ");
    this.context.textAlign = align;
    if (baseline === "mathematical") {
      // CanvasRenderingContext2D.textBaseline doesn't support "mathematical".
      // (And "middle" centers on em height--including descenders--which is not
      // what the puzzles want.) Approximate mathematical alignment by centering
      // digits. (Relies on TextMetrics.actual* props that landed ~2018-2020.)
      this.context.textBaseline = "alphabetic";
      let offset = this.mathematicalBaselineOffset[this.context.font];
      if (offset === undefined) {
        // Measure digits only: puzzles tend to center digits or digits+lowercase,
        // not uppercase. (Compare js_canvas_find_font_midpoint in upstream's emcclib.js.)
        const { actualBoundingBoxAscent, actualBoundingBoxDescent } =
          this.context.measureText("0123456789");
        offset = (actualBoundingBoxAscent + actualBoundingBoxDescent) / 2;
        this.mathematicalBaselineOffset[this.context.font] = offset;
      }
      y += offset;
    } else {
      this.context.textBaseline = baseline;
    }
    this.setUpContext({ fillColor: color });
    this.context.fillText(text, x, y);
  }

  drawRect({ x, y, w, h }: Rect, color: number): void {
    if (w < 1 || h < 1) return;
    this.setUpContext({ fillColor: color, strokeColor: color, lineWidth: 1 });
    this.context.fillRect(x, y, w, h);
  }

  drawLine(p1: Point, p2: Point, color: number, thickness: number): void {
    if (thickness <= 0) return;
    this.context.beginPath();
    // Drawing API points are pixel center; canvas is pixel top left.
    this.context.moveTo(p1.x + 0.5, p1.y + 0.5);
    this.context.lineTo(p2.x + 0.5, p2.y + 0.5);
    this.setUpContext({ strokeColor: color, fillColor: color, lineWidth: thickness });
    this.context.stroke();
    // Draw the pixel at each end of the line (copied from upstream's emcclib.js).
    this.context.fillRect(p1.x, p1.y, 1, 1);
    this.context.fillRect(p2.x, p2.y, 1, 1);
  }

  drawPolygon(coords: Point[], fillcolor: number, outlinecolor: number): void {
    // Drawing API points are pixel center; canvas is pixel top left.
    this.context.beginPath();
    this.context.moveTo(coords[0].x + 0.5, coords[0].y + 0.5);
    for (const { x, y } of coords.slice(1)) {
      this.context.lineTo(x + 0.5, y + 0.5);
    }
    this.context.closePath();
    this.setUpContext({
      strokeColor: outlinecolor,
      fillColor: fillcolor >= 0 ? fillcolor : undefined,
    });
    if (fillcolor >= 0) this.context.fill();
    this.context.stroke();
  }

  drawCircle(
    { x: cx, y: cy }: Point,
    radius: number,
    fillcolor: number,
    outlinecolor: number,
  ): void {
    if (radius <= 0) return;
    this.context.beginPath();
    this.context.arc(cx + 0.5, cy + 0.5, radius, 0, Math.PI * 2, false);
    this.context.closePath();
    this.setUpContext({
      strokeColor: outlinecolor,
      fillColor: fillcolor >= 0 ? fillcolor : undefined,
    });
    if (fillcolor >= 0) this.context.fill();
    this.context.stroke();
  }

  // Invalidation region management (startDraw/drawUpdate/endDraw):
  // Because our offscreen canvas automatically syncs to the onscreen canvas,
  // there's no need to keep track of the dirty region or notify about updates.
  startDraw(): void {}

  drawUpdate(_rect: Rect): void {}

  endDraw(): void {}

  clip({ x, y, w, h }: Rect): void {
    this.context.save();
    if (w < 1 || h < 1) return;
    this.context.beginPath();
    this.context.rect(x, y, w, h);
    this.context.clip();
  }

  unclip(): void {
    this.context.restore();
  }

  blitterNew({ w, h }: Size): Blitter {
    return { w, h, $type: "blitter" };
  }

  blitterFree(blitter: Blitter): void {
    blitter.imageData = undefined;
  }

  /**
   * Callers must pass a whole-pixel origin. `getImageData`/`putImageData` take
   * integer arguments, so a fractional origin is truncated -- while whatever
   * the game draws over it is *not*, and a blitter sized to fit its sprite
   * exactly (upstream's are) then fails to erase the sprite's last column and
   * row. Map's drag blob trailed scratch marks across the board that way.
   */
  blitterSave(blitter: Blitter, { x, y }: Point): void {
    const { w, h } = blitter;
    if (w < 1 || h < 1) return;
    // getImageData ignores the transformation matrix, so must apply dpr scaling.
    blitter.imageData = this.context.getImageData(
      x * this.dpr,
      y * this.dpr,
      w * this.dpr,
      h * this.dpr,
    );
  }

  blitterLoad(blitter: Blitter, { x, y }: Point): void {
    const { w, h } = blitter;
    if (w < 1 || h < 1) return;
    if (!blitter.imageData) {
      throw new Error("Blitter loaded before saved");
    }
    this.context.putImageData(blitter.imageData, x * this.dpr, y * this.dpr);
  }

  /**
   * Set up the drawing context for filling/stroking paths.
   * lineWidth defaults to 1 (the puzzle drawing_api standard width).
   * If fillColor is not provided, fillStyle will not be changed.
   */
  private setUpContext({
    strokeColor,
    fillColor,
    lineWidth,
  }: {
    strokeColor?: number;
    fillColor?: number;
    lineWidth?: number;
  }): void {
    this.context.lineWidth = lineWidth ?? 1;
    this.context.lineCap = "round";
    this.context.lineJoin = "round";
    if (strokeColor !== undefined) {
      const strokeStyle = this.palette[strokeColor];
      if (strokeStyle === undefined) {
        throw new Error(`strokeColor ${strokeColor} not in palette`);
      }
      this.context.strokeStyle = strokeStyle;
    }
    if (fillColor !== undefined) {
      const fillStyle = this.palette[fillColor];
      if (fillStyle === undefined) {
        throw new Error(`fillColor ${fillColor} not in palette`);
      }
      this.context.fillStyle = fillStyle;
    }
  }
}
