/**
 * **Who is in a shared mechanic, and did they actually use it** — the two
 * questions every cross-game guard in this repo asks, written once.
 *
 * The cross-game guards — the files importing this one, plus the ones deriving
 * a population straight from the registry — had each hand-written the same four
 * steps: build every game, filter it to the members, put a floor under the count
 * so a sweep that found nothing cannot report health, and name the offenders in
 * the failure. Writing two more of those (`note-taking-cell.test.ts`,
 * `border-grid-render.test.ts`) is what made the pattern worth extracting —
 * *N guards sharing a shape means the layer below them is missing*, which is the
 * same rule the games are held to, one level up.
 *
 * ON WHY THIS IS DERIVED AND NOT DECLARED. A game could instead *declare* its
 * capabilities and the guards read the manifest. This repo has already run that
 * experiment and reversed it: `audit-input-mode-parity` deleted eighteen
 * `needsRightButton` declarations because deriving the property from each
 * game's own behavior was strictly stronger — a declaration can be forgotten by
 * a new game, left behind by a changed one, or simply wrong, and nothing
 * notices. Everything here reads what the game *is*: the object it registers,
 * the `Ui` its `newUi` returns, the code of its own source. None of those can
 * drift from the game, because they are the game.
 *
 * That argument was surveyed against the whole population and upheld
 * (`audit-declared-versus-derived-capabilities`), so it is now a rule rather
 * than this module's opinion: the `ts-engine` spec, "A shared mechanic is joined
 * by having it", and `docs/games/testing.md` § "How a cross-game guard finds its
 * population". What the survey added is the distinction the argument above is
 * missing — a value a *mechanism consumes* (a technique's tier, a `paramConfig`
 * field list) is a healthy declaration and not what any of this is against.
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
}

let built: BuiltGame[] | null = null;

/**
 * Every registered game, id-sorted, each with a board and a `Ui`.
 *
 * **Memoized, and that is half the point.** Generating 57 boards is the
 * expensive part of a cross-game sweep, and before this every sweep that needed
 * a `Ui` paid it again — `cursor-vocabulary`, `completion-vocabulary` and the
 * note-taking guard each generated the same 57.
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
 * capability added to `Game` next month is invisible to both.
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
}

/**
 * What every registered game can do, read off the game and its `Ui`.
 *
 * **This is the guard `re-express-the-collection` runs before and after every
 * batch**, and the reason it is derived is the reason the whole sweep is risky:
 * its characteristic failure is *silent capability loss* — a converted game that
 * quietly stops offering its keypad, its reference aid or its mistake checking
 * still compiles, still plays, and still passes most of its own tests. A
 * declared manifest cannot catch that, because the change that drops the
 * capability drops its manifest entry in the same edit and nothing notices. A
 * set read off the object cannot be edited into agreement with a mistake.
 *
 * Both halves are read, never listed: `members` from `Object.hasOwn` against
 * the interface's own optional members, `ui` from the object `newUi` returned.
 */
export function capabilitySets(): CapabilitySet[] {
  return builtGames().map((g) => ({
    id: g.id,
    members: OPTIONAL_GAME_MEMBERS.filter((m) =>
      Object.hasOwn(g.game as object, m),
    ).sort(),
    ui: Object.keys(g.ui).sort(),
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
 * A game's own sources with every comment removed, computed on first ask and
 * kept — **because a comment is not a use**.
 *
 * The raw text is the wrong thing to scan, and the repo has now hit that twice.
 * `contract-surface.test.ts` records the first: `REQUIRE_RBUTTON`'s only textual
 * hit outside the games was a *commented-out* line proposing to read it, and a
 * grep would have scored the flag consumed. The second was this function, whose
 * first stylus check convicted Net for the comment *"No stylus branch: the
 * midend strips MOD_STYLUS for us"* — a game punished for documenting the
 * absence of the very thing it was accused of.
 *
 * Stripping is the fix rather than a narrower marker, because narrowing the key
 * is the error: `& MOD_STYLUS` would have missed a game that wrote the test
 * across two lines, and the collection has already produced a scan that found
 * one of six call sites for spelling the paren wrong. Key on the name, take the
 * superset, and remove the one context in which a name is not a use.
 *
 * `transpileModule` is used for the strip because it is the only cheap way to
 * drop comments without also mangling a string that contains `//`. It costs
 * ~5 ms per file, so a scan touching the whole collection pays ~1.5 s once per
 * worker — worth it for a check that is otherwise wrong, and paid by nobody who
 * does not scan.
 */
const codeText = new Map<string, string[]>();

function gameCode(id: string): string[] {
  const cached = codeText.get(id);
  if (cached) return cached;
  const stripped = (sourceText.get(id) ?? []).map(
    (text) =>
      ts.transpileModule(text, {
        compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext },
      }).outputText,
  );
  codeText.set(id, stripped);
  return stripped;
}

/**
 * Which of `ids` never mention `marker` in their own **code**.
 *
 * **The reverse direction, and the one no behavioral test can see**: what is
 * being asserted is that a hand-rolled copy of the shared mechanic does *not*
 * exist, and code that does not exist cannot be observed by running anything.
 * It is a source scan for that reason, not for convenience.
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
 * from — the affirmative counterpart to {@link membersNotMentioning}, which
 * answers "who never writes this" rather than "where is it written".
 *
 * Comment-stripped for the same reason: a rule about what a game *says to a
 * player* must not fire on a doc comment discussing it, and this file's own
 * header is exactly the prose that would trip such a check.
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
  const out: { id: string; line: string }[] = [];
  for (const id of ids) {
    for (const text of gameCode(id)) {
      for (const line of text.split("\n")) {
        if (re.test(line)) out.push({ id, line: line.trim() });
      }
    }
  }
  return out;
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
 * those games actually shows sits outside it. That is not hypothetical — it is
 * how the em-dash rule's first cut passed the source scan and was caught only
 * by the runtime sweep beside it.
 */
const engineSource = (() => {
  // Root-anchored deliberately: a `../**/*.ts` glob from this file normalizes a
  // sibling back to `./name.ts`, so a `/testing/` filter silently matched
  // nothing and the exclusion below did not happen.
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
  const out: { id: string; line: string }[] = [];
  for (const [path, text] of engineSource) {
    const code = ts.transpileModule(text, {
      compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext },
    }).outputText;
    for (const line of code.split("\n")) {
      if (re.test(line)) out.push({ id: path, line: line.trim() });
    }
  }
  return out;
}
