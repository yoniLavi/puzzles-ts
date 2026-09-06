/**
 * **Who is in a shared mechanic, and did they actually use it** — the two
 * questions every cross-game guard in this repo asks, written once.
 *
 * Sixteen files derive a population from the registry and sixteen scan game
 * sources, and each had hand-written the same four steps: build every game,
 * filter it to the members, put a floor under the count so a sweep that found
 * nothing cannot report health, and name the offenders in the failure. Writing
 * two more of those (`note-taking-cell.test.ts`, `border-grid-render.test.ts`)
 * is what made the pattern worth extracting — *N guards sharing a shape means
 * the layer below them is missing*, which is the same rule the games are held
 * to, one level up.
 *
 * ON WHY THIS IS DERIVED AND NOT DECLARED. A game could instead *declare* its
 * capabilities and the guards read the manifest. This repo has already run that
 * experiment and reversed it: `audit-input-mode-parity` deleted eighteen
 * `needsRightButton` declarations because deriving the property from each
 * game's own behavior was strictly stronger — a declaration can be forgotten by
 * a new game, left behind by a changed one, or simply wrong, and nothing
 * notices. Everything here reads what the game *is*: the object it registers,
 * the `Ui` its `newUi` returns, the text of its own source. None of those can
 * drift from the game, because they are the game.
 *
 * Dev/test-only; never imported by production code.
 */

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
 * Which of `ids` never mention `marker` anywhere in their own sources.
 *
 * **The reverse direction, and the one no behavioral test can see**: what is
 * being asserted is that a hand-rolled copy of the shared mechanic does *not*
 * exist, and code that does not exist cannot be observed by running anything.
 * It is a source scan for that reason, not for convenience.
 *
 * `marker` should be the thing a caller would have to write — a function name
 * with its opening paren, or a module path — so that importing the module and
 * never calling it does not count as using it.
 */
export function membersNotMentioning(ids: string[], marker: string): string[] {
  return ids.filter(
    (id) => !(sourceText.get(id) ?? []).some((t) => t.includes(marker)),
  );
}
