/**
 * Solo (Sudoku) solver — a faithful port of `solo.c`'s `solver()` and its
 * technique functions (`solver_place`, `solver_elim`, `solver_intersect`,
 * `solver_set`, `solver_forcing`, the killer deductions, and the bounded
 * recursion).
 *
 * The solver doubles as the generator's grading oracle: the solver-gated
 * minimiser removes givens while this solver still solves at the target
 * difficulty, so the published board depends on this reaching C's *exact*
 * verdict on every intermediate grid. It is therefore ported logic-faithfully
 * (including the few upstream quirks called out below), not merely "correctly".
 *
 * Idiomatic shape: a `SolverUsage` object holds the candidate cube + bookkeeping
 * (no `snew`/`sfree`), the difficulty sentinels are the shared `DIFF_*`
 * constants, and the killer working cages are plain JS arrays (`Cages`) rather
 * than C's flat `block_structure` (removal/split are always of the
 * top-of-unprocessed element by unique cell, so array mutation matches the
 * compacting C semantics — see `removeFromBlock`/`splitBlock`).
 */

import type { DeductionRecord, DeductionRecorder } from "../../engine/latin.ts";
import type { BlockStructure, SoloState } from "./state.ts";
import {
  diag0,
  diag1,
  DIFF_AMBIGUOUS,
  DIFF_BLOCK,
  DIFF_EXTREME,
  DIFF_IMPOSSIBLE,
  DIFF_INTERSECT,
  DIFF_KINTERSECT,
  DIFF_KMINMAX,
  DIFF_KSINGLE,
  DIFF_KSUMS,
  DIFF_RECURSIVE,
  DIFF_SET,
  DIFF_SIMPLE,
  onDiag0,
  onDiag1,
} from "./state.ts";

// --- hint recording (opt-in; off for generate/solve) ------------------------

/** A region the solver reasons over, for narration + evidence shading. `index`
 * is the row's y, the column's x, or the sub-block's block number; the two
 * diagonals carry no index. */
export type SoloRegion =
  | { kind: "row"; index: number }
  | { kind: "col"; index: number }
  | { kind: "block"; index: number }
  | { kind: "diag0" }
  | { kind: "diag1" };

/** Why a Solo deduction forced a candidate change — the premise a hint narrates
 * and the cells it shades. Combined into {@link HintOp}'s `reason`.
 *
 * The placement reasons (`single` / `hiddenSingle` / `forcedSingle`) are
 * re-derived from the working board at emit time (§9.3a — the recorded `place`
 * carries a bare `single`, since the solver's positional/numeric `elim`
 * conflates naked and hidden singles); the killer placement reasons
 * (`cageSingle` / `cageIntersect`) are recorded directly because the working
 * board can't re-derive them. */
export type SoloReason =
  /** A forced single placement — re-derived to naked/hidden/forced at emit. */
  | { kind: "single" }
  /** A digit placed at `(px, py)`, struck from the rest of a shared group. */
  | { kind: "dup"; n: number; px: number; py: number }
  /** Every cell of `confined` that can still take `n` also lies in `target`, so
   * `n` must sit in their overlap and is ruled out of the rest of `target`. One
   * of the two is a sub-block, the other a row/column/diagonal. */
  | { kind: "intersect"; n: number; confined: SoloRegion; target: SoloRegion }
  /** A naked/hidden subset locks a set of digits to a set of cells in a region
   * (absent for the cross-line single-digit "X-wing" set). */
  | { kind: "set"; region?: SoloRegion }
  /** A forcing-chain contradiction. */
  | { kind: "forcing" }
  /** A *hidden* single — digit `n` fits only one cell of `region`. */
  | { kind: "hiddenSingle"; n: number; region: SoloRegion }
  /** A placement forced by deeper deductions the working notes don't reflect. */
  | { kind: "forcedSingle"; n: number }
  /** Killer: the remaining cell(s) of a cage must total `clue`; with one left it
   * is forced. */
  | { kind: "cageSingle"; cells: { x: number; y: number }[]; clue: number }
  /** Killer: a deduced extra-cage (a region minus the cages it fully contains)
   * with one undetermined cell, forced to the residual sum. */
  | { kind: "cageIntersect"; cells: { x: number; y: number }[]; clue: number }
  /** Killer: even the extreme the other cage cells can reach leaves no room for
   * `n` here. */
  | { kind: "cageMinMax"; cells: { x: number; y: number }[]; clue: number }
  /** Killer: no combination of digits summing to the clue uses `n` in this cell. */
  | { kind: "cageSums"; cells: { x: number; y: number }[]; clue: number };

/** A reason attached to a recorded Solo deduction (the narrowed hint reason). */
export type HintReason = SoloReason;

/** One recorded Solo deduction op (a {@link DeductionRecord} with a Solo reason). */
export interface HintOp extends DeductionRecord {
  reason: HintReason;
}

// --- precomputed killer sum-bit tables (precompute_sum_bits) ----------------
// sum_bitsK[clue][i] is a bitmask whose set bit j means "digit j is one of the
// K distinct 1..9 addends of this way to make `clue`"; the per-clue list is
// terminated by a 0 entry if shorter than the array.

const MAX_2SUMS = 5;
const MAX_3SUMS = 8;
const MAX_4SUMS = 12;

function findSumBits(
  array: number[],
  idx: number,
  valueLeft: number,
  addendsLeft: number,
  minAddend: number,
  bitmaskSoFar: number,
): number {
  for (let i = minAddend; i < valueLeft; i++) {
    const newBitmask = bitmaskSoFar | (1 << i);
    if (addendsLeft === 2) {
      const j = valueLeft - i;
      if (j <= i) break;
      if (j > 9) continue;
      array[idx++] = newBitmask | (1 << j);
    } else {
      idx = findSumBits(array, idx, valueLeft - i, addendsLeft - 1, i + 1, newBitmask);
    }
  }
  return idx;
}

/** `precompute_sum_bits`, run once eagerly at module load (cheap, deterministic,
 *  no RNG): the three killer addend-bitmask tables. */
function computeSumBits(): { b2: number[][]; b3: number[][]; b4: number[][] } {
  const b2 = Array.from({ length: 18 }, () => new Array<number>(MAX_2SUMS).fill(0));
  const b3 = Array.from({ length: 25 }, () => new Array<number>(MAX_3SUMS).fill(0));
  const b4 = Array.from({ length: 31 }, () => new Array<number>(MAX_4SUMS).fill(0));
  for (let i = 3; i < 31; i++) {
    if (i < 18) {
      const j = findSumBits(b2[i], 0, i, 2, 1, 0);
      if (j < MAX_2SUMS) b2[i][j] = 0;
    }
    if (i < 25) {
      const j = findSumBits(b3[i], 0, i, 3, 1, 0);
      if (j < MAX_3SUMS) b3[i][j] = 0;
    }
    const j = findSumBits(b4[i], 0, i, 4, 1, 0);
    if (j < MAX_4SUMS) b4[i][j] = 0;
  }
  return { b2, b3, b4 };
}

