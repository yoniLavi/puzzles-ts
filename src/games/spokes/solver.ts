/**
 * Spokes — the tiered deductive solver and the connectivity validator.
 *
 * Port of `spokes_solve` and friends from `puzzles/unreleased/spokes.c`. The
 * solver runs a fixpoint of four rules, gated by a difficulty tier:
 *
 * - {@link spokesSolverOnes} — a spoke joining two clue-`1` hubs would strand
 *   that pair, so mark it. A one-shot pre-pass, run once per solve.
 * - {@link spokesSolverFull} — hub saturation and exhaustion: if every
 *   remaining spoke must be a line, draw them all; if the clue is already
 *   satisfied, mark the rest.
 * - {@link spokesSolverDiagonal} — mark the diagonal that would cross an
 *   existing diagonal line in the same cell corner.
 * - {@link spokesSolverAttempt} (Tricky and Unreasonable) — contradiction
 *   look-ahead: try a spoke both ways, and if one provably leads to an invalid
 *   board, commit the other.
 *
 * **The look-ahead is one function under two tiers, and they are two different
 * rungs** (`audit-guessing-tier-names`, design D9 + D10). Neither guesses — both
 * are exhaustive and deterministic, and every commit is forced by a proof that
 * the alternative is impossible. What separates them is how much reasoning the
 * *player* has to carry to check that proof, and only the sub-tier argument says
 * so:
 *
 * - **Tricky** passes `DIFF_LIMITED`, an Easy pass that stops at
 *   `ACTION_LIMIT`. A bounded chain — measured at a median of 2 and a max of 9
 *   deductions — which a player can walk. A *Tactic*, and legal at a middle
 *   tier.
 * - **Unreasonable** passes `DIFF_EASY`, the same pass with no bound. Measured
 *   at a median of 2 as well, so the two are indistinguishable on a typical
 *   board — but its p90 is 11 and its max is **35 hubs on a 36-hub grid**, i.e.
 *   it solves the rest of the puzzle from the hypothesis. That is a *Search*,
 *   and it is why the tier upstream calls `Hard` is named `Unreasonable` here.
 *
 * The lesson worth keeping: **classify a trial rung by the bound it guarantees,
 * not by the depth it typically reaches.** The medians agree; only the
 * guarantees differ, and a hint can only promise what is guaranteed.
 *
 * Validity is decided by counting lines/marks per hub, rejecting crossing
 * diagonals, and — over a `Dsf` of the line-connected hubs, plus a per-class
 * count of the lines still drawable out of it — rejecting a closed-off set
 * that can never reach the rest of the board.
 */

import { Dsf } from "../../engine/dsf.ts";
import { deduceHintPlan } from "../../engine/hint-plan.ts";
import {
  cloneBoard,
  copyBoard,
  DIFF_EASY,
  DIFF_HARD,
  DIFF_LIMITED,
  DIFF_TRICKY,
  DIR_BOTLEFT,
  DIR_BOTRIGHT,
  getSpoke,
  SPOKE_DIRS,
  SPOKE_EMPTY,
  SPOKE_LINE,
  SPOKE_MARKED,
  type SpokesBoard,
  spokeCounts,
  spokesCount,
  spokesPlace,
  syncDiagonalBlock,
} from "./state.ts";

/** Upstream's `STATUS_INVALID` / `STATUS_INCOMPLETE` / `STATUS_VALID`, as a
 * union rather than a magic `0/1/2`. */
export type SpokesStatus = "invalid" | "incomplete" | "valid";

/**
 * How many deductions the bounded `DIFF_LIMITED` tier is allowed to make.
 *
 * This is the single number that separates Spokes' Tactic rung from its Search
 * one — the two are the same function under different sub-tiers — so it is
 * load-bearing for the tier names, not a tuning dial. Measured over 30 boards
 * per configuration: with the cap, a sub-solve makes a median of 2 and at most
 * 9 deductions; without it, the median is *also* 2 but the p90 is 11 and the max
 * is 35 hubs on a 36-hub board. See `audit-guessing-tier-names` §6.
 */
const ACTION_LIMIT = 4;

