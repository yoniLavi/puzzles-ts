import { beforeAll, describe, expect, it } from "vitest";
import { hasTsGame, registeredGameIds } from "./engine/registry.ts";
// Registers every native-TS game so `hasTsGame` is populated. `beforeAll`
// re-runs it because under `isolate: false` a sibling file (worker-adapter)
// may have reset the shared registry after this module's import-time run.
import { registerAllGames } from "./games/index.ts";
import { puzzleIds } from "./puzzle/catalog.ts";

beforeAll(registerAllGames);

/**
 * The catalog and the runtime registry are the two lists of games, and they
 * must be the same list.
 *
 * There used to be a third — `TS_PORTED_PUZZLE_IDS`, a hand-maintained set of
 * the games served by the native engine, which fed a "TS" badge on unported
 * games' neighbours. `retire-c-engine` removed both the badge and the last
 * unported game, at which point that set was necessarily the whole catalog:
 * a third list to keep in lockstep that could only ever say "all of them".
 * It is gone, and adding a game is now two edits (`catalog-data.ts` and
 * `index.ts`) with this test holding them together.
 */
describe("catalog and registry", () => {
  it("registers a game for every catalogued puzzle", () => {
    const missing = puzzleIds.filter((id) => !hasTsGame(id));
    expect(missing).toEqual([]);
  });

  it("catalogues every registered game", () => {
    const known = new Set(puzzleIds);
    const uncatalogued = registeredGameIds().filter((id) => !known.has(id));
    expect(uncatalogued).toEqual([]);
  });

  it("is not vacuous — the catalog is populated", () => {
    expect(puzzleIds.length).toBeGreaterThan(50);
  });
});
