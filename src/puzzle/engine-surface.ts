/**
 * The single Comlink-exposed surface a worker-side puzzle presents to
 * the app. Both the C/WASM-backed `WorkerPuzzle` and the
 * TS-midend-backed `TsWorkerPuzzle` `implements` this, so the
 * dispatch seam in `worker.ts` constructs either without an
 * `as unknown as` cast and any drift in either class is a build-time
 * type error (strictly safer than the prior cast). The app's
 * `RemoteWorkerPuzzle` is `Remote<PuzzleEngineSurface>`, the same
 * shape it had before this interface was extracted.
 *
 * Where the two implementations historically used slightly different
 * byte-buffer generics, the looser compatible type is used here so
 * both conform structurally without behavioural change.
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
  Size,
} from "./types.ts";

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
  savePreferences(): Uint8Array;
  loadPreferences(data: Uint8Array): string | undefined;

  redraw(): void;
  getColourPalette(defaultBackground: Colour): Colour[];
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