/**
 * The solver's reusable scratch (upstream `struct spokes_scratch`), allocated
 * once per solve rather than `snew`/`sfree`d per call.
 */
export class SpokesScratch {
  /** Placeable spokes per hub (8 minus the hidden ones). */
  readonly nodes: Int32Array;
  /** Lines drawn per hub. */
  readonly lines: Int32Array;
  /** Marks placed per hub. */
  readonly marked: Int32Array;
  /** Line-connectivity of the hubs. */
  readonly dsf: Dsf;
  /** Per connected class (indexed by its canonical root), how many more lines
   * the class can still draw out of itself. */
  readonly open: Int32Array;

  constructor(cells: number) {
    this.nodes = new Int32Array(cells);
    this.lines = new Int32Array(cells);
    this.marked = new Int32Array(cells);
    this.dsf = new Dsf(cells);
    this.open = new Int32Array(cells);
  }
}

/**
 * Recount the per-hub tallies and rebuild the connectivity `Dsf`.
 *
 * `full` adds the *diagonal* bonus: a drawn diagonal makes the crossing
 * diagonal unplaceable, so the two hubs at its other corners count one extra
 * mark. Only the renderer asks for that (it decides whether a hub is
 * over-marked); the solve loop deliberately recounts without it, exactly as
 * upstream — `spokes_solver_diagonal` is what turns those into real marks.
 */
