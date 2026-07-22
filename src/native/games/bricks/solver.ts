/**
 * Bricks solver + validator — port of `bricks_validate_*`, `bricks_validate`,
 * `bricks_solver_try`, `bricks_solver_recurse` and `bricks_solve_game` in
 * `puzzles/unreleased/bricks.c`.
 *
 * `bricksValidate` is both the rule checker and the deduction oracle: it runs
 * three independent checks over a grid and returns COMPLETE / UNFINISHED /
 * INVALID, optionally localising each violation into a per-cell `FE_*` flag
 * array (upstream ORs those bits into the grid itself; kept separate here so
 * the solver never pollutes the board it is probing). The three checks:
 *
 *  - **threes** — three consecutive `F_SHADE` in a row is INVALID;
 *  - **gravity** — a shaded cell whose two supporters below are both
 *    walls/unshaded/numbers/out-of-bounds is INVALID; merely still-empty is
 *    UNFINISHED (rule 1: every shaded cell needs a shaded cell below it);
 *  - **counts** — a clue whose shaded-neighbour count exceeds it, or whose
 *    still-possible neighbours can no longer reach it, is INVALID; fewer so
 *    far is UNFINISHED.
 *
 * The solver drives these to a fixpoint by single-cell contradiction
 * (`solverTry`, the Easy tier) and, for Normal/Tricky, bounded recursive
 * lookahead (`solverRecurse`). All tiers are pure deduction — every placement
 * is *proved* by contradiction — so bricks is guess-free (there is no
 * "Unreasonable" tier). Generation gates uniqueness on this solver, so its
 * exact deductive power is byte-match surface: keep every quirk verbatim.
 *
 * **Preserved upstream quirk (design D3):** the generator's min-difficulty
 * gate rejects only puzzles the *Easy* solver completes; it does not
 * guarantee the puzzle strictly requires the selected tier, so "Tricky may
 * yield a Normal-difficulty board" is intended, not a defect.
 */
import {
  BRICKS_STEPS,
  type BricksMistake,
  type BricksState,
  COL_MASK,
  F_BOUND,
  F_EMPTY,
  F_SHADE,
  F_UNSHADE,
  FE_ERROR,
  FE_LINE_LEFT,
  FE_LINE_RIGHT,
  FE_TOPLEFT,
  FE_TOPRIGHT,
  NUM_MASK,
} from "./state.ts";

export type BricksStatus = "complete" | "unfinished" | "invalid";

// Rank so `max` is a plain numeric comparison (upstream STATUS_* ints).
const RANK = { complete: 0, unfinished: 1, invalid: 2 } as const;
const worse = (a: BricksStatus, b: BricksStatus): BricksStatus =>
  RANK[a] >= RANK[b] ? a : b;

function validateThrees(
  w: number,
  h: number,
  grid: Uint16Array,
  errors: Uint16Array | null,
): BricksStatus {
  let ret: BricksStatus = "complete";
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i1 = y * w + x - 1;
      const i2 = y * w + x;
      const i3 = y * w + x + 1;
      if (
        (grid[i1] & COL_MASK) === F_SHADE &&
        (grid[i2] & COL_MASK) === F_SHADE &&
        (grid[i3] & COL_MASK) === F_SHADE
      ) {
        ret = "invalid";
        if (errors) {
          errors[i1] |= FE_LINE_LEFT;
          errors[i2] |= FE_LINE_LEFT | FE_LINE_RIGHT;
          errors[i3] |= FE_LINE_RIGHT;
        }
      }
    }
  }
  return ret;
}

function validateGravity(
  w: number,
  h: number,
  grid: Uint16Array,
  errors: Uint16Array | null,
): BricksStatus {
  let ret: BricksStatus = "complete";
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i1 = y * w + x;
      if ((grid[i1] & COL_MASK) !== F_SHADE) continue;

      const i2 = (y + 1) * w + x - 1;
      const i3 = (y + 1) * w + x;

      let n2 = x === 0 ? F_BOUND : grid[i2];
      if (!(n2 & F_BOUND)) n2 &= COL_MASK;
      let n3 = grid[i3];
      if (!(n3 & F_BOUND)) n3 &= COL_MASK;

      if (n2 !== F_SHADE && n3 !== F_SHADE) ret = worse("unfinished", ret);

      const w2 = !n2 || n2 === F_UNSHADE || n2 === F_BOUND;
      const w3 = !n3 || n3 === F_UNSHADE || n3 === F_BOUND;

      if (w2 && w3) {
        ret = "invalid";
        if (errors) {
          errors[i1] |= FE_ERROR;
          if (n2 !== F_BOUND) errors[i2] |= FE_TOPRIGHT;
          if (n3 !== F_BOUND) errors[i3] |= FE_TOPLEFT;
        }
      }
    }
  }
  return ret;
}

