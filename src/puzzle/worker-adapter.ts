/**
 * Worker-side adapter: presents an `EngineCore` (a `Midend`) through the
 * Comlink surface the app's `Puzzle` consumes. A `puzzleId` the registry does
 * not know is unplayable; `catalog-registry.test.ts` guards that in both
 * directions.
 *
 * It lives on the **app** side of the seam, not inside the engine, because an
 * adapter belongs with the thing being adapted *to*: it is the only module that
 * knows both the engine's `EngineCore` and the app's `Drawing` /
 * `PuzzleEngineSurface`, and under the engine it would make the engine import
 * the shell.
 *
 * Custom params and preferences forward to the midend, which builds each config
 * dialog from the game's declarative `paramConfig` / `prefs` and parses the
 * submitted values back. A game that declares neither yields an empty-but-valid
 * config, which is correct for a preset-only game like Flip.
 */

import { transfer } from "comlink";
import type { EngineCore } from "../engine/midend.ts";
import { getTsGame } from "../engine/registry.ts";
import type {
  ChangeNotification,
  Color,
  ConfigDescription,
  ConfigValues,
  FontInfo,
  KeyLabel,
  Point,
  PresetMenuEntry,
  PuzzleStaticAttributes,
  ReferenceModel,
  Size,
} from "../engine/types.ts";
import { Drawing } from "./drawing.ts";
import type { PuzzleEngineSurface } from "./engine-surface.ts";

export class TsWorkerPuzzle implements PuzzleEngineSurface {
  private drawing?: Drawing;
  /** The canvas `Drawing` throws if asked to paint before a palette is
   * installed, and the midend repaints on every transition, the initial one
   * included, which can fire before `setDrawingPalette`. So `redraw()` waits
   * for the palette, which the app sets as part of canvas setup. */
  private paletteReady = false;
  private timerActive = false;
  private lastTimeMs = 0;
  private notifyTimerStateRemote?: (isActive: boolean) => void;

  constructor(
    public readonly puzzleId: string,
    private readonly engine: EngineCore,
  ) {}

  // --- callbacks / lifecycle --------------------------------------

  setCallbacks(
    notifyChange: (message: ChangeNotification) => void,
    notifyTimerState: (isActive: boolean) => void,
  ): void {
    this.notifyTimerStateRemote = notifyTimerState;
    this.engine.setCallbacks(
      notifyChange,
      (active) => {
        if (active) this.activateTimer();
        else this.deactivateTimer();
      },
      // Repaint into the canvas this adapter owns; the engine has no Drawing.
      () => this.redraw(),
    );
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
  hint(): string | undefined {
    return this.engine.hint();
  }
  executeHint(hideAfter = false): string | undefined {
    return this.engine.executeHint(hideAfter);
  }
  currentAnimationMs(): number {
    return this.engine.currentAnimationMs();
  }
  findMistakes(): number {
    return this.engine.findMistakes();
  }
  getReference(): ReferenceModel | null {
    return this.engine.getReference();
  }
  selectReference(key: string | null): void {
    this.engine.selectReference(key);
  }

  // --- input ------------------------------------------------------

  processKey(key: number): boolean {
    return this.engine.processInput(0, 0, key);
  }
  processMouse({ x, y }: Point, button: number): boolean {
    return this.engine.processInput(x, y, button);
  }
  requestKeys(): KeyLabel[] {
    return this.engine.requestKeys();
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

  getCustomParamsConfig(): ConfigDescription {
    return this.engine.getCustomParamsConfig();
  }
  getCustomParams(): ConfigValues {
    return this.engine.getCustomParams();
  }
  setCustomParams(values: ConfigValues): string | undefined {
    return this.engine.setCustomParams(values);
  }
  decodeCustomParams(params: string): ConfigValues | string {
    const game = getTsGame(this.puzzleId);
    if (!game) {
      return {};
    }
    try {
      const p = game.decodeParams(params);
      if (!p) {
        return {};
      }
      // A generic width/height base from `w`/`h` params (most games), then
      // the game's own type-summary mapping spread over it. A game whose
      // params aren't `w`/`h` (e.g. Mosaic) supplies width/height from its
      // own `describeParams`, replacing the empty base.
      const rec = p as Record<string, unknown>;
      const base: ConfigValues = {};
      if (rec["w"] !== undefined) {
        base["width"] = String(rec["w"]);
      }
      if (rec["h"] !== undefined) {
        base["height"] = String(rec["h"]);
      }
      return { ...base, ...game.describeParams?.(p) };
    } catch (e) {
      return String(e);
    }
  }
  encodeCustomParams(values: ConfigValues): string {
    return this.engine.encodeCustomParams(values);
  }
  getPreferencesConfig(): ConfigDescription {
    return this.engine.getPreferencesConfig();
  }
  getPreferences(): ConfigValues {
    return this.engine.getPreferences();
  }
  setPreferences(values: ConfigValues): string | undefined {
    return this.engine.setPreferences(values);
  }

  // --- rendering --------------------------------------------------

  getColorPalette(defaultBackground: Color): Color[] {
    return this.engine.getColorPalette(defaultBackground);
  }

  darkPalette(defaultBackground: Color): Record<number, Color> {
    return this.engine.darkPalette(defaultBackground);
  }
  size(maxSize: Size): Size {
    return this.engine.size(maxSize);
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
    // `Drawing.resize` sets `canvas.width`/`height`, which under `{alpha:false}`
    // resets the backing store to opaque black, so every tile the game's
    // `redraw` has cached is gone. `canvasCleared` drops the drawstate, and the
    // next `redraw` paints from scratch via the game's `!ds.started` branch.
    this.drawing.resize(w, h, dpr);
    this.engine.canvasCleared();
  }
  setDrawingPalette(colors: string[]): void {
    if (!this.drawing) throw new Error("setDrawingPalette: no canvas attached");
    const firstInstall = !this.paletteReady && colors.length > 0;
    if (colors.length > 0) this.paletteReady = true;
    // `setPalette` returns true only when an already-installed palette was
    // replaced (light/dark toggle), which leaves any game's per-tile cache keyed
    // against the old palette: repaint from a fresh drawstate, as upstream's
    // `webapp.cpp` did (`setDrawingPalette → forceRedraw()`).
    if (this.drawing.setPalette(colors)) {
      this.forceRedraw();
      return;
    }
    // **The first install must also repaint.** `redraw()` drops every repaint
    // requested before the palette arrives, and the midend requests one on the
    // *initial* game transition, a race the game usually loses when generation
    // is fast. Nothing else re-issues it, so a deep link to a non-default type
    // (`/loopy?type=5x4t9dh`) left the canvas blank until some unrelated event
    // forced a repaint.
    if (firstInstall) this.forceRedraw();
  }
  async getImage(options?: ImageEncodeOptions): Promise<Blob> {
    if (!this.drawing) throw new Error("getImage: no canvas attached");
    return this.drawing.getImage(options);
  }
  redraw(): void {
    if (this.drawing && this.paletteReady) this.engine.redraw(this.drawing);
  }

  /** A full repaint with the per-game drawstate dropped, for a replaced
   * palette, where a plain `engine.redraw` would honor the stale cache. Not on
   * `PuzzleEngineSurface`: the app's own redraw path is `redraw()`. */
  private forceRedraw(): void {
    if (this.drawing && this.paletteReady) this.engine.forceRedraw(this.drawing);
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
