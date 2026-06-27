/**
 * Solo (Sudoku) generator — a port of `new_game_desc` from `solo.c`, across all
 * four variants (standard / jigsaw / X / killer).
 *
 * Shape (faithful to upstream):
 *  1. Build the sub-block partition: the rectangular `c × r` blocks, or — for
 *     jigsaw — a random omino division via `divvyRectangle`.
 *  2. `gridgen` a random full solution under every active constraint (Latin +
 *     blocks + X-diagonals + killer cages), using the most-constrained-square
 *     heuristic with a step budget.
 *  3. Reduce to a uniquely-solvable puzzle at *exactly* the target difficulty:
 *     - **non-killer:** remove givens in shuffled symmetry orbits, keeping a
 *       removal only while the graded solver still solves within the target
 *       (a solver-gated minimiser — playbook §4.4);
 *     - **killer:** grade the `gen_killer_cages` layout (cages of size ≤ 2 after
 *       singleton removal) and, if it lands on the target difficulty, publish it
 *       with no givens. Upstream *intends* to grow cages by merging adjacent
 *       pairs and keep the hardest set, but `merge_some_cages` carries a bug that
 *       makes it never merge (see that function) — so the raw layout ships.
 *  4. Encode the givens grid, plus (jigsaw) the block structure, plus (killer)
 *     the cage structure + cage-sum grid.
 *
 * RNG-faithful over the bit-identical `random.ts`, so the emitted desc matches
 * the C reference byte-for-byte for the same seed (no `qsort`/order-dependent
 * step exists in any variant's path — see design D5). The solver is the grading
 * oracle, so its verdict must match C exactly on every intermediate board; that
 * faithfulness lives in `solver.ts`.
 */

import { shuffle } from "../../engine/shuffle.ts";
import { type RandomState, randomBits, randomUpto } from "../../random/index.ts";
import { divvyRectangle } from "./divvy.ts";
import { type Difficulty, runSolver } from "./solver.ts";
import {
  type BlockStructure,
  blocksFromDsf,
  DIFF_BLOCK,
  DIFF_KSINGLE,
  encodeBlockStructureDesc,
  encodeGrid,
  makeBlocksFromWhichblock,
  onDiag0,
  onDiag1,
  rectangularBlocks,
  type SoloParams,
  symmetries,
} from "./state.ts";

// --- grid generator (gridgen) ----------------------------------------------

interface GridgenUsage {
  cr: number;
  blocks: BlockStructure;
  kblocks: BlockStructure | null;
  grid: Int8Array;
  /** Bitsets: bit n set iff digit n placed in the region. */
  row: Int32Array;
  col: Int32Array;
  blk: Int32Array;
  cge: Int32Array | null;
  diag: Int32Array | null;
  spaces: { x: number; y: number; r: number }[];
  nspaces: number;
  rng: RandomState;
}

function gridgenPlace(u: GridgenUsage, x: number, y: number, n: number): void {
  const bit = 1 << n;
  const cr = u.cr;
  const xy = y * cr + x;
  u.row[y] |= bit;
  u.col[x] |= bit;
  u.blk[u.blocks.whichblock[xy]] |= bit;
  if (u.cge && u.kblocks) u.cge[u.kblocks.whichblock[xy]] |= bit;
  if (u.diag) {
    if (onDiag0(xy, cr)) u.diag[0] |= bit;
    if (onDiag1(xy, cr)) u.diag[1] |= bit;
  }
  u.grid[xy] = n;
}

function gridgenRemove(u: GridgenUsage, x: number, y: number, n: number): void {
  const mask = ~(1 << n);
  const cr = u.cr;
  const xy = y * cr + x;
  u.row[y] &= mask;
  u.col[x] &= mask;
  u.blk[u.blocks.whichblock[xy]] &= mask;
  if (u.cge && u.kblocks) u.cge[u.kblocks.whichblock[xy]] &= mask;
  if (u.diag) {
    if (onDiag0(xy, cr)) u.diag[0] &= mask;
    if (onDiag1(xy, cr)) u.diag[1] &= mask;
  }
  u.grid[xy] = 0;
}

