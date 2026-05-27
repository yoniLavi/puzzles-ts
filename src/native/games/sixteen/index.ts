import type {
  Colour,
  Point,
  Size,
} from "../../../puzzle/types.ts";
import type {
  Game,
  GameDrawing,
  UiUpdate,
} from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { registerGame } from "../../engine/registry.ts";
import { mkhighlightBackground } from "../../engine/colour-mkhighlight.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  LEFT_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import {
  type SixteenMove,
  type SixteenParams,
  type SixteenState,
  type SixteenUi,
  CursorMode,
  defaultParams,
  encodeParams,
  decodeParams,
  validateParams,
  presets,
  validateDesc,
  newState,
  textFormat,
  newDesc,
} from "./state.ts";

// --- constants --------------------------------------------------------

const PREFERRED_TILE_SIZE = 48;
const ANIM_TIME = 0.13;
const FLASH_FRAME = 0.13;
const HIGHLIGHT_WIDTH_DIV = 20;

// --- colour indices ---------------------------------------------------

const COL_BACKGROUND = 0;
const COL_TEXT = 1;
const COL_HIGHLIGHT = 2;
const COL_LOWLIGHT = 3;

// --- move logic -------------------------------------------------------

export function executeMove(state: SixteenState, move: SixteenMove): SixteenState {
  if (move.type === "solve") {
    const tiles = new Int32Array(state.n);
    for (let i = 0; i < state.n; i++) tiles[i] = i + 1;
    return {
      ...state,
      tiles,
      usedSolve: true,
      completed: state.moveCount + 1,
      moveCount: state.moveCount + 1,
    };
  }

  const { axis, index, delta } = move;
  const tiles = new Int32Array(state.tiles);

  if (axis === "row") {
    for (let x = 0; x < state.w; x++) {
      const srcX = ((x - delta) % state.w + state.w) % state.w;
      tiles[index * state.w + x] = state.tiles[index * state.w + srcX];
    }
  } else {
    for (let y = 0; y < state.h; y++) {
      const srcY = ((y - delta) % state.h + state.h) % state.h;
      tiles[y * state.w + index] = state.tiles[srcY * state.w + index];
    }
  }

  const moveCount = state.moveCount + 1;
  let completed = state.completed;
  if (!completed) {
    let done = true;
    for (let i = 0; i < state.n; i++) {
      if (tiles[i] !== i + 1) { done = false; break; }
    }
    if (done) completed = moveCount;
  }

  return {
    ...state,
    tiles,
    moveCount,
    completed,
    lastMovementSense: axis === "row" ? delta : 0 + (axis === "column" ? delta : 0),
  };
}

// --- UI ---------------------------------------------------------------

function newUi(_state: SixteenState): SixteenUi {
  return {
    curX: 0,
    curY: 0,
    curVisible: false,
    curMode: CursorMode.Unlocked,
  };
}

