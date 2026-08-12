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
 * (`solverTry`, the Easy tier) and, above it, recursive lookahead
 * (`solverRecurse`). Every placement is *proved* by contradiction, so nothing
 * here guesses — but the two rungs ask very different things of a player, and
 * `audit-guessing-tier-names` (design D9 + D11) split them:
 *
 * - `solverTry` places one colour, calls `bricksValidate` **once**, and rolls
 *   back. One glance; a *Check*, legal at any tier.
 * - `solverRecurse` places one colour and then **solves the rest of the board**
 *   from it at `maxdiff - 1`. That is a *Search*, and a search may only ship
 *   under a tier named `Unreasonable` — which is why upstream's `Normal` is
 *   called that here, and why {@link nextForcedMove} has no arm for it
 *   (`nextForcedMoveRecurse` was deleted with the narration).
 *
 * Generation gates uniqueness on this solver, so its exact deductive power is
 * byte-match surface: keep every quirk verbatim.
 *
 * **Divergence (`grade-difficulty-tiers-honestly`, replacing port design D3):**
 * upstream's min-difficulty gate probes at *Easy* whatever tier was requested,
 * so it can only ever reject an Easy board. The port used to preserve that as an
 * intended quirk, on upstream's own admission that "Tricky may yield a
 * Normal-difficulty board". Measurement retired the quirk: *may* is always —
 * 999 of 999 boards generated at Tricky solve at Normal, as do all four frozen
 * C Tricky fixtures, and across 480 boards from a real stripping walk the
 * depth-1 and depth-2 solvers never once disagreed. So the generator now gates
 * on the tier genuinely below the one requested, and Tricky is not offered at
 * all (`MAX_GENERABLE_DIFF` in `state.ts` carries the full measurement).
 *
 * `DIFF_TRICKY` survives *here*, in the solver, as "try as hard as you can" for
 * hints, `solve` and mistake-checking, where the extra depth costs nothing and
 * asks no question about which puzzles exist.
 */
import { deduceHintPlan } from "../../engine/hint-plan.ts";
import {
  BRICKS_STEPS,
  type BricksMistake,
  type BricksState,
  type CellColour,
  COL_MASK,
  colourBits,
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

// --- hint deduction (a recording projection of the same solver) -------------

/**
 * Why the opposite colour is impossible at a forced cell. The first five are
 * single-cell (Easy-tier) contradictions read straight off the rejected
 * trial's `FE_*` flags; `chain` is the recursive-lookahead tier (assuming a
 * colour leads, through forced consequences, to a contradiction). All cell
 * fields are padded-grid indices.
 */
export type BricksReason =
  | { kind: "three"; cells: number[] } // shading the target makes 3 shaded in a row
  | { kind: "unsupported"; below: number[] } // the shaded target would rest on nothing
  | { kind: "overcount"; clue: number } // shading the target over-fills this clue
  | { kind: "strandSupport"; above: number } // clearing the target strands this shaded brick
  | { kind: "undercount"; clue: number } // clearing the target makes this clue unreachable
  | { kind: "localBreak"; conflict: number[] }; // direct trial, contradiction unclassified

export interface ForcedMove {
  index: number;
  to: CellColour;
  reason: BricksReason;
}

const isClue = (v: number): boolean => !(v & COL_MASK) && !(v & F_BOUND);

function errorCells(errors: Uint16Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < errors.length; i++) if (errors[i] !== 0) out.push(i);
  return out;
}

/** The maximal run of consecutive shaded cells in the target's row that
 * contains it (≥ 3 when the target's shading created a three-in-a-row). */
function shadeRun(grid: Uint16Array, w: number, target: number): number[] {
  const y = (target / w) | 0;
  const x0 = target % w;
  let lo = x0;
  let hi = x0;
  while (lo - 1 >= 0 && (grid[y * w + lo - 1] & COL_MASK) === F_SHADE) lo--;
  while (hi + 1 < w && (grid[y * w + hi + 1] & COL_MASK) === F_SHADE) hi++;
  const cells: number[] = [];
  for (let x = lo; x <= hi; x++) cells.push(y * w + x);
  return cells;
}

