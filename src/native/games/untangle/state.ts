/**
 * Types and pure state helpers for Untangle — an idiomatic TS rendering
 * of the data model in `puzzles/untangle.c` (deleted when this ships).
 *
 * The architectural key is the separation of **topology** (the edges)
 * from **positions** (the vertex coordinates):
 *  - `edges` (the `a < b` vertex-index pairs) are immutable for the
 *    game's life and shared by every state (C refcounts the graph; we
 *    freeze + share by reference, like Galaxies' topology). Built once.
 *  - `pts` (positions) are the only thing `executeMove` changes.
 *  - `crosses[]` (per-edge) + `completed` are **derived**, recomputed by
 *    `findCrossings` on every transition.
 *
 * Coordinates are **rational**: a `RationalPoint {x,y,d}` means `x/d,
 * y/d`. Fractions are load-bearing — they let the crossing test run in
 * exact integers (no float epsilon), and they let three coordinate
 * systems coexist (circle layout `d=64`, a free drag `d=tilesize`, a
 * snapped drag `d=(n-1)*2`). `d` is per-point: two points in one state
 * may carry different denominators, and `cross()` keeps each point's own
 * `d` in the cross-multiplication.
 */

/**
 * A point as the rational `(x/d, y/d)`. **Invariant: `x`, `y`, `d` are
 * all integers and `d > 0`** — the exact-integer `cross()` relies on it
 * (its `BigInt` accumulator throws on a fraction). Pixel input is rounded
 * to integers at the boundary (`placeDraggedPoint`), and `executeMove`
 * re-checks the invariant before any point reaches state.
 */
export interface RationalPoint {
  x: number;
  y: number;
  d: number;
}

/** An edge between two vertices, always stored `a < b`. */
export interface Edge {
  a: number;
  b: number;
}

export interface UntangleParams {
  /** Number of vertices. */
  n: number;
}

export interface UntangleState {
  /** Vertex count (also `pts.length` and the params value). */
  n: number;
  /** Coordinate-system extent: `COORDLIMIT(n)` (the bounding box is
   * `0..w` on each axis, in tile units). */
  w: number;
  /** Per-vertex positions (rational). Mutable per state; cloned on every
   * `executeMove`. */
  pts: RationalPoint[];
  /** The graph topology, shared by reference across every state, sorted
   * `(a,b)` ascending. Immutable. */
  readonly edges: readonly Edge[];
  /** Packed `a * n + b` membership set for O(1) "is there an edge?"
   * (the role of upstream `isedge`). Shared with `edges`. */
  readonly edgeSet: ReadonlySet<number>;
  /** Derived: `crosses[i]` is true iff edge `i` crosses another edge. */
  crosses: readonly boolean[];
  /** Derived: no two edges cross. */
  completed: boolean;
  /** Sticky once the player has used Solve (suppresses the win flash,
   * matching upstream `cheated`). */
  cheated: boolean;
  /** True only for the transition produced by a Solve move (selects the
   * longer solve animation, matching upstream `just_solved`). */
  justSolved: boolean;
}

/** A single move: reposition one or more vertices. A player drag carries
 * one entry; a Solve carries all `n`. Structured-clone/JSON-safe, so the
 * midend's default move serialisation handles it with no custom codec. */
export interface UntangleMove {
  kind: "place";
  points: { i: number; x: number; y: number; d: number }[];
  /** True for the all-vertex move emitted by Solve. */
  solving: boolean;
}

export interface UntangleUi {
  /** Vertex being dragged, or -1. At most one of dragPoint/cursorPoint
   * is valid at a time. */
  dragPoint: number;
  /** Vertex highlighted by the keyboard cursor (not dragged), or -1. */
  cursorPoint: number;
  /** Where the dragged/cursor-held vertex is now (live, pre-commit). */
  newPoint: RationalPoint;
  /** Set in `interpretMove` when a drag commits to a move; consumed by
   * `changedState` into `justMoved`. */
  justDragged: boolean;
  /** Set in `changedState` from `justDragged`: the just-applied move was
   * a player drag, so it animates instantly (the point is already where
   * the player dropped it). */
  justMoved: boolean;
  /** The animation length the last transition armed (set by `animLength`,
   * read by `redraw` for the `mix` interpolation factor). */
  animLength: number;

