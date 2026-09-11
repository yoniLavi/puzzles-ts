/**
 * Untangle board generation — idiomatic port of `new_game_desc`
 * (untangle.c:617). Two phases:
 *
 *  A. **Planar graph.** Scatter `n` points on a shuffled
 *     `COORDLIMIT(n)²` grid, then greedily add edges: always extend the
 *     lowest-degree vertex first, trying candidate endpoints in order of
 *     distance, accepting an edge only if it crosses no existing point
 *     and no existing edge and keeps every degree ≤ `MAXDEGREE`. Planar
 *     by construction; the edge count falls out of the fill.
 *  B. **Tangle.** Lay the vertices on a circle in a shuffled order,
 *     re-rolling the permutation until at least one non-adjacent edge
 *     pair crosses — so the puzzle never starts solved.
 *
 * The desc encodes the **edges only** (sorted zero-based `a-b` pairs);
 * vertex positions are reconstructed deterministically (`make_circle`)
 * and via the move log, never the desc. The solved layout is returned as
 * `aux` (used by Solve and the hint; not persisted).
 *
 * The only randomness is the two `shuffle` calls, so over the bit-identical
 * `random.ts` this reproduces the C desc for a given seed.
 */

import type { RandomState } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import {
  coordLimit,
  cross,
  type Edge,
  makeCircle,
  packEdge,
  type RationalPoint,
  type UntangleParams,
} from "./state.ts";

const MAXDEGREE = 4;

/** A generated graph large enough to be a puzzle always admits a crossing
 * layout, so the re-roll below ends with probability 1 — but "probably" is not
 * a bound (see engine/retry-limit.ts), and a tangle is cheap to test, so allow
 * a lot of draws before concluding something is structurally wrong. */
const MAX_TANGLE_SHUFFLES = 1_000_000;

/** Does any non-adjacent edge pair cross, under the vertex permutation
 * `perm` applied to the circle layout `circle`? (Phase B's stop test,
 * and the "never start solved" guarantee.) */
function hasCrossing(
  edges: readonly Edge[],
  perm: readonly number[],
  circle: readonly RationalPoint[],
): boolean {
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const e2 = edges[j];
      if (e2.a === e.a || e2.a === e.b || e2.b === e.a || e2.b === e.b) continue;
      if (
        cross(
          circle[perm[e2.a]],
          circle[perm[e2.b]],
          circle[perm[e.a]],
          circle[perm[e.b]],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Renumber each endpoint through `mapping`, then re-sort into the canonical
 * desc string (so the original generation order is not a side channel). */
function encodeGraph(edges: readonly Edge[], mapping: readonly number[]): string {
  const mapped = edges.map((e) => {
    const ma = mapping[e.a];
    const mb = mapping[e.b];
    return { a: Math.min(ma, mb), b: Math.max(ma, mb) };
  });
  mapped.sort((p, q) => p.a - q.a || p.b - q.b);
  return mapped.map((e) => `${e.a}-${e.b}`).join(",");
}

export function newUntangleDesc(
  params: UntangleParams,
  rng: RandomState,
): { desc: string; aux: string } {
  const n = params.n;
  const w = coordLimit(n);

  // --- Phase A: scatter points, build a planar graph ----------------
  const cells = Array.from({ length: w * w }, (_, i) => i);
  shuffle(cells, rng);
  const pts: RationalPoint[] = cells
    .slice(0, n)
    .map((c) => ({ x: c % w, y: Math.floor(c / w), d: 1 }));

  const degree = new Array<number>(n).fill(0);
  const edges: Edge[] = [];
  const edgeSet = new Set<number>();
  // Edge u-v is blocked if it passes through another point or crosses an
  // existing edge (one sharing an endpoint with it cannot cross it).
  const blocked = (u: number, v: number): boolean =>
    pts.some((p, k) => k !== u && k !== v && cross(pts[u], pts[v], p, p)) ||
    edges.some(
      (e) =>
        e.a !== u &&
        e.a !== v &&
        e.b !== u &&
        e.b !== v &&
        cross(pts[u], pts[v], pts[e.a], pts[e.b]),
    );

  while (true) {
    let added = false;
    // Vertices in (degree, index) order — the tree234 ordering upstream
    // maintains incrementally, re-sorted here each pass. Ties broken by
    // index, matching `vertcmpC`.
    const order = Array.from({ length: n }, (_, i) => i).sort(
      (p, q) => degree[p] - degree[q] || p - q,
    );

    for (let i = 0; i < n; i++) {
      const j = order[i];
      if (degree[j] >= MAXDEGREE) break; // all remaining are full too

      // Candidate endpoints: vertices *after* j in the order (the edges
      // before it were already tried the other way round), excluding
      // full ones and existing neighbors, sorted by squared distance
      // then index.
      const candidates: { v: number; dist: number }[] = [];
      for (let k = i + 1; k < n; k++) {
        const v = order[k];
        if (degree[v] >= MAXDEGREE || edgeSet.has(packEdge(v, j, n))) continue;
        const dx = pts[v].x - pts[j].x;
        const dy = pts[v].y - pts[j].y;
        candidates.push({ v, dist: dx * dx + dy * dy });
      }
      candidates.sort((p, q) => p.dist - q.dist || p.v - q.v);

      const chosen = candidates.find((c) => !blocked(c.v, j))?.v;
      if (chosen !== undefined) {
        edgeSet.add(packEdge(j, chosen, n));
        edges.push({ a: Math.min(j, chosen), b: Math.max(j, chosen) });
        degree[j]++;
        degree[chosen]++;
        added = true;
        break; // restart the pass (the order is now stale)
      }
    }

    if (!added) break; // a full pass added nothing — done
  }

  // --- Phase B: lay on a circle, re-roll until tangled --------------
  const circle = makeCircle(n, w);
  const perm: number[] = Array.from({ length: n }, (_, i) => i);
  const attempt = retryLimit("untangle: tangle the layout", MAX_TANGLE_SHUFFLES);
  do {
    attempt();
    shuffle(perm, rng);
  } while (!hasCrossing(edges, perm, circle));

  const desc = encodeGraph(edges, perm);

  // --- aux: the solved layout, in the permuted (desc) numbering -----
  // Each vertex sits at the center of its grid cell, so at denominator 2.
  const solved = new Array<RationalPoint>(n);
  pts.forEach((p, i) => {
    solved[perm[i]] = { x: 2 * p.x + 1, y: 2 * p.y + 1, d: 2 };
  });
  const aux = `S${solved.map((p, i) => `;P${i}:${p.x},${p.y}/${p.d}`).join("")}`;

  return { desc, aux };
}