export function spokesSolverRecount(
  b: SpokesBoard,
  s: SpokesScratch,
  full: boolean,
): void {
  const { w, h } = b;
  const n = w * h;

  for (let i = 0; i < n; i++) {
    // One table lookup yields all four counts (see `spokeCounts`).
    const counts = spokeCounts(b.spokes[i]);
    s.nodes[i] = 8 - (counts & 0xff);
    s.lines[i] = (counts >>> (SPOKE_LINE * 8)) & 0xff;
    s.marked[i] = (counts >>> (SPOKE_MARKED * 8)) & 0xff;
  }

  if (full) {
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const i = y * w + x;
        const hub = b.spokes[i];
        const hub2 = b.spokes[i + 1];
        if (
          getSpoke(hub, DIR_BOTRIGHT) === SPOKE_LINE &&
          getSpoke(hub2, DIR_BOTLEFT) === SPOKE_EMPTY
        ) {
          s.marked[i + 1]++;
          s.marked[i + w]++;
        }
        if (
          getSpoke(hub2, DIR_BOTLEFT) === SPOKE_LINE &&
          getSpoke(hub, DIR_BOTRIGHT) === SPOKE_EMPTY
        ) {
          s.marked[i]++;
          s.marked[i + w + 1]++;
        }
      }
    }
  }

  s.dsf.reinit();

  // Holes are folded into cell 0's class so that "one class of w*h cells"
  // means solved even on a board with holes in it. If cell 0 is *itself* a
  // hole, it first joins the earliest real hub so the class has a hub in it.
  if (!b.numbers[0]) {
    for (let i = 1; i < n; i++) {
      if (b.numbers[i]) {
        s.dsf.merge(i, 0);
        break;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (!b.numbers[i]) {
      s.dsf.merge(i, 0);
    } else {
      for (let j = 0; j < 4; j++) {
        const x = (i % w) + SPOKE_DIRS[j].dx;
        const y = ((i / w) | 0) + SPOKE_DIRS[j].dy;
        if (
          x >= 0 &&
          x < w &&
          y >= 0 &&
          y < h &&
          getSpoke(b.spokes[i], j) === SPOKE_LINE
        ) {
          s.dsf.merge(i, y * w + x);
        }
      }
    }
  }
}

/**
 * For each connected class, how many more lines it can draw out of itself:
 * the sum over its hubs of "clue minus lines already drawn". Zero means the
 * class is closed — which is a win if it is the whole board and a dead end
 * otherwise.
 */
export function spokesFindIsolated(b: SpokesBoard, s: SpokesScratch): void {
  const n = b.w * b.h;
  s.open.fill(0);
  for (let i = 0; i < n; i++) {
    s.open[s.dsf.canonify(i)] += b.numbers[i] - s.lines[i];
  }
}

/** Is the board solved, still in progress, or already contradictory? */
export function spokesValidate(b: SpokesBoard, scratch?: SpokesScratch): SpokesStatus {
  const n = b.w * b.h;
  const s = scratch ?? new SpokesScratch(n);

  spokesSolverRecount(b, s, false);

  let ret: SpokesStatus = "valid";

  for (let i = 0; i < n && ret !== "invalid"; i++) {
    if (s.lines[i] < b.numbers[i]) ret = "incomplete";
    // Too many marks to still reach the clue, or too many lines already.
    if (s.marked[i] > s.nodes[i] - b.numbers[i]) ret = "invalid";
    if (s.lines[i] > b.numbers[i]) ret = "invalid";
  }

  for (let i = 0; i < n && ret !== "invalid"; i++) {
    // Crossing diagonals. The `i + 1 < n` guard is ours: upstream reads one
    // past the end, which is harmless there only because `&&` short-circuits
    // (a right-edge or bottom-row hub has no BOTRIGHT spoke, so the second
    // operand is never evaluated). Keeping the guard makes that explicit.
    if (
      i + 1 < n &&
      getSpoke(b.spokes[i], DIR_BOTRIGHT) === SPOKE_LINE &&
      getSpoke(b.spokes[i + 1], DIR_BOTLEFT) === SPOKE_LINE
    ) {
      ret = "invalid";
    }
  }

  if (ret !== "invalid") {
    spokesFindIsolated(b, s);
    for (let i = 0; i < n && ret !== "invalid"; i++) {
      if (s.open[i] === 0 && s.dsf.canonify(i) === i && s.dsf.size(i) < n) {
        ret = "invalid";
      }
    }
  }

  return ret;
}

// --- deduction rules --------------------------------------------------------

/**
 * Mark every spoke joining two clue-`1` hubs: connecting them would close off
 * a group of two with no way to reach the rest. Skipped when the whole grid is
 * exactly two hubs, where that pair *is* the answer.
 *
 * Faithful quirk: the mark is placed unconditionally, without first checking
 * that the spoke is `EMPTY` — on a board where an `'X'` hole has already
 * hidden that diagonal, upstream overwrites the hidden state with a mark. This
 * is a one-shot pre-pass on a freshly cleared board, and the generator never
 * emits `'X'`, so it only reaches hand-authored descriptions.
 */
export function spokesSolverOnes(b: SpokesBoard): number {
  const { w, h } = b;
  let count = 0;
  for (let i = 0; i < w * h; i++) if (b.numbers[i]) count++;
  if (count === 2) return 0;

  let ret = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (b.numbers[y * w + x] !== 1) continue;
      for (let j = 0; j < 4; j++) {
        const dx = x + SPOKE_DIRS[j].dx;
        const dy = y + SPOKE_DIRS[j].dy;
        if (dx < 0 || dx >= w || dy < 0 || dy >= h) continue;
        if (b.numbers[dy * w + dx] === 1) {
          spokesPlace(b, y * w + x, j, SPOKE_MARKED);
          ret++;
        }
      }
    }
  }
  return ret;
}

/**
 * Hub saturation and exhaustion. Reads the tallies {@link spokesValidate} last
 * computed and mutates as it sweeps, so later hubs in the same pass see
 * earlier placements but stale counts — faithful to upstream, and harmless
 * because the loop re-runs to a fixpoint.
 */
export function spokesSolverFull(b: SpokesBoard, s: SpokesScratch): number {
  const n = b.w * b.h;
  let ret = 0;

  for (let i = 0; i < n; i++) {
    let changed = false;

    // Every placeable spoke that isn't marked must be a line.
    if (s.nodes[i] - s.marked[i] === b.numbers[i]) {
      for (let j = 0; j < 8; j++) {
        if (getSpoke(b.spokes[i], j) === SPOKE_EMPTY) {
          spokesPlace(b, i, j, SPOKE_LINE);
          changed = true;
        }
      }
    }

    // The clue is already satisfied, so nothing else can be a line.
    if (s.lines[i] === b.numbers[i]) {
      for (let j = 0; j < 8; j++) {
        if (getSpoke(b.spokes[i], j) === SPOKE_EMPTY) {
          spokesPlace(b, i, j, SPOKE_MARKED);
          changed = true;
        }
      }
    }

    if (changed) ret++;
  }

  return ret;
}

