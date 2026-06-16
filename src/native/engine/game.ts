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
  ConfigValues,
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
export type SolveResult<Move> = { ok: true; move: Move } | { ok: false; error: string };

/** One step of a hint plan: a move plus a human-readable explanation
 * and optional visual highlights, narrated for the state the step
 * applies to (i.e. the state after every earlier step of the plan).
 * The current step is what the renderer displays and the status bar
 * narrates. */
export interface HintStep<Move, Highlights = unknown> {
  move: Move;
  explanation: string;
  highlights?: Highlights;
  /** True when this step is the continuation of the journey the
   * previous step previewed (e.g. the "then to column 5" leg of
   * "Working on tile 10: move it to row 2, then column 5"). The midend keeps the
   * hint displayed across a manual completion into such a step — the
   * journey was presented as one hint, so it stays on screen through
   * its legs — whereas an unflagged next step waits for the user to
   * ask again. */
  continuesPrevious?: boolean;
}

/** Result of a hint attempt — the whole computed plan as a non-empty
 * ordered sequence of steps, or an error. No move is auto-applied;
 * the midend stores the plan as the active hint, displays one step
 * at a time, and advances as steps complete. Returning the full plan
 * (rather than one move per request) avoids replan drift between
 * steps and pays any expensive search once. */
export type HintResult<Move, Highlights = unknown> =
  | { ok: true; steps: HintStep<Move, Highlights>[] }
  | { ok: false; error: string };

/** The hint plan currently being followed. Stored in the midend (not
 * in game state, never persisted); `steps[index]` is the step being
 * displayed. Advanced by `hintKeepTrack` verdicts and executed-hint
 * animation settles; cleared on undo/redo/restart/new game/solve,
 * when the last step completes, and when the board is solved. */
export interface ActiveHint<Move, Highlights = unknown> {
  steps: HintStep<Move, Highlights>[];
  index: number;
}

/** How a player move relates to the current hint step:
 * - `"completed"` — the move finishes the step; the midend advances
 *   the plan. By returning this the game asserts the resulting state
 *   matches what the plan expected after this step, so the remaining
 *   steps stay valid.
 * - `"onTrack"` — progress toward the step without finishing it; the
 *   midend keeps the step displayed.
 * - `"off"` — the move deviates from the plan; the midend drops it
 *   (the next hint request recomputes). */
export type HintTrackVerdict = "completed" | "onTrack" | "off";

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
  drawText(origin: Point, options: DrawTextOptions, colour: number, text: string): void;
  blitterNew(size: Size): Blitter;
  blitterFree(blitter: Blitter): void;
  blitterSave(blitter: Blitter, origin: Point): void;
  blitterLoad(blitter: Blitter, origin: Point): void;
}

export interface Game<
  Params,
  State,
  Move,
  Ui = unknown,
  DrawState = unknown,
  Mistake = unknown,
> {
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

  /** Map this game's params to the type-summary `ConfigValues` the app's
   * `describeConfig` formatter (`src/puzzle/augmentation.ts`) renders for a
   * custom (non-preset) game. The worker adapter supplies a generic
   * `{ width, height }` base from `w`/`h` params and spreads this result over
   * it, so a game whose params are exactly `w`/`h` may omit this hook.
   * Boolean values MUST be real booleans and choice values numeric indices
   * (never their string renderings) — the formatter coerces via
   * `Number(value)`, which NaNs out a `"true"`/`"false"` string. */
  describeParams?(p: Params): ConfigValues;

  newDesc(p: Params, rng: RandomState): { desc: string; aux?: string };
  /** `null` when valid, else why `desc` is rejected for `p`. */
  validateDesc(p: Params, desc: string): string | null;
  newState(p: Params, desc: string): State;
  newUi(state: State): Ui;

  /** Reconcile persisted Ui against a state transition (upstream
   * `game_changed_state`). The midend calls this — mutating `ui` in
   * place — after every real move/undo/redo/solve/restart and once at
   * new-game setup (`oldState = null`), before animation timing and the
   * repaint, and never on a bare `UI_UPDATE` (the user is mid-edit
   * then). A game whose Ui tracks the current state (e.g. a
   * working-input row reconstructed from the latest move's holds)
   * derives it here. Absent ⇒ the midend treats it as a no-op. */
  changedState?(ui: Ui, oldState: State | null, newState: State): void;

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

  /** Compute a hint plan for the current state: a non-empty ordered
   * sequence of narrated moves, or an error. Nothing is auto-applied
   * — the midend stores the plan and displays one step at a time;
   * the player follows it (or `executeHint` plays it) step by step. */
  hint?(state: State): HintResult<Move>;
  /** Classify a player move against the current hint step. The game
   * MAY adjust `step.move` in place on `"onTrack"` (e.g. shrink a
   * slide's remaining distance after partial manual progress) so a
   * later `executeHint` doesn't overshoot. `"completed"` obliges the
   * game to ensure the resulting state matches the plan's
   * expectation after this step — return `"off"` when in doubt. */
  hintKeepTrack?(m: Move, step: HintStep<Move>, state: State): HintTrackVerdict;

  /** Compute the cells of the current state that contradict the
   * puzzle's unique solution — the mistake-checking divergence from
   * upstream. Pure (no state mutation). Returns game-specific highlight
   * data; an empty result means "no detectable mistakes". Absent ⇒ the
   * game has no notion of a mistake (every reachable state is legal,
   * e.g. a permutation puzzle), and the midend reports the capability
   * as unavailable. The midend stores the result as an ephemeral,
   * never-persisted overlay (cleared on the next transition) and passes
   * it to `redraw`, exactly like a displayed hint step. */
  findMistakes?(state: State): readonly Mistake[];

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
    hint?: HintStep<Move>,
    mistakes?: readonly Mistake[],
  ): void;
  animLength?(a: State, b: State, dir: number, ui: Ui): number;
  flashLength?(a: State, b: State, dir: number, ui: Ui): number;
  timingState?(s: State, ui: Ui): boolean;

  /** Serialise/parse a move for the save file. Default: the move must
   * be structured-clone/JSON-safe and is stored as-is. */
  serialiseMove?(m: Move): unknown;
  deserialiseMove?(raw: unknown): Move;
}
