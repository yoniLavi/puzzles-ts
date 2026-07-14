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
  KeyLabel,
  Point,
  Rect,
  ReferenceModel,
  Size,
} from "../../puzzle/types.ts";
import type { RandomState } from "../random/index.ts";

/** Returned by `interpretMove` when input changed UI/cursor state in
 * place but produced no history move (upstream's `MOVE_UI_UPDATE`).
 * The midend redraws and notifies but pushes no history entry. A
 * unique symbol so it can never be confused with a game's `Move`. */
export const UI_UPDATE: unique symbol = Symbol("ui-update");
export type UiUpdate = typeof UI_UPDATE;

/** A game's answer to {@link Game.supersededDesc}. */
export interface SupersededDesc {
  /** The public description — what a shared game ID and "Game → Specific"
   * name, and what a restart rebuilds from. */
  readonly desc: string;
  /** The description a *save* rebuilds state 0 from, when the public one
   * would not reconstruct it faithfully (Mines: same layout, no first
   * click). Absent ⇒ the public desc is used for both. */
  readonly privDesc?: string;
}

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

/** One user preference a game exposes — the idiomatic-TS form of an
 * upstream `get_prefs`/`set_prefs` config item. The value lives on the
 * game's `Ui` (upstream stores prefs on `game_ui`, and a game's
 * `interpretMove`/`redraw` read them straight off the ui), so each item
 * carries `get`/`set` accessors over `Ui` rather than the engine owning
 * a separate value store. Discriminated by `type`:
 * - `"boolean"` ↔ a boolean value (a checkbox in the app form);
 * - `"choices"` ↔ the selected zero-based index into `choices` (a
 *   select/radio group in the app form).
 * `kw` is the stable keyword the app persists per puzzle. */
export type GamePref<Ui> =
  | {
      kw: string;
      name: string;
      type: "boolean";
      get(ui: Ui): boolean;
      set(ui: Ui, value: boolean): void;
    }
  | {
      kw: string;
      name: string;
      type: "choices";
      choices: string[];
      get(ui: Ui): number;
      set(ui: Ui, value: number): void;
    };

/** One configurable field of a game's **custom params** — the params
 * analogue of `GamePref`, describing the "Custom type…" dialog. The
 * engine builds the app's `ConfigDescription` from this list and parses
 * a submitted `ConfigValues` back through it; validity is decided by the
 * game's own `validateParams`, so the custom dialog rejects exactly the
 * params the game-ID path would. `get`/`set` read/write one field of a
 * `Params` object — the midend always applies `set` to a *copy* of the
 * live params, so a mid-edit or rejected submission never mutates the
 * running game. Discriminated by `type`:
 * - `"string"` ↔ a text field (upstream's `C_STRING`; a numeric field
 *   like width/height parses the string to an integer in `set` and
 *   renders it back in `get`);
 * - `"boolean"` ↔ a checkbox;
 * - `"choices"` ↔ the selected zero-based index into `choices` (a
 *   select/radio group).
 * `kw` is the stable config key the app form uses; `name` the label. */
