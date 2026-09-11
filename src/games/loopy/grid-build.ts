/**
 * Building a Loopy grid, including the recovery upstream does not have.
 *
 * **The degenerate-patch problem.** A small Penrose patch can come out
 * *empty*: the seed triangle lands outside the bounding box, so the trimming
 * BFS never runs and every face is discarded. Upstream then aborts inside
 * `dsf_new(0)` — reachable from its own Custom dialog, because `loopy.c`
 * accepts 3×3 for both Penrose variants. `grid.ts` raises
 * {@link GridTrimmedAwayError} instead, and this module decides what Loopy
 * does with it.
 *
 * **Catch it and retry with a fresh description, bounded; do not raise the
 * minimum sizes.** The failure is *per seed*, not per size — the same
 * `(type, w, h)` succeeds or fails depending on the draw — so raising the
 * minima would forbid sizes that work for most seeds, and would still not
 * prove some larger size can never fail. Retrying costs one extra draw on a bad
 * seed and nothing on the rest.
 *
 * - **It diverges from the C only where the C has no defined behavior**: C
 *   aborts on precisely the seeds we retry.
 * - **Determinism is preserved**: the retry draws from the same RNG stream, so a
 *   `params#seed` game ID still reproduces its board.
 * - **Exhaustion throws** `RetryLimitExceeded` rather than returning a fallback
 *   board: the bound exists to catch a generator that *never* succeeds, not to
 *   paper over one.
 *
 * The catch is on the *error*, not on the tiling, so it covers any aperiodic
 * generator that produces a degenerate patch, not only Penrose.
 *
 * One configuration never succeeds at all — Penrose kite/dart at width 3 — so
 * `validateParams` rejects it up front (`params.ts` has the measurement).
 */
import {
  type Grid,
  GridTrimmedAwayError,
  type GridType,
  gridNew,
  gridNewDesc,
} from "../../engine/grid/index.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";

/** A freshly described grid: the description that produced it (`null` for the
 * tilings that take none) alongside the built grid. */
export interface BuiltGrid {
  desc: string | null;
  grid: Grid;
}

/**
 * Attempts allowed before a degenerate patch is treated as an impossible
 * configuration rather than an unlucky draw. Surveying 200 descriptions per
 * configuration over all four aperiodic tilings (each type's minimum size up to
 * minimum + 5), the worst *generable* success rate was ~20% (Penrose rhombs at
 * 3×3), at which 100 attempts fail with probability ~2e-10 — while an
 * ungenerable configuration gives up in about 50 ms instead of the tens of
 * seconds the house default would take.
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