const { b2: sumBits2, b3: sumBits3, b4: sumBits4 } = computeSumBits();

// --- difficulty struct ------------------------------------------------------

export interface Difficulty {
  /** Maximum levels allowed. */
  maxdiff: number;
  maxkdiff: number;
  /** Levels reached by the solver (output). */
  diff: number;
  kdiff: number;
}

// --- mutable killer cages ---------------------------------------------------
// nr_squares[b] === blocks[b].length; nr_blocks === blocks.length.

interface Cages {
  whichblock: Int32Array;
  blocks: number[][];
}

/** The killer working state: the mutable cages + their running per-cage clue
 *  totals (length `cr*cr`, indexed by cage). Present together or not at all. */
interface KillerWork {
  kblocks: Cages;
  kclues: number[];
}

function dupCages(src: BlockStructure): Cages {
  return {
    whichblock: src.whichblock.slice(),
    blocks: src.blocks.map((b) => b.slice()),
  };
}

/** `remove_from_block`: drop cell `n` from cage `b`, mark it ownerless. */
function removeFromBlock(cages: Cages, b: number, n: number): void {
  cages.whichblock[n] = -1;
  const blk = cages.blocks[b];
  const idx = blk.indexOf(n);
  blk.splice(idx, 1);
}

/** `split_block`: peel `squares` off their (shared) cage into a brand-new one. */
function splitBlock(cages: Cages, squares: number[], nrSquares: number): void {
  const previous = cages.whichblock[squares[0]];
  const newblock = cages.blocks.length;
  const newcells: number[] = [];
  for (let i = 0; i < nrSquares; i++) {
    cages.whichblock[squares[i]] = newblock;
    newcells.push(squares[i]);
  }
  cages.blocks.push(newcells);
  const moved = new Set(squares.slice(0, nrSquares));
  cages.blocks[previous] = cages.blocks[previous].filter((sq) => !moved.has(sq));
}

/** Compact a 0/1 list (first `cr` entries) into the leading indices of its 1s;
 *  returns the count of 1s. */
function compactIndices(arr: Uint8Array, cr: number): number {
  let j = 0;
  for (let i = 0; i < cr; i++) if (arr[i]) arr[j++] = i;
  return j;
}

// --- solver usage -----------------------------------------------------------

class SolverUsage {
  readonly cr: number;
  readonly blocks: BlockStructure;
  /** Killer working cages + clue totals (null for non-killer). */
  killer: KillerWork | null;
  /** Deduced "extra" cages and their sums, rebuilt each KINTERSECT pass. */
  extraCages: number[][] = [];
  extraClues: number[] = [];

  /** Candidate cube: cube[(y*cr+x)*cr + n-1] truthy ⇒ digit n possible there. */
  readonly cube: Uint8Array;
  /** The grid we write deductions into (the caller's grid, mutated in place). */
  readonly grid: Int8Array;

  /** row[y*cr+n-1] / col[x*cr+n-1] / blk[b*cr+n-1] ⇒ digit n already placed. */
  readonly row: Uint8Array;
  readonly col: Uint8Array;
  readonly blk: Uint8Array;
  /** diag[n-1] = \-diag, diag[cr+n-1] = /-diag; null for non-X. */
  readonly diag: Uint8Array | null;

  // scratch buffers (solver_scratch)
  private readonly sGrid: Uint8Array;
  private readonly sRowidx: Uint8Array;
  private readonly sColidx: Uint8Array;
  private readonly sSet: Uint8Array;
  private readonly sNeighbours: Int32Array;
  private readonly sBfsqueue: Int32Array;
  private readonly sIndexlist: Int32Array;
  private readonly sIndexlist2: Int32Array;

  /** Hint-only deduction recorder; enabled by `run` only *after* the given
   * clues are placed (so cube-seeding dups aren't mistaken for teachable
   * deductions), left unset on the generator/solve path so that path is
   * byte-for-byte unchanged. */
  recorder?: DeductionRecorder;
  /** Stashed by {@link recordSoloDeductions}; promoted to `recorder` after the
   * givens are placed. */
  pendingRecorder?: DeductionRecorder;
  /** Current firing id — bumped once per top-level deduction attempt so every
   * record of one firing shares a `group`. */
  group = 0;

  constructor(
    cr: number,
    blocks: BlockStructure,
    kblocks: BlockStructure | null,
    xtype: boolean,
    grid: Int8Array,
    kgrid: ArrayLike<number> | null,
  ) {
    const area = cr * cr;
    this.cr = cr;
    this.blocks = blocks;
    this.grid = grid;

    // Killer state exists iff we have both the cages and the clue grid (upstream
    // gates every killer deduction on `kclues != NULL`, which is built only when
    // kgrid is present — so coupling the two matches that behaviour).
    if (kblocks && kgrid) {
      const nclues = kblocks.nrBlocks;
      const kclues = new Array<number>(area).fill(0);
      for (let i = 0; i < nclues; i++) {
        for (const cell of kblocks.blocks[i]) {
          if (kgrid[cell] !== 0) kclues[i] = kgrid[cell];
        }
      }
      this.killer = { kblocks: dupCages(kblocks), kclues };
    } else {
      this.killer = null;
    }

    this.cube = new Uint8Array(area * cr).fill(1);
    this.row = new Uint8Array(area);
    this.col = new Uint8Array(area);
    this.blk = new Uint8Array(area);
    this.diag = xtype ? new Uint8Array(cr * 2) : null;

    this.sGrid = new Uint8Array(area);
    this.sRowidx = new Uint8Array(cr);
    this.sColidx = new Uint8Array(cr);
    this.sSet = new Uint8Array(cr);
    this.sNeighbours = new Int32Array(5 * cr);
    this.sBfsqueue = new Int32Array(area);
    this.sIndexlist = new Int32Array(area);
    this.sIndexlist2 = new Int32Array(cr);
  }

  // cube accessors (cubepos / cubepos2 macros)
  private cubeAt(x: number, y: number, n: number): number {
    return this.cube[(y * this.cr + x) * this.cr + n - 1];
  }
  private cube2At(xy: number, n: number): number {
    return this.cube[xy * this.cr + n - 1];
  }
  private setCube(x: number, y: number, n: number, v: number): void {
    this.cube[(y * this.cr + x) * this.cr + n - 1] = v;
  }
  private setCube2(xy: number, n: number, v: number): void {
    this.cube[xy * this.cr + n - 1] = v;
  }

