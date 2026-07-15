/**
 * The per-game engine registry: the runtime decision point for the
 * per-game hybrid. A `puzzleId` present here is served by the TS midend;
 * absent, it falls back to the C/WASM build. This is deliberately NOT a
 * build flag — see `openspec/specs/ts-engine/spec.md` and the change's
 * design.md for why a runtime registry beats `USE_TS_<GAME>` /
 * catalog-field / tree-shake alternatives.
 *
 * Ships empty: with no game registered, the production runtime is the
 * unchanged all-WASM path. Each later game-port change adds exactly one
 * `registerGame(...)` call from the game's own module.
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

/**
 * Construct the engine core for `puzzleId`, or `undefined` if no TS
 * game is registered (caller falls back to the WASM path).
 */
export function createTsEngine(puzzleId: string): EngineCore | undefined {
  return factories.get(puzzleId)?.();
}

/** Test-only: drop all registrations. */
export function _resetRegistry(): void {
  factories.clear();
  games.clear();
}
