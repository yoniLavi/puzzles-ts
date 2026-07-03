/**
 * Generic Latin-square solver and generator — the idiomatic-TS port of
 * upstream `latin.c` (the solver half) plus the RNG-faithful generator
 * promoted from the Singles port.
 *
 * Shared by every Latin-square game: Towers first; Solo, Unequal, Keen and
 * Group later. A game supplies its own `usersolvers` (extra deductions keyed
 * to its difficulty levels) and a `valid` callback (does a completed grid
 * satisfy the game's extra constraints?), and `latinSolver` interleaves them
 * with the generic deductions — positional/numeric elimination, set
 * elimination, forcing chains — and, at the hardest level, guess-and-verify
 * recursion (which also doubles as the uniqueness check the generators rely
 * on).
 *
 * Faithful to the C: the `o³` candidate cube is indexed by upstream
 * `cubepos(x,y,n) = (x·o + y)·o + (n−1)`, `place`/`elim`/`set`/`forcing` are
 * the same deductions, and the negative-result sentinels keep upstream's
 * numeric values so a game's `ret <= diff` / `ret != diff` comparisons port
 * verbatim. Scratch buffers are owned by the solver instance (GC, no
 * new_scratch/free_scratch); recursion allocates a sub-solver per guess.
 */

import { type RandomState, randomUpto } from "../random/index.ts";
import { shuffle } from "./shuffle.ts";
import {
  type DeductionRung,
  runDeductionFixpoint,
} from "./deduction-fixpoint.ts";
import { type StepBudget, stepBudget } from "./step-budget.ts";

/** Upstream `enum { diff_impossible = 10, diff_ambiguous, diff_unfinished }`
 * — positive sentinels larger than any real difficulty level, so a
 * generator's `ret <= diff` correctly treats them as "harder than allowed". */
export const DIFF_IMPOSSIBLE = 10;
export const DIFF_AMBIGUOUS = 11;
export const DIFF_UNFINISHED = 12;

/** A game-specific deduction. Returns +1 (made progress), 0 (no progress),
 * or −1 (reached a contradiction). */
export type UserSolver<Ctx> = (solver: LatinSolver, ctx: Ctx) => number;
/** Validate a *completed* grid against the game's extra constraints. */
export type Validator<Ctx> = (solver: LatinSolver, ctx: Ctx) => boolean;

/** Why a *generic* Latin deduction forced a candidate change — the premise a
 * hint narrates. A game's user-solvers attach their own (game-specific) reason
 * objects via `solver.recorder`; the discriminating `kind` fields never collide
 * with these. Used on the hint path only. */
export type LatinReason =
  /** A cell's last remaining candidate, so it must take that height. */
  | { kind: "single" }
  /** Height `n` was just placed at `(px, py)`, which rules it out of the rest
   * of that row and column. */
  | { kind: "dup"; n: number; px: number; py: number }
  /** A naked-subset ("set") elimination. */
  | { kind: "set" }
  /** A forcing-chain elimination. */
  | { kind: "forcing" };

/** One recorded deduction operation. Emitted in solver order on the hint path;
 * `group` ties together every record of a single deduction *firing* (one
 * top-level deduction attempt), so a firing forcing several strikes becomes one
 * grouped hint step. `reason` is a {@link LatinReason} or a game-specific reason. */
export interface DeductionRecord {
  kind: "place" | "elim";
  x: number;
  y: number;
  n: number;
  reason: unknown;
  group: number;
}
export type DeductionRecorder = (rec: DeductionRecord) => void;

export class LatinSolver {
  readonly o: number;
  /** `o³` possibility bitmap; `cube[cubepos(x,y,n)]` truthy ⇒ digit `n` is
   * still possible at `(x, y)`. */
  readonly cube: Uint8Array;
  /** `o²` result grid (0 = blank); written back to the caller's array. */
  grid: Uint8Array;
  /** `o²`; `row[y·o + n−1]` set once digit `n` is placed in row `y`. */
  readonly row: Uint8Array;
  /** `o²`; `col[x·o + n−1]` set once digit `n` is placed in column `x`. */
  readonly col: Uint8Array;