  /** Record an `elim` op at cube cell index `xy` for digit `n`. */
  private recElim(xy: number, n: number, reason: SoloReason): void {
    this.recorder?.({
      kind: "elim",
      x: xy % this.cr,
      y: (xy / this.cr) | 0,
      n,
      reason,
      group: this.group,
    });
  }

  /** `solver_place`: commit digit `n` at (x, y) and propagate the eliminations.
   * On the recording path the placement op is recorded with `reason` (default a
   * generic `single`, re-derived at emit time); the propagated row/col/block/
   * diagonal dup strikes are NOT recorded — the hint plan recomputes those from
   * the working notes (`emitPlacement`/`basicRegionStrike`), matching Keen. */
  place(x: number, y: number, n: number, reason?: SoloReason): void {
    const cr = this.cr;
    const sqindex = y * cr + x;

    this.recorder?.({
      kind: "place",
      x,
      y,
      n,
      reason: reason ?? { kind: "single" },
      group: this.group,
    });

    for (let i = 1; i <= cr; i++) if (i !== n) this.setCube(x, y, i, 0);
    for (let i = 0; i < cr; i++) if (i !== y) this.setCube(x, i, n, 0);
    for (let i = 0; i < cr; i++) if (i !== x) this.setCube(i, y, n, 0);

    const bi = this.blocks.whichblock[sqindex];
    for (let i = 0; i < cr; i++) {
      const bp = this.blocks.blocks[bi][i];
      if (bp !== sqindex) this.setCube2(bp, n, 0);
    }

    this.grid[sqindex] = n;
    this.row[y * cr + n - 1] = 1;
    this.col[x * cr + n - 1] = 1;
    this.blk[bi * cr + n - 1] = 1;

    if (this.diag) {
      if (onDiag0(sqindex, cr)) {
        for (let i = 0; i < cr; i++) if (diag0(i, cr) !== sqindex) this.setCube2(diag0(i, cr), n, 0);
        this.diag[n - 1] = 1;
      }
      if (onDiag1(sqindex, cr)) {
        for (let i = 0; i < cr; i++) if (diag1(i, cr) !== sqindex) this.setCube2(diag1(i, cr), n, 0);
        this.diag[cr + n - 1] = 1;
      }
    }
  }

  /** `solver_elim`: a section of `cr` cube positions; place if exactly one set,
   *  +1 progress / 0 nothing / -1 contradiction (no possibility). */
  private elim(indices: Int32Array): number {
    const cr = this.cr;
    let m = 0;
    let fpos = -1;
    for (let i = 0; i < cr; i++) {
      if (this.cube[indices[i]]) {
        fpos = indices[i];
        m++;
      }
    }
    if (m === 1) {
      const n = 1 + (fpos % cr);
      let x = (fpos / cr) | 0;
      const y = (x / cr) | 0;
      x %= cr;
      if (!this.grid[y * cr + x]) {
        this.place(x, y, n);
        return 1;
      }
    } else if (m === 0) {
      return -1;
    }
    return 0;
  }

  /** `solver_intersect`: if every candidate of domain 1 lies in its overlap with
   *  domain 2, rule the number out elsewhere in domain 2. Both `cr`-length and
   *  sorted ascending by cube position. Never returns -1. */
  private intersect(
    indices1: Int32Array,
    indices2: Int32Array,
    reason?: SoloReason,
  ): number {
    const cr = this.cr;
    for (let i = 0, j = 0; i < cr; i++) {
      const p = indices1[i];
      while (j < cr && indices2[j] < p) j++;
      if (this.cube[p]) {
        if (j < cr && indices2[j] === p) continue;
        return 0;
      }
    }
    let ret = 0;
    for (let i = 0, j = 0; i < cr; i++) {
      const p = indices2[i];
      while (j < cr && indices1[j] < p) j++;
      if (this.cube[p] && (j >= cr || indices1[j] !== p)) {
        ret = 1;
        if (this.recorder && reason) this.recElim((p / cr) | 0, 1 + (p % cr), reason);
        this.cube[p] = 0;
      }
    }
    return ret;
  }

  /** `solver_set`: a `cr × cr` matrix of cube positions (`indices[i*cr+j]`);
   *  hidden/naked subset elimination. +1 / 0 / -1. */
  private set_(indices: Int32Array, reason?: SoloReason): number {
    const cr = this.cr;
    const grid = this.sGrid;
    const rowidx = this.sRowidx;
    const colidx = this.sColidx;
    const set = this.sSet;

    rowidx.fill(1, 0, cr);
    colidx.fill(1, 0, cr);
    for (let i = 0; i < cr; i++) {
      let count = 0;
      let first = -1;
      for (let j = 0; j < cr; j++) {
        if (this.cube[indices[i * cr + j]]) {
          first = j;
          count++;
        }
      }
      if (count === 0) return -1;
      if (count === 1) {
        rowidx[i] = 0;
        colidx[first] = 0;
      }
    }

    // Convert rowidx/colidx from 0/1 lists to lists of the indices of the 1s
    // (both have the same count `n` by construction).
    const n = compactIndices(rowidx, cr);
    compactIndices(colidx, cr);

    // Build the smaller n×n matrix.
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        grid[i * cr + j] = this.cube[indices[rowidx[i] * cr + colidx[j]]];

    set.fill(0, 0, n);
    let count = 0;
    while (true) {
      if (count > 1 && count < n - 1) {
        let rows = 0;
        for (let i = 0; i < n; i++) {
          let ok = true;
          for (let j = 0; j < n; j++)
            if (set[j] && grid[i * cr + j]) {
              ok = false;
              break;
            }
          if (ok) rows++;
        }
        if (rows > n - count) return -1;
        if (rows >= n - count) {
          let progress = false;
          for (let i = 0; i < n; i++) {
            let ok = true;
            for (let j = 0; j < n; j++)
              if (set[j] && grid[i * cr + j]) {
                ok = false;
                break;
              }
            if (!ok) {
              for (let j = 0; j < n; j++)
                if (!set[j] && grid[i * cr + j]) {
                  const fpos = indices[rowidx[i] * cr + colidx[j]];
                  progress = true;
                  if (this.recorder && reason)
                    this.recElim((fpos / cr) | 0, 1 + (fpos % cr), reason);
                  this.cube[fpos] = 0;
                }
            }
          }
          if (progress) return 1;
        }
      }
      // binary increment of `set`
      let i = n;
      while (i > 0 && set[i - 1]) {
        set[--i] = 0;
        count--;
      }
      if (i > 0) {
        set[--i] = 1;
        count++;
      } else break;
    }
    return 0;
  }