  // --- preferences (upstream get_prefs/set_prefs; live on the ui) ----
  /** Snap dragged points to a coarse `(n-1)×(n-1)` grid. Default off. */
  snapToGrid: boolean;
  /** Colour edges involved in a crossing red. Default ON (our divergence
   * — it doubles as the built-in mistake feedback). */
  showCrossedEdges: boolean;
  /** Render vertices as their index number instead of a blob. Default
   * off (Circles). */
  vertexNumbers: boolean;
}

export interface UntangleDrawState {
  started: boolean;
  tileSize: number;
  /** Last background colour drawn (for the "did anything change?"
   * early-out). */
  bg: number;
  /** Last drag / cursor vertex drawn. */
  dragPoint: number;
  cursorPoint: number;
  /** Last displayed hint: the hinted vertex (-1 if none) and its target
   * pixel position. Tracked so a manual hint (which moves no vertex) still
   * defeats the redraw early-out. */
  hintVertex: number;
  hintTx: number;
  hintTy: number;
  /** Last pixel positions drawn, per vertex (length n). */
  x: number[];
  y: number[];
}

/** Untangle has no wrong-but-legal state to flag — crossed edges (drawn
 * red) are the built-in mistake feedback — so it ships no `findMistakes`
 * and this is never produced. */
export type UntangleMistake = never;

const PI = Math.PI;
const PREFERRED_TILESIZE = 64;
const POINTDENSITY = 3;

/** Radius of a drawn vertex blob, px. */
export const CIRCLE_RADIUS = 6;
/** Pointer must come within this of a vertex (px) to grab it. */
export const DRAG_THRESHOLD = CIRCLE_RADIUS * 2;
/** Inset (px) of the playable-area border from the canvas edge. The
 * drag clamp keeps a vertex's *blob* inside this border (centre ≥
 * `PLAY_BORDER_INSET + CIRCLE_RADIUS` from the edge), so the border and
 * the reachable region coincide. */
export const PLAY_BORDER_INSET = 2;
/** The clamp margin for a vertex centre: blob fully inside the border. */
export const PLAY_MARGIN = PLAY_BORDER_INSET + CIRCLE_RADIUS;

/** Exact integer floor square root (upstream `squarert`). */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

/** `COORDLIMIT(n)` — the grid is big enough that `n` points occupy about
 * `1/POINTDENSITY` of it. */
export function coordLimit(n: number): number {
  return isqrt(n * POINTDENSITY);
}

/** Pack an unordered vertex pair into a single key for `edgeSet`. */
export function packEdge(a: number, b: number, n: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo * n + hi;
}

/**
 * Whether the segments a1-a2 and b1-b2 intersect, computed **exactly in
 * integers** (an endpoint lying on the other segment counts). Faithful
 * port of upstream `cross()` (untangle.c:343). The dot products can
 * exceed 2^53 once snapped coordinates and large `n` combine, so the
 * accumulator uses `BigInt` (the C reaches for `int64` here for the same
 * reason); everything else is a plain number, exact in that range.
 */
