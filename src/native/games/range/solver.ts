/**
 * Range solver, error-checker, and generator — port of the solver and
 * `new_game_desc` subsystems of `range.c`.
 *
 * The deductive solver applies, to a fixpoint, three sound rules
 * (run-length "not too big", black-adjacency, and white-connectedness
 * via biconnected-component cut vertices). Upstream additionally has a
 * recursion rule; we expose a clean, correctness-validated `fullSolve`
 * (deduction + DPLL guessing, every completed grid checked by
 * `findErrors`) for the Solve command and `findMistakes`, while
 * generation uses only the three deductive rules — a board is kept only
 * if it is uniquely solvable without any guessing, exactly as upstream.
 */

import { Dsf } from "../../engine/dsf.ts";
import { shuffle as shuffleArray } from "../../engine/shuffle.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { RandomState } from "../../random/index.ts";
import { BLACK, EMPTY, idx, outOfBounds, type RangeParams, WHITE } from "./state.ts";

const DR = [1, 0, -1, 0];
const DC = [0, 1, 0, -1];

// Cell-state bit masks: BLACK/WHITE/EMPTY (−2/−1/0) map to bits 0/1/2
// via `1 << (v + 2)`. `HIGH` is every bit above bit 2 — a clue cell
// (grid > 0) is counted by a run iff the mask carries some high bit
// (i.e. the run was built to include "positive" values).
const MASK_BLACK = 1; // 1 << (BLACK + 2)
const MASK_EMPTY = 4; // 1 << (EMPTY + 2)
const HIGH = ~(MASK_BLACK | (1 << (WHITE + 2)) | MASK_EMPTY); // ~7

/** Length of the run of cells from (r,c) along (dr,dc) whose state
 * matches `mask`; a clue cell matches iff `mask` carries a high bit. */
function runLength(
  grid: Int8Array,
  w: number,
  h: number,
  r0: number,
  c0: number,
  dr: number,
  dc: number,
  mask: number,
): number {
  let r = r0;
  let c = c0;
  let sz = 0;
  for (;;) {
    if (outOfBounds(r, c, w, h)) break;
    const v = grid[idx(r, c, w)];
    if (v > 0) {
      if (!(mask & HIGH)) break;
    } else if (!((1 << (v + 2)) & mask)) {
      break;
    }
    sz++;
    r += dr;
    c += dc;
  }
  return sz;
}

/** Set an EMPTY in-bounds cell; returns true iff it actually changed
 * (upstream `solver_makemove` skips non-EMPTY cells silently). */
function makeMove(
  grid: Int8Array,
  w: number,
  h: number,
  r: number,
  c: number,
  value: number,
): boolean {
  if (outOfBounds(r, c, w, h)) return false;
  const cell = idx(r, c, w);
  if (grid[cell] !== EMPTY) return false;
  grid[cell] = value;
  return true;
}

export interface Clue {
  r: number;
  c: number;
}

export interface Cell {
  r: number;
  c: number;
}

/** Why a cell is forced — the premise the hint narrates and highlights. */
export type HintReason =
  | { kind: "adjacency"; from: Cell } // a neighbour of this black must be white
  | { kind: "satisfied"; clue: Cell; n: number } // clue's run is full → cap it black
  | { kind: "overrun"; clue: Cell; n: number } // white here would exceed the clue
  | { kind: "reach"; clue: Cell; n: number } // clue can only reach its count this way
  | { kind: "connect" }; // black here would disconnect the white region

export interface HintMove {
  r: number;
  c: number;
  value: number;
  reason: HintReason;
  /** The solver's working grid at the moment this move fired (this move
   * and every prior deduction applied) — the board state the hint's area
   * highlight is computed against, so the shaded run reflects what the
   * player sees as they follow the plan. */
  grid: Int8Array;
}

/** Invoked at each forced cell when the deduction is run for a hint. */
export type Recorder = (
  r: number,
  c: number,
  value: number,
  reason: HintReason,
) => void;

export function findClues(grid: Int8Array, w: number, h: number): Clue[] {
  const clues: Clue[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (grid[idx(r, c, w)] > 0) clues.push({ r, c });
    }
  }
  return clues;
}

// --- the three deductive rules ---------------------------------------------

