import { describe, expect, it } from "vitest";
import { computeAvailableCanvasSize } from "./canvas-sizing.ts";

// Regression guard for the on-load "board renders too small and only a window
// resize fixes it" race (fix-canvas-sizing-race). Root cause: the available
// *width* used to be measured from `[part=content]`, which includes the hint
// banner. The banner reserves `max(canvasSize.w, 34rem)`, and the first
// (pre-game) resize sets `canvasSize` to the full available width — so during
// createCanvas() the banner made `content` full-width while the fresh canvas
// was still at its default 300px, and subtracting that stale width shrank the
// board (e.g. 1336-wide host -> 348px board) where it stayed stuck.
//
// These are the exact numbers measured (Playwright, dominosa @ 1400x900) at the
// createCanvas() frame: host 1336x718, stale content 1288x242 (banner at full
// width), fresh canvas 300x150, puzzle wrapper 348 (canvas + 2x24px padding).
describe("computeAvailableCanvasSize", () => {
  const CREATE_CANVAS_FRAME = {
    host: { w: 1336, h: 718 },
    canvasW: 300,
    canvasH: 150,
    puzzleW: 348, // canvas 300 + 2x24px padding, banner-free
    contentW: 1288, // POISONED: banner reserving the stale full width
    contentH: 242,
    minDimension: 64,
  };

  it("ignores the banner-inflated content width (the stuck-board bug)", () => {
    const { w } = computeAvailableCanvasSize(CREATE_CANVAS_FRAME);
    // Full host width minus only the puzzle padding (48) — NOT clamped to the
    // catastrophic ~348 the old content-based measure produced.
    expect(w).toBe(1336 - (348 - 300)); // 1288
    expect(w).toBeGreaterThan(1000);
  });

  it("derives height from content (statusbar + banner are real vertical space)", () => {
    const { h } = computeAvailableCanvasSize(CREATE_CANVAS_FRAME);
    expect(h).toBe(718 - (242 - 150)); // 626
  });

  it("would reproduce the bug if width were content-based (documents the trap)", () => {
    // The pre-fix formula: host - (contentW - canvasW).
    const buggyWidth = 1336 - (1288 - 300);
    expect(buggyWidth).toBe(348); // the too-small board that got stuck
  });

  it("is idempotent once the canvas has been sized to fill the board", () => {
    // Settled frame: canvas applied (710), banner floors content at ~34rem but
    // the puzzle wrapper tracks the real canvas, so width returns to full.
    const settled = computeAvailableCanvasSize({
      host: { w: 1336, h: 718 },
      canvasW: 710,
      canvasH: 620,
      puzzleW: 758, // 710 + padding
      contentW: 758,
      contentH: 712,
      minDimension: 64,
    });
    expect(settled).toEqual({ w: 1288, h: 626 });
  });

  it("falls back to content width when the puzzle wrapper is absent", () => {
    const { w } = computeAvailableCanvasSize({
      host: { w: 800, h: 600 },
      canvasW: 300,
      canvasH: 150,
      puzzleW: undefined,
      contentW: 340,
      contentH: 190,
      minDimension: 64,
    });
    expect(w).toBe(800 - (340 - 300)); // 760
  });

  it("clamps to the minimum board dimension", () => {
    const s = computeAvailableCanvasSize({
      host: { w: 40, h: 40 },
      canvasW: 0,
      canvasH: 0,
      puzzleW: 20,
      contentW: 20,
      contentH: 20,
      minDimension: 64,
    });
    expect(s).toEqual({ w: 64, h: 64 });
  });
});
