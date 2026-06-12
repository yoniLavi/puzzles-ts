/**
 * Black Box — native TS port of `puzzles/blackbox.c` (deleted when this
 * ships).
 *
 * Locate the hidden balls in a `w`×`h` arena by firing lasers from the
 * surrounding range and reading how they hit (`H`), reflect (`R`), or
 * exit (matched entry/exit numbers). Mark guessed balls, optionally lock
 * cells/rows/columns, then verify: a wrong verify shows one piece of
 * evidence and asks again; a right one wins. The laser physics and the
 * verify logic live in `state.ts`; this file is the `Game` glue, input
 * mapping, and the move executor.
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { type Game, UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  LEFT_BUTTON,
  LEFT_RELEASE,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import {
  animLength,
  type BlackboxDrawState,
  colours as coloursImpl,
  computeSize as computeSizeImpl,
  flashLength,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  BALL_GUESS,
  BALL_LOCK,
  type BlackboxMove,
  type BlackboxParams,
  type BlackboxState,
  type BlackboxUi,
  canReveal,
  checkGuesses,
  cloneState,
  decodeParams,
  defaultParams,
  encodeParams,
  fireLaserMove,
  grid2range,
  gridGet,
  LASER_EMPTY,
  LASER_OMITTED,
  LASER_WRONG,
  newDesc,
  newState,
  presets,
  status,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- UI ----------------------------------------------------------------

function newUi(_state: BlackboxState): BlackboxUi {
  return {
    flashLaserno: LASER_EMPTY,
    errors: 0,
    newmove: false,
    curX: 1,
    curY: 1,
    curVisible: false,
    flashLaser: 0,
  };
}

/** Upstream `game_changed_state`: a `justwrong` state reached by an
 * actual move (not an undo) bumps the session error counter. */
function changedState(
  ui: BlackboxUi,
  _oldState: BlackboxState | null,
  newState_: BlackboxState,
): void {
  if (newState_.justwrong && ui.newmove) ui.errors++;
  ui.newmove = false;
}

// --- helpers ----------------------------------------------------------

function tileSizeOf(ds: BlackboxDrawState | null): number {
  return ds && ds.tilesize > 0 ? ds.tilesize : PREFERRED_TILE_SIZE;
}

/** Pixel → grid cell. Faithful to upstream `FROMDRAW`: `(px − border) /
 * ts` with C's truncate-toward-zero division, so left/top border-margin
 * clicks fold onto cell 0 exactly as upstream (where `(0,0)` is the
 * reveal button). */
function fromDraw(px: number, ts: number): number {
  const border = Math.floor(ts / 2);
  return Math.trunc((px - border) / ts);
}

// --- input ------------------------------------------------------------