  /** `solver_forcing`: forcing-chain deduction via per-candidate BFS. +1 / 0. */
  private forcing(): number {
    const cr = this.cr;
    const bfsqueue = this.sBfsqueue;
    const number = this.sGrid;
    const neighbours = this.sNeighbours;

    for (let y = 0; y < cr; y++) {
      for (let x = 0; x < cr; x++) {
        let count = 0;
        let t = 0;
        for (let nn = 1; nn <= cr; nn++)
          if (this.cubeAt(x, y, nn)) {
            count++;
            t += nn;
          }
        if (count !== 2) continue;

        for (let n = 1; n <= cr; n++) {
          if (!this.cubeAt(x, y, n)) continue;
          const orign = n;
          number.fill(cr + 1, 0, cr * cr);
          let head = 0;
          let tail = 0;
          bfsqueue[tail++] = y * cr + x;
          number[y * cr + x] = t - n;

          while (head < tail) {
            let xx = bfsqueue[head++];
            const yy = (xx / cr) | 0;
            xx %= cr;
            const currn = number[yy * cr + xx];

            let nneighbours = 0;
            for (let yt = 0; yt < cr; yt++) neighbours[nneighbours++] = yt * cr + xx;
            for (let xt = 0; xt < cr; xt++) neighbours[nneighbours++] = yy * cr + xt;
            const blkIdx = this.blocks.whichblock[yy * cr + xx];
            for (let yt = 0; yt < cr; yt++) neighbours[nneighbours++] = this.blocks.blocks[blkIdx][yt];
            if (this.diag) {
              const sqindex = yy * cr + xx;
              if (onDiag0(sqindex, cr)) for (let i = 0; i < cr; i++) neighbours[nneighbours++] = diag0(i, cr);
              if (onDiag1(sqindex, cr)) for (let i = 0; i < cr; i++) neighbours[nneighbours++] = diag1(i, cr);
            }

            for (let i = 0; i < nneighbours; i++) {
              const xt = neighbours[i] % cr;
              const yt = (neighbours[i] / cr) | 0;
              if (number[yt * cr + xt] <= cr) continue;
              if (!this.cubeAt(xt, yt, currn)) continue;
              if (xt === xx && yt === yy) continue;

              let cc = 0;
              let tt = 0;
              for (let nn = 1; nn <= cr; nn++)
                if (this.cubeAt(xt, yt, nn)) {
                  cc++;
                  tt += nn;
                }
              if (cc === 2) {
                bfsqueue[tail++] = yt * cr + xt;
                number[yt * cr + xt] = tt - currn;
              }

              if (
                currn === orign &&
                (xt === x ||
                  yt === y ||
                  this.blocks.whichblock[yt * cr + xt] === this.blocks.whichblock[y * cr + x] ||
                  (this.diag &&
                    ((onDiag0(yt * cr + xt, cr) && onDiag0(y * cr + x, cr)) ||
                      (onDiag1(yt * cr + xt, cr) && onDiag1(y * cr + x, cr)))))
              ) {
                this.recorder?.({
                  kind: "elim",
                  x: xt,
                  y: yt,
                  n: orign,
                  reason: { kind: "forcing" },
                  group: this.group,
                });
                this.setCube(xt, yt, orign, 0);
                return 1;
              }
            }
          }
        }
      }
    }
    return 0;
  }

  /** Cell indices → reading-order `{x, y}` (for a recorded cage reason). */
  private cellsXY(cells: number[]): { x: number; y: number }[] {
    const cr = this.cr;
    return cells.map((c) => ({ x: c % cr, y: (c / cr) | 0 }));
  }

  /** `solver_killer_minmax` for a single cage's cell list + clue. +1 / 0. */
  private killerMinmax(cells: number[], clue: number): number {
    const cr = this.cr;
    let ret = 0;
    const nsquares = cells.length;
    if (clue === 0) return 0;
    let cageCells: { x: number; y: number }[] | null = null;
    const recCage = (xy: number, n: number): void => {
      if (!this.recorder) return;
      if (!cageCells) cageCells = this.cellsXY(cells);
      this.recElim(xy, n, { kind: "cageMinMax", cells: cageCells, clue });
    };

    for (let i = 0; i < nsquares; i++) {
      const x = cells[i];
      for (let n = 1; n <= cr; n++) {
        if (!this.cube2At(x, n)) continue;
        let maxval = 0;
        let minval = 0;
        for (let j = 0; j < nsquares; j++) {
          if (i === j) continue;
          const yy = cells[j];
          for (let m = 1; m <= cr; m++)
            if (this.cube2At(yy, m)) {
              minval += m;
              break;
            }
          for (let m = cr; m > 0; m--)
            if (this.cube2At(yy, m)) {
              maxval += m;
              break;
            }
        }
        if (maxval + n < clue) {
          recCage(x, n);
          this.setCube2(x, n, 0);
          ret = 1;
        } else if (minval + n > clue) {
          recCage(x, n);
          this.setCube2(x, n, 0);
          ret = 1;
        }
      }
    }
    return ret;
  }

