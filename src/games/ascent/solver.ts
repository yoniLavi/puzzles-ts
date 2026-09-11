/**
 * Ascent solver: a four-tier deductive fixpoint (upstream `ascent_solve`).
 *
 * **No tier guesses or backtracks.** Easy runs single-position + simple
 * proximity; Normal adds the path-segment reasoning; Tricky adds the simple
 * single-number rule; Hard adds the full single-number rule and the overlap
 * rule (also enabled at any difficulty in Edges mode). Every rule is a pure
 * deduction, so all four tiers are guess-free and there is no "Unreasonable"
 * tier to add.
 *
 * The generator removes a clue only if the graded solver still solves the
 * result, which is what lets one byte-match differential validate solver,
 * generator and codec together.
 */

import {
  type DeductionTechnique,
  type FiringTally,
  runDeductionFixpoint,
} from "../../engine/deduction-fixpoint.ts";
import {
  type AscentMovement,
  CELL_MULTIPLE,
  CELL_NONE,
  DIFF_EASY,
  DIFF_HARD,
  DIFF_NORMAL,
  DIFF_TRICKY,
  FLAG_COMPLETE,
  FLAG_ENDPOINT,
  findDirection,
  fromNumberEdge,
  isEdgeValid,
  isHexagonal,
  isNear,
  isNumberEdge,
  isObstacle,
  MAXIMUM_DIRS,
  MODE_EDGES,
  MODE_ORTHOGONAL,
  movementForMode,
  NUMBER_EMPTY,
  NUMBER_WALL,
  updatePositions,
} from "./state.ts";

export class SolverScratch {
  readonly w: number;
  readonly h: number;
  readonly mode: number;
  readonly movement: AscentMovement;
  /** The last number on the path (set by the caller before each solve). */
  end: number;

  readonly positions: Int32Array;
  readonly grid: Int16Array;
  /** Candidate bitmap: `marks[i*s + n]` is 1 if number `n` may sit at cell `i`. */
  readonly marks: Uint8Array;
  /** Per-cell possible path segments (`1<<dir` | flags). */
  readonly path: Int32Array;
  foundEndpoints: boolean;
  /** Scratch for `solverOverlap`: `overlap[i]` prev-adjacency, `overlap[i+s]` next. */
  readonly overlap: Uint8Array;

  constructor(w: number, h: number, mode: number, last: number) {
    const n = w * h;
    this.w = w;
    this.h = h;
    this.mode = mode;
    this.end = last;
    this.movement = movementForMode(mode);
    this.positions = new Int32Array(n).fill(CELL_NONE);
    this.grid = new Int16Array(n).fill(NUMBER_EMPTY);
    this.path = new Int32Array(n);
    this.foundEndpoints = false;
    this.marks = new Uint8Array(n * n);
    this.overlap = new Uint8Array(n * 2);
  }
}

function solverPlace(sc: SolverScratch, pos: number, num: number): number {
  const s = sc.w * sc.h;

  sc.grid[pos] = num;
  sc.positions[num] = sc.positions[num] === CELL_NONE ? pos : CELL_MULTIPLE;

  /* Rule out this number in all other cells */
  for (let i = 0; i < s; i++) {
    if (i === pos) continue;
    sc.marks[i * s + num] = 0;
  }
  /* Rule out all other numbers in this cell */
  for (let nn = 0; nn < sc.end; nn++) {
    if (nn === num) continue;
    sc.marks[pos * s + nn] = 0;
  }

  return 1;
}

function solverSinglePosition(sc: SolverScratch): number {
  const s = sc.w * sc.h;
  let ret = 0;

  for (let n = 0; n <= sc.end; n++) {
    if (sc.positions[n] !== CELL_NONE) continue;
    let found = CELL_NONE;
    for (let i = 0; i < s; i++) {
      if (sc.grid[i] !== NUMBER_EMPTY) continue;
      if (!sc.marks[i * s + n]) continue;
      found = found === CELL_NONE ? i : CELL_MULTIPLE;
    }
    if (found >= 0) ret += solverPlace(sc, found, n);
  }

  return ret;
}

