/**
 * The guard on the *instrument*, for the six cross-game hint guards.
 *
 * `HINT_GAMES` used to be a hand-maintained array of thirty games, and
 * `derive-hint-enrollment` replaced it with a filter over the registry. That
 * removes the old failure — a game with a `hint()` left off the list, getting
 * zero of the six guards, silently — by construction rather than by assertion:
 * there is no list to forget to edit, so no test here can meaningfully "check
 * that games are enrolled". **Asserting the derivation against its own
 * definition would be a tautology**, the shape AGENTS.md calls out (a guard must
 * measure the thing it claims to guard, not restate it).
 *
 * What a derivation *can* fail at is finding nothing, or finding less. That is
 * the failure this file exists for, and it is the shape this repo has hit six
 * times (`grid.test.ts`'s `d.edges.length === d.order`, the touch sweep counting
 * the catalog while iterating the registry, the silently-empty
 * `import.meta.glob`, both halves of the help-link check).
 *
 * **Measured, not assumed** (`derive-hint-enrollment`). Breaking the derivation
 * so it matches nothing and running the six consuming guards: under a bare
 * `vitest run` they *error* with "No test found in suite", because each builds
 * its `it()` blocks in a loop over `HINT_GAMES` and an empty array leaves an
 * empty `describe`. That looks like adequate protection — and it is not the
 * configuration the gate uses. `npm run test:run` passes **`--passWithNoTests`**,
 * and under it all six report `Test Files passed / Tests: no tests` and the gate
 * goes green having checked no game at all. So the floors below are the only
 * thing standing between an empty derivation and a clean commit.
 */
import { describe, expect, it } from "vitest";
import { HINT_GAMES, REGISTERED_GAME_COUNT } from "./testing/hint-games.ts";

describe("the hint-guard enrolled set is derived, and non-vacuous", () => {
  it("drew from a fully populated registry", () => {
    // THE POPULATION, not the result. A filter can return a healthy-looking
    // count from a short population, so the floor goes here first. Deliberately
    // below the true count (57 when written): it separates "working" from
    // "enumerating nothing", and is not a ratchet a legitimate change must bump.
    expect(REGISTERED_GAME_COUNT).toBeGreaterThan(50);
  });

  it("enrolled the games that ship a hint, and did not come back empty", () => {
    // A floor at the count the hand-maintained list carried on the day it was
    // replaced. Adding a hint raises it and is fine; falling below it means a
    // game lost its hint or the derivation lost the game, and both deserve to
    // fail loudly rather than to quietly shrink six guards' coverage.
    expect(HINT_GAMES.length).toBeGreaterThanOrEqual(30);
    // …and strictly fewer than the whole registry, because the collection
    // deliberately keeps some games hintless for now (owner, 2026-09-04: they
    // are the corpus for assessing the framework work). An enrolled set equal to
    // the registry would mean the filter stopped filtering.
    expect(HINT_GAMES.length).toBeLessThan(REGISTERED_GAME_COUNT);
  });

  it("hands every guard a usable pair", () => {
    // Cheap, and it catches the one way the map above could be wrong without
    // being empty: an id that resolves to nothing.
    for (const [id, game] of HINT_GAMES) {
      expect(id, "a game id must be a non-empty string").toBeTruthy();
      expect(game, `${id}: registry returned no game`).toBeTruthy();
    }
  });

  it("is stably ordered, so a failing sweep is reproducible", () => {
    const ids = HINT_GAMES.map(([id]) => id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size, "a game enrolled twice").toBe(ids.length);
  });
});