/** Mark the empty diagonal that would cross a drawn diagonal. */
export function spokesSolverDiagonal(b: SpokesBoard): number {
  const { w, h } = b;
  let ret = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      if (
        getSpoke(b.spokes[i], DIR_BOTRIGHT) === SPOKE_LINE &&
        getSpoke(b.spokes[i + 1], DIR_BOTLEFT) === SPOKE_EMPTY
      ) {
        spokesPlace(b, i + 1, DIR_BOTLEFT, SPOKE_MARKED);
        ret++;
      }
      if (
        getSpoke(b.spokes[i], DIR_BOTRIGHT) === SPOKE_EMPTY &&
        getSpoke(b.spokes[i + 1], DIR_BOTLEFT) === SPOKE_LINE
      ) {
        spokesPlace(b, i, DIR_BOTRIGHT, SPOKE_MARKED);
        ret++;
      }
    }
  }
  return ret ? 1 : 0;
}

/**
 * Bounded contradiction look-ahead. For every undecided spoke, try it as a
 * mark and as a line; whenever the trial board provably becomes invalid at the
 * (lower) recursion tier, commit the opposite value on the real board.
 *
 * `copy` is a reusable scratch board and `s` the shared scratch — both are
 * clobbered, exactly as upstream, and the recursion tier is always below
 * `DIFF_TRICKY`, so the recursive solve never re-enters this function.
 */
export function spokesSolverAttempt(
  b: SpokesBoard,
  copy: SpokesBoard,
  s: SpokesScratch,
  diff: number,
): number {
  const n = b.w * b.h;
  let ret = 0;

  for (let i = 0; i < n; i++) {
    for (let dir = 0; dir < 8; dir++) {
      for (let l = 0; l < 2; l++) {
        if (getSpoke(b.spokes[i], dir) !== SPOKE_EMPTY) continue;

        copyBoard(b, copy);
        spokesPlace(copy, i, dir, l ? SPOKE_LINE : SPOKE_MARKED);
        if (spokesSolve(copy, s, diff) === "invalid") {
          spokesPlace(b, i, dir, l ? SPOKE_MARKED : SPOKE_LINE);
          ret++;
        }
      }
    }
  }

  return ret;
}

// --- the solve loop ---------------------------------------------------------

// --- the recording deduction pass (the hint's second projection) -----------

/**
 * Which rung forced a firing — a discriminated tag rather than a magic number,
 * so the hint's narrator can `switch` over it exhaustively.
 */
export type SpokesFiringKind =
  | "twoOnes"
  | "saturation"
  | "exhaustion"
  | "contradiction";

/** One spoke a firing forces or cites — one end of an edge. */
export interface SpokesSpokeRef {
  index: number;
  dir: number;
  state: number;
}

/** How a contradiction look-ahead's trial board turns out to be impossible. */
export type SpokesBreakKind = "overfilled" | "crossing" | "sealed";

/**
 * One *firing*: one rung reaching one conclusion, with everything the hint
 * needs to narrate and highlight it. `forced` is the spokes it forces (each
 * becomes one leg of a single journey — they share a fate, so a saturated hub's
 * four lines are one hint, not four). `evidenceHubs` are the hubs whose clue or
 * lines are the argument (ringed, and read for their clue value in the prose).
 */
export interface SpokesFiring {
  kind: SpokesFiringKind;
  forced: SpokesSpokeRef[];
  evidenceHubs: number[];
  /** Contradiction only: the hypothesis whose refutation forces `forced`. */
  hypothesis?: SpokesSpokeRef;
  /** Contradiction only: how — and where — the hypothesis breaks the board. */
  breakKind?: SpokesBreakKind;
}

/** Runaway/UX cap on plan length (design D1): the look-ahead rung is expensive
 * and a player rarely follows more than a few steps before diverging, so a
 * recompute yields the next batch. */
export const HINT_PLAN_MAX = 40;

