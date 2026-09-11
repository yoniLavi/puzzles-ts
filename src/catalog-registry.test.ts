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
 * must be the same list. Adding a game is two edits (`catalog-data.ts` and
 * `index.ts`), and this test holds them together.
 */
describe("catalog and registry", () => {
  it("registers a game for every cataloged puzzle", () => {
    const missing = puzzleIds.filter((id) => !hasTsGame(id));
    expect(missing).toEqual([]);
  });

  it("catalogs every registered game", () => {
    const known = new Set(puzzleIds);
    const uncataloged = registeredGameIds().filter((id) => !known.has(id));
    expect(uncataloged).toEqual([]);
  });

  it("is not vacuous — the catalog is populated", () => {
    expect(puzzleIds.length).toBeGreaterThan(50);
  });
});
