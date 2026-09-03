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
 *
 * ## A symbol that may repeat (this fork's extension)
 *
 * A *pseudo*-Latin puzzle — Salad, where `order − nums` squares per line are
 * empty — has one symbol that appears a stated number of times per line
 * rather than once. Upstream fakes it with a full square whose surplus symbols
 * are reinterpreted as holes, which works but leaves the solver reasoning about
 * *which* interchangeable hole symbol sits where, a question the puzzle never
 * asks; the natural deductions about "the empty square" cannot be written
 * against that encoding. So the cube can be told, via {@link LatinRepeats},
 * that its **last** symbol appears `times` times per line: the cube then has
 * `symbols = o − times + 1` distinct values, `cubepos` strides by `symbols`,
 * positional elimination places the repeated symbol when exactly `times`
 * candidate cells remain, placing it strikes the rest of the line only once the
 * line's count is full, set elimination generalizes to multiplicities
 * ({@link LatinSolver.setGeneral}), and forcing chains never link through it
 * (a link relies on the value appearing once). **Every one of those paths
 * reduces to the C's when no repeat is declared** — `symbols = o`, every
 * multiplicity 1 — and the Latin family's byte-match differentials are the
 * proof that it does.
 */

import { type DeductionTechnique, runDeductionFixpoint } from "./deduction-fixpoint.ts";
import type { DeductionRecorder } from "./deduction-record.ts";
import type { DifficultyVerdict } from "./difficulty.ts";
import { type RandomState, randomUpto } from "./random/index.ts";
import { shuffle } from "./shuffle.ts";
import { type StepBudget, stepBudget } from "./step-budget.ts";

/** Upstream `enum { diff_impossible = 10, diff_ambiguous, diff_unfinished }`
 * — positive sentinels larger than any real difficulty level, so a
 * generator's `ret <= diff` correctly treats them as "harder than allowed". */
export const DIFF_IMPOSSIBLE = 10;
export const DIFF_AMBIGUOUS = 11;
export const DIFF_UNFINISHED = 12;

/**
 * Read a latin-family solver's return as a {@link DifficultyVerdict}.
 *
 * Every solver built on this module returns *the difficulty level it reached*,
 * or one of the three sentinels above — so a plain level, whatever its value,
 * means the board was solved within the cap it was given (the cap is what
 * stopped the ladder, so a level above it is unreachable, not reported). Lives
 * here rather than in each game's difficulty contract because it is a fact
 * about *this* return convention: `solveGroup`, `solveKeen`, `solveTowers` and
 * `solveUnequal` each document it in the same words, and four copies of one
 * mapping is four places for a sentinel to be forgotten.
 */
export function latinVerdict(ret: number): DifficultyVerdict {
  if (ret === DIFF_IMPOSSIBLE) return "impossible";
  if (ret === DIFF_AMBIGUOUS || ret === DIFF_UNFINISHED) return "unsolved";
  return "solved";
}

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
  /** A forcing-chain elimination, with the chain it actually followed. */
  | { kind: "forcing"; chain: ForcingLink[]; shares: "row" | "col" };

/**
 * The one reason only a solver with {@link LatinRepeats} ever records: the
 * repeated symbol `n` has been placed all `times` times in this line, so it is
 * ruled out of the rest of the line — the multiplicity analog of `dup`, which
 * names one placement where here it is the count that forces. Kept apart from
 * {@link LatinReason} so the Latin-square games, whose narrations switch over
 * that union exhaustively, are not asked to narrate a case they cannot meet; a
 * repeats consumer adds it to its own reason union.
 */
export interface LatinRepeatReason {
  kind: "repeatFull";
  n: number;
  line: "row" | "col";
  index: number;
  times: number;
}

/**
 * One symbol that may appear more than once per line — what a pseudo-Latin
 * puzzle needs (Salad's empty square). The repeated symbol is always the
 * **last** one, `symbols = o − times + 1`, so a consumer's real symbols keep
 * their `1..k` numbering and the repeat sits one past them.
 */
