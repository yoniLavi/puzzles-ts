/**
 * The opt-in tier for tests that are **expensive and not load-bearing per
 * commit**.
 *
 * The pre-commit gate exists to say "this tree is not broken", and it is paid
 * for on every commit. A handful of tests cost more than half of it (three
 * Seismic 7×7 differential fixtures at 272 s, one Bricks 12×8 at 100 s) while
 * their configuration coverage — every mode × difficulty — is carried by the
 * smaller boards of the same family, so what the big ones add is board *size*
 * against the same code paths.
 *
 * **What this is not.** It is not "these tests are unimportant", and it must not
 * become "these tests never run". A skipped test nobody runs is worse than a
 * deleted one, because the file still reads as coverage. These run under
 * `npm run test:slow`, which belongs with `npm run metrics` and `npm run diff`
 * as a **once-per-refactoring-round** check — the point at which a solver's
 * verdict might actually have moved.
 *
 * ## Run it targeted; the whole tier is not the unit of use
 *
 * **`npm run test:slow` re-runs the entire gate suite as well**, *plus* the
 * deferred cases, *plus* the widened seed budgets below, which multiply the
 * heaviest files 3–7.5×. Measured 2026-09-09: the tier itself is **six deferred
 * tests** in three files, and everything else it costs is the gate being paid
 * again. So the bare command is the wrong instrument for almost every question,
 * and reaching for it is how a tier becomes one nobody invokes.
 *
 * **Pass a path.** The script forwards arguments to vitest, so the deferred
 * work for the thing you are actually changing is one command:
 *
 * ```sh
 * npm run test:slow -- src/games/seismic        # the deferred 7x7 fixtures
 * npm run test:slow -- src/engine/hint-resume.test.ts   # every preset, not the gate slice
 * npm run test:slow -- src/games/sixteen src/engine/hint-quality.test.ts
 * ```
 *
 * That is the form to use when a refactor touches a solver, a generator or a
 * hint planner: run the slow tier **for the games it could have moved**, at the
 * moment you moved them, rather than promising yourself a whole-tier run later.
 *
 * **What must never be marked slow:** the only fixture covering some
 * configuration. Deferring the largest board of a family whose every
 * mode/difficulty is checked elsewhere costs the gate nothing it was relying on;
 * deferring the only fixture for a grid type silently removes that grid type
 * from every commit. State the remaining coverage when you mark something.
 */
import { describe, it } from "vitest";

/** True when the run was asked for the expensive tier (`npm run test:slow`).
 *
 * Read off `globalThis` rather than `process.env` directly: the app's tsconfig
 * sets `"types": []` (no `@types/node` in the browser build's view), and this
 * module — dev-only though it is — lives under `src/`. */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env;
export const SLOW_TESTS_ENABLED = Boolean(env?.["PUZZLES_SLOW_TESTS"]);

/** `describe`, skipped unless the slow tier was asked for. */
export const describeSlow = describe.skipIf(!SLOW_TESTS_ENABLED);

/** `it`, skipped unless the slow tier was asked for. */
export const itSlow = it.skipIf(!SLOW_TESTS_ENABLED);

/**
 * Pick a work amount by tier: `full` when the slow tier is on, `gate` otherwise.
 * For a property test whose seed count is a *confidence dial* rather than a
 * correctness threshold — the gate scans enough boards to catch a systematic
 * violation, the slow tier scans enough to catch a rare one.
 *
 * Use this only where more boards genuinely means more confidence. A test that
 * needs a specific board to exist should find it deterministically, not by
 * scanning further (docs/games/testing.md § "The test tiers").
 */
export function seedBudget(gate: number, full: number): number {
  return SLOW_TESTS_ENABLED ? full : gate;
}
