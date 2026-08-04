/**
 * The single Comlink-exposed surface a worker-side puzzle presents to the app.
 *
 * It was extracted when there were two implementations — the C/WASM-backed
 * `WorkerPuzzle` and the TS-midend-backed `TsWorkerPuzzle` — so that the
 * dispatch seam in `worker.ts` could construct either without an
 * `as unknown as` cast. `retire-c-engine` deleted the first, and
 * **`TsWorkerPuzzle` is now the only implementer.**
 *
 * It stays anyway, for a reason independent of that origin: the app types the
 * worker as `Remote<PuzzleEngineSurface>`. Collapsing it to
 * `Remote<TsWorkerPuzzle>` would drag the concrete class's whole surface across
 * the worker boundary, so every internal method would read as part of the
 * contract. A narrowed, hand-stated boundary type is worth having with one
 * implementer. `worker.ts` records the same decision at the construction site.
 *
 * Where the two implementations historically used slightly different
 * byte-buffer generics, the looser compatible type is kept here.
 */

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
  ReferenceModel,
  Size,
} from "../engine/types.ts";

export interface PuzzleEngineSurface {
  readonly puzzleId: string;

  setCallbacks(
    notifyChange: (message: ChangeNotification) => void,
    notifyTimerState: (isActive: boolean) => void,
  ): void;
  getStaticProperties(): PuzzleStaticAttributes;

  newGame(): void;
  newGameFromId(id: string): string | undefined;
  restartGame(): void;
  undo(): void;
  redo(): void;
  solve(): string | undefined;
  hint(): string | undefined;
  /** Apply one step of the stored plan in slow motion. `hideAfter` (the
   * Hint-button stepper) hides the plan once the step settles instead of
   * previewing the next step; auto-play leaves it false. */
  executeHint(hideAfter?: boolean): string | undefined;
  /** Milliseconds of the animation currently armed (e.g. the slow-motion
   * move `executeHint` just played), or 0 when nothing is animating. The
   * auto-hint loop paces each step by this. */
  currentAnimationMs(): number;
  /** Display the current board's mistakes and return how many; 0 when
   * the game has no mistake-checking. */
  findMistakes(): number;

  /** The active game's reference-aid model (inventory checklist with found
   * status), or null when the game has no reference aid. */
  getReference(): ReferenceModel | null;
  /** Spotlight a reference item on the board (or clear it with null). A
   * `UI_UPDATE`-shaped change: repaints but adds no move/history/save. No-op
   * for a game without a reference aid. */
  selectReference(key: string | null): void;

  processKey(key: number): boolean;
  processMouse(point: Point, button: number): boolean;
  requestKeys(): KeyLabel[];

  getParams(): string;
  setParams(params: string): string | undefined;
  getPresets(): PresetMenuEntry[];

  getCustomParamsConfig(): ConfigDescription;
  getCustomParams(): ConfigValues;
  setCustomParams(values: ConfigValues): string | undefined;
  decodeCustomParams(params: string): ConfigValues | string;
  encodeCustomParams(values: ConfigValues): string;

  getPreferencesConfig(): ConfigDescription;
  getPreferences(): ConfigValues;
  setPreferences(values: ConfigValues): string | undefined;
  // There was a `savePreferences(): Uint8Array` / `loadPreferences(data)` pair
  // here, mirroring upstream's `midend_serialise_prefs`. It went with
  // `retire-the-incentre-c-fixture`: the app persists `ConfigValues` per puzzle
  // through get/setPreferences, so the binary form had no caller, and the TS
  // adapter answered it with an empty buffer — a public method that silently
  // returned nothing rather than refusing. If a preferences import/export
  // feature ever wants a wire format, it should choose one, not inherit the C's.

  redraw(): void;
  getColourPalette(defaultBackground: Colour): Colour[];
  /**
   * Per-index dark-mode decisions carried by the palette itself, in the same
   * vocabulary as `augmentation.ts`'s `paletteOverrides` (`false` = "do not
   * adapt this index"). Empty when the palette states nothing of its own.
   */
  darkPalette(defaultBackground: Colour): Record<number, Colour>;
  size(maxSize: Size, isUserSize: boolean, devicePixelRatio: number): Size;
  preferredSize(): Size;
  formatAsText(): string | undefined;

  loadGame(data: Uint8Array<ArrayBuffer>): string | undefined;
  saveGame(): Uint8Array<ArrayBuffer>;

  attachCanvas(canvas: OffscreenCanvas, fontInfo: FontInfo): void;
  deleteDrawing(): void;
  detachCanvas(): void;
  resizeDrawing(size: Size, dpr: number): void;
  setDrawingPalette(colors: string[]): void;
  setDrawingFontInfo(fontInfo: FontInfo): void;
  getImage(options?: ImageEncodeOptions): Promise<Blob>;

  delete(): void;
}
