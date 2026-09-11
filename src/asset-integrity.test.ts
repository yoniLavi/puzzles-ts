/*
 * Static asset-integrity tests.
 *
 * Three failure modes these guard against, sharing one shape: each is invisible
 * to every other instrument in the gate, so it has to be asserted statically.
 *
 * 1. `new URL(<path>, import.meta.url)` references whose path no longer
 *    resolves to a real file/directory after the source file moves. Vite
 *    and the browser fail this silently (the only signal is a runtime 404
 *    on the eventual fetch), and a component's fallback icon can mask even
 *    that. Caught here at test time instead.
 *
 * 2. A puzzle present in the catalog without its corresponding generated
 *    icon PNGs in src/assets/icons/. Same masking risk, same fix: assert
 *    statically.
 *
 * 3. A raw control character in a `.ts` file. A NUL makes git call the file
 *    binary and stop diffing it, so the change becomes unreviewable — and tsc,
 *    biome and vitest all pass it happily.
 *
 * Implementation note: uses Vite's `import.meta.glob` (typed via
 * src/vite-env.d.ts) so the test stays inside the browser-shaped type
 * world and the project's `tsconfig.json` `"types": []` posture is
 * preserved (no Node typings imported into source).
 */

import { describe, expect, it } from "vitest";
import { puzzleIds } from "./puzzle/catalog.ts";

// Raw text of every .ts file under src/, eagerly loaded for regex scanning.
const sourceModules = import.meta.glob<string>("./**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Every file under src/, used as a static existence oracle. The value
// (URL string) is unused; only the keys matter.
const allFiles = import.meta.glob("./**/*", {
  query: "?url",
  import: "default",
  eager: true,
});

const knownPaths = new Set(Object.keys(allFiles));
const knownDirs = new Set<string>(["./"]);
for (const path of knownPaths) {
  const segments = path.replace(/^\.\//, "").split("/");
  for (let i = 1; i < segments.length; i++) {
    knownDirs.add(`./${segments.slice(0, i).join("/")}/`);
  }
}

function resolveAgainst(sourceFile: string, relPath: string): string {
  const fakeBase = `https://x/${sourceFile.replace(/^\.\//, "")}`;
  const resolved = new URL(relPath, fakeBase).pathname;
  return `.${resolved}`;
}

const URL_REF_RE = /new\s+URL\s*\(\s*(['"`])([\s\S]*?)\1\s*,\s*import\.meta\.url\s*\)/g;

interface UrlRef {
  source: string;
  line: number;
  rawPath: string;
  resolvedPath: string;
  isDynamic: boolean;
}

function findUrlRefs(file: string, contents: string): UrlRef[] {
  const refs: UrlRef[] = [];
  for (const match of contents.matchAll(URL_REF_RE)) {
    const rawPath = match[2];
    const noQuery = rawPath.replace(/\?[\s\S]*$/, "");
    const interpIdx = noQuery.indexOf("${");
    const isDynamic = interpIdx !== -1;
    const staticPrefix = isDynamic ? noQuery.slice(0, interpIdx) : noQuery;
    const resolvedPath = resolveAgainst(file, staticPrefix);
    const idx = match.index ?? 0;
    const line = contents.slice(0, idx).split("\n").length;
    refs.push({ source: file, line, rawPath, resolvedPath, isDynamic });
  }
  return refs;
}

describe("new URL(..., import.meta.url) references resolve", () => {
  const refs = Object.entries(sourceModules)
    .filter(
      ([path]) =>
        !path.endsWith(".test.ts") &&
        !path.includes("/__fixtures__/") &&
        !path.startsWith("./assets/"),
    )
    .flatMap(([path, contents]) => findUrlRefs(path, contents));

  it("finds references to scan (sanity)", () => {
    // Keeps the sweep below from passing vacuously if the regex or the
    // module glob breaks. catalog-card.ts's per-puzzle icons are the only
    // such reference in the app today, hence the bound of 1.
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });

  it.each(refs)("$source:$line — $rawPath", ({
    isDynamic,
    resolvedPath,
    source,
    line,
    rawPath,
  }) => {
    if (isDynamic) {
      expect(
        knownDirs.has(resolvedPath),
        `${source}:${line}: directory does not exist for ${rawPath} → ${resolvedPath}`,
      ).toBe(true);
    } else {
      expect(
        knownPaths.has(resolvedPath),
        `${source}:${line}: file does not exist for ${rawPath} → ${resolvedPath}`,
      ).toBe(true);
    }
  });
});

describe("no source file contains a control character git would call binary", () => {
  // Found the hard way while writing a test that fed `decodeSave` some
  // deliberate garbage: a literal NUL landed inside a string in the source.
  // **Every existing instrument passed it** — tsc compiled it, biome formatted
  // it, the test itself went green — and the only signal was `git diff --stat`
  // reporting `Bin 6264 -> 9595 bytes`, because git treats a file containing NUL
  // as binary and stops showing its diff. A file whose changes cannot be
  // reviewed is a much bigger problem than the byte that caused it.
  //
  // NUL is the one git actually keys on; the other C0 controls are here because
  // they are equally invisible in an editor and equally never intended. TAB (09),
  // LF (0a) and CR (0d) are excluded — biome owns whitespace.
  //
  // Written as a codepoint scan rather than a character class, because **a check
  // cannot contain a literal instance of what it forbids**: the regex form fails
  // its own file unless escaped, and biome's `noControlCharactersInRegex` then
  // objects to the escapes. Comparing numbers sidesteps both, with no
  // suppression to explain away later.
  const isForbidden = (c: number) =>
    c <= 0x08 || c === 0x0b || c === 0x0c || (c >= 0x0e && c <= 0x1f);

  it("finds source to scan (sanity)", () => {
    expect(Object.keys(sourceModules).length).toBeGreaterThan(100);
  });

  // One sweep rather than an `it.each` per file: there are ~680 of them, and a
  // per-file case would treble the suite's test count to say "no" 680 times.
  it("scans every .ts file under src/", () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(sourceModules)) {
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (!isForbidden(c)) continue;
        offenders.push(
          `src/${path.slice(2)}: U+${c.toString(16).padStart(4, "0")} at offset ${i}`,
        );
        break;
      }
    }
    expect(
      offenders,
      `${offenders.join("\n")}\nWrite it as an escape (\\x00) or a byte array instead.`,
    ).toEqual([]);
  });
});

describe("no doc comment describes a member that was deleted out from under it", () => {
  // A field's doc comment does not disappear when the field does — it slides up
  // against the *next* member and silently becomes that member's documentation.
  // `unify-cross-game-vocabulary` folded "is the cursor shown" into
  // `cursor.visible` and left four of these behind — in Abcd, Crossing, Mathrax
  // and Seismic — each then reading as the doc for the pencil-mode or
  // cursor-provenance flag below it. A fifth, unrelated, sat above a Netslide
  // test helper and described a different rect than the one it finds.
  //
  // Invisible to every other instrument in the gate — a comment compiles,
  // formats and passes — and worse than an absent comment, because it is read
  // and believed. The shape is mechanical: a *complete* single-line `/** … */`
  // immediately followed by another doc comment at the same indentation. A
  // multi-line comment cannot leave this shape, and two deliberate consecutive
  // doc comments are not a thing anyone writes.
  //
  // The following comment is matched by a *lookahead* so it is not consumed:
  // three stale comments in a row must report as three, not as one.
  const ORPHAN_RE = /^([ \t]*)\/\*\*.*\*\/[ \t]*\n(?=\1\/\*\*)/gm;

  it("finds source to scan (sanity)", () => {
    expect(Object.keys(sourceModules).length).toBeGreaterThan(100);
  });

  it("scans every .ts file under src/", () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(sourceModules)) {
      for (const m of text.matchAll(ORPHAN_RE)) {
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`src/${path.slice(2)}:${line}: ${m[0].trim()}`);
      }
    }
    expect(
      offenders,
      `${offenders.join("\n")}\nDelete the stale comment, or merge the two into one.`,
    ).toEqual([]);
  });
});

