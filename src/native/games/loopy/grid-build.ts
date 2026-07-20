/**
 * Building a Loopy grid, including the recovery upstream does not have.
 *
 * **The degenerate-patch problem.** A small Penrose patch can come out
 * *empty*: the seed triangle lands outside the bounding box, so the trimming
 * BFS never runs and every face is discarded. Upstream then aborts inside
 * `dsf_new(0)` — and this is reachable from Loopy's own Custom dialog, because
 * `loopy.c` accepts 3×3 for both Penrose variants. `grid.ts` raises
 * {@link GridTrimmedAwayError} rather than aborting, and this module decides
 * what Loopy does with it.
 *
 * **Decision (change design D1): catch it and retry with a fresh description,
 * bounded by `retryLimit`. Do not raise the minimum sizes.** The failure is
 * *per seed*, not per size — the same `(type, w, h)` succeeds or fails
 * depending on the draw — so raising the minima would forbid sizes that work
 * for the great majority of seeds, and would still not prove some larger size
 * can never fail. Retrying costs one extra draw on the rare bad seed and
 * nothing on the rest.
 *
 * Three properties worth being explicit about:
 *
 * - **It diverges from the C only where the C has no defined behaviour.** C
 *   aborts on precisely the seeds we retry, so byte-agreement is preserved on
 *   every input where the C produces any output at all.
 * - **Determinism is preserved.** The retry draws from the same RNG stream, so
 *   a given seed yields the same sequence of attempts every run, and a
 *   `params#seed` game ID still reproduces its board.
 * - **Exhaustion throws.** The bound exists to catch a porting divergence (a
 *   generator that *never* succeeds), not to paper over one — so it raises
 *   `RetryLimitExceeded` rather than returning a fallback board, and no seed
 *   that used to converge can quietly start producing a different desc.
 *
 * The catch is on the *error*, not on the tiling: any aperiodic generator
 * could in principle produce a degenerate patch, and a "is this Penrose?"
 * predicate would need revisiting the first time one did.
 *
 * **A measurement that refined the original decision.** D1 assumed every
 * degenerate patch is seed-dependent. Surveying 200 descriptions per
 * configuration across all four aperiodic tilings (sizes from each type's
 * minimum up to minimum + 5) found that almost true — success rates run from
 * ~20% to ~98% and retrying always converges — with exactly one exception:
 * **Penrose kite/dart at width 3 never succeeds, at any height** (0/200 for
 * each of 3×3 … 3×8). Note it is specifically the *width*: 4×3 … 8×3 succeed
 * roughly half the time. Retrying cannot rescue an impossible configuration, so
 * that one is rejected up front by `validateParams` instead (see
 * `params.ts`), and the bound here is deliberately small so that any *other*
 * impossible configuration fails in milliseconds with a clear error rather than
 * after the house default of 10,000 attempts.
 */
import {
  type Grid,
  GridTrimmedAwayError,
  type GridType,
  gridNew,
  gridNewDesc,
} from "../../engine/grid.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import type { RandomState } from "../../random/index.ts";

/** A freshly described grid: the description that produced it (`null` for the
 * tilings that take none) alongside the built grid. */
export interface BuiltGrid {
  desc: string | null;
  grid: Grid;
}

/**
 * Attempts allowed before a degenerate patch is treated as an impossible
 * configuration rather than an unlucky draw. The worst *generable* success rate
 * measured was ~20% (Penrose rhombs at 3×3), at which 100 attempts fail with
 * probability ~2e-10 — while an ungenerable configuration gives up in about
 * 50 ms instead of the tens of seconds the house default would take.
 */
const MAX_GRID_ATTEMPTS = 100;

/**
 * Draw a fresh grid description and build the grid, retrying on a degenerate
 * patch. See the module doc for why the recovery is here and why it is bounded.
 */
export function buildLoopyGrid(
  type: GridType,
  w: number,
  h: number,
  rng: RandomState,
): BuiltGrid {
  const attempt = retryLimit("loopy: grid construction", MAX_GRID_ATTEMPTS);
  for (;;) {
    attempt();
    const desc = gridNewDesc(type, w, h, rng);
    try {
      return { desc, grid: gridNew(type, w, h, desc) };
    } catch (e) {
      if (e instanceof GridTrimmedAwayError) continue;
      throw e;
    }
  }
}