  /** `solver_killer_sums` for a single cage's cell list + clue. +1 / 0 / -1. */
  private killerSums(cells: number[], clue: number, cageIsRegion: boolean): number {
    const cr = this.cr;
    const nsquares = cells.length;

    if (clue === 0) return 0;
    if (nsquares === 0) return -1;
    if (nsquares < 2 || nsquares > 4) return 0;

    if (!cageIsRegion) {
      let knownRow = -1;
      let knownCol = -1;
      let knownBlock = -1;
      for (let i = 0; i < nsquares; i++) {
        const x = cells[i];
        if (i === 0) {
          knownRow = (x / cr) | 0;
          knownCol = x % cr;
          knownBlock = this.blocks.whichblock[x];
        } else {
          if (knownRow !== ((x / cr) | 0)) knownRow = -1;
          if (knownCol !== x % cr) knownCol = -1;
          if (knownBlock !== this.blocks.whichblock[x]) knownBlock = -1;
        }
      }
      if (knownBlock === -1 && knownCol === -1 && knownRow === -1) return 0;
    }

    let sumbits: number[];
    let maxSums: number;
    if (nsquares === 2) {
      if (clue < 3 || clue > 17) return -1;
      sumbits = sumBits2[clue];
      maxSums = MAX_2SUMS;
    } else if (nsquares === 3) {
      if (clue < 6 || clue > 24) return -1;
      sumbits = sumBits3[clue];
      maxSums = MAX_3SUMS;
    } else {
      if (clue < 10 || clue > 30) return -1;
      sumbits = sumBits4[clue];
      maxSums = MAX_4SUMS;
    }

    let possibleAddends = 0;
    for (let i = 0; i < maxSums; i++) {
      const bits = sumbits[i];
      if (bits === 0) break;
      let j = 0;
      for (; j < nsquares; j++) {
        let squareBits = bits;
        const x = cells[j];
        for (let n = 1; n <= cr; n++) if (!this.cube2At(x, n)) squareBits &= ~(1 << n);
        if (squareBits === 0) break;
      }
      if (j === nsquares) possibleAddends |= bits;
    }
    if (possibleAddends === 0) return -1;

    let ret = 0;
    let cageCells: { x: number; y: number }[] | null = null;
    for (let i = 0; i < nsquares; i++) {
      const x = cells[i];
      for (let n = 1; n <= cr; n++) {
        if (!this.cube2At(x, n)) continue;
        if ((possibleAddends & (1 << n)) === 0) {
          if (this.recorder) {
            if (!cageCells) cageCells = this.cellsXY(cells);
            this.recElim(x, n, { kind: "cageSums", cells: cageCells, clue });
          }
          this.setCube2(x, n, 0);
          ret = 1;
        }
      }
    }
    return ret;
  }

  /** `filter_whole_cages`: from `squares`, drop filled cells and whole cages
   *  fully covered by the list; returns the leftover length (the first `len`
   *  entries of `squares` are the residual cage) + the summed-away total. */
  private filterWholeCages(
    squares: number[],
    kblocks: Cages,
    kclues: number[],
  ): { len: number; filteredSum: number } {
    let filteredSum = 0;
    let n = squares.length;

    let j = 0;
    for (let i = 0; i < n; i++) {
      if (this.grid[squares[i]]) filteredSum += this.grid[squares[i]];
      else squares[j++] = squares[i];
    }
    n = j;

    let off = 0;
    for (let b = 0; b < kblocks.blocks.length && off < n; b++) {
      const bSquares = kblocks.blocks[b].length;
      let matched = 0;
      if (bSquares === 0) continue;
      for (let i = 0; i < bSquares; i++) {
        for (let jj = off; jj < n; jj++) {
          if (squares[jj] === kblocks.blocks[b][i]) {
            const t = squares[off + matched];
            squares[off + matched] = squares[jj];
            squares[jj] = t;
            matched++;
            break;
          }
        }
      }
      if (matched !== kblocks.blocks[b].length) {
        off += matched;
        continue;
      }
      for (let k = off; k + matched < n; k++) squares[k] = squares[k + matched];
      n -= matched;
      filteredSum += kclues[b];
    }
    return { len: off, filteredSum };
  }

  /** The cells of region `(i, n)`: i=0 row n, i=1 column n, i=2 (digit) block n. */
  private regionCells(i: number, n: number): number[] {
    const cr = this.cr;
    const out: number[] = [];
    if (i === 0) for (let k = 0; k < cr; k++) out.push(n * cr + k);
    else if (i === 1) for (let k = 0; k < cr; k++) out.push(k * cr + n);
    else for (const cell of this.blocks.blocks[n]) out.push(cell);
    return out;
  }