export interface LatinRepeats {
  /** How many times the last symbol appears in each row and each column. */
  times: number;
}

/** One cell of a forcing chain, and the value the chain gives it.
 *
 * `chain[0]` is the **origin**: a two-candidate cell, carrying the candidate it
 * takes when it is *not* the one being eliminated. Every later link is a
 * two-candidate cell in line with its predecessor that therefore loses the
 * predecessor's value and must take its other one; the last link's `n` is the
 * eliminated value itself, which is what closes the argument.
 *
 * There is always at least one hop: the origin's `n` is its *other* candidate,
 * so it can never already be the eliminated value. */
export interface ForcingLink {
  x: number;
  y: number;
  n: number;
}

/** The recorded-deduction shape lives in its own module (nothing about it is
 * Latin — see [`deduction-record.ts`](./deduction-record.ts)); re-exported here
 * so the Latin games keep importing it from the solver they already import. */
export type {
  DeductionRecord,
  DeductionRecorder,
} from "./deduction-record.ts";

export class LatinSolver {
  readonly o: number;
  /** Distinct symbols: `o` for a Latin square, `o − times + 1` with a repeat. */
  readonly symbols: number;
  /** The repeated symbol (always `symbols`), or `0` when there is none. */
  readonly repeat: number;
  /** How many times {@link repeat} appears per line (`1` when there is none). */
  readonly times: number;
  /** `o²·symbols` possibility bitmap; `cube[cubepos(x,y,n)]` truthy ⇒ symbol
   * `n` is still possible at `(x, y)`. */
  readonly cube: Uint8Array;
  /** `o²` result grid (0 = blank); written back to the caller's array. */
  grid: Uint8Array;
  /** `o·symbols`; `row[y·symbols + n−1]` counts placements of `n` in row `y`
   * (0 or 1 for an ordinary symbol; up to `times` for the repeated one). */
  readonly row: Uint8Array;
  /** `o·symbols`; the column counterpart of {@link row}. */
  readonly col: Uint8Array;

  // Scratch buffers for set elimination / forcing chains (instance-owned).
  private readonly sGrid: Uint8Array;
  private readonly sRowidx: Uint8Array;
  private readonly sColidx: Uint8Array;
  private readonly sSet: Uint8Array;
  private readonly sNeighbors: Int32Array;
  private readonly sBfsqueue: Int32Array;
  /** BFS parent pointers for {@link forcing}, so a firing can report the chain
   * it followed rather than only its conclusion. Written on the hint path only
   * (guarded by `recorder`), and never *read* for a cell this BFS did not push
   * — so it needs no clearing between runs. */
  private readonly sParent: Int32Array;

  /** Hint-only deduction recorder; left unset on the generator/solve path so
   * those run with no recording overhead and byte-for-byte unchanged. */
  recorder?: DeductionRecorder;
  /** Hint-only fixpoint budget (set alongside `recorder`). */
  budget?: StepBudget;
  /** Current firing id — bumped once per top-level deduction attempt so every
   * record of one firing shares a `group`. */
  group = 0;

  constructor(o: number, repeats?: LatinRepeats) {
    this.o = o;
    if (repeats) {
      if (!(repeats.times >= 2 && repeats.times <= o)) {
        throw new Error(
          `latin: a repeated symbol must appear 2..${o} times, not ${repeats.times}`,
        );
      }
      this.times = repeats.times;
      this.symbols = o - repeats.times + 1;
      this.repeat = this.symbols;
    } else {
      this.times = 1;
      this.symbols = o;
      this.repeat = 0;
    }
    const s = this.symbols;
    this.cube = new Uint8Array(o * o * s);
    this.grid = new Uint8Array(o * o);
    this.row = new Uint8Array(o * s);
    this.col = new Uint8Array(o * s);
    this.sGrid = new Uint8Array(o * o);
    this.sRowidx = new Uint8Array(o);
    this.sColidx = new Uint8Array(o);
    this.sSet = new Uint8Array(o);
    this.sNeighbors = new Int32Array(3 * o);
    this.sBfsqueue = new Int32Array(o * o);
    this.sParent = new Int32Array(o * o);
  }

