/*
 * **A game that finds mistakes should have a test that *paints* them.**
 *
 * Nineteen of the thirty-nine games offering `findMistakes` test it as a
 * function — "does it flag the right cells" — and never render the overlay it
 * exists to drive. `promote-the-thick-rect-outline` measured what that costs:
 * with one shared helper wired into eight games' error frames, deleting a whole
 * side of the frame failed **one** test in the collection. The detection is
 * covered; the drawing is not.
 *
 * This does not close the gap — closing it means writing a mistake frame per
 * game, which is per-game work because reaching a mistaken board is per-game
 * (solve, find a free cell, place the opposite value; the move type is the
 * game's own). What it does is make the gap **visible and non-growing**: the
 * population is derived, the covered set is derived, and the shortfall is a
 * ledger asserted to be exactly the difference. A new game that offers
 * `findMistakes` without an overlay test fails here, and every entry deleted
 * from the ledger is a game whose Check-&-Save feedback someone has actually
 * seen drawn.
 *
 * That is the `NO_KEYBOARD` shape (`docs/games/testing.md` § "How a cross-game
 * guard finds its population"), and the reason it is a ledger rather than a
 * skip: a roster nothing derives rots silently, and this one cannot — it is
 * checked against the derivation on every run.
 *
 * ON THE KEYS. The population comes from the **capability set** (the optional
 * `Game` members a game actually carries), not from a grep for `findMistakes`,
 * because four games spelled that member's function differently until
 * 2026-09-06. Coverage keys on `showMistakes`, which is not a name a game
 * chose: it is `renderScenario`'s flag, i.e. *the* mechanism for driving a
 * mistake frame.
 *
 * **What this deliberately does not measure**, learned by getting it wrong:
 * whether a game's *error* mark is drawn in a test at all. Crossing was on this
 * list while already covering its run-error frame — the one test in the whole
 * collection that caught a break in the shared thick-rect outline. Those are
 * two different marks for two different reasons, drawn differently (Crossing's
 * mistake box is nested `drawRectOutline` *lines*, inset well inside the tile,
 * precisely so a player can tell them apart), and only the Check-&-Save one is
 * counted here. A game may therefore be listed below and still have its live
 * error frame well covered.
 *
 * **And that per-game shape is why there is no single collection-wide overlay
 * guard.** Reaching a mistaken board takes a game-specific move, and the mark
 * it paints is a game-specific shape. This counts; the games assert.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { capabilitySets } from "./engine/testing/enrollment.ts";
import { registerAllGames } from "./games/index.ts";

beforeAll(registerAllGames);

/** Every game's **test** files, by game id — the opposite of the usual scan. */
const testSources = (() => {
  const modules = import.meta.glob<string>("./games/**/*.test.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  const byGame = new Map<string, string[]>();
  for (const [path, text] of Object.entries(modules)) {
    const id = path.split("/")[2];
    if (!id) continue;
    byGame.set(id, [...(byGame.get(id) ?? []), text]);
  }
  return byGame;
})();

/**
 * Games that offer `findMistakes` but never render its overlay in a test.
 *
 * **This list may only shrink.** Each entry is a game whose mistake mark is
 * drawn by code no test has ever looked at; deleting one means adding a
 * `showMistakes` render scenario for it.
 */
const NO_OVERLAY_TEST = [
  "abcd",
  "ascent",
  "bridges",
  "dominosa",
  "filling",
  "galaxies",
  "group",
  "keen",
  "lightup",
  "map",
  "mosaic",
  "palisade",
  "pattern",
  "range",
  "rome",
  "undead",
  "unequal",
];

describe("a game that finds mistakes has a test that paints them", () => {
  it("reads a real population and real test sources", () => {
    // Two vacuity numbers, because there are two derivations and either could
    // silently match nothing.
    expect(testSources.size).toBeGreaterThanOrEqual(50);
    expect(
      capabilitySets().filter((c) => c.members.includes("findMistakes")).length,
    ).toBeGreaterThanOrEqual(35);
  });

  it("has exactly the recorded shortfall — no more", () => {
    const offers = capabilitySets()
      .filter((c) => c.members.includes("findMistakes"))
      .map((c) => c.id);
    const uncovered = offers
      .filter(
        (id) => !(testSources.get(id) ?? []).some((t) => t.includes("showMistakes")),
      )
      .sort();
    expect(uncovered).toEqual([...NO_OVERLAY_TEST].sort());
  });

  it("keeps the ledger free of games that do not offer mistakes at all", () => {
    // The ledger's own honesty check: an entry for a game without
    // `findMistakes` would be a permanent excuse nothing could ever retire.
    const offers = new Set(
      capabilitySets()
        .filter((c) => c.members.includes("findMistakes"))
        .map((c) => c.id),
    );
    expect(NO_OVERLAY_TEST.filter((id) => !offers.has(id))).toEqual([]);
  });
});
