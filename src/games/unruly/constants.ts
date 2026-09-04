/**
 * Unruly's vocabulary: cell values and difficulty levels.
 *
 * These live apart from `state.ts` for one structural reason. `state.ts` needs
 * the validators (`isComplete` asks whether the counts balance and no run is
 * illegal), and the validators live in `solver.ts` next to the `Scratch` counts
 * they are built on — while `solver.ts` needs this vocabulary. With the
 * constants in `state.ts` that was a genuine **runtime** import cycle
 * (`state → solver → state`, values in both directions), the only one in the
 * repository when `enforce-module-layering` measured it.
 *
 * Splitting the vocabulary out breaks it without moving any logic: `solver.ts`'s
 * remaining import from `state.ts` is types only, which `verbatimModuleSyntax`
 * erases, so no runtime edge closes the loop.
 */
import { tierNames } from "../../engine/difficulty.ts";

// --- cell values (upstream `enum { EMPTY, N_ONE, N_ZERO, BOGUS }`) -------
// BOGUS is solver-internal only (a temporary fill that doesn't perturb the
// running counts) and never appears in a real state; it lives in solver.ts.
export const EMPTY = 0;
export const ONE = 1;
export const ZERO = 2;
export type Cell = typeof EMPTY | typeof ONE | typeof ZERO;

// --- difficulty (upstream DIFFLIST: Trivial, Easy, Normal) ---------------
export const DIFF_TRIVIAL = 0;
export const DIFF_EASY = 1;
export const DIFF_NORMAL = 2;
export const DIFF_COUNT = 3;
// The `DIFF_*` identifiers above are upstream's **rung** labels and no longer
// match what a player reads: since `adopt-conventional-tier-names` the menu is
// positional (`DIFF_TRIVIAL` is the game's first tier, so it shows as "Easy").
// The rung names are kept because the solver and the differential are written
// in them; the tier names are the collection's, by position.
export const DIFF_NAMES: readonly string[] = tierNames(DIFF_COUNT);
export const DIFF_CHARS = "ten"; // ENCODE chars, indexed by difficulty
