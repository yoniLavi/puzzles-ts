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

/**
 * Register a game's TS implementation. Generics are inferred from the
 * passed `Game`, so no `any` escapes: the stored factory is
 * `() => EngineCore` (a `Midend<…>` implements `EngineCore`).
 */
export function registerGame<P, S, M, U, D>(game: Game<P, S, M, U, D>): void {
  if (factories.has(game.id)) {
    throw new Error(`A TS game is already registered for "${game.id}"`);
  }
  factories.set(game.id, () => new Midend(game));
}

/** True iff `puzzleId` should be served by the TS engine. */
export function hasTsGame(puzzleId: string): boolean {
  return factories.has(puzzleId);
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
}
