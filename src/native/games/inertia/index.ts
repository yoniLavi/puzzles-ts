/**
 * Inertia — native TS port (upstream `puzzles/inertia.c`).
 *
 * Slide a ball around a grid collecting gems. The ball cannot stop where it
 * likes: once set off in one of eight directions it keeps going until a stop
 * square catches it or a wall blocks its way — and it dies on any mine it
 * touches.
 *
 * Two things here are unusual for this collection. First, Solve does not finish
 * the game: it *installs a route* into the state, which the game draws as an
 * arrow on the ball and lets the player follow one step at a time — re-solving
 * automatically if the player wanders off it (see `applyRoute`). Second, the
 * deaths tally lives on the Ui rather than the state, so undo and redo can
 * neither rewind nor re-count a death.
 */

import type { Colour, GameStatus, Point, Size } from "../../../puzzle/types.ts";
import {
  type Game,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { coord, fromCoord } from "../../engine/geometry.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newInertiaDesc } from "./generator.ts";
import {
  animLength,
  BORDER,
  colours,
  computeSize,
  flashLength,
  type InertiaDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import { solveRoute } from "./solver.ts";
import {
  BLANK,
  DIRECTIONS,
  DX,
  DY,
  decodeParams,
  defaultParams,
  encodeParams,
  GEM,
  type InertiaMove,
  type InertiaParams,
  type InertiaState,
  type InertiaUi,
  MINE,
  newState,
  PRESETS,
  STOP,
  textFormat,
  validateDesc,
  validateParams,
  WALL,
} from "./state.ts";

// --- moves -----------------------------------------------------------

/**
 * Slide the ball, collecting gems and dying on mines. The caller has already
 * established that the first step isn't into a wall — so the ball can never run
 * off the grid, because the void beyond it reads as a wall and stops it.
 */
function slide(s: InertiaState, dir: number): InertiaState {
  const board = s.board.clone();
  let px = s.px;
  let py = s.py;
  let gems = s.gems;
  let distanceMoved = 0;

  for (;;) {
    px += DX[dir];
    py += DY[dir];
    distanceMoved++;

    const square = board.square(px, py);
    if (board.cell(square) === GEM) {
      board.cells[square] = BLANK;
      gems--;
    }
    if (board.cell(square) === MINE) {
      return { ...s, board, px, py, gems, distanceMoved, dead: true };
    }
    if (board.cell(square) === STOP || board.at(px + DX[dir], py + DY[dir]) === WALL) {
      return { ...s, board, px, py, gems, distanceMoved, dead: false };
    }
  }
}

/**
 * Keep an installed route in step with the move the player just made.
 *
 * Following the route advances it; wandering off it re-solves from where the
 * ball now is, so the arrow always points somewhere useful; dying, or
 * collecting the last gem, throws the route away.
 */
function applyRoute(s: InertiaState, dir: number): InertiaState {
  if (!s.route) return s;

  if (s.dead || s.gems === 0) return { ...s, route: null, routePos: 0 };

  if (s.route[s.routePos] === dir && s.routePos + 1 < s.route.length) {
    return { ...s, routePos: s.routePos + 1 };
  }

  const solved = solveRoute(s);
  if (!solved.ok) return { ...s, route: null, routePos: 0 };
  return { ...s, route: Object.freeze(solved.route), routePos: 0 };
}

function executeMove(s: InertiaState, m: InertiaMove): InertiaState {
  if (m.type === "route") {
    // A solve move doesn't touch the board at all — it just hands the player a
    // route to follow, so the new state can share the old board (only `slide`
    // ever writes to a board, and it clones first).
    if (m.route.length === 0) throw new Error("inertia: empty route");
    return { ...s, cheated: true, route: Object.freeze([...m.route]), routePos: 0 };
  }

  const dir = m.dir;
  if (dir < 0 || dir >= DIRECTIONS) throw new Error(`inertia: bad direction ${dir}`);
  if (s.dead) throw new Error("inertia: the ball is dead");
  if (s.board.at(s.px + DX[dir], s.py + DY[dir]) === WALL) {
    throw new Error("inertia: there's a wall in the way");
  }

  return applyRoute(slide(s, dir), dir);
}

// --- input -----------------------------------------------------------

/**
 * Digit key → direction: the number pad's own layout is the compass.
 *
 * Upstream accepts these only with the `MOD_NUM_KEYPAD` bit set, but this web
 * frontend never sets it — a number-pad `7` arrives as the plain character
 * `'7'` (`puzzle-view-interactive.ts` maps any single character to its char
 * code). Taking the bare digits too is therefore not a divergence for
 * divergence's sake: without it the four **diagonal** moves are unreachable
 * from the keyboard altogether, and a keyboard-only player simply cannot play
 * the game. Inertia binds no other digit, so this can't collide with anything.
 */
const DIGIT_DIRECTIONS: Readonly<Record<string, number>> = {
  "8": 0,
  "9": 1,
  "6": 2,
  "3": 3,
  "2": 4,
  "1": 5,
  "4": 6,
  "7": 7,
};

/** The octant a point falls in, seen from the ball. `dx`/`dy` are measured from
 * the ball; taken as (dx, -dy) rather than (dy, dx) so the compass comes out the
 * right way round. */
function octantFrom(dx: number, dy: number): number {
  const angle = (Math.atan2(dx, -dy) + Math.PI / 8) / (Math.PI / 4);
  return Math.floor(angle + 16) & 7;
}

/**
 * Where a swipe held at `p` is currently aimed, or -1 for "nowhere yet".
 *
 * Nowhere means one of two things: the pointer is still on the ball (so the
 * player has not committed to a direction — and dragging back onto the ball is
 * how they call the whole thing off), or it is aimed at a wall, which is not a
 * move the ball can make. Either way no arrow is drawn, which is the feedback.
 */
function aimedDirection(s: InertiaState, ts: number, p: Point): number {
  const dx = p.x - (coord(s.px, ts, BORDER) + ts / 2);
  const dy = p.y - (coord(s.py, ts, BORDER) + ts / 2);

  // Half a tile: the ball itself, plus a little forgiveness around it.
  if (Math.hypot(dx, dy) < ts / 2) return -1;

  const dir = octantFrom(dx, dy);
  return s.board.at(s.px + DX[dir], s.py + DY[dir]) === WALL ? -1 : dir;
}

/**
 * Inertia has no use for a secondary button — so take it as the primary one.
 *
 * This is not tidiness, it is what makes the swipe work with a finger. On touch,
 * a press that stays put for `holdTime` (350ms) is delivered as a **right**
 * button, because the frontend reads it as a long-press
 * (`detectSecondaryButton`). And "hold the ball, then drag where you want to go"
 * is *precisely* a press that stays put for a moment — so the gesture would die
 * exactly when the player paused to aim. Folding right onto left makes it work
 * whichever the long-press detector decides it saw.
 */
function asPrimary(button: number): number {
  if (button === RIGHT_BUTTON) return LEFT_BUTTON;
  if (button === RIGHT_DRAG) return LEFT_DRAG;
  if (button === RIGHT_RELEASE) return LEFT_RELEASE;
  return button;
}

function interpretMove(
  s: InertiaState,
  ui: InertiaUi,
  ds: InertiaDrawState | null,
  p: Point,
  rawButton: number,
): InertiaMove | null | UiUpdate {
  const ts = ds?.tileSize ?? PREFERRED_TILE_SIZE;
  const button = asPrimary(rawButton);
  let dir = -1;

  if (button === LEFT_BUTTON) {
    const cx = fromCoord(p.x, ts, BORDER);
    const cy = fromCoord(p.y, ts, BORDER);

    if (cx === s.px && cy === s.py) {
      // Pressing *on* the ball begins a swipe: hold it, drag out the way you
      // want to go, and let go. The alternative to hunting for a cell in the
      // right octant — which is the only way upstream lets you aim with a
      // pointer, and is fiddly with a finger.
      if (s.dead) return null;
      ui.aiming = true;
      ui.aimDir = -1;
      return UI_UPDATE;
    }

    // Clicking away from the ball means "go that way" — we take the octant the
    // click falls in.
    dir = octantFrom(cx - s.px, cy - s.py);
  } else if (button === LEFT_DRAG && ui.aiming) {
    const aimed = aimedDirection(s, ts, p);
    if (aimed === ui.aimDir) return null; // nothing to repaint
    ui.aimDir = aimed;
    return UI_UPDATE;
  } else if (button === LEFT_RELEASE && ui.aiming) {
    const aimed = ui.aimDir;
    ui.aiming = false;
    ui.aimDir = -1;
    // Released still on the ball (or aimed at a wall): the swipe is called off,
    // but the arrow has to come off the ball, so this is still a repaint.
    if (aimed < 0) return UI_UPDATE;
    ui.justMadeMove = true;
    return { type: "move", dir: aimed };
  } else if (button === CURSOR_UP) {
    dir = 0;
  } else if (button === CURSOR_DOWN) {
    dir = 4;
  } else if (button === CURSOR_LEFT) {
    dir = 6;
  } else if (button === CURSOR_RIGHT) {
    dir = 2;
  } else if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    // Enter/Space follows the installed route one step.
    if (s.route && s.routePos < s.route.length) dir = s.route[s.routePos];
  } else {
    // A digit, with or without the number-pad modifier (see DIGIT_DIRECTIONS).
    dir = DIGIT_DIRECTIONS[String.fromCharCode(stripModifiers(button))] ?? -1;
  }

  if (dir < 0) return null;

  // A wall in the way, or a dead ball, and the move simply cannot happen.
  if (s.board.at(s.px + DX[dir], s.py + DY[dir]) === WALL) return null;
  if (s.dead) return null;

  ui.justMadeMove = true;
  return { type: "move", dir };
}

// --- status bar ------------------------------------------------------

function statusbarText(s: InertiaState, ui: InertiaUi): string {
  let status: string;
  if (s.dead) {
    status = "DEAD!";
  } else if (s.gems) {
    status = `${s.cheated ? "Auto-solver used. " : ""}Gems: ${s.gems}`;
  } else if (s.cheated) {
    status = "Auto-solved.";
  } else {
    status = "COMPLETED!";
  }
  if (ui.deaths) status += `   Deaths: ${ui.deaths}`;
  return status;
}

// --- the game --------------------------------------------------------

export const inertiaGame: Game<
  InertiaParams,
  InertiaState,
  InertiaMove,
  InertiaUi,
  InertiaDrawState
> = {
  id: "inertia",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets() {
    return {
      title: "Inertia",
      submenu: PRESETS.map((p) => ({ title: `${p.w}x${p.h}`, params: { ...p } })),
    };
  },
  encodeParams: (p: InertiaParams, _full: boolean): string => encodeParams(p),
  decodeParams,
  validateParams: (p: InertiaParams, _full: boolean): string | null =>
    validateParams(p),
  paramConfig: dimensionParamConfig<InertiaParams>(),

  newDesc: (p: InertiaParams, rng: RandomState): { desc: string } =>
    newInertiaDesc(p, rng),
  validateDesc,
  newState,
  newUi: (): InertiaUi => ({
    deaths: 0,
    justMadeMove: false,
    justDied: false,
    animLength: 0,
    flashType: 0,
    aiming: false,
    aimDir: -1,
  }),

  changedState(ui: InertiaUi, oldState: InertiaState | null, s: InertiaState): void {
    // Count a death only when the player just walked into it, on a board that
    // wasn't already finished — so redoing a suicide doesn't kill you twice,
    // and once you're done you can play about freely.
    if (oldState && !oldState.dead && s.dead && ui.justMadeMove && oldState.gems) {
      ui.deaths++;
      ui.justDied = true;
    } else {
      ui.justDied = false;
    }
    ui.justMadeMove = false;
  },

  interpretMove,
  executeMove,

  status: (s: InertiaState): GameStatus => (s.gems === 0 ? "solved" : "ongoing"),

  solve(_orig: InertiaState, curr: InertiaState): SolveResult<InertiaMove> {
    const result = solveRoute(curr);
    if (!result.ok) return { ok: false, error: result.error };
    if (result.route.length === 0)
      return { ok: false, error: "Game is already solved" };
    return { ok: true, move: { type: "route", route: result.route } };
  },

  textFormat,
  statusbarText,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: InertiaParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,
  animLength,
  flashLength,
};

registerGame(inertiaGame);
