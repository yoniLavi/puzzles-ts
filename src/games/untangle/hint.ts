/**
 * Untangle hint — a *non-deductive* move suggestion. Untangle has no
 * logical deduction to teach, so (by owner-approved divergence from the
 * Palisade hint quality bar) the steps carry no `explanation`: the visual
 * highlight (`render.ts`) plus the existing vertex-move animation are the
 * whole hint.
 *
 * Two strategies, dispatched by `deduceUntangleHintPlan`:
 *
 *  1. **Aux solution (primary, when known).** Freshly-generated games carry
 *     the generator's solved layout in `aux`, so the hint walks the player
 *     to it. It takes the dihedral image of the solution closest to the
 *     current positions (least motion), **rescales it to fill the play box**
 *     (a uniform scale preserves planarity, so the result is both
 *     crossing-free *and* well spaced), then places vertices one at a time,
 *     greedily choosing the order that keeps intermediate crossings lowest.
 *     The end state is the full rescaled solution: guaranteed untangled.
 *
 *  2. **Greedy heuristic (fallback, when `aux` is absent** — descriptive
 *     game ids, some loaded saves). Greedy crossing-reduction with a spread
 *     tie-break: among the vertices on a crossed edge, take only moves that
 *     strictly reduce the crossing-pair count (primary); each candidate
 *     offers the neighbor centroid plus outward-pushed variants, and among
 *     equally-untangling targets prefer the one that most reduces a
 *     pairwise clustering score (Σ 1/(distance+ε)) so the layout spreads
 *     rather than collapsing to the center (the barycentric fixed point).
 *     This can stall at a local minimum on hard boards; the aux path does
 *     not, which is why it is preferred whenever a solution is known.
 */

import type { HintResult, HintStep } from "../../engine/game.ts";
import type { Point } from "../../engine/types.ts";
import {
  dihedralSolvedUnits,
  findCrossings,
  parseAux,
  placeMove,
  type RationalPoint,
  type UntangleMove,
  type UntangleState,
} from "./state.ts";

/** Highlight payload for a displayed step: which vertex to move and to
 * where (the suggested destination). `render.ts` reads the vertex's
 * current position from the live state. */
export interface UntangleHint {
  vertex: number;
  to: RationalPoint;
}

/** Denominator for a computed target. 64 matches the circle layout's
 * denominator and gives pixel-level precision at the preferred tile size;
 * the exact-integer `cross()` is happy with any integers. */
const HINT_DENOM = 64;

/** Cap the greedy plan length so a pathological board can't spin. */
const MAX_HINT_STEPS_PER_VERTEX = 4;

/** Softening term (model units) for the clustering score, so a coincident
 * pair scores high but finite. */
const SPREAD_EPS = 0.25;

/** Keep a target this far (model units) inside the play box. */
const BOX_MARGIN = 0.3;

/** Margin (model units) when rescaling the aux solution to fill the box —
 * small, so the solved layout spreads to nearly the whole play area. */
const FILL_MARGIN = 0.25;

/** True when moving `cur` to `target` would not change its position at the
 * target's pixel resolution — i.e. the suggestion is a no-op. A fine
 * unit-distance tolerance is not enough: the aux target jitters slightly
 * between recomputes (the dihedral match + rescale depend on the current
 * positions), and a tolerance finer than that jitter re-suggests a vertex
 * already on its target pixel, forever, when hints are taken one move at a
 * time. */
function isNoOpMove(cur: RationalPoint, target: RationalPoint): boolean {
  return (
    Math.round((cur.x / cur.d) * target.d) === target.x &&
    Math.round((cur.y / cur.d) * target.d) === target.y
  );
}

