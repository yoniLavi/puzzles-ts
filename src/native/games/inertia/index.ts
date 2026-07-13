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
import type { Game, SolveResult, UiUpdate } from "../../engine/game.ts";
import { fromCoord } from "../../engine/geometry.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  LEFT_BUTTON,
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
  at,
  BLANK,
  cloneState,
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

/** Slide the ball, collecting gems and dying on mines. The caller has already
 * established that the first step isn't into a wall (so the ball can never run
 * off the grid: out-of-bounds counts as a wall, which stops it). */
function slide(s: InertiaState, dir: number): InertiaState {
  const { w } = s.params;
  const next = cloneState(s) as {
    -readonly [K in keyof InertiaState]: InertiaState[K];
  };
  const grid = next.grid;

  next.distanceMoved = 0;
  next.dead = false;

  for (;;) {
    next.px += DX[dir];
    next.py += DY[dir];
    next.distanceMoved++;

    const i = next.py * w + next.px;
    if (grid[i] === GEM) {
      grid[i] = BLANK;
      next.gems--;
    }
    if (grid[i] === MINE) {
      next.dead = true;
      break;
    }
    if (grid[i] === STOP || at(next, next.px + DX[dir], next.py + DY[dir]) === WALL) {
      break;
    }
  }

  return next;
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
    // route to follow.
    if (m.route.length === 0) throw new Error("inertia: empty route");
    return {
      ...cloneState(s),
      cheated: true,
      route: Object.freeze([...m.route]),
      routePos: 0,
    };
  }

  const dir = m.dir;
  if (dir < 0 || dir >= DIRECTIONS) throw new Error(`inertia: bad direction ${dir}`);
  if (s.dead) throw new Error("inertia: the ball is dead");
  if (at(s, s.px + DX[dir], s.py + DY[dir]) === WALL) {
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

function interpretMove(
  s: InertiaState,
  ui: InertiaUi,
  ds: InertiaDrawState | null,
  p: Point,
  button: number,
): InertiaMove | null | UiUpdate {
  let dir = -1;

  if (button === LEFT_BUTTON) {
    // Clicking away from the ball means "go that way" — we take the octant the
    // click falls in.
    const ts = ds?.tileSize ?? PREFERRED_TILE_SIZE;
    const cx = fromCoord(p.x, ts, BORDER);
    const cy = fromCoord(p.y, ts, BORDER);

    if (cx !== s.px || cy !== s.py) {
      // dx,-dy rather than dy,dx, so the octants come out the right way round.
      const angle = (Math.atan2(cx - s.px, -(cy - s.py)) + Math.PI / 8) / (Math.PI / 4);
      dir = Math.floor(angle + 16) & 7;
    }
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
  if (at(s, s.px + DX[dir], s.py + DY[dir]) === WALL) return null;
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
