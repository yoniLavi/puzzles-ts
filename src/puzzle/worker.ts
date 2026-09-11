// TODO: use separate tsconfig.json for worker.ts (without DOM)
/// <reference lib="webworker" />
declare var self: DedicatedWorkerGlobalScope;

import * as Sentry from "@sentry/browser";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.registerWebWorker({ self });
}

import { expose, proxy, type Remote } from "comlink";
import { createTsEngine } from "../engine/index.ts";
import { TsWorkerPuzzle } from "./worker-adapter.ts";
// Side-effect import: registers every game.
import "../games/index.ts";
import { installErrorHandlersInWorker } from "../utils/errors-worker.ts";
import type { PuzzleEngineSurface } from "./engine-surface.ts";

installErrorHandlersInWorker();

interface WorkerPuzzleFactory {
  create(puzzleId: string): Promise<PuzzleEngineSurface>;
}
const workerPuzzleFactory: WorkerPuzzleFactory = {
  async create(puzzleId: string): Promise<PuzzleEngineSurface> {
    const engine = createTsEngine(puzzleId);
    if (!engine) {
      throw new Error(`No game is registered for puzzleId "${puzzleId}"`);
    }
    return proxy(new TsWorkerPuzzle(puzzleId, engine));
  },
};

expose(workerPuzzleFactory);

type ComlinkRemoteFactory<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: A) => Promise<Remote<R>>
    : T[K];
};

export type RemoteWorkerPuzzle = Remote<PuzzleEngineSurface>;
export type RemoteWorkerPuzzleFactory = ComlinkRemoteFactory<WorkerPuzzleFactory>;
