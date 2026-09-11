/**
 * Slide (Klotski) — native TS port of `puzzles/unfinished/slide.c`. Slide the
 * rectangular blocks around a walled board until the blue main block reaches
 * the green target and escapes through the hole in the wall.
 *
 * Upstream finished Slide — generator, exhaustive BFS solver and drag
 * interaction all work — but only ever shipped it behind
 * `PUZZLES_ENABLE_UNFINISHED`, with generator variety and graphics polish left
 * as TODOs. This port finishes it rather than merely transliterating it.
 *
 * Deliberately absent:
 *
 *  - **`findMistakes`.** Every reachable position is legal — you are simply
 *    nearer to or further from the exit — so there is nothing to flag, as for
 *    the permutation games
 *    (docs/games/solver-and-generator.md § "The solvable-game contract").
 *    Check & Save degrades to a plain quick-save.
 *  - **A guess-free-generation obligation.** That binds logic puzzles; Slide is
 *    a movement puzzle whose "solver" is a shortest-path search, with no
 *    difficulty tiers (`maxmoves` bounds solution *length*).
 *  - **An explained hint**, so far. One would be a solver-path hint of its own.
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
  isCancelKey,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  moveCursor,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
import { newSlideDesc } from "./generator.ts";
import { computeReachable, executeMove, nearestReachable } from "./moves.ts";
import {
  BORDER,
  colors,
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
 * Fold the right button onto the left. Slide's whole pointer vocabulary is one
 * press-and-drag, and a touch that holds still arrives as `RIGHT_BUTTON`
 * (docs/games/input.md § "A touch hold arrives as the right button"), so
 * "press a block, pause to aim, then drag" would die exactly when the player
 * stops to think.
 *
 * It names the three codes rather than a range, so no cursor, select or cancel
 * key can reach the pointer arms disguised as a press. The "right→left fold"
 * test in `slide.test.ts` asserts the mapping rather than an outcome, so a fold
 * widened to a range fails it.
 */
function asPrimary(button: number): number {
  if (button === RIGHT_BUTTON) return LEFT_BUTTON;
  if (button === RIGHT_DRAG) return LEFT_DRAG;
  if (button === RIGHT_RELEASE) return LEFT_RELEASE;
  return button;
}

/**
 * Advance the installed Solve route by one step. Upstream binds `' '`, which
 * this frontend never sends: `puzzleKeyMap` delivers Space as `CURSOR_SELECT2`
 * and Enter as `CURSOR_SELECT`, so a literal transcription would leave a Solve
 * route unwalkable. Accept both select buttons, plus a bare space for anything
 * that sends one.
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
 * The pointer press and the keyboard select both grab here and differ only in
 * where `(cx, cy)` comes from, which is what makes a keyboard journey produce
 * the *same* move as the equivalent drag rather than a parallel one.
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
    const hadUi = ui.grabbed || ui.cursor.visible;
    ui.cursor.visible = false;
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
    // Nothing to repaint when no square is in range or the block is already
    // there. (Upstream repaints on every hit; skipping the no-op saves a
    // notification per pixel of pointer movement.)
    if (target === null || target === ui.grabCurrpos) return null;
    ui.grabCurrpos = target;
    return UI_UPDATE;
  }

  if (button === LEFT_RELEASE && ui.grabbed) return releaseGrab(ui);

  // An installed Solve route owns the select key. Straying from the route
  // discards it, and then the select key grabs again.
  if (isStepKey(button) && state.soln) {
    const step = state.soln[state.solnIndex];
    // If the player has already part-way nudged this block, the route's source
    // is where it *started*, so aim from where it is now.
    const from = step.from === state.lastmovedPos ? state.lastmoved : step.from;
    return { kind: "move", from, to: step.to };
  }

  if (isCursorMove(button)) return moveSlideCursor(state, ui, button);

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    ui.cursor.visible = true;
    if (ui.grabbed) return releaseGrab(ui);
    grabBlockAt(state, ui, ui.cursor.x, ui.cursor.y);
    return UI_UPDATE; // an empty square grabs nothing, but still reveals the cursor
  }

  if (isCancelKey(button)) {
    if (ui.grabbed) {
      // Hand the block back, and the cursor with it: it has been riding the
      // block, so leaving it where the abandoned journey ended would strand it
      // somewhere the player never chose.
      ui.cursor.x = (ui.grabAnchor % w) + ui.grabOffsetX;
      ui.cursor.y = Math.floor(ui.grabAnchor / w) + ui.grabOffsetY;
      cancelGrab(ui);
      return UI_UPDATE;
    }
    if (ui.cursor.visible) {
      ui.cursor.visible = false;
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
 * One cell per press, not slide-as-far-as-it-goes. Sliding to the end is fewer
 * presses down a long corridor, but it cannot stop *inside* one, so the
 * keyboard could not reach every cell the drag can.
 */
