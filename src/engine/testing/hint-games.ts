/**
 * The enrolled set for every cross-game hint guard — **derived from the
 * registry, never authored**: a game is enrolled iff it declares `hint`, and
 * every file importing `HINT_GAMES` iterates it.
 *
 * A hand-maintained list is a thing a session has to remember, and a game left
 * off it gets none of the guards, silently: *a guard blind to a game cannot fire
 * on it.* Reading the declaration rather than scanning for the word matters too,
 * because games mention `hint` without declaring one (an unused `redraw`
 * parameter, Guess's unrelated `ui.hint`).
 *
 * **A game with no `hint()` is not a defect.** Some logic games stay hintless
 * deliberately, as the corpus for assessing the framework work; the bar that a
 * new game ships with a hint is stated in AGENTS.md.
 *
 * Dev/test-only; never imported by production code.
 */
import "../../games/index.ts";
import type { PresetMenu } from "../game.ts";
import { getTsGame, registeredGameIds } from "../registry.ts";
import { type AnyGame, membersNotMentioning } from "./enrollment.ts";

export type { AnyGame };

/**
 * Every registered game that declares a `hint()`, by puzzle id, sorted so the
 * guards iterate in a stable order. The side-effect import above is what
 * populates the registry (`games/index.ts` calls `registerAllGames()` on
 * evaluation).
 */
export const HINT_GAMES: [string, AnyGame][] = registeredGameIds()
  .sort()
  .map((id): [string, AnyGame] => [id, getTsGame(id) as AnyGame])
  .filter(([, game]) => typeof game.hint === "function");

/**
 * How many games the registry offered the filter above — the **vacuity guard**
 * every derived sweep owes. Every hint guard passes vacuously over an empty
 * `HINT_GAMES`, so a derivation that silently found nothing (an import cycle
 * leaving the registry unpopulated, a renamed accessor) would turn them all
 * green while checking nothing. `hint-enrollment.test.ts` floors the
 * *population*, not only the filtered result, which can look healthy while the
 * set it was drawn from is short.
 */
export const REGISTERED_GAME_COUNT = registeredGameIds().length;

/**
 * The games whose hint **plans by searching** rather than by deducing — derived
 * from each game's own comment-stripped source (it calls the shared slide
 * planner), never declared. The marker carries its opening paren so importing
 * the planner without calling it does not count.
 *
 * **Two guards read this for two different reasons, which is why it lives
 * here.** `hint-resume.test.ts` reads it to excuse a member the walk's
 * completion promise — a bounded search may honestly run out of reach.
 * `hint-quality.test.ts` and `hint-resume.test.ts` both read it to bound what
 * the *gate* walks, because a search is the one hint shape whose cost explodes
 * with board size: the walk is quadratic in it twice over (one full search per
 * move, and more moves on a bigger board). Measured 2026-09-09, the two members
 * were **43% of the whole suite's test time** — Sixteen 30%, Netslide 13%.
 *
 * A third game that calls the planner joins both concerns by *having* the
 * mechanic, and `hint-resume.test.ts`'s `SEARCH_REACH` ledger then fails until
 * someone writes down what covers its largest board.
 */
export const SEARCH_PLANNING_GAMES: readonly string[] = (() => {
  const ids = HINT_GAMES.map(([id]) => id);
  const without = new Set(membersNotMentioning(ids, "planSlides("));
  return ids.filter((id) => !without.has(id));
})();

/** True when a step declares no board marks at all — `highlights` absent, or an
 * object whose every field is empty. The candidate-elimination games' populate
 * opener (`{ area: [], targets: [], marks: [] }`) is the canonical case: its
 * banner narration is the whole display, so a frame it paints nothing on is
 * *correct*. Both cross-game guards need the same judgment — `hint-overlay`
 * to know which step must repaint a warm frame, `hint-quality` to know which
 * step must then carry words instead. */
export function declaresNoMarks(highlights: unknown): boolean {
  if (highlights == null) return true;
  if (typeof highlights !== "object") return false;
  return Object.values(highlights).every(
    (v) => v == null || (Array.isArray(v) && v.length === 0),
  );
}

/**
 * How many **distinct mark roles** a step declares — the count that decides
 * whether "this cell" points at anything: with one mark it is unambiguous, with
 * two it names neither unless the narration ties them.
 *
 * A role counts when its field carries board geometry: a non-empty array, a
 * cell index, or a coordinate object. A field holding a *mode* rather than a
 * place does not — Bricks' `forced: "shade"` and Lightup's `kind: "light"` say
 * what the step does, not where. Strings and booleans are therefore skipped,
 * which is the whole of the rule.
 *
 * Declared roles, not rendered ones: cheap enough to sweep every tier of every
 * game, and it cannot see a role the renderer ignores. `scripts/checks/
 * hint-deixis.test.ts` is where that limitation is written down.
 */
export function markRoles(highlights: unknown): number {
  if (highlights == null || typeof highlights !== "object") return 0;
  let roles = 0;
  for (const v of Object.values(highlights)) {
    if (Array.isArray(v)) {
      if (v.length > 0) roles++;
    } else if (typeof v === "number") {
      if (Number.isFinite(v) && v >= 0) roles++;
    } else if (v !== null && typeof v === "object") {
      roles++;
    }
  }
  return roles;
}

/** First leaf preset's params — a small, valid board for each game. */
export function firstLeaf<P>(menu: PresetMenu<P>): P {
  if (menu.params !== undefined) return menu.params;
  for (const sub of menu.submenu ?? []) {
    const p = firstLeaf(sub);
    if (p !== undefined) return p;
  }
  throw new Error("no leaf preset");
}

/**
 * Every leaf preset a game offers, with the title its menu shows.
 *
 * **A cross-game sweep keyed on tier is blind to the games that have none**, so
 * a sweep walks one preset per tier where a game has tiers, and its presets
 * where it does not, because that is the axis such a game varies.
 */
export function leafPresets<P>(menu: PresetMenu<P>): { title: string; params: P }[] {
  if (menu.params !== undefined) return [{ title: menu.title, params: menu.params }];
  return (menu.submenu ?? []).flatMap(leafPresets);
}