/** The EMPTY spoke directions of a hub, in `DIR_*` order. */
function emptyDirs(hub: number): number[] {
  const dirs: number[] = [];
  for (let d = 0; d < 8; d++) if (getSpoke(hub, d) === SPOKE_EMPTY) dirs.push(d);
  return dirs;
}

/** Lines already drawn out of a hub. */
function linesOf(b: SpokesBoard, i: number): number {
  return spokesCount(b.spokes[i], SPOKE_LINE);
}

/** Whether a hub still needs more lines than it has drawn. */
function unsatisfied(b: SpokesBoard, i: number): boolean {
  return linesOf(b, i) < b.numbers[i];
}

/**
 * Whether ruling out the spoke `(i, d)` actually advances the puzzle: a rule-out
 * only helps a hub that still needs lines (it narrows that hub's options toward
 * a forced connection). A mark between two *already-satisfied* hubs advances
 * nothing — neither can take the spoke anyway — so we never hint it (owner
 * directive: only rule out when it helps the goal). Such a mark is also never
 * load-bearing: completion needs the required *lines* drawn, and a both-ends-full
 * spoke feeds no hub's saturation, so skipping it cannot stall the plan.
 */
function markHelps(b: SpokesBoard, i: number, d: number): boolean {
  if (unsatisfied(b, i)) return true;
  const nx = (i % b.w) + SPOKE_DIRS[d].dx;
  const ny = ((i / b.w) | 0) + SPOKE_DIRS[d].dy;
  if (nx < 0 || nx >= b.w || ny < 0 || ny >= b.h) return false;
  const j = ny * b.w + nx;
  return b.numbers[j] > 0 && unsatisfied(b, j);
}

/**
 * The two-ones rung as a firing: the still-EMPTY spoke joining two clue-`1`
 * hubs that **both still need their line**. Connecting them would satisfy both
 * yet seal the pair off, so the spoke is ruled out. Once either hub has its
 * line the deduction is moot (they can no longer connect), so we require both
 * unsatisfied — which is exactly when the rule-out helps.
 *
 * Iterating `d < 4` visits each such edge once, from its lower-indexed end.
 * Skipped on a two-hub board, where the pair *is* the answer — faithful to
 * {@link spokesSolverOnes}, which the generator never emits at these presets.
 */
function findTwoOnes(b: SpokesBoard): SpokesFiring | null {
  const { w, h } = b;
  let clues = 0;
  for (let i = 0; i < w * h; i++) if (b.numbers[i]) clues++;
  if (clues === 2) return null;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (b.numbers[i] !== 1 || !unsatisfied(b, i)) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + SPOKE_DIRS[d].dx;
        const ny = y + SPOKE_DIRS[d].dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const j = ny * w + nx;
        if (
          b.numbers[j] === 1 &&
          unsatisfied(b, j) &&
          getSpoke(b.spokes[i], d) === SPOKE_EMPTY
        ) {
          return {
            kind: "twoOnes",
            forced: [{ index: i, dir: d, state: SPOKE_MARKED }],
            evidenceHubs: [i, j],
          };
        }
      }
    }
  }
  return null;
}

/**
 * Hub saturation: a hub with exactly as many free spokes as the lines it still
 * needs — so every one of them is a line. The connection-drawing rung, and the
 * most direct progress, so it is tried first (owner directive: prioritize
 * connections). Reads the tallies {@link spokesValidate} last left in `s`.
 */
function findSaturation(b: SpokesBoard, s: SpokesScratch): SpokesFiring | null {
  const n = b.w * b.h;
  for (let i = 0; i < n; i++) {
    if (s.nodes[i] - s.marked[i] === b.numbers[i]) {
      const dirs = emptyDirs(b.spokes[i]);
      if (dirs.length) {
        return {
          kind: "saturation",
          forced: dirs.map((d) => ({ index: i, dir: d, state: SPOKE_LINE })),
          evidenceHubs: [i],
        };
      }
    }
  }
  return null;
}

/**
 * Hub exhaustion: a satisfied hub's remaining spokes cannot be lines. Only the
 * ones that reach a hub still needing lines are hinted ({@link markHelps}) — an
 * exhaustion mark onto another finished hub is busywork, and never needed for
 * completion.
 */
