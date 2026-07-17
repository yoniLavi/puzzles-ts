/**
 * Bounded "generate until it works" retries.
 *
 * WHY EVERY SUCH LOOP NEEDS A BOUND. Generators under `src/native/` are purely
 * synchronous, so a retry loop that never succeeds owns its thread outright:
 * `testTimeout` is a `setTimeout` on the blocked loop and cannot fire, and
 * vitest's pool shutdown is IPC-driven, so the worker never reads "exit"
 * either. Kill the parent and that worker reparents to init and spins a core
 * for ever (see `scripts/reap-orphaned-workers.sh`, which reaps the ones that
 * still escape). A bound turns "hangs the machine" into "throws in seconds" —
 * which is what the `repo-layout` determinism requirement asks for: a finite
 * iteration cap rather than probabilistic termination inside a timeout.
 *
 * WHY A CAP CANNOT MOVE A GENERATED BOARD. A faithful port converges in a
 * handful of attempts, so these bounds only fire on a porting divergence (or on
 * params that provably admit no puzzle — `net` 2xN wrapping, say, which
 * `validateParams` rejects up front). Exhaustion throws rather than returning a
 * fallback, so no seed that used to converge can quietly start producing a
 * different desc: byte-match with the C reference is untouched by construction.
 *
 * WHY A CAP IS NOT ALWAYS THE ANSWER. It converts a hang into a *crash* — right
 * for a divergence bug, wrong for a rare-but-legal seed a player might hit.
 * Where the algorithm already has a natural recovery path, prefer *recovering*
 * into it and let an outer `retryLimit` bound the recovery; `games/net`'s
 * `shuffle` reshuffles on a stalled tie rather than throwing, for exactly this
 * reason.
 *
 * WHY A GUARD RATHER THAN A `for…of` ITERATOR. An iterator would put the bound
 * in the loop header, but `for…of` is a loop TypeScript believes can *complete*,
 * so every generator that returns from inside its retry loop would need a
 * trailing unreachable `throw` to satisfy control-flow analysis. `for (;;)` and
 * `while (true)` are understood to never complete, and a guard also drops
 * straight into `do…while` and rejection-sampling loops without reshaping
 * control flow that is matched byte-for-byte against the C.
 */

/** The house default. Generous enough that a faithful port never reaches it. */
export const MAX_REGENERATE = 10_000;

/** Thrown when a retry loop exhausts its budget, so callers and tests can tell
 * "the generator gave up" from an ordinary bug. */
export class RetryLimitExceeded extends Error {
  constructor(
    readonly label: string,
    readonly max: number,
  ) {
    super(`${label}: gave up after ${max} attempts`);
    this.name = "RetryLimitExceeded";
  }
}

/**
 * Returns a guard to call once per attempt, at the top of a retry loop. It
 * throws {@link RetryLimitExceeded} when the budget is spent:
 *
 * ```ts
 * const attempt = retryLimit("tents: generation");
 * while (true) {
 *   attempt();
 *   …
 *   if (good) break;
 * }
 * ```
 *
 * One guard per loop; nested or sibling loops each take their own, so a label
 * names exactly one thing when it fires.
 *
 * @param label identifies the loop in the message (e.g. `"net: shuffle"`)
 * @param max   attempts to allow before throwing
 */
export function retryLimit(label: string, max: number = MAX_REGENERATE): () => void {
  let attempts = 0;
  return () => {
    if (++attempts > max) throw new RetryLimitExceeded(label, max);
  };
}
