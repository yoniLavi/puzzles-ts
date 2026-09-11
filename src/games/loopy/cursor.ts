/**
 * Loopy's keyboard cursor — a **dot**, plus one of its incident edges.
 *
 * Every other game's cursor is a cell on an axis-aligned grid, and the engine's
 * shared `GridCursor` (`pointer.ts`) is that shape. Loopy has no such grid: its
 * input is per-*edge*, across eighteen tilings including aperiodic ones, so an
 * edge has no row and no column to arrow between. What every tiling *does*
 * have is a ring of edges around each dot — `GridDot.edges`, which `grid.ts`
 * supplies in clockwise order — so the cursor lives on a dot, and an arrow key
 * chooses one of that dot's edges. An edge is reached as (dot, direction),
 * which is also how a player thinks about drawing a loop: you are at a corner
 * and you go *that* way.
 *
 * The shape is Loopy's own rather than `GridCursor` because the position is a
 * dot index, not an `(x, y)`, and an arrow press does not *move* it — it picks
 * an edge. It still sits under `ui.cursor`, the collection's one name for the
 * thing (`ts-engine`, "One keyboard-cursor vocabulary across games").
 *
 * ## Walking, and aiming
 *
 * A **plain arrow walks**: the cursor moves along the edge that best continues
 * in that direction ({@link walkEdge} — nearest in angle, within 90°), and the
 * edge just walked becomes the chosen one, so Enter marks the line behind you
 * the way a pen inks where it has been. Drawing a loop is one arrow and one
 * Enter per edge; undrawing is walking back over it and pressing Enter again.
 *
 * A walk can only ever choose the edge it walked, so an edge that is never the
 * nearest choice from *either* endpoint would be unselectable. Ties break in
 * opposite senses for opposite arrows ({@link edgesByDirection}), which covers
 * the triangular grid by construction; the sweep in `loopy-keyboard.test.ts`
 * then finds every edge of every preset walkable **except nine on Penrose
 * kite/dart**, whose degree-5 dots at 72° leave an edge that loses the nearest
 * contest at both ends. For those, **Shift+arrow aims without moving**
 * ({@link nextEdgeFor}): the first press chooses the nearest edge in that
 * direction, a repeat of the same arrow the next one round, so every incident
 * edge has some rank for every arrow and is reachable in at most `degree`
 * presses. Plain is *go*; Shift is *look*. The test asserts both halves — the
 * walk alone covers 22 presets, and walk plus aim covers the 23rd — so the
 * residue cannot grow silently.
 */

import type { Grid, GridDot, GridEdge } from "../../engine/grid/index.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_UP,
} from "../../engine/pointer.ts";

export interface LoopyCursor {
  /** Index into `grid.dots` of the dot the cursor sits on. */
  dot: number;
  /** Index into `grid.edges` of the highlighted incident edge, or `-1` when
   * no arrow has chosen one yet at this dot. */
  edge: number;
  /** The arrow that chose `edge`, so a repeat of it advances to the next
   * candidate; `0` once the cursor has moved or nothing is chosen, so the next
   * press of any arrow starts from that arrow's nearest edge. */
  arrow: number;
  /** Whether the cursor is on screen. Hidden until the first cursor key, and
   * hidden again by any pointer press — the collection's idiom. */
  visible: boolean;
}

/**
 * A hidden cursor parked on the top-left-most dot — the smallest `y`, then the
 * smallest `x` — so it starts where a reader's eye does, on every tiling.
 */
export function newLoopyCursor(grid: Grid): LoopyCursor {
  let best = 0;
  for (let i = 1; i < grid.numDots; i++) {
    const d = grid.dots[i];
    const b = grid.dots[best];
    if (d.y < b.y || (d.y === b.y && d.x < b.x)) best = i;
  }
  return { dot: best, edge: -1, arrow: 0, visible: false };
}

/** Unit screen-space direction of an arrow key (`y` grows downwards in grid
 * coordinates exactly as on screen). */
function arrowVector(button: number): { dx: number; dy: number } | null {
  switch (button) {
    case CURSOR_UP:
      return { dx: 0, dy: -1 };
    case CURSOR_DOWN:
      return { dx: 0, dy: 1 };
    case CURSOR_LEFT:
      return { dx: -1, dy: 0 };
    case CURSOR_RIGHT:
      return { dx: 1, dy: 0 };
    default:
      return null;
  }
}

/** The endpoint of `edge` that is not `dot`. */
export function farDot(edge: GridEdge, dot: GridDot): GridDot {
  return edge.dot1 === dot ? edge.dot2 : edge.dot1;
}

/**
 * `dot`'s incident edges ordered by how well each continues in the arrow's
 * direction: smallest angular distance first, then by edge index, so the order
 * is total and stable — the aiming repeat relies on that.
 *
 * **Ties break in opposite senses for opposite arrows**: Up and Right prefer
 * the clockwise edge, Down and Left the counter-clockwise one. That is what
 * makes a *walk* cover the triangular grid: an edge tied at 60° either side of
 * Right from one end sits at the mirror tie either side of Left from its other
 * end, and Left breaks the tie the other way — so every tied edge is the first
 * choice from one of its endpoints. (Measured over all 23 presets, the
 * same-sense tie-break strands 120 of the triangular grid's 397 edges; this
 * one strands none there.) `null` for a non-arrow button.
 */
export function edgesByDirection(dot: GridDot, button: number): GridEdge[] | null {
  const v = arrowVector(button);
  if (!v) return null;
  const clockwise = button === CURSOR_UP || button === CURSOR_RIGHT;
  const ranked = dot.edges.map((e) => {
    const far = farDot(e, dot);
    const ex = far.x - dot.x;
    const ey = far.y - dot.y;
    // Signed angle from the arrow to the edge, in (-π, π]: positive is
    // clockwise on a y-down screen.
    const signed = Math.atan2(v.dx * ey - v.dy * ex, v.dx * ex + v.dy * ey);
    return { e, dist: Math.abs(signed), signed };
  });
  ranked.sort(
    (a, b) =>
      a.dist - b.dist ||
      (clockwise ? b.signed - a.signed : a.signed - b.signed) ||
      a.e.index - b.e.index,
  );
  return ranked.map((r) => r.e);
}

/**
 * The edge a plain arrow **walks**: the nearest in that direction, provided it
 * lies less than 90° off it (a positive dot product with the arrow). `null`
 * when nothing at this dot heads that way: an edge at 90° or more is another
 * arrow's business, so Up never walks you sideways or down, even at a dot whose
 * only edges go that way.
 */
export function walkEdge(dot: GridDot, button: number): GridEdge | null {
  const v = arrowVector(button);
  const e = edgesByDirection(dot, button)?.[0];
  if (!v || !e) return null;
  const far = farDot(e, dot);
  return v.dx * (far.x - dot.x) + v.dy * (far.y - dot.y) > 0 ? e : null;
}

/**
 * The edge a Shift+arrow press **aims at** without moving: the nearest in that
 * direction, or — when the same arrow chose the current edge — the next one
 * round. Wraps, so pressing an arrow `degree` times visits every incident edge
 * and returns. This is the fallback for the few edges no walk can select (see
 * the module header).
 */
export function nextEdgeFor(
  cursor: LoopyCursor,
  dot: GridDot,
  button: number,
): GridEdge | null {
  const ranked = edgesByDirection(dot, button);
  if (!ranked || ranked.length === 0) return null;
  if (cursor.arrow !== button || cursor.edge < 0) return ranked[0];
  const rank = ranked.findIndex((e) => e.index === cursor.edge);
  return ranked[(rank + 1) % ranked.length];
}