/** The recursive step (`gridgen_real`): fill the most-constrained empty square,
 *  recursing with a shared step budget. Returns true on a full solution. */
function gridgenReal(u: GridgenUsage, steps: { n: number }): boolean {
  const cr = u.cr;
  if (u.nspaces === 0) return true;
  if (steps.n <= 0) return false;
  steps.n--;

  // Find the most constrained space; tie-break on the random `.r` field.
  let bestm = cr + 1;
  let bestr = 0;
  let used = ~0;
  let bi = -1;
  let sx = -1;
  let sy = -1;
  for (let j = 0; j < u.nspaces; j++) {
    const x = u.spaces[j].x;
    const y = u.spaces[j].y;
    const m = u.blocks.whichblock[y * cr + x];
    let usedXy = u.row[y] | u.col[x] | u.blk[m];
    if (u.cge && u.kblocks) usedXy |= u.cge[u.kblocks.whichblock[y * cr + x]];
    if (u.diag) {
      if (onDiag0(y * cr + x, cr)) usedXy |= u.diag[0];
      if (onDiag1(y * cr + x, cr)) usedXy |= u.diag[1];
    }
    let count = 0;
    for (let n = 1; n <= cr; n++) if ((usedXy & (1 << n)) === 0) count++;
    if (count < bestm || (count === bestm && u.spaces[j].r < bestr)) {
      bestm = count;
      bestr = u.spaces[j].r;
      sx = x;
      sy = y;
      bi = j;
      used = usedXy;
    }
  }

  // Swap the chosen space to the end so `nspaces--` removes it.
  if (bi !== u.nspaces - 1) {
    const t = u.spaces[u.nspaces - 1];
    u.spaces[u.nspaces - 1] = u.spaces[bi];
    u.spaces[bi] = t;
  }

  const digits: number[] = [];
  for (let n = 1; n <= cr; n++) if ((used & (1 << n)) === 0) digits.push(n);
  shuffle(digits, u.rng);

  for (let i = 0; i < digits.length; i++) {
    const n = digits[i];
    gridgenPlace(u, sx, sy, n);
    u.nspaces--;
    if (gridgenReal(u, steps)) return true;
    gridgenRemove(u, sx, sy, n);
    u.nspaces++;
  }
  return false;
}

/** Entry point to the grid generator (`gridgen`): fill `grid` with a random full
 *  solution honouring every constraint. Returns false if the step budget ran
 *  out before completing. */
function gridgen(
  cr: number,
  blocks: BlockStructure,
  kblocks: BlockStructure | null,
  xtype: boolean,
  grid: Int8Array,
  rng: RandomState,
  maxsteps: number,
): boolean {
  grid.fill(0);
  const u: GridgenUsage = {
    cr,
    blocks,
    kblocks,
    grid,
    row: new Int32Array(cr),
    col: new Int32Array(cr),
    blk: new Int32Array(cr),
    cge: kblocks ? new Int32Array(kblocks.nrBlocks) : null,
    diag: xtype ? new Int32Array(2) : null,
    spaces: [],
    nspaces: 0,
    rng,
  };

  // Fill the top row with a random permutation (free relabelling, no bias).
  const top = Array.from({ length: cr }, (_, i) => i + 1);
  shuffle(top, rng);
  for (let x = 0; x < cr; x++) {
    grid[x] = top[x];
    gridgenPlace(u, x, 0, top[x]);
  }

  // Initialise the remaining spaces (rows 1..cr-1) with random tie-breakers.
  for (let y = 1; y < cr; y++)
    for (let x = 0; x < cr; x++) u.spaces.push({ x, y, r: randomBits(rng, 31) });
  u.nspaces = u.spaces.length;

  return gridgenReal(u, { n: maxsteps });
}

// --- killer cage generation ------------------------------------------------