function solverSingleNumber(sc: SolverScratch, simple: boolean): number {
  const s = sc.w * sc.h;
  let ret = 0;

  for (let i = 0; i < s; i++) {
    if (sc.grid[i] !== NUMBER_EMPTY) continue;
    let found = NUMBER_EMPTY;
    for (let n = 0; n <= sc.end; n++) {
      if (!sc.marks[i * s + n]) continue;
      found = found === NUMBER_EMPTY ? n : NUMBER_WALL;
    }
    if (found >= 0) {
      if (
        simple &&
        (found === 0 || sc.positions[found - 1] === CELL_NONE) &&
        (found === sc.end || sc.positions[found + 1] === CELL_NONE)
      ) {
        continue;
      }
      ret += solverPlace(sc, i, found);
    }
  }

  return ret;
}

function solverNear(
  sc: SolverScratch,
  near: number,
  num: number,
  distance: number,
): number {
  const w = sc.w;
  const s = sc.h * w;
  let ret = 0;

  for (let i = 0; i < s; i++) {
    if (!sc.marks[i * s + num]) continue;
    const hdist = (i % w) - (near % w);
    const vdist = Math.trunc(i / w) - Math.trunc(near / w);
    if (
      sc.mode === MODE_ORTHOGONAL ||
      (isHexagonal(sc.mode) && ((hdist < 0 && vdist < 0) || (hdist > 0 && vdist > 0)))
    ) {
      /* Manhattan distance */
      if (Math.abs(hdist) + Math.abs(vdist) <= distance) continue;
    } else {
      /* Chebyshev distance */
      if (Math.max(Math.abs(hdist), Math.abs(vdist)) <= distance) continue;
    }
    sc.marks[i * s + num] = 0;
    ret++;
  }

  return ret;
}

function solverProximitySimple(sc: SolverScratch): number {
  const end = sc.end;
  let ret = 0;

  for (let n = 0; n <= end; n++) {
    const i = sc.positions[n];
    if (i < 0) continue;
    if (n > 0 && sc.positions[n - 1] === CELL_NONE) ret += solverNear(sc, i, n - 1, 1);
    if (n < end - 1 && sc.positions[n + 1] === CELL_NONE)
      ret += solverNear(sc, i, n + 1, 1);
  }

  return ret;
}

function solverProximityFull(sc: SolverScratch): number {
  const end = sc.end;
  let ret = 0;

  for (let n = 0; n <= end; n++) {
    const i = sc.positions[n];
    if (i < 0) continue;

    let n2 = n - 1;
    while (n2 >= 0 && sc.positions[n2] === CELL_NONE) {
      ret += solverNear(sc, i, n2, Math.abs(n - n2));
      n2--;
    }
    n2 = n + 1;
    while (n2 <= end - 1 && sc.positions[n2] === CELL_NONE) {
      ret += solverNear(sc, i, n2, Math.abs(n - n2));
      n2++;
    }
  }

  return ret;
}

function solverInitializePath(sc: SolverScratch): void {
  const { w, h, movement } = sc;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      sc.path[y * w + x] = FLAG_ENDPOINT;
      for (let dir = 0; dir < movement.dircount; dir++) {
        const x2 = x + movement.dirs[dir].dx;
        const y2 = y + movement.dirs[dir].dy;
        if (x2 < 0 || x2 >= w || y2 < 0 || y2 >= h) continue;
        sc.path[y * w + x] |= 1 << dir;
      }
    }
  }
}