function findExhaustion(b: SpokesBoard, s: SpokesScratch): SpokesFiring | null {
  const n = b.w * b.h;
  for (let i = 0; i < n; i++) {
    if (s.lines[i] !== b.numbers[i]) continue;
    const dirs = emptyDirs(b.spokes[i]).filter((d) => markHelps(b, i, d));
    if (dirs.length) {
      return {
        kind: "exhaustion",
        forced: dirs.map((d) => ({ index: i, dir: d, state: SPOKE_MARKED })),
        evidenceHubs: [i],
      };
    }
  }
  return null;
}

/** Classify why an invalid board is impossible, and name the hubs at fault, so
 * a contradiction hint can point at the break rather than assert one. */
function analyseBreak(
  b: SpokesBoard,
  s: SpokesScratch,
): { breakKind: SpokesBreakKind; hubs: number[] } {
  const n = b.w * b.h;
  spokesSolverRecount(b, s, false);

  for (let i = 0; i < n; i++) {
    if (s.lines[i] > b.numbers[i] || s.marked[i] > s.nodes[i] - b.numbers[i]) {
      return { breakKind: "overfilled", hubs: [i] };
    }
  }

  for (let i = 0; i + 1 < n; i++) {
    if (
      getSpoke(b.spokes[i], DIR_BOTRIGHT) === SPOKE_LINE &&
      getSpoke(b.spokes[i + 1], DIR_BOTLEFT) === SPOKE_LINE
    ) {
      return { breakKind: "crossing", hubs: [i, i + 1] };
    }
  }

  spokesFindIsolated(b, s);
  for (let i = 0; i < n; i++) {
    if (s.open[i] === 0 && s.dsf.canonify(i) === i && s.dsf.size(i) < n) {
      const hubs: number[] = [];
      for (let j = 0; j < n; j++) {
        if (b.numbers[j] && s.dsf.canonify(j) === i) hubs.push(j);
      }
      return { breakKind: "sealed", hubs };
    }
  }

  // Unreachable on a genuinely-invalid board, but keep the return total.
  return { breakKind: "sealed", hubs: [] };
}

/**
 * The contradiction look-ahead as a firing: the first EMPTY spoke one of whose
 * values provably drives a `subdiff` sub-solve to `invalid`. Mirrors
 * {@link spokesSolverAttempt}, but stops at the first hit and records the
 * refuted hypothesis plus where the trial board breaks (design D3).
 */
function findContradiction(
  b: SpokesBoard,
  copy: SpokesBoard,
  s: SpokesScratch,
  subdiff: number,
): SpokesFiring | null {
  const n = b.w * b.h;
  for (let i = 0; i < n; i++) {
    for (let dir = 0; dir < 8; dir++) {
      if (getSpoke(b.spokes[i], dir) !== SPOKE_EMPTY) continue;
      for (let l = 0; l < 2; l++) {
        const forcedState = l ? SPOKE_MARKED : SPOKE_LINE;
        // A forced rule-out that helps neither hub is busywork; a forced *line*
        // is always progress (owner directive).
        if (forcedState === SPOKE_MARKED && !markHelps(b, i, dir)) continue;
        const trialState = l ? SPOKE_LINE : SPOKE_MARKED;
        copyBoard(b, copy);
        spokesPlace(copy, i, dir, trialState);
        if (spokesSolve(copy, s, subdiff) === "invalid") {
          const { breakKind, hubs } = analyseBreak(copy, s);
          return {
            kind: "contradiction",
            forced: [{ index: i, dir, state: forcedState }],
            hypothesis: { index: i, dir, state: trialState },
            evidenceHubs: hubs,
            breakKind,
          };
        }
      }
    }
  }
  return null;
}

/** Apply a firing's forced spokes to a working board (both ends kept in sync),
 * auto-ruling-out the crossing of any diagonal line — exactly as `executeMove`
 * does in the real game, so the plan replay stays consistent without a separate
 * crossing rung. */
function applyFiring(b: SpokesBoard, f: SpokesFiring): void {
  for (const { index, dir, state } of f.forced) {
    const old = getSpoke(b.spokes[index], dir);
    spokesPlace(b, index, dir, state);
    syncDiagonalBlock(b, index, dir, old, state);
  }
}