function interpretMove(
  state: BlackboxState,
  ui: BlackboxUi,
  ds: BlackboxDrawState | null,
  p: Point,
  button: number,
): BlackboxMove | null | UiUpdate {
  let gx = -1;
  let gy = -1;
  let wouldflash = 0;

  const delta = cursorDelta(button);
  if (delta) {
    // Move the cursor over the (w+2)×(h+2) grid, no wrap, no corners.
    const cx = Math.min(Math.max(ui.curX + delta.dx, 0), state.w + 1);
    const cy = Math.min(Math.max(ui.curY + delta.dy, 0), state.h + 1);
    if (
      (cx === 0 && cy === 0 && !canReveal(state)) ||
      (cx === 0 && cy === state.h + 1) ||
      (cx === state.w + 1 && cy === 0) ||
      (cx === state.w + 1 && cy === state.h + 1)
    )
      return null; // disallow moving the cursor to a corner
    ui.curX = cx;
    ui.curY = cy;
    ui.curVisible = true;
    return UI_UPDATE;
  }

  let effective = button;
  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    const ts = tileSizeOf(ds);
    gx = fromDraw(p.x, ts);
    gy = fromDraw(p.y, ts);
    ui.curVisible = false;
    wouldflash = 1;
  } else if (button === LEFT_RELEASE) {
    ui.flashLaser = 0;
    return UI_UPDATE;
  } else if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (ui.curVisible) {
      gx = ui.curX;
      gy = ui.curY;
      ui.flashLaser = 0;
      wouldflash = 2;
    } else {
      ui.curVisible = true;
      return UI_UPDATE;
    }
    effective = button === CURSOR_SELECT2 ? RIGHT_BUTTON : LEFT_BUTTON;
  } else {
    return null;
  }

  // Classify the targeted cell.
  type Action =
    | "none"
    | "toggleBall"
    | "toggleLock"
    | "fire"
    | "reveal"
    | "toggleColumnLock"
    | "toggleRowLock";
  let action: Action = "none";
  let rangeno = -1;

  if (gx === 0 && gy === 0 && effective === LEFT_BUTTON) action = "reveal";
  if (gx >= 1 && gx <= state.w && gy >= 1 && gy <= state.h) {
    if (effective === LEFT_BUTTON) {
      if (!(gridGet(state, gx, gy) & BALL_LOCK)) action = "toggleBall";
    } else {
      action = "toggleLock";
    }
  }
  const r = grid2range(state.w, state.h, gx, gy);
  if (r !== null) {
    rangeno = r;
    if (effective === LEFT_BUTTON) action = "fire";
    else if (gy === 0 || gy > state.h) action = "toggleColumnLock";
    else action = "toggleRowLock";
  }

  let move: BlackboxMove | null = null;
  let uiUpdated = false;

  switch (action) {
    case "toggleBall":
      move = { type: "toggleBall", x: gx, y: gy };
      break;
    case "toggleLock":
      move = { type: "toggleLock", x: gx, y: gy };
      break;
    case "toggleColumnLock":
      move = { type: "toggleColumnLock", x: gx };
      break;
    case "toggleRowLock":
      move = { type: "toggleRowLock", y: gy };
      break;
    case "fire": {
      if (state.reveal && state.exits[rangeno] === LASER_EMPTY) return null;
      ui.flashLaserno = rangeno;
      ui.flashLaser = wouldflash;
      uiUpdated = true;
      if (state.exits[rangeno] !== LASER_EMPTY) return UI_UPDATE; // re-flash
      move = { type: "fire", rangeno };
      break;
    }
    case "reveal":
      if (!canReveal(state)) return null;
      if (ui.curVisible) {
        ui.curX = 1;
        ui.curY = 1;
      }
      move = { type: "reveal" };
      break;
    default:
      return null;
  }

  if (state.reveal) return uiUpdated ? UI_UPDATE : null;
  ui.newmove = true;
  return move;
}

// --- moves ------------------------------------------------------------

