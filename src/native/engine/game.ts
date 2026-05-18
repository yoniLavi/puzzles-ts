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

import type { Colour, GameStatus, Point, Size } from "../../puzzle/types.ts";
import type { RandomState } from "../random/index.ts";

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

/** The minimal drawing surface a game's `redraw` may use. The concrete
 * canvas `Drawing` (src/puzzle/drawing.ts) satisfies this; the keystone
 * does not constrain the optimisation contract (full vs incremental
 * redraw) — that is shaped by the first real port. */
export interface GameDrawing {
  startDraw(): void;
  endDraw(): void;
  drawRect(rect: { x: number; y: number; w: number; h: number }, colour: number): void;
  drawText(origin: Point, options: unknown, colour: number, text: string): void;
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

  /** Translate a pointer/key event to a move, or `null` for "no move". */
  interpretMove(
    s: State,
    ui: Ui,
    ds: DrawState | null,
    p: Point,
    button: number,
  ): Move | null;
  /** Pure: returns a NEW state. Throws if the move is illegal. */
  executeMove(s: State, m: Move): State;

  status(s: State): GameStatus;

  /** Solve from `orig` (the initial state) given `curr`. Present iff
   * `canSolve`. Returns a discriminated result so a `Move` that is
   * itself a string can't be confused with an error message. */
  solve?(orig: State, curr: State, aux?: string): SolveResult<Move>;
  textFormat?(s: State): string;
  statusbarText?(s: State, ui: Ui): string;

  /** RGB palette (each component 0..1), index 0 is conventionally bg. */
  colours(): Colour[];
  /** Upstream's `preferred_tilesize`; the size baseline. Default 32. */
  readonly preferredTileSize?: number;
  computeSize(p: Params, tileSize: number): Size;
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
