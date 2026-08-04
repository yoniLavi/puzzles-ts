/**
 * Mathrax generator — port of `new_game_desc` from `mathrax.c`.
 *
 * Three steps, and only three RNG draw sites (a `latinGenerate` and two
 * `shuffle`s), which is what makes the description byte-match portable over the
 * bit-identical `random.ts`:
 *
 * 1. generate a full Latin square;
 * 2. derive a *candidate clue* at every interior intersection from the four
 *    solution digits around it, under the enabled clue-type options;
 * 3. strip the grid givens, then the clues, each in shuffled order, keeping a
 *    removal while the puzzle still solves at the target difficulty.
 *
 * Step 3 is **solver-gated**, so the published description depends on the
 * solver's verdict on every intermediate board — which is exactly why a single
 * byte-match assertion validates the generator, the solver *and* the codec
 * together (playbook §4.3/§4.4).
 *
 * ## The one deliberate divergence: removals must keep the board *unique*
 *
 * (Owner-approved; playbook §4 rule 3, "diverge for a genuine player-visible
 * defect".) Both strip loops here keep a removal only while the board remains
 * **uniquely** solvable. Upstream instead tests `mathrax_solve`'s verdict for
 * bare truthiness — and that verdict is `2` for *ambiguous*, which is truthy —
 * so it keeps stripping past the point where the board still has one answer.
 *
 * Below `Recursive` no recursion runs, so the verdict can only be "stuck" or
 * "solved" and the two tests are **identical**: Easy / Normal / Tricky boards
 * are bit-for-bit upstream's and their byte-match differential is untouched. At
 * `Recursive` the difference is total — every sampled upstream board (30 of 30)
 * had more than one solution, which makes the whole tier ill-posed: Check & Save
 * can flag nothing (there is no unique answer to check against) and Solve may
 * show a different grid than the one the player legitimately finished on.
 *
 * The cost is the byte-match oracle on that tier alone. The frozen C
 * descriptions for it stay in the fixture and are checked the weaker,
 * order-independent way instead — the TS solver must reach C's recorded verdict
 * on them (playbook §4.8).
 */

import { latinGenerate } from "../../engine/latin.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { mathraxSolve, SOLVE_UNIQUE } from "./solver.ts";
import {
  CLUE_ADD,
  CLUE_DIV,
  CLUE_EVN,
  CLUE_MUL,
  CLUE_ODD,
  CLUE_SUB,
  DIFF_EASY,
  diffToLevel,
  encodeDesc,
  type MathraxParams,
  OPTION_ADD,
  OPTION_DIV,
  OPTION_EQL,
  OPTION_MUL,
  OPTION_ODD,
  OPTION_SUB,
  OPTIONSMASK,
  setClueNum,
} from "./state.ts";

/**
 * The clue an intersection would carry, given the four solution digits around it
 * — `(a1, b1)` the main diagonal and `(a2, b2)` the anti-diagonal, each pair
 * normalised so the larger comes first (upstream `mathrax_candidate_clue`).
 *
 * The **precedence cascade is load-bearing**: several clue types can describe
 * the same four digits, and which one wins lands in the description verbatim.
 * Two upstream details preserved deliberately:
 * - equality is emitted as `CLUE_SUB` with number 0, and is therefore only
 *   reachable *after* the subtraction arm has declined it (a zero difference
 *   fails its `> 0` test);
 * - the **even** clue is gated on `OPTION_ODD`, not an option of its own — the
 *   six option bits pair even and odd under one "Even/odd clues" setting.
 */
export function mathraxCandidateClue(
  a1: number,
  b1: number,
  a2: number,
  b2: number,
  options: number,
): number {
  if (a1 < b1) [a1, b1] = [b1, a1];
  if (a2 < b2) [a2, b2] = [b2, a2];

  if (options & OPTION_ADD && a1 + b1 === a2 + b2)
    return CLUE_ADD | setClueNum(a1 + b1);
  if (options & OPTION_SUB && a1 - b1 === a2 - b2 && a1 - b1 > 0)
    return CLUE_SUB | setClueNum(a1 - b1);
  if (options & OPTION_EQL && a1 === b1 && a2 === b2) return CLUE_SUB | setClueNum(0);
  if (options & OPTION_MUL && a1 * b1 === a2 * b2)
    return CLUE_MUL | setClueNum(a1 * b1);
  if (
    options & OPTION_DIV &&
    ((a1 / b1) | 0) === ((a2 / b2) | 0) &&
    a1 % b1 === 0 &&
    a2 % b2 === 0 &&
    ((a1 / b1) | 0) !== 1
  )
    return CLUE_DIV | setClueNum((a1 / b1) | 0);
  if (options & OPTION_ODD && a1 & b1 & a2 & b2 & 1) return CLUE_ODD;
  if (options & OPTION_ODD && !((a1 | b1 | a2 | b2) & 1)) return CLUE_EVN;

  return 0;
}