function executeMove(from: BlackboxState, m: BlackboxMove): BlackboxState {
  const ret = cloneState(from);

  // Leaving a `justwrong` state clears the one-error highlight.
  if (ret.justwrong) {
    ret.justwrong = false;
    for (let i = 0; i < ret.nlasers; i++) {
      if (ret.exits[i] !== LASER_EMPTY)
        ret.exits[i] &= ~(LASER_OMITTED | LASER_WRONG);
    }
  }

  if (m.type === "solve") {
    checkGuesses(ret, false);
    return ret;
  }

  if (from.reveal) throw new Error("No moves once the answer is revealed");

  switch (m.type) {
    case "toggleBall": {
      if (m.x < 1 || m.y < 1 || m.x > ret.w || m.y > ret.h)
        throw new Error("Ball toggle outside arena");
      const idx = m.y * (ret.w + 2) + m.x;
      if (ret.grid[idx] & BALL_GUESS) {
        ret.nguesses--;
        ret.grid[idx] &= ~BALL_GUESS;
      } else {
        ret.nguesses++;
        ret.grid[idx] |= BALL_GUESS;
      }
      break;
    }
    case "fire": {
      if (m.rangeno < 0 || m.rangeno >= ret.nlasers)
        throw new Error("Laser index out of range");
      if (ret.exits[m.rangeno] !== LASER_EMPTY)
        throw new Error("Laser already fired");
      fireLaserMove(ret, m.rangeno);
      break;
    }
    case "reveal": {
      if (ret.nguesses < ret.minballs || ret.nguesses > ret.maxballs)
        throw new Error("Ball count out of range to reveal");
      checkGuesses(ret, true);
      break;
    }
    case "toggleLock": {
      if (m.x < 1 || m.y < 1 || m.x > ret.w || m.y > ret.h)
        throw new Error("Lock toggle outside arena");
      ret.grid[m.y * (ret.w + 2) + m.x] ^= BALL_LOCK;
      break;
    }
    case "toggleColumnLock": {
      if (m.x < 1 || m.x > ret.w) throw new Error("Column out of range");
      let lcount = 0;
      for (let y = 1; y <= ret.h; y++)
        if (ret.grid[y * (ret.w + 2) + m.x] & BALL_LOCK) lcount++;
      for (let y = 1; y <= ret.h; y++) {
        const idx = y * (ret.w + 2) + m.x;
        if (lcount > ret.h / 2) ret.grid[idx] &= ~BALL_LOCK;
        else ret.grid[idx] |= BALL_LOCK;
      }
      break;
    }
    case "toggleRowLock": {
      if (m.y < 1 || m.y > ret.h) throw new Error("Row out of range");
      let lcount = 0;
      for (let x = 1; x <= ret.w; x++)
        if (ret.grid[m.y * (ret.w + 2) + x] & BALL_LOCK) lcount++;
      for (let x = 1; x <= ret.w; x++) {
        const idx = m.y * (ret.w + 2) + x;
        if (lcount > ret.w / 2) ret.grid[idx] &= ~BALL_LOCK;
        else ret.grid[idx] |= BALL_LOCK;
      }
      break;
    }
  }

  return ret;
}

// --- status bar -------------------------------------------------------

function statusbarText(state: BlackboxState, ui: BlackboxUi): string {
  let buf: string;
  if (state.reveal) {
    if (state.nwrong === 0 && state.nmissed === 0 && state.nright >= state.minballs)
      buf = "CORRECT!";
    else buf = `${state.nwrong} wrong and ${state.nmissed} missed balls.`;
  } else if (state.justwrong) {
    buf = "Wrong! Guess again.";
  } else if (state.nguesses > state.maxballs) {
    buf = `${state.nguesses - state.maxballs} too many balls marked.`;
  } else if (state.nguesses >= state.minballs) {
    buf = "Click button to verify guesses.";
  } else if (state.maxballs === state.minballs) {
    buf = `Balls marked: ${state.nguesses} / ${state.minballs}`;
  } else {
    buf = `Balls marked: ${state.nguesses} / ${state.minballs}-${state.maxballs}.`;
  }
  if (ui.errors) buf += ` (${ui.errors} error${ui.errors > 1 ? "s" : ""})`;
  return buf;
}

// --- Game object ------------------------------------------------------

export const blackboxGame: Game<
  BlackboxParams,
  BlackboxState,
  BlackboxMove,
  BlackboxUi,
  BlackboxDrawState
> = {
  id: "blackbox",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve() {
    // Upstream solve_game returns "S": reveal the real layout (a give-up,
    // scored as a loss-reveal unless the guesses already matched).
    return { ok: true, move: { type: "solve" } };
  },

  statusbarText,

  colours: (defaultBackground: Colour): Colour[] => coloursImpl(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: BlackboxParams, ts: number): Size => computeSizeImpl(p, ts),
  setTileSize,
  newDrawState,
  redraw,
  animLength,
  flashLength,
};

registerGame(blackboxGame);