  cubepos(x: number, y: number, n: number): number {
    return (x * this.o + y) * this.symbols + n - 1;
  }

  /** How many times symbol `n` appears in each line. */
  multiplicity(n: number): number {
    return n === this.repeat ? this.times : 1;
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
    const s = this.symbols;
    const rec = this.recorder;
    if (rec && reason !== undefined) {
      rec({ kind: "place", x, y, n, reason, group: this.group });
    }
    for (let i = 1; i <= s; i++) if (i !== n) this.cube[this.cubepos(x, y, i)] = 0;
    this.grid[y * o + x] = n;
    const inRow = ++this.row[y * s + n - 1];
    const inCol = ++this.col[x * s + n - 1];

    if (n === this.repeat) {
      // The repeated symbol leaves the rest of its line alone until the line
      // holds all `times` of it; then it is struck from every other cell. An
      // ordinary symbol is the `times = 1` case of the same rule, but keeps the
      // `dup` reason below because its narration names the one placement.
      if (inRow === this.times) this.strikeRepeatFromLine(x, y, n, "row");
      if (inCol === this.times) this.strikeRepeatFromLine(x, y, n, "col");
      return;
    }

    for (let i = 0; i < o; i++) {
      if (i === y) continue;
      const pos = this.cubepos(x, i, n);
      if (rec && this.cube[pos]) {
        rec({
          kind: "elim",
          x,
          y: i,
          n,
          reason: { kind: "dup", n, px: x, py: y },
          group: this.group,
        });
      }
      this.cube[pos] = 0;
    }
    for (let i = 0; i < o; i++) {
      if (i === x) continue;
      const pos = this.cubepos(i, y, n);
      if (rec && this.cube[pos]) {
        rec({
          kind: "elim",
          x: i,
          y,
          n,
          reason: { kind: "dup", n, px: x, py: y },
          group: this.group,
        });
      }
      this.cube[pos] = 0;
    }
  }

  /** The repeated symbol's line is full: strike it from every cell of the line
   * that does not hold it. */
  private strikeRepeatFromLine(
    x: number,
    y: number,
    n: number,
    line: "row" | "col",
  ): void {
    const o = this.o;
    const rec = this.recorder;
    const index = line === "row" ? y : x;
    for (let i = 0; i < o; i++) {
      const cx = line === "row" ? i : x;
      const cy = line === "row" ? y : i;
      if (this.grid[cy * o + cx] === n) continue;
      const pos = this.cubepos(cx, cy, n);
      if (rec && this.cube[pos]) {
        rec({
          kind: "elim",
          x: cx,
          y: cy,
          n,
          reason: { kind: "repeatFull", n, line, index, times: this.times },
          group: this.group,
        });
      }
      this.cube[pos] = 0;
    }
  }