  /**
   * The main deduction driver (`solver`'s body). Mutates `this.grid` and writes
   * `dlev.diff`/`dlev.kdiff`. Recurses through the module-level `runSolver`.
   */
  run(
    blocksImmutable: BlockStructure,
    kblocksImmutable: BlockStructure | null,
    xtype: boolean,
    kgrid: ArrayLike<number> | null,
    dlev: Difficulty,
  ): void {
    const cr = this.cr;
    const grid = this.grid;
    const idx = this.sIndexlist;
    const idx2 = this.sIndexlist2;
    let diff = DIFF_BLOCK;
    let kdiff = DIFF_KSINGLE;

    const finish = (d: number): void => {
      dlev.diff = d;
      dlev.kdiff = kdiff;
    };

    // Place all given clues.
    for (let x = 0; x < cr; x++) {
      for (let y = 0; y < cr; y++) {
        const n = grid[y * cr + x];
        if (n) {
          if (!this.cubeAt(x, y, n)) {
            finish(DIFF_IMPOSSIBLE);
            return;
          }
          this.place(x, y, n);
        }
      }
    }

    // Givens are seeded; from here every deduction is teachable, so enable the
    // recorder (kept off through the given placement above so cube-seeding dups
    // aren't mistaken for deductions — §9.1 soundness boundary).
    this.recorder = this.pendingRecorder;

    mainloop: while (true) {
      // One mainloop iteration = at most one firing (each technique `continue`s
      // to the top on progress), so bumping the group here gives every record of
      // one firing a shared group id.
      this.group++;
      // Blockwise positional elimination.
      for (let b = 0; b < cr; b++)
        for (let n = 1; n <= cr; n++)
          if (!this.blk[b * cr + n - 1]) {
            for (let i = 0; i < cr; i++) idx[i] = this.blocks.blocks[b][i] * cr + n - 1;
            const ret = this.elim(idx);
            if (ret < 0) {
              finish(DIFF_IMPOSSIBLE);
              return;
            }
            if (ret > 0) {
              diff = Math.max(diff, DIFF_BLOCK);
              continue mainloop;
            }
          }

      if (this.killer !== null) {
        const { kblocks, kclues } = this.killer;
        let changed = false;

        // Reduce cages by their filled-in squares (reverse walk: removal compacts).
        for (let b = 0; b < kblocks.blocks.length; b++) {
          for (let i = kblocks.blocks[b].length - 1; i >= 0; i--) {
            const x = kblocks.blocks[b][i];
            const t = grid[x];
            if (t === 0) continue;
            removeFromBlock(kblocks, b, x);
            if (t > kclues[b]) {
              finish(DIFF_IMPOSSIBLE);
              return;
            }
            kclues[b] -= t;
            for (let nn = 0; nn < kblocks.blocks[b].length; nn++)
              this.setCube2(kblocks.blocks[b][nn], t, 0);
          }
        }

        // Trivial killer: fill single-square cages.
        for (let b = 0; b < kblocks.blocks.length; b++) {
          if (kblocks.blocks[b].length === 1) {
            const v = kclues[b];
            if (v < 1 || v > cr) {
              finish(DIFF_IMPOSSIBLE);
              return;
            }
            const cell = kblocks.blocks[b][0];
            const x = cell % cr;
            const y = (cell / cr) | 0;
            if (!this.cubeAt(x, y, v)) {
              finish(DIFF_IMPOSSIBLE);
              return;
            }
            this.place(x, y, v, { kind: "cageSingle", cells: [{ x, y }], clue: v });
            changed = true;
          }
        }

        if (changed) {
          kdiff = Math.max(kdiff, DIFF_KSINGLE);
          continue;
        }
      }

      if (dlev.maxkdiff >= DIFF_KINTERSECT && this.killer !== null) {
        const { kblocks, kclues } = this.killer;
        let changed = false;
        this.extraCages = [];
        this.extraClues = [];

        for (let i = 0; i < 3; i++) {
          for (let n = 0; n < cr; n++) {
            const extraList = this.regionCells(i, n);
            let sum = (cr * (cr + 1)) / 2;
            const { len: nsquares, filteredSum } = this.filterWholeCages(extraList, kblocks, kclues);
            sum -= filteredSum;
            if (nsquares === cr || nsquares === 0) continue;
            if (dlev.maxdiff >= DIFF_RECURSIVE) {
              // NB: upstream sets dlev->diff = DIFF_IMPOSSIBLE here, but the
              // got_result label immediately overwrites it with the local
              // `diff`; we replicate that (effective) behaviour faithfully.
              if (sum <= 0) {
                finish(diff);
                return;
              }
            }

            const cells = extraList.slice(0, nsquares);
            if (nsquares === 1) {
              if (sum > cr) {
                finish(DIFF_IMPOSSIBLE);
                return;
              }
              const x = cells[0] % cr;
              const y = (cells[0] / cr) | 0;
              if (!this.cubeAt(x, y, sum)) {
                finish(DIFF_IMPOSSIBLE);
                return;
              }
              this.place(x, y, sum, { kind: "cageIntersect", cells: [{ x, y }], clue: sum });
              changed = true;
            }

            const b0 = kblocks.whichblock[cells[0]];
            let allSame = nsquares;
            for (let k = 1; k < nsquares; k++)
              if (kblocks.whichblock[cells[k]] !== b0) {
                allSame = k;
                break;
              }
            if (allSame === nsquares) {
              splitBlock(kblocks, cells, nsquares);
              kclues[kblocks.blocks.length - 1] = sum;
              kclues[b0] -= sum;
            } else {
              this.extraCages.push(cells);
              this.extraClues.push(sum);
            }
          }
        }
        if (changed) {
          kdiff = Math.max(kdiff, DIFF_KINTERSECT);
          continue;
        }
      }

      if (dlev.maxkdiff >= DIFF_KMINMAX && this.killer !== null) {
        const { kblocks, kclues } = this.killer;
        let changed = false;
        for (let b = 0; b < kblocks.blocks.length; b++) {
          const ret = this.killerMinmax(kblocks.blocks[b], kclues[b]);
          if (ret > 0) {
            changed = true;
            if (this.recorder) break; // one cage = one firing on the hint path
          }
        }
        if (!(this.recorder && changed))
          for (let b = 0; b < this.extraCages.length; b++) {
            const ret = this.killerMinmax(this.extraCages[b], this.extraClues[b]);
            if (ret > 0) {
              changed = true;
              if (this.recorder) break;
            }
          }
        if (changed) {
          kdiff = Math.max(kdiff, DIFF_KMINMAX);
          continue;
        }
      }

      if (dlev.maxkdiff >= DIFF_KSUMS && this.killer !== null) {
        const { kblocks, kclues } = this.killer;
        let changed = false;
        for (let b = 0; b < kblocks.blocks.length; b++) {
          const ret = this.killerSums(kblocks.blocks[b], kclues[b], true);
          if (ret > 0) {
            changed = true;
            kdiff = Math.max(kdiff, DIFF_KSUMS);
            if (this.recorder) break; // one cage = one firing on the hint path
          } else if (ret < 0) {
            finish(DIFF_IMPOSSIBLE);
            return;
          }
        }
        if (!(this.recorder && changed))
          for (let b = 0; b < this.extraCages.length; b++) {
            const ret = this.killerSums(this.extraCages[b], this.extraClues[b], false);
            if (ret > 0) {
              changed = true;
              kdiff = Math.max(kdiff, DIFF_KSUMS);
              if (this.recorder) break;
            } else if (ret < 0) {
              finish(DIFF_IMPOSSIBLE);
              return;
            }
          }
        if (changed) continue;
      }

      if (dlev.maxdiff <= DIFF_BLOCK) break;

      // Row-wise positional elimination.
      for (let y = 0; y < cr; y++)
        for (let n = 1; n <= cr; n++)
          if (!this.row[y * cr + n - 1]) {
            for (let x = 0; x < cr; x++) idx[x] = (y * cr + x) * cr + n - 1;
            const ret = this.elim(idx);
            if (ret < 0) {
              finish(DIFF_IMPOSSIBLE);
              return;
            }
            if (ret > 0) {
              diff = Math.max(diff, DIFF_SIMPLE);
              continue mainloop;
            }
          }
      // Column-wise positional elimination.
      for (let x = 0; x < cr; x++)
        for (let n = 1; n <= cr; n++)
          if (!this.col[x * cr + n - 1]) {
            for (let y = 0; y < cr; y++) idx[y] = (y * cr + x) * cr + n - 1;
            const ret = this.elim(idx);
            if (ret < 0) {
              finish(DIFF_IMPOSSIBLE);
              return;
            }
            if (ret > 0) {
              diff = Math.max(diff, DIFF_SIMPLE);
              continue mainloop;
            }
          }

      // X-diagonal positional elimination.
      if (this.diag) {
        for (let n = 1; n <= cr; n++)
          if (!this.diag[n - 1]) {
            for (let i = 0; i < cr; i++) idx[i] = diag0(i, cr) * cr + n - 1;
            const ret = this.elim(idx);
            if (ret < 0) {
              finish(DIFF_IMPOSSIBLE);
              return;
            }
            if (ret > 0) {
              diff = Math.max(diff, DIFF_SIMPLE);
              continue mainloop;
            }
          }
        for (let n = 1; n <= cr; n++)
          if (!this.diag[cr + n - 1]) {
            for (let i = 0; i < cr; i++) idx[i] = diag1(i, cr) * cr + n - 1;
            const ret = this.elim(idx);
            if (ret < 0) {
              finish(DIFF_IMPOSSIBLE);
              return;
            }
            if (ret > 0) {
              diff = Math.max(diff, DIFF_SIMPLE);
              continue mainloop;
            }
          }
      }

      // Numeric elimination.
      for (let x = 0; x < cr; x++)
        for (let y = 0; y < cr; y++)
          if (!grid[y * cr + x]) {
            for (let n = 1; n <= cr; n++) idx[n - 1] = (y * cr + x) * cr + n - 1;
            const ret = this.elim(idx);
            if (ret < 0) {
              finish(DIFF_IMPOSSIBLE);
              return;
            }
            if (ret > 0) {
              diff = Math.max(diff, DIFF_SIMPLE);
              continue mainloop;
            }
          }

      if (dlev.maxdiff <= DIFF_SIMPLE) break;

      // Intersectional analysis, rows vs blocks.
      for (let y = 0; y < cr; y++)
        for (let b = 0; b < cr; b++)
          for (let n = 1; n <= cr; n++) {
            if (this.row[y * cr + n - 1] || this.blk[b * cr + n - 1]) continue;
            for (let i = 0; i < cr; i++) {
              idx[i] = (y * cr + i) * cr + n - 1;
              idx2[i] = this.blocks.blocks[b][i] * cr + n - 1;
            }
            const rec = this.recorder;
            const line: SoloRegion = { kind: "row", index: y };
            const block: SoloRegion = { kind: "block", index: b };
            if (
              this.intersect(idx, idx2, rec ? { kind: "intersect", n, confined: line, target: block } : undefined) ||
              this.intersect(idx2, idx, rec ? { kind: "intersect", n, confined: block, target: line } : undefined)
            ) {
              diff = Math.max(diff, DIFF_INTERSECT);
              continue mainloop;
            }
          }
      // Intersectional analysis, columns vs blocks.
      for (let x = 0; x < cr; x++)
        for (let b = 0; b < cr; b++)
          for (let n = 1; n <= cr; n++) {
            if (this.col[x * cr + n - 1] || this.blk[b * cr + n - 1]) continue;
            for (let i = 0; i < cr; i++) {
              idx[i] = (i * cr + x) * cr + n - 1;
              idx2[i] = this.blocks.blocks[b][i] * cr + n - 1;
            }
            const rec = this.recorder;
            const line: SoloRegion = { kind: "col", index: x };
            const block: SoloRegion = { kind: "block", index: b };
            if (
              this.intersect(idx, idx2, rec ? { kind: "intersect", n, confined: line, target: block } : undefined) ||
              this.intersect(idx2, idx, rec ? { kind: "intersect", n, confined: block, target: line } : undefined)
            ) {
              diff = Math.max(diff, DIFF_INTERSECT);
              continue mainloop;
            }
          }

      if (this.diag) {
        // \-diagonal vs blocks.
        for (let b = 0; b < cr; b++)
          for (let n = 1; n <= cr; n++) {
            if (this.diag[n - 1] || this.blk[b * cr + n - 1]) continue;
            for (let i = 0; i < cr; i++) {
              idx[i] = diag0(i, cr) * cr + n - 1;
              idx2[i] = this.blocks.blocks[b][i] * cr + n - 1;
            }
            const rec = this.recorder;
            const line: SoloRegion = { kind: "diag0" };
            const block: SoloRegion = { kind: "block", index: b };
            if (
              this.intersect(idx, idx2, rec ? { kind: "intersect", n, confined: line, target: block } : undefined) ||
              this.intersect(idx2, idx, rec ? { kind: "intersect", n, confined: block, target: line } : undefined)
            ) {
              diff = Math.max(diff, DIFF_INTERSECT);
              continue mainloop;
            }
          }
        // /-diagonal vs blocks.
        for (let b = 0; b < cr; b++)
          for (let n = 1; n <= cr; n++) {
            if (this.diag[cr + n - 1] || this.blk[b * cr + n - 1]) continue;
            for (let i = 0; i < cr; i++) {
              idx[i] = diag1(i, cr) * cr + n - 1;
              idx2[i] = this.blocks.blocks[b][i] * cr + n - 1;
            }
            const rec = this.recorder;
            const line: SoloRegion = { kind: "diag1" };
            const block: SoloRegion = { kind: "block", index: b };
            if (
              this.intersect(idx, idx2, rec ? { kind: "intersect", n, confined: line, target: block } : undefined) ||
              this.intersect(idx2, idx, rec ? { kind: "intersect", n, confined: block, target: line } : undefined)
            ) {
              diff = Math.max(diff, DIFF_INTERSECT);
              continue mainloop;
            }
          }
      }

      if (dlev.maxdiff <= DIFF_INTERSECT) break;

      // Blockwise set elimination.
      for (let b = 0; b < cr; b++) {
        for (let i = 0; i < cr; i++)
          for (let n = 1; n <= cr; n++) idx[i * cr + n - 1] = this.blocks.blocks[b][i] * cr + n - 1;
        const ret = this.set_(
          idx,
          this.recorder ? { kind: "set", region: { kind: "block", index: b } } : undefined,
        );
        if (ret < 0) {
          finish(DIFF_IMPOSSIBLE);
          return;
        }
        if (ret > 0) {
          diff = Math.max(diff, DIFF_SET);
          continue mainloop;
        }
      }
      // Row-wise set elimination.
      for (let y = 0; y < cr; y++) {
        for (let x = 0; x < cr; x++)
          for (let n = 1; n <= cr; n++) idx[x * cr + n - 1] = (y * cr + x) * cr + n - 1;
        const ret = this.set_(
          idx,
          this.recorder ? { kind: "set", region: { kind: "row", index: y } } : undefined,
        );
        if (ret < 0) {
          finish(DIFF_IMPOSSIBLE);
          return;
        }
        if (ret > 0) {
          diff = Math.max(diff, DIFF_SET);
          continue mainloop;
        }
      }
      // Column-wise set elimination.
      for (let x = 0; x < cr; x++) {
        for (let y = 0; y < cr; y++)
          for (let n = 1; n <= cr; n++) idx[y * cr + n - 1] = (y * cr + x) * cr + n - 1;
        const ret = this.set_(
          idx,
          this.recorder ? { kind: "set", region: { kind: "col", index: x } } : undefined,
        );
        if (ret < 0) {
          finish(DIFF_IMPOSSIBLE);
          return;
        }
        if (ret > 0) {
          diff = Math.max(diff, DIFF_SET);
          continue mainloop;
        }
      }

      if (this.diag) {
        // \-diagonal set elimination.
        for (let i = 0; i < cr; i++)
          for (let n = 1; n <= cr; n++) idx[i * cr + n - 1] = diag0(i, cr) * cr + n - 1;
        let ret = this.set_(
          idx,
          this.recorder ? { kind: "set", region: { kind: "diag0" } } : undefined,
        );
        if (ret < 0) {
          finish(DIFF_IMPOSSIBLE);
          return;
        }
        if (ret > 0) {
          diff = Math.max(diff, DIFF_SET);
          continue;
        }
        // /-diagonal set elimination.
        for (let i = 0; i < cr; i++)
          for (let n = 1; n <= cr; n++) idx[i * cr + n - 1] = diag1(i, cr) * cr + n - 1;
        ret = this.set_(
          idx,
          this.recorder ? { kind: "set", region: { kind: "diag1" } } : undefined,
        );
        if (ret < 0) {
          finish(DIFF_IMPOSSIBLE);
          return;
        }
        if (ret > 0) {
          diff = Math.max(diff, DIFF_SET);
          continue;
        }
      }

      if (dlev.maxdiff <= DIFF_SET) break;

      // Row-vs-column set elimination on a single number.
      for (let n = 1; n <= cr; n++) {
        for (let y = 0; y < cr; y++)
          for (let x = 0; x < cr; x++) idx[y * cr + x] = (y * cr + x) * cr + n - 1;
        const ret = this.set_(idx, this.recorder ? { kind: "set" } : undefined);
        if (ret < 0) {
          finish(DIFF_IMPOSSIBLE);
          return;
        }
        if (ret > 0) {
          diff = Math.max(diff, DIFF_EXTREME);
          continue mainloop;
        }
      }

      // Forcing chains.
      if (this.forcing()) {
        diff = Math.max(diff, DIFF_EXTREME);
        continue;
      }

      // No deductions this iteration — terminate.
      break;
    }

    // Recursion, if permitted and the grid is not yet full.
    if (dlev.maxdiff >= DIFF_RECURSIVE) {
      let best = -1;
      let bestcount = cr + 1;
      for (let y = 0; y < cr; y++)
        for (let x = 0; x < cr; x++)
          if (!grid[y * cr + x]) {
            let count = 0;
            for (let n = 1; n <= cr; n++) if (this.cubeAt(x, y, n)) count++;
            // count > 1 guaranteed (impossibilities found earlier).
            if (count < bestcount) {
              bestcount = count;
              best = y * cr + x;
            }
          }

      if (best !== -1) {
        diff = DIFF_IMPOSSIBLE; // no solution found yet
        const y = (best / cr) | 0;
        const x = best % cr;

        const ingrid = grid.slice();
        const list: number[] = [];
        for (let n = 1; n <= cr; n++) if (this.cubeAt(x, y, n)) list.push(n);

        for (let i = 0; i < list.length; i++) {
          const outgrid = ingrid.slice();
          outgrid[y * cr + x] = list[i];

          runSolver(cr, blocksImmutable, kblocksImmutable, xtype, outgrid, kgrid, dlev);

          if (diff === DIFF_IMPOSSIBLE && dlev.diff !== DIFF_IMPOSSIBLE) grid.set(outgrid);

          if (dlev.diff === DIFF_AMBIGUOUS) diff = DIFF_AMBIGUOUS;
          else if (dlev.diff === DIFF_IMPOSSIBLE) {
            /* keep our return value */
          } else {
            if (diff === DIFF_IMPOSSIBLE) diff = DIFF_RECURSIVE;
            else diff = DIFF_AMBIGUOUS;
          }

          if (diff === DIFF_AMBIGUOUS) break;
        }
      }
    } else {
      // Recursion forbidden: success iff the grid is full.
      for (let y = 0; y < cr; y++)
        for (let x = 0; x < cr; x++) if (!grid[y * cr + x]) diff = DIFF_IMPOSSIBLE;
    }

    finish(diff);
  }
}

