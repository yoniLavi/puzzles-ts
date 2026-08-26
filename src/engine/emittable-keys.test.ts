/**
 * **A game and the frontend must agree about input** — two source scans that no
 * behavioural test can replace, because each asserts the *absence* of something.
 *
 * ## 1. No game may test a button code this frontend cannot send
 *
 * Invisible from every other angle. A game's own tests feed `interpretMove` the
 * button directly, so an arm testing `8` handles `8` perfectly and passes. A
 * `Midend`-level sweep does the same. The defect is not in the game at all — it
 * is that nothing upstream of it ever emits that code, so the arm is a **key
 * that can never fire**, and the only symptom is a player pressing a key and
 * nothing happening.
 *
 * Three disguises, all shipped:
 *
 * - `MOD_NUM_KEYPAD | '7'` — the *reason* long recorded for this one was wrong
 *   (the frontend does set the bit), but the gap is real: a numpad key only
 *   arrives as a digit with Num Lock on, and Inertia's diagonals were
 *   keypad-only;
 * - `button == ' '` — Space arrives as `CURSOR_SELECT2`, so Slide's Solve route
 *   could not be walked;
 * - `button === 8` for Backspace — the key map sends **127**. This one had
 *   reached **fourteen of the fifty-seven games**.
 *
 * ## 2. No game may privately restate what `engine/pointer.ts` already owns
 *
 * Every instance of §1 began as a local copy of a frontend fact — `const
 * BACKSPACE = 8` beside the code that used it. The copies are how the collection
 * drifts: `isMouseDown` and its two siblings were promoted to `pointer.ts` after
 * *27* ports had each written their own, and three games still had theirs.
 *
 * So this asserts the general rule rather than re-listing victims: a game may
 * not declare a name `pointer.ts` exports. It is derived from `pointer.ts`'s
 * actual export list, so a helper added there is guarded the day it lands —
 * nobody has to remember this test exists.
 *
 * See docs/games/input.md § "The numeric keypad never arrives".
 */

import { beforeAll, describe, expect, it } from "vitest";
import { registerAllGames } from "../games/index.ts";
import { BACKSPACE, DELETE, ESCAPE } from "./pointer.ts";
import { getTsGame, registeredGameIds } from "./registry.ts";
import { type KeyLabel, PuzzleButton } from "./types.ts";

beforeAll(registerAllGames);

/**
 * Sources as text, via Vite's `import.meta.glob` rather than `node:fs` —
 * following `asset-integrity.test.ts` and `palette-source.test.ts`, which keeps
 * the test inside the browser-shaped type world and preserves the project's
 * `"types": []` posture.
 *
 * A glob is not an import specifier, so a bulk rewriter that repoints imports
 * after a file move leaves it behind — and an unmatched glob yields `{}`, so
 * every assertion below would pass over nothing. That is what the vacuity
 * assertions are for.
 */
