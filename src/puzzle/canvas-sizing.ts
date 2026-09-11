import type { Size } from "../engine/types.ts";

export interface AvailableCanvasSizeInputs {
  /** Host box (`<puzzle-view>` getBoundingClientRect). */
  host: Size;
  /** Live width/height of the canvas (or placeholder) element in the DOM. */
  canvasW: number;
  canvasH: number;
  /** offsetWidth of `[part=puzzle]` (canvas + its padding, banner-free). */
  puzzleW?: number;
  /** offsetWidth/Height of `[part=content]` (includes the statusbar). */
  contentW?: number;
  contentH?: number;
  minDimension: number;
}

/**
 * Compute the canvas size available for the board, as host box minus the
 * chrome around it. Pure arithmetic (no DOM) so it is unit-testable.
 *
 * The available *width* is derived from the **puzzle wrapper** (`[part=puzzle]`,
 * which holds only the canvas + its padding), NOT from `[part=content]`. A width
 * measurement must not read anything whose own width is derived from the
 * board's: that is a loop, and it settles on whatever value it started at. A
 * hint banner in `content` reserving `max(canvasSize.w, 34rem)` once left the
 * board far too small on load, and stuck there, since the host box never
 * changed again to re-fire the observer. `content` and `puzzle` are the same box
 * today; the distinction stays because anything added to `content` that sizes
 * itself from the board re-opens the loop.
 *
 * The available *height* stays content-based: a vertical consumer inside
 * `content` does not depend on the board's *width*, so the incremental
 * "content minus canvas" measurement is stable.
 */
export function computeAvailableCanvasSize(inp: AvailableCanvasSizeInputs): Size {
  const { host, canvasW, canvasH, puzzleW, contentW, contentH, minDimension } = inp;

  let width = host.w;
  if (puzzleW !== undefined) {
    width -= puzzleW - canvasW;
  } else if (contentW !== undefined) {
    // Before first render, with no puzzle wrapper to read.
    width -= contentW - canvasW;
  }

  let height = host.h;
  if (contentH !== undefined) {
    height -= contentH - canvasH;
  }

  width = Math.floor(Math.max(width, minDimension));
  height = Math.floor(Math.max(height, minDimension));
  return { w: width, h: height };
}