/** `merge_blocks`: merge cage `n2` into `n1` (toward the lower index), then move
 *  the last cage into the freed slot. The reindexing is byte-match-relevant: the
 *  cage indexing decides `merge_some_cages`'s pair-enumeration order, hence the
 *  RNG draw. Mutates `b` in place. */
function mergeBlocks(b: BlockStructure, n1: number, n2: number): void {
  if (n2 < n1) {
    const t = n1;
    n1 = n2;
    n2 = t;
  }
  // Merge n2 into n1.
  for (const cell of b.blocks[n2]) b.whichblock[cell] = n1;
  b.blocks[n1] = b.blocks[n1].concat(b.blocks[n2]);
  // Move the last cage into n2's slot, then drop the (now-duplicate) last entry.
  const last = b.nrBlocks - 1;
  if (n2 !== last) {
    b.blocks[n2] = b.blocks[last];
    for (const cell of b.blocks[n2]) b.whichblock[cell] = n2;
  }
  b.blocks.pop();
  b.nrBlocks = last;
}

/** `gen_killer_cages`: lay out cages by a left/down random walk, optionally
 *  folding away singletons by merging each into a neighbour. */
function genKillerCages(
  cr: number,
  rng: RandomState,
  removeSingletons: boolean,
): BlockStructure {
  const area = cr * cr;
  const whichblock = new Int32Array(area).fill(-1);
  let nr = 0;
  for (let y = 0; y < cr; y++) {
    for (let x = 0; x < cr; x++) {
      const xy = y * cr + x;
      if (whichblock[xy] !== -1) continue;
      whichblock[xy] = nr;
      const rnd = randomBits(rng, 4);
      if (xy + 1 < area && (rnd >= 4 || (!removeSingletons && rnd >= 1))) {
        let xy2 = xy + 1;
        if (
          x + 1 === cr ||
          whichblock[xy2] !== -1 ||
          (xy + cr < area && randomBits(rng, 1) === 0)
        )
          xy2 = xy + cr;
        if (xy2 < area) whichblock[xy2] = nr;
      }
      nr++;
    }
  }

  const b = makeBlocksFromWhichblock(cr, nr, whichblock);

  if (removeSingletons) {
    for (let n = 0; n < b.nrBlocks; ) {
      if (b.blocks[n].length > 1) {
        n++;
        continue;
      }
      const xy = b.blocks[n][0];
      const x = xy % cr;
      const y = (xy / cr) | 0;
      let xy2: number;
      if (xy + 1 === area) xy2 = xy - 1;
      else if (x + 1 < cr && (y + 1 === cr || randomBits(rng, 1) === 0)) xy2 = xy + 1;
      else xy2 = xy + cr;
      const other = b.whichblock[xy2];
      mergeBlocks(b, n, other);
      if (n < other) n++;
    }
  }
  return b;
}

/** `compute_kclues`: the per-cage digit sum, written at the cage's first cell
 *  (and 0 elsewhere) — faithful to upstream's clue placement. */
function computeKclues(
  cages: BlockStructure,
  kgrid: Int32Array,
  grid: Int8Array,
  area: number,
): void {
  kgrid.fill(0);
  for (let i = 0; i < cages.nrBlocks; i++) {
    let sum = 0;
    for (let j = 0; j < area; j++) if (cages.whichblock[j] === i) sum += grid[j];
    for (let j = 0; j < area; j++)
      if (cages.whichblock[j] === i) {
        kgrid[j] = sum;
        break;
      }
  }
}

/**
 * `merge_some_cages`: *intended* to pick a random pair of adjacent cages whose
 * merge stays a valid region (no repeated digit) and within the size cap, and
 * merge them — returning false when none exists.
 *
 * UPSTREAM BUG, reproduced verbatim (playbook §4.4): the C enumeration writes
 * each adjacent pair to `pairs[npairs]` but **never executes `npairs++`**, so
 * `npairs` stays 0, the random pick-and-merge loop below never runs, and the
 * function **always returns false without drawing any RNG**. The net effect is
 * that no killer cages are ever merged: every killer puzzle ships the raw
 * `gen_killer_cages` layout (after singleton removal), and the elaborate
 * grade-and-merge loop in `newSoloDesc` is effectively inert. We reproduce the
 * missing increment (and so the always-false, zero-RNG behaviour) exactly,
 * because "fixing" it would merge cages C never merges and diverge the desc.
 * The pick loop is kept 1:1 with C (it is genuinely unreachable upstream too).
 */