/**
 * The next firing from `b`, **goal-first**: draw a forced connection whenever
 * one exists ({@link findSaturation}), then the genuinely-useful rule-outs (each
 * gated so it only fires when it helps a hub still needing lines), then the
 * expensive look-ahead. This deliberately reorders the solver's rungs — the hint
 * only needs each firing to be *forced*, not to match the solver's internal
 * order, and leading with connections keeps the plan from dribbling out
 * busywork marks. `s` must already hold `b`'s recounted tallies (`full = false`);
 * `copy` is contradiction scratch, non-null iff `diff >= DIFF_TRICKY`.
 *
 * **The `Unreasonable` rung is deliberately absent.** `spokesSolve` runs the
 * look-ahead a second time at `DIFF_EASY` — the same trial with no bound on the
 * sub-solve — and that is a search, not a technique, so no hint narrates it on
 * any tier (`audit-guessing-tier-names` design D9; the Galaxies precedent). The
 * plan therefore stalls where bounded reasoning stalls and `hint` says so, which
 * is the honest answer. The *solver* keeps the rung: the generator grades on it,
 * so no board moves.
 */
function nextSpokesFiring(
  b: SpokesBoard,
  s: SpokesScratch,
  copy: SpokesBoard | null,
  diff: number,
): SpokesFiring | null {
  return (
    findSaturation(b, s) ??
    findTwoOnes(b) ??
    findExhaustion(b, s) ??
    (diff >= DIFF_TRICKY && copy ? findContradiction(b, copy, s, DIFF_LIMITED) : null)
  );
}

/**
 * Replay the solver from the player's board, one firing at a time, returning
 * the ordered plan (design D1). Pure on its argument: it clones first. The
 * generator and {@link spokesSolve} are untouched, so the byte-match
 * differential is unaffected.
 *
 * The default is `DIFF_TRICKY`, not the top tier: the hint reasons as hard as it
 * is *allowed* to, and the rung above Tricky is a search
 * ({@link nextSpokesFiring}). Passing `DIFF_HARD` changes nothing.
 */
export function deduceSpokesPlan(
  board0: SpokesBoard,
  diff: number = DIFF_TRICKY,
): SpokesFiring[] {
  const b = cloneBoard(board0);
  const s = new SpokesScratch(b.w * b.h);
  const copy = diff >= DIFF_TRICKY ? cloneBoard(b) : null;

  return deduceHintPlan<SpokesBoard, SpokesFiring, SpokesStatus>({
    board: b,
    status: (board) => spokesValidate(board, s),
    incomplete: "incomplete",
    next: (board) => nextSpokesFiring(board, s, copy, diff),
    apply: applyFiring,
    planCap: HINT_PLAN_MAX,
  }).plan;
}

/**
 * Deduce as far as `diff` allows, mutating `b` in place, and report the
 * resulting status. `"valid"` means the board is fully and uniquely solved:
 * the generator accepts a clue set only while this holds.
 */
export function spokesSolve(
  b: SpokesBoard,
  scratch: SpokesScratch | null,
  diff: number,
): SpokesStatus {
  const s = scratch ?? new SpokesScratch(b.w * b.h);
  let total = 0;

  spokesSolverOnes(b);

  const copy = diff >= DIFF_TRICKY ? cloneBoard(b) : null;

  for (;;) {
    if (spokesValidate(b, s) !== "incomplete") break;
    if (diff === DIFF_LIMITED && total >= ACTION_LIMIT) break;

    let action = spokesSolverFull(b, s);
    if (action) {
      total += action;
      continue;
    }

    action = spokesSolverDiagonal(b);
    if (action) {
      total += action;
      continue;
    }

    if (diff < DIFF_TRICKY) break;
    // `copy` is non-null exactly when diff >= DIFF_TRICKY.
    if (copy && diff === DIFF_TRICKY && spokesSolverAttempt(b, copy, s, DIFF_LIMITED))
      continue;

    if (diff < DIFF_HARD) break;
    if (copy && spokesSolverAttempt(b, copy, s, DIFF_EASY)) continue;

    break;
  }

  return spokesValidate(b, s);
}
