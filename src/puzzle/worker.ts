// TODO: use separate tsconfig.json for worker.ts (without DOM)
/// <reference lib="webworker" />
declare var self: DedicatedWorkerGlobalScope;

import * as Sentry from "@sentry/browser";
import { registerWebWorkerWasm } from "@sentry/wasm";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.registerWebWorker({ self });
  registerWebWorkerWasm({ self });
}

import { expose, proxy, type Remote, transfer } from "comlink";
import createModule from "../assets/puzzles/emcc-runtime";
import { createTsRandomBridge } from "../native/random/bridge.ts";
import { installErrorHandlersInWorker } from "../utils/errors-worker.ts";
import { Drawing } from "./drawing.ts";
import type {
  ChangeNotification,
  Colour,
  ConfigDescription,
  ConfigValues,
  Drawing as DrawingHandle,
  FontInfo,
  Frontend,
  FrontendConstructorArgs,
  KeyLabel,
  Point,
  PresetMenuEntry,
  PuzzleModule,
  PuzzleStaticAttributes,
  Size,
} from "./types.ts";

installErrorHandlersInWorker();

// Sentry does not currently forward event enrichment data to the main thread,
// so do it ourselves. https://github.com/getsentry/sentry-javascript/issues/18704
const addBreadcrumb = (breadcrumb: Sentry.Breadcrumb) => {
  if (import.meta.env.VITE_SENTRY_DSN) {
    self.postMessage({ type: "sentry-breadcrumb", breadcrumb });
  }
};

// Tri-state env-var read: `true | false | undefined`. Vite leaves env vars
// as raw strings (or undefined), so distinguish "unset" from "explicitly
// off" by hand. Used to let per-module VITE_USE_TS_<MODULE> override the
// umbrella VITE_USE_TS_LEAVES individually (cf. build-pipeline spec).
function explicit(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).toLowerCase();
  if (s === "0" || s === "false" || s === "off") return false;
  return true;
}

const useTsLeaves = explicit(import.meta.env.VITE_USE_TS_LEAVES) ?? true;
const useTsRandom = explicit(import.meta.env.VITE_USE_TS_RANDOM) ?? useTsLeaves;

// Per-module bridge symbols imported by the WASM when USE_TS_<MODULE>=ON.
// Used by the coherence check to detect WASM-vs-Vite flag mismatches that
// would otherwise crash with a cryptic "Cannot read properties of
// undefined (reading 'randomNew')" the first time the C code calls
// random_new. Forward mismatches (WASM imports a bridge symbol but the
// worker hasn't installed the bridge object) throw at instantiation;
// reverse mismatches (worker installed a bridge but WASM doesn't need
// it) are harmless and silent — see build-pipeline spec for the
// reasoning.
const FORWARD_MISMATCH_PROBES = [
  {
    symbol: "random_new",
    cmakeFlag: "USE_TS_RANDOM",
    viteFlag: "VITE_USE_TS_RANDOM",
    installed: () => useTsRandom,
  },
] as const;

function assertWasmBridgesCoherent(module: WebAssembly.Module): void {
  const envImports = new Set(
    WebAssembly.Module.imports(module)
      .filter((imp) => imp.module === "env")
      .map((imp) => imp.name),
  );
  for (const probe of FORWARD_MISMATCH_PROBES) {
    if (envImports.has(probe.symbol) && !probe.installed()) {
      throw new Error(
        `Build flag mismatch: WASM imports \`${probe.symbol}\` ` +
          `(compiled with ${probe.cmakeFlag}=ON or USE_TS_LEAVES=ON) but ` +
          `the worker has no matching bridge installed (neither ` +
          `${probe.viteFlag} nor VITE_USE_TS_LEAVES is set). Fix: either ` +
          `rebuild WASM without that flag, or set VITE_USE_TS_LEAVES=1 in ` +
          `your Vite environment and restart the dev server. See ` +
          `openspec/specs/build-pipeline/spec.md.`,
      );
    }
  }
}

/**
 * Worker-side implementation of main-thread Puzzle class
 */