function solverUpdatePath(sc: SolverScratch): number {
  const { w, h, movement } = sc;
  const s = w * h;
  const end = sc.end;
  let ret = 0;

  let ib = sc.positions[0];
  const ic = sc.positions[end];
  if (!sc.foundEndpoints && ib !== CELL_NONE && ic !== CELL_NONE) {
    sc.foundEndpoints = true;
    ret++;
    for (let i = 0; i < s; i++) {
      if (i === ib || i === ic) continue;
      sc.path[i] &= ~FLAG_ENDPOINT;
    }
  }

  /* First number points to the second; last points to the penultimate. */
  let i = sc.positions[1];
  ib = sc.positions[0];
  if (i !== CELL_NONE && ib !== CELL_NONE && !(sc.path[ib] & FLAG_COMPLETE)) {
    sc.path[ib] = (1 << findDirection(ib, i, w, movement)) | FLAG_ENDPOINT;
  }
  i = sc.positions[end - 1];
  if (i !== CELL_NONE && ic !== CELL_NONE && !(sc.path[ic] & FLAG_COMPLETE)) {
    sc.path[ic] = (1 << findDirection(ic, i, w, movement)) | FLAG_ENDPOINT;
  }

  /* Middle numbers: set the path when both neighbors are known. */
  for (let n = 1; n <= end - 1; n++) {
    i = sc.positions[n];
    if (i === CELL_NONE || sc.path[i] & FLAG_COMPLETE) continue;
    const pib = sc.positions[n - 1];
    const pic = sc.positions[n + 1];
    if (pib === CELL_NONE || pic === CELL_NONE) continue;
    sc.path[i] = 1 << findDirection(i, pib, w, movement);
    sc.path[i] |= 1 << findDirection(i, pic, w, movement);
  }

  for (let idx = 0; idx < s; idx++) {
    if (sc.path[idx] & FLAG_COMPLETE) continue;
    let count = 0;
    /* Count segments; an endpoint (bit 8 = FLAG_ENDPOINT) counts as one. */
    for (let dir = 0; dir <= MAXIMUM_DIRS; dir++) {
      if (sc.path[idx] & (1 << dir)) count++;
    }
    if (count === 2) {
      sc.path[idx] |= FLAG_COMPLETE;
      ret++;
      /* For every direction this cell does NOT go, tell that neighbor it
       * cannot connect back. Bits beyond `dircount` are never set, so the
       * upstream 0..MAXIMUM_DIRS loop is a no-op there — iterate to
       * `dircount` directly. */
      for (let dir = 0; dir < movement.dircount; dir++) {
        if (sc.path[idx] & (1 << dir)) continue;
        const x = (idx % w) + movement.dirs[dir].dx;
        const y = Math.trunc(idx / w) + movement.dirs[dir].dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        sc.path[y * w + x] &= ~(1 << (movement.dircount - (dir + 1)));
      }
    }
  }

  return ret;
}

function solverRemoveEndpoints(sc: SolverScratch): number {
  if (sc.foundEndpoints) return 0;
  const { w, h } = sc;
  const s = w * h;
  const end = sc.end;
  let ret = 0;

  for (let i = 0; i < s; i++) {
    if (sc.path[i] & FLAG_ENDPOINT) {
      if (sc.marks[i * s] || sc.marks[i * s + end]) continue;
      sc.path[i] &= ~FLAG_ENDPOINT;
      ret++;
    } else {
      if (sc.marks[i * s]) {
        sc.marks[i * s] = 0;
        ret++;
      }
      if (sc.marks[i * s + end]) {
        sc.marks[i * s + end] = 0;
        ret++;
      }
    }
  }

  return ret;
}

function solverAdjacentPath(sc: SolverScratch): number {
  const { w, h, movement } = sc;
  const s = w * h;
  let ret = 0;

  for (let i = 0; i < s; i++) {
    if (sc.path[i] & FLAG_COMPLETE && sc.grid[i] === NUMBER_EMPTY) {
      /* The bit-set guard means we only index `dirs[dir]` for dir < dircount. */
      for (let dir = 0; dir < MAXIMUM_DIRS; dir++) {
        if (!(sc.path[i] & (1 << dir))) continue;
        const i2 = movement.dirs[dir].dy * w + movement.dirs[dir].dx + i;
        const n1 = sc.grid[i2];
        if (n1 >= 0) {
          for (let n = 0; n <= sc.end; n++) {
            if (Math.abs(n - n1) === 1) continue;
            if (!sc.marks[i * s + n]) continue;
            sc.marks[i * s + n] = 0;
            ret++;
          }
        }
      }

      if (sc.path[i] & FLAG_ENDPOINT) {
        for (let n = 1; n < sc.end; n++) {
          if (!sc.marks[i * s + n]) continue;
          sc.marks[i * s + n] = 0;
          ret++;
        }
      }
    }
  }

  return ret;
}