function interpretMove(
  state: SixteenState,
  ui: SixteenUi,
  ds: SixteenDrawState | null,
  p: Point,
  button: number,
): SixteenMove | null | UiUpdate {
  const MOD_CTRL = 0x1000;
  const MOD_SHFT = 0x2000;
  const MOD_NUM_KEYPAD = 0x4000;
  const MOD_MASK = 0x7800;
  const shift = !!(button & MOD_SHFT);
  const control = !!(button & MOD_CTRL);
  const pad = button & MOD_NUM_KEYPAD;
  const rawButton = button & ~MOD_MASK;

  // Cursor movement.
  if (isCursorMove(rawButton) || pad) {
    if (!ui.curVisible) {
      ui.curVisible = true;
      return UI_UPDATE;
    }

    if (control || shift || ui.curMode !== CursorMode.Unlocked) {
      if (ui.curX < 0 || ui.curX >= state.w || ui.curY < 0 || ui.curY >= state.h)
        return null;

      const { x: nx, y: ny } = moveCursor(
        rawButton | pad, ui.curX, ui.curY, state.w, state.h, false,
      );
      const { x: nwx, y: nwy } = moveCursor(
        rawButton | pad, ui.curX, ui.curY, state.w, state.h, true,
      );

      let move: SixteenMove;
      if (nx !== nwx) {
        move = { type: "slide", axis: "row", index: ui.curY, delta: nx > ui.curX ? 1 : -1 };
      } else if (ny !== nwy) {
        move = { type: "slide", axis: "column", index: ui.curX, delta: ny > ui.curY ? 1 : -1 };
      } else if (nx === ui.curX) {
        move = { type: "slide", axis: "column", index: ui.curX, delta: ny - ui.curY };
      } else {
        move = { type: "slide", axis: "row", index: ui.curY, delta: nx - ui.curX };
      }

      if (control || (!shift && ui.curMode === CursorMode.LockTile)) {
        ui.curX = nwx;
        ui.curY = nwy;
      }

      return move;
    } else {
      const { x: nx, y: ny } = moveCursor(
        rawButton | pad, ui.curX + 1, ui.curY + 1, state.w + 2, state.h + 2, false,
      );

      if (nx === 0 && ny === 0) {
        const t = ui.curX;
        ui.curX = ui.curY;
        ui.curY = t;
      } else if (nx === 0 && ny === state.h + 1) {
        const t = ui.curX;
        ui.curX = (state.h - 1) - ui.curY;
        ui.curY = (state.h - 1) - t;
      } else if (nx === state.w + 1 && ny === 0) {
        const t = ui.curX;
        ui.curX = (state.w - 1) - ui.curY;
        ui.curY = (state.w - 1) - t;
      } else if (nx === state.w + 1 && ny === state.h + 1) {
        const t = ui.curX;
        ui.curX = state.w - state.h + ui.curY;
        ui.curY = state.h - state.w + t;
      } else {
        ui.curX = nx - 1;
        ui.curY = ny - 1;
      }

      ui.curVisible = true;
      return UI_UPDATE;
    }
  }

  // Mouse click / cursor select.
  let cx = -1, cy = -1;
  if (rawButton === LEFT_BUTTON || rawButton === RIGHT_BUTTON) {
    const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
    cx = fromCoord(p.x, ts);
    cy = fromCoord(p.y, ts);
    ui.curVisible = false;
  } else if (rawButton === CURSOR_SELECT || rawButton === CURSOR_SELECT2) {
    if (ui.curVisible) {
      if (ui.curX === -1 || ui.curX === state.w ||
          ui.curY === -1 || ui.curY === state.h) {
        cx = ui.curX;
        cy = ui.curY;
      } else {
        const m = rawButton === CURSOR_SELECT2
          ? CursorMode.LockPosition
          : CursorMode.LockTile;
        ui.curMode = ui.curMode === m ? CursorMode.Unlocked : m;
        return UI_UPDATE;
      }
    } else {
      ui.curVisible = true;
      return UI_UPDATE;
    }
  } else {
    return null;
  }

  // Determine slide direction from click position.
  let dx = 0, dy = 0;
  if (cx === -1 && cy >= 0 && cy < state.h) { dx = -1; dy = 0; }
  else if (cx === state.w && cy >= 0 && cy < state.h) { dx = 1; dy = 0; }
  else if (cy === -1 && cx >= 0 && cx < state.w) { dy = -1; dx = 0; }
  else if (cy === state.h && cx >= 0 && cx < state.w) { dy = 1; dx = 0; }
  else return UI_UPDATE;

  // Reverse direction for right button / CURSOR_SELECT2.
  if (rawButton === RIGHT_BUTTON || rawButton === CURSOR_SELECT2) {
    dx = -dx;
    dy = -dy;
  }

  if (dx) return { type: "slide", axis: "row", index: cy, delta: dx };
  return { type: "slide", axis: "column", index: cx, delta: dy };
}

function isCursorMove(button: number): boolean {
  return button >= CURSOR_UP && button <= CURSOR_RIGHT;
}

function moveCursor(
  button: number,
  x: number,
  y: number,
  w: number,
  h: number,
  wrap: boolean,
): { x: number; y: number } {
  let nx = x, ny = y;
  if (button === CURSOR_UP) ny--;
  else if (button === CURSOR_DOWN) ny++;
  else if (button === CURSOR_LEFT) nx--;
  else if (button === CURSOR_RIGHT) nx++;
  if (wrap) {
    nx = ((nx % w) + w) % w;
    ny = ((ny % h) + h) % h;
  } else {
    nx = Math.max(0, Math.min(w - 1, nx));
    ny = Math.max(0, Math.min(h - 1, ny));
  }
  return { x: nx, y: ny };
}

