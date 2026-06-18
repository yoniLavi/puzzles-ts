/**
 * Untangle rendering — idiomatic port of `game_redraw` (untangle.c:1799).
 *
 * There is no sensible partial redraw for this game (any vertex move can
 * change which edges cross), so it is a **full-frame** repaint with a
 * single early-out: recompute every vertex's pixel position, and if the
 * background, the drag/cursor vertex, and all positions are unchanged,
 * skip drawing entirely (the cheap guard against spinning during the
 * completion flash). No per-tile cache.
 */

import { drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import type { UntangleHint } from "./hint.ts";
import {
  CIRCLE_RADIUS,
  DRAG_THRESHOLD,
  PLAY_BORDER_INSET,
  packEdge,
  type RationalPoint,
  type UntangleDrawState,
  type UntangleState,
  type UntangleUi,
} from "./state.ts";

// Palette indices (must match `untangleGame.colours`). Exported so the
// render tests can assert on the exact colour an op carries.
export const COL_BACKGROUND = 1;
export const COL_LINE = 2;
export const COL_CROSSEDLINE = 3;
export const COL_OUTLINE = 4;
export const COL_POINT = 5;
export const COL_DRAGPOINT = 6;
export const COL_CURSORPOINT = 7;
export const COL_NEIGHBOUR = 8;
export const COL_FLASH1 = 9;
export const COL_FLASH2 = 10;
export const COL_HINT = 11;

const FLASH_TIME = 0.3;

/** Linear interpolation between two rational points (upstream `mix`),
 * keeping exact integer rational arithmetic. `t` runs 0→1. */
function mix(a: RationalPoint, b: RationalPoint, t: number): RationalPoint {
  return {
    d: a.d * b.d,
    x: Math.trunc(a.x * b.d + t * (b.x * a.d - a.x * b.d)),
    y: Math.trunc(a.y * b.d + t * (b.y * a.d - a.y * b.d)),
  };
}

export function redrawUntangle(
  dr: GameDrawing,
  ds: UntangleDrawState | null,
  prev: UntangleState | null,
  s: UntangleState,
  ui: UntangleUi,
  animTime: number,
  flashTime: number,
  hint?: UntangleHint,
): void {
  if (ds === null) return;
  const n = s.n;
  const ts = ds.tileSize;

  // Background colour: steady, or alternating during the completion flash.
  let bg = COL_BACKGROUND;
  if (flashTime > 0) {
    bg = Math.trunc((flashTime * 4) / FLASH_TIME) % 2 === 0 ? COL_FLASH1 : COL_FLASH2;
  }

  // Recompute every vertex's pixel position, noting whether any moved.
  let pointsMoved = false;
  const animLen = ui.animLength;
  for (let i = 0; i < n; i++) {
    let p = s.pts[i];
    if (ui.dragPoint === i) p = ui.newPoint;
    if (prev && animLen > 0) p = mix(prev.pts[i], p, animTime / animLen);
    const x = Math.trunc((p.x * ts) / p.d);
    const y = Math.trunc((p.y * ts) / p.d);
    if (ds.x[i] !== x || ds.y[i] !== y) pointsMoved = true;
    ds.x[i] = x;
    ds.y[i] = y;
  }

  // Hint marker pixels (or -1 when no hint is displayed). Folded into the
  // early-out so a manual hint, which moves no vertex, still repaints.
  const hintVertex = hint ? hint.vertex : -1;
  const hintTx = hint ? Math.trunc((hint.to.x * ts) / hint.to.d) : -1;
  const hintTy = hint ? Math.trunc((hint.to.y * ts) / hint.to.d) : -1;

  // Early-out: nothing visible changed.
  if (
    ds.started &&
    ds.bg === bg &&
    ds.dragPoint === ui.dragPoint &&
    ds.cursorPoint === ui.cursorPoint &&
    ds.hintVertex === hintVertex &&
    ds.hintTx === hintTx &&
    ds.hintTy === hintTy &&
    !pointsMoved
  ) {
    return;
  }
  ds.dragPoint = ui.dragPoint;
  ds.cursorPoint = ui.cursorPoint;
  ds.bg = bg;
  ds.hintVertex = hintVertex;
  ds.hintTx = hintTx;
  ds.hintTy = hintTy;
  ds.started = true;

  // The midend brackets this call with startDraw/endDraw; the game just
  // paints. Full-frame: fill the background every repaint.
  const size = s.w * ts;
  dr.drawRect({ x: 0, y: 0, w: size, h: size }, bg);

  // Frame the playable area so the drop zone is unambiguous (the gray
  // beyond it — e.g. layout padding — is dead space). Drags clamp a
  // vertex blob to just inside this border (`PLAY_MARGIN`).
  drawRectOutline(
    dr,
    PLAY_BORDER_INSET,
    PLAY_BORDER_INSET,
    size - 2 * PLAY_BORDER_INSET,
    size - 2 * PLAY_BORDER_INSET,
    COL_OUTLINE,
  );

  // Edges. Show crossed edges red when the preference is on; during an
  // animation the crossings reflect the from-state, matching upstream.
  const crossSource = prev ?? s;
  for (let i = 0; i < s.edges.length; i++) {
    const e = s.edges[i];
    const colour =
      ui.showCrossedEdges && crossSource.crosses[i] ? COL_CROSSEDLINE : COL_LINE;
    dr.drawLine(
      { x: ds.x[e.a], y: ds.y[e.a] },
      { x: ds.x[e.b], y: ds.y[e.b] },
      colour,
      1,
    );
  }

  // Vertices, in a fixed z-order so the drag/cursor point sits on top.
  const drawOrder = [COL_POINT, COL_NEIGHBOUR, COL_CURSORPOINT, COL_DRAGPOINT];
  for (const thisColour of drawOrder) {
    for (let i = 0; i < n; i++) {
      let c: number;
      if (ui.dragPoint === i) c = COL_DRAGPOINT;
      else if (ui.cursorPoint === i) c = COL_CURSORPOINT;
      else if (ui.dragPoint >= 0 && s.edgeSet.has(packEdge(ui.dragPoint, i, n)))
        c = COL_NEIGHBOUR;
      else c = COL_POINT;
      if (c !== thisColour) continue;

      if (ui.vertexNumbers) {
        // Blank the blob area, then draw the index number in `c`.
        dr.drawCircle({ x: ds.x[i], y: ds.y[i] }, DRAG_THRESHOLD, bg, bg);
        dr.drawText(
          { x: ds.x[i], y: ds.y[i] },
          {
            align: "center",
            baseline: "mathematical",
            fontType: "variable",
            size: Math.trunc((DRAG_THRESHOLD * 3) / 2),
          },
          c,
          String(i),
        );
      } else {
        dr.drawCircle({ x: ds.x[i], y: ds.y[i] }, CIRCLE_RADIUS, c, COL_OUTLINE);
      }
    }
  }

  // Hint: a line from the hinted vertex to its suggested destination, and
  // a marker at the destination. The source is the vertex's *current*
  // drawn position (ds.x/y), so during an auto-hint slide the line shrinks
  // to nothing as the vertex arrives.
  if (hint && hintVertex >= 0) {
    dr.drawLine(
      { x: ds.x[hintVertex], y: ds.y[hintVertex] },
      { x: hintTx, y: hintTy },
      COL_HINT,
      2,
    );
    dr.drawCircle({ x: hintTx, y: hintTy }, CIRCLE_RADIUS, COL_HINT, COL_OUTLINE);
  }

  dr.drawUpdate({ x: 0, y: 0, w: size, h: size });
}