function validateCounts(
  w: number,
  h: number,
  grid: Uint16Array,
  errors: Uint16Array | null,
): BricksStatus {
  let ret: BricksStatus = "complete";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = grid[y * w + x];
      if (n & COL_MASK || n & F_BOUND) continue;
      n &= NUM_MASK;
      if (n === 7) continue;

      let shade = 0;
      let unshade = 0;
      for (const [dx, dy] of BRICKS_STEPS) {
        const x2 = x + dx;
        const y2 = y + dy;
        if (x2 < 0 || x2 >= w || y2 < 0 || y2 >= h) {
          unshade++;
        } else {
          const n2 = grid[y2 * w + x2];
          if (n2 & COL_MASK) {
            const c = n2 & COL_MASK;
            if (c === F_SHADE) shade++;
            else if (c === F_UNSHADE) unshade++;
          } else {
            unshade++;
          }
        }
      }

      if (shade < n) ret = worse(ret, "unfinished");
      if (shade > n || 6 - unshade < n) {
        ret = "invalid";
        if (errors) errors[y * w + x] |= FE_ERROR;
      }
    }
  }
  return ret;
}

/**
 * The full validity pass (upstream `bricks_validate`). Returns COMPLETE /
 * UNFINISHED / INVALID; when `errors` is given it is cleared and each
 * violation's localised `FE_*` flags are ORed in. `strict` additionally
 * downgrades a rule-clean board to UNFINISHED while any `F_EMPTY` cell
 * remains.
 */
export function bricksValidate(
  grid: Uint16Array,
  w: number,
  h: number,
  strict: boolean,
  errors?: Uint16Array | null,
): BricksStatus {
  if (errors) errors.fill(0);
  let ret: BricksStatus = "complete";
  ret = worse(validateThrees(w, h, grid, errors ?? null), ret);
  ret = worse(validateGravity(w, h, grid, errors ?? null), ret);
  ret = worse(validateCounts(w, h, grid, errors ?? null), ret);

  if (strict) {
    const s = w * h;
    for (let i = 0; i < s; i++) {
      if ((grid[i] & COL_MASK) === F_EMPTY) return "unfinished";
    }
  }
  return ret;
}

/**
 * One Easy pass (upstream `bricks_solver_try`): for each `F_EMPTY` cell, if
 * tentatively unshading (then shading) makes the board INVALID, commit the
 * opposite colour. Returns the number of cells forced this pass.
 */
function solverTry(grid: Uint16Array, w: number, h: number): number {
  const s = w * h;
  let ret = 0;
  for (let i = 0; i < s; i++) {
    if ((grid[i] & COL_MASK) !== F_EMPTY) continue;
    for (let d = 0; d <= 1; d++) {
      grid[i] = d ? F_SHADE : F_UNSHADE;
      if (bricksValidate(grid, w, h, false) === "invalid") {
        grid[i] = d ? F_UNSHADE : F_SHADE;
        ret++;
        break;
      }
      grid[i] = F_EMPTY;
    }
  }
  return ret;
}

/**
 * One recursive-lookahead pass (upstream `bricks_solver_recurse`): for each
 * `F_EMPTY` cell, if committing one colour and solving the rest at
 * `maxdiff - 1` reaches INVALID, the cell must be the opposite colour.
 */
function solverRecurse(
  grid: Uint16Array,
  w: number,
  h: number,
  maxdiff: number,
): number {
  const s = w * h;
  let ret = 0;
  for (let i = 0; i < s; i++) {
    if ((grid[i] & COL_MASK) !== F_EMPTY) continue;
    for (let d = 0; d <= 1; d++) {
      const saved = grid.slice();
      grid[i] = d ? F_SHADE : F_UNSHADE;
      const sub = solveGame(grid, w, h, maxdiff - 1, false, false);
      grid.set(saved);
      if (sub === "invalid") {
        grid[i] = d ? F_UNSHADE : F_SHADE;
        ret++;
        break;
      }
    }
  }
  return ret;
}

/**
 * Drive the deduction to a fixpoint (upstream `bricks_solve_game`). Mutates
 * `grid`; returns the final verdict — COMPLETE exactly when the deduction
 * alone solves the board. `clear` first blanks every coloured cell to
 * `F_EMPTY`; `strict` is threaded to the validator. The loop is structurally
 * bounded: every non-breaking pass fills at least one empty cell.
 */
export function solveGame(
  grid: Uint16Array,
  w: number,
  h: number,
  maxdiff: number,
  clear: boolean,
  strict: boolean,
): BricksStatus {
  const s = w * h;
  if (clear) {
    for (let i = 0; i < s; i++) {
      if (grid[i] & COL_MASK) grid[i] = F_EMPTY;
    }
  }

  let ret = bricksValidate(grid, w, h, strict);
  while (ret === "unfinished") {
    if (solverTry(grid, w, h)) {
      ret = bricksValidate(grid, w, h, strict);
      continue;
    }
    if (maxdiff < 1 /* DIFF_NORMAL */) break;
    if (solverRecurse(grid, w, h, maxdiff)) {
      ret = bricksValidate(grid, w, h, strict);
      continue;
    }
    break;
  }
  return ret;
}

// --- play-facing helpers ----------------------------------------------------

/**
 * The cells currently violating a rule, with their localised flags (design
 * D7). Bricks' violations are intrinsic to the current grid — the rule
 * validator localises every one — so findMistakes runs the same validity
 * pass rather than re-solving. Check & Save hard-blocks on a non-empty
 * result and the render overlay reuses the flags.
 */
export function findMistakes(state: BricksState): BricksMistake[] {
  const { grid, w, h } = state;
  const errors = new Uint16Array(w * h);
  bricksValidate(grid, w, h, false, errors);
  const out: BricksMistake[] = [];
  for (let i = 0; i < errors.length; i++) {
    if (errors[i] !== 0) out.push({ index: i, flags: errors[i] });
  }
  return out;
}