/**
 * Remove as many grid givens as the solver can still cope without, in shuffled
 * order (upstream `mathrax_strip_grid_clues`).
 *
 * **Deliberate divergence** — the keep-test is a *unique* solve, where upstream
 * tests the verdict for bare truthiness and so accepts an *ambiguous* one. See
 * the module header's divergence note.
 */
function stripGridClues(
  o: number,
  grid: Uint8Array,
  clues: Int32Array,
  diff: number,
  rs: RandomState,
): void {
  const o2 = o * o;
  const spaces: number[] = [];
  for (let i = 0; i < o2; i++) spaces.push(i);
  shuffle(spaces, rs);

  const backup = new Uint8Array(o2);
  for (let i = 0; i < o2; i++) {
    const j = spaces[i];
    if (grid[j] === 0) continue;

    backup.set(grid);
    grid[j] = 0;
    // `mathraxSolve` fills `grid` with a solution, hence the restore below.
    if (mathraxSolve(o, grid, clues, diff) === SOLVE_UNIQUE) backup[j] = 0;
    grid.set(backup);
  }
}

/** Remove as many intersection clues as the solver can still cope without, in
 * shuffled order (upstream `mathrax_strip_math_clues`); anything short of a
 * unique solve puts the clue back — see the module header's divergence note. */
function stripMathClues(
  o: number,
  grid: Uint8Array,
  clues: Int32Array,
  diff: number,
  rs: RandomState,
): void {
  const co = o - 1;
  const cs = co * co;
  const spaces: number[] = [];
  for (let i = 0; i < cs; i++) spaces.push(i);
  shuffle(spaces, rs);

  const backup = Uint8Array.from(grid);
  for (let i = 0; i < cs; i++) {
    const j = spaces[i];
    const clue = clues[j];
    if (clue === 0) continue;

    clues[j] = 0;
    if (mathraxSolve(o, grid, clues, diff) !== SOLVE_UNIQUE) clues[j] = clue;
    grid.set(backup);
  }
}

export interface MathraxGenerateOptions {
  /**
   * Reproduce upstream's difficulty gate, which does not exist.
   *
   * Upstream strips givens and clues while the board still solves at the target
   * tier and publishes whatever that leaves; it never asks whether an easier
   * tier would also have done, so the tier need not bind. Measured over this
   * game's own frozen C fixtures, 3 of the 23 boards above Easy fall to a lower
   * tier (at order 3, a Tricky board that Easy solves outright). The player
   * chose the tier, so {@link newMathraxDesc} rejects such a candidate and
   * generates another.
   *
   * Because generation is solver-gated at every removal, that changes every
   * description above Easy — which would cost the byte-match differential that
   * validates `latinGenerate`'s draw order, the tiered solver, the clue cascade
   * and the codec together. This flag keeps that oracle:
   * `mathrax-differential.test.ts` sets it, so the fixtures still match the C
   * byte-for-byte and the only lines the oracle no longer covers are the tier
   * check below. Nothing else should ever set it.
   *
   * Note this is the *second* divergence in this generator; the first (unique
   * rather than merely truthy removals, see the module header) already costs the
   * oracle on `Recursive` alone. The two are independent and compose: with this
   * flag set the loop always returns on its first pass, so the RNG is drawn in
   * exactly upstream's order.
   */
  readonly upstreamLooseGate?: boolean;
}

export function newMathraxDesc(
  p: MathraxParams,
  rs: RandomState,
  options: MathraxGenerateOptions = {},
): { desc: string } {
  const o = p.o;
  const co = o - 1;
  // An empty option set means "all" — the same fallback `decodeParams` applies.
  const clueOptions = p.options || OPTIONSMASK;
  const diff = diffToLevel(p.diff);
  const loose = options.upstreamLooseGate ?? false;

  // Upstream generates exactly once; the tier gate below can reject, so the
  // loop needs the house runaway guard (playbook §4.6).
  const attempt = retryLimit(`mathrax: generation (o${o} d${diff})`);
  for (;;) {
    attempt();

    const square = latinGenerate(o, rs);
    const grid = new Uint8Array(o * o);
    for (let i = 0; i < o * o; i++) grid[i] = square[i];

    const clues = new Int32Array(co * co);
    for (let y = 0; y < co; y++) {
      for (let x = 0; x < co; x++) {
        clues[y * co + x] = mathraxCandidateClue(
          grid[y * o + x], // top left
          grid[(y + 1) * o + x + 1], // bottom right
          grid[(y + 1) * o + x], // bottom left
          grid[y * o + x + 1], // top right
          clueOptions,
        );
      }
    }

    stripGridClues(o, grid, clues, diff, rs);
    stripMathClues(o, grid, clues, diff, rs);

    // The tier gate (the divergence): a board the tier below already solves
    // uniquely is not the difficulty the player asked for. `mathraxSolve` fills
    // the grid it is given, so the probe runs on a copy.
    if (!loose && diff > DIFF_EASY) {
      if (mathraxSolve(o, Uint8Array.from(grid), clues, diff - 1) === SOLVE_UNIQUE) {
        continue;
      }
    }

    return { desc: encodeDesc(o, grid, clues) };
  }
}