/** A cell orthogonally adjacent to a black cell must be white. */
function ruleAdjacency(grid: Int8Array, w: number, h: number, rec?: Recorder): number {
  let made = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (grid[idx(r, c, w)] !== BLACK) continue;
      for (let j = 0; j < 4; j++) {
        const rr = r + DR[j];
        const cc = c + DC[j];
        if (makeMove(grid, w, h, rr, cc, WHITE)) {
          made++;
          rec?.(rr, cc, WHITE, { kind: "adjacency", from: { r, c } });
        }
      }
    }
  }
  return made;
}

// RUN_WHITE / RUN_EMPTY / RUN_BEYOND / RUN_SPACE masks (upstream order).
const RUNMASKS = [
  ~(MASK_BLACK | MASK_EMPTY),
  MASK_EMPTY,
  ~(MASK_BLACK | MASK_EMPTY),
  ~MASK_BLACK,
];
const RUN_WHITE = 0;
const RUN_EMPTY = 1;
const RUN_BEYOND = 2;
const RUN_SPACE = 3;

/** A clue's run-length arithmetic: place forced blacks where the clue is
 * already satisfied or would be overrun, and forced whites the clue must
 * still reach. Faithful port of `solver_reasoning_not_too_big`. */
function ruleNotTooBig(
  grid: Int8Array,
  w: number,
  h: number,
  clues: Clue[],
  rec?: Recorder,
): number {
  let made = 0;
  // runlengths[k][j]: run of kind k in direction j.
  const rl: number[][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (const { r: row, c: col } of clues) {
    const clue = grid[idx(row, col, w)];

    for (let j = 0; j < 4; j++) {
      let r = row + DR[j];
      let c = col + DC[j];
      rl[RUN_SPACE][j] = 0;
      for (let k = 0; k <= RUN_SPACE; k++) {
        const l = runLength(grid, w, h, r, c, DR[j], DC[j], RUNMASKS[k]);
        if (k < RUN_SPACE) {
          rl[k][j] = l;
          r += DR[j] * l;
          c += DC[j] * l;
        }
        rl[RUN_SPACE][j] += l;
      }
    }

    let whites = 1;
    for (let j = 0; j < 4; j++) whites += rl[RUN_WHITE][j];

    for (let j = 0; j < 4; j++) {
      const delta = 1 + rl[RUN_WHITE][j];
      const r = row + delta * DR[j];
      const c = col + delta * DC[j];

      const clueCell: Cell = { r: row, c: col };
      if (whites === clue) {
        if (makeMove(grid, w, h, r, c, BLACK)) {
          made++;
          rec?.(r, c, BLACK, { kind: "satisfied", clue: clueCell, n: clue });
        }
        continue;
      }
      if (
        rl[RUN_EMPTY][j] === 1 &&
        whites + rl[RUN_EMPTY][j] + rl[RUN_BEYOND][j] > clue
      ) {
        if (makeMove(grid, w, h, r, c, BLACK)) {
          made++;
          rec?.(r, c, BLACK, { kind: "overrun", clue: clueCell, n: clue });
        }
        continue;
      }
      if (whites + rl[RUN_EMPTY][j] + rl[RUN_BEYOND][j] > clue) {
        rl[RUN_SPACE][j] = rl[RUN_WHITE][j] + rl[RUN_EMPTY][j] - 1;
        if (rl[RUN_EMPTY][j] === 1) {
          if (makeMove(grid, w, h, r, c, BLACK)) {
            made++;
            rec?.(r, c, BLACK, { kind: "overrun", clue: clueCell, n: clue });
          }
        }
      }
    }

    let space = 1;
    for (let j = 0; j < 4; j++) space += rl[RUN_SPACE][j];
    for (let j = 0; j < 4; j++) {
      let r = row + DR[j];
      let c = col + DC[j];
      let k = space - rl[RUN_SPACE][j];
      if (k >= clue) continue;
      for (; k < clue; k++, r += DR[j], c += DC[j]) {
        if (makeMove(grid, w, h, r, c, WHITE)) {
          made++;
          rec?.(r, c, WHITE, { kind: "reach", clue: { r: row, c: col }, n: clue });
        }
      }
    }
  }
  return made;
}

const NOT_VISITED = -1;

/** A square whose painting black would disconnect the white region (a
 * cut vertex of the white graph) must be white. DFS lowpoint
 * articulation-point detection, port of `solver_reasoning_connectedness`
 * / `dfs_biconnect_visit`. */
function ruleConnectedness(
  grid: Int8Array,
  w: number,
  h: number,
  rec?: Recorder,
): number {
  const n = w * h;
  const parentR = new Int32Array(n).fill(NOT_VISITED);
  const parentC = new Int32Array(n);
  const depth = new Int32Array(n).fill(-n);
  let made = 0;

  let start = 0;
  while (start < n && grid[start] === BLACK) start++;
  if (start >= n) return 0; // no white cells at all

  parentR[start] = Math.floor(start / w);
  parentC[start] = start % w;
  depth[start] = 0;

  const visit = (r: number, c: number): number => {
    const ci = idx(r, c, w);
    const mydepth = depth[ci];
    let low = mydepth;
    let nchildren = 0;

    for (let j = 0; j < 4; j++) {
      const rr = r + DR[j];
      const cc = c + DC[j];
      if (outOfBounds(rr, cc, w, h)) continue;
      const cell = idx(rr, cc, w);
      if (grid[cell] === BLACK) continue;

      if (parentR[cell] === NOT_VISITED) {
        parentR[cell] = r;
        parentC[cell] = c;
        depth[cell] = mydepth + 1;
        const childLow = visit(rr, cc);
        if (childLow >= mydepth && mydepth > 0) {
          if (makeMove(grid, w, h, r, c, WHITE)) {
            made++;
            rec?.(r, c, WHITE, { kind: "connect" });
          }
        }
        low = Math.min(low, childLow);
        nchildren++;
      } else if (rr !== parentR[ci] || cc !== parentC[ci]) {
        low = Math.min(low, depth[cell]);
      }
    }

    if (mydepth === 0 && nchildren >= 2) {
      if (makeMove(grid, w, h, r, c, WHITE)) {
        made++;
        rec?.(r, c, WHITE, { kind: "connect" });
      }
    }
    return low;
  };

  visit(Math.floor(start / w), start % w);
  return made;
}

/** Run the three deductive rules to a fixpoint; returns the number of
 * cells newly filled. No guessing — this is the "without recursion"
 * solver the generator's uniqueness check uses. */
export function applyRules(
  grid: Int8Array,
  w: number,
  h: number,
  clues: Clue[],
  rec?: Recorder,
): number {
  let total = 0;
  // Guard the hint/recording path against a non-terminating fixpoint; the
  // generator (no `rec`) runs unguarded and byte-for-byte unchanged.
  const budget = rec ? stepBudget("range hint") : undefined;
  for (;;) {
    budget?.tick();
    const made =
      ruleNotTooBig(grid, w, h, clues, rec) +
      ruleAdjacency(grid, w, h, rec) +
      ruleConnectedness(grid, w, h, rec);
    if (made === 0) break;
    total += made;
  }
  return total;
}

/** Run the deductive solver from `grid` (the player's current marks),
 * recording every forced cell in deduction order with the reason that
 * forces it — the data a hint plan narrates. Operates on a clone. */
export function deduceHintPlan(grid: Int8Array, w: number, h: number): HintMove[] {
  const dup = grid.slice();
  const moves: HintMove[] = [];
  applyRules(dup, w, h, findClues(dup, w, h), (r, c, value, reason) => {
    moves.push({ r, c, value, reason, grid: dup.slice() });
  });
  return moves;
}

// --- error checking (solved-detection + live highlight) --------------------

/** True iff the grid violates a rule; when `report` is supplied it is
 * filled per-cell instead (and the return value is meaningless).
 * Port of `find_errors`. */
export function findErrors(
  grid: Int8Array,
  w: number,
  h: number,
  report?: boolean[],
): boolean {
  const n = w * h;
  let nblack = 0;
  let anyWhite = -1;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = idx(r, c, w);
      const v = grid[i];
      if (v === BLACK) {
        nblack++;
        for (let j = 0; j < 4; j++) {
          const rr = r + DR[j];
          const cc = c + DC[j];
          if (outOfBounds(rr, cc, w, h)) continue;
          if (grid[idx(rr, cc, w)] !== BLACK) continue;
          if (!report) return true;
          report[i] = true;
          break;
        }
      } else {
        if (v > 0) {
          let runs = 1;
          for (let j = 0; j < 4; j++) {
            runs += runLength(
              grid,
              w,
              h,
              r + DR[j],
              c + DC[j],
              DR[j],
              DC[j],
              ~MASK_BLACK,
            );
          }
          if (!report) {
            if (runs !== v) return true;
          } else if (runs < v) {
            report[i] = true;
          } else {
            let runs2 = 1;
            for (let j = 0; j < 4; j++) {
              runs2 += runLength(
                grid,
                w,
                h,
                r + DR[j],
                c + DC[j],
                DR[j],
                DC[j],
                ~(MASK_BLACK | MASK_EMPTY),
              );
            }
            if (runs2 > v) report[i] = true;
          }
        }
        anyWhite = i;
      }
    }
  }

  // All white (non-black) cells must form one connected component.
  const dsf = new Dsf(n);
  for (let r = 0; r < h - 1; r++) {
    for (let c = 0; c < w; c++) {
      if (grid[r * w + c] !== BLACK && grid[(r + 1) * w + c] !== BLACK) {
        dsf.merge(r * w + c, (r + 1) * w + c);
      }
    }
  }
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w - 1; c++) {
      if (grid[r * w + c] !== BLACK && grid[r * w + (c + 1)] !== BLACK) {
        dsf.merge(r * w + c, r * w + (c + 1));
      }
    }
  }
  if (anyWhite !== -1 && nblack + dsf.size(anyWhite) < n) {
    if (!report) return true;
    // Pick the largest component as canonical; flag every cell outside it.
    let canonical = -1;
    let biggest = 0;
    for (let i = 0; i < n; i++) {
      if (grid[i] !== BLACK) {
        const size = dsf.size(i);
        if (size > biggest) {
          biggest = size;
          canonical = dsf.canonify(i);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (grid[i] !== BLACK && dsf.canonify(i) !== canonical) report[i] = true;
    }
  }

  return false;
}

// --- full solve (Solve command + findMistakes) -----------------------------

/** Solve a clue grid completely, returning a grid with every non-clue
 * cell BLACK or WHITE, or `null` if no consistent completion exists.
 * Deduction with DPLL guessing; every completed grid is validated by
 * `findErrors`, so the result is the true (unique) solution. */
export function fullSolve(initial: Int8Array, w: number, h: number): Int8Array | null {
  const clues = findClues(initial, w, h);
  return solveRec(initial.slice(), w, h, clues);
}

function solveRec(
  grid: Int8Array,
  w: number,
  h: number,
  clues: Clue[],
): Int8Array | null {
  applyRules(grid, w, h, clues);
  let cell = -1;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === EMPTY) {
      cell = i;
      break;
    }
  }
  if (cell < 0) return findErrors(grid, w, h) ? null : grid;
  for (const value of [BLACK, WHITE]) {
    const next = grid.slice();
    next[cell] = value;
    const res = solveRec(next, w, h, clues);
    if (res) return res;
  }
  return null;
}