function mergeSomeCages(
  b: BlockStructure,
  cr: number,
  grid: Int8Array,
  rng: RandomState,
): boolean {
  const maxNrSquares = cr; // alloc_block_structure(1, cr, area, cr, area)
  const pairs: { b1: number; b2: number }[] = [];
  let npairs = 0; // upstream never increments this — see the bug note above.

  for (let i = 0; i < b.nrBlocks; i++) {
    for (let j = i + 1; j < b.nrBlocks; j++) {
      if (b.blocks[i].length + b.blocks[j].length > maxNrSquares) continue;
      // Adjacency: some square of cage i is 4-adjacent to a square of cage j.
      for (const xy of b.blocks[i]) {
        const y = (xy / cr) | 0;
        const x = xy % cr;
        if (
          (y > 0 && b.whichblock[xy - cr] === j) ||
          (y + 1 < cr && b.whichblock[xy + cr] === j) ||
          (x > 0 && b.whichblock[xy - 1] === j) ||
          (x + 1 < cr && b.whichblock[xy + 1] === j)
        ) {
          pairs[npairs] = { b1: i, b2: j }; // NB: npairs is NOT incremented (bug)
          break;
        }
      }
    }
  }

  while (npairs > 0) {
    const idx = randomUpto(rng, npairs);
    const n1 = pairs[idx].b1;
    const n2 = pairs[idx].b2;
    if (idx !== npairs - 1) pairs[idx] = pairs[npairs - 1];
    npairs--;

    // Reject if the merged cage would repeat a digit (not a valid region).
    let digitsFound = 0;
    for (const cell of b.blocks[n1]) digitsFound |= 1 << grid[cell];
    let clash = false;
    for (const cell of b.blocks[n2])
      if (digitsFound & (1 << grid[cell])) {
        clash = true;
        break;
      }
    if (clash) continue;

    mergeBlocks(b, n1, n2);
    return true;
  }
  return false;
}

function dupBlocks(b: BlockStructure): BlockStructure {
  return {
    cr: b.cr,
    nrBlocks: b.nrBlocks,
    whichblock: b.whichblock.slice(),
    blocks: b.blocks.map((blk) => blk.slice()),
  };
}

// --- solve-move (aux) encoding ---------------------------------------------

/** `encode_solve_move`: the full solution as the midend's Solve payload. */
function encodeSolveMove(cr: number, grid: ArrayLike<number>): string {
  const parts: string[] = [];
  for (let i = 0; i < cr * cr; i++) parts.push(String(grid[i]));
  return `S${parts.join(",")}`;
}

// --- new_game_desc ----------------------------------------------------------

const MAX_REGENERATE = 50000;