export function cross(
  a1: RationalPoint,
  a2: RationalPoint,
  b1: RationalPoint,
  b2: RationalPoint,
): boolean {
  const dot = (a: number, b: number, p: number, q: number): bigint =>
    BigInt(a) * BigInt(b) + BigInt(p) * BigInt(q);

  // b1-a1 and b2-a1 (numerators only — we only check signs), and a
  // vector perpendicular to a2-a1.
  let b1x = b1.x * a1.d - a1.x * b1.d;
  let b1y = b1.y * a1.d - a1.y * b1.d;
  let b2x = b2.x * a1.d - a1.x * b2.d;
  let b2y = b2.y * a1.d - a1.y * b2.d;
  let px = a1.y * a2.d - a2.y * a1.d;
  let py = a2.x * a1.d - a1.x * a2.d;
  let d1 = dot(b1x, px, b1y, py);
  let d2 = dot(b2x, px, b2y, py);
  // Same non-zero sign ⇒ b1, b2 on the same side ⇒ no crossing.
  if ((d1 > 0n && d2 > 0n) || (d1 < 0n && d2 < 0n)) return false;

  // Both exactly zero ⇒ the segments are collinear; the question becomes
  // whether they overlap along their shared line.
  if (d1 === 0n && d2 === 0n) {
    px = a2.x * a1.d - a1.x * a2.d;
    py = a2.y * a1.d - a1.y * a2.d;
    d1 = dot(b1x, px, b1y, py);
    d2 = dot(b2x, px, b2y, py);
    if (d1 < 0n && d2 < 0n) return false;
    const d3 = dot(px, px, py, py);
    if (d1 > d3 && d2 > d3) return false;
  }

  // Now do the symmetric check the other way round (verbatim from C,
  // including its use of `b1.d` in the b2x/b2y construction).
  b1x = a1.x * b1.d - b1.x * a1.d;
  b1y = a1.y * b1.d - b1.y * a1.d;
  b2x = a2.x * b1.d - b1.x * a2.d;
  b2y = a2.y * b1.d - b1.y * a2.d;
  px = b1.y * b2.d - b2.y * b1.d;
  py = b2.x * b1.d - b1.x * b2.d;
  d1 = dot(b1x, px, b1y, py);
  d2 = dot(b2x, px, b2y, py);
  if ((d1 > 0n && d2 > 0n) || (d1 < 0n && d2 < 0n)) return false;

  return true;
}

/**
 * Recompute the per-edge crossing flags and the completed status for a
 * set of positions (upstream `mark_crossings`). Only **non-adjacent**
 * edge pairs are tested — edges sharing a vertex never "cross" in the
 * puzzle's sense.
 */
export function findCrossings(
  pts: readonly RationalPoint[],
  edges: readonly Edge[],
): { crosses: boolean[]; completed: boolean; count: number } {
  const crosses = new Array<boolean>(edges.length).fill(false);
  let completed = true;
  // Number of crossing *pairs* — a finer objective for the hint heuristic
  // than the count of crossed edges (one bad vertex can be on many pairs).
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const e2 = edges[j];
      if (e2.a === e.a || e2.a === e.b || e2.b === e.a || e2.b === e.b) continue;
      if (cross(pts[e2.a], pts[e2.b], pts[e.a], pts[e.b])) {
        completed = false;
        crosses[i] = true;
        crosses[j] = true;
        count++;
      }
    }
  }
  return { crosses, completed, count };
}

/**
 * Place `n` points evenly on a circle inside the box `(0,0)..(w,w)`
 * (upstream `make_circle`). Denominator fixed at `PREFERRED_TILESIZE` to
 * bound integer growth. The integer truncations and the `+0.5` rounding
 * mirror the C exactly (the generator's Phase B crossing test depends on
 * these positions).
 */
export function makeCircle(n: number, w: number): RationalPoint[] {
  const d = PREFERRED_TILESIZE;
  const c = Math.trunc((d * w) / 2);
  const r = Math.trunc((d * w * 3) / 7);
  const pts: RationalPoint[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i * 2 * PI) / n;
    const x = r * Math.sin(angle);
    const y = -r * Math.cos(angle);
    pts.push({
      x: Math.floor(c + x + 0.5),
      y: Math.floor(c + y + 0.5),
      d,
    });
  }
  return pts;
}

/** Build the shared `edges`/`edgeSet` for a state from a sorted list of
 * `(a,b)` pairs (already `a < b`). Frozen so it can be shared safely. */
export function buildEdges(
  pairs: readonly Edge[],
  n: number,
): { edges: readonly Edge[]; edgeSet: ReadonlySet<number> } {
  const edges = pairs.map((e) => Object.freeze({ a: e.a, b: e.b }));
  Object.freeze(edges);
  const edgeSet = new Set<number>(edges.map((e) => packEdge(e.a, e.b, n)));
  return { edges, edgeSet };
}

/**
 * Parse Untangle's edges-only desc — a comma-separated list of
 * dash-separated zero-based vertex pairs (`min-max,...`) — into a sorted,
 * deduplicated edge list. Mirrors `new_game`'s desc walk.
 */
