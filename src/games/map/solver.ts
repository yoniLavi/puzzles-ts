/**
 * Map's graph-colouring solver (upstream `map_solver`), graded by difficulty:
 *   - EASY   — place a region with exactly one possible colour left;
 *   - NORMAL — exclude a shared colour pair from the common neighbours of an
 *              adjacent same-two-possibilities pair;
 *   - HARD   — forcing-chain BFS;
 *   - RECURSE — guess and verify (also proves uniqueness at every level).
 *
 * Returns the three-valued verdict: 0 = impossible, 1 = unique solution,
 * 2 = stuck (ambiguous or too hard for the given difficulty).
 */

import { graphAdjacent, graphVertexStart } from "./graph.ts";
import { DIFF_EASY, DIFF_HARD, DIFF_NORMAL, DIFF_RECURSE, DIFFCOUNT } from "./state.ts";

const FOUR = 4;

export const SOLVER_IMPOSSIBLE = 0;
export const SOLVER_UNIQUE = 1;
export const SOLVER_STUCK = 2;

interface Scratch {
  possible: Uint8Array;
  graph: Int32Array;
  n: number;
  ngraph: number;
  bfsqueue: Int32Array;
  bfscolour: Int32Array;
  depth: number;
}

function newScratch(graph: Int32Array, n: number, ngraph: number): Scratch {
  return {
    possible: new Uint8Array(n),
    graph,
    n,
    ngraph,
    bfsqueue: new Int32Array(n),
    bfscolour: new Int32Array(n),
    depth: 0,
  };
}

/** Count the (up to four) set bits of a colour bitmask. */
function bitcount(word: number): number {
  let w = ((word & 0xa) >> 1) + (word & 0x5);
  w = ((w & 0xc) >> 2) + (w & 0x3);
  return w;
}

/**
 * Fix `index` to `colour`, ruling that colour out of every neighbour. Returns
 * false iff `colour` was not a possibility for `index`.
 */
function placeColour(
  sc: Scratch,
  colouring: Int32Array,
  index: number,
  colour: number,
): boolean {
  const { graph, n, ngraph } = sc;
  if (!(sc.possible[index] & (1 << colour))) return false;

  sc.possible[index] = 1 << colour;
  colouring[index] = colour;

  for (
    let j = graphVertexStart(graph, n, ngraph, index);
    j < ngraph && graph[j] < n * (index + 1);
    j++
  ) {
    const k = graph[j] - index * n;
    sc.possible[k] &= ~(1 << colour);
  }
  return true;
}