  // Scratch buffers for set elimination / forcing chains (instance-owned).
  private readonly sGrid: Uint8Array;
  private readonly sRowidx: Uint8Array;
  private readonly sColidx: Uint8Array;
  private readonly sSet: Uint8Array;
  private readonly sNeighbours: Int32Array;
  private readonly sBfsqueue: Int32Array;

  /** Hint-only deduction recorder; left unset on the generator/solve path so
   * those run with no recording overhead and byte-for-byte unchanged. */
  recorder?: DeductionRecorder;
  /** Hint-only fixpoint budget (set alongside `recorder`). */
  budget?: StepBudget;
  /** Current firing id — bumped once per top-level deduction attempt so every
   * record of one firing shares a `group`. */
  group = 0;

  constructor(o: number) {
    this.o = o;
    this.cube = new Uint8Array(o * o * o);
    this.grid = new Uint8Array(o * o);
    this.row = new Uint8Array(o * o);
    this.col = new Uint8Array(o * o);
    this.sGrid = new Uint8Array(o * o);
    this.sRowidx = new Uint8Array(o);
    this.sColidx = new Uint8Array(o);
    this.sSet = new Uint8Array(o);
    this.sNeighbours = new Int32Array(3 * o);
    this.sBfsqueue = new Int32Array(o * o);
  }

  cubepos(x: number, y: number, n: number): number {
    return (x * this.o + y) * this.o + n - 1;
  }
  cubeGet(x: number, y: number, n: number): boolean {
    return this.cube[this.cubepos(x, y, n)] !== 0;
  }

  /** Reset the cube/row/col and seed from `grid` (written back in place).
   * Returns false if a given digit is already ruled out (inconsistent). */
  alloc(grid: Uint8Array): boolean {
    const o = this.o;
    this.grid = grid;
    this.cube.fill(1);
    this.row.fill(0);
    this.col.fill(0);
    for (let x = 0; x < o; x++) {
      for (let y = 0; y < o; y++) {
        const n = grid[y * o + x];
        if (n) {
          if (this.cubeGet(x, y, n)) this.place(x, y, n);
          else return false;
        }
      }
    }
    return true;
  }

  /** Commit digit `n` at `(x, y)`: rule out other digits here, this digit
   * elsewhere in the row/column, and record the placement. `reason` (hint path
   * only) explains *why* the cell was placed; the row/column eliminations it
   * implies are recorded as `dup` strikes so a hint can teach them too. */
  place(x: number, y: number, n: number, reason?: unknown): void {
    const o = this.o;
    const rec = this.recorder;
    if (rec && reason !== undefined) {
      rec({ kind: "place", x, y, n, reason, group: this.group });
    }
    for (let i = 1; i <= o; i++) if (i !== n) this.cube[this.cubepos(x, y, i)] = 0;
    for (let i = 0; i < o; i++) {
      if (i === y) continue;
      const pos = this.cubepos(x, i, n);
      if (rec && this.cube[pos]) {
        rec({ kind: "elim", x, y: i, n, reason: { kind: "dup", n, px: x, py: y }, group: this.group });
      }
      this.cube[pos] = 0;
    }
    for (let i = 0; i < o; i++) {
      if (i === x) continue;
      const pos = this.cubepos(i, y, n);
      if (rec && this.cube[pos]) {
        rec({ kind: "elim", x: i, y, n, reason: { kind: "dup", n, px: x, py: y }, group: this.group });
      }
      this.cube[pos] = 0;
    }
    this.grid[y * o + x] = n;
    this.row[y * o + n - 1] = 1;
    this.col[x * o + n - 1] = 1;
  }

  /** Positional/numeric elimination over the cube slice `start, start+step,
   * …` (o entries): if exactly one possibility remains, place it; if none,
   * report a contradiction. */
  elim(start: number, step: number): number {
    const o = this.o;
    let m = 0;
    let fpos = -1;
    for (let i = 0; i < o; i++) {
      if (this.cube[start + i * step]) {
        fpos = start + i * step;
        m++;
      }
    }
    if (m === 1) {
      const n = 1 + (fpos % o);
      let y = (fpos / o) | 0;
      const x = (y / o) | 0;
      y %= o;
      if (!this.grid[y * o + x]) {
        this.place(x, y, n, this.recorder ? { kind: "single" } : undefined);
        return 1;
      }
    } else if (m === 0) {
      return -1;
    }
    return 0;
  }

