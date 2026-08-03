/*
 * The catalog and `help/games/` are two lists of games, and they must be the
 * same list — asserted in **both** directions, like `catalog-registry.test.ts`.
 *
 * Written because its absence hid a real gap. Until `retire-the-upstream-help-tree`
 * the per-puzzle help came from two sources in two formats — 43 upstream HTML
 * fragments and 13 markdown pages — and nothing listed the correspondence, so
 * nobody noticed that 43 + 13 = 56 of 57: `separate` had no help page at all,
 * in either source. The reverse direction costs nothing to add and catches the
 * other half of the same mistake, a page left behind after a game is renamed.
 *
 * The glob is read through Vite so the file stays inside the browser-shaped type
 * world (`tsconfig.json` `"types": []`), which means an unmatched glob yields
 * `{}` **silently** — hence the explicit non-vacuity assertion. That is the
 * `palette-source.test.ts` trap, and it is why the count is asserted rather than
 * inferred from the sweep passing.
 */

import { describe, expect, it } from "vitest";
import { puzzleIds } from "./puzzle/catalog.ts";

const helpPages = import.meta.glob<string>("../help/games/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

// The hand-maintained "Included puzzles" table, whose rows link `../<puzzleId>`.
const puzzlesPage = import.meta.glob<string>("../help/puzzles.md", {
  query: "?raw",
  import: "default",
  eager: true,
})["../help/puzzles.md"];

const pageIds = Object.keys(helpPages).map(
  (path) => /([^/]+)\.md$/.exec(path)?.[1] ?? path,
);

describe("help page coverage", () => {
  it("has a help page for every catalogued puzzle", () => {
    const known = new Set(pageIds);
    const missing = puzzleIds.filter((id) => !known.has(id));
    expect(missing, "add help/games/<puzzleId>.md for each").toEqual([]);
  });

  it("has no help page for an uncatalogued game", () => {
    const known = new Set<string>(puzzleIds);
    const orphaned = pageIds.filter((id) => !known.has(id));
    expect(orphaned, "help/games/<id>.md names no catalogued game").toEqual([]);
  });

  it("is not vacuous — the glob found the pages", () => {
    expect(pageIds.length).toBeGreaterThan(50);
  });
});

describe("the Included puzzles page lists the whole collection", () => {
  // `help/puzzles.md` says of itself "this table is manually generated for now",
  // and a hand-maintained list of 57 games with nothing checking it drifted
  // exactly as you would expect: it was missing six — crossing, group, seismic,
  // separate, slide and sokoban — when this test was written. Four of those are
  // upstream *unfinished* puzzles this project finished and ships, which is
  // precisely the kind of game a reader would not know to look for.
  const listed = [
    ...puzzlesPage.matchAll(/^\|\s*\[[^\]]+]\(\.\.\/([a-z0-9]+)\)/gm),
  ].map((m) => m[1]);

  it("lists every catalogued puzzle", () => {
    const known = new Set(listed);
    expect(puzzleIds.filter((id) => !known.has(id))).toEqual([]);
  });

  it("lists nothing that is not a catalogued puzzle", () => {
    const known = new Set<string>(puzzleIds);
    expect(listed.filter((id) => !known.has(id))).toEqual([]);
  });

  it("is not vacuous — the row pattern matched", () => {
    expect(listed.length).toBe(puzzleIds.length);
  });
});

describe("a help page introduces the puzzle, not its implementation", () => {
  // `repo-layout`: these pages "SHALL NOT carry development status, known-issue
  // lists or roadmap notes". That rule has been in force since
  // `audit-author-known-issues` stripped `## Status` sections from the thirteen
  // third-party pages — and it was still being violated, in two pages, by a
  // *different spelling* of the same thing: upstream's `slide.html` and
  // `sokoban.html` opened a `<strong>Status:</strong>` paragraph with "This is
  // an experimental, unfinished puzzle", about two games this collection
  // finished, registered, spec'd and ships. A rule enforced by one spelling in
  // one directory is not enforced.
  //
  // Deliberately narrow: it matches the *label* forms only. Several pages say
  // "the status line" about the game's own status bar (palisade, samegame), and
  // a trap that fires on those would be turned off rather than fixed.
  const STATUS_LABEL = /^(?:#{1,6}\s*status\b|\*\*status:?\*\*)/im;

  it.each(Object.entries(helpPages))("%s", (path, source) => {
    const match = STATUS_LABEL.exec(source);
    expect(
      match?.[0],
      `${path} carries a development-status note. Help pages describe how to play.`,
    ).toBeUndefined();
  });
});
