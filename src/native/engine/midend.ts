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
  type PresetMenu,
  UI_UPDATE,
} from "./game.ts";
import { decodeSave, encodeSave, type SaveEnvelope } from "./save.ts";

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
  processInput(x: number, y: number, button: number): boolean;
  getParams(): string;
  setParams(params: string): string | undefined;
  getPresets(): PresetMenuEntry[];
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
  private activeHint: ActiveHint<Move> | null = null;
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
    const { desc } = this.game.newDesc(this.params, rng);
    this.startFrom(desc);
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
      const { desc } = this.game.newDesc(params, rng);
      this.params = params;
      this.seed = rest;
      this.startFrom(desc);
      return undefined;
    }
    const dErr = this.game.validateDesc(params, rest);
    if (dErr) return dErr;
    this.params = params;
    this.seed = undefined;
    this.startFrom(rest);
    return undefined;
  }

  private startFrom(desc: string): void {
    this.desc = desc;
    const initial = this.game.newState(this.params, desc);
    this.history = [initial];
    this.moveLog = [];
    this.pos = 0;
    this.ui = this.game.newUi(initial);
    // A fresh drawstate ensures the per-tile cache reflects the new
    // game; the game's `!ds.started` branch covers the
    // background/grid setup on its next paint.
    this.drawState = this.game.newDrawState?.(initial) ?? null;
    if (this.drawState !== null) {
      this.game.setTileSize?.(this.drawState, this.currentTileSize);
    }
    this.usedSolve = false;
    this.activeHint = null;
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
    this.history = [this.history[0]];
    this.moveLog = [];
    this.pos = 0;
    this.usedSolve = false;
    this.activeHint = null;
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
    this.activeHint = null;
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
    this.setupAnimation(prev, next, 1);
    this.afterTransition();
    return true;
  }

  undo(): void {
    if (this.pos === 0) return;
    this.activeHint = null;
    const prev = this.state;
    this.pos -= 1;
    this.setupAnimation(prev, this.state, -1);
    this.afterTransition();
  }

  redo(): void {
    if (this.pos >= this.history.length - 1) return;
    this.activeHint = null;
    const prev = this.state;
    this.pos += 1;
    this.setupAnimation(prev, this.state, 1);
    this.afterTransition();
  }

  solve(): string | undefined {
    if (!this.game.canSolve || !this.game.solve) {
      return "This game does not support solving";
    }
    const result = this.game.solve(this.history[0], this.state);
    if (!result.ok) return result.error;
    this.usedSolve = true;
    this.applyMove(result.move);
    return undefined;
  }

  hint(): string | undefined {
    if (!this.game.hint) {
      return "This game does not support hints";
    }
    const result = this.game.hint(this.state);
    if (!result.ok) return result.error;
    this.activeHint = {
      move: result.move,
      explanation: result.explanation,
      highlights: result.highlights,
    };
    this.clearAnimation();
    this.afterTransition();
    return undefined;
  }

  executeHint(): string | undefined {
    if (!this.game.hint) {
      return "This game does not support hints";
    }
    const result = this.game.hint(this.state);
    if (!result.ok) return result.error;
    this.activeHint = null;
    this.applyMove(result.move);
    return undefined;
  }

  private afterTransition(): void {
    this.emitStateChange();
    this.emitStatusBar();
    // A non-animated transition paints immediately (the C frontend
    // redraws after every processed input). An animated one does NOT
    // paint synchronously here: that would show a degenerate
    // animTime=0 frame and race the rAF loop one frame later
    // (visible flicker). The timer drives every animation frame,
    // including the first — exactly as midend.c's frontend timer does.
    if (!this.animating) this.requestRedraw();
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
    this.animLength = a;
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
      this.animTime,
      this.flashTime,
      this.activeHint ?? undefined,
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
    if (!this.game.wantsStatusbar) return;
    let text = this.game.statusbarText?.(this.state, this.ui) ?? "";
    if (this.activeHint) {
      text = text
        ? `${text} — ${this.activeHint.explanation}`
        : this.activeHint.explanation;
    }
    this.emit({ type: "status-bar-change", statusBarText: text });
  }
}
