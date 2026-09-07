/**
 * **A comment that names a game's dark-mode palette overrides is a claim about
 * another file, and this holds the two together.**
 *
 * Every game's render module explains why its palette may be appended past the
 * upstream `COL_*` enum, and the reason is always the same shape: *something in
 * `src/puzzle/augmentation.ts` addresses this palette by number, or nothing
 * does.* Five such comments across three games (Boats ×2, Inertia, Light Up ×2)
 * went on naming indices — `paletteOverrides: { 4: 0.6 }` for Boats' water,
 * "indices 2/3" for Light Up — for the whole life of the twelve-color palette
 * consolidation that deleted every one of those declarations. A sixth (Unruly)
 * said the overrides "apply unchanged" when there were none to apply.
 *
 * Nothing failed, and nothing could, because each comment states its index list
 * as the *premise* of a conclusion that stayed true for a different reason: with
 * no overrides at all, any append is safe. A false premise under a true
 * conclusion is invisible to every behavioral tier — the next person to add an
 * override consults the comment for which indices are spoken for and is told
 * something invented. This is `AGENTS.md` § "Method": *a count written in prose
 * is a census nobody re-runs*.
 *
 * **How the population is found.** By shape, never by a roster: every mention of
 * `paletteOverrides` in any game's `src/games/<game>/render.ts`, whatever the
 * game and however the sentence is phrased. Each mention is then *classified* rather than
 * filtered out (`AGENTS.md`, "a scan that keys on a name") into one of two
 * checkable forms, and a mention that fits neither **fails** rather than being
 * skipped — an unclassifiable claim is exactly the one nothing can check.
 *
 *   - **"declares none"** — `no dark-mode paletteOverrides`, immediately before
 *     the identifier. Checked against the game declaring none.
 *   - **"names indices"** — an `index`/`indices` followed by numbers, or the
 *     literal `paletteOverrides: { n: … }`. Checked for set equality against
 *     what the game declares.
 *
 * The declaration side is the **imported module**, not a parse of its text: the
 * data is what the app actually applies, so there is no second reading of it to
 * drift.
 *
 * **What this deliberately does not cover.** `paletteSwaps`, the other
 * index-addressed dark-mode field. Its prose in the collection is about whether
 * *one color* needs a bevel pair (`slide/render.ts`: "Flat, so it needs no bevel
 * trio and no `paletteSwaps` pair") rather than about the game's declared set,
 * so the "declares none" form would convict Slide of a defect it does not have.
 * Bending those comments to fit this guard would be contorting the game to fit
 * the contract; the swap claims stay a review matter. Nor does it check the
 * reverse direction — a game with a declared override need not comment on it.
 */
import { describe, expect, it } from "vitest";
import { puzzleAugmentations } from "./puzzle/augmentation.ts";

/** Raw text of every game's render module, via Vite's glob rather than
 * `node:fs` (following `asset-integrity.test.ts`, and keeping the browser-shaped
 * type world). An unmatched glob yields `{}` and would make every assertion
 * below pass over nothing, which is what `finds the render modules` guards. */