export function newSoloDesc(
  p: SoloParams,
  rng: RandomState,
): { desc: string; aux: string } {
  const { c, r } = p;
  const cr = c * r;
  const area = cr * cr;

  // Cap the difficulty for sizes that can only ever be trivial.
  const maxdiff = (c === 2 && r === 2) || (r === 1 && c < 4) ? DIFF_BLOCK : p.diff;
  const maxkdiff = p.kdiff;
  const dlev: Difficulty = { maxdiff, maxkdiff, diff: 0, kdiff: 0 };

  const grid = new Int8Array(area);
  const grid2 = new Int8Array(area);
  const kgrid = p.killer ? new Int32Array(area) : null;
  const coords: number[] = [];

  let blocks: BlockStructure = rectangularBlocks(2, 2); // placeholder, replaced below
  let kblocks: BlockStructure | null = null;
  let aux = "";

  let iterations = 0;
  while (true) {
    if (++iterations > MAX_REGENERATE)
      throw new Error(`solo generator: no puzzle after ${MAX_REGENERATE} iterations`);

    // Block structure.
    if (r === 1) {
      const dsf = divvyRectangle(cr, cr, cr, rng);
      blocks = blocksFromDsf(dsf, cr);
    } else {
      blocks = rectangularBlocks(c, r);
    }

    if (p.killer) kblocks = genKillerCages(cr, rng, p.kdiff > DIFF_KSINGLE);

    if (!gridgen(cr, blocks, kblocks, p.xtype, grid, rng, area * area)) continue;

    aux = encodeSolveMove(cr, grid);

    if (p.killer && kblocks && kgrid) {
      // Killer: grow cages from the all-size-≤2 layout, grading after each
      // merge, keeping the hardest set that lands exactly on target.
      let goodCages: BlockStructure | null = null;
      let lastCages: BlockStructure | null = null;
      let ntries = 0;
      grid2.set(grid);

      for (;;) {
        computeKclues(kblocks, kgrid, grid2, area);
        grid.fill(0);
        runSolver(cr, blocks, kblocks, p.xtype, grid, kgrid, dlev);

        if (dlev.diff === maxdiff && dlev.kdiff === maxkdiff) {
          goodCages = dupBlocks(kblocks);
          ntries = 0;
          if (!mergeSomeCages(kblocks, cr, grid2, rng)) break;
        } else if (dlev.diff > maxdiff || dlev.kdiff > maxkdiff) {
          if (++ntries > 50) break;
          if (goodCages !== null) {
            kblocks = dupBlocks(goodCages);
            if (!mergeSomeCages(kblocks, cr, grid2, rng)) break;
          } else {
            if (lastCages === null) break;
            kblocks = lastCages;
            lastCages = null;
          }
        } else {
          lastCages = dupBlocks(kblocks);
          if (!mergeSomeCages(kblocks, cr, grid2, rng)) break;
        }
      }

      if (goodCages !== null) {
        kblocks = goodCages;
        computeKclues(kblocks, kgrid, grid2, area);
        grid.fill(0);
        break; // success
      }
      continue; // regenerate
    }

    // Non-killer: remove givens in shuffled symmetry orbits while still soluble.
    const locs: { x: number; y: number }[] = [];
    for (let y = 0; y < cr; y++)
      for (let x = 0; x < cr; x++) {
        const i = y * cr + x;
        const nc = symmetries(cr, x, y, coords, p.symm);
        let j = 0;
        for (; j < nc; j++) if (coords[2 * j + 1] * cr + coords[2 * j] < i) break;
        if (j === nc) locs.push({ x, y });
      }
    shuffle(locs, rng);

    for (const loc of locs) {
      grid2.set(grid);
      const nc = symmetries(cr, loc.x, loc.y, coords, p.symm);
      for (let j = 0; j < nc; j++) grid2[coords[2 * j + 1] * cr + coords[2 * j]] = 0;
      runSolver(cr, blocks, kblocks, p.xtype, grid2, kgrid, dlev);
      if (dlev.diff <= maxdiff && (!p.killer || dlev.kdiff <= maxkdiff))
        for (let j = 0; j < nc; j++) grid[coords[2 * j + 1] * cr + coords[2 * j]] = 0;
    }

    grid2.set(grid);
    runSolver(cr, blocks, kblocks, p.xtype, grid2, kgrid, dlev);
    if (dlev.diff === maxdiff && (!p.killer || dlev.kdiff === maxkdiff)) break; // found one
  }

  // Encode the puzzle description.
  let desc = encodeGrid(grid, area);
  if (r === 1) desc += `,${encodeBlockStructureDesc(cr, blocks)}`;
  if (p.killer && kblocks && kgrid) {
    desc += `,${encodeBlockStructureDesc(cr, kblocks)}`;
    desc += `,${encodeGrid(kgrid, area)}`;
  }

  return { desc, aux };
}
