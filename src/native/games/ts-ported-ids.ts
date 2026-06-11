/**
 * The puzzle IDs served by the native TS engine, as a plain data list.
 *
 * This is deliberately separate from the runtime registry
 * (`../engine/registry.ts`): the registry's source of truth is the set
 * of `registerGame(...)` side-effects in `./index.ts`, but importing
 * that barrel pulls every game's solver/generator/render into the
 * bundle — fine in the worker, wrong on the main thread. The home
 * screen only needs the *names* to badge migrated games, so it imports
 * this code-free list instead.
 *
 * `ts-ported-ids.test.ts` asserts this set equals the registry's, so
 * the two cannot drift: add a port here and in `./index.ts` together,
 * or the gate fails.
 */
export const TS_PORTED_PUZZLE_IDS: ReadonlySet<string> = new Set([
  "cube",
  "fifteen",
  "flip",
  "flood",
  "galaxies",
  "pegs",
  "sixteen",
  "twiddle",
]);

/** True iff `puzzleId` has a native-TS port (see {@link TS_PORTED_PUZZLE_IDS}). */
export function isTsPorted(puzzleId: string): boolean {
  return TS_PORTED_PUZZLE_IDS.has(puzzleId);
}
