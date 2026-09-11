/**
 * Crossing's recording deduction pass — the hint's half of the "one engine, two
 * projections" rule (docs/games/solver-and-generator.md § "One engine, two projections").
 *
 * It sits **beside** the untouched {@link solveCrossing} rather than threading a
 * recorder through it (the shape Boats' and Pattern's hints use): the
 * generator is solver-gated and covered end to end by a frozen byte-match
 * differential, so keeping the recording pass in its own module makes "the
 * solver didn't move" checkable from the file list.
 *
 * **Why the technique has to be re-derived.** `solverMarks` is a set
 * intersection: it reports *which* candidates a run's still-fitting numbers
 * rule out and carries no name for the reason. Narrating that raw ("this
 * square's candidates collapsed to one") would be correct, useless and
 * unteachable. So this module re-derives the things a Crossing player actually
 * thinks:
 *
 * 1. **`onlyNumber`** — one listed number is all that still fits a run, so the
 *    whole run is that number. One deduction, one whole-run move.
 * 2. **`sharedDigit`** — every number that still fits a run carries the same
 *    digit at one position, so that square is pinned.
 * 3. **`crossRuns`** — the signature deduction of a number crossword: the
 *    across number allows one set of digits in this square, the down number
 *    another, and they agree on exactly one.
 * 4. **`noteStrike`** — a pencil note no still-fitting number supports.
 *
 * **The order is derivation-depth first, then goal-first within a depth.**
 * "Still fits" has two readings. The *shallow* one — right length, not written
 * in elsewhere, agrees with the digits already in the run — is the scan the
 * player does by eye down the clue list, and is literally what the number
 * panel's fit-highlight already colors. The *deep* one is the fixpoint of the
 * narrowing below, where a number can die three implications away because some
 * crossing run ruled a digit out of one of its squares. Both are sound (each
 * over-estimates which numbers fit, so a set either narrows to one is narrowed
 * to the truth), but only the shallow one is checkable at a glance — so 1→3 run
 * over the shallow tables first, and a firing that needed the deep ones says so
 * in its own words rather than asserting something the player would check and
 * find false.
 *
 * Within a depth the order is goal-first: fill a whole run, else pin a square,
 * else rule a note out. That makes `noteStrike` a **tail technique by
 * construction** — it can only surface once every placement rung is exhausted,
 * which on a solver-gated board means never before the board is solved. It is
 * kept because it is the only honest advice on a position where deduction *is*
 * exhausted (a hand-authored, non-uniquely-solvable id reaches it, and that is
 * how `crossing-hint.test.ts` tests it). Measured over 48 generated boards:
 * `onlyNumber` 86.6%, `sharedDigit` 7.3%, `crossRuns` 5.8%, deep tier 0.4%,
 * `noteStrike` 0 — with **no board stalling**.
 *
 * Rungs 1–3 over the deep tables are exactly as strong as {@link solveCrossing}
 * — the narrowing fixpoint below is its `solverMarks` loop, and rungs 2+3 are
 * its `solverConfirm` — so a plan always reaches the solution.
 */

import { deduceHintPlan } from "../../engine/hint-plan.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import { say } from "./hint-text.ts";
import {
  type CrossingPuzzle,
  type CrossingState,
  numberAvailableTo,
  placedRuns,
  type SolveStatus,
  validateBoard,
} from "./state.ts";

/** Candidate bit for digit `n` (1–9) — Crossing's `marks` encoding, one lower
 * than the Latin games' `1 << n` (there is no "empty" digit to reserve 0 for). */
export const digitBit = (n: number): number => 1 << (n - 1);
const ALL_DIGITS = 0x1ff;

/** Plan-length cap — a UX bound, not a correctness one: the player rarely
 * follows more than a handful of steps before going their own way, and the next
 * request recomputes. Matches Spokes/Bricks/Boats. */
export const HINT_PLAN_MAX = 40;

function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let n = 1; n <= 9; n++) if (mask & digitBit(n)) out.push(n);
  return out;
}

/** The single digit `mask` allows, or 0 when it allows none or several. */
function soleDigit(mask: number): number {
  if (mask === 0 || (mask & (mask - 1)) !== 0) return 0;
  return 32 - Math.clz32(mask);
}

// --- the candidate lattice --------------------------------------------------

/** What the deduction knows about a board: which numbers are used up, which
 * still fit each run, and what each open square can therefore hold. */