export type ParamConfigItem<Params> =
  | {
      kw: string;
      name: string;
      type: "string";
      get(p: Params): string;
      set(p: Params, value: string): void;
    }
  | {
      kw: string;
      name: string;
      type: "boolean";
      get(p: Params): boolean;
      set(p: Params, value: boolean): void;
    }
  | {
      kw: string;
      name: string;
      type: "choices";
      choices: string[];
      get(p: Params): number;
      set(p: Params, value: number): void;
    };

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
  /** The game supports the "fill every empty cell with all candidate pencil
   * marks" action (upstream's `M`/`m` key). A game that sets this MUST handle
   * the `M`/`m` key in `interpretMove`; the app shell surfaces a toolbar button
   * (gated on this) that injects that key. Defaults to false (no button). */
  readonly canMarkAll?: boolean;
  /** The game genuinely needs a right (secondary) button to be playable —
   * upstream's `REQUIRE_RBUTTON` flag. Pattern marks empty cells only with
   * the right button, so a touch frontend must surface a secondary-action
   * affordance. Defaults to false (the midend reports it for the app shell). */
  readonly needsRightButton?: boolean;
  /**
   * The game wants to know that a press came from a finger or a pen, and will
   * handle the `MOD_STYLUS` bit itself. Defaults to false, and **should stay
   * false unless the game genuinely gives touch its own behaviour**: the midend
   * strips `MOD_STYLUS` before `interpretMove` for every other game, so that a
   * plain `button === LEFT_BUTTON` test cannot silently ignore every touch.
   *
   * This is a deliberate divergence from upstream, where `midend.c` hands the
   * bit to `interpret_move` and each game is expected to remember to strip it.
   * That is a footgun, and it had already fired: nine ported games (Flip,
   * Galaxies, Pegs, Blackbox, Dominosa, Guess, Signpost, Untangle, Inertia)
   * shipped completely deaf to touch, because comparing the raw button is the
   * obvious thing to write and it silently fails only on a device the test
   * suite never uses. Inverting the default makes the dangerous case the one
   * you have to ask for. Pattern is the only game that asks (it cycles a cell's
   * state on touch, having no right button to cycle with).
   */
  readonly wantsStylusModifier?: boolean;

  /** The on-screen keypad this game wants, faithful to upstream
   * `game_request_keys(params, *nkeys)`. Returns the `{ button, label }`
   * keys (digits/letters plus a clear key, or a game's bespoke keys like
   * Undead's Ghost/Vampire/Zombie). It depends on `params` only — the
   * keypad does not vary with play and the app's key panel reloads only
   * on param change — so it deliberately takes neither state nor ui.
   * Absent ⇒ no keypad (the correct behaviour for games like Flip that
   * upstream gave none). */
  requestKeys?(p: Params): KeyLabel[];

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

  /** What game description describes the board this state belongs to
   * (upstream `midend_supersede_game_desc`)? Implemented only by a game whose
   * board is not fully determined until play begins — Mines generates its mine
   * layout on the *first click* (so the first click is never a mine), and the
   * desc the player started from describes no layout at all.
   *
   * Upstream's game reaches into the midend and pushes a new desc from inside
   * `execute_move`; a TS game has no midend back-reference and `executeMove` is
   * pure, so the engine **pulls** instead: after every committed move it asks
   * this, and a game answers from its own state (Mines' post-click state
   * carries the layout it just generated, so the desc is derivable).
   *
   * Two rules the engine enforces, both mirroring upstream:
   * - **`null` means "nothing to say", never "revert".** A desc describes the
   *   *game*, not the position, so undoing past the superseding move leaves it
   *   superseded — which is why this may not be read as a bidirectional
   *   derivation.
   * - **`privDesc` is the desc a *save* is rebuilt from.** Mines' public desc
   *   describes the layout *plus the first click* (so a shared game ID drops
   *   you on an opened board); replaying the move log from that would re-play a
   *   click already baked in. `privDesc` describes the same layout with no
   *   click, and the engine restores state 0 from it. Omit it when the public
   *   desc reconstructs state 0 faithfully. */
  supersededDesc?(s: State): SupersededDesc | null;

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
   * the player follows it (or `executeHint` plays it) step by step.
   *
   * `aux` is the generator's solution hint (upstream `aux_info`), the
   * same value passed to `solve` — present for freshly-generated games,
   * absent for descriptive game ids or some loaded saves. A game whose
   * best hint derives from the known solution (Untangle) uses it when
   * present and falls back otherwise; deductive games ignore it.
   *
   * `ui` is the live game UI, passed so a hint can honour a player
   * preference that changes how moves behave or how the hint should be
   * expressed (e.g. Towers' auto-pencil mode, which decides whether the
   * hint teaches the trivial row/column note eliminations or folds them
   * into the placement). Optional and ignored by most games. */
  hint?(state: State, aux?: string, ui?: Ui): HintResult<Move>;
  /** Classify a player move against the current hint step. The game
   * MAY adjust `step.move` in place on `"onTrack"` (e.g. shrink a
   * slide's remaining distance after partial manual progress) so a
   * later `executeHint` doesn't overshoot. `"completed"` obliges the
   * game to ensure the resulting state matches the plan's
   * expectation after this step — return `"off"` when in doubt. */
  hintKeepTrack?(m: Move, step: HintStep<Move>, state: State): HintTrackVerdict;

  /** Re-validate a *stored* hint step against the current state right
   * before the midend (re-)displays it, so a kept plan can never show a
   * step whose action has already been resolved out from under it. A
   * move that the plan is following can have side effects the plan
   * didn't author — most concretely Towers' auto-pencil, which silently
   * strikes a placed height from its row/column, removing candidates a
   * *later* stored `pencilStrike` step still names. Return:
   * - the step **with no-longer-actionable parts dropped** (e.g. a
   *   `pencilStrike` filtered to candidates still present), rebuilding
   *   `highlights` to match — return the SAME object reference when
   *   nothing changed, so the midend can cheaply detect "still live";
   * - `null` when the step is now **fully** resolved (every part is a
   *   no-op against the current state) — the midend advances past it,
   *   recomputing the plan if the whole plan drains.
   * Pure (no state mutation). Absent ⇒ the game's stored steps are
   * shown as-is; implement it for any game whose moves can be partially
   * resolved by another move's side effects (the candidate-elimination
   * games). */
  refreshHintStep?(step: HintStep<Move>, state: State): HintStep<Move> | null;

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

  /** Build the game's **reference aid**: a checklist of the puzzle's
   * fixed inventory of pieces with the player's found status, derived
   * purely from the current state (never the solution). Pure. Presence
   * of this hook makes the app show a reference toggle button; absent ⇒
   * no reference aid. `ui` is passed so the model can echo the currently
   * spotlighted piece (`selected`). */
  reference?(state: State, ui: Ui): ReferenceModel;
  /** Spotlight a reference item on the board (or clear it when `key` is
   * null) by mutating `Ui` in place — a `UI_UPDATE`-shaped change the
   * midend repaints but never records as a move. Returns whether
   * anything changed (false ⇒ the midend skips the repaint). Present iff
   * `reference` is. */
  selectReference?(ui: Ui, key: string | null): boolean;

  textFormat?(s: State): string;
  statusbarText?(s: State, ui: Ui): string;

  /** The game's user preferences (upstream `get_prefs`/`set_prefs`),
   * declarative: each entry maps a labelled config item to a field on
   * `Ui`. The midend builds the app's preferences dialog from these,
   * reads current values via `get`, applies edits via `set` (then
   * repaints — a pref like "highlight crossed edges" changes
   * rendering), and re-applies the player's chosen values after each
   * `newUi` so a preference survives starting a new game. Defaults are
   * whatever `newUi` sets. Absent ⇒ the game has no preferences. */
  prefs?: GamePref<Ui>[];

  /** The game's **custom params** configuration form (upstream's
   * `configure`/`custom_params` path), declarative like `prefs`: an
   * ordered list of field descriptors the midend turns into the app's
   * "Custom type…" dialog and parses back onto a copy of `Params`,
   * validated by this game's own `validateParams`. A plain width/height
   * game declares `paramConfig: dimensionParamConfig()`. Absent ⇒ an
   * empty custom dialog (correct for a preset-only game like Flip until
   * it opts in). Independent of the type-summary `describeParams` hook,
   * which renders the menu label rather than the form. */
  paramConfig?: ParamConfigItem<Params>[];

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
