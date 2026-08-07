/**
 * Rome's validity check and its pure-deduction solver — port of
 * `rome_validate_game` and `rome_solve` (plus the eight deduction rules) in
 * `puzzles/unreleased/rome.c`.
 *
 * ## The validity check is the engine, not a postscript
 *
 * {@link validateGame} does three jobs at once, which is why every deduction
 * rule takes its output rather than recomputing anything:
 *
 * 1. It rebuilds the **arrow-connectivity forest** by merging each arrow with
 *    the square it points at, flagging an arrow that points off the grid
 *    (`FE_BOUNDS`) and one whose target is already in its own component
 *    (`FE_LOOPSTART` — that square necessarily sits on a directed cycle; see
 *    the note on the loop walk below).
 * 2. It accumulates, per outlined region, the **set of arrows already placed**
 *    there (`sets`), flagging repeats (`FE_DOUBLE`).
 * 3. On the display path it walks each goal's component to mark the squares
 *    that reach it (`FD_TOGOAL`) and paints every loop square (`FE_LOOP`).
 *
 * ## Guess-free at every tier
 *
 * There is no backtracking anywhere in this solver, at any difficulty: Easy,
 * Normal and Tricky differ only in *which* closed-form techniques are allowed
 * to run. Rome therefore satisfies the project's guess-free generation policy
 * with no "Unreasonable" tier to carve out.
 *
 * ## Why the rule order and the DSF root choice are byte-match surface
 *
 * The generator is solver-gated at every step — it keeps a blanked clue only
 * while this solver still finishes the board — so the published description
 * depends on this solver's verdict on every intermediate board. Two
 * consequences worth stating loudly:
 *
 * - The rules must fire in upstream's order, with upstream's tier gating.
 * - {@link nakedPairs} scans `for (k = c; …)` from the region's **canonical
 *   root read as an element**, which can genuinely skip region members whose
 *   index is below that root. `dsf_new_min` does *not* make `dsf_canonify`
 *   return the region's minimum (it adds a separate `min[]` array read only by
 *   `dsf_minimal`), so the root here is the ordinary union-by-size root — and
 *   the shared {@link Dsf} reproduces `dsf.c`'s tie-break exactly, which is
 *   what makes this quirk portable rather than a divergence.
 */
import { Dsf } from "../../engine/dsf.ts";
import {
  DESC_ERRORS,
  DIFF_NORMAL,
  DIFF_TRICKY,
  EMPTY,
  FD_TOGOAL,
  FE_BOUNDS,
  FE_DOUBLE,
  FE_LOOP,
  FE_LOOPSTART,
  FE_MASK,
  FM_ARROWMASK,
  FM_DOWN,
  FM_GOAL,
  FM_LEFT,
  FM_RIGHT,
  FM_UP,
  INVALID_GOALS,
  INVALID_REGIONS,
  type RomeBoard,
  type RomeParams,
  readDesc,
  STATUS_COMPLETE,
  STATUS_INCOMPLETE,
  STATUS_INVALID,
  VALID,
} from "./state.ts";

// --- validity check ---------------------------------------------------------

/** Reusable working buffers for {@link validateGame}, so the solver's fixpoint
 * loop allocates nothing per iteration (upstream reuses the forest and `sets`
 * but re-allocates `seterrs` each call — an unobservable inefficiency). */
export interface ValidateScratch {
  /** Arrow connectivity, reinitialised on every call. */
  dsf: Dsf;
  /** Arrows already placed, per region canonical root. */
  sets: Int32Array;
  /** Arrows placed more than once, per region canonical root. */
  seterrs: Int32Array;
}

export function newValidateScratch(cells: number): ValidateScratch {
  return {
    dsf: new Dsf(cells),
    sets: new Int32Array(cells),
    seterrs: new Int32Array(cells),
  };
}

/**
 * Upstream `rome_validate_game`. Recomputes every `FE_*` / `FD_TOGOAL` bit on
 * `board.grid` in place and returns `STATUS_COMPLETE` / `STATUS_INCOMPLETE` /
 * `STATUS_INVALID`.
 *
 * `fullErrors` is upstream's `fullerrors`: the display path (`newState`,
 * `executeMove`) passes `true` to additionally paint whole loops and mark the
 * squares that reach a goal; the solver passes `false`, needing only the
 * verdict, the forest and the per-region arrow sets.
 */
