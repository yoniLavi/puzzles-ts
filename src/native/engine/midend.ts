/**
 * The native-TS midend: orchestrates a `Game` exactly the way
 * upstream's midend.c orchestrates a `struct game`, but idiomatically.
 *
 * It owns, per live game: the selected `Game`, its parameters, the
 * immutable-state move/undo/redo history, the UI, the engine random
 * source (the retained bit-identical `random.ts`), timer bookkeeping,
 * and preset handling. It emits the same `ChangeNotification` shapes
 * the app already consumes, so nothing above the Comlink boundary
 * changes.
 *
 * `Midend` is generic over a game's types but implements the
 * non-generic `EngineCore` surface, so the worker adapter and registry
 * never need to erase generics (no `any`).
 */

import type {
  ChangeNotification,
  Colour,
  ConfigDescription,
  ConfigValues,
  GameStatus,
  Point,
  PresetMenuEntry,
  PuzzleStaticAttributes,
  Size,
} from "../../puzzle/types.ts";
import { randomNew } from "../random/index.ts";
import {
  type ActiveHint,
  type Game,
  type GameDrawing,
  type HintStep,
  type PresetMenu,
  UI_UPDATE,
} from "./game.ts";
import { decodeSave, encodeSave, type SaveEnvelope } from "./save.ts";

/** Target wall-clock duration (seconds) for a hint-executed move's
 * slow-motion animation, *independent of the game's own (often very
 * short) move-animation time*. Stretching every game's hint move to the
 * same duration is what makes auto-hint flow as continuous motion: the
 * `puzzle.ts` auto-hint loop dwells `AUTO_HINT_STEP_MS` per step, so
 * matching that here (1s) leaves no frozen gap between the animation
 * finishing and the next step starting. Keep this equal to
 * `AUTO_HINT_STEP_MS`. (A game with no move animation — `animLength` 0 —
 * stays un-stretched; the dwell's floor paces it instead.) */
const HINT_ANIM_S = 1.0;

export type NotifyChange = (message: ChangeNotification) => void;
export type NotifyTimerState = (isActive: boolean) => void;
/** "Repaint the canvas now" — the worker adapter draws via the
 * `Drawing` it owns. Mirrors the C frontend redrawing after every
 * processed input and on each animation tick. */
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
  executeHint(): string | undefined;
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
  processInput(x: number, y: number, button: number): boolean;
  getParams(): string;
  setParams(params: string): string | undefined;
  getPresets(): PresetMenuEntry[];
  /** The game's preferences as the app's config-dialog shapes. An empty
   * item set for a game that declares no `prefs`. */
  getPreferencesConfig(): ConfigDescription;
  getPreferences(): ConfigValues;
  /** Apply the supplied preference values (only the keys present),
   * retaining them across future new games, and repaint. */
  setPreferences(values: ConfigValues): string | undefined;
  getColourPalette(defaultBackground: Colour): Colour[];
  preferredSize(): Size;
  /** Purely informational: compute the puzzle's preferred pixel size
   * for the given max, record the resolved tile/window size, and
   * return it. No side effects on the per-game draw state — the
   * frontend may call this many times per second (any element-size
   * change goes through it via `puzzle-view.ts`'s `ResizeController`)
   * and a side-effecting call would wipe per-tile caches at unrelated
   * moments and cause spurious full repaints.
   *
   * NOTE: this diverges from `midend.c`'s `midend_size`, which
   * unconditionally recreates the drawstate on every call. That
   * design assumed a frontend that only invoked size() on real window
   * resizes; our `ResizeController` fires on any layout perturbation
   * (CSS transitions, mobile address-bar show/hide). The
   * canvas-clearing concern is captured separately by
   * `canvasCleared()` (called from the adapter's `resizeDrawing`),
   * which is the *real* signal that the per-tile cache is stale. */
  size(maxSize: Size, isUserSize: boolean, devicePixelRatio: number): Size;
  /** The frontend just cleared the canvas (`Drawing.resize` resets the
   * backing store), so any per-tile cache the game holds is now
   * stale. Discard the drawstate and let the game's next `redraw`
   * paint from scratch via its `!ds.started` branch. */
  canvasCleared(): void;
  formatAsText(): string | undefined;
  saveGame(): Uint8Array<ArrayBuffer>;
  loadGame(data: Uint8Array): string | undefined;
  timer(tplus: number): void;
  redraw(dr: GameDrawing): void;
  /** Drop the per-game drawstate (so any cache it holds is gone)
   * and run a redraw. The worker adapter calls this when the
   * existing palette or font is replaced — neither clears the
   * canvas, but they invalidate the colour/font assumptions baked
   * into any cached tile. Mirrors `webapp.cpp`'s `forceRedraw()` on
   * the C path, minus the engine bg-fill step (the game's own
   * `!ds.started` branch paints its background). */
  forceRedraw(dr: GameDrawing): void;
  delete(): void;
}

