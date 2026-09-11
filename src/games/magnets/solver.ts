/**
 * Magnets solver — faithful port of `solve_state` and its deduction helpers in
 * `magnets.c`. Byte-match critical (docs/games/solver-and-generator.md §
 * "Solver-gated generation"): the generator gates difficulty on this solver's
 * verdict, so it must reach C's exact solved/ambiguous/impossible outcome on
 * every intermediate board — including the upstream quirks (notably the
 * un-reset `ndom` accumulator in `countdominoesNonneutral`).
 *
 * The solver runs on its own scratch grid/flags (with the full NOT-mask
 * machinery), started empty from a board's clues; it never touches game state.
 * `solve` expects a freshly constructed solver. Return codes: −1 impossible,
 * 0 ambiguous/unfinished, 1 solved.
 */
import {
  type FiringTally,
  runDeductionFixpoint,
} from "../../engine/deduction-fixpoint.ts";
import {
  COLUMN,
  checkCompletion,
  DIFF_EASY,
  DIFF_TRICKY,
  GS_MARK,
  GS_NOTMASK,
  GS_NOTNEGATIVE,
  GS_NOTNEUTRAL,
  GS_NOTPOSITIVE,
  GS_SET,
  inGrid,
  type MagnetsCommon,
  NEGATIVE,
  NEUTRAL,
  notFlag,
  opposite,
  POSITIVE,
  ROW,
} from "./state.ts";

/** A row or column: `n` cells from index `start`, `step` apart. */
interface RowCol {
  start: number;
  step: number;
  n: number;
  /** length-3 view into rowcount/colcount: [neutral, positive, negative]. */
  targets: Int32Array;
}

const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];

export class MagnetsSolver {
  readonly w: number;
  readonly h: number;
  readonly wh: number;
  readonly common: MagnetsCommon;
  readonly dominoes: Int32Array;
  readonly grid: Int32Array;
  readonly flags: Int32Array;

  constructor(w: number, h: number, common: MagnetsCommon) {
    this.w = w;
    this.h = h;
    this.wh = w * h;
    this.common = common;
    this.dominoes = common.dominoes;
    this.grid = new Int32Array(this.wh);
    this.flags = new Int32Array(this.wh);
    // Singletons are permanently-set neutral squares.
    for (let i = 0; i < this.wh; i++) {
      if (this.dominoes[i] === i) {
        this.grid[i] = NEUTRAL;
        this.flags[i] |= GS_SET;
      }
    }
  }

  private possible(i: number, which: number): boolean {
    return (this.flags[i] & notFlag(which)) === 0;
  }

  private mkrowcol(num: number, roworcol: number): RowCol {
    if (roworcol === ROW) {
      return {
        start: num * this.w,
        step: 1,
        n: this.w,
        targets: this.common.rowcount.subarray(num * 3, num * 3 + 3),
      };
    }
    return {
      start: num,
      step: this.w,
      n: this.h,
      targets: this.common.colcount.subarray(num * 3, num * 3 + 3),
    };
  }

  /** Mark cell `i` (and, across its domino, the opposite color on the other
   * end) as not `which`. Returns a change count, or −1 for a contradiction. */
  private unflag(i: number, which: number): number {
    const ii = this.dominoes[i];
    if (ii === i) return 0;
    if (this.flags[i] & GS_SET && this.grid[i] === which) return -1;
    if (this.flags[ii] & GS_SET && this.grid[ii] === opposite(which)) return -1;
    let ret = 0;
    if (this.possible(i, which)) {
      this.flags[i] |= notFlag(which);
      ret++;
    }
    if (this.possible(ii, opposite(which))) {
      this.flags[ii] |= notFlag(opposite(which));
      ret++;
    }
    return ret;
  }

  private unflagSurrounds(i: number, which: number): number {
    const x = i % this.w;
    const y = Math.floor(i / this.w);
    for (let j = 0; j < 4; j++) {
      const xx = x + DX[j];
      const yy = y + DY[j];
      if (!inGrid(this.w, this.h, xx, yy)) continue;
      if (this.unflag(yy * this.w + xx, which) < 0) return -1;
    }
    return 0;
  }