export function validateGame(
  board: RomeBoard,
  fullErrors: boolean,
  scratch?: ValidateScratch,
): number {
  const { w, h, grid, regions } = board;
  const s = w * h;
  const { dsf, sets, seterrs } = scratch ?? newValidateScratch(s);

  for (let i = 0; i < s; i++) grid[i] &= ~(FE_MASK | FD_TOGOAL);

  dsf.reinit();
  sets.fill(0);
  seterrs.fill(0);

  // Merge every arrow with the square it points at. An arrow whose target is
  // already in its own component closes a directed cycle, so flag it as the
  // loop's entry point and leave the components alone.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = grid[i];
      if (c & FM_UP) {
        if (y === 0) grid[i] |= FE_BOUNDS;
        else if (dsf.equivalent(i, i - w)) grid[i] |= FE_LOOPSTART;
        else dsf.merge(i, i - w);
      }
      if (c & FM_DOWN) {
        if (y === h - 1) grid[i] |= FE_BOUNDS;
        else if (dsf.equivalent(i, i + w)) grid[i] |= FE_LOOPSTART;
        else dsf.merge(i, i + w);
      }
      if (c & FM_LEFT) {
        if (x === 0) grid[i] |= FE_BOUNDS;
        else if (dsf.equivalent(i, i - 1)) grid[i] |= FE_LOOPSTART;
        else dsf.merge(i, i - 1);
      }
      if (c & FM_RIGHT) {
        if (x === w - 1) grid[i] |= FE_BOUNDS;
        else if (dsf.equivalent(i, i + 1)) grid[i] |= FE_LOOPSTART;
        else dsf.merge(i, i + 1);
      }
    }
  }

  if (fullErrors) markLoops(board);

  // Per-region arrow sets, and the arrows that appear twice in one region.
  for (let i = 0; i < s; i++) {
    if (grid[i] === EMPTY) continue;
    const c = regions.canonify(i);
    const arrow = grid[i] & FM_ARROWMASK;
    if (arrow & sets[c]) seterrs[c] |= arrow;
    else sets[c] |= arrow;
  }
  for (let i = 0; i < s; i++) {
    const c = regions.canonify(i);
    if (grid[i] & FM_ARROWMASK & seterrs[c]) grid[i] |= FE_DOUBLE;
  }

  if (fullErrors) {
    // Mark every square whose arrows lead to a goal. Upstream expresses this
    // as `dsf_minimal(dsf, x) == dsf_minimal(dsf, i)`, which is exactly a
    // same-component test (its scan from the class minimum is an
    // optimisation, not a semantic).
    for (let i = 0; i < s; i++) {
      if (!(grid[i] & FM_GOAL)) continue;
      for (let x = 0; x < s; x++) {
        if (dsf.equivalent(x, i)) grid[x] |= FD_TOGOAL;
      }
    }
  }

  let ret = STATUS_COMPLETE;
  for (let i = 0; i < s; i++) {
    if (grid[i] & FE_MASK) return STATUS_INVALID;
    if (grid[i] === EMPTY) ret = STATUS_INCOMPLETE;
  }
  return ret;
}

/**
 * Paint `FE_LOOP` on every square of every loop, walking each loop once from
 * its `FE_LOOPSTART` entry.
 *
 * The walk provably terminates. `FE_LOOPSTART` is set on `i` when `i`'s arrow
 * points at a square already in `i`'s component; since each square has at most
 * one outgoing arrow, every edge on the pre-existing path from `i` must be
 * directed *towards* `i`, so that path reads `j → … → i` and closing it with
 * `i → j` makes a directed cycle through `i`. Following arrows from `i`
 * therefore returns to `i`, which is itself a `FE_LOOPSTART`. The explicit
 * bound is a runaway guard for a port bug, not a real exit (docs/games/testing.md § "Seed-deterministic, never clock-gated":
 * bound non-termination where it can actually be caught).
 */
