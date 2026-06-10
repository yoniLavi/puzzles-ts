// Tier-3 persistence test (see the `repo-layout` spec): the quick-save
// DB round-trip, run in-process against fake-indexeddb — the gap
// `add-quick-save-check-save` deferred for lack of an IndexedDB harness.
// `resetDb` (and its `fake-indexeddb/auto` side effect) must be imported
// before `saved-games`/`db` so the global `indexedDB` is in place.

import { Signal } from "@lit-labs/signals";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Puzzle } from "../puzzle/puzzle.ts";
import type { PuzzleId } from "../puzzle/types.ts";
import { resetDb } from "../test-setup/indexeddb.ts";
import { savedGames } from "./saved-games.ts";

/**
 * The minimum of `Puzzle` that `saveToDB`/`loadFromDB` touch: an id,
 * status/gameId metadata, checkpoints, and a `saveGame`/`loadGame` pair
 * that round-trips an opaque byte buffer. `saveGame` snapshots the
 * current bytes; `loadGame` adopts them — so a quickSave→quickLoad pair
 * is observable as "the loaded puzzle now holds the saved bytes".
 */
function fakePuzzle(puzzleId: string, initialState: string) {
  let bytes = new TextEncoder().encode(initialState);
  const fake = {
    puzzleId,
    status: "ongoing" as const,
    currentGameId: `${puzzleId}:seed#desc`,
    checkpoints: [] as string[],
    async saveGame(): Promise<Uint8Array<ArrayBuffer>> {
      return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
    },
    async loadGame(data: Uint8Array): Promise<string | undefined> {
      bytes = new Uint8Array(data);
      return undefined;
    },
    get decodedState(): string {
      return new TextDecoder().decode(bytes);
    },
  };
  return fake as typeof fake & Puzzle;
}

/** Poll until `predicate()` holds or the budget elapses — liveQuery
 * emits asynchronously, so reactive assertions need a settle window. */
async function waitFor(predicate: () => boolean, ms = 500): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return predicate();
}

describe("saved-games: quick-save slot (fake-indexeddb)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("quickSave then quickLoad round-trips the saved bytes", async () => {
    const saver = fakePuzzle("galaxies", "STATE-A");
    await savedGames.quickSave(saver);

    // A fresh puzzle with different bytes; quickLoad must overwrite them.
    const loader = fakePuzzle("galaxies", "STATE-B");
    expect(loader.decodedState).toBe("STATE-B");
    const result = await savedGames.quickLoad(loader);
    expect(result.found).toBe(true);
    expect(result.error).toBeUndefined();
    expect(loader.decodedState).toBe("STATE-A");
  });

  it("quickLoad reports not-found when no slot exists", async () => {
    const loader = fakePuzzle("galaxies", "STATE-B");
    const result = await savedGames.quickLoad(loader);
    expect(result.found).toBe(false);
  });

  it("a second quickSave overwrites the single slot", async () => {
    const p = fakePuzzle("galaxies", "FIRST");
    await savedGames.quickSave(p);
    await p.loadGame(new TextEncoder().encode("SECOND"));
    await savedGames.quickSave(p);

    // Exactly one quick-save record for this puzzle, holding "SECOND".
    const loader = fakePuzzle("galaxies", "empty");
    await savedGames.quickLoad(loader);
    expect(loader.decodedState).toBe("SECOND");
  });

  it("quick-saves are isolated per puzzleId", async () => {
    await savedGames.quickSave(fakePuzzle("galaxies", "G"));
    await savedGames.quickSave(fakePuzzle("pegs", "P"));

    const g = fakePuzzle("galaxies", "x");
    const peg = fakePuzzle("pegs", "x");
    await savedGames.quickLoad(g);
    await savedGames.quickLoad(peg);
    expect(g.decodedState).toBe("G");
    expect(peg.decodedState).toBe("P");
  });

  it("removeAllQuickSaves clears every slot", async () => {
    await savedGames.quickSave(fakePuzzle("galaxies", "G"));
    await savedGames.quickSave(fakePuzzle("pegs", "P"));
    await savedGames.removeAllQuickSaves();

    expect((await savedGames.quickLoad(fakePuzzle("galaxies", "x"))).found).toBe(false);
    expect((await savedGames.quickLoad(fakePuzzle("pegs", "x"))).found).toBe(false);
  });

  it("the reactive hasQuickSave signal flips as the slot appears and clears", async () => {
    const id: PuzzleId = "galaxies";
    // The signal only subscribes its liveQuery while watched; attach a
    // no-op Watcher so `hasQuickSave` reflects the live DB during the test.
    const watcher = new Signal.subtle.Watcher(() => {});
    const sig = (
      savedGames as unknown as { _quickSavedPuzzles: Signal.State<Set<PuzzleId>> }
    )._quickSavedPuzzles;
    watcher.watch(sig);
    try {
      // Touch the getter once so the watched value is current.
      void savedGames.quickSavedPuzzles;
      await savedGames.quickSave(fakePuzzle(id, "G"));
      expect(await waitFor(() => savedGames.hasQuickSave(id))).toBe(true);

      await savedGames.removeAllQuickSaves();
      expect(await waitFor(() => !savedGames.hasQuickSave(id))).toBe(true);
    } finally {
      watcher.unwatch(sig);
    }
  });
});