  /** Set cell `i` to `which` (and its domino partner to the opposite). Returns
   * 1 (set), 0 (already so), or −1 (contradiction). Public: the generator's
   * `layDominoes` drives it directly. */
  set(i: number, which: number): number {
    const ii = this.dominoes[i];
    if (this.flags[i] & GS_SET) {
      return this.grid[i] === which ? 0 : -1;
    }
    if (this.flags[ii] & GS_SET && this.grid[ii] !== opposite(which)) return -1;
    if (!this.possible(i, which)) return -1;
    if (!this.possible(ii, opposite(which))) return -1;

    if (which !== NEUTRAL) {
      if (this.unflagSurrounds(i, which) < 0) return -1;
      if (this.unflagSurrounds(ii, opposite(which)) < 0) return -1;
    }
    this.grid[i] = which;
    this.grid[ii] = opposite(which);
    this.flags[i] |= GS_SET;
    this.flags[ii] |= GS_SET;
    return 1;
  }

  private countCells(rc: RowCol, counts: Int32Array, unset: Int32Array | null): void {
    counts.fill(0);
    if (unset) unset.fill(0);
    let i = rc.start;
    for (let j = 0; j < rc.n; j++, i += rc.step) {
      if (this.flags[i] & GS_SET) {
        counts[this.grid[i]]++;
      } else if (unset) {
        for (let which = 0; which <= 2; which++)
          if (this.possible(i, which)) unset[which]++;
      }
    }
  }

  private force(): number {
    let didsth = 0;
    for (let i = 0; i < this.wh; i++) {
      if (this.flags[i] & GS_SET) continue;
      if (this.dominoes[i] === i) continue;
      const f = this.flags[i] & GS_NOTMASK;
      let which = -1;
      if (f === (GS_NOTPOSITIVE | GS_NOTNEGATIVE)) which = NEUTRAL;
      if (f === (GS_NOTPOSITIVE | GS_NOTNEUTRAL)) which = NEGATIVE;
      if (f === (GS_NOTNEGATIVE | GS_NOTNEUTRAL)) which = POSITIVE;
      if (which !== -1) {
        if (this.set(i, which) < 0) return -1;
        didsth = 1;
      }
    }
    return didsth;
  }

  private neither(): number {
    let didsth = 0;
    for (let i = 0; i < this.wh; i++) {
      if (this.flags[i] & GS_SET) continue;
      const j = this.dominoes[i];
      if (i === j) continue;
      if (
        (this.flags[i] & GS_NOTPOSITIVE && this.flags[j] & GS_NOTPOSITIVE) ||
        (this.flags[i] & GS_NOTNEGATIVE && this.flags[j] & GS_NOTNEGATIVE)
      ) {
        if (this.set(i, NEUTRAL) < 0) return -1;
        didsth = 1;
      }
    }
    return didsth;
  }

  private checkfull(rc: RowCol, _counts: Int32Array): number {
    const counts = new Int32Array(4);
    const unset = new Int32Array(4);
    this.countCells(rc, counts, unset);
    let didsth = 0;
    for (let which = 0; which <= 2; which++) {
      const target = rc.targets[which];
      if (target === -1) continue;
      if (target < counts[which]) return -1;
      if (target === counts[which]) {
        let ci = rc.start;
        for (let j = 0; j < rc.n; j++, ci += rc.step) {
          if (this.flags[ci] & GS_SET) continue;
          if (!this.possible(ci, which)) continue;
          if (this.unflag(ci, which) < 0) return -1;
          didsth = 1;
        }
      } else if (target - counts[which] === unset[which]) {
        let ci = rc.start;
        for (let j = 0; j < rc.n; j++, ci += rc.step) {
          if (this.flags[ci] & GS_SET) continue;
          if (!this.possible(ci, which)) continue;
          if (this.set(ci, which) < 0) return -1;
          didsth = 1;
        }
      }
    }
    return didsth;
  }