function markLoops(board: RomeBoard): void {
  const { w, h, grid } = board;
  const s = w * h;
  for (let i = 0; i < s; i++) {
    if (!(grid[i] & FE_LOOPSTART)) continue;
    let x = i % w;
    let y = (i / w) | 0;
    for (let steps = 0; ; steps++) {
      if (steps > s) throw new Error("rome: loop walk did not close");
      const j = y * w + x;
      grid[j] |= FE_LOOP;
      const c = grid[j];
      if (c & FM_UP) y--;
      else if (c & FM_DOWN) y++;
      else if (c & FM_LEFT) x--;
      else if (c & FM_RIGHT) x++;
      if (grid[y * w + x] & FE_LOOPSTART) break;
    }
  }
}

// --- desc validation --------------------------------------------------------

/**
 * Upstream `validate_desc`: decode, reject a description that is already
 * finished or already broken, then reject a region larger than the four
 * distinct arrows it could hold, or a goal outside a single-square region.
 * Lives here rather than beside the codec because its central assertion is a
 * validity verdict.
 */
export function validateDesc(p: RomeParams, desc: string): string | null {
  const { board, valid: decoded } = readDesc(p, desc);
  let valid = decoded;

  if (valid === VALID) {
    if (validateGame(board, true) !== STATUS_INCOMPLETE)
      return "Puzzle contains errors";
    const s = p.w * p.h;
    for (let i = 0; i < s; i++) {
      const size = board.regions.size(i);
      if (size > 4) valid = INVALID_REGIONS;
      if (board.grid[i] & FM_GOAL && size > 1) valid = INVALID_GOALS;
    }
  }

  return valid === VALID ? null : (DESC_ERRORS[valid] ?? "Invalid description");
}

// --- deduction rules --------------------------------------------------------

/** Ascending member lists per region canonical root. The region partition is
 * fixed for a whole solve, so {@link nakedPairs} builds this once instead of
 * rescanning the board — provably the same traversal, since both the `j` and
 * `k` scans are "region members in ascending index order" filtered by a lower
 * bound. */
function regionMembers(board: RomeBoard): Map<number, number[]> {
  const { regions } = board;
  const out = new Map<number, number[]>();
  for (let i = 0; i < board.grid.length; i++) {
    const c = regions.canonify(i);
    const list = out.get(c);
    if (list) list.push(i);
    else out.set(c, [i]);
  }
  return out;
}

/** EASY: a square with a single remaining candidate takes it. */
function solverSingle(board: RomeBoard): number {
  const { grid, marks } = board;
  let ret = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== EMPTY) continue;
    const m = marks[i];
    if (m === FM_UP || m === FM_DOWN || m === FM_LEFT || m === FM_RIGHT) {
      grid[i] = m;
      ret++;
    }
  }
  return ret;
}

/** EASY: an arrow already placed in a region is ruled out everywhere in it. */
function solverDoubles(board: RomeBoard, sets: Int32Array): number {
  const { marks, regions } = board;
  let ret = 0;
  for (let i = 0; i < marks.length; i++) {
    const prev = marks[i];
    marks[i] &= ~sets[regions.canonify(i)];
    if (prev !== marks[i]) ret++;
  }
  return ret;
}

/** EASY: a candidate that would point into the square's own arrow component
 * would close a loop, so it is impossible.
 *
 * The bounds guards are provably redundant — {@link romeSolve} clears the
 * border-illegal candidates before the fixpoint starts, so the off-grid
 * neighbour is never reached — but upstream relies on that silently and reads
 * out of bounds if it ever stops holding. */
function solverLoops(board: RomeBoard, dsf: Dsf): number {
  const { w, h, marks } = board;
  let ret = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (marks[i] & FM_UP && y > 0 && dsf.equivalent(i, i - w)) {
        marks[i] &= ~FM_UP;
        ret++;
      }
      if (marks[i] & FM_DOWN && y < h - 1 && dsf.equivalent(i, i + w)) {
        marks[i] &= ~FM_DOWN;
        ret++;
      }
      if (marks[i] & FM_LEFT && x > 0 && dsf.equivalent(i, i - 1)) {
        marks[i] &= ~FM_LEFT;
        ret++;
      }
      if (marks[i] & FM_RIGHT && x < w - 1 && dsf.equivalent(i, i + 1)) {
        marks[i] &= ~FM_RIGHT;
        ret++;
      }
    }
  }
  return ret;
}