// --- generation ------------------------------------------------------------

/** Flood-count the white-connected region reaching `cell`, restoring the
 * grid afterwards. Port of `dfs_count_white`. */
function floodCountWhite(grid: Int8Array, w: number, h: number, cell: number): number {
  const stack: number[] = [cell];
  const visited: number[] = [];
  let k = 0;
  while (stack.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: guarded by stack.length
    const i = stack.pop()!;
    if (grid[i] !== WHITE) continue;
    grid[i] = EMPTY; // temporary visited marker
    visited.push(i);
    k++;
    const r = Math.floor(i / w);
    const c = i % w;
    for (let j = 0; j < 4; j++) {
      const rr = r + DR[j];
      const cc = c + DC[j];
      if (!outOfBounds(rr, cc, w, h)) stack.push(idx(rr, cc, w));
    }
  }
  for (const i of visited) grid[i] = WHITE;
  return k;
}

function chooseBlackSquares(
  grid: Int8Array,
  w: number,
  h: number,
  shuffle: number[],
): void {
  const n = w * h;
  grid.fill(WHITE);
  const anyWhiteCell = shuffle[n - 1];
  let nBlack = 0;

  for (let k = 0; k < Math.floor(n / 3); k++) {
    const i = shuffle[k];
    const c = i % w;
    const r = Math.floor(i / w);

    let hasBlackNeighbour = false;
    for (let j = 0; j < 4; j++) {
      const rr = r + DR[j];
      const cc = c + DC[j];
      if (outOfBounds(rr, cc, w, h)) continue;
      if (grid[idx(rr, cc, w)] === BLACK) {
        hasBlackNeighbour = true;
        break;
      }
    }
    if (hasBlackNeighbour) continue;

    grid[i] = BLACK;
    nBlack++;
    if (floodCountWhite(grid, w, h, anyWhiteCell) + nBlack < n) {
      grid[i] = WHITE; // would disconnect the white region — revert
      nBlack--;
    }
  }
}