  private advancedfull(rc: RowCol, counts: Int32Array): number {
    if (rc.targets[POSITIVE] === -1 && rc.targets[NEGATIVE] === -1) return 0;
    if (
      rc.targets[POSITIVE] >= 0 &&
      counts[POSITIVE] === rc.targets[POSITIVE] &&
      rc.targets[NEGATIVE] >= 0 &&
      counts[NEGATIVE] === rc.targets[NEGATIVE]
    ) {
      return 0;
    }

    let ci = rc.start;
    for (let j = 0; j < rc.n; j++, ci += rc.step) this.flags[ci] &= ~GS_MARK;

    let nfound = 0;
    ci = rc.start;
    for (let j = 0; j < rc.n; j++, ci += rc.step) {
      if (this.flags[ci] & GS_SET) continue;
      // A domino wholly in this row/col pointing forward.
      if (this.dominoes[ci] !== ci + rc.step) continue;
      // Both ends must be forced +/− only (NOTNEUTRAL and nothing else).
      if (
        (this.flags[ci] & GS_NOTMASK) !== GS_NOTNEUTRAL ||
        (this.flags[ci + rc.step] & GS_NOTMASK) !== GS_NOTNEUTRAL
      ) {
        continue;
      }
      this.flags[ci] |= GS_MARK;
      this.flags[ci + rc.step] |= GS_MARK;
      nfound++;
    }
    if (nfound === 0) return 0;

    counts[POSITIVE] += nfound;
    counts[NEGATIVE] += nfound;
    const clearpos =
      rc.targets[POSITIVE] >= 0 && counts[POSITIVE] === rc.targets[POSITIVE];
    const clearneg =
      rc.targets[NEGATIVE] >= 0 && counts[NEGATIVE] === rc.targets[NEGATIVE];
    if (!clearpos && !clearneg) return 0;

    let ret = 0;
    ci = rc.start;
    for (let j = 0; j < rc.n; j++, ci += rc.step) {
      if (this.flags[ci] & GS_SET) continue;
      if (this.flags[ci] & GS_MARK) continue;
      if (clearpos && !(this.flags[ci] & GS_NOTPOSITIVE)) {
        if (this.unflag(ci, POSITIVE) < 0) return -1;
        ret++;
      }
      if (clearneg && !(this.flags[ci] & GS_NOTNEGATIVE)) {
        if (this.unflag(ci, NEGATIVE) < 0) return -1;
        ret++;
      }
    }
    return ret;
  }

  private nonneutral(rc: RowCol, counts: Int32Array): number {
    if (rc.targets[NEUTRAL] !== counts[NEUTRAL] + 1) return 0;
    let ret = 0;
    let ci = rc.start;
    for (let j = 0; j < rc.n; j++, ci += rc.step) {
      if (this.flags[ci] & GS_SET) continue;
      if (this.dominoes[ci] !== ci + rc.step) continue;
      if (!(this.flags[ci] & GS_NOTNEUTRAL)) {
        if (this.unflag(ci, NEUTRAL) < 0) return -1;
        ret++;
      }
    }
    return ret;
  }

  private oddlength(rc: RowCol, counts: Int32Array): number {
    if (rc.targets[NEUTRAL] !== counts[NEUTRAL]) return 0;
    const tpos = rc.targets[POSITIVE] - counts[POSITIVE];
    const tneg = rc.targets[NEGATIVE] - counts[NEGATIVE];
    let extra: number;
    if (tpos === tneg + 1) extra = POSITIVE;
    else if (tneg === tpos + 1) extra = NEGATIVE;
    else return 0;

    let start = -1;
    let length = 0;
    let startodd = -1;
    let inempty = false;
    let ci = rc.start;
    for (let j = 0; j < rc.n; j++, ci += rc.step) {
      if (this.flags[ci] & GS_SET) {
        if (inempty) {
          if (length % 2) {
            if (startodd !== -1) return 0; // two odd sections — no deduction
            startodd = start;
          }
          inempty = false;
        }
      } else if (inempty) {
        length++;
      } else {
        start = ci;
        length = 1;
        inempty = true;
      }
    }
    if (inempty && length % 2) {
      if (startodd !== -1) return 0;
      startodd = start;
    }
    if (startodd !== -1) return this.set(startodd, extra);
    return 0;
  }