/**
 * Low-level solver, faithful to `solo.c`'s `solver()`. Mutates `grid` in place
 * (writing deductions / the recursive solution) and sets `dlev.diff`/`.kdiff`.
 */
export function runSolver(
  cr: number,
  blocks: BlockStructure,
  kblocks: BlockStructure | null,
  xtype: boolean,
  grid: Int8Array,
  kgrid: ArrayLike<number> | null,
  dlev: Difficulty,
): void {
  const usage = new SolverUsage(cr, blocks, kblocks, xtype, grid, kgrid);
  usage.run(blocks, kblocks, xtype, kgrid, dlev);
}

/**
 * Convenience wrapper over a `SoloState`: clone the working grid, solve it
 * under the given difficulty caps, and return the verdict + (mutated) grid.
 * `diff` is `DIFF_*` (a real difficulty), `DIFF_AMBIGUOUS`, or `DIFF_IMPOSSIBLE`.
 */
export function solveSolo(
  s: SoloState,
  maxdiff = DIFF_RECURSIVE,
  maxkdiff = DIFF_KINTERSECT,
): { diff: number; kdiff: number; grid: Int8Array } {
  const grid = s.grid.slice();
  const dlev: Difficulty = { maxdiff, maxkdiff, diff: DIFF_IMPOSSIBLE, kdiff: DIFF_KSINGLE };
  runSolver(
    s.cr,
    s.blocks,
    s.killerData ? s.killerData.kblocks : null,
    s.xtype,
    grid,
    s.killerData ? s.killerData.kgrid : null,
    dlev,
  );
  return { diff: dlev.diff, kdiff: dlev.kdiff, grid };
}

