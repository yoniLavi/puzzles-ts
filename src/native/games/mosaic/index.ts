/**
 * Mosaic — native TS port of `mosaic.c` (Fill-a-Pix): numeric clues
 * count the black cells of their 3×3 neighbourhood (itself included);
 * mark every cell black or white. Click toggles
 * unmarked→black→white→unmarked (right-click cycles the other way);
 * aligned drags paint the click's mark across a straight run.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { type Game, UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  gridCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import { parseConfigInt } from "../../engine/params.ts";
import { registerGame } from "../../engine/registry.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  type MosaicDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
} from "./render.ts";
import { encodeSolution, findMistakes, newDesc, solveGameActual } from "./solver.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  type MosaicMistake,
  type MosaicMove,
  type MosaicParams,
  type MosaicState,
  type MosaicUi,
  newState,
  presets,
  STATE_OK_NUM,
  status,
  statusbarText,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function isMouseEvent(button: number): boolean {
  return button >= LEFT_BUTTON && button <= RIGHT_RELEASE;
}

// --- input -------------------------------------------------------------

function newUi(_state: MosaicState): MosaicUi {
  return {
    lastX: -1,
    lastY: -1,
    lastState: 0,
    curX: 0,
    curY: 0,
    cursorVisible: false,
  };
}

/** Is some cell on the straight run from (x,y) toward the exclusive
 * anchor still unmarked? (Upstream's `changed` check — a paint that
 * would change nothing emits no move, so no no-op history entries.) */
function paintWouldChange(
  state: MosaicState,
  x: number,
  y: number,
  srcX: number,
  srcY: number,
): boolean {
  let dirX = 0;
  let dirY = 0;
  let diff: number;
  if (srcX === x && srcY !== y) {
    diff = Math.abs(srcY - y);
    dirY = srcY - y < 0 ? -1 : 1;
  } else {
    diff = Math.abs(srcX - x);
    dirX = srcX - x < 0 ? -1 : 1;
  }
  for (let i = 0; i < diff; i++) {
    const cx = x + dirX * i;
    const cy = y + dirY * i;
    if (cx < 0 || cy < 0 || cx >= state.width || cy >= state.height) continue;
    if ((state.cells[cy * state.width + cx] & STATE_OK_NUM) === 0) return true;
  }
  return false;
}

function interpretMove(
  state: MosaicState,
  ui: MosaicUi,
  ds: MosaicDrawState | null,
  p: Point,
  button: number,
): MosaicMove | null | UiUpdate {
  const raw = stripModifiers(button);
  const { width, height } = state;
  const d = cursorDelta(raw);

  // After completion, only cursor browsing is accepted (upstream freeze).
  if (state.notCompletedClues === 0 && !d) return null;

  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const m = Math.floor(ts / 2);
  const offsetX = p.x - m;
  const offsetY = p.y - m;
  const gameX = Math.floor(offsetX / ts);
  const gameY = Math.floor(offsetY / ts);
  const inBounds = gameX >= 0 && gameY >= 0 && gameX < width && gameY < height;

  if (isMouseEvent(raw) && (offsetX < 0 || offsetY < 0)) return null;

  if (raw === LEFT_BUTTON || raw === RIGHT_BUTTON) {
    ui.cursorVisible = false;
    if (!inBounds) {
      ui.lastX = -1;
      ui.lastY = -1;
      return null;
    }
    // Capture the mark this cell is about to become; aligned drags and
    // the release paint it onto still-unmarked cells.
    const cur = state.cells[gameY * width + gameX] & STATE_OK_NUM;
    ui.lastState = (cur + (raw === RIGHT_BUTTON ? 2 : 1)) % STATE_OK_NUM;
    ui.lastX = gameX;
    ui.lastY = gameY;
    return { type: "toggle", x: gameX, y: gameY, double: raw === RIGHT_BUTTON };
  }

  if (raw === LEFT_DRAG || raw === RIGHT_DRAG || raw === LEFT_RELEASE || raw === RIGHT_RELEASE) {
    const isDrag = raw === LEFT_DRAG || raw === RIGHT_DRAG;
    ui.cursorVisible = false;
    const aligned =
      inBounds &&
      ui.lastX >= 0 &&
      ui.lastY >= 0 &&
      (gameY === ui.lastY || gameX === ui.lastX);
    if (!aligned) {
      ui.lastX = -1;
      ui.lastY = -1;
      return null;
    }
    const move: MosaicMove = {
      type: "paint",
      x: gameX,
      y: gameY,
      srcX: ui.lastX,
      srcY: ui.lastY,
      paintState: ui.lastState,
    };
    const changed =
      ui.lastState > 0 && paintWouldChange(state, gameX, gameY, ui.lastX, ui.lastY);
    if (isDrag) {
      // The drag anchor advances; the release keeps it.
      ui.lastX = gameX;
      ui.lastY = gameY;
    }
    return changed ? move : null;
  }

  if (d) {
    const moved = gridCursorMove(raw, ui.curX, ui.curY, width, height);
    if (moved) {
      ui.curX = moved.x;
      ui.curY = moved.y;
    }
    ui.cursorVisible = true;
    return UI_UPDATE;
  }

  if (raw === CURSOR_SELECT || raw === CURSOR_SELECT2) {
    if (!ui.cursorVisible) {
      ui.curX = 0;
      ui.curY = 0;
      ui.cursorVisible = true;
      return UI_UPDATE;
    }
    return {
      type: "toggle",
      x: ui.curX,
      y: ui.curY,
      double: raw === CURSOR_SELECT2,
    };
  }

  return null;
}

// --- flash --------------------------------------------------------------

function flashLength(
  oldState: MosaicState,
  newState_: MosaicState,
  _dir: number,
  _ui: MosaicUi,
): number {
  if (
    !oldState.cheating &&
    oldState.notCompletedClues > 0 &&
    newState_.notCompletedClues === 0
  ) {
    return FLASH_TIME;
  }
  return 0;
}

// --- Game object -----------------------------------------------------------

export const mosaicGame: Game<
  MosaicParams,
  MosaicState,
  MosaicMove,
  MosaicUi,
  MosaicDrawState,
  MosaicMistake
> = {
  id: "mosaic",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  // Mosaic's params use `width`/`height` (not the shared helper's `w`/`h`).
  paramConfig: [
    {
      kw: "width",
      name: "Width",
      type: "string",
      get: (p) => String(p.width),
      set: (p, v) => {
        p.width = parseConfigInt(v);
      },
    },
    {
      kw: "height",
      name: "Height",
      type: "string",
      get: (p) => String(p.height),
      set: (p, v) => {
        p.height = parseConfigInt(v);
      },
    },
    {
      kw: "aggressive-generation",
      name: "Aggressive generation",
      type: "boolean",
      get: (p) => p.aggressive,
      set: (p, v) => {
        p.aggressive = v;
      },
    },
  ],
  describeParams: (p) => ({
    width: String(p.width),
    height: String(p.height),
    "aggressive-generation": p.aggressive,
  }),

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve(orig, _curr) {
    const sol = solveGameActual(orig.board);
    if (!sol) return { ok: false, error: "Could not solve this board" };
    return { ok: true, move: { type: "solve", solution: encodeSolution(sol) } };
  },

  findMistakes,

  textFormat,
  statusbarText,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: MosaicParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(mosaicGame);
