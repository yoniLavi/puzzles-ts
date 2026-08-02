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
 *    (playbook §3.5). Check & Save correctly degrades to a plain quick-save.
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
  cancelDrag,
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

function interpretMove(
  state: SlideState,
  ui: SlideUi,
  ds: SlideDrawState | null,
  p: Point,
  rawButton: number,
): SlideMove | null | UiUpdate {
  const button = asPrimary(stripModifiers(rawButton));
  const { w, h, board } = state;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;

  if (button === LEFT_BUTTON) {
    const cx = fromCoord(p.x, ts, BORDER);
    const cy = fromCoord(p.y, ts, BORDER);

    if (cx < 0 || cx >= w || cy < 0 || cy >= h || !isBlock(board[cy * w + cx]))
      return null; // this click has no effect

    // Find the pressed block's anchor and start dragging it.
    let anchor = cy * w + cx;
    while (isDist(board[anchor])) anchor -= board[anchor];

    ui.dragging = true;
    ui.dragAnchor = anchor;
    ui.dragOffsetX = cx - (anchor % w);
    ui.dragOffsetY = cy - Math.floor(anchor / w);
    ui.dragCurrpos = anchor;

    // Work out, once, every square this block can be dragged to.
    computeReachable(state, anchor, ui.reachable);
    return UI_UPDATE;
  }

  if (button === LEFT_DRAG && ui.dragging) {
    const tx = fromCoord(p.x, ts, BORDER) - ui.dragOffsetX;
    const ty = fromCoord(p.y, ts, BORDER) - ui.dragOffsetY;
    const target = nearestReachable(w, h, ui.reachable, tx, ty);
    // No reachable square within range, or the block is already where the
    // pointer wants it: nothing to repaint. (Upstream repaints unconditionally
    // on a hit; suppressing the no-change case saves a notification per pixel
    // of pointer movement and is invisible.)
    if (target === null || target === ui.dragCurrpos) return null;
    ui.dragCurrpos = target;
    return UI_UPDATE;
  }

  if (button === LEFT_RELEASE && ui.dragging) {
    const from = ui.dragAnchor;
    const to = ui.dragCurrpos;
    cancelDrag(ui);
    // Only a block that actually moved is a move; otherwise the drag still has
    // to come off the display.
    return from !== to ? { kind: "move", from, to } : UI_UPDATE;
  }

  if (isStepKey(button) && state.soln) {
    const step = state.soln[state.solnIndex];
    // If the player has already part-way nudged this block, the route's source
    // is where it *started*, so aim from where it is now.
    const from = step.from === state.lastmovedPos ? state.lastmoved : step.from;
    return { kind: "move", from, to: step.to };
  }

  return null;
}

// --- solve ------------------------------------------------------------

/**
 * Install the shortest route from here to the exit, for the player to walk one
 * step at a time with Space/Enter. Slide's Solve deliberately does **not** fill
 * the board in — the route *is* the feature, and Inertia's Solve works the same
 * way (playbook §3.8d) — so it sets `cheated` but leaves the position alone.
 *
 * One divergence: upstream solves `state`, the *initial* board, though its own
 * comment says "from the current position" and its `execute_move` goes to
 * trouble adjusting the route's first move for a partly-nudged block, which
 * only makes sense from the current one. As written, any Solve after any move
 * yields a route whose first step is illegal, so pressing Space does nothing at
 * all — a genuine player-visible defect (playbook §4 rule 3), and one no desc
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

  /** Upstream's `game_changed_state` is empty, but a drag left dangling across
   * an undo (pointer still down while the toolbar/keyboard rewinds the board)
   * points at an anchor the new board may not have — which upstream's
   * `game_redraw` asserts on. Cancelling the drag when the state moves under it
   * is the fix, and costs nothing: a `UI_UPDATE` (which is all a grab or a
   * drag-follow is) never reaches here. */
  changedState(ui: SlideUi): void {
    cancelDrag(ui);
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
