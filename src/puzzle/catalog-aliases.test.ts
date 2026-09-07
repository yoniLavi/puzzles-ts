/**
 * **The names a player might search by.**
 *
 * This collection renames most of the puzzles it ships: Sudoku is Solo,
 * Nonogram is Pattern, Minesweeper is Mines, Slitherlink is Loopy. A search box
 * that reads only the names *this* project uses answers "no puzzle matches" to
 * the most likely first query anyone types, which is exactly what it did.
 *
 * Aliases are therefore catalog data, and two things are checked about them.
 *
 * **Derived where a source exists.** Five games' help pages state an
 * alternative name outright — "This puzzle is best known as *Battleships*" —
 * and those are not a matter of opinion. The scan below pulls every
 * `known as *X*` / `implementation of *X*` from `help/games/`, and requires the
 * catalog to carry it. A name the project has already published and cannot be
 * searched for is the specific gap that would otherwise reopen quietly, one
 * help-page edit at a time.
 *
 * **Sane everywhere else.** The rest are the standard names the puzzle is
 * documented under, which no file in this repo can adjudicate — so what is
 * checked is what *can* be: that an alias belongs to a real game, that it is
 * not just the game's own name again, and that no two games claim the same one
 * (which would make a search for it ambiguous in a way a player cannot see).
 */
import { describe, expect, it } from "vitest";
import { puzzleDataMap, puzzleIds } from "./catalog.ts";
import { matchesQuery } from "./catalog-search.ts";

const helpPages = import.meta.glob<string>("../../help/games/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Alternative names a help page states, per puzzle id.
 *
 * Keyed on the **phrasing**, not on a roster of games: any page saying a puzzle
 * is "known as", "best known as" or "an implementation of" some emphasized
 * name is caught, so a page that gains such a sentence is covered the day it
 * lands. The parenthetical form ("or the non-trademarked name *Hidoku*") is a
 * separate pattern for the same reason.
 */
function statedInHelp(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const PHRASES =
    /(?:\bknown as|\bimplementation of|\bnon-trademarked name)\s+\*([^*]+)\*/gi;
  for (const [path, text] of Object.entries(helpPages)) {
    const puzzleId = path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    const names = [...text.matchAll(PHRASES)].map((m) => m[1].trim());
    if (names.length > 0) out.set(puzzleId, names);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

describe("catalog aliases", () => {
  const stated = statedInHelp();

  it("reads the help pages and finds names in them", () => {
    // Both floors are vacuity guards: a broken glob or a phrasing that stopped
    // matching would make the derivation below assert nothing at all.
    expect(Object.keys(helpPages).length).toBeGreaterThan(50);
    expect(stated.size).toBeGreaterThan(3);
  });

  it("carries every alternative name a help page states", () => {
    const missing: string[] = [];
    for (const [puzzleId, names] of stated) {
      const declared = (puzzleDataMap[puzzleId]?.aliases ?? []).map(norm);
      for (const name of names) {
        if (!declared.includes(norm(name))) missing.push(`${puzzleId}: ${name}`);
      }
    }
    expect(
      missing,
      "these names are published in the help but cannot be searched for; add " +
        "them to the catalog entry's `aliases`",
    ).toEqual([]);
  });

  it("declares no alias that is not a real, distinct, unique name", () => {
    const owner = new Map<string, string>();
    const problems: string[] = [];
    let aliasCount = 0;
    for (const puzzleId of puzzleIds) {
      const { name, aliases = [] } = puzzleDataMap[puzzleId];
      for (const alias of aliases) {
        aliasCount++;
        if (norm(alias) === norm(name)) {
          problems.push(`${puzzleId}: "${alias}" is just its own name`);
        }
        const existing = owner.get(norm(alias));
        if (existing) {
          problems.push(`"${alias}" is claimed by both ${existing} and ${puzzleId}`);
        }
        owner.set(norm(alias), puzzleId);
      }
    }
    expect(aliasCount).toBeGreaterThan(20); // vacuity
    expect(problems).toEqual([]);
  });

  it("finds a game by the name a player knows it by", () => {
    // The queries that motivated the field. Spot checks, not a census: the
    // point is that the alias path is wired to search at all, which the two
    // structural tests above cannot show.
    for (const [query, expected] of [
      ["sudoku", "solo"],
      ["minesweeper", "mines"],
      ["nonogram", "pattern"],
      ["slitherlink", "loopy"],
      ["battleships", "boats"],
      ["futoshiki", "unequal"],
    ] as const) {
      const hits = puzzleIds.filter((id) => matchesQuery(id, query));
      expect(hits, `searching "${query}" should find ${expected}`).toContain(expected);
    }
  });
});
