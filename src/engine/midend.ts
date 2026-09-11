/**
 * The midend: orchestrates a `Game` the way upstream's midend.c orchestrates a
 * `struct game`.
 *
 * It owns, per live game: the selected `Game`, its parameters, the
 * immutable-state move/undo/redo history, the UI, the engine random source,
 * timer bookkeeping and preset handling, and reports them to the app as
 * `ChangeNotification`s.
 *
 * `Midend` is generic over a game's types but implements the
 * non-generic `EngineCore` surface, so the worker adapter and registry
 * never need to erase generics (no `any`).
 */

import { resolvePalette } from "./color/color-mkhighlight.ts";
import { darkValue } from "./color/color-token.ts";
import {
  type ActiveHint,
  type Game,
  type GameDrawing,
  type HintStep,
  type PresetMenu,
  UI_UPDATE,
} from "./game.ts";
import { MOD_STYLUS } from "./pointer.ts";
import { randomNew } from "./random/index.ts";
import { decodeSave, encodeSave, type SaveEnvelope } from "./save.ts";
import type {
  ChangeNotification,
  Color,
  ConfigDescription,
  ConfigValues,
  GameStatus,
  KeyLabel,
  PresetMenuEntry,
  PuzzleStaticAttributes,
  ReferenceModel,
  Size,
} from "./types.ts";

/** Wall-clock duration (seconds) of a hint-executed move's slow-motion
 * animation, whatever the game's own move-animation time. Keep it equal to
 * `puzzle.ts`'s `AUTO_HINT_STEP_MS`, the auto-hint loop's per-step dwell, so
 * auto-hint flows as continuous motion with no frozen gap between steps. A game
 * with no move animation (`animLength` 0) stays instant; the dwell paces it. */
const HINT_ANIM_S = 1.0;

export type NotifyChange = (message: ChangeNotification) => void;
export type NotifyTimerState = (isActive: boolean) => void;
/** "Repaint the canvas now": the worker adapter draws via the `Drawing` it
 * owns, after every processed input and on each animation tick. */
export type NotifyRedraw = () => void;

/** The non-generic surface the worker adapter drives. Every method is
 * expressed in transport types (strings/numbers/notifications) — no
 * game-internal type escapes the midend. */
export interface EngineCore {
  getStaticProperties(): PuzzleStaticAttributes;
  setCallbacks(
    notify: NotifyChange,
    notifyTimer: NotifyTimerState,
    notifyRedraw?: NotifyRedraw,
  ): void;
  newGame(): void;
  newGameFromId(id: string): string | undefined;
  restartGame(): void;
  undo(): void;
  redo(): void;
  solve(): string | undefined;
  hint(): string | undefined;
  executeHint(hideAfter?: boolean): string | undefined;
  /** Duration in milliseconds of the animation currently armed (e.g. by
   * the slow-motion move `executeHint` just played), or 0 when nothing
   * is animating. The auto-hint loop paces each step by this so a move
   * with a short base animation does not sit through a fixed gap tuned
   * for a longer one. */
  currentAnimationMs(): number;
  /** Compute and display the current board's mistakes; return how
   * many. 0 (and no display change) when the game has no
   * mistake-checking. */
  findMistakes(): number;
  /** The active game's reference-aid model, or null when it has none. */
  getReference(): ReferenceModel | null;
  /** Spotlight (or clear) a reference item by mutating Ui, repainting like
   * a `UI_UPDATE`; no move/history/save. No-op without a reference aid. */
  selectReference(key: string | null): void;
  /** The on-screen keypad for the current params, or `[]` for a game
   * that wants none. */
  requestKeys(): KeyLabel[];
  processInput(x: number, y: number, button: number): boolean;
  getParams(): string;
  setParams(params: string): string | undefined;
  getPresets(): PresetMenuEntry[];
  /** The game's **custom-params** form as the app's config-dialog
   * shapes, built from its declarative `paramConfig`. An empty item set
   * for a game that declares none (its custom dialog stays empty). */
  getCustomParamsConfig(): ConfigDescription;
  /** Current custom-params values, read off the live params. */
  getCustomParams(): ConfigValues;
  /** Apply submitted custom-params values onto a copy of the params,
   * validate with the game's own `validateParams`, and — on success —
   * adopt them (so the app generates a new game at those params) or — on
   * failure — return the validation error string without applying. */
  setCustomParams(values: ConfigValues): string | undefined;
  /** Encode the params described by `values` (built the same way as
   * `setCustomParams`) to a game-ID param string, or `#ERROR:<reason>`
   * when they fail `validateParams` — the form's preview path. */
  encodeCustomParams(values: ConfigValues): string;
  /** The game's preferences as the app's config-dialog shapes. An empty
   * item set for a game that declares no `prefs`. */
  getPreferencesConfig(): ConfigDescription;
  getPreferences(): ConfigValues;
  /** Apply the supplied preference values (only the keys present),
   * retaining them across future new games, and repaint. */
  setPreferences(values: ConfigValues): string | undefined;
  getColorPalette(defaultBackground: Color): Color[];
  /** The authored dark-mode value of each palette index that has one; see
   * the implementation on {@link Midend}. */
  darkPalette(defaultBackground: Color): Record<number, Color>;
  preferredSize(): Size;
  /** Pick the largest integer tile size whose board fits `maxSize`, record it
   * (informing the drawstate via `setTileSize`), and return the board's pixel
   * size at it.
   *
   * No other side effect on the drawstate, unlike upstream's `midend_size`,
   * which recreates it on every call: `puzzle-view.ts`'s `ResizeController`
   * calls this on any layout perturbation (CSS transitions, mobile address-bar
   * show/hide), and wiping the per-tile cache then would cause spurious full
   * repaints. `canvasCleared()` is the real signal that the cache is stale.
   *
   * There is no upstream `user_size` flag: the board fills the slot it is
   * given, and the `maxScale` setting caps `maxSize` at N× `preferredSize()`
   * before this is called. */
  size(maxSize: Size): Size;
  /** The frontend just cleared the canvas (`Drawing.resize` resets the
   * backing store, the only path that invalidates pixels), so any per-tile
   * cache the game holds is stale. Discard the drawstate so the game's next
   * `redraw` paints from scratch via its `!ds.started` branch. */
  canvasCleared(): void;
  formatAsText(): string | undefined;
  saveGame(): Uint8Array<ArrayBuffer>;
  loadGame(data: Uint8Array): string | undefined;
  timer(tplus: number): void;
  redraw(dr: GameDrawing): void;
  /** Drop the drawstate and redraw. The worker adapter calls this when the
   * palette or font is replaced: neither clears the canvas, but both
   * invalidate the colors and fonts baked into cached tiles. The game's
   * `!ds.started` branch repaints from scratch, background included. */
  forceRedraw(dr: GameDrawing): void;
  delete(): void;
}

