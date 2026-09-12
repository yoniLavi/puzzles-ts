/**
 * **Who is in a shared mechanic, and did they actually use it** — the two
 * questions every cross-game guard asks, written once. Each guard needs the same
 * four steps: build every game, filter it to the members, put a floor under the
 * count so a sweep that found nothing cannot report health, and name the
 * offenders in the failure.
 *
 * ON WHY THIS IS DERIVED AND NOT DECLARED. A game could instead *declare* its
 * capabilities and the guards read the manifest, but a declaration can be
 * forgotten by a new game, left behind by a changed one, or simply wrong, and
 * nothing notices. Everything here reads what the game *is*: the object it
 * registers, the `Ui` its `newUi` returns, the code of its own source. None of
 * those can drift from the game, because they are the game.
 *
 * The rule is the `ts-engine` spec's "A shared mechanic is joined by having it"
 * (followable form: `docs/games/testing.md` § "How a cross-game guard finds its
 * population"). A value a *mechanism consumes* (a technique's tier, a
 * `paramConfig` field list) is a healthy declaration and not what this is
 * against.
 *
 * Dev/test-only; never imported by production code.
 */

import ts from "typescript";
import "../../games/index.ts";
import type { Game } from "../game.ts";
import { randomNew } from "../random/index.ts";
import { getTsGame, registeredGameIds } from "../registry.ts";

// biome-ignore lint/suspicious/noExplicitAny: a deliberately game-agnostic probe.
export type AnyGame = Game<any, any, any, any, any, any>;

/** One registered game, with a board and a fresh `Ui` built from it. */
export interface BuiltGame {
  readonly id: string;
  readonly game: AnyGame;
  /** A default-params board, from a fixed seed so a failure names the same one
   * every run. */
  readonly state: unknown;
  /** What this game's `newUi` actually returns — the thing to read a
   * capability off, rather than asking the game to announce one. */
  readonly ui: Record<string, unknown>;
  /** The other half of what a game remembers: what its `newDrawState`
   * returns, **unsized** — the vocabulary the game's own constructor declares.
   *
   * Not passed through `sizedDrawState`, and that is the whole point:
   * `setTileSize` *assigns* into the draw state, so sizing puts back any field
   * it writes. Flood's is `ds.tilesize = ts`, so a `tilesize` deleted from
   * `newDrawState`'s literal reappears and the snapshot cannot see the loss —
   * and `tilesize` is the field 55 of 57 games' `setTileSize` writes. Sizing
   * was the first cut here; it passed with the field removed.
   *
   * The hazard sizing was meant to cover — a draw state that assigns
   * conditionally on its tile size, and so under-reports unsized — is
   * asserted against instead, in `capability-surface.test.ts`. */
  readonly drawState: Record<string, unknown>;
}

let built: BuiltGame[] | null = null;

/**
 * Every registered game, id-sorted, each with a board and a `Ui`. Memoized:
 * generating every board is the expensive part of a cross-game sweep, so the
 * guards in one worker share a single set.
 */
export function builtGames(): BuiltGame[] {
  if (built) return built;
  built = registeredGameIds()
    .sort()
    .map((id): BuiltGame => {
      const game = getTsGame(id) as AnyGame | undefined;
      if (!game) throw new Error(`${id} is registered but has no game object`);
      const params = game.defaultParams();
      const desc = game.newDesc(params, randomNew(`enrollment-${id}`)).desc;
      const state = game.newState(params, desc);
      return {
        id,
        game,
        state,
        ui: game.newUi(state) as Record<string, unknown>,
        drawState: game.newDrawState(state) as Record<string, unknown>,
      };
    });
  return built;
}

export interface Enrollment {
  /** The member ids, sorted. */
  readonly ids: string[];
  /** How many games the registry offered the filter — **the vacuity number**.
   * Assert a floor under *this*, not only under `ids`: a filtered count can
   * look healthy while the set it was drawn from is short, which is how a
   * derived sweep reports health having looked at nothing. */
  readonly population: number;
}

/**
 * The games a predicate accepts, read off what each game actually is.
 *
 * ```ts
 * const noteTaking = enrolledIn((g) => typeof g.ui.pencilMode === "boolean");
 * expect(noteTaking.population).toBeGreaterThanOrEqual(50); // vacuity guard
 * expect(noteTaking.ids).toEqual([...]);
 * ```
 */
