// @vitest-environment happy-dom
//
// Tier-3 persistence test (see the `repo-layout` spec): the settings store
// against `fake-indexeddb`, via the shared setup that also shims Dexie's IDB2
// array `maxKey`. happy-dom because the `Settings` singleton registers a
// `pageshow` listener in its constructor, so importing it needs a `window`.
import "../test-setup/indexeddb.ts";
import { describe, expect, it } from "vitest";
import { settings } from "./settings.ts";

describe("the last dealt board", () => {
  it("round-trips per puzzle, and is absent before anything is recorded", async () => {
    await settings.loaded;
    expect(await settings.getLastGameId("flip")).toBeUndefined();

    await settings.setLastGameId("flip", "4x4:1,2,3");
    await settings.setLastGameId("pegs", "7x7cross:abc");
    expect(await settings.getLastGameId("flip")).toBe("4x4:1,2,3");
    expect(await settings.getLastGameId("pegs")).toBe("7x7cross:abc");
  });

  it("clears the key on `undefined` rather than storing it", async () => {
    // The path a board this build can no longer deal takes: forgotten, not
    // recorded as absent.
    await settings.loaded;
    await settings.setLastGameId("galaxies", "7x7dn:stale");
    await settings.setLastGameId("galaxies", undefined);
    expect(await settings.getLastGameId("galaxies")).toBeUndefined();
  });

  it("leaves the puzzle's other settings alone", async () => {
    // `setLastGameId` rebuilds the whole `PuzzleSettings` blob, so the spread
    // has to carry everything it did not come to change.
    await settings.loaded;
    await settings.setParams("towers", "5x5dn");
    await settings.setLastGameId("towers", "5x5dn:board");
    expect(await settings.getParams("towers")).toBe("5x5dn");

    await settings.setLastGameId("towers", undefined);
    expect(await settings.getParams("towers")).toBe("5x5dn");
  });
});
