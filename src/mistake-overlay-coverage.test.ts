/*
 * **A game that finds mistakes should have a test that *paints* them.**
 *
 * Eleven of the thirty-nine games offering `findMistakes` test it as a function
 * — "does it flag the right cells" — and never render the overlay it exists to
 * drive. (Nineteen at filing on 2026-09-06, and seventeen after that; the drop
 * to eleven is a **corrected key**, not eight games gaining tests — see ON THE
 * KEYS.) `promote-the-thick-rect-outline` measured what that costs:
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
 * ON THE KEYS — **and this guard got its own second key wrong, which is the
 * lesson worth carrying.** The population comes from the **capability set** (the
 * optional `Game` members a game actually carries), not from a grep for
 * `findMistakes`, because four games spelled that member's function differently
 * until 2026-09-06. That side was derived carefully and is right.
 *
 * The *coverage* side was not. It keyed on `showMistakes` and argued that this
 * "is not a name a game chose: it is `renderScenario`'s flag, i.e. *the*
 * mechanism for driving a mistake frame." It is not the mechanism — it is the
 * newest of three, and six of the seventeen games this file convicted had
 * written theirs before that harness existed (`explore-the-tile-loop-inversion`,
 * 2026-09-09; `openspec/postmortems/2026-09-09-tile-loop-inversion-withdrawal.md`).
 * Galaxies' three-frame test — which asserts the overlay *clears*, and which
 * `docs/games/rendering.md` cites **by name** as this discipline's exemplar —
 * was on the list. Four of the six were proven covered by mutation: planting
 * the defect turns a test red in abcd, keen, rome and galaxies.
 *
 * **So: a guard's coverage side needs the same derivation discipline as its
 * population side, and it is the side nobody checks** — an over-reported
 * shortfall fails no commit. It sits in the tree looking like diligence, and
 * its cost is paid by whoever tries to close it and finds the test already
 * there. `isCovered` below now takes all three spellings and classifies the
 * superset rather than narrowing to one, which is this repo's standing
 * instrument rule (`AGENTS.md` § "A scan that keys on a name finds only the
 * games that were named that way").
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
 * Does any of this game's test files drive the mistake overlay onto a frame and
 * assert the paint?
 *
 * **Three spellings, because there are three and the guard once knew one.**
 * `renderScenario`'s `showMistakes` is the newest; the other two predate it and
 * are what `docs/games/rendering.md` § "Prove the overlay repaints" actually
 * describes. See "ON THE KEYS" above for what keying on the newest alone cost.
 *
 * The `showMistakes` arm stays file-wide and unconditional — the flag *is* a
 * driven mistake frame, by construction, so nothing further need be proved
 * about it. The other two are calls a test can make for reasons that have
 * nothing to do with painting (Galaxies' hint suite calls `findMistakes` to
 * check a *refusal message*), so they are required to sit in the same `it`
 * block as a redraw and an assertion about what it emitted. A block key rather
 * than a file key, deliberately: two of these games call `findMistakes` in one
 * file and paint it in another.
 */
function isCovered(sources: readonly string[]): boolean {
  return sources.some((text) => {
    if (text.includes("showMistakes")) return true;
    return text.split(/\bit\(/).some(
      (block) =>
        /findMistakes\??[.(]/.test(block) &&
        // `[Rr]edraw` and not `\bredraw`: a game whose export collides with
        // something in its own test file imports it aliased, and Galaxies —
        // whose three-frame test `docs/games/rendering.md` cites *by name* as
        // this discipline's exemplar — calls `galaxiesRedraw(`. The first cut
        // of this widened key missed it, which is the same defect one layer
        // down, caught only because the exploration had already read the test.
        /[Rr]edraw\w*\(/.test(block) &&
        /\.ops\b|toMatchSnapshot/.test(block),
    );
  });
}

/**
 * Games that offer `findMistakes` but never render its overlay in a test.
 *
 * **This list may only shrink.** Each entry is a game whose mistake mark is
 * drawn by code no test has ever looked at; deleting one means adding a
 * paint-twice test for it in any of the three spellings above.
 */
const NO_OVERLAY_TEST = [
  "ascent",
  "bridges",
  "dominosa",
  "filling",
  "group",
  "mosaic",
  "palisade",
  "pattern",
  // Range renders the overlay, but from a hand-written mistake list onto a
  // *fresh* drawstate every time — the cold frame that "proves nothing about an
  // overlay". It stays until it paints twice.
  "range",
  "undead",
  "unequal",
];

describe("a game that finds mistakes has a test that paints them", () => {
  it("reads a real population and real test sources", () => {
    // Three vacuity numbers, because there are three derivations and any of
    // them could silently match nothing and report health.
    expect(testSources.size).toBeGreaterThanOrEqual(50);
    expect(
      capabilitySets().filter((c) => c.members.includes("findMistakes")).length,
    ).toBeGreaterThanOrEqual(35);
    // The coverage key itself. A regex that stops matching after a rename would
    // otherwise push every game onto the ledger, and the ledger assertion would
    // report the shortfall as *growing* rather than the key as broken.
    const covered = capabilitySets()
      .filter((c) => c.members.includes("findMistakes"))
      .filter((c) => isCovered(testSources.get(c.id) ?? []));
    expect(covered.length).toBeGreaterThanOrEqual(25);
  });

  it("has exactly the recorded shortfall — no more", () => {
    const offers = capabilitySets()
      .filter((c) => c.members.includes("findMistakes"))
      .map((c) => c.id);
    const uncovered = offers
      .filter((id) => !isCovered(testSources.get(id) ?? []))
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
