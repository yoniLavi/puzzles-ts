/**
 * The `Game` interface every native-TS port implements.
 *
 * This is an idiomatic TypeScript rendering of upstream's `struct game`
 * (puzzles/puzzles.h): generic over a game's parameter / state / move /
 * UI / draw-state types, with **immutable** state transitions
 * (`executeMove` returns a new state, never mutates), GC instead of
 * `dup_*`/`free_*`, and union/boolean types instead of integer
 * sentinels. A port depends on this interface only — never on the
 * `Midend` — so the interface is the sole contract between a game and
 * the engine.
 *
 * Optional members model genuinely optional upstream capabilities (a
 * game with no solver omits `solve`, a game with no preferences omits
 * `getPrefs`, …). The midend treats an absent optional member as "this
 * game does not have that capability", which is the correct behaviour,
 * not a stub.
 */

import type {
  Colour,
  DrawTextOptions,
  GameStatus,
  Point,
  Rect,
  Size,
} from "../../puzzle/types.ts";
import type { RandomState } from "../random/index.ts";

/** Returned by `interpretMove` when input changed UI/cursor state in
 * place but produced no history move (upstream's `MOVE_UI_UPDATE`).
 * The midend redraws and notifies but pushes no history entry. A
 * unique symbol so it can never be confused with a game's `Move`. */
export const UI_UPDATE: unique symbol = Symbol("ui-update");
export type UiUpdate = typeof UI_UPDATE;

/** Result of a solver attempt — discriminated so a string `Move`
 * cannot be mistaken for an error message. */
export type SolveResult<Move> =
  | { ok: true; move: Move }
  | { ok: false; error: string };

/** A node in the preset/difficulty menu tree. */
export interface PresetMenu<Params> {
  title: string;
  /** Leaf preset, or a submenu. Exactly one is set. */
  params?: Params;
  submenu?: PresetMenu<Params>[];
}

/**
 * The full puzzle drawing API a game's `redraw` may use. This is the
 * long-stable upstream `drawing_api`, rendered in TS; the concrete
 * canvas `Drawing` (src/puzzle/drawing.ts) satisfies it structurally
 * with no change to `Drawing`. The engine does NOT impose a
 * full-vs-incremental redraw policy — per-element diffing and
 * first-draw-only setup are the game's own concern, exactly as
 * upstream. `Blitter` is opaque to games (saved/restored as-is).
 */
export interface GameDrawing<Blitter = unknown> {
  startDraw(): void;
  endDraw(): void;
  drawUpdate(rect: Rect): void;
  clip(rect: Rect): void;
  unclip(): void;
  drawRect(rect: Rect, colour: number): void;
  drawLine(p1: Point, p2: Point, colour: number, thickness: number): void;
  drawPolygon(coords: Point[], fillColour: number, outlineColour: number): void;
  drawCircle(
    centre: Point,
    radius: number,
    fillColour: number,
    outlineColour: number,
  ): void;
  drawText(
    origin: Point,
    options: DrawTextOptions,
    colour: number,
    text: string,
  ): void;
  blitterNew(size: Size): Blitter;
  blitterFree(blitter: Blitter): void;
  blitterSave(blitter: Blitter, origin: Point): void;
  blitterLoad(blitter: Blitter, origin: Point): void;
}

export interface Game<Params, State, Move, Ui = unknown, DrawState = unknown> {
  /** Catalog puzzleId; the registry key. */
  readonly id: string;
  readonly wantsStatusbar: boolean;
  readonly isTimed: boolean;
  readonly canSolve: boolean;
  readonly canFormatAsText: boolean;

  defaultParams(): Params;
  presets(): PresetMenu<Params>;
  encodeParams(p: Params, full: boolean): string;
  decodeParams(s: string): Params;
  /** `null` when valid, else a human-readable reason. */
  validateParams(p: Params, full: boolean): string | null;

  newDesc(p: Params, rng: RandomState): { desc: string; aux?: string };
  /** `null` when valid, else why `desc` is rejected for `p`. */
  validateDesc(p: Params, desc: string): string | null;
  newState(p: Params, desc: string): State;
  newUi(state: State): Ui;

  /** Translate a pointer/key event to a move, `null` for "nothing
   * happened", or `UI_UPDATE` for "UI/cursor changed in place, redraw
   * but add no history entry". */
  interpretMove(
    s: State,
    ui: Ui,
    ds: DrawState | null,
    p: Point,
    button: number,
  ): Move | null | UiUpdate;
  /** Pure: returns a NEW state. Throws if the move is illegal. */
  executeMove(s: State, m: Move): State;

  status(s: State): GameStatus;

  /** Solve from `orig` (the initial state) given `curr`. Present iff
   * `canSolve`. Returns a discriminated result so a `Move` that is
   * itself a string can't be confused with an error message. */
  solve?(orig: State, curr: State, aux?: string): SolveResult<Move>;
  textFormat?(s: State): string;
  statusbarText?(s: State, ui: Ui): string;

  /** RGB palette (each component 0..1), index 0 is conventionally the
   * background. Receives the frontend default background so a game can
   * derive its palette from the host (upstream's
   * `frontend_default_colour`). */
  colours(defaultBackground: Colour): Colour[];
  /** Upstream's `preferred_tilesize`; the size baseline. Default 32. */
  readonly preferredTileSize?: number;
  computeSize(p: Params, tileSize: number): Size;
  /** Upstream's `game_set_size`: tell the draw state the chosen tile
   * size so coordinate mapping (`interpretMove`) and `redraw` agree.
   * The midend calls this after `newDrawState` (at the preferred
   * size) and again whenever `size()` picks a new tile size. */
  setTileSize?(ds: DrawState, tileSize: number): void;
  newDrawState?(s: State): DrawState;
  redraw?(
    dr: GameDrawing,
    ds: DrawState | null,
    prev: State | null,
    s: State,
    dir: number,
    ui: Ui,
    animTime: number,
    flashTime: number,
  ): void;
  animLength?(a: State, b: State, dir: number, ui: Ui): number;
  flashLength?(a: State, b: State, dir: number, ui: Ui): number;
  timingState?(s: State, ui: Ui): boolean;

  /** Serialise/parse a move for the save file. Default: the move must
   * be structured-clone/JSON-safe and is stored as-is. */
  serialiseMove?(m: Move): unknown;
  deserialiseMove?(raw: unknown): Move;
}
