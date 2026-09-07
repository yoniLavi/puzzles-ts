import type { Size } from "../engine/types.ts";

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
 * which holds only the canvas + its padding), NOT from `[part=content]`. The
 * rule is that a width measurement must not read anything whose own width is
 * derived from the board's: that is a loop, and it settles on whatever value it
 * happened to start at. It bit once, hard. `content` used to also hold a hint
 * banner reserving `max(canvasSize.w, 34rem)`; on load the first (pre-game)
 * resize set `canvasSize` to the full available width, so `content` went
 * full-width while the freshly created canvas was still at its default 300px, a
 * content-based measurement subtracted that stale banner width, and the board
 * came out far too small and **stayed** there — the host box never changes
 * again, so the observer never re-fired.
 *
 * The banner is gone (`implement-front-page-and-chrome` moved the hint's words
 * into the rail and the phone bar, where the button that asks for them is), so
 * `content` and `puzzle` are the same box today. The distinction stays because
 * the rule does: anything added to `content` that sizes itself from the board
 * re-opens the loop, and this is where it would be paid for.
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