export class WorkerPuzzle implements FrontendConstructorArgs {
  static async create(puzzleId: string): Promise<WorkerPuzzle> {
    const url = new URL(`../assets/puzzles/${puzzleId}.wasm`, import.meta.url).href;
    // When the WASM was built with USE_TS_RANDOM=ON (or USE_TS_LEAVES=ON),
    // its random_* imports come from puzzles/random_bridge.js, which
    // dispatches to Module.tsRandomBridge. Install before WASM instantiation
    // so the bridge is in place by the time any C code calls random_new.
    // The Vite-side decision is `useTsRandom`, resolved from
    // VITE_USE_TS_RANDOM (per-module) ?? VITE_USE_TS_LEAVES (umbrella).
    const tsRandomBridge = useTsRandom ? createTsRandomBridge() : undefined;
    const module = await createModule({
      tsRandomBridge,
      // Emscripten's generated wasm loading includes code that (in workers only)
      // falls back to XHR and ignores any HTTP error. That leads to cryptic errors
      // like "expected magic word 00 61 73 6d, found 46 69 6c 65" for 404 responses.
      // Substitute our own wasm loader.
      instantiateWasm: async (
        imports: WebAssembly.Imports,
        successCallback: (instance: WebAssembly.Instance) => void,
      ) => {
        // failureCallback is not currently exposed to instantiateWasm:
        // https://github.com/emscripten-core/emscripten/issues/23038
        const response = await fetch(url);
        if (import.meta.env.VITE_SENTRY_DSN) {
          addBreadcrumb({
            type: "http",
            category: "fetch",
            data: {
              url,
              method: "GET",
              status_code: response.status,
              reason: response.statusText,
            },
          });
        }
        if (!response.ok) {
          throw new Error(
            `Error ${response.status}: ${response.statusText} loading ${url}`,
          );
        }
        const result = await WebAssembly.instantiateStreaming(response, imports);
        // Refuse to start if WASM imports a bridge symbol the worker
        // hasn't installed — clearer failure than the cryptic
        // "Cannot read properties of undefined (reading 'randomNew')"
        // that surfaces on the first C → JS bridge call otherwise.
        assertWasmBridgesCoherent(result.module);
        successCallback(result.instance);
      },
    });
    return new WorkerPuzzle(puzzleId, module);
  }

  private readonly frontend: Frontend;

  private constructor(
    public readonly puzzleId: string,
    private readonly module: PuzzleModule,
  ) {
    this.frontend = new module.Frontend({
      activateTimer: this.activateTimer,
      deactivateTimer: this.deactivateTimer,
      textFallback: this.textFallback,
      notifyChange: this.notifyChange,
    });
  }

  delete(): void {
    this.frontend.delete();
    this.deleteDrawing();
  }

  //
  // Remote callbacks (to main thread via Comlink)
  //

  private earlyChangeNotifications: ChangeNotification[] = [];
  private notifyChangeRemote?: (message: ChangeNotification) => void;
  private notifyTimerStateRemote?: (isActive: boolean) => void;

  setCallbacks(
    notifyChange: (message: ChangeNotification) => void,
    notifyTimerState: (isActive: boolean) => void,
  ) {
    this.notifyChangeRemote = notifyChange;
    this.notifyTimerStateRemote = notifyTimerState;

    // Deliver any change notifications that were received prior to setCallbacks.
    // (There shouldn't be early timer state changes.)
    for (const message of this.earlyChangeNotifications) {
      this.notifyChangeRemote(message);
    }
    this.earlyChangeNotifications = [];
  }

  //
  // Frontend methods (available via Comlink proxy in main thead)
  //

  getStaticProperties(): PuzzleStaticAttributes {
    return {
      displayName: this.frontend.name,
      canConfigure: this.frontend.canConfigure,
      canSolve: this.frontend.canSolve,
      needsRightButton: this.frontend.needsRightButton,
      isTimed: this.frontend.isTimed,
      wantsStatusbar: this.frontend.wantsStatusbar,
    };
  }

  newGame(): void {
    this.frontend.newGame();
  }

  newGameFromId(id: string): string | undefined {
    return this.frontend.newGameFromId(id);
  }

  restartGame(): void {
    this.frontend.restartGame();
  }

  undo(): void {
    this.frontend.undo();
  }

  redo(): void {
    this.frontend.redo();
  }

  solve(): string | undefined {
    return this.frontend.solve();
  }

  processKey(key: number): boolean {
    return this.frontend.processKey(0, 0, key);
  }

  processMouse({ x, y }: Point, button: number): boolean {
    return this.frontend.processKey(x, y, button);
  }

  requestKeys(): KeyLabel[] {
    return this.frontend.requestKeys();
  }

  getParams(): string {
    return this.frontend.getParams();
  }

  setParams(params: string): string | undefined {
    return this.frontend.setParams(params);
  }

  getPresets(): PresetMenuEntry[] {
    return this.frontend.getPresets();
  }

  getCustomParamsConfig(): ConfigDescription {
    return this.frontend.getCustomParamsConfig();
  }

  getCustomParams(): ConfigValues {
    return this.frontend.getCustomParams();
  }

  setCustomParams(values: ConfigValues): string | undefined {
    return this.frontend.setCustomParams(values);
  }

  decodeCustomParams(params: string): ConfigValues | string {
    return this.frontend.decodeCustomParams(params);
  }

  encodeCustomParams(values: ConfigValues): string {
    return this.frontend.encodeCustomParams(values);
  }

  getPreferencesConfig(): ConfigDescription {
    return this.frontend.getPreferencesConfig();
  }

  getPreferences(): ConfigValues {
    return this.frontend.getPreferences();
  }

  setPreferences(values: ConfigValues): string | undefined {
    return this.frontend.setPreferences(values);
  }

  savePreferences(): Uint8Array {
    const data = this.frontend.savePreferences();
    return transfer(data, [data.buffer]);
  }

  loadPreferences(data: Uint8Array): string | undefined {
    return this.frontend.loadPreferences(data);
  }

  redraw(): void {
    this.frontend.redraw();
  }

  getColourPalette(defaultBackground: Colour): Colour[] {
    return this.frontend.getColourPalette(defaultBackground);
  }