  /** Set elimination over the `o × o` boolean sub-matrix of the cube indexed
   * by `start + i·step1 + j·step2`. Finds a rectangle of zeroes whose width +
   * height equals the live dimension and rules out the implied possibilities.
   * (Upstream `latin_solver_set`.) */
  set(start: number, step1: number, step2: number): number {
    const o = this.o;
    const cube = this.cube;
    const grid = this.sGrid;
    const rowidx = this.sRowidx;
    const colidx = this.sColidx;
    const set = this.sSet;

    // Winnow: drop any row with a solitary 1 and the column holding it.
    rowidx.fill(1, 0, o);
    colidx.fill(1, 0, o);
    for (let i = 0; i < o; i++) {
      let count = 0;
      let first = -1;
      for (let j = 0; j < o; j++) {
        if (cube[start + i * step1 + j * step2]) {
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

    // Compact rowidx/colidx from 0/1 flags to lists of live indices.
    let n = 0;
    for (let i = 0; i < o; i++) if (rowidx[i]) rowidx[n++] = i;
    let nc = 0;
    for (let i = 0; i < o; i++) if (colidx[i]) colidx[nc++] = i;

    // Build the smaller matrix (every row now has ≥ 2 ones).
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        grid[i * o + j] = cube[start + rowidx[i] * step1 + colidx[j] * step2];
      }
    }

    // Search for a zero-rectangle of total dimension n.
    set.fill(0, 0, n);
    let count = 0;
    while (true) {
      if (count > 1 && count < n - 1) {
        let rows = 0;
        for (let i = 0; i < n; i++) {
          let ok = true;
          for (let j = 0; j < n; j++) {
            if (set[j] && grid[i * o + j]) {
              ok = false;
              break;
            }
          }
          if (ok) rows++;
        }

        // More than n−count suitable rows ⇒ a prior faulty deduction.
        if (rows > n - count) return -1;

        if (rows >= n - count) {
          let progress = false;
          for (let i = 0; i < n; i++) {
            let ok = true;
            for (let j = 0; j < n; j++) {
              if (set[j] && grid[i * o + j]) {
                ok = false;
                break;
              }
            }
            if (!ok) {
              for (let j = 0; j < n; j++) {
                if (!set[j] && grid[i * o + j]) {
                  const fpos = start + rowidx[i] * step1 + colidx[j] * step2;
                  if (this.recorder) {
                    const en = 1 + (fpos % o);
                    const rest = (fpos / o) | 0;
                    this.recorder({
                      kind: "elim",
                      x: (rest / o) | 0,
                      y: rest % o,
                      n: en,
                      reason: { kind: "set" },
                      group: this.group,
                    });
                  }
                  progress = true;
                  cube[fpos] = 0;
                }
              }
            }
          }
          if (progress) return 1;
        }
      }

      // Binary increment of `set` (rightmost 0 → 1, trailing 1s → 0).
      let i = n;
      while (i > 0 && set[i - 1]) {
        set[--i] = 0;
        count--;
      }
      if (i > 0) {
        set[--i] = 1;
        count++;
      } else {
        break;
      }
    }
    return 0;
  }

  /** Forcing chains (upstream `latin_solver_forcing`): a chain of two-candidate
   * cells whose ends both line up with a third cell forces a digit out of it. */
  forcing(): number {
    const o = this.o;
    const number = this.sGrid; // reused as the BFS "other candidate" map
    const neighbours = this.sNeighbours;
    const bfsqueue = this.sBfsqueue;

    for (let y = 0; y < o; y++) {
      for (let x = 0; x < o; x++) {
        let count = 0;
        let t = 0;
        for (let n = 1; n <= o; n++) {
          if (this.cubeGet(x, y, n)) {
            count++;
            t += n;
          }
        }
        if (count !== 2) continue;

        for (let n = 1; n <= o; n++) {
          if (!this.cubeGet(x, y, n)) continue;
          const orign = n;
          number.fill(o + 1, 0, o * o);
          let head = 0;
          let tail = 0;
          bfsqueue[tail++] = y * o + x;
          number[y * o + x] = t - n;

          while (head < tail) {
            let xx = bfsqueue[head++];
            const yy = (xx / o) | 0;
            xx %= o;
            const currn = number[yy * o + xx];

            let nn = 0;
            for (let yt = 0; yt < o; yt++) neighbours[nn++] = yt * o + xx;
            for (let xt = 0; xt < o; xt++) neighbours[nn++] = yy * o + xt;

            for (let i = 0; i < nn; i++) {
              const xt = neighbours[i] % o;
              const yt = (neighbours[i] / o) | 0;
              if (number[yt * o + xt] <= o) continue;
              if (!this.cubeGet(xt, yt, currn)) continue;
              if (xt === xx && yt === yy) continue;

              let cc = 0;
              let tt = 0;
              for (let m = 1; m <= o; m++) {
                if (this.cubeGet(xt, yt, m)) {
                  cc++;
                  tt += m;
                }
              }
              if (cc === 2) {
                bfsqueue[tail++] = yt * o + xt;
                number[yt * o + xt] = tt - currn;
              }

              if (currn === orign && (xt === x || yt === y)) {
                if (this.recorder) {
                  this.recorder({
                    kind: "elim",
                    x: xt,
                    y: yt,
                    n: orign,
                    reason: { kind: "forcing" },
                    group: this.group,
                  });
                }
                this.cube[this.cubepos(xt, yt, orign)] = 0;
                return 1;
              }
            }
          }
        }
      }
    }
    return 0;
  }

  /** Looped positional + numeric elimination (the "simple" difficulty). */
  diffSimple(): number {
    const o = this.o;
    for (let y = 0; y < o; y++) {
      for (let n = 1; n <= o; n++) {
        if (!this.row[y * o + n - 1]) {
          const ret = this.elim(this.cubepos(0, y, n), o * o);
          if (ret !== 0) return ret;
        }
      }
    }
    for (let x = 0; x < o; x++) {
      for (let n = 1; n <= o; n++) {
        if (!this.col[x * o + n - 1]) {
          const ret = this.elim(this.cubepos(x, 0, n), o);
          if (ret !== 0) return ret;
        }
      }
    }
    for (let x = 0; x < o; x++) {
      for (let y = 0; y < o; y++) {
        if (!this.grid[y * o + x]) {
          const ret = this.elim(this.cubepos(x, y, 1), 1);
          if (ret !== 0) return ret;
        }
      }
    }
    return 0;
  }

  /** Looped set elimination; `extreme` enables the harder single-number
   * (row-vs-column) variant. */
  diffSet(extreme: boolean): number {
    const o = this.o;
    if (!extreme) {
      for (let y = 0; y < o; y++) {
        const ret = this.set(this.cubepos(0, y, 1), o * o, 1);
        if (ret !== 0) return ret;
      }
      for (let x = 0; x < o; x++) {
        const ret = this.set(this.cubepos(x, 0, 1), o, 1);
        if (ret !== 0) return ret;
      }
    } else {
      for (let n = 1; n <= o; n++) {
        const ret = this.set(this.cubepos(0, 0, n), o * o, o);
        if (ret !== 0) return ret;
      }
    }
    return 0;
  }
}

/** Optional per-recursion context cloning (upstream `ctxnew`/`ctxfree`). Most
 * games (Towers) share one immutable ctx and omit it. */
export interface LatinSolverConfig<Ctx> {
  maxdiff: number;
  diffSimple: number;
  diffSet0: number;
  diffSet1: number;
  diffForcing: number;
  diffRecursive: number;
  usersolvers: (UserSolver<Ctx> | null)[];
  valid: Validator<Ctx> | null;
  ctx: Ctx;
  ctxNew?: (ctx: Ctx) => Ctx;
  /** Hint path only: record every candidate cleared / cell placed, in solver
   * order. When set, a fixpoint step budget is also installed. Leaving it unset
   * (generator/solve path) keeps that path byte-for-byte unchanged. */
  recorder?: DeductionRecorder;
  /** Optional `o³` output buffer that receives the final candidate cube
   * (upstream copies `solver.cube` into `state->hints` after solving). Unequal's
   * greedy clue-assembly generator reads the remaining-possibility counts off
   * it; most games omit it. Filled at every non-recursive exit. */
  cubeOut?: Uint8Array;
}

function latinSolverTop<Ctx>(solver: LatinSolver, cfg: LatinSolverConfig<Ctx>): number {
  const {
    maxdiff,
    diffSimple,
    diffSet0,
    diffSet1,
    diffForcing,
    diffRecursive,
    usersolvers,
    ctx,
  } = cfg;
  // The ordered rung `i` (0..maxdiff): the game's own `usersolvers[i]` first,
  // then whichever built-in technique that difficulty level maps to. Returns
  // `-1` (contradiction) / `0` (nothing) / `>0` (fired), the runner's contract.
  const applyRung = (i: number): number => {
    let ret = 0;
    if (usersolvers[i]) ret = (usersolvers[i] as UserSolver<Ctx>)(solver, ctx);
    if (ret === 0 && i === diffSimple) ret = solver.diffSimple();
    if (ret === 0 && i === diffSet0) ret = solver.diffSet(false);
    if (ret === 0 && i === diffSet1) ret = solver.diffSet(true);
    if (ret === 0 && i === diffForcing) ret = solver.forcing();
    return ret;
  };
  const rungs: DeductionRung[] = [];
  for (let i = 0; i <= maxdiff; i++) rungs.push(() => applyRung(i));

  const fp = runDeductionFixpoint({
    rungs,
    maxRung: maxdiff,
    baseGrade: diffSimple,
    budget: solver.budget,
    beforeRung: () => solver.group++,
  });
  if (fp.impossible) return finish(solver, cfg, DIFF_IMPOSSIBLE);
  let diff = fp.grade;

  if (maxdiff === diffRecursive) {
    const nsol = latinSolverRecurse(solver, cfg);
    if (nsol < 0) diff = DIFF_IMPOSSIBLE;
    else if (nsol === 1) diff = diffRecursive;
    else if (nsol > 1) diff = DIFF_AMBIGUOUS;
    // nsol === 0 ⇒ already complete; leave diff unchanged.
  } else {
    const o = solver.o;
    for (let y = 0; y < o; y++) {
      for (let x = 0; x < o; x++) {
        if (!solver.grid[y * o + x]) diff = DIFF_UNFINISHED;
      }
    }
  }

  return finish(solver, cfg, diff);
}

function finish<Ctx>(
  solver: LatinSolver,
  cfg: LatinSolverConfig<Ctx>,
  diff: number,
): number {
  if (
    diff !== DIFF_IMPOSSIBLE &&
    diff !== DIFF_UNFINISHED &&
    diff !== DIFF_AMBIGUOUS &&
    cfg.valid &&
    !cfg.valid(solver, cfg.ctx)
  ) {
    return DIFF_IMPOSSIBLE;
  }
  return diff;
}

function latinSolverRecurse<Ctx>(
  solver: LatinSolver,
  cfg: LatinSolverConfig<Ctx>,
): number {
  const o = solver.o;
  let best = -1;
  let bestcount = o + 1;
  for (let y = 0; y < o; y++) {
    for (let x = 0; x < o; x++) {
      if (!solver.grid[y * o + x]) {
        let count = 0;
        for (let n = 1; n <= o; n++) if (solver.cubeGet(x, y, n)) count++;
        if (count < bestcount) {
          bestcount = count;
          best = y * o + x;
        }
      }
    }
  }

  if (best === -1) return 0; // already complete

  const y = (best / o) | 0;
  const x = best % o;
  const list: number[] = [];
  for (let n = 1; n <= o; n++) if (solver.cubeGet(x, y, n)) list.push(n);

  const ingrid = solver.grid.slice();
  let diff = DIFF_IMPOSSIBLE; // no solution found yet

  for (const guess of list) {
    const outgrid = ingrid.slice();
    outgrid[y * o + x] = guess;

    const newctx = cfg.ctxNew ? cfg.ctxNew(cfg.ctx) : cfg.ctx;
    const sub = new LatinSolver(o);
    let ret: number;
    if (sub.alloc(outgrid)) {
      ret = latinSolverTop(sub, {
        ...cfg,
        maxdiff: cfg.diffRecursive,
        ctx: newctx,
      });
    } else {
      ret = DIFF_IMPOSSIBLE;
    }

    if (diff === DIFF_IMPOSSIBLE && ret !== DIFF_IMPOSSIBLE) {
      solver.grid.set(outgrid);
    }

    if (ret === DIFF_AMBIGUOUS) {
      diff = DIFF_AMBIGUOUS;
    } else if (ret === DIFF_IMPOSSIBLE) {
      // leave diff unchanged
    } else {
      diff = diff === DIFF_IMPOSSIBLE ? cfg.diffRecursive : DIFF_AMBIGUOUS;
    }

    if (diff === DIFF_AMBIGUOUS) break;
  }

  if (diff === DIFF_IMPOSSIBLE) return -1;
  if (diff === DIFF_AMBIGUOUS) return 2;
  return 1;
}

/**
 * Solve an `o × o` Latin-square puzzle in place. `grid` is the working grid
 * (0 = blank) seeded with the game's fixed cells; it is written back with the
 * first solution found. Returns the difficulty level reached, or one of
 * `DIFF_IMPOSSIBLE` / `DIFF_AMBIGUOUS` / `DIFF_UNFINISHED`.
 */
export function latinSolver<Ctx>(
  grid: Uint8Array,
  o: number,
  cfg: LatinSolverConfig<Ctx>,
): number {
  const solver = new LatinSolver(o);
  if (!solver.alloc(grid)) {
    if (cfg.cubeOut) cfg.cubeOut.set(solver.cube);
    return DIFF_IMPOSSIBLE;
  }
  // Enable recording only *after* alloc, so seeding the cube from the givens
  // (a flurry of `place`s) is not mistaken for deductions the hint should teach.
  if (cfg.recorder) {
    solver.recorder = cfg.recorder;
    solver.budget = stepBudget("towers hint");
  }
  const ret = latinSolverTop(solver, cfg);
  // Expose the final candidate cube (upstream's `memcpy(state->hints, ...)`),
  // for a generator that grades clues by remaining possibilities (Unequal).
  if (cfg.cubeOut) cfg.cubeOut.set(solver.cube);
  return ret;
}

// --- generator (matching.c / latin.c, RNG-faithful) ------------------------
// Promoted from singles/generator.ts on Towers becoming the second consumer.

/**
 * Maximum bipartite matching (Hopcroft–Karp) between `nl` left and `nr`
 * right vertices. `adjlists[L]` lists L's neighbours (mutated in place by the
 * randomising DFS, exactly as upstream). Returns the L→R assignment array
 * (`-1` = unmatched), the analogue of upstream's `outl`. The two RNG draws —
 * `shuffle(Lorder)` per BFS pass and the in-place `random_upto` adjacency
 * swap during the DFS — are reproduced exactly so generation is byte-faithful.
 */
export function matching(
  nl: number,
  nr: number,
  adjlists: number[][],
  adjsizes: number[],
  rs: RandomState,
): Int32Array {
  const LtoR = new Int32Array(nl).fill(-1);
  const RtoL = new Int32Array(nr).fill(-1);
  const Llayer = new Int32Array(nl);
  const Rlayer = new Int32Array(nr);
  const Lqueue = new Int32Array(nl);
  const Rqueue = new Int32Array(nr);
  const nmin = Math.min(nl, nr);
  const augpath = new Int32Array(2 * nmin);
  const dfsstate = new Int32Array(nmin + 1);
  const Lorder = new Int32Array(nl);

  outer: while (true) {
    Llayer.fill(-1);
    Rlayer.fill(-1);

    let Lqs = 0;
    for (let L = 0; L < nl; L++) {
      if (LtoR[L] === -1) {
        Llayer[L] = 0;
        Lqueue[Lqs++] = L;
      }
    }

    let layer = 0;
    let targetLayer = -1;
    while (true) {
      let foundFreeR = false;
      let Rqs = 0;
      for (let q = 0; q < Lqs; q++) {
        const L = Lqueue[q];
        for (let j = 0; j < adjsizes[L]; j++) {
          const R = adjlists[L][j];
          if (R !== LtoR[L] && Rlayer[R] === -1) {
            Rlayer[R] = layer + 1;
            Rqueue[Rqs++] = R;
            if (RtoL[R] === -1) foundFreeR = true;
          }
        }
      }
      layer++;

      if (foundFreeR) {
        targetLayer = layer;
        break;
      }
      if (Rqs === 0) break outer;

      Lqs = 0;
      for (let q = 0; q < Rqs; q++) {
        const R = Rqueue[q];
        const L = RtoL[R];
        if (L !== -1 && Llayer[L] === -1) {
          Llayer[L] = layer + 1;
          Lqueue[Lqs++] = L;
        }
      }
      layer++;

      if (Lqs === 0) break outer;
    }

    for (let R = 0; R < nr; R++) {
      if (Rlayer[R] === targetLayer && RtoL[R] !== -1) Rlayer[R] = -1;
    }

    for (let L = 0; L < nl; L++) Lorder[L] = L;
    shuffle(Lorder as unknown as number[], rs);

    dfsstate[0] = 0;
    let i = 0;
    while (true) {
      let L: number;
      if (i === 0) {
        if (dfsstate[0] === nl) break;
        L = Lorder[dfsstate[0]++];
        if (Llayer[L] !== 0) continue;
      } else {
        L = augpath[2 * i - 2];
        const j = dfsstate[i]++;
        if (j === adjsizes[L]) {
          i--;
          continue;
        }
        if (adjsizes[L] - j > 1) {
          const which = j + randomUpto(rs, adjsizes[L] - j);
          const tmp = adjlists[L][which];
          adjlists[L][which] = adjlists[L][j];
          adjlists[L][j] = tmp;
        }
        const R = adjlists[L][j];

        if (Rlayer[R] !== 2 * i - 1) continue;

        augpath[2 * i - 1] = R;
        Rlayer[R] = -1;

        if (2 * i - 1 === targetLayer) {
          for (let k = 0; k < 2 * i; k += 2) {
            LtoR[augpath[k]] = augpath[k + 1];
            RtoL[augpath[k + 1]] = augpath[k];
          }
          i = 0;
          continue;
        }

        L = RtoL[R];
        if (Llayer[L] !== 2 * i) continue;
      }

      augpath[2 * i] = L;
      Llayer[L] = -1;
      i++;
      dfsstate[i] = 0;
    }
  }

  return LtoR;
}

/** Generate an `o × o` Latin square (values 1..o), row by row via matching,
 * faithful to `latin_generate`. */
export function latinGenerate(o: number, rs: RandomState): Int32Array {
  const sq = new Int32Array(o * o);

  const row: number[] = [];
  for (let i = 0; i < o; i++) row[i] = i;
  shuffle(row, rs);

  const adjlists: number[][] = [];
  const adjsizes: number[] = [];
  for (let j = 0; j < o; j++) adjlists[j] = [];

  for (let i = 0; i < o; i++) {
    for (let j = 0; j < o; j++) {
      const present = new Int8Array(o);
      for (let k = 0; k < i; k++) present[sq[row[k] * o + j] - 1] = 1;
      const adj = adjlists[j];
      adj.length = 0;
      for (let k = 0; k < o; k++) if (!present[k]) adj.push(k);
      adjsizes[j] = adj.length;
    }

    const m = matching(o, o, adjlists, adjsizes, rs);
    for (let j = 0; j < o; j++) sq[row[i] * o + j] = m[j] + 1;
  }

  return sq;
}

/** Crop an `o × o` Latin square to `w × h` (`o = max(w,h)`). */
export function latinGenerateRect(w: number, h: number, rs: RandomState): Int32Array {
  const o = Math.max(w, h);
  const latin = latinGenerate(o, rs);
  const rect = new Int32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) rect[y * w + x] = latin[y * o + x];
  }
  return rect;
}
