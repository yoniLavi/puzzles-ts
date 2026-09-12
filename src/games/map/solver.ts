/**
 * Map's graph-coloring solver (upstream `map_solver`), graded by tier:
 *   - DIFF_EASY    — place a region with exactly one possible color left;
 *   - DIFF_NORMAL  — exclude a shared color pair from the common neighbors of
 *                    an adjacent same-two-possibilities pair;
 *   - DIFF_HARD    — forcing-chain BFS (the "Tricky" tier);
 *   - DIFF_RECURSE — guess and verify (also proves uniqueness at every level).
 */

import { graphAdjacent, graphVertexStart } from "./graph.ts";
import { DIFF_EASY, DIFF_HARD, DIFF_NORMAL, DIFF_RECURSE, DIFFCOUNT } from "./state.ts";

const FOUR = 4;

export const SOLVER_IMPOSSIBLE = 0;
export const SOLVER_UNIQUE = 1;
/** Ambiguous, or too hard for the given difficulty. */
export const SOLVER_STUCK = 2;

interface Scratch {
  possible: Uint8Array;
  graph: Int32Array;
  n: number;
  ngraph: number;
  bfsqueue: Int32Array;
  bfscolor: Int32Array;
  depth: number;
}

function newScratch(graph: Int32Array, n: number, ngraph: number): Scratch {
  return {
    possible: new Uint8Array(n),
    graph,
    n,
    ngraph,
    bfsqueue: new Int32Array(n),
    bfscolor: new Int32Array(n),
    depth: 0,
  };
}

/** Count the (up to four) set bits of a color bitmask. */
function bitcount(word: number): number {
  let w = ((word & 0xa) >> 1) + (word & 0x5);
  w = ((w & 0xc) >> 2) + (w & 0x3);
  return w;
}

/**
 * Fix `index` to `color`, ruling that color out of every neighbor. Returns
 * false iff `color` was not a possibility for `index`.
 */
function placeColor(
  sc: Scratch,
  coloring: Int32Array,
  index: number,
  color: number,
): boolean {
  const { graph, n, ngraph } = sc;
  if (!(sc.possible[index] & (1 << color))) return false;

  sc.possible[index] = 1 << color;
  coloring[index] = color;

  for (
    let j = graphVertexStart(graph, n, ngraph, index);
    j < ngraph && graph[j] < n * (index + 1);
    j++
  ) {
    const k = graph[j] - index * n;
    sc.possible[k] &= ~(1 << color);
  }
  return true;
}

