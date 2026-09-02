/**
 * The guard for **"a game contains no color value"** — read as a rule about
 * source, because that is what the rule actually says.
 *
 * `palette.test.ts` checks *values*, and value is the wrong instrument for this
 * requirement in both directions. It cannot see provenance (a game writing a
 * literal that happens to equal a token passes), and once every color is a token
 * it cannot see anything at all, because a derived color has no value to look up
 * — `mkhighlightSpecific(UNRULY_BLACK)` and `soloKiller(bg)` are correct and
 * unmatchable. So the value guard keeps the jobs value is good at (no two shared
 * roles hold one value; every derived role stays visible against both host
 * backgrounds) and this one reads the source.
 *
 * Three rules, each aimed at one way a color decision leaks back into a game:
 *
 * 1. **no color literal** — `[0.2, 1, 0.2]` in a game is a value nobody can
 *    restyle;
 * 2. **no channel-indexing the background** — `bg[0] * 0.9` is the same decision
 *    written as arithmetic, and it is how most of the collection's derived
 *    colors were originally spelled;
 * 3. **no importing the color combinators** — `mix`/`scale`/`divide`/`fraction`
 *    are how the *table* builds one color out of others; a game reaching for
 *    them is a game deciding a color.
 *
 * What it deliberately does not attempt: a game could still compute a color from
 * variables the rules do not name. That is a review matter, and the rules above
 * cover every spelling the collection actually used across 57 games. A game is
 * free to call a **named derivation** from the table (`slantGrid(background)`) or
 * the shared bevel trio (`mkhighlightSpecific(CROSSING_WALL)`) — those are the
 * intended shape, not an exception to it.
 */
import { describe, expect, it } from "vitest";
import * as colors from "./colors.ts";
import * as gameTokens from "./palette-games.ts";

/** The meanings layer, as text — a named color counts as used when a meaning
 * is defined over it, not only when a game imports it directly. */