// --- coordinate helpers -----------------------------------------------

function coord(pos: number, ts: number): number {
  return pos * ts + border(ts);
}

function fromCoord(pixel: number, ts: number): number {
  return Math.floor((pixel - border(ts) + 2 * ts) / ts) - 2;
}

function border(ts: number): number {
  return ts;
}

// --- drawing ----------------------------------------------------------

interface SixteenDrawState {
  started: boolean;
  w: number;
  h: number;
  bgcolour: number;
  tiles: Int32Array;
  tilesize: number;
  curX: number;
  curY: number;
}

function newDrawState(state: SixteenState): SixteenDrawState {
  return {
    started: false,
    w: state.w,
    h: state.h,
    bgcolour: COL_BACKGROUND,
    tiles: new Int32Array(state.n).fill(-1),
    tilesize: 0,
    curX: -1,
    curY: -1,
  };
}

function computeSize(p: SixteenParams, ts: number): Size {
  const b = border(ts);
  return {
    w: ts * p.w + 2 * b,
    h: ts * p.h + 2 * b,
  };
}

function colours(defaultBackground: Colour): Colour[] {
  const bg = mkhighlightBackground(defaultBackground);

  // Derive highlight and lowlight from the adjusted background,
  // matching C's game_mkhighlight which shifts toward white/black.
  const K = Math.sqrt(3) / 6;
  const colourDistance = (a: Colour, b: Colour) =>
    Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  const colourMix = (a: Colour, b: Colour, t: number): Colour => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const black: Colour = [0, 0, 0];
  const white: Colour = [1, 1, 1];

  // Highlight: shift toward white by K.
  const dw = colourDistance(bg, white);
  const hi: Colour =
    dw < K
      ? colourMix(white, black, K / Math.sqrt(3))
      : colourMix(bg, white, K / dw);

  // Lowlight: shift toward black by K.
  const db = colourDistance(bg, black);
  const lo: Colour =
    db < K
      ? colourMix(black, white, K / Math.sqrt(3))
      : colourMix(bg, black, K / db);

  const text: Colour = [0, 0, 0];
  return [bg, text, hi, lo];
}

