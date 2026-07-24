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
 * - {@link spokesSolverAttempt} (Tricky/Hard) — bounded contradiction
 *   look-ahead: try a spoke both ways, and if one provably leads to an invalid
 *   board, commit the other.
 *
 * **The look-ahead is not a guessing tier.** It is exhaustive, deterministic
 * contradiction reasoning — it draws no randomness and every commit is forced
 * by a proof that the alternative is impossible, which is exactly how a human
 * argues "this line would isolate that group, so it must be marked". It
 * therefore satisfies the project's guess-free generation policy the way the
 * other collections' recursion tiers do.
 *
 * Validity is decided by counting lines/marks per hub, rejecting crossing
 * diagonals, and — over a `Dsf` of the line-connected hubs, plus a per-class
 * count of the lines still drawable out of it — rejecting a closed-off set
 * that can never reach the rest of the board.
 */

import { Dsf } from "../../engine/dsf.ts";
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
  spokesPlace,
} from "./state.ts";

/** Upstream's `STATUS_INVALID` / `STATUS_INCOMPLETE` / `STATUS_VALID`, as a
 * union rather than a magic `0/1/2`. */
export type SpokesStatus = "invalid" | "incomplete" | "valid";

/** How many deductions the bounded `DIFF_LIMITED` tier is allowed to make. */
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