const paletteSource: string = Object.values(
  import.meta.glob<string>("./palette.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0];

/** The per-game half of the table, as text — needed to see that a set's members
 * are used by the aggregate the games import. */
const tableSource: string = Object.values(
  import.meta.glob<string>("./palette-games.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0];

/** Raw text of every non-test source file under `src/games/`.
 *
 * Via Vite's `import.meta.glob` rather than `node:fs`, following
 * `asset-integrity.test.ts`: it keeps the test inside the browser-shaped type
 * world and preserves the project's `"types": []` posture.
 *
 * A glob is **not** an import specifier, so a bulk rewriter that repoints
 * imports after a file move leaves it behind — and an unmatched glob yields
 * `{}` rather than an error, so all three assertions below would pass over
 * nothing. That is why `finds the game sources at all` exists, and it is what
 * caught this pattern when the file moved into `engine/color/`. */
const sourceModules = import.meta.glob<string>("../../games/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Array literals of three numbers that are genuinely **not colors**.
 *
 * Matched on the source snippet rather than a line number so it survives edits,
 * and kept per file so a snippet allowed in one game is not allowed everywhere.
 * It has two entries and should stay about that size: across 57 games, 174 of the
 * 175 three-number literals in the collection *were* colors, which is what makes
 * this rule worth having at all.
 */
const NOT_COLORS: Record<string, { snippet: string; why: string }[]> = {
  "cube/render.ts": [
    { snippet: "const t = [0, 0, 0];", why: "a 3-vector in the solid's transform" },
  ],
  "undead/render.ts": [
    { snippet: "const placed = [0, 0, 0];", why: "a per-monster-type tally" },
  ],
};

/**
 * Every non-test game source, keyed `<game>/<file>`.
 *
 * The key is cut at `games/` rather than by stripping a fixed `"../games/"`
 * prefix, because the prefix depends on how deep *this file* sits and it moved
 * once already (`group-crowded-source-directories`). A fixed strip that no
 * longer matches does not fail — it leaves `../abcd/render.ts`, so `rel` still
 * reads plausibly and `rel.split("/")[0]` silently becomes `".."`. Path
 * arithmetic keyed to depth is the one thing an import sweep cannot see, so
 * this one states its assumption and throws when it does not hold.
 */
function gameSources(): { rel: string; src: string }[] {
  return Object.entries(sourceModules)
    .filter(([path]) => !path.endsWith(".test.ts"))
    .map(([path, src]) => {
      const rel = /(?:^|\/)games\/(.+)$/.exec(path)?.[1];
      if (!rel) throw new Error(`glob key is not under games/: ${path}`);
      return { rel, src };
    })
    .sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Blank out comments and string literals, so prose about `[1, 0, 0]` does not
 * read as code that writes it. Replaced with spaces rather than removed, so any
 * offset still points at the right place. */
function code(src: string): string {
  return src.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g,
    (m) => m.replace(/[^\n]/g, " "),
  );
}

const COLOR_LITERAL = /\[\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\]/g;
const BACKGROUND_CHANNEL =
  /\b(?:default[Bb]ackground|background|bg)\s*\[\s*\d|\bbg\[i\]/;
/** Matched against **raw** source, not the comment-stripped copy: an import
 * path is a string literal, so {@link code} blanks it out. (Found by mutating a
 * game to import `scale` and watching this rule not fire.) Anchored to a line
 * that actually starts an import, so prose naming the module is still fine. */
const COMBINATOR_IMPORT = /^import[^;]*from\s+"[^"]*color-token\.ts"/m;

describe("a game contains no colour value", () => {
  const sources = gameSources();

  it("finds the game sources at all", () => {
    // A broken glob would make every rule below vacuously pass.
    expect(sources.length).toBeGreaterThan(100);
  });

  for (const { rel, src } of sources) {
    const stripped = code(src);
    const allowed = NOT_COLORS[rel] ?? [];

    it(`${rel} writes no colour literal`, () => {
      const found = [...stripped.matchAll(COLOR_LITERAL)].map((m) => {
        const line = stripped.slice(0, m.index).split("\n").length;
        return { text: src.split("\n")[line - 1].trim(), line };
      });
      const offending = found.filter(
        (f) => !allowed.some((a) => f.text.includes(a.snippet)),
      );
      expect(
        offending.map((f) => `${rel}:${f.line}  ${f.text}`),
        "a colour belongs in the token table (palette.ts / palette-games.ts) " +
          "under a name that says what it means; add it there and reference it. " +
          "If this really is not a colour, declare it in NOT_COLOURS with a reason",
      ).toEqual([]);
    });

    it(`${rel} derives no colour from the background`, () => {
      const line = stripped
        .split("\n")
        .findIndex((l) => BACKGROUND_CHANNEL.test(l) && !l.includes("..."));
      expect(
        line < 0 ? null : `${rel}:${line + 1}  ${src.split("\n")[line].trim()}`,
        "a colour defined relative to the board is still a colour decision: " +
          "give it a name in palette-games.ts as a function of the background, " +
          "and call that",
      ).toBeNull();
    });

    it(`${rel} does not combine colours itself`, () => {
      expect(
        COMBINATOR_IMPORT.test(src) ? rel : null,
        "mix/scale/divide/fraction build one colour out of others, which is the " +
          "token table's job — put the combination there under a name",
      ).toBeNull();
    });
  }
});

/**
 * Ownership, checked at the import line.
 *
 * A per-game token names the game it belongs to, and that name is only worth
 * anything if it is true. Checking it here rather than by inspecting resolved
 * palettes catches the cases a palette cannot show: `CROSSING_WALL` and Unruly's
 * two tile colors are *inputs to* `mkhighlightSpecific` and their own values
 * never appear in a palette at all, so an identity check over palette entries
 * called all three unused.
 */
describe("a per-game token belongs to the game it names", () => {
  /** The game a token's name claims. `SIGNPOST_REGION_0` → `signpost`;
   * `netslideBorder` → `netslide`. Taking the whole run before the first
   * underscore (or the leading lower-case run) rather than testing prefixes
   * avoids the trap that `NETSLIDE_*` also starts with `net`. */
  const owner = (name: string): string =>
    name === name.toUpperCase()
      ? name.split("_")[0].toLowerCase()
      : (/^[a-z]+/.exec(name)?.[0] ?? name);

  /** The names a game source imports from the per-game half of the table. */
  const imported = (src: string): string[] => {
    const m = /import\s*\{([^}]*)\}\s*from\s*"[^"]*palette-games\.ts"/.exec(src);
    return m
      ? m[1]
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
      : [];
  };

  const sources = gameSources();

  for (const { rel, src } of sources) {
    const game = rel.split("/")[0];
    const wrong = imported(src).filter((n) => owner(n) !== game);
    it(`${rel} imports only its own tokens`, () => {
      // A copied import line is the realistic way this breaks: `SPOKES_CURSOR`
      // pasted into Sticks looks right, works, and quietly ties two games'
      // schemes together.
      expect(wrong).toEqual([]);
    });
  }

  it("declares no token no game uses", () => {
    // A token with no consumer is a color decision whose effect nobody can see,
    // and it will be wrong by the time somebody does.
    //
    // "Used" includes used *by the table itself*: a set's members are declared
    // individually so each can carry a name, a meaning and its own scheme value,
    // and are then gathered into the ordered array the game actually imports
    // (`FLOOD_TILE_3` → `FLOOD_TILES`). Only a name nothing mentions is dead.
    const byGames = new Set(sources.flatMap(({ src }) => imported(src)));
    const table = code(tableSource);
    const declared = Object.keys(gameTokens);
    const dead = declared.filter(
      (n) =>
        !byGames.has(n) &&
        (table.match(new RegExp(`\\b${n}\\b`, "g")) ?? []).length < 2,
    );
    expect(dead).toEqual([]);
  });
});

/**
 * A **named color with no consumer** is a color decision nobody can see.
 *
 * The same rule the per-game half has had all along, now over `colors.ts`,
 * because the consolidation made it reachable: Crossing's down-run was the only
 * consumer of `ORANGE_WASH`, and when it moved to the bold step the wash sat in
 * the table declaring a shade of orange that nothing on any board could show.
 * That is exactly the state the palette is small in order to avoid.
 *
 * "Used" spans all three ways a color reaches a board: a game imports it, a
 * meaning in `palette.ts` is defined over it, or one of the sets in `colors.ts`
 * itself gathers it up (`RED` is in `TEN`, which is what Flood imports).
 */
it("declares no named colour nothing can show", () => {
  const imported = (src: string): string[] => {
    const m = /import\s*\{([^}]*)\}\s*from\s*"[^"]*colors\.ts"/.exec(src);
    return m
      ? m[1]
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
      : [];
  };
  const byGames = new Set(gameSources().flatMap(({ src }) => imported(src)));
  // The meanings layer and the board-relative layer both build on named colors
  // (`ERROR` is `RED`; Signpost's region ramp is built from `EIGHT_FILLS`), and
  // a color reaching a board through either of them is used.
  const byMeanings = new Set([...imported(paletteSource), ...imported(tableSource)]);
  const table = code(
    Object.values(
      import.meta.glob<string>("./colors.ts", {
        query: "?raw",
        import: "default",
        eager: true,
      }),
    )[0],
  );
  const dead = Object.keys(colors).filter(
    (n) =>
      !byGames.has(n) &&
      !byMeanings.has(n) &&
      // Mentioned once is its own declaration; twice means a set gathers it.
      (table.match(new RegExp(`\\b${n}\\b`, "g")) ?? []).length < 2,
  );
  expect(dead).toEqual([]);
});
