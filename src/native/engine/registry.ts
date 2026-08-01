/**
 * The per-game engine registry: `puzzleId` → the game's TS implementation.
 *
 * It began as the runtime decision point for the per-game hybrid — present
 * here meant "served by the TS midend", absent meant "fall back to C/WASM" —
 * and shipped empty, so production was the unchanged all-WASM path until the
 * first port registered itself. It was deliberately not a build flag; see
 * `openspec/specs/ts-engine/spec.md` for why a runtime registry beat
 * `USE_TS_<GAME>` / catalog-field / tree-shake alternatives.
 *
 * With `retire-c-engine` there is no fallback and no decision left to make:
 * a game absent from here cannot be played at all, which is why
 * `catalog-registry.test.ts` asserts the registry and the catalog are the
 * same set of games in both directions.
 */

import type { Game } from "./game.ts";
import { type EngineCore, Midend } from "./midend.ts";

const factories = new Map<string, () => EngineCore>();
const games = new Map<string, Game<unknown, unknown, unknown, unknown, unknown>>();

/**
 * Register a game's TS implementation. Generics are inferred from the
 * passed `Game`, so no `any` escapes: the stored factory is
 * `() => EngineCore` (a `Midend<…>` implements `EngineCore`).
 *
 * Idempotent on the *same* game instance: re-registering the identical
 * `Game` object is a no-op (not an error). This is what lets
 * `registerAllGames()` re-populate the registry after a test-only
 * `_resetRegistry()` without the module system re-evaluating each game
 * module (ES-module side effects run once per worker). Registering a
 * *different* game object under an already-claimed id is still a hard
 * error — that is the copy-paste bug the guard exists to catch, and it
 * cannot happen from an idempotent re-run.
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

/** True iff `puzzleId` should be served by the TS engine. */
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

/**
 * Construct the engine core for `puzzleId`, or `undefined` if no game is
 * registered under that id (which now means the id is simply unplayable —
 * there is no C/WASM fallback left to take).
 */
export function createTsEngine(puzzleId: string): EngineCore | undefined {
  return factories.get(puzzleId)?.();
}

/** Test-only: drop all registrations. */
export function _resetRegistry(): void {
  factories.clear();
  games.clear();
}