export function decodeGame(desc: string, n: number): Edge[] {
  const seen = new Set<number>();
  const edges: Edge[] = [];
  if (desc.length === 0) return edges;
  for (const part of desc.split(",")) {
    const m = /^(\d+)-(\d+)$/.exec(part);
    if (!m) throw new Error(`bad edge "${part}" in untangle desc`);
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a < 0 || a >= n || b < 0 || b >= n || a === b) {
      throw new Error(`edge "${part}" out of range for n=${n}`);
    }
    const key = packEdge(a, b, n);
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ a: Math.min(a, b), b: Math.max(a, b) });
  }
  edges.sort((p, q) => p.a - q.a || p.b - q.b);
  return edges;
}

/** Parse the generator's `aux` solved layout (`S` then `P<i>:x,y/d`
 * per vertex, `;`-separated) into rational points, or `null` if it is
 * absent or malformed. Shared by `solve` and the aux-based hint. */
export function parseAux(aux: string | undefined, n: number): RationalPoint[] | null {
  if (!aux || aux[0] !== "S") return null;
  const parts = aux
    .slice(1)
    .split(";")
    .filter((p) => p.length > 0);
  if (parts.length !== n) return null;
  const pts: RationalPoint[] = [];
  for (let i = 0; i < n; i++) {
    const m = /^P(\d+):(-?\d+),(-?\d+)\/(\d+)$/.exec(parts[i]);
    if (!m || Number(m[1]) !== i) return null;
    pts.push({ x: Number(m[2]), y: Number(m[3]), d: Number(m[4]) });
  }
  return pts;
}

/** The 8 dihedral (rotate/reflect) transforms of the square, as the
 * 2×2 matrix `[m0 m1; m2 m3]` (upstream `solve`'s `matrix`). */
function dihedralMatrix(i: number): [number, number, number, number] {
  const mat: [number, number, number, number] = [0, 0, 0, 0];
  mat[i & 1] = i & 2 ? 1 : -1;
  mat[3 - (i & 1)] = i & 4 ? 1 : -1;
  return mat;
}

/** The aux solved layout transformed by whichever of the 8 dihedral
 * symmetries sits closest to the current positions (so the suggested
 * motion is minimal), returned in **model units** (`x/d` divided out,
 * centred on the board's `w/2`). Faithful to upstream `solve`'s symmetry
 * search; `solve` and the aux hint both build on it. */
export function dihedralSolvedUnits(
  curr: UntangleState,
  auxPts: readonly RationalPoint[],
): { x: number; y: number }[] {
  const n = curr.n;
  const cx = curr.w / 2;
  const cy = curr.w / 2;
  let besti = -1;
  let bestd = 0;
  for (let i = 0; i < 8; i++) {
    const mat = dihedralMatrix(i);
    let d = 0;
    for (let j = 0; j < n; j++) {
      const px = auxPts[j].x / auxPts[j].d - cx;
      const py = auxPts[j].y / auxPts[j].d - cy;
      const ox = mat[0] * px + mat[1] * py + cx;
      const oy = mat[2] * px + mat[3] * py + cy;
      const sx = curr.pts[j].x / curr.pts[j].d;
      const sy = curr.pts[j].y / curr.pts[j].d;
      d += (ox - sx) ** 2 + (oy - sy) ** 2;
    }
    if (besti < 0 || bestd > d) {
      besti = i;
      bestd = d;
    }
  }
  const mat = dihedralMatrix(besti);
  return auxPts.map((p) => {
    const px = p.x / p.d - cx;
    const py = p.y / p.d - cy;
    return { x: mat[0] * px + mat[1] * py + cx, y: mat[2] * px + mat[3] * py + cy };
  });
}

/** Clone a state for an `executeMove`: deep-copy the per-move `pts`,
 * share the immutable topology by reference. `crosses`/`completed` are
 * overwritten by the caller, so they are shared here cheaply. */
export function cloneUntangleState(s: UntangleState): UntangleState {
  return {
    n: s.n,
    w: s.w,
    pts: s.pts.map((p) => ({ x: p.x, y: p.y, d: p.d })),
    edges: s.edges,
    edgeSet: s.edgeSet,
    crosses: s.crosses,
    completed: s.completed,
    cheated: s.cheated,
    justSolved: s.justSolved,
  };
}
