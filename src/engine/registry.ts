/**
 * The game registry: `puzzleId` → the game's implementation. A game absent from
 * here cannot be played, which is why `catalog-registry.test.ts` asserts the
 * registry and the catalog are the same set of games in both directions.
 */

import type { Game } from "./game.ts";
import { type EngineCore, Midend } from "./midend.ts";

const factories = new Map<string, () => EngineCore>();
const games = new Map<string, Game<unknown, unknown, unknown, unknown, unknown>>();

/**
 * Register a game. Generics are inferred from the passed `Game`, so no `any`
 * escapes: the stored factory is `() => EngineCore`.
 *
 * Idempotent on the *same* game instance, which lets `registerAllGames()`
 * repopulate the registry after a test-only `_resetRegistry()` (a game
 * module's import side effects run once per worker). A *different* game object
 * under an already-claimed id is a hard error: the copy-paste bug the guard
 * exists to catch.
 */
export function registerGame<P, S, M, U, D>(game: Game<P, S, M, U, D>): void {
  const existing = games.get(game.id);
  if (existing !== undefined) {
    if (existing !== game) {
      throw new Error(`A different TS game is already registered for "${game.id}"`);
    }
    return;
  }
  factories.set(game.id, () => new Midend(game));
  games.set(game.id, game);
}

/** True iff a game is registered for `puzzleId`. */
export function hasTsGame(puzzleId: string): boolean {
  return factories.has(puzzleId);
}

/** Get the registered Game instance for the given puzzle ID. */
export function getTsGame(
  puzzleId: string,
): Game<unknown, unknown, unknown, unknown, unknown> | undefined {
  return games.get(puzzleId);
}

/** All registered puzzle ids. Must equal the catalog — see
 * `catalog-registry.test.ts`. */
export function registeredGameIds(): string[] {
  return [...factories.keys()];
}

/** Construct the engine core for `puzzleId`, or `undefined` if no game is
 * registered under that id. */
export function createTsEngine(puzzleId: string): EngineCore | undefined {
  return factories.get(puzzleId)?.();
}

/** Test-only: drop all registrations. */
export function _resetRegistry(): void {
  factories.clear();
  games.clear();
}
