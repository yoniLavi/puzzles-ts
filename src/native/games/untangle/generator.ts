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
 * `aux` (used by Solve; not persisted).
 *
 * The only randomness is the two `shuffle` calls; everything else is a
 * deterministic function of them, so over the bit-identical `random.ts`
 * a faithful port reproduces the C desc for a given seed.
 */

import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
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

/** Relabel and re-sort edges into the canonical desc string. With
 * `mapping`, each endpoint is renumbered through it (then re-sorted so
 * the original generation order is not a side channel). */
function encodeGraph(
  edges: readonly Edge[],
  mapping: readonly number[] | null,
): string {
  const mapped = edges.map((e) => {
    const ma = mapping ? mapping[e.a] : e.a;
    const mb = mapping ? mapping[e.b] : e.b;
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
  const h = w;

  // --- Phase A: scatter points, build a planar graph ----------------
  const tmp: number[] = Array.from({ length: w * h }, (_, i) => i);
  shuffle(tmp, rng);
  const pts: RationalPoint[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({ x: tmp[i] % w, y: Math.floor(tmp[i] / w), d: 1 });
  }

  const degree = new Array<number>(n).fill(0);
  const edges: Edge[] = [];
  const edgeSet = new Set<number>();
  const isedge = (a: number, b: number): boolean => edgeSet.has(packEdge(a, b, n));
  const addEdge = (a: number, b: number): void => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = packEdge(lo, hi, n);
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ a: lo, b: hi });
  };

  while (true) {
    let added = false;
    // Vertices in (degree, index) order — the tree234 ordering upstream
    // maintains incrementally; we re-sort each pass (degrees just
    // changed). Ties broken by index, matching `vertcmpC`.
    const order = Array.from({ length: n }, (_, i) => i).sort(
      (p, q) => degree[p] - degree[q] || p - q,
    );

    for (let i = 0; i < n; i++) {
      const j = order[i];
      if (degree[j] >= MAXDEGREE) break; // all remaining are full too

      // Candidate endpoints: vertices *after* j in the order (the edges
      // before it were already tried the other way round), excluding
      // full ones and existing neighbours, sorted by squared distance
      // then index.
      const vlist: { vindex: number; dist: number }[] = [];
      for (let k = i + 1; k < n; k++) {
        const ki = order[k];
        if (degree[ki] >= MAXDEGREE || isedge(ki, j)) continue;
        const dx = pts[ki].x - pts[j].x;
        const dy = pts[ki].y - pts[j].y;
        vlist.push({ vindex: ki, dist: dx * dx + dy * dy });
      }
      vlist.sort((p, q) => p.dist - q.dist || p.vindex - q.vindex);

      let chosen = -1;
      for (const cand of vlist) {
        const ki = cand.vindex;
        // Reject if the new edge passes through any other point.
        let bad = false;
        for (let p = 0; p < n; p++) {
          if (p !== ki && p !== j && cross(pts[ki], pts[j], pts[p], pts[p])) {
            bad = true;
            break;
          }
        }
        if (bad) continue;
        // Reject if it crosses any existing edge (not sharing an endpoint).
        bad = false;
        for (const e of edges) {
          if (
            e.a !== ki &&
            e.a !== j &&
            e.b !== ki &&
            e.b !== j &&
            cross(pts[ki], pts[j], pts[e.a], pts[e.b])
          ) {
            bad = true;
            break;
          }
        }
        if (bad) continue;
        chosen = ki;
        break;
      }

      if (chosen >= 0) {
        addEdge(j, chosen);
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
  const solved = new Array<RationalPoint>(n);
  for (let i = 0; i < n; i++) {
    const j = perm[i];
    let { x, y, d } = pts[i];
    if (d & 1) {
      x *= 2;
      y *= 2;
      d *= 2;
    }
    x += Math.trunc(d / 2);
    y += Math.trunc(d / 2);
    solved[j] = { x, y, d };
  }
  let aux = "S";
  for (let i = 0; i < n; i++) {
    const p = solved[i];
    aux += `;P${i}:${p.x},${p.y}/${p.d}`;
  }

  return { desc, aux };
}