  /** Positional/numeric elimination over the cube slice `start, start+step,
   * …` (o entries): if exactly one possibility remains, place it; if none,
   * report a contradiction. */
  elim(start: number, step: number): number {
    const o = this.o;
    const s = this.symbols;
    // A numeric slice (`step === 1`) runs over a cell's `symbols` candidates; a
    // positional slice runs over a line's `o` cells for one symbol — and for
    // the repeated symbol, "exactly one place left" is "exactly `times` left".
    const positional = step !== 1;
    const len = positional ? o : s;
    const need = positional ? this.multiplicity(1 + (start % s)) : 1;
    let m = 0;
    let fpos = -1;
    for (let i = 0; i < len; i++) {
      if (this.cube[start + i * step]) {
        fpos = start + i * step;
        m++;
      }
    }
    if (m === need) {
      let placed = 0;
      for (let i = 0; i < len; i++) {
        fpos = start + i * step;
        if (!this.cube[fpos]) continue;
        const n = 1 + (fpos % s);
        const rest = (fpos / s) | 0;
        const y = rest % o;
        const x = (rest / o) | 0;
        if (!this.grid[y * o + x]) {
          this.place(x, y, n, this.recorder ? { kind: "single" } : undefined);
          placed++;
        }
      }
      if (placed > 0) return 1;
    } else if (m < need) {
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
   * cells whose ends both line up with a third cell forces a digit out of it.
   *
   * The BFS knows the chain it walked; on the hint path it now **reports** it
   * ({@link ForcingLink}), because a narration that says "a contradiction
   * further along" names no cell the player can look at and can only be checked
   * by redoing the deduction (`walk-tactic-hint-chains`). The path costs one
   * parent-pointer write per pushed cell, inside the `recorder` guard, so the
   * generator and solve paths are untouched. */
  forcing(): number {
    const o = this.o;
    const s = this.symbols;
    const number = this.sGrid; // reused as the BFS "other candidate" map
    const neighbors = this.sNeighbors;
    const bfsqueue = this.sBfsqueue;
    const parent = this.sParent;

    for (let y = 0; y < o; y++) {
      for (let x = 0; x < o; x++) {
        let count = 0;
        let t = 0;
        for (let n = 1; n <= s; n++) {
          if (this.cubeGet(x, y, n)) {
            count++;
            t += n;
          }
        }
        if (count !== 2) continue;

        for (let n = 1; n <= s; n++) {
          if (!this.cubeGet(x, y, n)) continue;
          // Every link of a chain — "this cell takes `currn`, so its neighbor
          // in the line cannot" — relies on `currn` appearing once per line, so
          // the repeated symbol can neither start a chain nor carry one.
          if (n === this.repeat) continue;
          const orign = n;
          number.fill(o + 1, 0, o * o);
          let head = 0;
          let tail = 0;
          bfsqueue[tail++] = y * o + x;
          number[y * o + x] = t - n;
          parent[y * o + x] = -1;

          while (head < tail) {
            let xx = bfsqueue[head++];
            const yy = (xx / o) | 0;
            xx %= o;
            const currn = number[yy * o + xx];
            // A cell whose forced value is the repeated symbol ends the chain
            // there: that value does not exclude itself from the line.
            if (currn === this.repeat) continue;

            let nn = 0;
            for (let yt = 0; yt < o; yt++) neighbors[nn++] = yt * o + xx;
            for (let xt = 0; xt < o; xt++) neighbors[nn++] = yy * o + xt;

            for (let i = 0; i < nn; i++) {
              const xt = neighbors[i] % o;
              const yt = (neighbors[i] / o) | 0;
              if (number[yt * o + xt] <= o) continue;
              if (!this.cubeGet(xt, yt, currn)) continue;
              if (xt === xx && yt === yy) continue;

              let cc = 0;
              let tt = 0;
              for (let m = 1; m <= s; m++) {
                if (this.cubeGet(xt, yt, m)) {
                  cc++;
                  tt += m;
                }
              }
              if (cc === 2) {
                bfsqueue[tail++] = yt * o + xt;
                number[yt * o + xt] = tt - currn;
                parent[yt * o + xt] = yy * o + xx;
              }

              if (currn === orign && (xt === x || yt === y)) {
                if (this.recorder) {
                  // Walk the parents back from the cell the chain drove to
                  // `orign` — not from `(xt, yt)`, which is the *conclusion*
                  // and may not even be on the chain.
                  const path: number[] = [];
                  for (let c = yy * o + xx; c !== -1; c = parent[c]) path.push(c);
                  path.reverse();
                  this.recorder({
                    kind: "elim",
                    x: xt,
                    y: yt,
                    n: orign,
                    reason: {
                      kind: "forcing",
                      chain: path.map((c) => ({
                        x: c % o,
                        y: (c / o) | 0,
                        n: number[c],
                      })),
                      // Which line ties the conclusion to the *origin* — the
                      // other half of the case split. The conclusion's tie to
                      // the chain's far end is structural (it is a BFS
                      // neighbor of it), so only this one needs recording.
                      shares: xt === x ? "col" : "row",
                    },
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
    const s = this.symbols;
    for (let y = 0; y < o; y++) {
      for (let n = 1; n <= s; n++) {
        if (this.row[y * s + n - 1] < this.multiplicity(n)) {
          const ret = this.elim(this.cubepos(0, y, n), o * s);
          if (ret !== 0) return ret;
        }
      }
    }
    for (let x = 0; x < o; x++) {
      for (let n = 1; n <= s; n++) {
        if (this.col[x * s + n - 1] < this.multiplicity(n)) {
          const ret = this.elim(this.cubepos(x, 0, n), s);
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
   * (row-vs-column) variant. With a repeated symbol the multiplicity-aware
   * {@link setGeneral} runs instead of the C's `set`, over the same matrices. */
  diffSet(extreme: boolean): number {
    const o = this.o;
    const s = this.symbols;
    if (this.repeat) return this.diffSetGeneral(extreme);
    if (!extreme) {
      for (let y = 0; y < o; y++) {
        const ret = this.set(this.cubepos(0, y, 1), o * s, 1);
        if (ret !== 0) return ret;
      }
      for (let x = 0; x < o; x++) {
        const ret = this.set(this.cubepos(x, 0, 1), s, 1);
        if (ret !== 0) return ret;
      }
    } else {
      for (let n = 1; n <= s; n++) {
        const ret = this.set(this.cubepos(0, 0, n), o * s, s);
        if (ret !== 0) return ret;
      }
    }
    return 0;
  }

  /** The three set-elimination sweeps of {@link diffSet}, through
   * {@link setGeneral}: per row and per column the cells × symbols matrix (a
   * cell takes one symbol, a symbol fills `multiplicity` cells); per symbol the
   * columns × rows matrix (the symbol appears `multiplicity` times in each). */
  private diffSetGeneral(extreme: boolean): number {
    const o = this.o;
    const s = this.symbols;
    const one = (): number[] => new Array(o).fill(1);
    const bySymbol = (): number[] => {
      const out: number[] = [];
      for (let n = 1; n <= s; n++) out.push(this.multiplicity(n));
      return out;
    };
    if (!extreme) {
      for (let y = 0; y < o; y++) {
        const ret = this.setGeneral(o, s, one(), bySymbol(), (x, k) =>
          this.cubepos(x, y, k + 1),
        );
        if (ret !== 0) return ret;
      }
      for (let x = 0; x < o; x++) {
        const ret = this.setGeneral(o, s, one(), bySymbol(), (y, k) =>
          this.cubepos(x, y, k + 1),
        );
        if (ret !== 0) return ret;
      }
    } else {
      for (let n = 1; n <= s; n++) {
        const m = this.multiplicity(n);
        const ret = this.setGeneral(
          o,
          o,
          new Array(o).fill(m),
          new Array(o).fill(m),
          (x, y) => this.cubepos(x, y, n),
        );
        if (ret !== 0) return ret;
      }
    }
    return 0;
  }

  /**
   * Set elimination with multiplicities — the theorem behind {@link set},
   * stated so a repeated symbol fits it.
   *
   * The `rows × cols` 0/1 matrix `at(i, j)` says whether row `i` may still pair
   * with column `j`; in the solution row `i` pairs exactly `demand[i]` times and
   * column `j` exactly `supply[j]` times (totals equal). For a subset `R` of
   * rows, every one of its pairings lands in `N(R)`, the columns some row of `R`
   * still admits. If `N(R)` can supply exactly what `R` demands, then every
   * pairing into `N(R)` comes from `R`, so any row *outside* `R` loses its
   * candidates in `N(R)`; if `N(R)` supplies less than `R` demands, the position
   * is contradictory. Column subsets are the same argument transposed, and
   * with every multiplicity 1 both collapse to the classic hidden/naked set —
   * the zero-rectangle `set` searches for.
   *
   * Subsets are enumerated outright: the matrices here are at most `o × o`
   * with `o ≤ 9`, and only a consumer with a repeat pays for it.
   */
  setGeneral(
    rows: number,
    cols: number,
    demand: readonly number[],
    supply: readonly number[],
    at: (i: number, j: number) => number,
  ): number {
    const cube = this.cube;
    const rec = this.recorder;
    const strike = (pos: number): void => {
      if (rec) {
        const s = this.symbols;
        const n = 1 + (pos % s);
        const rest = (pos / s) | 0;
        rec({
          kind: "elim",
          x: (rest / this.o) | 0,
          y: rest % this.o,
          n,
          reason: { kind: "set" },
          group: this.group,
        });
      }
      cube[pos] = 0;
    };

    // One pass over row subsets, one over column subsets; `side` names which
    // index runs along the subset.
    for (const side of ["rows", "cols"] as const) {
      const nSub = side === "rows" ? rows : cols;
      const nOther = side === "rows" ? cols : rows;
      const want = side === "rows" ? demand : supply;
      const give = side === "rows" ? supply : demand;
      const live = (a: number, b: number): boolean =>
        cube[side === "rows" ? at(a, b) : at(b, a)] !== 0;

      for (let mask = 1; mask < 1 << nSub; mask++) {
        // Skip singletons and the full set: a singleton is `elim`'s job, and the
        // full set's neighborhood is everything.
        const size = popcount(mask);
        if (size < 2 || size >= nSub) continue;
        let demanded = 0;
        for (let a = 0; a < nSub; a++) if (mask & (1 << a)) demanded += want[a];
        let neighborhood = 0;
        let supplied = 0;
        for (let b = 0; b < nOther; b++) {
          for (let a = 0; a < nSub; a++) {
            if (mask & (1 << a) && live(a, b)) {
              neighborhood |= 1 << b;
              supplied += give[b];
              break;
            }
          }
        }
        if (supplied < demanded) return -1;
        if (supplied !== demanded) continue;
        let progress = false;
        for (let a = 0; a < nSub; a++) {
          if (mask & (1 << a)) continue;
          for (let b = 0; b < nOther; b++) {
            if (neighborhood & (1 << b) && live(a, b)) {
              strike(side === "rows" ? at(a, b) : at(b, a));
              progress = true;
            }
          }
        }
        if (progress) return 1;
      }
    }
    return 0;
  }
}

/** Number of set bits in a small non-negative integer. */
function popcount(v: number): number {
  let c = 0;
  for (let m = v; m; m &= m - 1) c++;
  return c;
}

/** Optional per-recursion context cloning (upstream `ctxnew`/`ctxfree`). Most
 * games (Towers) share one immutable ctx and omit it. */
export interface LatinSolverConfig<Ctx> {
  /** Declare the last symbol as repeating `times` per line (a pseudo-Latin
   * puzzle). Leave unset for a Latin square; see {@link LatinRepeats}. */
  repeats?: LatinRepeats;
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
  /** What the recorder's fixpoint budget calls itself if it trips. Defaults to
   * the first consumer's label; a game that records passes its own so a runaway
   * fixpoint names the game that owns it. */
  budgetLabel?: string;
  /**
   * Extra candidate-cube constraints to apply *after* `alloc` and *before* the
   * deduction fixpoint — the slot upstream games use between
   * `latin_solver_alloc` and `latin_solver_main`. Salad's Number Ball clues are
   * the case: a ball ("this square holds a symbol") or a cross ("this one does
   * not") rules candidates out of a cell without placing any digit, so it
   * cannot be expressed through the seeded `grid`.
   *
   * Deliberately **not** re-applied inside `latinSolverRecurse`, because
   * upstream's recursion likewise re-allocs a bare sub-solver and re-runs only
   * `latin_solver_top`. That is sound for the only consumer, which passes
   * `diffRecursive = DIFF_IMPOSSIBLE` and so never recurses; a future recursing
   * consumer would have to revisit it.
   */
  seed?: (solver: LatinSolver) => void;
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
  // Rung `i` **is** difficulty level `i` here — `diffSimple`, `diffSet0`,
  // `diffSet1` and `diffForcing` are level numbers the game hands in, and
  // `applyRung` dispatches on them — so the technique's tier is its index, and
  // the cap is the game's own `maxdiff` rather than a position derived from it.
  const techniques: DeductionTechnique[] = [];
  for (let i = 0; i <= maxdiff; i++) {
    techniques.push({ id: `latin-level-${i}`, tier: i, run: () => applyRung(i) });
  }

  const fp = runDeductionFixpoint({
    techniques,
    maxTier: maxdiff,
    baseGrade: diffSimple,
    budget: solver.budget,
    beforeTechnique: () => solver.group++,
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
  const s = solver.symbols;
  let bestcount = s + 1;
  for (let y = 0; y < o; y++) {
    for (let x = 0; x < o; x++) {
      if (!solver.grid[y * o + x]) {
        let count = 0;
        for (let n = 1; n <= s; n++) if (solver.cubeGet(x, y, n)) count++;
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
  for (let n = 1; n <= s; n++) if (solver.cubeGet(x, y, n)) list.push(n);

  const ingrid = solver.grid.slice();
  let diff = DIFF_IMPOSSIBLE; // no solution found yet

  for (const guess of list) {
    const outgrid = ingrid.slice();
    outgrid[y * o + x] = guess;

    const newctx = cfg.ctxNew ? cfg.ctxNew(cfg.ctx) : cfg.ctx;
    const sub = new LatinSolver(o, cfg.repeats);
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
  const solver = new LatinSolver(o, cfg.repeats);
  if (!solver.alloc(grid)) {
    if (cfg.cubeOut) cfg.cubeOut.set(solver.cube);
    return DIFF_IMPOSSIBLE;
  }
  cfg.seed?.(solver);
  // Enable recording only *after* alloc, so seeding the cube from the givens
  // (a flurry of `place`s) is not mistaken for deductions the hint should teach.
  if (cfg.recorder) {
    solver.recorder = cfg.recorder;
    solver.budget = stepBudget(cfg.budgetLabel ?? "towers hint");
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
 * right vertices. `adjlists[L]` lists L's neighbors (mutated in place by the
 * randomizing DFS, exactly as upstream). Returns the L→R assignment array
 * (`-1` = unmatched), the analog of upstream's `outl`. The two RNG draws —
 * `shuffle(Lorder)` per BFS pass and the in-place `random_upto` adjacency
 * swap during the DFS — are reproduced exactly so generation is byte-faithful.
 *
 * `rs` is optional: passing it perturbs the algorithm to choose randomly among
 * possible matchings (generation), while omitting it runs deterministically
 * — the two draw sites are guarded exactly as `matching.c`'s `if (rs)`. A
 * matching's *cardinality* is order-independent, so the `rs`-less mode is the
 * faithful analog of upstream's `rs = NULL` existence check (Tents'
 * completion check). Derive an `R→L` assignment, if needed, by inverting the
 * returned `L→R` array.
 */
export function matching(
  nl: number,
  nr: number,
  adjlists: number[][],
  adjsizes: number[],
  rs?: RandomState,
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
    if (rs) shuffle(Lorder as unknown as number[], rs);

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
        if (rs && adjsizes[L] - j > 1) {
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