interface Analysis {
  /** Per listed number, the run it is already written into, or −1. */
  placed: Int32Array;
  /** Per run, the indices of the listed numbers that can still go in it. */
  fitting: number[][];
  /** Per run, per position, the digits those numbers put there. */
  acc: Int32Array[];
  /** Per cell, the digits it can hold — the intersection over its runs. */
  cand: Int32Array;
  /** The same as {@link fitting}, but judged **only** against the digits
   * already entered in the run — the scan a player does by eye down the clue
   * list, which is exactly what the number panel already colors. A firing
   * whose premise holds under this weaker reading is directly checkable; one
   * that needs the full lattice says so in its narration. */
  shallowFitting: number[][];
  shallowAcc: Int32Array[];
}

function fitsUnder(
  puzzle: CrossingPuzzle,
  cand: Int32Array,
  r: number,
  l: number,
): boolean {
  const cells = puzzle.runs[r].cells;
  const num = puzzle.numbers[l];
  for (let k = 0; k < cells.length; k++) {
    if (!(cand[cells[k]] & digitBit(num.charCodeAt(k) - 48))) return false;
  }
  return true;
}

/**
 * One narrowing pass, `solverMarks`' shape: for every run, collect the numbers
 * that still fit it, union their digits per position, and intersect each open
 * square's candidates with that union. Narrows **in place as it goes**, so the
 * vertical runs already see what the horizontal ones ruled out — that ordering
 * is where much of the solver's strength lives.
 */
function narrowPass(
  puzzle: CrossingPuzzle,
  grid: Uint8Array,
  cand: Int32Array,
  placed: Int32Array,
): { fitting: number[][]; acc: Int32Array[]; changed: boolean } {
  const { numbers, runs } = puzzle;
  const fitting: number[][] = [];
  const acc: Int32Array[] = [];
  let changed = false;

  for (let r = 0; r < runs.length; r++) {
    const cells = runs[r].cells;
    const fits: number[] = [];
    const a = new Int32Array(cells.length);

    for (let l = 0; l < numbers.length; l++) {
      if (placed[l] >= 0 && placed[l] !== r) continue; // used up elsewhere
      if (numbers[l].length !== cells.length) continue;
      if (!fitsUnder(puzzle, cand, r, l)) continue;
      fits.push(l);
      for (let k = 0; k < cells.length; k++) {
        a[k] |= digitBit(numbers[l].charCodeAt(k) - 48);
      }
    }

    fitting.push(fits);
    acc.push(a);

    for (let k = 0; k < cells.length; k++) {
      const i = cells[k];
      if (grid[i]) continue;
      const next = cand[i] & a[k];
      if (next !== cand[i]) {
        cand[i] = next;
        changed = true;
      }
    }
  }

  return { fitting, acc, changed };
}

/** Run the narrowing to a fixpoint from the player's board. */
function analyze(puzzle: CrossingPuzzle, grid: Uint8Array): Analysis {
  const { w, h, walls, runs } = puzzle;
  const cand = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    // Seeding a *filled* square with just its own digit is what makes "still
    // fits" respect the player's entries — `solveCrossing` never needs it
    // because it only ever runs from an empty grid.
    cand[i] = walls[i] ? 0 : grid[i] ? digitBit(grid[i]) : ALL_DIGITS;
  }
  const placed = placedRuns(puzzle, grid);

  // The directly-checkable reading, taken before any narrowing.
  const shallowFitting: number[][] = [];
  const shallowAcc: Int32Array[] = [];
  for (let r = 0; r < runs.length; r++) {
    const cells = runs[r].cells;
    const fits: number[] = [];
    const a = new Int32Array(cells.length);
    for (let l = 0; l < puzzle.numbers.length; l++) {
      if (!numberAvailableTo(puzzle, grid, placed, r, l)) continue;
      fits.push(l);
      for (let k = 0; k < cells.length; k++) {
        a[k] |= digitBit(puzzle.numbers[l].charCodeAt(k) - 48);
      }
    }
    shallowFitting.push(fits);
    shallowAcc.push(a);
  }

  // The fixpoint is budgeted here only; the generator's copy of it in
  // `solver.ts` runs unbudgeted.
  const budget = stepBudget("crossing hint narrowing");
  let pass = narrowPass(puzzle, grid, cand, placed);
  while (pass.changed) {
    budget.tick();
    pass = narrowPass(puzzle, grid, cand, placed);
  }
  // The final pass changed nothing, so its `fitting`/`acc` agree with `cand`.
  return {
    placed,
    fitting: pass.fitting,
    acc: pass.acc,
    cand,
    shallowFitting,
    shallowAcc,
  };
}

// --- firings ----------------------------------------------------------------

/** One deduction, named the way a player would name it. Every firing carries
 * the run(s) it reasons over and the listed numbers that are its premise — the
 * evidence lives half in the clue list, so it travels with the firing. */