/** Random 64-bit-ish seed string for a fresh game (mirrors the role of
 * C's system entropy seed; `random.ts` keeps IDs reproducible). */
function freshSeed(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export class Midend<Params, State, Move, Ui, DrawState> implements EngineCore {
  private params: Params;
  private desc = "";
  /** The solved-layout hint a generator returns alongside `desc`
   * (upstream `aux_info`). Retained so `solve()` can hand it to a game
   * whose solver needs it (e.g. Untangle reconstructs the untangled
   * positions from it). Set only on a freshly *generated* game; cleared
   * for a descriptive `:desc` id or a loaded save — exactly like
   * upstream, where Solve is unavailable unless the game was generated
   * this session. */
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
  /** Window pixel size for the current params at `currentTileSize`.
   * Updated by `size()` for informational use (currently exposed only
   * via tests; the previous engine bg-fill that consumed it was
   * removed when responsibility moved into each game's
   * `!ds.started` branch). */
  private winSize: Size = { w: 0, h: 0 };
  private usedSolve = false;
  /** Last-applied user preference values, keyed by pref `kw`. Retained
   * across new games / loads because the midend recreates `ui` (via
   * `newUi`) on every `startFrom`, which would otherwise reset prefs to
   * their `newUi` defaults; `applyPrefs()` re-applies these onto each
   * fresh ui. Never serialised (the app persists prefs per-puzzle). */
  private prefValues: ConfigValues = {};
  /** The stored hint plan; `steps[index]` is the step on display.
   * Invariant: when non-null, `index < steps.length` (advancing past
   * the last step clears the plan instead). */
  private activeHint: ActiveHint<Move> | null = null;
  private advanceHintOnAnimationEnd = false;
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
    this.currentTileSize = game.preferredTileSize ?? 32;
  }

  // --- lifecycle ---------------------------------------------------

  getStaticProperties(): PuzzleStaticAttributes {
    return {
      displayName: this.game.id,
      canConfigure: true,
      canSolve: this.game.canSolve,
      canHint: this.game.hint !== undefined,
      canFindMistakes: this.game.findMistakes !== undefined,
      canMarkAll: this.game.canMarkAll ?? false,
      needsRightButton: false,
      isTimed: this.game.isTimed,
      wantsStatusbar: this.game.wantsStatusbar,
      engineType: "ts",
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
    const pErr = this.game.validateParams(params, true);
    if (pErr) return pErr;

    if (id[sep] === "#") {
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
    this.aux = aux;
    const initial = this.game.newState(this.params, desc);
    this.history = [initial];
    this.moveLog = [];
    this.pos = 0;
    this.ui = this.game.newUi(initial);
    // Upstream `game_changed_state` with oldstate == NULL: let a game
    // whose Ui tracks the current state seed it from the fresh board.
    this.game.changedState?.(this.ui, null, initial);
    // `newUi` reset the ui to its defaults, including any preference
    // fields; re-apply the player's retained choices so a preference
    // survives a new game (upstream keeps one `game_ui` across new
    // games — this reproduces that effect).
    this.applyPrefs();
    // A fresh drawstate ensures the per-tile cache reflects the new
    // game; the game's `!ds.started` branch covers the
    // background/grid setup on its next paint.
    this.drawState = this.game.newDrawState?.(initial) ?? null;
    if (this.drawState !== null) {
      this.game.setTileSize?.(this.drawState, this.currentTileSize);
    }
    this.usedSolve = false;
    this.clearHint();
    this.clearMistakes();
    this.timerElapsed = 0;
    this.clearAnimation();
    this.emitIdChange();
    this.emitParamsChange();
    this.emitStateChange();
    this.emitStatusBar();
    // Request a repaint even though the app's reactive flow would
    // normally trigger one via the game-id-change notification.
    // Deterministic boards (e.g. English Pegs) produce the same
    // desc every time, so currentGameId doesn't change and the app
    // never detects a change to repaint. The drawstate is fresh
    // (ds.started=false), so the game will do a full repaint.
    this.requestRedraw();
    this.syncTimer();
  }

  restartGame(): void {
    if (this.history.length === 0) return;
    const prev = this.state;
    this.history = [this.history[0]];
    this.moveLog = [];
    this.pos = 0;
    this.game.changedState?.(this.ui, prev, this.state);
    this.usedSolve = false;
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

  processInput(x: number, y: number, button: number): boolean {
    const move = this.game.interpretMove(
      this.state,
      this.ui,
      this.drawState,
      { x, y } as Point,
      button,
    );
    if (move === null) return false;
    if (move === UI_UPDATE) {
      // UI/cursor changed in place: redraw + notify, no history entry,
      // no animation.
      this.clearAnimation();
      this.afterTransition();
      return true;
    }
    const step = this.currentHintStep;
    if (step !== undefined) {
      const verdict = this.game.hintKeepTrack?.(move, step, this.state) ?? "off";
      if (verdict === "completed") {
        // The game asserts the post-move state matches the plan's
        // expectation after this step, so the rest stays valid —
        // advance. Manual play surfaces one hint per request, so the
        // display hides until the next `hint()` call — unless the
        // next step continues the journey this step previewed
        // ("then to column 5"): that was presented as one hint, so
        // it stays on screen through its legs.
        this.advanceHint();
        this.hintDisplayed = this.currentHintStep?.continuesPrevious === true;
      } else if (verdict === "off") {
        this.clearHint();
      }
      // "onTrack": keep the current step (the game may have adjusted
      // its move in place to the remaining distance).
    }
    return this.applyMove(move);
  }

  private applyMove(move: Move): boolean {
    const prev = this.state;
    const next = this.game.executeMove(prev, move);
    // A new move after an undo truncates the redo branch (history and
    // the parallel move log stay in lockstep: moveLog[i] is the move
    // that turns history[i] into history[i+1]).
    this.history = this.history.slice(0, this.pos + 1);
    this.moveLog = this.moveLog.slice(0, this.pos);
    this.history.push(next);
    this.moveLog.push(move);
    this.pos = this.history.length - 1;
    this.game.changedState?.(this.ui, prev, next);
    this.setupAnimation(prev, next, 1);
    this.afterTransition();
    return true;
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

  /** Replay a list of game `Move`s directly, as if the player had made
   * them, bypassing the `interpretMove` pointer mapping. Each goes
   * through the same transition path as a real move (history, the
   * parallel move log, `changedState`, animation arming, save/undo
   * support), so the resulting midend is indistinguishable from one
   * reached by clicking. This is the engine's scriptable-replay
   * primitive: the in-process render-scenario harness uses it to reach
   * a target frame without synthesising pointer events (no coordinate
   * math, no right-button quirks), and it is a natural entry for any
   * future move-scripting feature. It does NOT consult the active hint
   * plan (`hintKeepTrack`) — replayed moves are setup, not player
   * input answering a displayed hint. */
  playMoves(moves: readonly Move[]): void {
    for (const move of moves) this.applyMove(move);
  }

  solve(): string | undefined {
    if (!this.game.canSolve || !this.game.solve) {
      return "This game does not support solving";
    }
    const result = this.game.solve(this.history[0], this.state, this.aux);
    if (!result.ok) return result.error;
    this.clearHint();
    this.usedSolve = true;
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

  private clearHint(): void {
    this.activeHint = null;
    this.advanceHintOnAnimationEnd = false;
    this.hintDisplayed = false;
  }

  /** Drop the mistake overlay. Called on every transition (a move,
   * undo, redo, new/restart game) so a stale "you were wrong here"
   * highlight never outlives the move that might have fixed it. */
  private clearMistakes(): void {
    this.activeMistakes = null;
  }

  /** Compute the current board's mistakes via the game's hook, store
   * them as the ephemeral overlay, repaint, and return the count. A
   * game with no `findMistakes` reports 0 and changes nothing. */
  findMistakes(): number {
    if (!this.game.findMistakes) return 0;
    const mistakes = this.game.findMistakes(this.state);
    this.activeMistakes = mistakes.length > 0 ? mistakes : null;
    this.requestRedraw();
    return mistakes.length;
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

  /** Compute and store a fresh plan at index 0. Returns the error
   * message when no plan is available. */
  private computeHintPlan(): string | undefined {
    if (!this.game.hint) {
      return "This game does not support hints";
    }
    const result = this.game.hint(this.state, this.aux);
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
    }
    if (this.activeHint && this.game.status(this.state) === "solved") {
      this.clearHint();
    }
    if (this.displayedHintStep !== before) this.emitStatusBar();
  }

  hint(): string | undefined {
    if (this.activeHint) {
      // A valid plan is stored: (re-)display its current step, don't
      // recompute and don't advance — advancing is driven only by
      // moves (manual or executed), which is what makes "recompute
      // only when invalidated" hold for the manual flow. A plan
      // hidden by a manual step completion re-shows here: one hint
      // per request.
      this.hintDisplayed = true;
      this.emitStatusBar();
      this.requestRedraw();
      return undefined;
    }
    const err = this.computeHintPlan();
    if (err) return err;
    this.clearAnimation();
    this.afterTransition();
    return undefined;
  }

  /** The hint step currently on display (`undefined` when no plan is
   * active or the plan is hidden) — the same step `redraw` is handed
   * and the status bar narrates. Exposed so the render-scenario harness
   * and tests can assert on the structured step (its `highlights`,
   * `explanation`) rather than only the draw ops it produces, and so a
   * scenario can walk the plan with `executeHint` until a step of
   * interest is reached. */
  activeHintStep(): HintStep<Move> | undefined {
    return this.displayedHintStep;
  }

  executeHint(): string | undefined {
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
    // animation (the banner describes the move in flight); the plan
    // advances when the animation settles, so the *next* step is
    // previewed during the auto-play rest period.
    this.hintDisplayed = true;
    this.advanceHintOnAnimationEnd = true;
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
    if (s === "solved" && this.usedSolve) return "solved-with-help";
    return s;
  }

  // --- params / presets -------------------------------------------

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

  // --- preferences -------------------------------------------------

  /** Build the app's preferences config-dialog description from the
   * game's declarative `prefs` (empty items when the game has none). */
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

  getColourPalette(defaultBackground: Colour): Colour[] {
    return this.game.colours(defaultBackground);
  }

  private get preferredTileSize(): number {
    return this.game.preferredTileSize ?? 32;
  }

  preferredSize(): Size {
    return this.game.computeSize(this.params, this.preferredTileSize);
  }

  /** Pick the largest integer tile size whose board fits `maxSize`
   * (mirrors `midend_size`'s fit-to-window behaviour, minus the
   * user-size persistence a later change will add) and inform the
   * draw state via `setTileSize` (upstream's `game_set_size`).
   *
   * **Pure** in the drawstate-cache sense: no recreation of the
   * drawstate, no firstDraw arming. The frontend may call this on
   * every `ResizeController` tick (which fires for any layout
   * perturbation, not just real window resizes); a side-effecting
   * call here would wipe the per-tile cache at unrelated moments and
   * flash a full repaint on the next animation frame. The
   * canvas-clearing concern is handled by `canvasCleared()` which
   * the adapter invokes from `resizeDrawing` only — the real signal
   * that the cache is stale. */
  size(maxSize: Size, _isUserSize: boolean, _dpr: number): Size {
    const base = this.game.computeSize(this.params, this.preferredTileSize);
    if (base.w <= 0 || base.h <= 0) {
      this.winSize = base;
      return base;
    }
    const scale = Math.min(maxSize.w / base.w, maxSize.h / base.h, 1);
    const tile = Math.max(1, Math.floor(this.preferredTileSize * scale));
    this.currentTileSize = tile;
    if (this.drawState !== null) {
      // `setTileSize` is informational on the existing drawstate —
      // games like Flip use it to recompute coordinate mappings.
      // Flip's setTileSize is a no-op when the tile size is
      // unchanged, so this is genuinely cheap.
      this.game.setTileSize?.(this.drawState, tile);
    }
    this.winSize = this.game.computeSize(this.params, tile);
    return this.winSize;
  }

  /** The canvas was just cleared by `Drawing.resize` (the only path
   * that actually invalidates pixels). The game's per-tile cache —
   * whose entries are "this tile's pixels match this cached value" —
   * is therefore stale, so discard the drawstate. The next `redraw`
   * sees a fresh drawstate (`!ds.started`) and the game paints from
   * scratch, including its own background. */
  canvasCleared(): void {
    if (this.history.length === 0) return;
    if (this.game.newDrawState) {
      this.drawState = this.game.newDrawState(this.history[0]);
      this.game.setTileSize?.(this.drawState, this.currentTileSize);
    }
  }

  formatAsText(): string | undefined {
    if (!this.game.canFormatAsText || !this.game.textFormat) return undefined;
    return this.game.textFormat(this.state);
  }

  // --- save / load -------------------------------------------------

  saveGame(): Uint8Array<ArrayBuffer> {
    const serMove = this.game.serialiseMove ?? ((m: Move) => m as unknown);
    const envelope: SaveEnvelope = {
      v: 1,
      puzzleId: this.game.id,
      params: this.game.encodeParams(this.params, true),
      desc: this.desc,
      moves: this.moveLog.map(serMove),
      pos: this.pos,
      timerElapsed: this.timerElapsed,
      usedSolve: this.usedSolve,
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
    this.startFrom(env.desc);
    const deMove = this.game.deserialiseMove ?? ((raw: unknown) => raw as Move);
    for (const raw of env.moves) {
      this.applyMove(deMove(raw));
    }
    this.pos = Math.min(env.pos, this.history.length - 1);
    this.usedSolve = env.usedSolve;
    this.timerElapsed = env.timerElapsed;
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
      // Mirror `midend.c` lines 1429-1432 exactly: reset flashTime
      // when it's caught up to flashLength (flash done) OR when no
      // flash was ever armed (flashLength === 0). Without this
      // reset, flashTime grows unbounded on every animated move and
      // the game's redraw — which checks `flashTime ? ... : -1` —
      // activates the flash overlay during non-solving animations
      // too. That was the bug behind the "wave through every cell"
      // flicker the owner reported on 2026-05-20.
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
    if (!this.game.redraw) return;
    // The engine paints no pixels of its own — it just orchestrates
    // the game's `redraw`. The background fill that used to live
    // here (mirroring `midend.c`'s first-draw rect) moved into each
    // game's `!ds.started` branch, so the framework no longer paints
    // behind the game's back. The canvas-cleared / palette-replaced
    // signals reach the game via a fresh drawstate (ds.started=false
    // ⇒ game's first-draw branch fires), set up by `canvasCleared`
    // and `forceRedraw`.
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

  /** Drop the per-game drawstate (so any cache it holds is gone) and
   * run a redraw. The worker adapter calls this when an
   * already-installed palette or font is replaced — neither clears
   * the canvas, but the colour/font choices baked into cached tiles
   * are now stale. The game's `!ds.started` branch will repaint
   * from scratch over the existing canvas content (including its
   * own background paint). */
  forceRedraw(dr: GameDrawing): void {
    if (this.history.length === 0) return;
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
    const p = this.game.encodeParams(this.params, false);
    this.emit({
      type: "game-id-change",
      currentGameId: `${p}:${this.desc}`,
      randomSeed: this.seed ? `${p}#${this.seed}` : undefined,
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
    });
  }

  private emitStatusBar(): void {
    // The status-bar-change notification carries BOTH the status-bar text
    // and the active hint explanation (the banner). A game may want the
    // hint banner without a status bar (e.g. Range — `wantsStatusbar`
    // false, but it has explained hints), so a hint-capable game always
    // emits (so the explanation both appears and, on the next move,
    // clears); only a game with neither a status bar nor a hint is
    // skipped. The status-bar DOM is gated on `wantsStatusbar`
    // independently (puzzle-view.ts), so the empty text emitted here for
    // a no-status-bar game is inert.
    if (!this.game.wantsStatusbar && !this.game.hint) return;
    const text = this.game.wantsStatusbar
      ? (this.game.statusbarText?.(this.state, this.ui) ?? "")
      : "";
    this.emit({
      type: "status-bar-change",
      statusBarText: text,
      activeHintExplanation: this.displayedHintStep?.explanation,
    });
  }
}