/** Classify why shading `target` (already set in `grid`) is impossible. */
function classifyShadeTrial(
  grid: Uint16Array,
  errors: Uint16Array,
  w: number,
  h: number,
  target: number,
): BricksReason {
  const x = target % w;
  const y = (target / w) | 0;
  if (errors[target] & (FE_LINE_LEFT | FE_LINE_RIGHT))
    return { kind: "three", cells: shadeRun(grid, w, target) };
  if (errors[target] & FE_ERROR) {
    // Gravity: the shaded target has no shaded brick beneath it.
    const below: number[] = [];
    if (x > 0 && y < h - 1 && !(grid[(y + 1) * w + x - 1] & F_BOUND))
      below.push((y + 1) * w + x - 1);
    if (y < h - 1 && !(grid[(y + 1) * w + x] & F_BOUND)) below.push((y + 1) * w + x);
    return { kind: "unsupported", below };
  }
  for (const [dx, dy] of BRICKS_STEPS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const j = ny * w + nx;
    if (errors[j] & FE_ERROR && isClue(grid[j])) return { kind: "overcount", clue: j };
  }
  return { kind: "localBreak", conflict: errorCells(errors) };
}

/** Classify why clearing `target` (already set F_UNSHADE in `grid`) is impossible. */
function classifyUnshadeTrial(
  grid: Uint16Array,
  errors: Uint16Array,
  w: number,
  h: number,
  target: number,
): BricksReason {
  const x = target % w;
  const y = (target / w) | 0;
  // The target supports the shaded bricks at (x, y-1) and (x+1, y-1).
  const above: number[] = [];
  if (y > 0) above.push((y - 1) * w + x);
  if (y > 0 && x < w - 1) above.push((y - 1) * w + x + 1);
  for (const a of above) {
    if (errors[a] & FE_ERROR && (grid[a] & COL_MASK) === F_SHADE)
      return { kind: "strandSupport", above: a };
  }
  for (const [dx, dy] of BRICKS_STEPS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const j = ny * w + nx;
    if (errors[j] & FE_ERROR && isClue(grid[j])) return { kind: "undercount", clue: j };
  }
  return { kind: "localBreak", conflict: errorCells(errors) };
}

/**
 * The next single-cell (Easy-tier) forced move with its reason — the recording
 * twin of {@link solverTry}. For the first empty cell where one colour makes
 * the board INVALID, the cell is forced the other way; the reason is read from
 * the rejected trial's error flags. Scans in cell order (recompute-stable).
 */
export function nextForcedMove(
  grid: Uint16Array,
  w: number,
  h: number,
): ForcedMove | null {
  const s = w * h;
  const errors = new Uint16Array(s);
  for (let i = 0; i < s; i++) {
    if ((grid[i] & COL_MASK) !== F_EMPTY) continue;
    grid[i] = F_UNSHADE;
    if (bricksValidate(grid, w, h, false, errors) === "invalid") {
      const reason = classifyUnshadeTrial(grid, errors, w, h, i);
      grid[i] = F_EMPTY;
      return { index: i, to: "shade", reason };
    }
    grid[i] = F_SHADE;
    if (bricksValidate(grid, w, h, false, errors) === "invalid") {
      const reason = classifyShadeTrial(grid, errors, w, h, i);
      grid[i] = F_EMPTY;
      return { index: i, to: "unshade", reason };
    }
    grid[i] = F_EMPTY;
  }
  return null;
}

/** Runaway/UX cap on plan length — the player rarely follows more than a few
 * before diverging, and a recompute yields the next batch (design D1). */
export const HINT_PLAN_MAX = 40;

/**
 * The ordered plan of forced moves from `grid0` (the player's board): one cell
 * per step, Easy-tier preferred, the recursive rung only at a stall, each with
 * its reason. Deterministic, so it is recompute-stable. Caller guarantees the
 * board is consistent with the unique solution, so every move is correct.
 */
// No `maxdiff` parameter any more: it existed only to gate the recursive rung,
// which the hint no longer runs, and neither caller ever passed one.
export function deduceBricksPlan(
  grid0: Uint16Array,
  w: number,
  h: number,
): ForcedMove[] {
  return deduceHintPlan<Uint16Array, ForcedMove, BricksStatus>({
    board: grid0.slice(),
    status: (grid) => bricksValidate(grid, w, h, true),
    incomplete: "unfinished",
    // **Single-cell refutations only** (`audit-guessing-tier-names`, design
    // D4/D8). `nextForcedMoveRecurse` assumes a colour and *solves the rest of
    // the board* from it — a multi-step search with backtracking, which the
    // collection classes as non-deductive and never lets a hint present as a
    // technique. Where it would have fired the plan ends and `hint` refuses.
    //
    // `solveGame` keeps the rung, so no board changed and the byte-match
    // differential is untouched. Bricks' *tier* naming is the part still open:
    // the trial gates its `Normal` tier, which by the rule should not be able to
    // require it — see the change's task 2c.3, which needs a design pass
    // because `Tricky` sits declared-but-ungenerable above it.
    next: (grid) => nextForcedMove(grid, w, h),
    apply: (grid, move) => {
      grid[move.index] = colourBits(move.to);
    },
    planCap: HINT_PLAN_MAX,
  }).plan;
}