function redraw(
  dr: GameDrawing,
  ds: SixteenDrawState | null,
  prev: SixteenState | null,
  state: SixteenState,
  dir: number,
  ui: SixteenUi,
  animTime: number,
  flashTime: number,
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const hw = Math.max(1, Math.floor(ts / HIGHLIGHT_WIDTH_DIV));

  let bgcolour = COL_BACKGROUND;
  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    bgcolour = frame % 2 ? COL_LOWLIGHT : COL_HIGHLIGHT;
  }

  if (!ds.started) {
    drawRecessedBorder(dr, state, ts, hw);
    for (let i = 0; i < state.w; i++) {
      drawArrow(dr, ts, coord(i, ts), coord(0, ts), 1, 0, false);
      drawArrow(dr, ts, coord(i + 1, ts), coord(state.h, ts), -1, 0, false);
    }
    for (let i = 0; i < state.h; i++) {
      drawArrow(dr, ts, coord(state.w, ts), coord(i, ts), 0, 1, false);
      drawArrow(dr, ts, coord(0, ts), coord(i + 1, ts), 0, -1, false);
    }
    ds.started = true;
  }

  // Cursor.
  let curX = -1, curY = -1;
  if (ui.curVisible) { curX = ui.curX; curY = ui.curY; }

  if (curX !== ds.curX || curY !== ds.curY) {
    drawArrowForCursor(dr, ts, ds, curX, curY, true);
    drawArrowForCursor(dr, ts, ds, ds.curX, ds.curY, false);
  }

  // Clip to the tile area.
  dr.clip({ x: coord(0, ts), y: coord(0, ts), w: ts * state.w, h: ts * state.h });

  for (let i = 0; i < state.n; i++) {
    let t: number;
    if (prev && prev.tiles[i] !== state.tiles[i]) t = -1;
    else t = state.tiles[i];

    const t0 = t;

    if (ds.bgcolour !== bgcolour ||
        ds.tiles[i] !== t || ds.tiles[i] === -1 || t === -1 ||
        ((ds.curX !== curX || ds.curY !== curY) &&
         (tileCursor(i, state, ds.curX, ds.curY) ||
          tileCursor(i, state, curX, curY)))) {
      let drawX: number, drawY: number, drawX2 = -1, drawY2 = -1;

      if (t === -1 && prev) {
        // Animating tile.
        let sense: number;
        if (dir >= 0) {
          sense = state.lastMovementSense;
        } else {
          sense = -(prev?.lastMovementSense ?? 0);
        }

        t = state.tiles[i];

        const x1 = coord(i % state.w, ts);
        const y1 = coord(Math.floor(i / state.w), ts);

        // Find where this tile was in the old state.
        let j = 0;
        for (; j < prev.n; j++) {
          if (prev.tiles[j] === state.tiles[i]) break;
        }
        const x0 = coord(j % state.w, ts);
        const y0 = coord(Math.floor(j / state.w), ts);

        let dx = x1 - x0;
        if (dx !== 0 && dx !== ts * sense) {
          dx = dx < 0 ? dx + ts * state.w : dx - ts * state.w;
        }
        let dy = y1 - y0;
        if (dy !== 0 && dy !== ts * sense) {
          dy = dy < 0 ? dy + ts * state.h : dy - ts * state.h;
        }

        let c = animTime / ANIM_TIME;
        c = Math.max(0, Math.min(1, c));

        drawX = x0 + Math.round(c * dx);
        drawY = y0 + Math.round(c * dy);
        drawX2 = x1 - dx + Math.round(c * dx);
        drawY2 = y1 - dy + Math.round(c * dy);
      } else {
        drawX = coord(i % state.w, ts);
        drawY = coord(Math.floor(i / state.w), ts);
      }

      const tileBg = (drawX2 === -1 && tileCursor(i, state, curX, curY))
        ? COL_LOWLIGHT : bgcolour;
      drawTile(dr, ts, hw, drawX, drawY, t, tileBg);

      if (drawX2 !== -1 || drawY2 !== -1) {
        drawTile(dr, ts, hw, drawX2, drawY2, t, bgcolour);
      }
    }
    ds.tiles[i] = t0;
  }

  ds.curX = curX;
  ds.curY = curY;
  dr.unclip();
  ds.bgcolour = bgcolour;
}

function tileCursor(i: number, state: SixteenState, cx: number, cy: number): boolean {
  if (cx < 0 || cx >= state.w || cy < 0 || cy >= state.h) return false;
  return i === cy * state.w + cx;
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  hw: number,
  x: number,
  y: number,
  tile: number,
  bgColour: number,
): void {
  if (tile === 0) {
    dr.drawRect({ x, y, w: ts, h: ts }, bgColour);
  } else {
    // Lowlight triangle (bottom-right).
    dr.drawPolygon(
      [
        { x: x + ts - 1, y: y + ts - 1 },
        { x: x + ts - 1, y },
        { x, y: y + ts - 1 },
      ],
      COL_LOWLIGHT, COL_LOWLIGHT,
    );
    // Highlight triangle (top-left).
    dr.drawPolygon(
      [
        { x, y },
        { x, y: y + ts - 1 },
        { x: x + ts - 1, y },
      ],
      COL_HIGHLIGHT, COL_HIGHLIGHT,
    );
    // Centre fill.
    dr.drawRect(
      { x: x + hw, y: y + hw, w: ts - 2 * hw, h: ts - 2 * hw },
      bgColour,
    );
    // Number.
    dr.drawText(
      { x: x + ts / 2, y: y + ts / 2 },
      { align: "center", baseline: "mathematical", fontType: "variable", size: ts / 3 },
      COL_TEXT,
      String(tile),
    );
  }
  dr.drawUpdate({ x, y, w: ts, h: ts });
}

