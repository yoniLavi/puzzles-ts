/**
 * The Comlink surface a worker-side puzzle presents to the app.
 *
 * `TsWorkerPuzzle` is its only implementer, and it is a hand-stated interface
 * anyway: the app types the worker as `Remote<PuzzleEngineSurface>`, and
 * `Remote<TsWorkerPuzzle>` would drag the concrete class's whole surface across
 * the worker boundary, so every internal method would read as part of the
 * contract.
 */

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
  // No binary preferences form (upstream's `midend_serialize_prefs`): the app
  // persists `ConfigValues` per puzzle through get/setPreferences. A preferences
  // import/export feature should choose its own wire format, not inherit the C's.

  redraw(): void;
  getColorPalette(defaultBackground: Color): Color[];
  /**
   * Per-index dark-mode decisions carried by the palette itself, in the same
   * vocabulary as `augmentation.ts`'s `paletteOverrides` (`false` = "do not
   * adapt this index"). Empty when the palette states nothing of its own.
   */
  darkPalette(defaultBackground: Color): Record<number, Color>;
  size(maxSize: Size): Size;
  preferredSize(): Size;
  formatAsText(): string | undefined;

  loadGame(data: Uint8Array<ArrayBuffer>): string | undefined;
  saveGame(): Uint8Array<ArrayBuffer>;

  attachCanvas(canvas: OffscreenCanvas, fontInfo: FontInfo): void;
  deleteDrawing(): void;
  detachCanvas(): void;
  resizeDrawing(size: Size, dpr: number): void;
  setDrawingPalette(colors: string[]): void;
  getImage(options?: ImageEncodeOptions): Promise<Blob>;

  delete(): void;
}
