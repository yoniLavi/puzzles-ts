/**
 * Dev-only icon capture. Produces the two committed per-puzzle thumbnail
 * PNGs (`<puzzleId>-64d8.png`, `<puzzleId>-128d8.png`) from the live
 * puzzle canvas, amortizing the manual DevTools-capture-then-resize
 * workflow described in the `puzzle-icons` spec.
 *
 * Reachable only via the `?screenshot` capture mode of `puzzle-screen`,
 * which is itself gated behind `import.meta.env.DEV`; this module is
 * therefore dynamically imported on that path only and tree-shakes out
 * of the production bundle. Baseline-2023 constraints are relaxed here
 * because the code never ships to end users — it runs on the
 * developer's machine while producing an icon.
 */

import { sleep } from "../utils/timing.ts";
import type { Puzzle } from "./puzzle.ts";

/** The two committed icon sizes. The `d8` suffix is a legacy of the
 * old ImageMagick 8-bit-indexed pipeline, kept for path stability. */
const ICON_SIZES = [64, 128] as const;

/** Centre-crop `source` to its largest centred square and downscale to
 * a `size`×`size` PNG. Most boards are square already; the centred crop
 * keeps non-square boards consistent with the existing icon set. */
async function squareDownscale(source: ImageBitmap, size: number): Promise<Blob> {
  const side = Math.min(source.width, source.height);
  const sx = Math.floor((source.width - side) / 2);
  const sy = Math.floor((source.height - side) / 2);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get a 2D context for icon capture");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return canvas.convertToBlob({ type: "image/png" });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  anchor.click();
  // Revoke well after the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Capture the current board and download both icon PNGs with the exact
 * filenames `src/assets/icons/` expects. Must be called from a user
 * gesture (the "Capture icons" button) so the downloads aren't blocked.
 */
export async function captureIcons(puzzle: Puzzle, puzzleId: string): Promise<void> {
  const sourceBlob = await puzzle.getImage({ type: "image/png" });
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    for (const size of ICON_SIZES) {
      const blob = await squareDownscale(bitmap, size);
      downloadBlob(blob, `${puzzleId}-${size}d8.png`);
      // Small stagger so browsers honour both downloads from the one gesture.
      await sleep(150);
    }
  } finally {
    bitmap.close();
  }
}