  private countdominoesNeutral(rc: RowCol, counts: Int32Array): number {
    if (rc.targets[POSITIVE] === -1 && rc.targets[NEGATIVE] === -1) return 0;

    let ndom = 0;
    let ci = rc.start;
    for (let j = 0; j < rc.n; j++, ci += rc.step) {
      if (this.flags[ci] & GS_SET) continue;
      // Skip solo cells and the 2nd cell of an in-row domino.
      if (this.dominoes[ci] === ci || this.dominoes[ci] === ci - rc.step) continue;
      ndom++;
    }

    let nonn = false;
    if (
      rc.targets[POSITIVE] !== -1 &&
      rc.targets[POSITIVE] - counts[POSITIVE] === ndom
    ) {
      nonn = true;
    }
    if (
      rc.targets[NEGATIVE] !== -1 &&
      rc.targets[NEGATIVE] - counts[NEGATIVE] === ndom
    ) {
      nonn = true;
    }
    if (!nonn) return 0;

    let ret = 0;
    ci = rc.start;
    for (let j = 0; j < rc.n; j++, ci += rc.step) {
      if (this.flags[ci] & GS_SET) continue;
      if (!(this.flags[ci] & GS_NOTNEUTRAL)) {
        if (this.unflag(ci, NEUTRAL) < 0) return -1;
        ret++;
      }
    }
    return ret;
  }

  private dominoCount(rc: RowCol, i: number, which: number): number {
    if (this.dominoes[i] === i || this.dominoes[i] === i - rc.step) return 0;
    if (this.flags[i] & GS_SET) return 0;
    let nposs = 0;
    if (this.possible(i, which)) nposs++;
    if (this.dominoes[i] === i + rc.step) {
      if (this.possible(i + rc.step, which)) nposs++;
    }
    return nposs;
  }

  private countdominoesNonneutral(rc: RowCol, counts: Int32Array): number {
    let didsth = 0;
    // NB: `ndom` is deliberately NOT reset between the two color iterations —
    // an upstream quirk reproduced verbatim, since a stronger or weaker solver
    // would change which clues the generator strips and so diverge the
    // byte-matched desc.
    let ndom = 0;
    let which = POSITIVE;
    for (let k = 0; k < 2; k++, which = opposite(which)) {
      if (rc.targets[which] === -1) continue;
      let ci = rc.start;
      for (let j = 0; j < rc.n; j++, ci += rc.step) {
        if (this.dominoCount(rc, ci, which) > 0) ndom++;
      }
      if (rc.targets[which] - counts[which] !== ndom) continue;
      ci = rc.start;
      for (let j = 0; j < rc.n; j++, ci += rc.step) {
        if (this.dominoCount(rc, ci, which) === 1) {
          const toset = this.possible(ci, which) ? ci : ci + rc.step;
          if (this.set(toset, which) < 0) return -1;
          didsth++;
        }
      }
    }
    return didsth;
  }

  private rowcols(fn: (rc: RowCol, counts: Int32Array) => number): number {
    let didsth = 0;
    const counts = new Int32Array(4);
    for (let x = 0; x < this.w; x++) {
      const rc = this.mkrowcol(x, COLUMN);
      this.countCells(rc, counts, null);
      const ret = fn.call(this, rc, counts);
      if (ret < 0) return ret;
      didsth += ret;
    }
    for (let y = 0; y < this.h; y++) {
      const rc = this.mkrowcol(y, ROW);
      this.countCells(rc, counts, null);
      const ret = fn.call(this, rc, counts);
      if (ret < 0) return ret;
      didsth += ret;
    }
    return didsth;
  }

  /** Upstream solve_unnumbered: force + neither to a fixpoint, then report
   * whether every cell is set (1), not (0), or a contradiction arose (−1).
   * Used by the generator's `layDominoes` while placing dominoes, before the
   * clue counts exist. `firings` is the test seam `magnets-ladder.test.ts`
   * reads the census through. */
  solveUnnumbered(firings?: FiringTally): number {
    const { impossible } = runDeductionFixpoint({
      techniques: [
        { id: "force", tier: DIFF_EASY, run: () => this.force() },
        { id: "neither", tier: DIFF_EASY, run: () => this.neither() },
      ],
      firings,
    });
    if (impossible) return -1;
    return this.allSet();
  }

