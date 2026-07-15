import { beforeAll, describe, expect, it } from "vitest";
import { puzzleIds } from "../../puzzle/catalog.ts";
import { hasTsGame } from "../engine/registry.ts";
import { TS_PORTED_PUZZLE_IDS, isTsPorted } from "./ts-ported-ids.ts";
// Registers every native-TS game so `hasTsGame` is populated. `beforeAll`
// re-runs it because under `isolate: false` a sibling file (worker-adapter)
// may have reset the shared registry after this module's import-time run.
import { registerAllGames } from "./index.ts";

beforeAll(registerAllGames);

describe("TS_PORTED_PUZZLE_IDS", () => {
  // The static list (consumed on the main thread, e.g. the home-screen
  // badge) must match the runtime registry exactly, in both directions,
  // or migrated games get mis-badged. Checking across the whole catalog
  // universe also catches a registered game missing from the list and a
  // listed game that was never registered.
  it("matches the runtime registry for every catalog puzzle", () => {
    for (const puzzleId of puzzleIds) {
      expect(isTsPorted(puzzleId), puzzleId).toBe(hasTsGame(puzzleId));
    }
  });

  it("lists only real catalog puzzles", () => {
    const known = new Set(puzzleIds);
    for (const id of TS_PORTED_PUZZLE_IDS) {
      expect(known.has(id), id).toBe(true);
    }
  });
});
