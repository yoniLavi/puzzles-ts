/**
 * Unruly — native TS port of `unruly.c` (the binary puzzle Binairo).
 * Fill the grid with two colours so no row/column has three equal cells
 * in a row and each row/column holds equally many of each; an optional
 * variant also forbids two identical rows or columns.
 *
 * Left-click cycles a cell empty → one (black) → zero (white) → empty;
 * right-click cycles the other way; number keys place directly.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { type Game, UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  cursorDelta,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { newDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type UnrulyDrawState,
} from "./render.ts";
import { findMistakes, solveToString } from "./solver.ts";
import {
  type Cell,
  decodeParams,
  defaultParams,
  EMPTY,
  encodeParams,
  executeMove,
  newState,
  ONE,
  presets,
  status,
  textFormat,
  type UnrulyMistake,
  type UnrulyMove,
  type UnrulyParams,
  type UnrulyState,
  type UnrulyUi,
  validateDesc,
  validateParams,
  ZERO,
} from "./state.ts";

// Button-modifier mask (ctrl/shift/numeric-keypad bits), stripped before
// dispatch — matches upstream `STRIP_BUTTON_MODIFIERS`.
const MOD_MASK = 0x7800;

function newUi(_state: UnrulyState): UnrulyUi {
  return { cx: 0, cy: 0, cursor: false };
}

function border(ts: number): number {
  return Math.floor(ts / 2);
}

/** The cell value a key/click decided to set (upstream's `c`), or `null`
 * for "no change requested". */
function decideValue(button: number, current: Cell): Cell | null {
  switch (button) {
    case 49: // '1'
      return ONE;
    case 48: // '0'
    case 50: // '2'
      return ZERO;
    case 8: // backspace
    case MIDDLE_BUTTON:
      return EMPTY;
    case CURSOR_SELECT2:
    case RIGHT_BUTTON:
      // empty → zero → one → empty
      return current === EMPTY ? ZERO : current === ZERO ? ONE : EMPTY;
    case CURSOR_SELECT:
    case LEFT_BUTTON:
      // empty → one → zero → empty
      return current === EMPTY ? ONE : current === ONE ? ZERO : EMPTY;
    default:
      return null;
  }
}

function interpretMove(
  state: UnrulyState,
  ui: UnrulyUi,
  ds: UnrulyDrawState | null,
  p: Point,
  rawButton: number,
): UnrulyMove | null | UiUpdate {
  const button = rawButton & ~MOD_MASK;
  const { w2, h2 } = state;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const b = border(ts);

  let hx = ui.cx;
  let hy = ui.cy;
  let nullret: null | UiUpdate = null;

  const isMouse =
    button === LEFT_BUTTON || button === RIGHT_BUTTON || button === MIDDLE_BUTTON;

  if (isMouse) {
    const gx = Math.floor((p.x - b) / ts);
    const gy = Math.floor((p.y - b) / ts);
    if (p.x >= b && gx < w2 && p.y >= b && gy < h2 && gx >= 0 && gy >= 0) {
      hx = gx;
      hy = gy;
      if (ui.cursor) {
        ui.cursor = false;
        nullret = UI_UPDATE;
      }
    } else {
      return null;
    }
  }

  // Keyboard cursor movement.
  if (
    button === CURSOR_UP ||
    button === CURSOR_DOWN ||
    button === CURSOR_LEFT ||
    button === CURSOR_RIGHT
  ) {
    const d = cursorDelta(button);
    if (d) {
      ui.cx = Math.max(0, Math.min(w2 - 1, ui.cx + d.dx));
      ui.cy = Math.max(0, Math.min(h2 - 1, ui.cy + d.dy));
      ui.cursor = true;
    }
    return UI_UPDATE;
  }

  // Placement: a marking key while the cursor is shown, or any mouse click.
  const isKeyPlace =
    ui.cursor &&
    (button === CURSOR_SELECT ||
      button === CURSOR_SELECT2 ||
      button === 8 ||
      button === 48 ||
      button === 49 ||
      button === 50);

  if (isKeyPlace || isMouse) {
    const i = hy * w2 + hx;
    if (state.immutable[i]) return nullret;
    const value = decideValue(button, state.grid[i] as Cell);
    if (value === null || state.grid[i] === value) return nullret; // no-op
    return { type: "place", x: hx, y: hy, value };
  }

  return nullret;
}

function flashLength(
  oldState: UnrulyState,
  newState_: UnrulyState,
  _dir: number,
  _ui: UnrulyUi,
): number {
  if (
    !oldState.completed &&
    newState_.completed &&
    !oldState.cheated &&
    !newState_.cheated
  ) {
    return FLASH_TIME;
  }
  return 0;
}

export const unrulyGame: Game<
  UnrulyParams,
  UnrulyState,
  UnrulyMove,
  UnrulyUi,
  UnrulyDrawState,
  UnrulyMistake
> = {
  id: "unruly",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  describeParams: (p) => ({
    width: String(p.w2),
    height: String(p.h2),
    difficulty: p.diff,
    "unique-rows-and-columns": p.unique,
  }),

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve(orig) {
    const grid = solveToString(orig);
    if (!grid) return { ok: false, error: "No solution found" };
    return { ok: true, move: { type: "solve", grid } };
  },

  findMistakes,

  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: UnrulyParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(unrulyGame);