export function enrolledIn(isMember: (g: BuiltGame) => boolean): Enrollment {
  const all = builtGames();
  return { ids: all.filter(isMember).map((g) => g.id), population: all.length };
}

// --- what each game can do, derived ----------------------------------------

/**
 * The optional members of the `Game` interface, read off its own declaration.
 *
 * The same derivation `contract-surface.test.ts` makes, for the complementary
 * question. That file asks, per *member*, "does anyone implement this and does
 * anyone read it"; this asks, per *game*, "what can it do" — so both must start
 * from the interface itself rather than from a list somebody typed, or a
 * capability added to `Game` is invisible to both.
 */
export const OPTIONAL_GAME_MEMBERS: readonly string[] = (() => {
  const modules = import.meta.glob<string>("../game.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  const text = Object.values(modules)[0];
  if (text === undefined) throw new Error("enrollment: engine/game.ts not found");
  const src = ts.createSourceFile("game.ts", text, ts.ScriptTarget.ESNext, true);
  for (const st of src.statements) {
    if (!ts.isInterfaceDeclaration(st) || st.name.text !== "Game") continue;
    const names = st.members
      .filter((m) => m.questionToken !== undefined && m.name !== undefined)
      .map((m) => (m.name as ts.Identifier).text)
      .sort();
    if (names.length === 0)
      throw new Error("enrollment: `Game` has no optional members");
    return names;
  }
  throw new Error("enrollment: no `Game` interface in engine/game.ts");
})();

/** Everything one game is observably able to do. */
export interface CapabilitySet {
  readonly id: string;
  /** The optional `Game` members this game actually carries, sorted. */
  readonly members: string[];
  /** The fields its `newUi` actually returned, sorted. */
  readonly ui: string[];
  /** The fields its `newDrawState` actually returned, sorted.
   *
   * **Names only, deliberately** — not sizes, values or types. A snapshot that
   * moves for a reason other than a game's vocabulary is noise, and noise
   * trains its readers to re-baseline without reading.
   *
   * The `Ui` half cannot see the whole of the drag or pencil vocabulary,
   * because half of it is remembered by the renderer: nine private
   * `drawPencilIndicator` copies shared `pencilModeShown` and no instrument in
   * the tree could see them (`promote-the-pencil-indicator`). jscpd could not
   * either, because each copy computed its own box. */
  readonly drawState: string[];
}

/**
 * What every registered game can do, read off the game, its `Ui` and its draw
 * state.
 *
 * The guard against *silent capability loss*: a refactored game that quietly
 * stops offering its keypad, its reference aid or its mistake checking still
 * compiles, still plays, and still passes most of its own tests. A declared
 * manifest cannot catch that, because the edit that drops the capability drops
 * its manifest entry too. A set read off the object cannot be edited into
 * agreement with a mistake.
 */
export function capabilitySets(): CapabilitySet[] {
  return builtGames().map((g) => ({
    id: g.id,
    members: OPTIONAL_GAME_MEMBERS.filter((m) =>
      Object.hasOwn(g.game as object, m),
    ).sort(),
    ui: Object.keys(g.ui).sort(),
    drawState: Object.keys(g.drawState).sort(),
  }));
}

/** Every game's own sources, by game id — test files excluded, because a guard
 * asking "does this game hand-roll the mechanic" must not be satisfied by a
 * test that merely mentions the helper. */
const sourceText = (() => {
  const modules = import.meta.glob<string>("../../games/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  const byGame = new Map<string, string[]>();
  for (const [path, text] of Object.entries(modules)) {
    if (path.includes(".test.")) continue;
    const id = path.split("/")[3];
    if (!id) continue;
    const list = byGame.get(id) ?? [];
    list.push(text);
    byGame.set(id, list);
  }
  return byGame;
})();

/** How many game source files were scanned — the source sweep's own vacuity
 * number. An unmatched glob yields `{}`, and every check over it then passes. */
export const SCANNED_SOURCE_FILES = [...sourceText.values()].reduce(
  (n, list) => n + list.length,
  0,
);

/**
 * Source text with every comment removed — **because a comment is not a use**.
 * A raw-text scan once scored a flag consumed on the strength of a
 * commented-out line, and convicted Net of a stylus branch for the comment
 * documenting its absence.
 *
 * Stripping beats a narrower marker, because narrowing the key is the error:
 * `& MOD_STYLUS` misses a game that writes the test across two lines. Key on the
 * name, take the superset, and remove the one context in which a name is not a
 * use. `transpileModule` is the cheap way to drop comments without mangling a
 * string that contains `//`; at ~5 ms per file a whole-collection scan pays
 * ~1.5 s once per worker, and only the guards that scan pay it.
 */
const stripComments = (text: string): string =>
  ts.transpileModule(text, {
    compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext },
  }).outputText;

/** Each game's comment-stripped sources, computed on first ask and kept. */
const codeText = new Map<string, string[]>();

function gameCode(id: string): string[] {
  const cached = codeText.get(id);
  if (cached) return cached;
  const stripped = (sourceText.get(id) ?? []).map(stripComments);
  codeText.set(id, stripped);
  return stripped;
}

/** Every line of `code` matching `re`, trimmed and tagged with `id`. */
function linesMatching(id: string, code: string, re: RegExp) {
  return code
    .split("\n")
    .filter((line) => re.test(line))
    .map((line) => ({ id, line: line.trim() }));
}

/**
 * Which of `ids` never mention `marker` in their own **code**.
 *
 * **The reverse direction, and the one no behavioral test can see**: what is
 * being asserted is that a hand-rolled copy of the shared mechanic does *not*
 * exist, and code that does not exist cannot be observed by running anything.
 *
 * `marker` should be the thing a caller would have to write — a function name
 * with its opening paren, a module path, or an imported constant — so that
 * importing the module and never calling it does not count as using it.
 */
export function membersNotMentioning(ids: string[], marker: string): string[] {
  return ids.filter((id) => !gameCode(id).some((t) => t.includes(marker)));
}

/**
 * Every line of `ids`' own **code** matching `re`, tagged with the game it came
 * from — the affirmative counterpart to {@link membersNotMentioning}.
 *
 * Comment-stripped for the same reason: a rule about what a game *says to a
 * player* must not fire on a doc comment discussing it.
 *
 * The caller gets a superset — every match anywhere in the code, not only in a
 * narration string — and is expected to classify what it catches rather than
 * narrow the pattern (`AGENTS.md` § "A scan that keys on a name"). Narrowing to
 * "string literals inside `explain()`" is how a sweep comes to miss the arm
 * that was written somewhere else.
 */
export function codeLinesMatching(
  ids: string[],
  re: RegExp,
): { id: string; line: string }[] {
  return ids.flatMap((id) =>
    gameCode(id).flatMap((code) => linesMatching(id, code, re)),
  );
}

/**
 * The engine's own shipped sources, by module path — **excluding `testing/`**,
 * which is dev-only infrastructure by the repo's layout rather than by a list
 * of filenames anyone has to maintain.
 *
 * A rule about what a game says to a player cannot stop at the game
 * directories, because a family's narration is often written *once* in the
 * engine and shared: `latin-hint.ts` narrates for the Latin games and
 * `candidate-hint.ts` for the candidate-elimination ones, so a sweep over
 * `games/**` alone reports a clean collection while the sentence every one of
 * those games actually shows sits outside it.
 */
const engineSource = (() => {
  // Root-anchored deliberately: a `../**/*.ts` glob from this file normalizes a
  // sibling back to `./name.ts`, so a `/testing/` filter would match nothing
  // and the exclusion below would not happen.
  const modules = import.meta.glob<string>("/src/engine/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  const out = new Map<string, string>();
  for (const [path, text] of Object.entries(modules)) {
    if (path.includes(".test.") || path.includes("/engine/testing/")) continue;
    out.set(path.replace("/src/", ""), text);
  }
  return out;
})();

/** How many engine modules {@link engineCodeLinesMatching} scans — its vacuity
 * number, owed for the same reason {@link SCANNED_SOURCE_FILES} is. */
export const SCANNED_ENGINE_FILES = engineSource.size;

/** Every line of the engine's shipped code matching `re`, tagged by module.
 * The engine counterpart to {@link codeLinesMatching}, comment-stripped for the
 * same reason. */
export function engineCodeLinesMatching(re: RegExp): { id: string; line: string }[] {
  return [...engineSource].flatMap(([path, text]) =>
    linesMatching(path, stripComments(text), re),
  );
}
