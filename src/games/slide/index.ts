/**
 * Slide (Klotski) — native TS port of `puzzles/unfinished/slide.c`. Slide the
 * rectangular blocks around a walled board until the blue main block reaches
 * the green target and escapes through the hole in the wall.
 *
 * Slide was a *finished* upstream game that only ever shipped behind
 * `PUZZLES_ENABLE_UNFINISHED`, so it reached nobody: its generator, its
 * exhaustive BFS solver and its drag interaction all work, and its TODOs are
 * generator variety and graphics polish. This port finishes it rather than
 * merely transliterating it.
 *
 * Scoping calls, each deliberate (design D2):
 *
 *  - **No `findMistakes`.** Slide has no wrong-but-legal state — *every*
 *    reachable position is legal, you are simply nearer to or further from the
 *    exit — so there is nothing to flag, exactly as for the permutation games
 *    (docs/games/solver-and-generator.md § "The solvable-game contract"). Check & Save correctly degrades to a plain quick-save.
 *  - **No guess-free-generation obligation.** That policy binds logic puzzles;
 *    Slide is a movement puzzle whose "solver" is a shortest-path search, with
 *    no difficulty tiers at all (`maxmoves` bounds solution *length*).
 *  - **No explained hint** in this change. If Slide gets one it is a
 *    solver-path hint of its own, like every prior port's.
 */

import type {
  Game,
  ParamConfigItem,
  SolveResult,
  UiUpdate,
} from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { fromCoord } from "../../engine/geometry.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  gridCursorMove,
  isCancelKey,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Colour, GameStatus, Point, Size } from "../../engine/types.ts";