/** NORMAL: in a four-square region — which must hold all four arrows — a
 * direction that only one square can still take belongs to that square. */
function find4Position(
  board: RomeBoard,
  singles: Int32Array,
  doubles: Int32Array,
): number {
  const { marks, regions } = board;
  const s = marks.length;
  singles.fill(0);
  doubles.fill(0);
  let ret = 0;

  for (let i = 0; i < s; i++) {
    if (regions.size(i) !== 4) continue;
    const c = regions.canonify(i);
    doubles[c] |= marks[i] & singles[c];
    singles[c] |= marks[i];
  }
  for (let i = 0; i < s; i++) {
    if (regions.size(i) !== 4) continue;
    const c = regions.canonify(i);
    const unique = singles[c] ^ doubles[c];
    const prev = marks[i];
    if (marks[i] & unique) marks[i] &= unique;
    if (prev !== marks[i]) ret++;
  }
  return ret;
}

/** NORMAL: two squares of a region sharing the same pair of candidates use
 * both of them up, so the pair is ruled out of the region's other squares. */
function nakedPairs(board: RomeBoard, members: Map<number, number[]>): number {
  const { marks, regions } = board;
  const s = marks.length;
  let ret = 0;

  for (let i = 0; i < s; i++) {
    if (regions.size(i) < 3) continue;
    const m = marks[i];
    const poss =
      (m & FM_UP ? 1 : 0) +
      (m & FM_DOWN ? 1 : 0) +
      (m & FM_LEFT ? 1 : 0) +
      (m & FM_RIGHT ? 1 : 0);
    if (poss !== 2) continue;

    const c = regions.canonify(i);
    const list = members.get(c) as number[];
    for (const j of list) {
      // Upstream scans `j` from `i + 1`, so the pair is found once, from its
      // lower member.
      if (j <= i || marks[j] !== marks[i]) continue;
      // Upstream scans `k` from the region's canonical root — the union-by-size
      // root, NOT its minimum — so a member below that root is genuinely
      // skipped. Reproduced verbatim: it changes which puzzles exist.
      for (const k of list) {
        if (k < c || k === i || k === j) continue;
        const prev = marks[k];
        marks[k] &= ~marks[i];
        if (marks[k] !== prev) ret++;
      }
    }
  }
  return ret;
}

/**
 * NORMAL: every square must eventually reach a goal, so at least one square
 * outside a goal's component has to point into it. When exactly one candidate
 * across the whole board could do that, it is forced.
 *
 * (Candidates from *inside* the component have already been struck by
 * {@link solverLoops}, which runs to exhaustion first — so every candidate
 * this sees genuinely grows the component.)
 */
function solverExpand(board: RomeBoard, dsf: Dsf): number {
  const { w, h, grid, marks } = board;
  let dir = EMPTY;
  let idx = -1;

  for (let i = 0; i < grid.length; i++) {
    if (!(grid[i] & FM_GOAL)) continue;
    const c = dsf.canonify(i);

    // Unrolled in upstream's order (right, left, down, up) — a candidate array
    // here would allocate once per square per goal on the generator hot path.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i1 = y * w + x;
        if (x < w - 1 && dsf.canonify(i1 + 1) === c && marks[i1] & FM_RIGHT) {
          if (dir !== EMPTY) return 0; // more than one option: nothing forced
          dir = FM_RIGHT;
          idx = i1;
        }
        if (x > 0 && dsf.canonify(i1 - 1) === c && marks[i1] & FM_LEFT) {
          if (dir !== EMPTY) return 0;
          dir = FM_LEFT;
          idx = i1;
        }
        if (y < h - 1 && dsf.canonify(i1 + w) === c && marks[i1] & FM_DOWN) {
          if (dir !== EMPTY) return 0;
          dir = FM_DOWN;
          idx = i1;
        }
        if (y > 0 && dsf.canonify(i1 - w) === c && marks[i1] & FM_UP) {
          if (dir !== EMPTY) return 0;
          dir = FM_UP;
          idx = i1;
        }
      }
    }
  }

  if (dir !== EMPTY) {
    marks[idx] = dir;
    return 1;
  }
  return 0;
}