/** A random 128-bit seed string for a fresh game (upstream seeds from system
 * entropy; `random.ts` makes the id reproducible from it). */
function freshSeed(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export class Midend<Params, State, Move, Ui, DrawState> implements EngineCore {
  private params: Params;
  private desc = "";
  /** The save-only description a desc-superseding game supplies alongside its
   * public one (upstream `privdesc`; Mines: the mine layout with no first
   * click). `undefined` for every other game — and for a superseding game
   * before it supersedes. See {@link Game.supersededDesc}. */
  private privDesc?: string;
  /** Whether this game's desc has been superseded. Drives restart, which
   * upstream deliberately rebuilds from the *public* desc so Mines restarts
   * to just *after* the first click ("you don't have to remember where you
   * clicked", midend.c:991) rather than to the blank pre-click board that
   * `history[0]` holds. */
  private descSuperseded = false;
  /** The solved-layout hint a generator returns alongside `desc` (upstream
   * `aux_info`), handed to a game's `solve` and `hint` (Untangle reconstructs
   * the untangled positions from it). Set only on a freshly *generated* game,
   * never for a `:desc` id or a loaded save, as upstream. */
  private aux?: string;
  private seed?: string;
  /** Immutable-state history; `pos` is the current index. */
  private history: State[] = [];
  /** Parallel to `history`: `moveLog[i]` turns `history[i]` into
   * `history[i+1]`, so `moveLog.length === history.length - 1`. */
  private moveLog: Move[] = [];
  private pos = 0;
  private ui!: Ui;
  private drawState: DrawState | null = null;
  private currentTileSize: number;
  private cheated = false;
  /** Last-applied user preference values, keyed by pref `kw`. Retained
   * across new games / loads because the midend recreates `ui` (via
   * `newUi`) on every `startFrom`, which would otherwise reset prefs to
   * their `newUi` defaults; `applyPrefs()` re-applies these onto each
   * fresh ui. Never serialized (the app persists prefs per-puzzle). */
  private prefValues: ConfigValues = {};
  /** The stored hint plan; `steps[index]` is the step on display.
   * Invariant: when non-null, `index < steps.length` (advancing past
   * the last step clears the plan instead). */
  private activeHint: ActiveHint<Move> | null = null;
  private advanceHintOnAnimationEnd = false;
  /** Single-step mode: when an executed step settles, hide the plan
   * instead of previewing the next step. Set by `executeHint(true)` (the
   * Hint-button stepper); left false by auto-play so it keeps previewing. */
  private hideHintAfterStep = false;
  /** Whether the stored plan's current step is on display. Manual
   * play shows one hint per request: completing a step manually
   * advances the plan but hides it until the next `hint()` call.
   * Auto-play (`executeHint`) keeps the display on through its
   * settle-advance so back-to-back steps preview naturally. */
  private hintDisplayed = false;
  /** The mistake overlay currently displayed (game-specific highlight
   * data), or null. Midend-only, never in game state, never persisted;
   * shown until the next transition, exactly like a displayed hint. */
  private activeMistakes: readonly unknown[] | null = null;
  private timerElapsed = 0;
  private notify?: NotifyChange;
  private notifyTimer?: NotifyTimerState;
  private notifyRedraw?: NotifyRedraw;
  private timerWanted = false;

  // Animation/flash state, mirroring midend.c. While a move is
  // animating, `animPrev` is the state being animated *from*; the game
  // is drawn with (animPrev, state, animTime, flashTime). Outside
  // animation all are zero/null and the game draws its final state.
  private animPrev: State | null = null;
  private animTime = 0;
  private animLength = 0;
  // Hint-executed moves play the game's own move animation in slow
  // motion so the user can follow what the hint did: the duration is
  // stretched to `HINT_ANIM_S` and the game is shown proportionally
  // scaled time (`animScale`), so it needs no awareness of the stretch.
  private animScale = 1;
  private pendingHintAnim = false;
  private flashTime = 0;
  private flashLength = 0;
  private animDir = 1;

  constructor(private readonly game: Game<Params, State, Move, Ui, DrawState>) {
    this.params = game.defaultParams();
    this.currentTileSize = this.preferredTileSize;
  }

  // --- lifecycle ---------------------------------------------------

  getStaticProperties(): PuzzleStaticAttributes {
    return {
      canSolve: this.game.canSolve,
      canHint: this.game.hint !== undefined,
      canFindMistakes: this.game.findMistakes !== undefined,
      hasReference: this.game.reference !== undefined,
      canMarkAll: this.game.canMarkAll ?? false,
      ignoresSecondaryButton: this.game.ignoresSecondaryButton ?? false,
      isTimed: this.game.isTimed,
      wantsStatusbar: this.game.wantsStatusbar,
    };
  }

  setCallbacks(
    notify: NotifyChange,
    notifyTimer: NotifyTimerState,
    notifyRedraw?: NotifyRedraw,
  ): void {
    this.notify = notify;
    this.notifyTimer = notifyTimer;
    this.notifyRedraw = notifyRedraw;
  }

  newGame(): void {
    this.seed = freshSeed();
    const rng = randomNew(this.seed);
    const { desc, aux } = this.game.newDesc(this.params, rng);
    this.startFrom(desc, aux);
  }

  newGameFromId(id: string): string | undefined {
    // `<params>:<desc>` (descriptive) or `<params>#<seed>` (random).
    const sep = id.search(/[:#]/);
    if (sep < 0) return "Invalid game ID (no ':' or '#')";
    const paramsStr = id.slice(0, sep);
    const rest = id.slice(sep + 1);
    let params: Params;
    try {
      params = this.game.decodeParams(paramsStr);
    } catch (e) {
      return `Invalid parameters: ${(e as Error).message}`;
    }
    // `full` means "these params are about to generate a board". A `#seed` id
    // regenerates and so is bound by whatever generation cannot do; a `:desc`
    // id arrives with the board already in hand, so a generation-only bound
    // must not refuse it — otherwise an id shared before the bound existed
    // stops loading. Upstream midend.c:1956 passes exactly `desc == NULL`.
    const generating = id[sep] === "#";
    const pErr = this.game.validateParams(params, generating);
    if (pErr) return pErr;

    if (generating) {
      const rng = randomNew(rest);
      const { desc, aux } = this.game.newDesc(params, rng);
      this.params = params;
      this.seed = rest;
      this.startFrom(desc, aux);
      return undefined;
    }
    const dErr = this.game.validateDesc(params, rest);
    if (dErr) return dErr;
    this.params = params;
    this.seed = undefined;
    this.startFrom(rest);
    return undefined;
  }

  private startFrom(desc: string, aux?: string): void {
    this.desc = desc;
    this.privDesc = undefined;
    this.descSuperseded = false;
    this.aux = aux;
    const initial = this.game.newState(this.params, desc);
    this.history = [initial];
    this.moveLog = [];
    this.pos = 0;
    this.ui = this.game.newUi(initial);
    // Upstream `game_changed_state` with oldstate == NULL: let a game
    // whose Ui tracks the current state seed it from the fresh board.
    this.game.changedState?.(this.ui, null, initial);
    // `newUi` reset any preference fields to their defaults; re-apply the
    // player's choices (upstream keeps one `game_ui` across new games).
    this.applyPrefs();
    this.drawState = this.freshDrawState(initial);
    this.cheated = false;
    this.clearHint();
    this.clearMistakes();
    this.timerElapsed = 0;
    this.clearAnimation();
    this.emitIdChange();
    this.emitParamsChange();
    this.emitStateChange();
    this.emitStatusBar();
    // Repaint explicitly: a deterministic board (English Pegs) deals the same
    // desc every time, so the app sees no game-id change to repaint on.
    this.requestRedraw();
    this.syncTimer();
  }

  restartGame(): void {
    if (this.history.length === 0) return;
    const prev = this.state;
    // A superseded game restarts from its public desc (see `descSuperseded`);
    // every other game's `history[0]` *is* `newState(params, desc)`.
    this.history = [
      this.descSuperseded
        ? this.game.newState(this.params, this.desc)
        : this.history[0],
    ];
    this.moveLog = [];
    this.pos = 0;
    this.game.changedState?.(this.ui, prev, this.state);
    this.cheated = false;
    this.clearHint();
    this.clearMistakes();
    this.clearAnimation();
    this.emitStateChange();
    this.emitStatusBar();
    this.requestRedraw();
    this.syncTimer();
  }

  // --- moves / undo / redo ----------------------------------------

  private get state(): State {
    return this.history[this.pos];
  }

  /**
   * A draw state for `s`, with the current tile size already applied. The two
   * steps are paired here, not at each caller, because the pairing is what
   * makes `Game.interpretMove`'s promise true: `ds` is non-null *and* sized, so
   * a game reads `ds.tilesize` rather than guessing at the preferred size.
   */
  private freshDrawState(s: State): DrawState {
    const ds = this.game.newDrawState(s);
    this.game.setTileSize?.(ds, this.currentTileSize);
    return ds;
  }

  processInput(x: number, y: number, button: number): boolean {
    // No board, no drawstate, nothing to interpret against. The app does not
    // send input before a game exists; this is what makes `interpretMove`'s
    // non-null `ds` true rather than merely usually-true.
    if (this.drawState === null) return false;
    // A finger or pen press arrives with MOD_STYLUS set. Strip it unless the
    // game asked to see it: a game that forgets to strip it silently ignores
    // every touch (see `Game.wantsStylusModifier`).
    const b = this.game.wantsStylusModifier ? button : button & ~MOD_STYLUS;

    const move = this.game.interpretMove(
      this.state,
      this.ui,
      this.drawState,
      { x, y },
      b,
    );
    if (move === null) return false;
    if (move === UI_UPDATE) {
      // UI/cursor changed in place: redraw + notify, no history entry,
      // no animation. A game whose UI change is an alternative display
      // (Subsets' reference aid) dismisses any displayed hint here, so
      // the aid isn't silently suppressed by a still-active hint;
      // `afterTransition` re-emits the status bar without the hint text.
      if (this.uiUpdateDismisses()) this.clearHint();
      this.clearAnimation();
      this.afterTransition();
      return true;
    }
    // Classify the move against the plan with the PRE-move state (the
    // established `hintKeepTrack` contract — a game may itself apply the
    // move to reason about its result, e.g. Sixteen's slide), then
    // re-validate the kept plan against the POST-move state so a later
    // step the move's side effects already resolved is never shown stale.
    // `next` is computed once and reused for both the re-validation and
    // the commit. (Upstream's frontend has no plan; this ordering is ours.)
    const prev = this.state;
    const next = this.game.executeMove(prev, move);
    const step = this.currentHintStep;
    if (step !== undefined) {
      const verdict = this.game.hintKeepTrack?.(move, step, prev) ?? "off";
      if (verdict === "completed") {
        // The game asserts the post-move state matches the plan's
        // expectation after this step, so the rest stays valid —
        // advance. Manual play surfaces one hint per request, so the
        // display hides until the next `hint()` call — unless the
        // next step continues the journey this step previewed
        // ("then to column 5"): that was presented as one hint, so
        // it stays on screen through its legs. Re-validate first, so a
        // continuation step the move already resolved (auto-pencil
        // striking what an explicit `pencilStrike` leg would have) is
        // skipped rather than shown empty.
        this.advanceHint();
        this.refreshActiveHint(next);
        this.hintDisplayed = this.currentHintStep?.continuesPrevious === true;
      } else if (verdict === "off") {
        this.clearHint();
      } else {
        // "onTrack": keep the current step (the game may have adjusted
        // its move in place to the remaining distance) — but drop any of
        // its parts this move's side effects also resolved, and if that
        // empties the step, advance as if completed.
        const idxBefore = this.activeHint?.index ?? -1;
        this.refreshActiveHint(next);
        this.hintDisplayed =
          this.activeHint != null && this.activeHint.index === idxBefore
            ? true
            : this.currentHintStep?.continuesPrevious === true;
      }
    }
    return this.commitMove(next, move);
  }

  private applyMove(move: Move): boolean {
    return this.commitMove(this.game.executeMove(this.state, move), move);
  }

  /** Commit an already-computed post-move state to history and run the
   * transition bookkeeping. Split from `applyMove` so `processInput` can
   * classify/re-validate the hint plan against `next` *before* the
   * commit's redraw paints, keeping the displayed step in sync with the
   * frame. */
  private commitMove(next: State, move: Move): boolean {
    // Check BEFORE touching history. A game whose `switch` is exhaustive over
    // its move union has no `default` arm, so a move *typed* right and *valued*
    // wrong (an unknown `type` replayed from another build's save, cast rather
    // than parsed) falls off the end as `undefined`, which TypeScript cannot
    // see. In `history` it would make every later `changedState` and `redraw`
    // throw; refusing it here confines the damage to one move and gives
    // `loadGame` something to report.
    if (next === undefined || next === null) {
      throw new Error(
        `${this.game.id}: executeMove returned no state for move ` +
          `${JSON.stringify(move)}: the move is not one this build can play`,
      );
    }
    const prev = this.state;
    // A new move after an undo truncates the redo branch (history and
    // the parallel move log stay in lockstep: moveLog[i] is the move
    // that turns history[i] into history[i+1]).
    this.history = this.history.slice(0, this.pos + 1);
    this.moveLog = this.moveLog.slice(0, this.pos);
    this.history.push(next);
    this.moveLog.push(move);
    this.pos = this.history.length - 1;
    this.applySupersede();
    this.game.changedState?.(this.ui, prev, next);
    this.setupAnimation(prev, next, 1);
    this.afterTransition();
    return true;
  }

  /** Upstream `midend_supersede_game_desc`, pulled rather than pushed: ask the
   * game what desc describes the board it is now on, and adopt it if it has
   * changed (see {@link Game.supersededDesc} for why the game cannot push).
   *
   * Called from `commitMove` only — never from undo/redo/restart. A desc
   * describes the *game*, not the position: undoing past Mines' first click
   * must not un-generate the layout the game ID now names. Answering `null`
   * therefore means "nothing to say", never "revert", and a state that has
   * gone backwards past the supersession simply says nothing. */
  private applySupersede(): void {
    const sup = this.game.supersededDesc?.(this.state);
    if (!sup) return;
    this.descSuperseded = true;
    if (sup.desc === this.desc && sup.privDesc === this.privDesc) return;
    this.desc = sup.desc;
    this.privDesc = sup.privDesc;
    this.emitIdChange();
  }

  undo(): void {
    if (this.pos === 0) return;
    this.clearHint();
    const prev = this.state;
    this.pos -= 1;
    this.game.changedState?.(this.ui, prev, this.state);
    this.setupAnimation(prev, this.state, -1);
    this.afterTransition();
  }

  redo(): void {
    if (this.pos >= this.history.length - 1) return;
    this.clearHint();
    const prev = this.state;
    this.pos += 1;
    this.game.changedState?.(this.ui, prev, this.state);
    this.setupAnimation(prev, this.state, 1);
    this.afterTransition();
  }

  /** Replay game `Move`s as if the player had made them, bypassing
   * `interpretMove`'s pointer mapping. Each goes through the same transition
   * path as a real move (history, move log, `changedState`, animation,
   * save/undo), so the result is indistinguishable from one reached by
   * clicking; the render-scenario harness uses it to reach a target frame.
   *
   * It does not consult the hint plan (`hintKeepTrack`), since replayed moves
   * are setup rather than an answer to a displayed hint, so any stored plan is
   * dropped, as a self-played move drops it. A kept plan would re-show a stale
   * step on the next `hint()` (re-validation is a no-op for a game without
   * `refreshHintStep`), and a stale step can be illegal to execute (Flood). */
  playMoves(moves: readonly Move[]): void {
    if (moves.length > 0) this.clearHint();
    for (const move of moves) this.applyMove(move);
  }

  solve(): string | undefined {
    if (!this.game.canSolve || !this.game.solve) {
      return "This game does not support solving";
    }
    const result = this.game.solve(this.history[0], this.state, this.aux);
    if (!result.ok) return result.error;
    this.clearHint();
    this.cheated = true;
    this.applyMove(result.move);
    return undefined;
  }

  // --- hints ---------------------------------------------------------

  /** The stored plan's current step (`undefined` when no plan is
   * active) — what `hintKeepTrack` classifies moves against and what
   * `executeHint` plays, displayed or not. */
  private get currentHintStep(): HintStep<Move> | undefined {
    return this.activeHint?.steps[this.activeHint.index];
  }

  /** The step on display (`undefined` when no plan is active or the
   * plan is hidden). This is what `redraw` and the status bar
   * narrate. */
  private get displayedHintStep(): HintStep<Move> | undefined {
    return this.hintDisplayed ? this.currentHintStep : undefined;
  }

  /** Does this `UI_UPDATE` put the hint away? Asked only while a plan is stored
   * (with nothing stored there is nothing to dismiss), and *after*
   * `interpretMove` has updated the ui — so a game answering per step sees the
   * cursor where the player just put it. */
  private uiUpdateDismisses(): boolean {
    const step = this.currentHintStep;
    if (step === undefined) return false;
    return this.game.uiUpdateClearsHint?.(step, this.state, this.ui) ?? false;
  }

  private clearHint(): void {
    this.activeHint = null;
    this.advanceHintOnAnimationEnd = false;
    this.hideHintAfterStep = false;
    this.hintDisplayed = false;
  }

  /** Drop the mistake overlay. Called on every transition (a move,
   * undo, redo, new/restart game) so a stale "you were wrong here"
   * highlight never outlives the move that might have fixed it. */
  private clearMistakes(): void {
    this.activeMistakes = null;
  }

  findMistakes(): number {
    if (!this.game.findMistakes) return 0;
    const mistakes = this.game.findMistakes(this.state);
    this.activeMistakes = mistakes.length > 0 ? mistakes : null;
    this.requestRedraw();
    return mistakes.length;
  }

  getReference(): ReferenceModel | null {
    if (!this.game.reference) return null;
    return this.game.reference(this.state, this.ui);
  }

  selectReference(key: string | null): void {
    if (!this.game.selectReference) return;
    if (this.game.selectReference(this.ui, key)) {
      this.clearAnimation();
      this.afterTransition();
    }
  }

  /** Advance the plan past its current step; the plan clears when the
   * last step completes. */
  private advanceHint(): void {
    if (!this.activeHint) return;
    this.activeHint.index += 1;
    if (this.activeHint.index >= this.activeHint.steps.length) {
      this.clearHint();
    }
  }

  /** Re-validate the stored plan against `state` (the state about to be
   * displayed) so a displayed step never references already-resolved
   * work — the engine-level "a displayed hint step is never stale"
   * guarantee. Drops no-longer-actionable parts of the current step via
   * the game's `refreshHintStep`, advances past any step that is now
   * fully resolved, and clears the plan if it drains entirely. A game
   * without the hook is left untouched (its move types can't be
   * partially resolved by a sibling move's side effects). */
  private refreshActiveHint(state: State = this.state): void {
    if (!this.game.refreshHintStep) return;
    // Bounded by the plan length: each iteration either settles on a
    // live step (returns) or advances the index by one.
    for (let guard = (this.activeHint?.steps.length ?? 0) + 1; guard > 0; guard--) {
      if (!this.activeHint) return;
      const step = this.currentHintStep;
      if (step === undefined) {
        this.clearHint();
        return;
      }
      const refreshed = this.game.refreshHintStep(step, state);
      if (refreshed === null) {
        // Fully resolved by an earlier move's side effects — skip it.
        this.advanceHint();
        continue;
      }
      if (refreshed !== step) this.activeHint.steps[this.activeHint.index] = refreshed;
      return;
    }
  }

  /** Compute and store a fresh plan at index 0. Returns the error
   * message when no plan is available. */
  private computeHintPlan(): string | undefined {
    if (!this.game.hint) {
      return "This game does not support hints";
    }
    const result = this.game.hint(this.state, this.aux, this.ui);
    if (!result.ok) {
      // Keep the refusal's promise. A hint is typically refused because the
      // board has mistakes ("fix the highlighted mistakes first") — but the
      // message alone highlights nothing. Surface them in the same overlay
      // Check & Save uses, so the offending cells actually light up. Refusals
      // with no mistakes (already solved, nothing deducible) find zero and
      // highlight nothing; a game without `findMistakes` is a no-op.
      this.findMistakes();
      return result.error;
    }
    if (result.steps.length === 0) return "Game returned an empty hint plan";
    this.activeHint = { steps: result.steps, index: 0 };
    this.advanceHintOnAnimationEnd = false;
    this.hintDisplayed = true;
    return undefined;
  }

  /** Settle bookkeeping after a move finishes animating (or applies
   * instantly in a game with no animation): advance past an
   * executed-hint step, and drop any plan once the board is solved. */
  private settleHint(): void {
    const before = this.displayedHintStep;
    if (this.advanceHintOnAnimationEnd) {
      this.advanceHintOnAnimationEnd = false;
      this.advanceHint();
      // Re-validate the now-current step before it is previewed during
      // the rest period — the executed move's side effects may have
      // resolved part or all of it (same guarantee as the manual path).
      this.refreshActiveHint();
      // Single-step mode (the Hint-button stepper): the move has landed,
      // so hide the (now-advanced) plan instead of previewing the next
      // step. The next `hint()` re-shows it — show/apply alternation, one
      // hint per press. Auto-play leaves this false and keeps the preview.
      if (this.hideHintAfterStep) {
        this.hideHintAfterStep = false;
        this.hintDisplayed = false;
      }
    }
    if (this.activeHint && this.game.status(this.state) === "solved") {
      this.clearHint();
    }
    if (this.displayedHintStep !== before) this.emitStatusBar();
  }

  hint(): string | undefined {
    if (this.activeHint) {
      // A valid plan is stored: re-validate it against the current state
      // (a kept plan's later step may have been resolved by a followed
      // move's side effects), then (re-)display its current step. Don't
      // recompute or advance otherwise — advancing is driven only by
      // moves (manual or executed), which is what makes "recompute only
      // when invalidated" hold for the manual flow. A plan hidden by a
      // manual step completion re-shows here: one hint per request.
      this.refreshActiveHint();
      if (this.activeHint) {
        this.hintDisplayed = true;
        this.emitStatusBar();
        this.requestRedraw();
        return undefined;
      }
      // The re-validation drained the whole plan (every remaining step
      // was already resolved) — fall through and recompute a fresh one.
    }
    const err = this.computeHintPlan();
    if (err) return err;
    this.clearAnimation();
    this.afterTransition();
    return undefined;
  }

  /** The displayed hint step (see {@link displayedHintStep}), exposed so the
   * render-scenario harness and tests can assert on the structured step rather
   * than only its draw ops, and walk a plan with `executeHint`. */
  activeHintStep(): HintStep<Move> | undefined {
    return this.displayedHintStep;
  }

  executeHint(hideAfter = false): string | undefined {
    // A previously executed step may still be animating (e.g. the
    // user outpaces the auto-play settle). Its move is already
    // applied to the state, so advance past it now rather than
    // replaying it.
    if (this.advanceHintOnAnimationEnd) this.settleHint();
    if (!this.activeHint) {
      const err = this.computeHintPlan();
      if (err) return err;
    }
    const step = this.currentHintStep;
    if (step === undefined) return "Game returned an empty hint plan"; // unreachable
    // The executed step stays displayed through the slow-motion
    // animation (the banner describes the move in flight). On settle the
    // plan advances and, in auto-play (`hideAfter` false), the *next* step
    // is previewed during the rest period; in single-step mode
    // (`hideAfter` true, the Hint-button stepper) the plan is hidden so
    // the player gets one applied hint per press and asks again for more.
    this.hintDisplayed = true;
    this.advanceHintOnAnimationEnd = true;
    this.hideHintAfterStep = hideAfter;
    this.pendingHintAnim = true;
    // A game with no move animation settles synchronously inside
    // `afterTransition` (the timer's settle path never runs for it).
    this.applyMove(step.move);
    return undefined;
  }

  currentAnimationMs(): number {
    // `animLength` is already the scaled duration (base × animScale), in
    // seconds; the auto-hint loop wants milliseconds.
    return this.animLength * 1000;
  }

  private afterTransition(): void {
    // Any transition (move/undo/redo/UI update/solve, and a hint
    // request) invalidates a displayed mistake overlay — the board has
    // changed, so the old "wrong here" marks no longer describe it.
    this.clearMistakes();
    this.emitStateChange();
    this.emitStatusBar();
    // A non-animated transition paints immediately (the C frontend
    // redraws after every processed input). An animated one does NOT
    // paint synchronously here: that would show a degenerate
    // animTime=0 frame and race the rAF loop one frame later
    // (visible flicker). The timer drives every animation frame,
    // including the first — exactly as midend.c's frontend timer does.
    if (!this.animating) {
      // Settled instantly: run the same hint bookkeeping the timer's
      // settle path runs (advance an executed step, drop the plan on
      // a solved board), then paint.
      this.settleHint();
      this.requestRedraw();
    }
    this.syncTimer();
  }

  // --- animation (mirrors midend.c) --------------------------------

  /** Arm animation/flash for a state transition. The game decides the
   * durations via `animLength`/`flashLength`; absent ⇒ 0 ⇒ no
   * animation (the transition just paints its final state). */
  private setupAnimation(prev: State, next: State, dir: number): void {
    this.animDir = dir;
    const a = this.game.animLength?.(prev, next, dir, this.ui) ?? 0;
    const f = this.game.flashLength?.(prev, next, dir, this.ui) ?? 0;
    // A hint move stretches the game's base animation to the uniform
    // `HINT_ANIM_S`; `animScale` (= stretched / base) is what `redraw`
    // divides `animTime` by so the game, which only knows its own base
    // anim length, still spans the full stretched duration. A
    // non-animated game (a = 0) can't be stretched — leave it instant.
    if (this.pendingHintAnim && a > 0) {
      this.animLength = HINT_ANIM_S;
      this.animScale = HINT_ANIM_S / a;
    } else {
      this.animLength = a;
      this.animScale = 1;
    }
    this.pendingHintAnim = false;
    this.animTime = 0;
    this.flashLength = f;
    this.flashTime = 0;
    // Keep the from-state only while a move is actually animating; a
    // flash-only transition draws the final state with a flash overlay.
    this.animPrev = a > 0 ? prev : null;
  }

  private clearAnimation(): void {
    this.animPrev = null;
    this.animTime = 0;
    this.animLength = 0;
    this.animScale = 1;
    this.flashTime = 0;
    this.flashLength = 0;
    this.animDir = 1;
  }

  private get animating(): boolean {
    return this.animTime < this.animLength || this.flashTime < this.flashLength;
  }

  private requestRedraw(): void {
    this.notifyRedraw?.();
  }

  // --- status ------------------------------------------------------

  /** Game-reported status, upgraded to solved-with-help if the solver
   * was used (mirrors midend.c). */
  private currentStatus(): GameStatus {
    const s = this.game.status(this.state);
    if (s === "solved" && this.cheated) return "solved-with-help";
    return s;
  }

  // --- params / presets -------------------------------------------

  requestKeys(): KeyLabel[] {
    return this.game.requestKeys?.(this.params) ?? [];
  }

  getParams(): string {
    return this.game.encodeParams(this.params, true);
  }

  setParams(params: string): string | undefined {
    let decoded: Params;
    try {
      decoded = this.game.decodeParams(params);
    } catch (e) {
      return `Invalid parameters: ${(e as Error).message}`;
    }
    const err = this.game.validateParams(decoded, true);
    if (err) return err;
    this.params = decoded;
    this.emitParamsChange();
    return undefined;
  }

  getPresets(): PresetMenuEntry[] {
    const walk = (menu: PresetMenu<Params>): PresetMenuEntry => {
      if (menu.submenu) {
        return { title: menu.title, params: "", submenu: menu.submenu.map(walk) };
      }
      return {
        title: menu.title,
        params: menu.params ? this.game.encodeParams(menu.params, true) : "",
      };
    };
    const root = walk(this.game.presets());
    return root.submenu ?? [root];
  }

  // --- custom params ----------------------------------------------

  getCustomParamsConfig(): ConfigDescription {
    const items: ConfigDescription["items"] = {};
    for (const item of this.game.paramConfig ?? []) {
      items[item.kw] =
        item.type === "boolean"
          ? { type: "boolean", name: item.name }
          : item.type === "choices"
            ? { type: "choices", name: item.name, choicenames: item.choices }
            : { type: "string", name: item.name };
    }
    return { title: this.game.id, items };
  }

  /** Current custom-params values read off the live params: a string for
   * a text field, a boolean for a checkbox, the selected zero-based index
   * for a choices item. */
  getCustomParams(): ConfigValues {
    const values: ConfigValues = {};
    for (const item of this.game.paramConfig ?? []) {
      values[item.kw] = item.get(this.params);
    }
    return values;
  }

  /** Map submitted form `values` onto a *copy* of the current params
   * (never the live params, so a rejected edit leaves the running game
   * untouched), coercing each to its item's type exactly like
   * `applyPrefs`. Only keys the form actually submitted are applied;
   * the rest keep their current value. */
  private paramsFromCustomValues(values: ConfigValues): Params {
    const draft = structuredClone(this.params);
    for (const item of this.game.paramConfig ?? []) {
      const v = values[item.kw];
      if (v === undefined) continue;
      if (item.type === "boolean") {
        item.set(draft, v === true || v === "true" || v === 1);
      } else if (item.type === "choices") {
        const n = Number(v);
        if (!Number.isNaN(n)) item.set(draft, n);
      } else {
        item.set(draft, String(v));
      }
    }
    return draft;
  }

  setCustomParams(values: ConfigValues): string | undefined {
    if (!this.game.paramConfig?.length) return undefined;
    const draft = this.paramsFromCustomValues(values);
    const err = this.game.validateParams(draft, true);
    if (err) return err;
    this.params = draft;
    this.emitParamsChange();
    return undefined;
  }

  encodeCustomParams(values: ConfigValues): string {
    if (!this.game.paramConfig?.length) {
      return this.game.encodeParams(this.params, true);
    }
    const draft = this.paramsFromCustomValues(values);
    const err = this.game.validateParams(draft, true);
    if (err) return `#ERROR:${err}`;
    return this.game.encodeParams(draft, true);
  }

  // --- preferences -------------------------------------------------

  getPreferencesConfig(): ConfigDescription {
    const items: ConfigDescription["items"] = {};
    for (const p of this.game.prefs ?? []) {
      items[p.kw] =
        p.type === "boolean"
          ? { type: "boolean", name: p.name }
          : { type: "choices", name: p.name, choicenames: p.choices };
    }
    return { title: this.game.id, items };
  }

  /** Current preference values read off the live ui: a boolean for a
   * boolean item, the selected zero-based index for a choices item. */
  getPreferences(): ConfigValues {
    const values: ConfigValues = {};
    if (this.history.length === 0) return values;
    for (const p of this.game.prefs ?? []) {
      values[p.kw] = p.get(this.ui);
    }
    return values;
  }

  setPreferences(values: ConfigValues): string | undefined {
    // Merge into the retained set (the form may submit only the changed
    // keys), then apply onto the live ui and repaint — a preference like
    // "highlight crossed edges" or "vertex style" changes what `redraw`
    // paints.
    this.prefValues = { ...this.prefValues, ...values };
    if (this.history.length > 0) {
      this.applyPrefs();
      // A preference can change anything the game paints, yet it moves
      // none of the keys a game's redraw early-out watches (positions,
      // background, cursor) — so a plain repaint would be skipped by
      // that cache. Drop the drawstate first, exactly as for a
      // palette/font change, so the next redraw repaints from scratch.
      this.canvasCleared();
      this.requestRedraw();
    }
    return undefined;
  }

  /** Write the retained preference values onto the current ui, coercing
   * each to its item's type (the app form supplies a boolean for a
   * checkbox and a numeric index for a choice, but DB-loaded JSON or a
   * legacy value may arrive loosely typed). Applies only keys present in
   * `prefValues`, leaving the `newUi` default for the rest. */
  private applyPrefs(): void {
    for (const p of this.game.prefs ?? []) {
      const v = this.prefValues[p.kw];
      if (v === undefined) continue;
      if (p.type === "boolean") {
        p.set(this.ui, v === true || v === "true" || v === 1);
      } else {
        const n = Number(v);
        if (!Number.isNaN(n)) p.set(this.ui, n);
      }
    }
  }

  /** The game's palette against `defaultBackground` — the host's color, which
   * `resolvePalette` shifts off the extremes before the game sees it, so every
   * game's board sits at one tone whether or not its own `colors()` calls
   * `mkhighlight`. */
  getColorPalette(defaultBackground: Color): Color[] {
    return resolvePalette(this.game, defaultBackground);
  }

  /**
   * The **authored dark-mode value** of every palette index whose token states
   * one, as sRGB in the same unit the token table is written in.
   *
   * A token carries its dark value as a property of the array (see
   * `color-token.ts`), which cannot survive transfer to the frontend —
   * structured clone keeps an array's indices and drops its other own
   * properties. So it is read off here, engine-side, and sent as plain
   * per-index data.
   *
   * An index that is **absent** has no authored dark value and is adapted by
   * `utils/color.ts`'s calculation, which lets a scheme be authored token by
   * token.
   *
   * A per-puzzle entry in `augmentation.ts` wins over this: it is the more
   * specific statement, and a game that wants its black *lifted* rather than
   * preserved (Light Up's wall) says so there.
   */
  darkPalette(defaultBackground: Color): Record<number, Color> {
    const out: Record<number, Color> = {};
    resolvePalette(this.game, defaultBackground).forEach((color, i) => {
      const dark = color && darkValue(color);
      if (dark) out[i] = [...dark] as Color;
    });
    return out;
  }

  private get preferredTileSize(): number {
    return this.game.preferredTileSize ?? 32;
  }

  preferredSize(): Size {
    return this.game.computeSize(this.params, this.preferredTileSize);
  }

  size(maxSize: Size): Size {
    const base = this.game.computeSize(this.params, this.preferredTileSize);
    if (base.w <= 0 || base.h <= 0) return base;
    // Upstream midend_size's binary search, in its `user_size` form: the tile
    // may exceed the game's preferred size to fill the slot.
    const fits = (ts: number): boolean => {
      const s = this.game.computeSize(this.params, ts);
      return s.w <= maxSize.w && s.h <= maxSize.h;
    };
    let hi = 1;
    do {
      hi *= 2;
    } while (fits(hi));
    let lo = 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    const tile = lo;
    this.currentTileSize = tile;
    // `drawState` is null only before the first board exists.
    if (this.drawState !== null) this.game.setTileSize?.(this.drawState, tile);
    return this.game.computeSize(this.params, tile);
  }

  canvasCleared(): void {
    if (this.history.length === 0) return;
    this.drawState = this.freshDrawState(this.history[0]);
  }

  formatAsText(): string | undefined {
    if (!this.game.canFormatAsText || !this.game.textFormat) return undefined;
    return this.game.textFormat(this.state);
  }

  // --- save / load -------------------------------------------------

  saveGame(): Uint8Array<ArrayBuffer> {
    const serMove = this.game.serializeMove ?? ((m: Move) => m as unknown);
    const envelope: SaveEnvelope = {
      v: 2,
      puzzleId: this.game.id,
      params: this.game.encodeParams(this.params, true),
      desc: this.desc,
      ...(this.privDesc === undefined ? {} : { privDesc: this.privDesc }),
      moves: this.moveLog.map(serMove),
      pos: this.pos,
      timerElapsed: this.timerElapsed,
      cheated: this.cheated,
      ...(this.game.encodeUi ? { ui: this.game.encodeUi(this.ui) } : {}),
    };
    return encodeSave(envelope);
  }

  loadGame(data: Uint8Array): string | undefined {
    let env: SaveEnvelope;
    try {
      env = decodeSave(data);
    } catch (e) {
      return `Could not read save: ${(e as Error).message}`;
    }
    if (env.puzzleId !== this.game.id) {
      return `Save is for "${env.puzzleId}", not "${this.game.id}"`;
    }
    let params: Params;
    try {
      params = this.game.decodeParams(env.params);
    } catch (e) {
      return `Invalid saved parameters: ${(e as Error).message}`;
    }
    this.params = params;
    this.seed = undefined;
    // State 0 is rebuilt from the private desc when the save carries one — the
    // public desc bakes in the first click the move log is about to replay
    // (upstream midend.c:2663). The public desc is then restored over it, since
    // it, not the layout-only one, is what the game *is* (and what the id names);
    // the replay's own `applySupersede` will agree with it.
    this.startFrom(env.privDesc ?? env.desc);
    if (env.privDesc !== undefined) {
      this.desc = env.desc;
      this.privDesc = env.privDesc;
      this.descSuperseded = true;
      this.emitIdChange();
    }
    const deMove = this.game.deserializeMove ?? ((raw: unknown) => raw as Move);
    try {
      for (const raw of env.moves) {
        this.applyMove(deMove(raw));
      }
    } catch (e) {
      // A save is untrusted input: its `moves` are `unknown[]`, *cast* to
      // `Move` rather than parsed, so a move written by a different build
      // reaches `executeMove` looking well-typed and can come back with no
      // state at all (`commitMove` refuses it rather than letting it into
      // `history`). Rewind to the saved game's opening position — a real,
      // drawable board with the right params and desc — and report. Anything
      // that leaves a half-replayed history strands the player on a board
      // that throws on every repaint, which is the bug this replaced.
      this.startFrom(env.privDesc ?? env.desc);
      return `Could not restore this saved game: ${(e as Error).message}`;
    }
    this.pos = Math.min(env.pos, this.history.length - 1);
    this.cheated = env.cheated;
    this.timerElapsed = env.timerElapsed;
    // Restore Ui state the move log cannot reconstruct (Mines' death counter /
    // completion flag), after the replay above — replay goes through
    // `executeMove`, never `interpretMove`, so a death removed from the log by
    // an undo would otherwise be lost. See {@link Game.encodeUi}.
    if (env.ui !== undefined) this.game.decodeUi?.(this.ui, env.ui);
    // Replay armed animations for each step; a restored game should
    // appear settled, not mid-animation.
    this.clearAnimation();
    this.afterTransition();
    return undefined;
  }

  // --- timer -------------------------------------------------------

  /** A timed-clock game with its clock running (e.g. Mines), distinct
   * from animation. */
  private timedClockActive(): boolean {
    if (!this.game.isTimed) return false;
    if (this.game.timingState) return this.game.timingState(this.state, this.ui);
    return this.currentStatus() === "ongoing";
  }

  /** The timer must run while either the game clock is ticking or an
   * animation/flash is in progress (the worker adapter drives a
   * rAF loop that calls `timer()` while this is true). */
  private syncTimer(): void {
    const want = this.timedClockActive() || this.animating;
    if (want !== this.timerWanted) {
      this.timerWanted = want;
      this.notifyTimer?.(want);
    }
  }

  timer(tplus: number): void {
    if (this.timedClockActive()) {
      this.timerElapsed += tplus;
      this.emitStatusBar();
    }
    if (this.animating) {
      this.animTime += tplus;
      this.flashTime += tplus;
      // As midend.c does, end the flash once it has caught up with
      // `flashLength`, or at once when none was armed: otherwise `flashTime`
      // grows on every animated move, and a game's redraw (`flashTime ? … :
      // -1`) flashes during ordinary animations.
      if (this.flashTime >= this.flashLength || this.flashLength === 0) {
        this.flashTime = 0;
        this.flashLength = 0;
      }
      if (this.animLength > 0 && this.animTime >= this.animLength) {
        // Move animation finished; flash (if any) continues without
        // the from-state, exactly as midend.c drops oldstate.
        this.animPrev = null;
      }
      if (this.animating) {
        this.requestRedraw();
      } else {
        // Both animation and flash done: settle and paint once clean.
        this.clearAnimation();
        this.settleHint();
        this.requestRedraw();
        this.syncTimer();
      }
    }
  }

  // --- drawing -----------------------------------------------------

  redraw(dr: GameDrawing): void {
    if (this.drawState === null) return; // no board yet
    // The engine paints no pixels of its own. A cleared canvas or a replaced
    // palette reaches the game as a fresh drawstate (`canvasCleared`,
    // `forceRedraw`), whose `!ds.started` branch repaints everything.
    dr.startDraw();
    this.game.redraw(
      dr,
      this.drawState,
      this.animPrev,
      this.state,
      this.animDir,
      this.ui,
      // Report time at the game's own scale: a slow-motion (hint) move
      // has a stretched `animLength`, and dividing by the same factor
      // keeps the game's `animTime / its-anim-length` progress correct.
      this.animTime / this.animScale,
      this.flashTime,
      this.displayedHintStep,
      this.activeMistakes ?? undefined,
    );
    dr.endDraw();
  }

  forceRedraw(dr: GameDrawing): void {
    this.canvasCleared();
    this.redraw(dr);
  }

  delete(): void {
    // GC handles the rest; nothing to free.
    this.notify = undefined;
    this.notifyTimer = undefined;
  }

  // --- notifications ----------------------------------------------

  private emit(message: ChangeNotification): void {
    this.notify?.(message);
  }

  private emitIdChange(): void {
    this.emit({
      type: "game-id-change",
      // Shares the board: the desc fully specifies it, so the params omit the
      // difficulty (upstream `midend_get_game_id` → `encode_params(..., FALSE)`).
      currentGameId: `${this.game.encodeParams(this.params, false)}:${this.desc}`,
      // Re-deals this board here, so the params are FULL. Loading an id sets the
      // params from its prefix, which is right for a shared link (the recipient
      // keeps their own difficulty) and wrong for reopening your own board,
      // which would drop to the default difficulty. Emitted here rather than
      // assembled by the caller from `params` and a desc, two signals that
      // could drift into a broken board.
      restoreGameId: `${this.game.encodeParams(this.params, true)}:${this.desc}`,
      // Shares the seed: regenerating needs the FULL params, difficulty
      // included (upstream `midend_get_random_seed` → `encode_params(...,
      // TRUE)`). The app's `currentParams`, and so the type-menu label, read it.
      randomSeed: this.seed
        ? `${this.game.encodeParams(this.params, true)}#${this.seed}`
        : undefined,
    });
  }

  private emitParamsChange(): void {
    this.emit({
      type: "params-change",
      params: this.game.encodeParams(this.params, true),
    });
  }

  private emitStateChange(): void {
    this.emit({
      type: "game-state-change",
      status: this.currentStatus(),
      currentMove: this.pos,
      totalMoves: this.history.length - 1,
      canUndo: this.pos > 0,
      canRedo: this.pos < this.history.length - 1,
      hasPencilMarks: this.hasPencilMarks(),
    });
  }

  /**
   * Does any cell carry a pencil mark? Read **generically, off the state's
   * `pencil` field**, the one spelling every note-taking game uses, rather than
   * having each game re-answer a question none could answer differently.
   * `mark-all.test.ts` holds every `canMarkAll` game to exposing a readable
   * `pencil`, so this cannot quietly answer `false` for a game that drifted.
   *
   * The predicate is "any marks at all", not "the next press will narrow rather
   * than fill". Those differ only on a board where the player has marked some
   * cells by hand and left others bare; after one press they agree, and the
   * finer question needs each game's own idea of an empty cell.
   */
  private hasPencilMarks(): boolean {
    if (!this.game.canMarkAll) return false;
    const pencil = (this.state as { pencil?: ArrayLike<number> }).pencil;
    if (!pencil) return false;
    for (let i = 0; i < pencil.length; i++) {
      if (pencil[i] !== 0) return true;
    }
    return false;
  }

  private emitStatusBar(): void {
    // The notification carries both the status-bar text and the hint banner.
    // A game may want the banner without a status bar (Range), so a
    // hint-capable game always emits, letting its explanation appear and
    // clear; only a game with neither is skipped. `puzzle-view.ts` gates the
    // status-bar DOM on `wantsStatusbar`, so the empty text is inert.
    if (!this.game.wantsStatusbar && !this.game.hint) return;
    let text = this.game.wantsStatusbar
      ? (this.game.statusbarText?.(this.state, this.ui) ?? "")
      : "";
    // A timed game's status text gets an elapsed `[M:SS]` prefix: upstream
    // `midend_rewrite_statusbar` (midend.c:2204), the midend's job.
    if (this.game.isTimed && this.game.wantsStatusbar) {
      const sec = Math.floor(this.timerElapsed);
      text = `[${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}] ${text}`;
    }
    this.emit({
      type: "status-bar-change",
      statusBarText: text,
      activeHintExplanation: this.displayedHintStep?.explanation,
      hintJourney: this.hintJourney(),
    });
  }

  /**
   * Where the displayed step sits in its journey, and how long the journey is;
   * `undefined` when no hint is displayed.
   *
   * A journey is one deduction firing (`ts-engine`, "One deduction firing is
   * one journey"): a first step plus every following step flagged
   * `continuesPrevious`. It is **derived from a flag the game already sets for
   * its own reasons**, so a game that never groups its steps reports length 1.
   */
  private hintJourney(): { index: number; length: number } | undefined {
    const plan = this.activeHint;
    if (plan === null || this.displayedHintStep === undefined) return undefined;
    let first = plan.index;
    while (first > 0 && plan.steps[first].continuesPrevious === true) first--;
    let last = plan.index;
    while (
      last + 1 < plan.steps.length &&
      plan.steps[last + 1].continuesPrevious === true
    ) {
      last++;
    }
    return { index: plan.index - first + 1, length: last - first + 1 };
  }
}