describe("every cataloged puzzle has its generated icons", () => {
  it.each(puzzleIds)("%s", (puzzleId) => {
    for (const suffix of ["64d8", "128d8"] as const) {
      const path = `./assets/icons/${puzzleId}-${suffix}.png`;
      expect(knownPaths.has(path), `missing icon: src/${path.slice(2)}`).toBe(true);
    }
  });
});

/*
 * Every page template renders a canonical URL.
 *
 * `sitemap.xml` advertises all 120 pages, but `<link rel="canonical">` was
 * computed per page set — and only two of the four sets did it. The 62 help
 * pages shipped with none, which nothing could notice: each set was
 * individually correct, the sitemap was individually correct, and the two
 * pages checked by hand on the live origin after the domain went live were the
 * two that happened to work.
 *
 * The derivation is fixed in `vite.config.ts` (one `withCanonicalUrl`
 * transform, from the pathname the pipeline already carries, so a page set
 * cannot opt out by omission). This is the other half: the *template* has to
 * render what the transform supplies, and that is per-file by nature.
 *
 * The population is derived from the shape rather than listed — a page
 * template is a `.hbs` containing `<head`, which is what makes it a page. A
 * roster would be the thing a new template gets forgotten from.
 */
/*
 * NOT HERE: a check that every lazily-imported module resolves.
 *
 * It was written, and it worked — renaming the About dialog made it fail with a
 * clear message. Then the instrument was checked against something outside
 * itself, and `tsgo` reports the same rename as `TS2307` from the *first* step
 * of the gate, well before vitest runs. A literal `import("…")` specifier is
 * statically analyzable, so the typechecker already owns it.
 *
 * Removed rather than kept as belt-and-braces: a second guard over ground the
 * first already covers is a maintenance cost that reads as coverage, and the
 * next person to touch it has to re-derive that it was never load-bearing.
 * Recorded here so it does not get rebuilt.
 */

const pageTemplates = import.meta.glob<string>(
  ["../templates/*.hbs", "../help/*.hbs"],
  { query: "?raw", import: "default", eager: true },
);

describe("every page template renders a canonical URL", () => {
  // Which .hbs files are *pages* — the ones with a document head. `_headers`
  // is a template too and must not be caught by this.
  const pages = Object.entries(pageTemplates).filter(([, text]) =>
    text.includes("<head"),
  );

  it("finds page templates to scan (sanity)", () => {
    // Vacuity guard: an unmatched glob yields {}, and every assertion below
    // would then pass over nothing and report health. Four today — index,
    // puzzle, and the two help templates.
    expect(pages.map(([path]) => path).sort()).toEqual([
      "../help/_game.html.hbs",
      "../help/_template.html.hbs",
      "../templates/index.html.hbs",
      "../templates/puzzle.html.hbs",
    ]);
  });

  it.each(pages)("%s", (path, text) => {
    expect(
      text,
      `${path} renders no <link rel="canonical">, so its pages would be in ` +
        "sitemap.xml with nothing pointing them at the canonical origin. " +
        "vite.config.ts supplies `canonicalUrl` to every page set.",
    ).toMatch(/<link\s+rel="canonical"\s+href="\{\{\s*canonicalUrl\s*\}\}">/);
  });
});