const renderModules = import.meta.glob<string>("./games/*/render.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** One comment in one file, normalized to a single line of prose. */
interface Mention {
  /** `<game>/render.ts` — the game id is the directory, so it cannot be typed
   * wrong the way a roster entry can. */
  readonly rel: string;
  readonly game: string;
  readonly line: number;
  /** The comment with its markers, backticks and line breaks removed, so a
   * claim spanning two `//` lines reads as one sentence. */
  readonly text: string;
  /** Where `paletteOverrides` sits in {@link text}. */
  readonly at: number;
}

const IDENTIFIER = "paletteOverrides";

/** Every comment in `src`: a block comment, or a run of consecutive `//` lines
 * (so a claim wrapped across two of them is one unit). */
const COMMENTS = /\/\*[\s\S]*?\*\/|(?:^[ \t]*\/\/[^\n]*\n?)+/gm;

/** Strip comment markers, backticks and line structure. Markdown emphasis goes
 * too, so `*ring*` cannot look like a leading `*`. */
function normalize(comment: string): string {
  return comment
    .replace(/\/\*\*?|\*\/|^[ \t]*(?:\*|\/\/)[ \t]?/gm, " ")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mentions(): Mention[] {
  const out: Mention[] = [];
  for (const [path, src] of Object.entries(renderModules)) {
    const rel = /(?:^|\/)games\/(.+)$/.exec(path)?.[1];
    if (!rel) throw new Error(`glob key is not under games/: ${path}`);
    const game = rel.split("/")[0];
    for (const m of src.matchAll(COMMENTS)) {
      const text = normalize(m[0]);
      if (!text.includes(IDENTIFIER)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      for (let at = text.indexOf(IDENTIFIER); at >= 0; ) {
        out.push({ rel, game, line, text, at });
        at = text.indexOf(IDENTIFIER, at + IDENTIFIER.length);
      }
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line);
}

/** "…has no dark-mode paletteOverrides", "…declares no paletteOverrides" — the
 * negation must sit immediately before the identifier, so a "no" elsewhere in a
 * long comment cannot excuse a claim further along. */
const DECLARES_NONE = /\bno\s+(?:dark-mode\s+)?$/i;

/** An index list a comment states: "indices 2 (black) and 3 (light)", "index 0",
 * "touch only indices 2/3". The connectors are enumerated, so a hedge the guard
 * cannot evaluate ("indices at or below 14") matches nothing and the mention
 * falls through to unclassified rather than being read as a claim about 14. */
const NAMES_INDICES =
  /\bind(?:ex|ices|exes)\b((?:\s*(?:and|or|only|,|\/)?\s*\d+(?:\s*\([^)]*\))?)+)/gi;

/** The literal declaration quoted in prose: `paletteOverrides: { 0: 1.15 }`. */
const QUOTES_DECLARATION = /^:\s*\{([^}]*)\}/;

/** The indices a mention claims, or `null` if it claims none by name. */
function claimedIndices(m: Mention): number[] | null {
  const after = m.text.slice(m.at + IDENTIFIER.length);
  // Stop at the next mention: a comment naming two fields gets one window each.
  const window = after.split(IDENTIFIER)[0];

  const quoted = QUOTES_DECLARATION.exec(window);
  if (quoted) {
    return [...quoted[1].matchAll(/(\d+)\s*:/g)].map((k) => Number(k[1]));
  }

  const found = [...window.matchAll(NAMES_INDICES)].flatMap((g) =>
    [...g[1].matchAll(/\d+/g)].map((d) => Number(d[0])),
  );
  return found.length > 0 ? found : null;
}

/** What `augmentation.ts` actually declares — the module, not a parse of it. */
function declaredIndices(game: string): number[] {
  const overrides = (
    puzzleAugmentations as Record<
      string,
      { darkMode?: { paletteOverrides?: Record<number, unknown> } } | undefined
    >
  )[game]?.darkMode?.paletteOverrides;
  return Object.keys(overrides ?? {})
    .map(Number)
    .sort((a, b) => a - b);
}

const sorted = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

describe("a comment naming a palette override is checked against the declaration", () => {
  const found = mentions();

  it("finds the render modules and the claims in them", () => {
    // Both floors guard vacuity: a glob that matched nothing, or a scan whose
    // shape stopped matching, would otherwise pass every assertion below over an
    // empty population and report health. Floors rather than exact counts — a
    // new game writing the standard "has no dark-mode paletteOverrides" comment
    // is not a regression, and the per-mention checks are what do the work.
    expect(Object.keys(renderModules).length).toBeGreaterThan(50);
    expect(found.length).toBeGreaterThan(15);
    // The declaration side must be non-empty too, or the "declares none" form
    // would be trivially satisfiable for every game.
    expect(
      Object.keys(puzzleAugmentations).filter((g) => declaredIndices(g).length > 0),
    ).not.toEqual([]);
  });

  for (const m of found) {
    it(`${m.rel}:${m.line} says what augmentation.ts declares`, () => {
      const declared = declaredIndices(m.game);
      const where = `${m.rel}:${m.line}`;
      const declaredText =
        declared.length > 0
          ? `augmentation.ts declares ${JSON.stringify(declared)} for ${m.game}`
          : `augmentation.ts declares no paletteOverrides for ${m.game}`;

      if (DECLARES_NONE.test(m.text.slice(0, m.at))) {
        expect(
          declared,
          `${where} says ${m.game} has no dark-mode paletteOverrides, but ` +
            `${declaredText}. Name the indices, or delete the declaration`,
        ).toEqual([]);
        return;
      }

      const claimed = claimedIndices(m);
      expect(
        claimed,
        `${where} mentions paletteOverrides but states neither "no dark-mode ` +
          `paletteOverrides" nor an index list this guard can check ` +
          `("…indices 2 and 3"). ${declaredText}. Phrase it one of those two ` +
          "ways so the claim is held to the declaration, or say nothing about " +
          "which indices are spoken for",
      ).not.toBeNull();

      expect(
        sorted(claimed ?? []),
        `${where} names paletteOverrides indices that are not what is ` +
          `declared — ${declaredText}`,
      ).toEqual(declared);
    });
  }
});