// One deduction engine, one loop: the difficulty tiers are caps on how far down
// this ladder the solver may go, so every rung has to be reachable from the same
// fixpoint and see the same state. Splitting the rungs into functions would need
// the state threaded through each, and the tier cap would stop being one number.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: see above
function solve(sc: Scratch, coloring: Int32Array, difficulty: number): number {
  const { graph, n, ngraph } = sc;
  if (sc.depth === 0) {
    for (let i = 0; i < n; i++) sc.possible[i] = (1 << FOUR) - 1;
    for (let i = 0; i < n; i++)
      if (coloring[i] >= 0 && !placeColor(sc, coloring, i, coloring[i]))
        return SOLVER_IMPOSSIBLE; // clues aren't even consistent
  }

  // Deduction loop.
  for (;;) {
    let doneSomething = false;

    if (difficulty < DIFF_EASY) break;

    // EASY: a region with exactly one possible color.
    for (let i = 0; i < n; i++)
      if (coloring[i] < 0) {
        const p = sc.possible[i];
        if (p === 0) return SOLVER_IMPOSSIBLE; // inconsistent
        if ((p & (p - 1)) === 0) {
          let c = 0;
          for (; c < FOUR; c++) if (p === 1 << c) break;
          placeColor(sc, coloring, i, c);
          doneSomething = true;
        }
      }
    if (doneSomething) continue;

    if (difficulty < DIFF_NORMAL) break;

    // NORMAL: an adjacent pair sharing the same two possibilities forces both
    // colors between them, so any common neighbor can be neither.
    for (let i = 0; i < ngraph; i++) {
      const j1 = Math.floor(graph[i] / n);
      const j2 = graph[i] % n;
      if (j1 > j2) continue;
      if (coloring[j1] >= 0 || coloring[j2] >= 0) continue;
      if (sc.possible[j1] !== sc.possible[j2]) continue;

      const v = sc.possible[j1];
      if (bitcount(v) !== 2) continue;

      for (
        let j = graphVertexStart(graph, n, ngraph, j1);
        j < ngraph && graph[j] < n * (j1 + 1);
        j++
      ) {
        const k = graph[j] - j1 * n;
        if (graphAdjacent(graph, n, ngraph, k, j2) && sc.possible[k] & v) {
          sc.possible[k] &= ~v;
          doneSomething = true;
        }
      }
    }
    if (doneSomething) continue;

    if (difficulty < DIFF_HARD) break;

    // HARD: forcing chains. BFS from each two-color region for each of its
    // colors; if ruling out color C at one end forces C at the other, and
    // both ends share a third neighbor still holding C, rule out C there.
    for (let i = 0; i < n; i++) {
      if (coloring[i] >= 0 || bitcount(sc.possible[i]) !== 2) continue;

      for (let c = 0; c < FOUR; c++)
        if (sc.possible[i] & (1 << c)) {
          const origc = 1 << c;
          for (let j = 0; j < n; j++) sc.bfscolor[j] = -1;
          let head = 0;
          let tail = 0;
          sc.bfsqueue[tail++] = i;
          sc.bfscolor[i] = sc.possible[i] & ~origc;

          while (head < tail) {
            const j = sc.bfsqueue[head++];
            const currc = sc.bfscolor[j];

            for (
              let gi = graphVertexStart(graph, n, ngraph, j);
              gi < ngraph && graph[gi] < n * (j + 1);
              gi++
            ) {
              const k = graph[gi] - j * n;

              if (
                sc.bfscolor[k] < 0 &&
                coloring[k] < 0 &&
                bitcount(sc.possible[k]) === 2 &&
                sc.possible[k] & currc
              ) {
                sc.bfsqueue[tail++] = k;
                sc.bfscolor[k] = sc.possible[k] & ~currc;
              }

              if (
                currc === origc &&
                graphAdjacent(graph, n, ngraph, k, i) &&
                sc.possible[k] & currc
              ) {
                sc.possible[k] &= ~origc;
                doneSomething = true;
              }
            }
          }
        }
    }

    if (!doneSomething) break;
  }

  if (!coloring.includes(-1)) return SOLVER_UNIQUE; // every region colored

  if (difficulty < DIFF_RECURSE) return SOLVER_STUCK;

  // Recurse on a most-constrained region.
  let best = -1;
  let bestc = FOUR + 1;
  for (let i = 0; i < n; i++)
    if (coloring[i] < 0) {
      const c = bitcount(sc.possible[i]);
      if (c < bestc) {
        best = i;
        bestc = c;
      }
    }

  const rsc = newScratch(graph, n, ngraph);
  rsc.depth = sc.depth + 1;
  const origcoloring = coloring.slice();
  const subcoloring = new Int32Array(n);
  let weAlreadyGotOne = false;
  let ret = SOLVER_IMPOSSIBLE;

  for (let i = 0; i < FOUR; i++) {
    if (!(sc.possible[best] & (1 << i))) continue;

    rsc.possible.set(sc.possible);
    subcoloring.set(origcoloring);
    placeColor(rsc, subcoloring, best, i);

    const subret = solve(rsc, subcoloring, difficulty);

    if (subret === SOLVER_STUCK || (subret === SOLVER_UNIQUE && weAlreadyGotOne)) {
      ret = SOLVER_STUCK;
      break;
    }
    if (subret === SOLVER_UNIQUE) {
      coloring.set(subcoloring);
      weAlreadyGotOne = true;
      ret = SOLVER_UNIQUE;
    }
  }

  return ret;
}

/**
 * Solve `coloring` (mutated in place) at `difficulty`. Returns the three-valued
 * verdict. `coloring` should hold clue colors (0..3) and -1 elsewhere.
 */
export function mapSolver(
  graph: Int32Array,
  n: number,
  ngraph: number,
  coloring: Int32Array,
  difficulty: number,
): number {
  return solve(newScratch(graph, n, ngraph), coloring, difficulty);
}

/**
 * Grade a board: the easiest difficulty at which it is uniquely solvable, or
 * null if none (matches the C standalone rater). `clues` is the immutable clue
 * coloring (0..3 / -1).
 */
export function gradeMap(
  graph: Int32Array,
  n: number,
  ngraph: number,
  clues: Int32Array,
): number | null {
  for (let diff = 0; diff < DIFFCOUNT; diff++) {
    const coloring = clues.slice();
    if (mapSolver(graph, n, ngraph, coloring, diff) === SOLVER_UNIQUE) {
      return diff;
    }
  }
  return null;
}