/** Per-vertex adjacency from the shared edge list. */
function buildAdjacency(state: UntangleState): number[][] {
  const adj: number[][] = Array.from({ length: state.n }, () => []);
  for (const e of state.edges) {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  return adj;
}

/** Centroid of vertex's graph-neighbors in model units, or `null` if it
 * has none. */
function neighborCentroid(
  pu: readonly Point[],
  neighbors: readonly number[],
): Point | null {
  if (neighbors.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const u of neighbors) {
    sx += pu[u].x;
    sy += pu[u].y;
  }
  return { x: sx / neighbors.length, y: sy / neighbors.length };
}

/** Unit vector, or `null` if the input is ~zero. */
function normalize(x: number, y: number): Point | null {
  const m = Math.hypot(x, y);
  return m > 1e-9 ? { x: x / m, y: y / m } : null;
}

/** Direction that pushes point `c` away from the other vertices (a
 * repulsion sum), so an outward target declusters around `c`. */
function repulsionDir(pu: readonly Point[], v: number, c: Point): Point | null {
  let rx = 0;
  let ry = 0;
  for (let u = 0; u < pu.length; u++) {
    if (u === v) continue;
    const dx = c.x - pu[u].x;
    const dy = c.y - pu[u].y;
    const d2 = dx * dx + dy * dy + SPREAD_EPS * SPREAD_EPS;
    rx += dx / d2;
    ry += dy / d2;
  }
  return normalize(rx, ry);
}

/** Candidate target positions (model units) for moving vertex `v`: the
 * plain neighbor centroid plus a few outward-pushed variants that give
 * the optimizer spacious options. */
function candidateTargets(
  pu: readonly Point[],
  v: number,
  centroid: Point,
  w: number,
): Point[] {
  const targets: Point[] = [centroid];
  const dirs: Point[] = [];
  const rep = repulsionDir(pu, v, centroid);
  if (rep) dirs.push(rep);
  const radial = normalize(centroid.x - w / 2, centroid.y - w / 2);
  if (radial) dirs.push(radial);
  for (const d of dirs) {
    for (const scale of [0.15 * w, 0.35 * w]) {
      targets.push({ x: centroid.x + d.x * scale, y: centroid.y + d.y * scale });
    }
  }
  return targets;
}

/** Clamp a model-unit point into the play box and convert to an integer
 * `RationalPoint`. */
function toRational(p: Point, w: number): RationalPoint {
  const lo = BOX_MARGIN;
  const hi = Math.max(lo, w - BOX_MARGIN);
  const x = Math.min(hi, Math.max(lo, p.x));
  const y = Math.min(hi, Math.max(lo, p.y));
  return {
    x: Math.round(x * HINT_DENOM),
    y: Math.round(y * HINT_DENOM),
    d: HINT_DENOM,
  };
}

/** Vertex `v`'s clustering score at `p`: Σ 1/(distance+ε) to every other
 * vertex. Higher means more crowded; moving to a lower score spreads out.
 * Only `v`'s pairs change when `v` moves, so a before/after difference is
 * a valid spread delta. */
function clusteringAt(pu: readonly Point[], v: number, p: Point): number {
  let s = 0;
  for (let u = 0; u < pu.length; u++) {
    if (u === v) continue;
    s += 1 / (Math.hypot(p.x - pu[u].x, p.y - pu[u].y) + SPREAD_EPS);
  }
  return s;
}

function step(vertex: number, to: RationalPoint): HintStep<UntangleMove, UntangleHint> {
  return { move: placeMove(vertex, to), explanation: "", highlights: { vertex, to } };
}

/**
 * Hint plan from the known solution (`aux`): rescale the dihedral-matched
 * solved layout to fill the play box, then place vertices one at a time in
 * the order that keeps intermediate crossings lowest. Returns `null` if no
 * usable solution is available (caller falls back to the heuristic).
 */
function deduceAuxPlan(
  state: UntangleState,
  aux: string,
): HintResult<UntangleMove, UntangleHint> | null {
  const auxPts = parseAux(aux, state.n);
  if (auxPts === null) return null;

  // Dihedral-matched solved positions (model units), then rescaled about
  // their center to fill the play box — a uniform scale, so still planar.
  const solved = dihedralSolvedUnits(state, auxPts);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of solved) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const bw = maxX - minX;
  const bh = maxY - minY;
  const avail = state.w - 2 * FILL_MARGIN;
  let scale = 1;
  if (bw > 1e-9 && bh > 1e-9) scale = Math.min(avail / bw, avail / bh);
  else if (bw > 1e-9) scale = avail / bw;
  else if (bh > 1e-9) scale = avail / bh;
  const ccx = (minX + maxX) / 2;
  const ccy = (minY + maxY) / 2;
  const targets: RationalPoint[] = solved.map((p) =>
    toRational(
      { x: state.w / 2 + (p.x - ccx) * scale, y: state.w / 2 + (p.y - ccy) * scale },
      state.w,
    ),
  );

  // Greedily assemble the solution: each step places the unplaced vertex
  // whose move to its target yields the fewest resulting crossings. A vertex
  // already on its target pixel counts as placed (a move there is a no-op).
  const pts = state.pts.slice();
  const placed = pts.map((p, v) => isNoOpMove(p, targets[v]));
  const steps: HintStep<UntangleMove, UntangleHint>[] = [];
  while (placed.includes(false)) {
    let bestV = -1;
    let bestCount = Infinity;
    for (let v = 0; v < state.n; v++) {
      if (placed[v]) continue;
      const trial = pts.slice();
      trial[v] = targets[v];
      const c = findCrossings(trial, state.edges).count;
      if (c < bestCount) {
        bestCount = c;
        bestV = v;
      }
    }
    placed[bestV] = true;
    pts[bestV] = targets[bestV];
    steps.push(step(bestV, targets[bestV]));
  }

  return steps.length > 0 ? { ok: true, steps } : null;
}

