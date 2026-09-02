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

import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { getTsGame, registeredGameIds } from "./engine/registry.ts";
// Registers every ported game; `beforeAll` re-runs it in case a sibling file
// reset the shared registry under `isolate: false`.
import { registerAllGames } from "./games/index.ts";
import { puzzleDataMap, puzzleIds } from "./puzzle/catalog.ts";

beforeAll(registerAllGames);

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

// ---------------------------------------------------------------------------
// The site-level pages, held to the app rather than to a list of their own
// ---------------------------------------------------------------------------

/*
 * The three blocks below exist because the per-game invariant above has no
 * site-level counterpart, and the same class of miss followed it: on 2026-08-06
 * the whole of `help/` mentioned hints **once**, in passing, in a note about a
 * different puzzle — while thirty games shipped an explained `hint()` written to
 * a 2,500-line quality bar. Nothing could notice, because nothing was asked.
 *
 * ON THE INSTRUMENT. The tempting check — "does `features.md` contain the word
 * hint?" — is a grep for a spelling standing in for a resolved reference, which
 * is this repo's most-repeated defect (`grid.test.ts`'s `d.edges.length ===
 * d.order`, `touch-input.test.ts`'s catalog-vs-registry count, the silently
 * empty `import.meta.glob`, both halves of `retire-the-upstream-help-tree`'s
 * dead-link grep). Worse, it can only ever compare the help against a list
 * kept in the help's own test: it notices a section being **deleted** and never
 * a feature being **omitted**, which is the failure that actually happened.
 *
 * So the list comes from the `Game` contract. Every optional member is
 * classified, the classification is read against the contract's own AST, and an
 * **unclassified member fails** — a new capability cannot reach players without
 * someone saying, in one line, where a player is told about it.
 */

/** The `game.ts` source, for the same AST read `contract-surface.test.ts` does.
 * Read through Vite so this file stays in the browser-shaped type world. */
const gameContractSource = import.meta.glob<string>("./engine/game.ts", {
  query: "?raw",
  import: "default",
  eager: true,
})["./engine/game.ts"];

/** `help/features.md`, the page the site-level coverage is asserted against. */
const featuresPage = import.meta.glob<string>("../help/features.md", {
  query: "?raw",
  import: "default",
  eager: true,
})["../help/features.md"];