export type CrossingFiring =
  | {
      technique: "onlyNumber";
      /** The run being filled. */
      run: number;
      /** The listed number it must be. */
      number: number;
      /** The run's still-empty cells **as this firing fires** — the squares the
       * move actually writes into, and so the ones the hint marks (built against
       * the board of this step, not the original). */
      fill: number[];
      /** The premise: the numbers that still fit (here, just `number`). */
      fitting: number[];
      /** **What actually rules the others out** — the premise the narration
       * must state, since all three read very differently on the board (a
       * premise that doesn't single out this conclusion is a bug):
       * `"length"` — no other listed number is even this long (the whole story
       * on a fresh board); `"used"` — the other numbers of this length are
       * already written in elsewhere; `"digits"` — the digits already in this
       * run contradict them. Meaningful only when `deep` is false — a deep
       * firing's premise is the crossing numbers, and says so. */
      because: "length" | "used" | "digits";
      /** The premise needs the crossing numbers, not just the entered digits. */
      deep: boolean;
    }
  | {
      technique: "sharedDigit";
      run: number;
      /** Cell index of the square pinned, and its position along the run. */
      cell: number;
      pos: number;
      digit: number;
      fitting: number[];
      deep: boolean;
    }
  | {
      technique: "crossRuns";
      cell: number;
      digit: number;
      acrossRun: number;
      downRun: number;
      /** What each run's still-fitting numbers allow in this square. */
      acrossDigits: number[];
      downDigits: number[];
      fitting: number[];
      deep: boolean;
    }
  | {
      technique: "noteStrike";
      cell: number;
      /** The run whose fitting numbers refute the notes. */
      run: number;
      digits: number[];
      fitting: number[];
    };

/** The board the deduction walks: the player's entries plus their notes (the
 * notes are never read as *facts*, only as the thing a strike acts on). */
export interface CrossingHintBoard {
  puzzle: CrossingPuzzle;
  grid: Uint8Array;
  marks: Int32Array;
}

/** Position of cell `i` along run `r`. */
function posInRun(puzzle: CrossingPuzzle, r: number, i: number): number {
  return puzzle.runs[r].cells.indexOf(i);
}

/**
 * The next forced deduction, in **goal-first** order: fill a whole run, else
 * pin one square, else pin one square from its two crossing numbers, else rule
 * a refuted note out. Leading with the whole-run placement is both the
 * strongest teaching and the most satisfying move; a plan that dribbled out
 * note strikes before the run they belong to would read as busywork.
 *
 * The shallow tables go first, so a plainer argument is never passed over for
 * one that needs the crossing numbers (see the module note).
 */
export function nextCrossingFiring(board: CrossingHintBoard): CrossingFiring | null {
  const a = analyze(board.puzzle, board.grid);
  return (
    placementFiring(board, a.shallowFitting, a.shallowAcc, false) ??
    placementFiring(board, a.fitting, a.acc, true) ??
    noteStrikeFiring(board, a)
  );
}

/**
 * The three placement techniques, in goal-first order. Reads whichever pair of
 * (fitting, acc) tables it is given, so the same code serves the
 * directly-checkable and the non-local readings.
 */
function placementFiring(
  board: CrossingHintBoard,
  fitting: number[][],
  acc: Int32Array[],
  deep: boolean,
): CrossingFiring | null {
  const { puzzle, grid } = board;
  const { w, h, walls, runs, numbers } = puzzle;

  // 1 — a run only one listed number can still go in.
  for (let r = 0; r < runs.length; r++) {
    if (fitting[r].length !== 1) continue;
    const cells = runs[r].cells;
    const fill = cells.filter((i) => grid[i] === 0);
    if (fill.length === 0) continue; // already written in
    const sameLength = numbers.filter((n) => n.length === cells.length).length;
    return {
      technique: "onlyNumber",
      run: r,
      number: fitting[r][0],
      fill,
      fitting: fitting[r],
      because:
        fill.length < cells.length
          ? "digits" // something is written in the run, and it does the work
          : sameLength > 1
            ? "used" // nothing written here, so the others must be used up
            : "length", // it is the only number of this length, full stop
      deep,
    };
  }

  // 2 — a position every still-fitting number of one run agrees on.
  for (let r = 0; r < runs.length; r++) {
    const cells = runs[r].cells;
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k];
      if (grid[i]) continue;
      const digit = soleDigit(acc[r][k]);
      if (!digit) continue;
      return {
        technique: "sharedDigit",
        run: r,
        cell: i,
        pos: k,
        digit,
        fitting: fitting[r],
        deep,
      };
    }
  }

  // 3 — the two numbers crossing in a square agree on exactly one digit.
  for (let i = 0; i < w * h; i++) {
    if (walls[i] || grid[i]) continue;
    const across = puzzle.acrossRun[i];
    const down = puzzle.downRun[i];
    if (across < 0 || down < 0) continue;
    const acrossDigits = acc[across][posInRun(puzzle, across, i)];
    const downDigits = acc[down][posInRun(puzzle, down, i)];
    const digit = soleDigit(acrossDigits & downDigits);
    if (!digit) continue;
    return {
      technique: "crossRuns",
      cell: i,
      digit,
      acrossRun: across,
      downRun: down,
      acrossDigits: digitsOf(acrossDigits),
      downDigits: digitsOf(downDigits),
      fitting: [...fitting[across], ...fitting[down]],
      deep,
    };
  }

  return null;
}