export function deduceUntangleHintPlan(
  state: UntangleState,
  aux?: string,
): HintResult<UntangleMove, UntangleHint> {
  if (state.completed) {
    return { ok: false, error: "This puzzle is already solved." };
  }
  if (aux) {
    const auxPlan = deduceAuxPlan(state, aux);
    if (auxPlan) return auxPlan;
  }

  const adj = buildAdjacency(state);
  const steps: HintStep<UntangleMove, UntangleHint>[] = [];
  const pts = state.pts.slice();
  const maxSteps = state.n * MAX_HINT_STEPS_PER_VERTEX;

  for (let iter = 0; iter < maxSteps; iter++) {
    const { crosses, completed, count } = findCrossings(pts, state.edges);
    if (completed) break;

    // Positions in model units, recomputed each step.
    const pu: Point[] = pts.map((p) => ({ x: p.x / p.d, y: p.y / p.d }));

    // Candidate vertices: those on at least one crossed edge.
    const candidates = new Set<number>();
    for (let i = 0; i < state.edges.length; i++) {
      if (crosses[i]) {
        candidates.add(state.edges[i].a);
        candidates.add(state.edges[i].b);
      }
    }

    // Pick the move with the fewest resulting crossings (primary), breaking
    // ties by the largest reduction in clustering (secondary — spread out).
    let best: {
      vertex: number;
      to: RationalPoint;
      count: number;
      spreadDelta: number;
    } | null = null;
    for (const v of candidates) {
      const centroid = neighborCentroid(pu, adj[v]);
      if (centroid === null) continue;
      const oldCluster = clusteringAt(pu, v, pu[v]);
      for (const tu of candidateTargets(pu, v, centroid, state.w)) {
        const to = toRational(tu, state.w);
        const trial = pts.slice();
        trial[v] = to;
        const c = findCrossings(trial, state.edges).count;
        if (c >= count) continue; // must strictly reduce crossings
        const spreadDelta =
          clusteringAt(pu, v, { x: to.x / to.d, y: to.y / to.d }) - oldCluster;
        if (
          best === null ||
          c < best.count ||
          (c === best.count && spreadDelta < best.spreadDelta)
        ) {
          best = { vertex: v, to, count: c, spreadDelta };
        }
      }
    }

    if (best === null) break; // local minimum: no single move helps

    pts[best.vertex] = best.to;
    steps.push(step(best.vertex, best.to));
  }

  if (steps.length === 0) {
    return {
      ok: false,
      error: "No single move reduces the crossings, so try moving a tangled vertex.",
    };
  }
  return { ok: true, steps };
}