import { newSlideDesc } from "./generator.ts";
import { computeReachable, executeMove, nearestReachable } from "./moves.ts";
import {
  BORDER,
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SlideDrawState,
  setTileSize,
} from "./render.ts";
import { solveBoard } from "./solver.ts";
import {
  cancelGrab,
  decodeParams,
  defaultParams,
  describeParams,
  encodeParams,
  isBlock,
  isDist,
  MAINANCHOR,
  newState,
  newUi,
  presets,
  type SlideMove,
  type SlideParams,
  type SlideState,
  type SlideUi,
  status,
  statusbarText,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- input ------------------------------------------------------------

/**
 * Slide's entire pointer vocabulary is one press-and-drag, and it has no use
 * whatever for a secondary button — which makes it exactly the case playbook
 * §3.8c is about. `detectSecondaryButton` delivers a touch that stays within
 * 8px for 350ms as `RIGHT_BUTTON`, so "press a block, pause to work out where
 * you want it, then drag" dies precisely when the player stops to think, and
 * only on touch. Folding right onto left makes the gesture work whichever the
 * long-press detector decided it saw.
 *
 * The fold is about *pointer* buttons and touches nothing else: it names three
 * codes explicitly, so no cursor key, select key or cancel key can arrive at
 * the pointer arms disguised as a press (design D3). `cursor keys are unmoved
 * by asPrimary` in `slide.test.ts` is the guard, and it asserts the mapping
 * rather than the outcome, so a fold widened to a range would fail it.
 */
function asPrimary(button: number): number {
  if (button === RIGHT_BUTTON) return LEFT_BUTTON;
  if (button === RIGHT_DRAG) return LEFT_DRAG;
  if (button === RIGHT_RELEASE) return LEFT_RELEASE;
  return button;
}

/**
 * Advance the installed Solve route by one step. Upstream binds this to
 * `button == ' '`, which **cannot fire in this frontend**: `puzzleKeyMap` maps
 * Space to `CURSOR_SELECT2` and Enter to `CURSOR_SELECT`, so a literal
 * transcription would ship a dead key and leave a Solve route unwalkable
 * (the §3.8a family of trap). We accept the two select buttons the frontend
 * actually delivers, plus a bare space for anything that sends one.
 */
function isStepKey(button: number): boolean {
  return (
    button === CURSOR_SELECT || button === CURSOR_SELECT2 || button === 0x20 // ' '
  );
}

/**
 * Pick up the block covering `(cx, cy)`, held by that square, and work out —
 * once — every square its anchor can be slid to. Returns false when there is
 * no block there.
 *
 * The one grab implementation. The pointer press and the keyboard select
 * differ only in where `(cx, cy)` comes from, which is the whole of what makes
 * a keyboard journey produce the *same* move as the equivalent drag rather
 * than a parallel one.
 */
function grabBlockAt(state: SlideState, ui: SlideUi, cx: number, cy: number): boolean {
  const { w, h, board } = state;
  if (cx < 0 || cx >= w || cy < 0 || cy >= h) return false;
  if (!isBlock(board[cy * w + cx])) return false;

  let anchor = cy * w + cx;
  while (isDist(board[anchor])) anchor -= board[anchor];

  ui.grabbed = true;
  ui.grabAnchor = anchor;
  ui.grabOffsetX = cx - (anchor % w);
  ui.grabOffsetY = cy - Math.floor(anchor / w);
  ui.grabCurrpos = anchor;
  computeReachable(state, anchor, ui.reachable);
  return true;
}

/** Put the held block down where it now sits — a move if it actually went
 * anywhere, and otherwise just the grab coming off the display. */
function releaseGrab(ui: SlideUi): SlideMove | UiUpdate {
  const from = ui.grabAnchor;
  const to = ui.grabCurrpos;
  cancelGrab(ui);
  return from !== to ? { kind: "move", from, to } : UI_UPDATE;
}

function interpretMove(
  state: SlideState,
  ui: SlideUi,
  ds: SlideDrawState,
  p: Point,
  rawButton: number,
): SlideMove | null | UiUpdate {
  const button = asPrimary(stripModifiers(rawButton));
  const { w, h } = state;
  const ts = ds.tilesize;

  if (button === LEFT_BUTTON) {
    // A pointer press always takes over: the cursor goes away, and pressing
    // anywhere that is not a block puts down whatever the keyboard was
    // holding. Without that, a keyboard grab would survive under a pointer and
    // the next `LEFT_DRAG` would fling it at the pointer.
    const hadUi = ui.grabbed || ui.cursorVisible;
    ui.cursorVisible = false;
    if (
      !grabBlockAt(state, ui, fromCoord(p.x, ts, BORDER), fromCoord(p.y, ts, BORDER))
    ) {
      cancelGrab(ui);
      return hadUi ? UI_UPDATE : null; // this click has no effect
    }
    return UI_UPDATE;
  }

  if (button === LEFT_DRAG && ui.grabbed) {
    const tx = fromCoord(p.x, ts, BORDER) - ui.grabOffsetX;
    const ty = fromCoord(p.y, ts, BORDER) - ui.grabOffsetY;
    const target = nearestReachable(w, h, ui.reachable, tx, ty);
    // No reachable square within range, or the block is already where the
    // pointer wants it: nothing to repaint. (Upstream repaints unconditionally
    // on a hit; suppressing the no-change case saves a notification per pixel
    // of pointer movement and is invisible.)
    if (target === null || target === ui.grabCurrpos) return null;
    ui.grabCurrpos = target;
    return UI_UPDATE;
  }

  if (button === LEFT_RELEASE && ui.grabbed) return releaseGrab(ui);

  // The Solve route owns the select key for as long as one is installed
  // (design D2). It is gated on `state.soln`, so the two uses never contend:
  // straying from the route discards it, and the select key grabs again.
  if (isStepKey(button) && state.soln) {
    const step = state.soln[state.solnIndex];
    // If the player has already part-way nudged this block, the route's source
    // is where it *started*, so aim from where it is now.
    const from = step.from === state.lastmovedPos ? state.lastmoved : step.from;
    return { kind: "move", from, to: step.to };
  }

  if (isCursorMove(button)) return moveCursor(state, ui, button);

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    ui.cursorVisible = true;
    if (ui.grabbed) return releaseGrab(ui);
    grabBlockAt(state, ui, ui.cursorX, ui.cursorY);
    return UI_UPDATE; // an empty square grabs nothing, but still reveals the cursor
  }

  if (isCancelKey(button)) {
    if (ui.grabbed) {
      // Hand the block back, and the cursor with it: it has been riding the
      // block, so leaving it where the abandoned journey ended would strand it
      // somewhere the player never chose.
      ui.cursorX = (ui.grabAnchor % w) + ui.grabOffsetX;
      ui.cursorY = Math.floor(ui.grabAnchor / w) + ui.grabOffsetY;
      cancelGrab(ui);
      return UI_UPDATE;
    }
    if (ui.cursorVisible) {
      ui.cursorVisible = false;
      return UI_UPDATE;
    }
    return null;
  }

  return null;
}

/**
 * One cursor-key press, in whichever of the cursor's two modes is live.
 *
 * **Ungrabbed** it walks a cell cursor over the board, clamped to the grid.
 * **Grabbed** it walks the held block one cell through its reachable set,
 * refusing a step that would leave it — and the cursor goes with the block, so
 * it stays on the square the block was picked up by.
 *
 * One cell per press, not slide-as-far-as-it-goes (design D1's open point).
 * Sliding to the end is fewer presses down a long corridor, but it cannot stop
 * *inside* one, so it cannot reach every cell of the reachable set — and a
 * keyboard that cannot reach a cell the drag can reach is the same defect D1
 * rejected the free cursor for.
 */
