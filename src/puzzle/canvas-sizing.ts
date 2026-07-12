import type { Size } from "./types.ts";

export interface AvailableCanvasSizeInputs {
  /** Host box (`<puzzle-view>` getBoundingClientRect). */
  host: Size;
  /** Live width/height of the canvas (or placeholder) element in the DOM. */
  canvasW: number;
  canvasH: number;
  /** offsetWidth of `[part=puzzle]` (canvas + its padding, banner-free). */
  puzzleW?: number;
  /** offsetWidth/Height of `[part=content]` (includes statusbar + banner). */
  contentW?: number;
  contentH?: number;
  minDimension: number;
}

/**
 * Compute the canvas size available for the board, as host box minus the
 * chrome around it. Pure arithmetic (no DOM) so it is unit-testable.
 *
 * The available *width* is derived from the **puzzle wrapper** (`[part=puzzle]`,
 * which holds only the canvas + its padding), NOT from `[part=content]`.
 * `content` also contains the hint banner, whose reserved width is bound to
 * `canvasSize.w` (`max(canvasSize.w, 34rem)`). On load, the first (pre-game)
 * resize sets `canvasSize` to the full available width, so the banner
 * momentarily makes `content` full-width while the freshly-created canvas is
 * still at its default 300px. A content-based width measurement would subtract
 * that stale banner width and size the board far too small — and it would stay
 * stuck (the host box never changes again, so the ResizeObserver never
 * re-fires) until an incidental resize. Measuring the banner-free puzzle
 * wrapper breaks that circular dependency.
 *
 * The available *height* stays content-based: the statusbar and banner heights
 * are real vertical consumers and do not depend on the board *width*, so the
 * incremental "content minus canvas" measurement is stable.
 */
export function computeAvailableCanvasSize(inp: AvailableCanvasSizeInputs): Size {
  const { host, canvasW, canvasH, puzzleW, contentW, contentH, minDimension } = inp;

  let width = host.w;
  if (puzzleW !== undefined) {
    width -= puzzleW - canvasW;
  } else if (contentW !== undefined) {
    // Fallback (should not happen once rendered): old incremental measure.
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