function computeClues(grid: Int8Array, w: number, h: number): void {
  // White cells start at WHITE (−1); adding the horizontal and vertical
  // run lengths yields −1 + h + v = h + v − 1, the clue. Black stays −2.
  for (let r = 0; r < h; r++) {
    let runSize = 0;
    for (let c = 0; c <= w; c++) {
      if (c === w || grid[idx(r, c, w)] === BLACK) {
        for (let cc = c - runSize; cc < c; cc++) grid[idx(r, cc, w)] += runSize;
        runSize = 0;
      } else {
        runSize++;
      }
    }
  }
  for (let c = 0; c < w; c++) {
    let runSize = 0;
    for (let r = 0; r <= h; r++) {
      if (r === h || grid[idx(r, c, w)] === BLACK) {
        for (let rr = r - runSize; rr < r; rr++) grid[idx(rr, c, w)] += runSize;
        runSize = 0;
      } else {
        runSize++;
      }
    }
  }
}

/** Count the cells the no-recursion solver determines on a copy of the
 * grid. Equal to the number of EMPTY cells iff the board is solvable. */
function solvableFillCount(grid: Int8Array, w: number, h: number): number {
  const dup = grid.slice();
  return applyRules(dup, w, h, findClues(dup, w, h));
}

/** Blank clues — those rotationally symmetric to a black square, then
 * symmetric pairs in random order — keeping only removals that leave the
 * board uniquely solvable without recursion. Returns the number of cells
 * removed, or −1 if the symmetric-removal stage left it unsolvable.
 * Port of `newdesc_strip_clues`. */
