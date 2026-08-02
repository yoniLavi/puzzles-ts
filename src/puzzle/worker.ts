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
// Side-effect import: registers every native-TS game port.
import "../games/index.ts";
import { installErrorHandlersInWorker } from "../utils/errors-worker.ts";
import type { PuzzleEngineSurface } from "./engine-surface.ts";

installErrorHandlersInWorker();

// Factory function to create puzzle instances
interface WorkerPuzzleFactory {
  create(puzzleId: string): Promise<PuzzleEngineSurface>;
}
const workerPuzzleFactory: WorkerPuzzleFactory = {
  async create(puzzleId: string): Promise<PuzzleEngineSurface> {
    // Every catalogued game is served by the native TypeScript engine. This
    // used to be the per-game hybrid dispatch seam, choosing between the
    // midend-backed adapter and a C/WASM `WorkerPuzzle`; `retire-c-engine`
    // removed the C side, so there is nothing left to choose between.
    //
    // `PuzzleEngineSurface` is deliberately kept with one implementer: it is
    // the app-facing Comlink remote type, stated rather than inferred off a
    // class, so the boundary stays explicit.
    const engine = createTsEngine(puzzleId);
    if (!engine) {
      // Previously an unregistered id fell through to C/WASM. There is no
      // fallback now, so say so plainly rather than failing later and deeper.
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