function drawArrow(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  xdx: number,
  xdy: number,
  cur: boolean,
): void {
  const ydy = -xdx;
  const ydx = xdy;

  const point = (xx: number, yy: number): Point => ({
    x: x + xx * xdx + yy * ydx,
    y: y + xx * xdy + yy * ydy,
  });

  const coords: Point[] = [
    point(ts / 2, 3 * ts / 4),     // top of arrow
    point(3 * ts / 4, ts / 2),     // right corner
    point(5 * ts / 8, ts / 2),     // right concave
    point(5 * ts / 8, ts / 4),     // bottom right
    point(3 * ts / 8, ts / 4),     // bottom left
    point(3 * ts / 8, ts / 2),     // left concave
    point(ts / 4, ts / 2),         // left corner
  ];

  dr.drawPolygon(
    coords,
    cur ? COL_HIGHLIGHT : COL_LOWLIGHT,
    COL_TEXT,
  );
}

function drawArrowForCursor(
  dr: GameDrawing,
  ts: number,
  ds: SixteenDrawState,
  curX: number,
  curY: number,
  cur: boolean,
): void {
  if (curX === -1 && curY === -1) return;
  if (curX === -1) {
    drawArrow(dr, ts, coord(0, ts), coord(curY + 1, ts), 0, -1, cur);
  } else if (curX === ds.w) {
    drawArrow(dr, ts, coord(ds.w, ts), coord(curY, ts), 0, 1, cur);
  } else if (curY === -1) {
    drawArrow(dr, ts, coord(curX, ts), coord(0, ts), 1, 0, cur);
  } else if (curY === ds.h) {
    drawArrow(dr, ts, coord(curX + 1, ts), coord(ds.h, ts), -1, 0, cur);
  } else return;

  dr.drawUpdate({ x: coord(curX, ts), y: coord(curY, ts), w: ts, h: ts });
}

function drawRecessedBorder(
  dr: GameDrawing,
  state: SixteenState,
  ts: number,
  hw: number,
): void {
  const w = state.w;
  const h = state.h;

  // Highlight border (outer).
  dr.drawPolygon(
    [
      { x: coord(w, ts) + hw - 1, y: coord(h, ts) + hw - 1 },
      { x: coord(w, ts) + hw - 1, y: coord(0, ts) - hw },
      { x: coord(w, ts) + hw - 1 - ts, y: coord(0, ts) - hw + ts },
      { x: coord(0, ts) - hw + ts, y: coord(h, ts) + hw - 1 - ts },
      { x: coord(0, ts) - hw, y: coord(h, ts) + hw - 1 },
    ],
    COL_HIGHLIGHT, COL_HIGHLIGHT,
  );

  // Lowlight border (inner).
  dr.drawPolygon(
    [
      { x: coord(0, ts) - hw, y: coord(0, ts) - hw },
      { x: coord(0, ts) - hw, y: coord(h, ts) + hw - 1 },
      { x: coord(0, ts) - hw + ts, y: coord(h, ts) + hw - 1 - ts },
      { x: coord(w, ts) + hw - 1 - ts, y: coord(0, ts) - hw + ts },
      { x: coord(w, ts) + hw - 1, y: coord(0, ts) - hw },
    ],
    COL_LOWLIGHT, COL_LOWLIGHT,
  );
}

// --- status bar -------------------------------------------------------

function statusbarText(state: SixteenState, _ui: SixteenUi): string {
  if (state.usedSolve) {
    return `Moves since auto-solve: ${state.moveCount - state.completed}`;
  }
  const prefix = state.completed ? "COMPLETED! " : "";
  const moves = state.completed || state.moveCount;
  let s = `${prefix}Moves: ${moves}`;
  if (state.moveTarget) s += ` (target ${state.moveTarget})`;
  return s;
}

// --- Game object ------------------------------------------------------

export const sixteenGame: Game<SixteenParams, SixteenState, SixteenMove, SixteenUi, SixteenDrawState> = {
  id: "sixteen",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status: (s) => s.completed > 0 ? "solved" : "ongoing",

  solve(_orig, _curr) {
    return { ok: true, move: { type: "solve" as const } };
  },

  textFormat,
  statusbarText,

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize: (ds, ts) => { ds.tilesize = ts; },
  newDrawState,
  redraw,

  animLength: () => ANIM_TIME,
  flashLength: (oldState, newState) => {
    if (!oldState.completed && newState.completed &&
        !oldState.usedSolve && !newState.usedSolve)
      return 2 * FLASH_FRAME;
    return 0;
  },
};

registerGame(sixteenGame);
