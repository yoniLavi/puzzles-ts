/**
 * "Vigorous trimming" of a freshly-generated grid — the idiomatic TS port of
 * upstream `grid_trim_vigorously` (`grid.c:378`).
 *
 * The four aperiodic tilings (Penrose P2/P3, hats, spectres) cannot generate a
 * tidy rectangle: each emits every tile that falls entirely inside a bounding
 * box and stops, which leaves a ragged fringe of faces clinging to the edge by
 * a single dot. This deletes them, keeping only faces adjacent to at least one
 * **landlocked** dot (one not touching the infinite exterior), and only those
 * landlocked dots forming a single connected component.
 *
 * It operates on a grid satisfying `makeConsistent`'s *pre*conditions — faces
 * know their clockwise dots, there are no edges yet, and dots have no rings —
 * so it is pure combinatorics on the face→dots lists. **Call it before
 * `makeConsistent`.**
 *
 * ## Why this is not a transcription of the C
 *
 * Upstream builds a dense `int[numDots²]` matrix mapping each ordered dot pair
 * to the face in which one dot immediately follows the other — a
 * directed-half-edge → face map — then scans all `numDots²` cells twice.
 *
 * Two observations collapse that. First, **the stored face index is never read
 * back**: `dotpairs` appears on the right-hand side of nothing but a `>= 0`
 * presence test, so the matrix is really a *set* of directed half-edges wearing
 * an `int[]` costume. Second, both queries it answers are per-dot neighbourhood
 * questions, not global ones:
 *
 * - a dot is landlocked iff its successor set equals its predecessor set (every
 *   half-edge out of it has a mirror-image half-edge back in — i.e. every edge
 *   at that dot has faces on both sides);
 * - landlocked dots are merged pairwise when both directions are present.
 *
 * So we build the adjacency directly (`succ`/`pred`) and answer both in
 * O(degree), taking the whole pass from O(dots²) to O(edges) in **both time and
 * space**. That is a requirement rather than a nicety here: dots scale as
 * O(w·h), so the dense matrix scales as O((w·h)²) — about 1 MB for a 10×10
 * spectre patch, ~36 MB at 25×25, and ~576 MB at 50×50, which does not run in a
 * browser worker. Upstream gets away with it because it is not in a tab.
 *
 * The result is identical because presence is all the C ever tests.
 */

import { Dsf } from "./dsf.ts";
import type { Grid } from "./grid-core.ts";

/** Raised when trimming leaves nothing behind. */
export class GridTrimmedAwayError extends Error {
  constructor() {
    super("grid: vigorous trimming left no faces (no landlocked dots)");
    this.name = "GridTrimmedAwayError";
  }
}

export function gridTrimVigorously(g: Grid): void {
  const numDots = g.dots.length;

  // ====== Stage 1: directed adjacency ======
  // `succ[a]` holds every dot that immediately follows `a` around some face;
  // `pred[a]` the reverse. Upstream's matrix also recorded *which* face, but
  // never consulted it.
  const succ: Set<number>[] = Array.from({ length: numDots }, () => new Set());
  const pred: Set<number>[] = Array.from({ length: numDots }, () => new Set());
  for (const f of g.faces) {
    // biome-ignore lint/style/noNonNullAssertion: face dots are all set by now.
    let dot0 = f.dots[f.order - 1]!.index;
    for (let j = 0; j < f.order; j++) {
      // biome-ignore lint/style/noNonNullAssertion: face dots are all set by now.
      const dot1 = f.dots[j]!.index;
      succ[dot0].add(dot1);
      pred[dot1].add(dot0);
      dot0 = dot1;
    }
  }

  // ====== Stage 2: landlocked dots ======
  // Set equality, which given both are sets reduces to equal sizes plus
  // one-way containment. (A self-pair, if a degenerate face produced one, lands
  // in both sets and cancels — exactly as C's `x ^ x` did.)
  const landlocked: boolean[] = new Array(numDots).fill(false);
  for (let i = 0; i < numDots; i++) {
    if (succ[i].size !== pred[i].size) continue;
    let ok = true;
    for (const j of succ[i]) {
      if (!pred[i].has(j)) {
        ok = false;
        break;
      }
    }
    landlocked[i] = ok;
  }

  // ====== Stage 3: unify connected landlocked pairs ======
  // Merge order is preserved exactly: upstream walks `i` ascending and `j` from
  // 0 to i-1 ascending, and the dsf's tie-break makes the *root* depend on that
  // order. The root then picks which component wins a size tie in stage 4, so
  // this ordering is observable in principle. Sorting costs nothing here.
  const dsf = new Dsf(numDots);
  for (let i = 0; i < numDots; i++) {
    if (!landlocked[i]) continue;
    const partners: number[] = [];
    for (const j of succ[i]) {
      if (j < i && landlocked[j] && pred[i].has(j)) partners.push(j);
    }
    partners.sort((a, b) => a - b);
    for (const j of partners) dsf.merge(i, j);
  }

  // ====== Stage 4: largest component ======
  // Strictly-greater comparison, so a size tie goes to the lowest root index.
  let best: number | null = null;
  let bestSize = 0;
  for (let i = 0; i < numDots; i++) {
    if (!landlocked[i] || dsf.canonify(i) !== i) continue;
    const size = dsf.size(i);
    if (size > bestSize) {
      best = i;
      bestSize = size;
    }
  }
  if (best === null) {
    // Upstream's modern aperiodic paths would hand back an empty grid here;
    // only the legacy Penrose path checked. An empty grid surfaces far from its
    // cause (a puzzle with no faces to clue), so fail at the source instead.
    throw new GridTrimmedAwayError();
  }

  // ====== Stage 5: select survivors ======
  // A face is kept if *any* of its dots is in the winning component; then every
  // dot of a kept face is kept, so coastal dots survive by association. (They
  // are never merged, so they can never select a face on their own.)
  const keepFace: boolean[] = new Array(g.faces.length).fill(false);
  const keepDot: boolean[] = new Array(numDots).fill(false);
  for (const f of g.faces) {
    let keep = false;
    for (let k = 0; k < f.order; k++) {
      // biome-ignore lint/style/noNonNullAssertion: face dots are all set by now.
      if (dsf.canonify(f.dots[k]!.index) === best) {
        keep = true;
        break;
      }
    }
    if (!keep) continue;
    keepFace[f.index] = true;
    for (let k = 0; k < f.order; k++) {
      // biome-ignore lint/style/noNonNullAssertion: face dots are all set by now.
      keepDot[f.dots[k]!.index] = true;
    }
  }

  // ====== Stage 6: compact in place, preserving relative order ======
  // Indices are renumbered densely; this is the only writer of `index` besides
  // construction. GC replaces upstream's per-object frees.
  g.faces = g.faces.filter((f) => keepFace[f.index]);
  g.faces.forEach((f, i) => {
    f.index = i;
  });
  g.dots = g.dots.filter((d) => keepDot[d.index]);
  g.dots.forEach((d, i) => {
    d.index = i;
  });
}