/** Every markdown page the app serves, site-level and per-game alike. */
const allHelpPages = import.meta.glob<string>("../help/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The app's icon map as text — the naming convention a help glyph follows.
 * (It is not the *resolution* path: see "the help's glyphs are a closed set".) */
const iconsSource = import.meta.glob<string>("./icons.ts", {
  query: "?raw",
  import: "default",
  eager: true,
})["./icons.ts"];

/** The optional members of the `Game` interface, read off its declaration. */
function optionalGameMembers(): string[] {
  if (gameContractSource === undefined) {
    throw new Error("help-coverage: engine/game.ts not found");
  }
  const src = ts.createSourceFile(
    "game.ts",
    gameContractSource,
    ts.ScriptTarget.ESNext,
    true,
  );
  for (const st of src.statements) {
    if (!ts.isInterfaceDeclaration(st) || st.name.text !== "Game") continue;
    return st.members
      .filter((m) => m.questionToken !== undefined && m.name !== undefined)
      .map((m) => (m.name as ts.Identifier).text);
  }
  throw new Error("help-coverage: no `Game` interface in game.ts");
}

/**
 * Where a player is told about each optional capability.
 *
 * - `features` — a feature of *this* fork, documented at that anchor in
 *   `help/features.md`. The anchor must exist; that is the checked half.
 * - `upstream` — a feature the original collection has too, covered by the
 *   manual `features.md` links to in its opening paragraph.
 * - `internal` — no player-visible surface of its own.
 *
 * **The boundary is not "did upstream have it" but "can a player find it
 * without being told".** Filling in every pencil mark is upstream's `M` key,
 * and a touch player has no `M` key, so the button we added is ours to explain.
 */
type Coverage =
  | { kind: "features"; anchor: string; why: string }
  | { kind: "upstream"; why: string }
  | { kind: "internal"; why: string };

const CAPABILITY_COVERAGE: Record<string, Coverage> = {
  // --- this fork's own, and the reason this file grew these blocks ---
  hint: { kind: "features", anchor: "hints", why: "the explained-hint stepper" },
  findMistakes: {
    kind: "features",
    anchor: "checking",
    why: "the mistake overlay, and the save it gates",
  },
  difficulty: {
    kind: "features",
    anchor: "difficulty",
    why: "what a tier name promises — `Unreasonable` above all",
  },
  canMarkAll: {
    kind: "features",
    anchor: "mark-all",
    why: "a toolbar button with no keyboard equivalent a touch player can reach",
  },
  reference: { kind: "features", anchor: "reference", why: "the reference panel" },
  selectReference: {
    kind: "features",
    anchor: "reference",
    why: "picking an item highlights where it can go — same section",
  },
  ignoresSecondaryButton: {
    kind: "features",
    anchor: "right-mouse",
    why: "why the touch right-click gestures are off in some puzzles",
  },
  requestKeys: {
    kind: "features",
    anchor: "virtual-keyboard",
    why: "the on-screen keyboard's keys are this",
  },
  textFormat: {
    kind: "features",
    anchor: "sharing",
    why: "Copy as text, in the share dialog",
  },

  // --- the original collection's, covered by the manual features.md links to ---
  solve: { kind: "upstream", why: "Solve is upstream's, with upstream's meaning" },
  prefs: { kind: "upstream", why: "per-game preferences" },
  paramConfig: { kind: "upstream", why: "the Custom type dialog" },
  describeParams: { kind: "upstream", why: "the type menu's label for a params set" },
  statusbarText: { kind: "upstream", why: "the status line" },

  // --- no player-visible surface of their own ---
  wantsStylusModifier: {
    kind: "internal",
    why: "how a press is read, not a control; the effect is the game's own",
  },
  supersededDesc: { kind: "internal", why: "how a save rebuilds a board that moved" },
  changedState: { kind: "internal", why: "a game's own bookkeeping across a move" },
  hintKeepTrack: { kind: "internal", why: "how a plan survives the player's own move" },
  refreshHintStep: { kind: "internal", why: "re-validating a stored step" },
  uiUpdateClearsHint: { kind: "internal", why: "when a UI change invalidates a step" },
  preferredTileSize: { kind: "internal", why: "layout" },
  setTileSize: { kind: "internal", why: "layout" },
  animLength: { kind: "internal", why: "animation timing" },
  flashLength: { kind: "internal", why: "animation timing" },
  timingState: { kind: "internal", why: "whether the clock runs" },
  serializeMove: { kind: "internal", why: "save format" },
  deserializeMove: { kind: "internal", why: "save format" },
  encodeUi: { kind: "internal", why: "save format" },
  decodeUi: { kind: "internal", why: "save format" },
};

/** Every `{#anchor}` defined by a heading in `features.md`. */
function featuresAnchors(): Set<string> {
  if (featuresPage === undefined) {
    throw new Error("help-coverage: help/features.md not found");
  }
  return new Set(
    [...featuresPage.matchAll(/^#{2,6}[^\n]*\{#([a-z0-9-]+)\}\s*$/gm)].map((m) => m[1]),
  );
}

describe("every player-facing capability is documented somewhere", () => {
  const members = optionalGameMembers();

  it("inspects the whole optional surface of the contract", () => {
    // Vacuity: an AST read that matched nothing would pass every assertion
    // below over an empty list and report health.
    expect(members.length).toBeGreaterThan(20);
    expect(members).toContain("hint");
  });

  it("classifies every optional member — a new capability cannot slip through", () => {
    const unclassified = members.filter((m) => !(m in CAPABILITY_COVERAGE));
    expect(
      unclassified,
      "a new `Game` capability needs a line in CAPABILITY_COVERAGE saying where " +
        "a player is told about it (or that they need not be)",
    ).toEqual([]);
  });

  it("classifies nothing the contract no longer offers", () => {
    const known = new Set(members);
    const stale = Object.keys(CAPABILITY_COVERAGE).filter((m) => !known.has(m));
    expect(stale, "CAPABILITY_COVERAGE names a member `Game` does not have").toEqual(
      [],
    );
  });

  it("has the features.md section every `features` classification claims", () => {
    const anchors = featuresAnchors();
    // Vacuity: a heading pattern that stopped matching would make every
    // `features` claim below unfalsifiable.
    expect(anchors.size).toBeGreaterThan(5);

    const missing = Object.entries(CAPABILITY_COVERAGE)
      .filter(([, c]) => c.kind === "features")
      .map(([m, c]) => [m, (c as { anchor: string }).anchor] as const)
      .filter(([, anchor]) => !anchors.has(anchor))
      .map(([m, anchor]) => `${m} → help/features.md#${anchor}`);
    expect(missing, "a documented capability's help section is gone").toEqual([]);
  });
});

describe("the populations the help asserts are derived, not trusted", () => {
  /*
   * `features.md` is allowed to name games in one place — the puzzles whose
   * touch right-click gestures are switched off — precisely because that list
   * is `ignoresSecondaryButton`, and this holds the prose to the flag.
   *
   * The rule the help follows is "state the property, do not hand-maintain the
   * population". A named population a test *derives* cannot rot; one a human
   * maintains will, which is what the ban is actually about.
   */
  it("names exactly the puzzles whose secondary-button gestures are off", () => {
    const flagged = registeredGameIds()
      .filter((id) => getTsGame(id)?.ignoresSecondaryButton === true)
      .map((id) => puzzleDataMap[id]?.name ?? id)
      .sort();
    expect(
      flagged.length,
      "no game declares the flag — derivation is vacuous",
    ).toBeGreaterThan(0);

    const paragraph = /have no use for a right-click[^.]*?—([^.]*)\./s.exec(
      featuresPage ?? "",
    )?.[1];
    expect(paragraph, "the §Right mouse sentence naming them has moved").toBeDefined();
    const named = (paragraph ?? "")
      .replace(/\*\*/g, "")
      .split(/,|\band\b/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .sort();
    expect(named).toEqual(flagged);
  });

  /*
   * `Unreasonable` is a promise, not a boast: it is the one tier name allowed to
   * mean "deduction may not finish this board" (`ts-engine`). Thirteen games
   * ship one and, until this change, nothing player-facing said so — which made
   * a hint that had honestly run out indistinguishable from a broken one.
   */
  it("explains the tier name as long as any game ships it", () => {
    const shipping = registeredGameIds().filter((id) =>
      getTsGame(id)?.difficulty?.tiers.includes("Unreasonable"),
    );
    expect(
      shipping.length,
      "no game declares the tier — derivation is vacuous",
    ).toBeGreaterThan(0);
    expect(
      featuresAnchors().has("difficulty"),
      `${shipping.length} games offer an Unreasonable tier; features.md must say what it promises`,
    ).toBe(true);
  });
});

describe("the help's glyphs are a closed set", () => {
  /*
   * `::hint::` renders `<span class="icon icon-hint">`, and `--icon` on
   * `.icon-hint` in `src/css/help.css` is the only thing that puts a picture
   * there. A name with no rule renders as **empty space** — no build error, no
   * console warning, nothing.
   *
   * **The forward direction is asserted in `vite-plugins/extra-pages.ts`, not
   * here**, and deliberately: Vitest stubs every CSS import to the empty string
   * (`?raw` included, since the stub is applied by the CSS pipeline the query
   * still goes through), so this file cannot read the stylesheet at all — the
   * first cut tried, and its own vacuity guard convicted it. The plugin can, it
   * already has the icon name in hand, and it is where the standing TODO asking
   * for this check was written. `vite build` is in the pre-commit gate.
   *
   * What is left here is the direction that needs no stylesheet: the glyphs the
   * help asks for, held to the app's own icon names. A `::typo::` is caught by
   * the plugin as a missing rule; a *rule* for a glyph nobody uses is caught by
   * the plugin never touching it, which is why the reverse check is the one
   * worth keeping cheap.
   */
  const used = [
    ...new Set(
      Object.values(allHelpPages).flatMap((page) =>
        [...page.matchAll(/::([a-z0-9-]+)(?:\|[^:]*)?::/g)].map((m) => m[1]),
      ),
    ),
  ].sort();

  it("is not vacuous — the pages were read and the glyph pattern matched", () => {
    expect(Object.keys(allHelpPages).length).toBeGreaterThan(50);
    expect(used.length).toBeGreaterThan(10);
  });

  it("names only glyphs the app itself has an icon for", () => {
    // `src/icons.ts` is not loaded by a help page, so this is not the
    // resolution path — it is the naming convention, which is worth holding to
    // so a help glyph and the toolbar button it describes stay the same picture.
    const appIconNames = new Set(
      [...(iconsSource ?? "").matchAll(/^\s*"?([a-z0-9-]+)"?:\s*\w+Icon,/gm)].map(
        (m) => m[1],
      ),
    );
    expect(appIconNames.size, "the icon map pattern stopped matching").toBeGreaterThan(
      20,
    );
    // The help has a handful of glyphs of its own (install instructions,
    // `experimental`) that no app control uses; they are named here so the set
    // stays closed rather than the assertion being softened to a subset test.
    const HELP_ONLY = new Set([
      "edge-app-available",
      "ellipsis",
      "ellipsis-vertical",
      "experimental",
      "firefox-web-apps",
      "install-desktop",
      "ios-add-to-home-screen",
      "ios-share",
    ]);
    const unknown = used.filter((n) => !appIconNames.has(n) && !HELP_ONLY.has(n));
    expect(
      unknown,
      "a help glyph names neither an app icon nor a known help-only one",
    ).toEqual([]);
  });
});
