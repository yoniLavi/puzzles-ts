/**
 * Worker-side adapter: presents an `EngineCore` (a `Midend`) through
 * the exact Comlink surface the app already consumes for C/WASM games
 * (`src/puzzle/worker.ts`'s `WorkerPuzzle`). The seam in the worker
 * factory routes here when the registry has the `puzzleId`; otherwise
 * the existing WASM path runs. With an empty registry this is never
 * constructed, so production behaviour is unchanged until the first
 * port registers a game.
 *
 * Drawing reuses the existing canvas `Drawing` directly — no Embind
 * binding, since there is no WASM module on the TS path.
 *
 * The drawing / colour / UI-feedback contract the keystone left
 * minimal was resolved by the first port (`add-flip-ts-port`): the
 * full `GameDrawing` API, `colours(defaultBackground)`, and the
 * `UI_UPDATE` input result. The custom-params / preferences /
 * request-keys surface still returns the empty-but-valid shape:
 * upstream's `config_item` UI machinery is a later cross-cutting
 * change, not modelled here yet. For a game whose only configuration
 * is reachable via presets and game IDs (e.g. Flip) this is the
 * correct behaviour, not a stub masking a defect.
 */

import { transfer } from "comlink";
import { Drawing } from "../../puzzle/drawing.ts";
import type { PuzzleEngineSurface } from "../../puzzle/engine-surface.ts";
import type {
  ChangeNotification,
  Colour,
  ConfigDescription,
  ConfigValues,
  FontInfo,
  KeyLabel,
  Point,
  PresetMenuEntry,
  PuzzleStaticAttributes,
  Size,
} from "../../puzzle/types.ts";
import type { EngineCore } from "./midend.ts";

const EMPTY_CONFIG: ConfigDescription = { title: "", items: {} };

export class TsWorkerPuzzle implements PuzzleEngineSurface {
  private readonly engine: EngineCore;
  private drawing?: Drawing;
  private timerActive = false;
  private lastTimeMs = 0;
  private notifyTimerStateRemote?: (isActive: boolean) => void;

  constructor(
    public readonly puzzleId: string,
    engine: EngineCore,
  ) {
    this.engine = engine;
  }

  // --- callbacks / lifecycle --------------------------------------

  setCallbacks(
    notifyChange: (message: ChangeNotification) => void,
    notifyTimerState: (isActive: boolean) => void,
  ): void {
    this.notifyTimerStateRemote = notifyTimerState;
    this.engine.setCallbacks(notifyChange, (active) => {
      if (active) this.activateTimer();
      else this.deactivateTimer();
    });
  }

  getStaticProperties(): PuzzleStaticAttributes {
    return this.engine.getStaticProperties();
  }

  newGame(): void {
    this.engine.newGame();
  }
  newGameFromId(id: string): string | undefined {
    return this.engine.newGameFromId(id);
  }
  restartGame(): void {
    this.engine.restartGame();
  }
  undo(): void {
    this.engine.undo();
  }
  redo(): void {
    this.engine.redo();
  }
  solve(): string | undefined {
    return this.engine.solve();
  }

  // --- input ------------------------------------------------------

  processKey(key: number): boolean {
    return this.engine.processInput(0, 0, key);
  }
  processMouse({ x, y }: Point, button: number): boolean {
    return this.engine.processInput(x, y, button);
  }
  requestKeys(): KeyLabel[] {
    return [];
  }

  // --- params / presets -------------------------------------------

  getParams(): string {
    return this.engine.getParams();
  }
  setParams(params: string): string | undefined {
    return this.engine.setParams(params);
  }
  getPresets(): PresetMenuEntry[] {
    return this.engine.getPresets();
  }

  // Custom-params / preferences UI surface: see file header.
  getCustomParamsConfig(): ConfigDescription {
    return { ...EMPTY_CONFIG, title: this.puzzleId };
  }
  getCustomParams(): ConfigValues {
    return {};
  }
  setCustomParams(_values: ConfigValues): string | undefined {
    return undefined;
  }
  decodeCustomParams(_params: string): ConfigValues | string {
    return {};
  }
  encodeCustomParams(_values: ConfigValues): string {
    return this.engine.getParams();
  }
  getPreferencesConfig(): ConfigDescription {
    return { ...EMPTY_CONFIG, title: this.puzzleId };
  }
  getPreferences(): ConfigValues {
    return {};
  }
  setPreferences(_values: ConfigValues): string | undefined {
    return undefined;
  }
  savePreferences(): Uint8Array<ArrayBuffer> {
    const data = new Uint8Array(0);
    return transfer(data, [data.buffer]);
  }
  loadPreferences(_data: Uint8Array): string | undefined {
    return undefined;
  }

  // --- rendering --------------------------------------------------

  getColourPalette(defaultBackground: Colour): Colour[] {
    return this.engine.getColourPalette(defaultBackground);
  }
  size(maxSize: Size, isUserSize: boolean, devicePixelRatio: number): Size {
    return this.engine.size(maxSize, isUserSize, devicePixelRatio);
  }
  preferredSize(): Size {
    return this.engine.preferredSize();
  }
  formatAsText(): string | undefined {
    return this.engine.formatAsText();
  }

  // --- save / load ------------------------------------------------

  loadGame(data: Uint8Array): string | undefined {
    return this.engine.loadGame(data);
  }
  saveGame(): Uint8Array<ArrayBuffer> {
    const data = this.engine.saveGame();
    return transfer(data, [data.buffer]);
  }

  // --- drawing ----------------------------------------------------

  attachCanvas(canvas: OffscreenCanvas, fontInfo: FontInfo): void {
    this.drawing = new Drawing(canvas, fontInfo);
  }
  deleteDrawing(): void {
    this.drawing = undefined;
  }
  detachCanvas(): void {
    this.drawing?.resize(1, 1, 1);
  }
  resizeDrawing({ w, h }: Size, dpr: number): void {
    if (!this.drawing) throw new Error("resizeDrawing: no canvas attached");
    this.drawing.resize(w, h, dpr);
  }
  setDrawingPalette(colors: string[]): void {
    if (!this.drawing) throw new Error("setDrawingPalette: no canvas attached");
    if (this.drawing.setPalette(colors)) this.redraw();
  }
  setDrawingFontInfo(fontInfo: FontInfo): void {
    if (!this.drawing) throw new Error("setDrawingFontInfo: no canvas attached");
    if (this.drawing.setFontInfo(fontInfo)) this.redraw();
  }
  async getImage(options?: ImageEncodeOptions): Promise<Blob> {
    if (!this.drawing) throw new Error("getImage: no canvas attached");
    return this.drawing.getImage(options);
  }
  redraw(): void {
    if (this.drawing) this.engine.redraw(this.drawing);
  }

  // --- timer ------------------------------------------------------

  private onAnimationFrame = (timestampMs: number): void => {
    if (this.timerActive) {
      this.engine.timer((timestampMs - this.lastTimeMs) / 1000);
      this.lastTimeMs = timestampMs;
      self.requestAnimationFrame(this.onAnimationFrame);
    }
  };

  private activateTimer(): void {
    if (!this.timerActive) {
      this.timerActive = true;
      this.lastTimeMs = self.performance.now();
      this.notifyTimerStateRemote?.(true);
      self.requestAnimationFrame(this.onAnimationFrame);
    }
  }
  private deactivateTimer(): void {
    if (this.timerActive) {
      this.timerActive = false;
      this.notifyTimerStateRemote?.(false);
    }
  }

  delete(): void {
    this.engine.delete();
    this.deleteDrawing();
  }
}