  size(maxSize: Size, isUserSize: boolean, devicePixelRatio: number): Size {
    return this.frontend.size(maxSize, isUserSize, devicePixelRatio);
  }

  preferredSize(): Size {
    return this.frontend.preferredSize();
  }

  formatAsText(): string | undefined {
    return this.frontend.formatAsText();
  }

  loadGame(data: Uint8Array<ArrayBuffer>): string | undefined {
    return this.frontend.loadGame(data);
  }

  saveGame(): Uint8Array<ArrayBuffer> {
    const data = this.frontend.saveGame() as Uint8Array<ArrayBuffer>;
    return transfer(data, [data.buffer]);
  }

  //
  // Drawing
  //

  private drawing?: Drawing;
  private drawingHandle?: DrawingHandle;

  attachCanvas(canvas: OffscreenCanvas, fontInfo: FontInfo): void {
    if (this.drawing) {
      this.deleteDrawing();
    }
    this.drawing = new Drawing(canvas, fontInfo);
    this.drawingHandle = this.drawing.bind(this.module);
    this.frontend.setDrawing(this.drawingHandle);
  }

  deleteDrawing(): void {
    if (this.drawing) {
      // Frontend may already be deleted, so don't do:
      //   this.frontend.setDrawing(null);
      this.drawingHandle?.delete();
      this.drawingHandle = undefined;
      this.drawing = undefined;
    }
  }

  detachCanvas(): void {
    // Leave the existing Drawing in place, because the Frontend
    // might call into it during Frontend.delete(). (E.g., midend_free
    // will call blitter_free in puzzles like Galaxies and Signpost.)
    // The resources are released either when some other canvas is ready
    // to be attached or in WorkerPuzzle.delete() after Frontend.delete().
    // But resize the canvas to a minimal size to reduce memory usage.
    this.drawing?.resize(1, 1, 1);
  }

  resizeDrawing({ w, h }: Size, dpr: number): void {
    if (!this.drawing) {
      throw new Error("resizeDrawing called with no canvas attached");
    }
    this.drawing.resize(w, h, dpr);
  }

  setDrawingPalette(colors: string[]): void {
    if (!this.drawing) {
      throw new Error("setDrawingPalette called with no canvas attached");
    }
    if (this.drawing.setPalette(colors)) {
      // Must forceRedraw for palette change (not just plain redraw).
      this.frontend.forceRedraw();
    }
  }

  setDrawingFontInfo(fontInfo: FontInfo): void {
    if (!this.drawing) {
      throw new Error("setDrawingFontInfo called with no canvas attached");
    }
    if (this.drawing.setFontInfo(fontInfo)) {
      // Must forceRedraw for font change (not just plain redraw).
      this.frontend.forceRedraw();
    }
  }

  async getImage(options?: ImageEncodeOptions): Promise<Blob> {
    if (!this.drawing) {
      throw new Error("getImage called with no canvas attached");
    }
    return this.drawing.getImage(options);
  }

  //
  // Timer
  //

  private timerActive = false;
  private lastTimeMs = 0;

  private onAnimationFrame = async (timestampMs: number) => {
    if (this.timerActive) {
      // puzzle timer requires secs, not msec
      const tplus = (timestampMs - this.lastTimeMs) / 1000;
      this.lastTimeMs = timestampMs;
      this.frontend.timer(tplus);
      self.requestAnimationFrame(this.onAnimationFrame);
    }
  };

  //
  // Frontend callbacks
  //

  activateTimer = (): void => {
    if (!this.timerActive) {
      this.timerActive = true;
      this.lastTimeMs = self.performance.now();
      this.notifyTimerStateRemote?.(true);
      self.requestAnimationFrame(this.onAnimationFrame);
    }
  };

  deactivateTimer = (): void => {
    if (this.timerActive) {
      this.timerActive = false;
      // (No need to cancelAnimationFrame--we'll get one more and ignore it.)
      this.notifyTimerStateRemote?.(false);
    }
  };

  textFallback = (strings: string[]): string => {
    // Probably any Unicode string can be rendered, so use the preferred one.
    return strings[0];
  };

  notifyChange = (message: ChangeNotification): void => {
    if (this.notifyChangeRemote) {
      this.notifyChangeRemote(message);
    } else {
      // Early notification before main thread has installed callbacks
      // (e.g., initial state in Frontend constructor). Queue for delivery
      // when callbacks installed.
      this.earlyChangeNotifications.push(message);
    }
  };
}

// Factory function to create puzzle instances
interface WorkerPuzzleFactory {
  create(puzzleId: string): Promise<WorkerPuzzle>;
}
const workerPuzzleFactory: WorkerPuzzleFactory = {
  async create(puzzleId: string) {
    const workerPuzzle = await WorkerPuzzle.create(puzzleId);
    return proxy(workerPuzzle);
  },
};

expose(workerPuzzleFactory);

type ComlinkRemoteFactory<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: A) => Promise<Remote<R>>
    : T[K];
};

export type RemoteWorkerPuzzle = Remote<WorkerPuzzle>;
export type RemoteWorkerPuzzleFactory = ComlinkRemoteFactory<WorkerPuzzleFactory>;
