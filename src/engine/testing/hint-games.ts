/**
 * The enrolled set for every cross-game hint guard — **derived from the
 * registry, never authored**.
 *
 * One set, many guards: `hint-resume.test.ts` (plan convergence, purity,
 * no-op-free plans), `hint-overlay.test.ts` (overlay reaches the render cache),
 * `hint-quality.test.ts` (narration form), `hint-mark.test.ts`,
 * `hint-ordinal.test.ts` (an ordered chain reaches the canvas with its order on
 * it) and `scripts/checks/hint-deixis.test.ts` all iterate it.
 *
 * **A game is enrolled iff it declares `hint`.** This was a hand-maintained
 * array of thirty games until `derive-hint-enrollment`, and its own header
 * advertised the coupling as a feature — *"a newly ported game with a `hint()`
 * enrolls in all of them by adding one line here"*. That sentence was the
 * defect: enrollment was a thing a session had to remember, nothing asserted the
 * list was complete, and a game left off got **zero** of the six guards,
 * silently. The repo had already solved exactly this once —
 * `difficulty-contract.test.ts` derives its tiered set from the registry, and
 * its reasoning transfers verbatim: *a guard blind to a game cannot fire on it.*
 *
 * The list happened to be complete on the day it was replaced, which is the
 * state in which a missing guard is invisible rather than the state in which it
 * is unnecessary. Four games mention `hint` in their `index.ts` without
 * declaring one (`ascent`, `magnets` and `tents` name it as an unused `redraw`
 * parameter; Guess has an unrelated `ui.hint`), so a naming-based scan would
 * have over-counted where reading the declaration does not.
 *
 * **A game with no `hint()` is not a defect.** The collection deliberately keeps
 * some logic games hintless for now, as the corpus for assessing the framework
 * work: implementing those hints is how the target contract gets tested against
 * real games (owner, 2026-09-04). The forward-looking bar — *a new game
 * implementation ships with a hint* — is stated in AGENTS.md.
 *
 * Dev/test-only; never imported by production code.
 */
import "../../games/index.ts";
import type { Game, PresetMenu } from "../game.ts";
import { getTsGame, registeredGameIds } from "../registry.ts";

// biome-ignore lint/suspicious/noExplicitAny: a deliberately game-agnostic probe.
export type AnyGame = Game<any, any, any, any, any, any>;

/**
 * Every registered game that declares a `hint()`, by puzzle id, sorted so the
 * guards iterate in a stable order.
 *
 * The side-effect import above is what populates the registry
 * (`games/index.ts` calls `registerAllGames()` on evaluation) — the same way
 * `difficulty-contract.test.ts` reaches it.
 */
export const HINT_GAMES: [string, AnyGame][] = registeredGameIds()
  .sort()
  .map((id): [string, AnyGame] => [id, getTsGame(id) as AnyGame])
  .filter(([, game]) => typeof game.hint === "function");

/**
 * How many games the registry offered the filter above — the **vacuity guard**
 * every derived sweep in this repo owes.
 *
 * Six guards iterate `HINT_GAMES`, and every one of them passes vacuously over
 * an empty array. A derivation that silently found nothing — an import cycle
 * leaving the registry unpopulated, a renamed accessor — would turn all six
 * green while checking nothing, which is the shape this repo has now hit six
 * times. Exported so `hint-enrollment.test.ts` can put a floor under the
 * *population*, not only under the filtered result: the filtered count can look
 * healthy while the set it was drawn from is short.
 */
export const REGISTERED_GAME_COUNT = registeredGameIds().length;

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
 * whether "this cell" points at anything (`disambiguate-hint-deixis`): with one
 * mark it is unambiguous, with two it names neither unless the narration ties
 * them.
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