function stripClues(grid: Int8Array, w: number, h: number, shuffle: number[]): number {
  const n = w * h;
  const rotate = (x: number): number => n - 1 - x;
  const swap = (i: number, j: number): void => {
    const t = shuffle[i];
    shuffle[i] = shuffle[j];
    shuffle[j] = t;
  };

  // Partition shuffle into [0,left) symmetric-to-black, [left,right)
  // other, [right,n) black.
  let left = 0;
  let right = n;
  for (let k = 0; ; k++) {
    while (k < right && grid[shuffle[k]] === BLACK) {
      right--;
      swap(right, k);
    }
    if (k >= right) break;
    if (grid[rotate(shuffle[k])] === BLACK) {
      swap(k, left);
      left++;
    }
  }

  for (let k = 0; k < left; k++) grid[shuffle[k]] = EMPTY;
  for (let k = right; k < n; k++) grid[shuffle[k]] = EMPTY;

  let cluesRemoved = left + (n - right);

  if (solvableFillCount(grid, w, h) < cluesRemoved) return -1;

  for (let k = left; k < right; k++) {
    const i = shuffle[k];
    const j = rotate(i);
    const clue = grid[i];
    const clueRot = grid[j];
    if (clue === BLACK) continue;
    grid[i] = EMPTY;
    grid[j] = EMPTY;
    const delta = 2 - (i === j ? 1 : 0);
    cluesRemoved += delta;
    if (solvableFillCount(grid, w, h) === cluesRemoved) continue;
    grid[i] = clue;
    grid[j] = clueRot;
    cluesRemoved -= delta;
  }

  return cluesRemoved;
}

/** Generate a uniquely-solvable, rotationally-symmetric board; returns
 * the clue grid (clue cells > 0, every other cell EMPTY). */
export function generateGrid(p: RangeParams, rng: RandomState): Int8Array {
  const { w, h } = p;
  const n = w * h;
  const grid = new Int8Array(n);
  const shuffle: number[] = Array.from({ length: n }, (_, i) => i);

  for (;;) {
    shuffleArray(shuffle, rng);
    chooseBlackSquares(grid, w, h, shuffle);
    computeClues(grid, w, h);
    shuffleArray(shuffle, rng);
    const removed = stripClues(grid, w, h, shuffle);
    if (removed >= 0) break;
  }
  return grid;
}