  /** The loop `solveUnnumbered` ran before it adopted the shared runner, kept
   * as the oracle `magnets-ladder.test.ts` certifies the runner against
   * (`engine/testing/ladder-equivalence.ts` says why a differential alone
   * cannot). Not for production use. */
  solveUnnumberedLegacy(): number {
    while (true) {
      let ret = this.force();
      if (ret > 0) continue;
      if (ret < 0) return -1;
      ret = this.neither();
      if (ret > 0) continue;
      if (ret < 0) return -1;
      break;
    }
    return this.allSet();
  }

  /** 1 when every cell is set, else 0 — the unnumbered solve's verdict. */
  private allSet(): number {
    for (let i = 0; i < this.wh; i++) {
      if (!(this.flags[i] & GS_SET)) return 0;
    }
    return 1;
  }

  /** The loop `solve` ran before it adopted the shared runner, kept as the
   * oracle `magnets-ladder.test.ts` certifies the runner against — including
   * upstream's `if (diff < DIFF_TRICKY) break;` in the middle of the ladder,
   * which the runner's tier cap replaces. Not for production use. */
  solveLegacy(diff: number): number {
    while (true) {
      let ret = this.force();
      if (ret > 0) continue;
      if (ret < 0) return -1;

      ret = this.neither();
      if (ret > 0) continue;
      if (ret < 0) return -1;

      ret = this.rowcols(this.checkfull);
      if (ret < 0) return -1;
      if (ret > 0) continue;

      ret = this.rowcols(this.oddlength);
      if (ret < 0) return -1;
      if (ret > 0) continue;

      if (diff < DIFF_TRICKY) break;

      ret = this.rowcols(this.advancedfull);
      if (ret < 0) return -1;
      if (ret > 0) continue;

      ret = this.rowcols(this.nonneutral);
      if (ret < 0) return -1;
      if (ret > 0) continue;

      ret = this.rowcols(this.countdominoesNeutral);
      if (ret < 0) return -1;
      if (ret > 0) continue;

      ret = this.rowcols(this.countdominoesNonneutral);
      if (ret < 0) return -1;
      if (ret > 0) continue;

      break;
    }
    return checkCompletion(this);
  }

  /** Run the graded solver at `diff` (DIFF_EASY / DIFF_TRICKY or higher) on
   * the shared ladder (`engine/deduction-fixpoint.ts`); each technique's tier
   * is where upstream's mid-ladder `if (diff < DIFF_TRICKY) break;` put it.
   * `firings` is the test seam `magnets-ladder.test.ts` reads the census
   * through. Returns −1 impossible, 0 ambiguous/unfinished, 1 solved. */
  solve(diff: number, firings?: FiringTally): number {
    const { impossible } = runDeductionFixpoint({
      techniques: [
        { id: "force", tier: DIFF_EASY, run: () => this.force() },
        { id: "neither", tier: DIFF_EASY, run: () => this.neither() },
        { id: "checkfull", tier: DIFF_EASY, run: () => this.rowcols(this.checkfull) },
        { id: "oddlength", tier: DIFF_EASY, run: () => this.rowcols(this.oddlength) },
        {
          id: "advancedfull",
          tier: DIFF_TRICKY,
          run: () => this.rowcols(this.advancedfull),
        },
        {
          id: "nonneutral",
          tier: DIFF_TRICKY,
          run: () => this.rowcols(this.nonneutral),
        },
        {
          id: "count-dominoes-neutral",
          tier: DIFF_TRICKY,
          run: () => this.rowcols(this.countdominoesNeutral),
        },
        {
          id: "count-dominoes-nonneutral",
          tier: DIFF_TRICKY,
          run: () => this.rowcols(this.countdominoesNonneutral),
        },
      ],
      maxTier: diff,
      firings,
    });
    if (impossible) return -1;
    return checkCompletion(this);
  }
}