/** A pencil note no still-fitting number supports. */
function noteStrikeFiring(
  board: CrossingHintBoard,
  a: Analysis,
): CrossingFiring | null {
  const { puzzle, grid, marks } = board;
  const { w, h, walls } = puzzle;
  for (let i = 0; i < w * h; i++) {
    if (walls[i] || grid[i] || marks[i] === 0) continue;
    let bestRun = -1;
    let bestMask = 0;
    for (const r of [puzzle.acrossRun[i], puzzle.downRun[i]]) {
      if (r < 0) continue;
      // One firing states one run's refutation, so take the run that refutes
      // the most — a premise mixing two runs would need two sentences.
      const mask = marks[i] & ~a.acc[r][posInRun(puzzle, r, i)] & ALL_DIGITS;
      if (
        mask !== 0 &&
        (bestRun < 0 || digitsOf(mask).length > digitsOf(bestMask).length)
      ) {
        bestRun = r;
        bestMask = mask;
      }
    }
    if (bestRun < 0) continue;
    return {
      technique: "noteStrike",
      cell: i,
      run: bestRun,
      digits: digitsOf(bestMask),
      fitting: a.fitting[bestRun],
    };
  }

  return null;
}

/** Apply a firing to the deduction's working board. */
export function applyCrossingFiring(
  board: CrossingHintBoard,
  firing: CrossingFiring,
): void {
  const { puzzle, grid, marks } = board;
  switch (firing.technique) {
    case "onlyNumber": {
      const cells = puzzle.runs[firing.run].cells;
      const num = puzzle.numbers[firing.number];
      for (let k = 0; k < cells.length; k++) grid[cells[k]] = num.charCodeAt(k) - 48;
      break;
    }
    case "sharedDigit":
    case "crossRuns":
      grid[firing.cell] = firing.digit;
      break;
    case "noteStrike":
      for (const d of firing.digits) marks[firing.cell] &= ~digitBit(d);
      break;
  }
}

// --- the plan ---------------------------------------------------------------

export interface CrossingPlan {
  status: SolveStatus;
  firings: CrossingFiring[];
}

/** Replay the deduction from the player's own board, one firing at a time. */
export function deduceCrossingPlan(state: CrossingState): CrossingPlan {
  const board: CrossingHintBoard = {
    puzzle: state.puzzle,
    grid: state.grid.slice(),
    marks: state.pencil.slice(),
  };
  const { status, plan } = deduceHintPlan<
    CrossingHintBoard,
    CrossingFiring,
    SolveStatus
  >({
    board,
    status: (b) => validateBoard(b.puzzle, b.grid).status,
    incomplete: "progress",
    next: nextCrossingFiring,
    apply: applyCrossingFiring,
    planCap: HINT_PLAN_MAX,
    budget: stepBudget("crossing hint"),
  });
  return { status, firings: plan };
}

// --- narration --------------------------------------------------------------

/**
 * One firing, in one sentence: which one, with the run's length, direction and
 * number read off the puzzle. The words are [`hint-text.ts`](./hint-text.ts)'s.
 */
export function narrateCrossing(
  puzzle: CrossingPuzzle,
  firing: CrossingFiring,
): string {
  switch (firing.technique) {
    case "onlyNumber": {
      const run = puzzle.runs[firing.run];
      return say.onlyNumber(
        firing,
        run.horizontal,
        run.cells.length,
        puzzle.numbers[firing.number],
      );
    }
    case "sharedDigit":
      return say.sharedDigit(firing, puzzle.runs[firing.run].horizontal);
    case "crossRuns":
      return say.crossRuns(firing);
    case "noteStrike":
      return say.noteStrike(firing, puzzle.runs[firing.run].horizontal);
  }
}