/**
 * Run the recording solver on a sound candidate cube seeded from `s.grid` (the
 * placed entries only — never the player's notes), capped **below** recursion,
 * and return every candidate elimination and cell placement it makes, in solver
 * order, each tagged with the rule + premise that forced it. This is the raw
 * deduction script a hint narrates; the recorder-off path (`solveSolo`) is
 * byte-for-byte unchanged (the existing C differential is the guard). `s.grid`
 * is treated read-only (a working copy is solved internally).
 */
export function recordSoloDeductions(
  s: SoloState,
  maxdiff: number = DIFF_EXTREME,
  maxkdiff: number = DIFF_KINTERSECT,
): HintOp[] {
  const ops: HintOp[] = [];
  const grid = s.grid.slice();
  const kblocks = s.killerData ? s.killerData.kblocks : null;
  const kgrid = s.killerData ? s.killerData.kgrid : null;
  const dlev: Difficulty = {
    maxdiff: Math.min(maxdiff, DIFF_EXTREME),
    maxkdiff,
    diff: DIFF_IMPOSSIBLE,
    kdiff: DIFF_KSINGLE,
  };
  const usage = new SolverUsage(s.cr, s.blocks, kblocks, s.xtype, grid, kgrid);
  usage.pendingRecorder = (rec) => ops.push(rec as HintOp);
  usage.run(s.blocks, kblocks, s.xtype, kgrid, dlev);
  return ops;
}