function moveCursor(state: SlideState, ui: SlideUi, button: number): null | UiUpdate {
  const { w, h } = state;

  if (!ui.grabbed) {
    const moved = gridCursorMove(button, ui.cursorX, ui.cursorY, w, h);
    if (moved) {
      ui.cursorX = moved.x;
      ui.cursorY = moved.y;
    }
    // The first press reveals *and* moves, as Flip and Mosaic do.
    const revealed = !ui.cursorVisible;
    ui.cursorVisible = true;
    return moved || revealed ? UI_UPDATE : null;
  }

  const delta = cursorDelta(button);
  if (!delta) return null;
  const ax = (ui.grabCurrpos % w) + delta.dx;
  const ay = Math.floor(ui.grabCurrpos / w) + delta.dy;
  if (ax < 0 || ax >= w || ay < 0 || ay >= h) return null;
  const anchor = ay * w + ax;
  if (!ui.reachable[anchor]) return null; // outside the set: nothing moves

  ui.grabCurrpos = anchor;
  ui.cursorX = ax + ui.grabOffsetX;
  ui.cursorY = ay + ui.grabOffsetY;
  return UI_UPDATE;
}

// --- solve ------------------------------------------------------------

/**
 * Install the shortest route from here to the exit, for the player to walk one
 * step at a time with Space/Enter. Slide's Solve deliberately does **not** fill
 * the board in — the route *is* the feature, and Inertia's Solve works the same
 * way (docs/games/input.md § "The board keeps the keyboard after a control") — so it sets `cheated` but leaves the position alone.
 *
 * One divergence: upstream solves `state`, the *initial* board, though its own
 * comment says "from the current position" and its `execute_move` goes to
 * trouble adjusting the route's first move for a partly-nudged block, which
 * only makes sense from the current one. As written, any Solve after any move
 * yields a route whose first step is illegal, so pressing Space does nothing at
 * all — a genuine player-visible defect (docs/games/solver-and-generator.md § "Divergence and what it costs" rule 3), and one no desc
 * differential can see. We solve `curr`.
 */
function solve(_orig: SlideState, curr: SlideState): SolveResult<SlideMove> {
  // Upstream's own `nmoves == 0` guard is unreachable: `solve_board` tests the
  // goal only on a board it has just *generated*, never on the one it started
  // from, so on a finished board it reports the one irrelevant move that leaves
  // the main block where it already is. Testing the start board makes the
  // message upstream clearly intended actually appear.
  if (curr.board[curr.ty * curr.w + curr.tx] === MAINANCHOR)
    return { ok: false, error: "Puzzle is already solved" };

  const { moves, path } = solveBoard(
    curr.w,
    curr.h,
    curr.board,
    curr.forcefield,
    curr.tx,
    curr.ty,
    -1,
    true,
  );

  if (moves < 0 || !path)
    return { ok: false, error: "Unable to find a solution to this puzzle" };
  if (moves === 0) return { ok: false, error: "Puzzle is already solved" };
  return { ok: true, move: { kind: "solve", moves: path } };
}

// --- params form ------------------------------------------------------

const paramConfig: ParamConfigItem<SlideParams>[] = [
  ...dimensionParamConfig<SlideParams>(),
  {
    kw: "solution-length-limit",
    name: "Solution length limit",
    type: "string",
    get: (p) => String(p.maxmoves),
    set: (p, v) => {
      // `atoi` semantics, and note upstream's own `custom_params` reads this
      // with plain `atoi` too — so a blank field means 0, i.e. "no solution at
      // all is short enough", which the generator then satisfies with the
      // first soluble board it finds. A negative value means no limit.
      p.maxmoves = v.trim().startsWith("-") ? -1 : parseConfigInt(v);
    },
  },
];

// --- the game ---------------------------------------------------------

export const slideGame: Game<
  SlideParams,
  SlideState,
  SlideMove,
  SlideUi,
  SlideDrawState
> = {
  id: "slide",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  describeParams,
  paramConfig,

  newDesc: (p: SlideParams, rng: RandomState): { desc: string } => newSlideDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  /** Upstream's `game_changed_state` is empty, but a grab left dangling across
   * an undo (pointer still down, or a block held by the keyboard, while the
   * toolbar rewinds the board) points at an anchor the new board may not have
   * — which upstream's `game_redraw` asserts on. Cancelling the grab when the
   * state moves under it is the fix, and costs nothing: a `UI_UPDATE` (which is
   * all a grab or a drag-follow is) never reaches here.
   *
   * It applies to a keyboard grab for the same reason and not merely by
   * inheritance: the reachable set was computed against the board that has just
   * been replaced, so it is stale however the block was picked up. The *cursor*
   * deliberately survives — it is a position on a grid whose size has not
   * changed, and dropping it would read as a lost keypress. */
  changedState(ui: SlideUi): void {
    cancelGrab(ui);
  },

  interpretMove,
  executeMove,
  status: (s: SlideState): GameStatus => status(s),

  solve,
  textFormat,
  statusbarText: (s: SlideState): string => statusbarText(s),

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SlideParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  // Blocks jump straight to where they were dragged: upstream's
  // `game_anim_length` is 0, and the live feedback is the block following the
  // pointer (design D3).
  animLength: () => 0,
  flashLength: (a: SlideState, b: SlideState): number =>
    a.completed < 0 && b.completed >= 0 ? FLASH_TIME : 0,
};

registerGame(slideGame);