function moveSlideCursor(
  state: SlideState,
  ui: SlideUi,
  button: number,
): null | UiUpdate {
  const { w, h } = state;

  if (!ui.grabbed) return moveCursor(ui.cursor, button, w, h) ? UI_UPDATE : null;

  const delta = cursorDelta(button);
  if (!delta) return null;
  const ax = (ui.grabCurrpos % w) + delta.dx;
  const ay = Math.floor(ui.grabCurrpos / w) + delta.dy;
  if (ax < 0 || ax >= w || ay < 0 || ay >= h) return null;
  const anchor = ay * w + ax;
  if (!ui.reachable[anchor]) return null; // outside the set: nothing moves

  ui.grabCurrpos = anchor;
  ui.cursor.x = ax + ui.grabOffsetX;
  ui.cursor.y = ay + ui.grabOffsetY;
  return UI_UPDATE;
}

// --- solve ------------------------------------------------------------

/**
 * Install the shortest route from here to the exit, for the player to walk one
 * step at a time with Space/Enter. Solve deliberately does **not** fill the
 * board in: the route *is* the feature, as in Inertia
 * (docs/games/input.md § "The board keeps the keyboard after a control"). It
 * sets `cheated` and leaves the position alone.
 *
 * Divergence: upstream solves the *initial* board, though its own comment says
 * "from the current position" and its `execute_move` adjusts the route for a
 * partly-nudged block, which only makes sense from the current one. As
 * written, any Solve after any move yields a route whose first step is illegal,
 * so the step key does nothing — a player-visible defect no desc differential
 * can see (docs/games/solver-and-generator.md § "Divergence and what it costs"
 * rule 3). We solve `curr`.
 */
function solve(_orig: SlideState, curr: SlideState): SolveResult<SlideMove> {
  // Upstream's `nmoves == 0` guard never fires: `solve_board` tests the goal
  // only on boards it generates, never on the one it starts from, so it is
  // tested here instead.
  if (curr.board[curr.ty * curr.w + curr.tx] === MAINANCHOR)
    return { ok: false, error: "Puzzle is already solved" };

  const { path } = solveBoard(
    curr.w,
    curr.h,
    curr.board,
    curr.forcefield,
    curr.tx,
    curr.ty,
    -1,
    true,
  );
  if (!path) return { ok: false, error: "Unable to find a solution to this puzzle" };
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
      // `atoi`, as upstream's `custom_params` reads it: a blank field is 0,
      // which `validateParams` rejects. Any negative value means no limit.
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

  newDesc: newSlideDesc,
  validateDesc,
  newState,
  newUi,

  /** Upstream's `game_changed_state` is empty, but a grab left dangling across
   * an undo (pointer still down, or a block held by the keyboard) points at an
   * anchor the new board may not have — which upstream's `game_redraw` asserts
   * on — and its reachable set was computed against the board just replaced.
   * Canceling it costs nothing: a `UI_UPDATE`, which is all a grab or a
   * drag-follow is, never reaches here. The cursor survives (see `SlideUi`). */
  changedState: cancelGrab,

  interpretMove,
  executeMove,
  status,

  solve,
  textFormat,
  statusbarText,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  // Blocks jump straight to where they were dragged: upstream's
  // `game_anim_length` is 0, and the live feedback is the block following the
  // pointer.
  animLength: () => 0,
  flashLength: (a: SlideState, b: SlideState): number =>
    a.completed < 0 && b.completed >= 0 ? FLASH_TIME : 0,
};

registerGame(slideGame);
