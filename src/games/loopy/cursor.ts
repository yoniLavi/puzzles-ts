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
 * ## The arrow rule, and why a repeat press matters
 *
 * For the pressed arrow's direction, the dot's incident edges are sorted by
 * angular distance from it. The first press highlights the nearest; **pressing
 * the same arrow again advances to the next** in that order.
 *
 * The repeat is not a convenience, it is what makes edge coverage provable.
 * Plain angular-nearest has a reachability hole, invisible on the square grid:
 * a triangular dot has six edges at 60° intervals against four arrows at 90°,
 * so the edges at 60° and 120° are *equidistant* from "up", and a deterministic
 * tie-break never selects one of them. The excluded edge sits at the mirrored
 * angle from its *other* endpoint too, so a consistent tie-break can strand an
 * edge from both ends. With the repeat every incident edge has *some* rank for
 * *every* arrow, so every edge is reachable from either endpoint by pressing one
 * arrow at most `degree` times — and once in the common case, since degree 2
 * and 3 dominate every tiling. `loopy-keyboard.test.ts` proves that over all 23
 * presets rather than arguing it per tiling.
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
 * direction: smallest angular distance first. Ties (the triangular grid's 60°
 * pair either side of an arrow) break clockwise, then by edge index, so the
 * order is total and stable — the repeat press relies on that. `null` for a
 * non-arrow button.
 */
export function edgesByDirection(dot: GridDot, button: number): GridEdge[] | null {
  const v = arrowVector(button);
  if (!v) return null;
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
    (a, b) => a.dist - b.dist || b.signed - a.signed || a.e.index - b.e.index,
  );
  return ranked.map((r) => r.e);
}

/**
 * The edge an arrow press highlights: the nearest in that direction, or — when
 * the same arrow chose the current edge — the next one round. Wraps, so
 * pressing an arrow `degree` times visits every incident edge and returns.
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