/** TRICKY: a square whose only candidates are up/down cannot be pointed at by
 * an up or down arrow from the same region — the two would be the region's
 * single up and single down, and one of them would have to be spent twice.
 * Likewise for left/right.
 *
 * The neighbours are always in range: a square on the top row has had `FM_UP`
 * cleared, so its candidate set can never equal exactly `FM_UP|FM_DOWN`, and
 * symmetrically on the other three edges. */
function solverOpposites(board: RomeBoard): number {
  const { w, h, marks, regions } = board;
  let ret = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i1 = y * w + x;

      if (marks[i1] === (FM_UP | FM_DOWN)) {
        const c = regions.canonify(i1);
        const above = (y - 1) * w + x;
        if (marks[above] & FM_DOWN && regions.canonify(above) === c) {
          marks[above] &= ~FM_DOWN;
          ret++;
        }
        const below = (y + 1) * w + x;
        if (marks[below] & FM_UP && regions.canonify(below) === c) {
          marks[below] &= ~FM_UP;
          ret++;
        }
      }

      if (marks[i1] === (FM_LEFT | FM_RIGHT)) {
        const c = regions.canonify(i1);
        const left = i1 - 1;
        if (marks[left] & FM_RIGHT && regions.canonify(left) === c) {
          marks[left] &= ~FM_RIGHT;
          ret++;
        }
        const right = i1 + 1;
        if (marks[right] & FM_LEFT && regions.canonify(right) === c) {
          marks[right] &= ~FM_LEFT;
          ret++;
        }
      }
    }
  }
  return ret;
}

// --- the fixpoint -----------------------------------------------------------

/**
 * Solve `board` in place by pure deduction up to `maxdiff`, returning the
 * final `STATUS_*`. Upstream `rome_solve`.
 *
 * Termination: each firing either fills a square (strictly fewer empties) or
 * strikes at least one candidate (strictly fewer mark bits), so the measure
 * `5·cells` decreases every iteration. The explicit cap turns a porting
 * divergence into a loud throw instead of a hung worker.
 */
export function romeSolve(board: RomeBoard, maxdiff: number): number {
  const { w, h, grid, marks } = board;
  const s = w * h;
  const scratch = newValidateScratch(s);
  const { dsf, sets } = scratch;

  for (let i = 0; i < s; i++) {
    marks[i] = grid[i] === EMPTY ? FM_ARROWMASK : grid[i] & FM_ARROWMASK;
  }
  // Candidates that would point off the grid are impossible from the start.
  for (let x = 0; x < w; x++) {
    marks[x] &= ~FM_UP;
    marks[(h - 1) * w + x] &= ~FM_DOWN;
  }
  for (let y = 0; y < h; y++) {
    marks[y * w] &= ~FM_LEFT;
    marks[y * w + (w - 1)] &= ~FM_RIGHT;
  }

  const members = regionMembers(board);
  const singles = new Int32Array(s);
  const doubles = new Int32Array(s);
  const maxIterations = 5 * s + 16;
  let status = STATUS_INCOMPLETE;

  for (let iteration = 0; ; iteration++) {
    if (iteration > maxIterations) throw new Error("rome: solver did not converge");

    status = validateGame(board, false, scratch);
    if (status !== STATUS_INCOMPLETE) break;

    if (solverSingle(board)) continue;
    if (solverDoubles(board, sets)) continue;
    if (solverLoops(board, dsf)) continue;

    if (maxdiff < DIFF_NORMAL) break;

    if (find4Position(board, singles, doubles)) continue;
    if (nakedPairs(board, members)) continue;
    if (solverExpand(board, dsf)) continue;

    if (maxdiff < DIFF_TRICKY) break;

    if (solverOpposites(board)) continue;

    break;
  }

  return status;
}