const frontendSource: string = Object.values(
  import.meta.glob<string>("../puzzle/components/view-interactive.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0];

const gameModules = import.meta.glob<string>("../games/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

const pointerSource: string = Object.values(
  import.meta.glob<string>("./pointer.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0];

/**
 * Every code the **on-screen key panel** can deliver, read from the live
 * registry. `puzzle-keys` sends a `KeyLabel.button` straight to
 * `Puzzle.processKey`, so the panel is a second emitter and the key map is not
 * the whole frontend — a distinction this test originally got wrong, asserting
 * that 8 could not be sent while twelve games' `clearKey` was sending it.
 *
 * Derived rather than listed, so a game that adds a bespoke key is covered on
 * the day it registers.
 */
function panelCodesByGame(): Map<string, Set<number>> {
  const byGame = new Map<string, Set<number>>();
  for (const id of registeredGameIds()) {
    const game = getTsGame(id) as
      | { requestKeys?: (p: unknown) => KeyLabel[]; defaultParams: () => unknown }
      | undefined;
    if (!game?.requestKeys) continue;
    byGame.set(
      id,
      new Set(game.requestKeys(game.defaultParams()).map((k) => k.button)),
    );
  }
  return byGame;
}

/** `../games/unruly/index.ts` → `unruly`. */
function gameIdOf(path: string): string {
  return /\/games\/([^/]+)\//.exec(path)?.[1] ?? "";
}

/**
 * Every code `puzzleKeyMap` can deliver, read **from the frontend source**
 * rather than restated here. Restating it would make this test agree with a
 * copy of the map instead of with the map — the exact shape of "a guard that
 * measures a neighbour of the thing it guards".
 *
 * Entries are either a bare number (`Escape: 27`) or a `PuzzleButton.NAME`,
 * which is resolved through the real enum.
 *
 * Printable characters (32..126) are excluded from the analysis entirely: the
 * key map falls through to "any single character → its char code", so every one
 * of them is emittable and a game testing `'m'` is fine.
 */
function emittableCodes(): Set<number> {
  const map = /static puzzleKeyMap[^{]*\{([\s\S]*?)\n {2}\} as const;/.exec(
    frontendSource ?? "",
  );
  if (!map) throw new Error("emittable-keys: could not find puzzleKeyMap");

  const codes = new Set<number>();
  for (const [, value] of map[1].matchAll(/^\s*(?:"[^"]*"|[\w ]+):\s*(.+?),\s*$/gm)) {
    const raw = value.trim();
    const named = /^PuzzleButton\.(\w+)$/.exec(raw);
    const n = named
      ? (PuzzleButton as unknown as Record<string, number>)[named[1]]
      : Number(raw);
    if (Number.isInteger(n)) codes.add(n);
  }
  return codes;
}

/** Every non-test `.ts` file under `src/games/`, with its path. */
function gameSources(): { path: string; text: string }[] {
  return Object.entries(gameModules)
    .filter(([path]) => !path.includes(".test."))
    .map(([path, text]) => ({ path, text }));
}

/**
 * Numeric literals a game compares a button against — `button === 8`,
 * `btn === 0x30`. Deliberately narrow: it matches the *shape that has actually
 * shipped the bug* rather than trying to understand the expression, so it
 * cannot quietly stop matching anything. Its own vacuity is asserted below.
 */
const COMPARISON =
  /\b(?:button|btn|raw|rawButton|key)\s*===?\s*(0x[0-9a-fA-F]+|\d+)\b/g;

/**
 * The second shape, and it shipped a live defect that the first could not see.
 *
 * `switch (button) { case 8: … }` compares a button against a control code
 * exactly as `button === 8` does, and the regex above matches neither the
 * `switch` header nor the `case`. Unruly's `decideValue` carried `case 8:` for
 * months *after* the collection-wide erase-key sweep had "fixed" it — its
 * `interpretMove` gate called `isEraseKey`, so `DELETE` (127) passed the gate,
 * reached the switch, matched nothing and fell through to `default`. The erase
 * key read as wired at every level and was dead at the last one.
 *
 * A `case` cannot call a predicate, so the correct form spells both codes
 * (`case BACKSPACE: case DELETE:` — exemplar `subsets/index.ts`). This finds
 * the ones that spell only one, by scanning the body of each `switch` whose
 * subject is a button for numeric `case` labels.
 */
function switchCases(text: string): { line: number; code: number; src: string }[] {
  const out: { line: number; code: number; src: string }[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/switch\s*\(\s*(?:button|btn|raw|rawButton|key)\s*\)/.test(lines[i])) continue;
    // Walk to the closing brace by depth, so a nested block cannot end it early.
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      if (j > i) {
        const m = /^\s*case\s+(0x[0-9a-fA-F]+|\d+)\s*:/.exec(lines[j]);
        if (m) out.push({ line: j + 1, code: Number(m[1]), src: lines[j].trim() });
      }
      if (depth <= 0 && j > i) break;
    }
  }
  return out;
}

describe("no game tests a button this frontend cannot send", () => {
  const emittableFromKeyMap = emittableCodes();
  const panels = panelCodesByGame();
  /**
   * What can reach *this* game. The keyboard half is the same for everyone; the
   * panel half is not — `clearKey`'s button 8 reaches Abcd, which puts it on
   * its keypad, and reaches Unruly not at all, because Unruly has no keypad.
   * Taking the union across the collection instead would have excused exactly
   * the defect this scan exists to find.
   */
  const emittable = (path: string) =>
    new Set([...emittableFromKeyMap, ...(panels.get(gameIdOf(path)) ?? [])]);
  const sources = gameSources();

  it("reads a plausible key map and a plausible set of game sources", () => {
    // The vacuity guard, and it has already earned its place: the first cut of
    // the parser read only bare numbers, missed every `PuzzleButton.NAME`
    // entry, and this assertion is what said so.
    expect(emittableFromKeyMap.size).toBeGreaterThanOrEqual(8);
    expect(emittableFromKeyMap).toContain(DELETE);
    expect(emittableFromKeyMap).toContain(ESCAPE);
    expect(emittableFromKeyMap).toContain(PuzzleButton.CURSOR_UP);
    expect(sources.length).toBeGreaterThan(200);
    // …and the panel half, which would otherwise contribute nothing silently
    // if the registry were empty at collection time. The path→id mapping is
    // asserted too: a glob whose shape changed would key every lookup on `""`
    // and quietly hand every game an empty panel.
    expect(panels.size).toBeGreaterThanOrEqual(12);
    expect(gameIdOf("../games/unruly/index.ts")).toBe("unruly");
    expect(new Set(sources.map((f) => gameIdOf(f.path))).size).toBeGreaterThan(50);
  });

  it("finds the comparisons it claims to check", () => {
    // The second half of the vacuity guard, and the one that matters more: the
    // codes above are useless if nothing is scanned against them. Games do
    // compare buttons to numeric literals — mostly digits — and if that stops
    // being true this regex has gone stale rather than the collection having
    // become clean.
    const hits = sources.flatMap((f) => [...f.text.matchAll(COMPARISON)]);
    expect(hits.length).toBeGreaterThan(10);
  });

  it("has no comparison against an unsendable control code", () => {
    const dead: string[] = [];
    for (const { path, text } of sources) {
      const reachable = emittable(path);
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        for (const [, literal] of line.matchAll(COMPARISON)) {
          const code = Number(literal);
          // Printable ASCII always reaches games via the char-code fallback.
          if (code >= 32 && code <= 126) continue;
          if (reachable.has(code)) continue;
          dead.push(`${path}:${i + 1}  ${line.trim()}`);
        }
      });
      for (const { line, code, src } of switchCases(text)) {
        if (code >= 32 && code <= 126) continue;
        if (reachable.has(code)) continue;
        dead.push(`${path}:${line}  ${src}`);
      }
    }

    // **The keyboard cannot send 8; a keypad game's own panel can.**
    // `puzzleKeyMap` maps Backspace to 127, so a keyboard player never produces
    // upstream's `'\b'` — but `key-labels.ts`'s `clearKey` carries `button: 8`,
    // and on touch that panel is the only clear route there is. So the code is
    // reachable in Abcd, which offers it, and unreachable in Unruly, which has
    // no panel at all — which is why the set above is per-game and not a union
    // over the collection. A game with both meanings still wants `isEraseKey` /
    // `isCancelKey`, since a bare comparison is half-wired whichever half it
    // picks.
    expect(emittableFromKeyMap.has(BACKSPACE)).toBe(false);
    expect(emittable("../games/abcd/index.ts").has(BACKSPACE)).toBe(true);
    expect(emittable("../games/unruly/index.ts").has(BACKSPACE)).toBe(false);
    expect(dead).toEqual([]);
  });

  it("finds the switch-on-button cases it claims to check", () => {
    // Vacuity for the second shape, on the same terms as the first: five games
    // switch on a button, and if that stops being true this scan has gone
    // stale rather than the collection having become clean.
    const subjects = sources.filter((f) =>
      /switch\s*\(\s*(?:button|btn|raw|rawButton|key)\s*\)/.test(f.text),
    );
    expect(subjects.length).toBeGreaterThanOrEqual(5);
    // Three numeric labels survive the fix that motivated this scan — Unruly's
    // `'0'`, `'1'`, `'2'`, which are printable and therefore fine. The floor is
    // what is actually there rather than a round number, because a floor set
    // above the population is a test that fails for being right.
    expect(sources.flatMap((f) => switchCases(f.text)).length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("writes the named buttons by name, not as magic numbers", () => {
    // `button === 0x0209` *works* — it is `CURSOR_UP` — so this is not a
    // correctness bug today. It is the same drift that produced every entry
    // above: a game restating the shared vocabulary locally, where a rename or
    // a renumber in `pointer.ts` cannot reach it. Map, Rectangles and Tracks
    // each spelled all four arrow keys this way, two of them with the constant's
    // name in a trailing comment — which is a name that cannot be grepped, cannot
    // be renamed, and cannot be wrong out loud.
    const magic: string[] = [];
    for (const { path, text } of sources) {
      text.split("\n").forEach((line, i) => {
        for (const [, literal] of line.matchAll(COMPARISON)) {
          const code = Number(literal);
          if (code >= 0x200 && emittableFromKeyMap.has(code))
            magic.push(`${path}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(magic).toEqual([]);
  });

  it("has no named constant standing in for an unsendable code", () => {
    // The literal scan above cannot see `const KEY_BACKSPACE = 8; … button ===
    // KEY_BACKSPACE`. Seven games had exactly that.
    //
    // **This test's first cut matched on the constant's NAME** — BACKSPACE,
    // DELETE, ESCAPE — and it passed while ABCD and Crossing sat there with
    // `const CLEAR = 8`. That is this repo's most-repeated defect aimed at its
    // own guard: it measured a neighbour of the thing it guards. What actually
    // identifies the defect is the *value*, and what separates it from the many
    // legitimate `= 8`s (`COL_CURSOR`, `DIR_MAX`, `F_DOT_BLACK`) is that the
    // constant is then **compared against a button**. So match on both.
    const copies: string[] = [];
    for (const { path, text } of sources) {
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        const m = /^const (\w+)\s*=\s*(8|27)\s*;/.exec(line);
        if (!m) return;
        const used = new RegExp(
          `(?:button|btn|raw|rawButton|key)\\s*===?\\s*${m[1]}\\b|case ${m[1]}\\s*:`,
        );
        if (used.test(text)) copies.push(`${path}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(copies).toEqual([]);
  });

  it("keeps `MOD_NUM_KEYPAD` bindings paired with a bare-key route", () => {
    // **Not** because the modifier is dead. `docs/games/input.md` said for a
    // long time that "this web frontend does not set `MOD_NUM_KEYPAD`", and
    // that is false — `view-interactive.ts` sets it from
    // `event.location === 3`, and has since the initial webapp version. Cube
    // has a passing test asserting `MOD_NUM_KEYPAD | 0x38` steers the cube, and
    // Bricks calls the bit "load-bearing for the diagonals". An audit acting on
    // the doc would have deleted working code as dead.
    //
    // The real gap is narrower and still worth guarding: a numpad key only
    // arrives as a *digit* when Num Lock is on (with it off, numpad 7 is
    // `event.key === "Home"`, which the key map does not carry and the
    // char-code fallback rejects for being longer than one character), and a
    // laptop may have no numpad at all. So a keypad binding must never be the
    // *only* route to an input — which is what Inertia's diagonals were.
    for (const { path, text } of sources) {
      if (!/MOD_NUM_KEYPAD\s*\|/.test(text)) continue;
      // The bare form of the same key must be accepted somewhere in the file.
      expect(
        /button === (?:CURSOR_|0x3|4[89]|5[0-7])/.test(text) ||
          /DIGIT_DIRECTIONS|fromCharCode/.test(text),
        `${path} binds MOD_NUM_KEYPAD with no bare-key route`,
      ).toBe(true);
    }
  });
});

describe("no game privately restates what engine/pointer.ts owns", () => {
  const sources = gameSources();

  /** Every value `pointer.ts` exports, read from its source. Deriving the list
   * rather than writing one is the point: a helper added there is guarded on
   * the day it lands, with nobody remembering to extend this. */
  const exported = new Set(
    [...pointerSource.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]),
  );

  it("reads a plausible export list", () => {
    // Vacuity: an empty set would make the sweep below pass over nothing.
    expect(exported.size).toBeGreaterThanOrEqual(15);
    for (const name of ["isMouseDown", "isEraseKey", "gridCursorMove", "LEFT_BUTTON"])
      expect(exported).toContain(name);
  });

  it("finds no game-local declaration shadowing one", () => {
    const shadows: string[] = [];
    for (const { path, text } of sources) {
      text.split("\n").forEach((line, i) => {
        const m = /^(?:export )?(?:const|function) (\w+)\b/.exec(line);
        if (m && exported.has(m[1])) shadows.push(`${path}:${i + 1}  ${line.trim()}`);
      });
    }
    // Group, Tents and Untangle each carried their own `isMouseDown` family —
    // survivors of the promotion that removed 27 other copies. A private copy is
    // not wrong today; it is wrong the day the shared one changes, silently, in
    // whichever games kept theirs.
    expect(shadows).toEqual([]);
  });
});