function solve(
  sc: Scratch,
  graph: Int32Array,
  n: number,
  ngraph: number,
  colouring: Int32Array,
  difficulty: number,
): number {
  if (sc.depth === 0) {
    for (let i = 0; i < n; i++) sc.possible[i] = (1 << FOUR) - 1;
    for (let i = 0; i < n; i++)
      if (colouring[i] >= 0) {
        if (!placeColour(sc, colouring, i, colouring[i])) {
          return SOLVER_IMPOSSIBLE; // clues aren't even consistent
        }
      }
  }

  // Deduction loop.
  for (;;) {
    let doneSomething = false;

    if (difficulty < DIFF_EASY) break;

    // EASY: a region with exactly one possible colour.
    for (let i = 0; i < n; i++)
      if (colouring[i] < 0) {
        const p = sc.possible[i];
        if (p === 0) return SOLVER_IMPOSSIBLE; // inconsistent
        if ((p & (p - 1)) === 0) {
          let c = 0;
          for (; c < FOUR; c++) if (p === 1 << c) break;
          placeColour(sc, colouring, i, c);
          doneSomething = true;
        }
      }
    if (doneSomething) continue;

    if (difficulty < DIFF_NORMAL) break;

    // NORMAL: an adjacent pair sharing the same two possibilities forces both
    // colours between them, so any common neighbour can be neither.
    for (let i = 0; i < ngraph; i++) {
      const j1 = Math.floor(graph[i] / n);
      const j2 = graph[i] % n;
      if (j1 > j2) continue;
      if (colouring[j1] >= 0 || colouring[j2] >= 0) continue;
      if (sc.possible[j1] !== sc.possible[j2]) continue;

      const v = sc.possible[j1];
      let v2 = v & -v; // lowest set bit
      v2 = v & ~v2; // clear it
      if (v2 === 0 || (v2 & (v2 - 1)) !== 0) continue; // not exactly two bits

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

    // HARD: forcing chains. BFS from each two-colour region for each of its
    // colours; if ruling out colour C at one end forces C at the other, and
    // both ends share a third neighbour still holding C, rule out C there.
    for (let i = 0; i < n; i++) {
      if (colouring[i] >= 0 || bitcount(sc.possible[i]) !== 2) continue;

      for (let c = 0; c < FOUR; c++)
        if (sc.possible[i] & (1 << c)) {
          const origc = 1 << c;
          for (let j = 0; j < n; j++) sc.bfscolour[j] = -1;
          let head = 0;
          let tail = 0;
          sc.bfsqueue[tail++] = i;
          sc.bfscolour[i] = sc.possible[i] & ~origc;

          while (head < tail) {
            const j = sc.bfsqueue[head++];
            const currc = sc.bfscolour[j];

            for (
              let gi = graphVertexStart(graph, n, ngraph, j);
              gi < ngraph && graph[gi] < n * (j + 1);
              gi++
            ) {
              const k = graph[gi] - j * n;

              if (
                sc.bfscolour[k] < 0 &&
                colouring[k] < 0 &&
                bitcount(sc.possible[k]) === 2 &&
                sc.possible[k] & currc
              ) {
                sc.bfsqueue[tail++] = k;
                sc.bfscolour[k] = sc.possible[k] & ~currc;
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

  // A complete solution?
  let complete = true;
  for (let i = 0; i < n; i++)
    if (colouring[i] < 0) {
      complete = false;
      break;
    }
  if (complete) return SOLVER_UNIQUE;

  if (difficulty < DIFF_RECURSE) return SOLVER_STUCK;

  // Recurse on a most-constrained region.
  let best = -1;
  let bestc = FOUR + 1;
  for (let i = 0; i < n; i++)
    if (colouring[i] < 0) {
      const c = bitcount(sc.possible[i]);
      if (c < bestc) {
        best = i;
        bestc = c;
      }
    }

  const rsc = newScratch(graph, n, ngraph);
  rsc.depth = sc.depth + 1;
  const origcolouring = colouring.slice();
  const subcolouring = new Int32Array(n);
  let weAlreadyGotOne = false;
  let ret = SOLVER_IMPOSSIBLE;

  for (let i = 0; i < FOUR; i++) {
    if (!(sc.possible[best] & (1 << i))) continue;

    rsc.possible.set(sc.possible);
    subcolouring.set(origcolouring);
    placeColour(rsc, subcolouring, best, i);

    const subret = solve(rsc, graph, n, ngraph, subcolouring, difficulty);

    if (subret === SOLVER_STUCK || (subret === SOLVER_UNIQUE && weAlreadyGotOne)) {
      ret = SOLVER_STUCK;
      break;
    }
    if (subret === SOLVER_UNIQUE) {
      colouring.set(subcolouring);
      weAlreadyGotOne = true;
      ret = SOLVER_UNIQUE;
    }
  }

  return ret;
}

/**
 * Solve `colouring` (mutated in place) at `difficulty`. Returns the three-valued
 * verdict. `colouring` should hold clue colours (0..3) and -1 elsewhere.
 */
export function mapSolver(
  graph: Int32Array,
  n: number,
  ngraph: number,
  colouring: Int32Array,
  difficulty: number,
): number {
  const sc = newScratch(graph, n, ngraph);
  return solve(sc, graph, n, ngraph, colouring, difficulty);
}

/**
 * Grade a board: the easiest difficulty at which it is uniquely solvable, or
 * null if none (matches the C standalone rater). `clues` is the immutable clue
 * colouring (0..3 / -1).
 */
export function gradeMap(
  graph: Int32Array,
  n: number,
  ngraph: number,
  clues: Int32Array,
): number | null {
  for (let diff = 0; diff < DIFFCOUNT; diff++) {
    const colouring = clues.slice();
    if (mapSolver(graph, n, ngraph, colouring, diff) === SOLVER_UNIQUE) {
      return diff;
    }
  }
  return null;
}