function solverRemovePath(sc: SolverScratch): number {
  const { w, movement } = sc;
  const s = w * sc.h;
  let ret = 0;

  for (let i1 = 0; i1 < s; i1++) {
    if (sc.path[i1] & FLAG_COMPLETE) continue;
    const n1 = sc.grid[i1];
    if (n1 < 0) continue;
    for (let dir = 0; dir < MAXIMUM_DIRS; dir++) {
      if (!(sc.path[i1] & (1 << dir))) continue;
      const i2 = movement.dirs[dir].dy * w + movement.dirs[dir].dx + i1;
      const n2 = sc.grid[i2];
      if (n2 >= 0 && Math.abs(n1 - n2) !== 1) {
        sc.path[i1] &= ~(1 << dir);
        sc.path[i2] &= ~(1 << (movement.dircount - (dir + 1)));
        ret++;
      }
    }
  }

  return ret;
}

function solverRemoveBlocks(sc: SolverScratch): number {
  const { w, movement } = sc;
  const s = w * sc.h;
  let ret = 0;

  for (let i1 = 0; i1 < s; i1++) {
    if (!isObstacle(sc.grid[i1])) continue;
    for (let dir = 0; dir < MAXIMUM_DIRS; dir++) {
      if (!(sc.path[i1] & (1 << dir))) continue;
      const i2 = movement.dirs[dir].dy * w + movement.dirs[dir].dx + i1;
      sc.path[i2] &= ~(1 << (movement.dircount - (dir + 1)));
      ret++;
    }
    sc.path[i1] = 0;
  }

  return ret;
}

function solverOverlap(sc: SolverScratch): number {
  const { w, mode } = sc;
  const s = w * sc.h;
  let ret = 0;

  for (let n = 0; n < sc.end; n++) {
    if (sc.positions[n] !== CELL_NONE) continue;

    sc.overlap.fill(0, 0, s * 2);

    if (n > 0) {
      for (let i1 = 0; i1 < s; i1++) {
        if (sc.marks[i1 * s + (n - 1)]) {
          for (let i2 = 0; i2 < s; i2++) {
            if (isNear(i1, i2, w, mode)) sc.overlap[i2] = 1;
          }
        }
      }
    }

    if (n < sc.end - 1) {
      for (let i1 = 0; i1 < s; i1++) {
        if (sc.marks[i1 * s + (n + 1)]) {
          for (let i2 = 0; i2 < s; i2++) {
            if (isNear(i1, i2, w, mode)) sc.overlap[i2 + s] = 1;
          }
        }
      }
    }

    for (let i1 = 0; i1 < s; i1++) {
      if (!sc.marks[i1 * s + n]) continue;
      if ((n === 0 || sc.overlap[i1]) && (n === sc.end - 1 || sc.overlap[i1 + s]))
        continue;
      sc.marks[i1 * s + n] = 0;
      ret++;
    }
  }

  return ret;
}

function solverEdges(sc: SolverScratch): void {
  const { w, h } = sc;
  const s = w * h;

  for (let i1 = 0; i1 < s; i1++) {
    if (!isNumberEdge(sc.grid[i1])) continue;
    const n = fromNumberEdge(sc.grid[i1]);
    for (let i2 = 0; i2 < s; i2++) {
      if (sc.marks[i2 * s + n] && !isEdgeValid(i1, i2, w, h)) sc.marks[i2 * s + n] = 0;
    }
  }
}

/** Load `puzzle` into the scratch, seed every candidate, and set up the path. */
function solverStart(puzzle: Int16Array, sc: SolverScratch): void {
  const s = sc.w * sc.h;

  if (puzzle !== sc.grid) sc.grid.set(puzzle);
  updatePositions(sc.positions, sc.grid, s);
  sc.marks.fill(0, 0, s * s);

  /* Seed candidate possibilities. */
  for (let n = 0; n < s; n++) {
    const i = sc.positions[n];
    if (i >= 0) {
      sc.marks[i * s + n] = 1;
      continue;
    }
    for (let ii = 0; ii < s; ii++) {
      if (sc.grid[ii] === NUMBER_EMPTY) sc.marks[ii * s + n] = 1;
    }
  }

  solverEdges(sc);
  solverInitializePath(sc);
  /* Upstream never resets `foundEndpoints`, so on a reused scratch it stays set
   * from an earlier board, and `solverUpdatePath`'s endpoint clearing and
   * `solverRemoveEndpoints` stop firing. The generator reuses one scratch, so
   * this weakening decides which boards ship, and the differential holds it. */
  solverRemoveBlocks(sc);
}

