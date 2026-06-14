/**
 * A thin SVG serialiser of a captured {@link DrawOp} record — the
 * convenience view for the rare case an agent or human wants to *see*
 * the composited frame rather than read draw ops.
 *
 * Ops are emitted in draw order, which is also z-order: SVG paints in
 * document order, so last-drawn lands on top, matching the canvas. This
 * is a faithful-enough view, not a pixel-exact renderer: clip regions
 * are ignored (games draw within their tile bounds anyway) and font
 * metrics differ from the browser. It is NOT part of the required
 * assertion/snapshot flow — the harness is complete and useful without
 * it; reach for it only to eyeball a tricky highlight frame.
 *
 * Usage from a test or a scratch script:
 *   const { recording, size } = renderScenario({ ... });
 *   writeFileSync("frame.svg", toSvg(recording.ops, size));
 */

import type { DrawOp } from "./recording-drawing.ts";

interface SvgSize {
  w: number;
  h: number;
}

/** A palette index below 0 is upstream's "no colour" sentinel (e.g. an
 * outline-less polygon); map it to SVG `none`. */
const paint = (index: number, rgb: string): string => (index < 0 ? "none" : rgb);

const escapeText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const anchor = (align: string): string =>
  align === "center" ? "middle" : align === "right" ? "end" : "start";

function opToSvg(op: DrawOp): string {
  switch (op.op) {
    case "rect":
      return `<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" fill="${op.rgb}"/>`;
    case "line":
      return `<line x1="${op.x1}" y1="${op.y1}" x2="${op.x2}" y2="${op.y2}" stroke="${op.rgb}" stroke-width="${Math.max(op.thickness, 1)}"/>`;
    case "polygon": {
      const pts = op.points.map(([x, y]) => `${x},${y}`).join(" ");
      return `<polygon points="${pts}" fill="${paint(op.fill, op.fillRgb)}" stroke="${paint(op.outline, op.outlineRgb)}"/>`;
    }
    case "circle":
      return `<circle cx="${op.cx}" cy="${op.cy}" r="${op.r}" fill="${paint(op.fill, op.fillRgb)}" stroke="${paint(op.outline, op.outlineRgb)}"/>`;
    case "text":
      return `<text x="${op.x}" y="${op.y}" fill="${op.rgb}" font-size="${op.size}" text-anchor="${anchor(op.align)}" font-family="${op.fontType === "fixed" ? "monospace" : "sans-serif"}">${escapeText(op.text)}</text>`;
    // clip/unclip are layout-only; ignored in the convenience view.
    case "clip":
    case "unclip":
      return "";
  }
}

/** Serialise a draw record to a standalone SVG string. */
export function toSvg(ops: readonly DrawOp[], size: SvgSize): string {
  const body = ops
    .map(opToSvg)
    .filter((s) => s !== "")
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}">\n  ${body}\n</svg>\n`;
}