/** Run the tiered deductive fixpoint over `puzzle` into `sc.grid`. */
export function ascentSolve(
  puzzle: Int16Array,
  diff: number,
  sc: SolverScratch,
  firings?: FiringTally,
): void {
  solverStart(puzzle, sc);
  runDeductionFixpoint({
    techniques: ascentLadder(sc, diff),
    firings,
    // The ladder is tier-sorted, so skipping over-cap rungs matches the legacy
    // ladder's `break`s.
    maxTier: diff,
  });
}

/**
 * The rungs, easiest first. Ascent returns no grade (`diff` is purely a cap),
 * so only the runner's loop and cap are used.
 *
 * **Two rungs cannot be expressed as a tier and guard themselves instead:**
 *
 *  - **`overlap` runs at Hard *or* in Edges mode at any difficulty.** Declaring
 *    it `tier: DIFF_HARD` would take it away from an Edges board at Normal,
 *    where upstream runs it. It is declared at the tier of the block it sits in
 *    and tests the disjunction itself.
 *  - **`single-number-simple` runs at Tricky and *not* at Hard**: availability
 *    that is non-monotone in the cap, which no `tier` can say, because
 *    `maxTier` includes every rung at or below it. Declared at Tricky so a
 *    lower cap skips it, and self-guarded against Hard, where its thorough
 *    sibling replaces it.
 *
 * A `when` predicate on the runner would be indistinguishable from returning
 * `0`, which is why the runner has none.
 */
function ascentLadder(sc: SolverScratch, diff: number): DeductionTechnique[] {
  return [
    { id: "single-position", tier: DIFF_EASY, run: () => solverSinglePosition(sc) },
    { id: "proximity-simple", tier: DIFF_EASY, run: () => solverProximitySimple(sc) },
    { id: "update-path", tier: DIFF_NORMAL, run: () => solverUpdatePath(sc) },
    { id: "adjacent-path", tier: DIFF_NORMAL, run: () => solverAdjacentPath(sc) },
    { id: "remove-endpoints", tier: DIFF_NORMAL, run: () => solverRemoveEndpoints(sc) },
    { id: "remove-path", tier: DIFF_NORMAL, run: () => solverRemovePath(sc) },
    { id: "proximity-full", tier: DIFF_NORMAL, run: () => solverProximityFull(sc) },
    {
      id: "overlap",
      tier: DIFF_NORMAL,
      run: () => (diff >= DIFF_HARD || sc.mode === MODE_EDGES ? solverOverlap(sc) : 0),
    },
    {
      id: "single-number-simple",
      tier: DIFF_TRICKY,
      run: () => (diff < DIFF_HARD ? solverSingleNumber(sc, true) : 0),
    },
    {
      id: "single-number-full",
      tier: DIFF_HARD,
      run: () => solverSingleNumber(sc, false),
    },
  ];
}

/** The hand-written ladder `ascentSolve` replaced, kept as the oracle
 * `ascent-ladder.test.ts` checks it against. */
export function ascentSolveLegacy(
  puzzle: Int16Array,
  diff: number,
  sc: SolverScratch,
): void {
  solverStart(puzzle, sc);
  while (true) {
    if (solverSinglePosition(sc)) continue;
    if (solverProximitySimple(sc)) continue;

    if (diff < DIFF_NORMAL) break;

    if (solverUpdatePath(sc)) continue;
    if (solverAdjacentPath(sc)) continue;
    if (solverRemoveEndpoints(sc)) continue;
    if (solverRemovePath(sc)) continue;
    if (solverProximityFull(sc)) continue;

    if ((diff >= DIFF_HARD || sc.mode === MODE_EDGES) && solverOverlap(sc)) continue;

    if (diff < DIFF_TRICKY) break;

    if (diff < DIFF_HARD && solverSingleNumber(sc, true)) continue;
    if (diff < DIFF_HARD) break;

    if (solverSingleNumber(sc, false)) continue;
    break;
  }
}
