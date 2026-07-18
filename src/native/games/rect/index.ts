/**
 * Rectangles (`rect.c`) — native TS port. Divide a `w × h` grid into
 * rectangles so that every rectangle contains exactly one numbered square and
 * its area equals that number.
 *
 * Left-drag draws a rectangle outline; right-drag erases interior edges; a
 * click near an edge toggles that single edge; a half-grid keyboard cursor
 * supports press-to-drag. `coord_round`'s corner/centre/edge click allocation
 * is ported exactly. A drag or click that changes nothing produces no move
 * (local no-op suppression — no state-string undo).
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import type { Game, SolveResult, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { atof, dimensionParamConfig, formatG } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  isCursorMove,
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
import { newDesc } from "./generator.ts";
import {
  cloneRectState,
  executeMove,
  gridDrawRect,
  newState,
  status,
  textFormat,
} from "./moves.ts";
import {
  BORDER,
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
} from "./render.ts";
import { type NumberData, rectSolver, SOLVE_UNIQUE } from "./solver.ts";
import type { RectDrawState } from "./state.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  presets,
  type RectMistake,
  type RectMove,
  type RectParams,
  type RectState,
  type RectUi,
  validateDesc,
  validateParams,
} from "./state.ts";

const CORNER_TOLERANCE = 0.15;
const CENTRE_TOLERANCE = 0.15;

/** Map a fractional grid coordinate to the half-grid space (0..2w, 0..2h),
 * allocating the click to a corner, a cell centre, or an edge exactly as
 * upstream `coord_round`. `(int)` casts are `Math.trunc`; `floor()` is
 * `Math.floor`. */
function coordRound(x: number, y: number): [number, number] {
  const xs = Math.floor(x) + 0.5;
  const ys = Math.floor(y) + 0.5;
  const xv = Math.floor(x + 0.5);
  const yv = Math.floor(y + 0.5);

  let dx = Math.abs(x - xv);
  let dy = Math.abs(y - yv);
  if (Math.max(dx, dy) < CORNER_TOLERANCE) {
    return [2 * Math.trunc(xv), 2 * Math.trunc(yv)];
  }
  dx = Math.abs(x - xs);
  dy = Math.abs(y - ys);
  if (Math.max(dx, dy) < CENTRE_TOLERANCE) {
    return [1 + 2 * Math.trunc(xs), 1 + 2 * Math.trunc(ys)];
  }
  if (dx > dy) {
    // Vertical edge: x-coord of corner, y-coord of square centre.
    return [2 * Math.trunc(xv), 1 + 2 * Math.trunc(Math.floor(ys))];
  }
  // Horizontal edge: x-coord of square centre, y-coord of corner.
  return [1 + 2 * Math.trunc(Math.floor(xs)), 2 * Math.trunc(yv)];
}

const hrange = (w: number, h: number, x: number, y: number) =>
  x >= 0 && x < w && y >= 1 && y < h;
const vrange = (w: number, h: number, x: number, y: number) =>
  x >= 1 && x < w && y >= 0 && y < h;

function newUi(_state: RectState): RectUi {
  return {
    dragStartX: -1,
    dragStartY: -1,
    dragEndX: -1,
    dragEndY: -1,
    dragged: false,
    erasing: false,
    x1: -1,
    y1: -1,
    x2: -1,
    y2: -1,
    cursorX: 0,
    cursorY: 0,
    cursorVisible: false,
    cursorDragging: false,
  };
}

function resetUi(ui: RectUi): void {
  ui.dragStartX = -1;
  ui.dragStartY = -1;
  ui.dragEndX = -1;
  ui.dragEndY = -1;
  ui.x1 = -1;
  ui.y1 = -1;
  ui.x2 = -1;
  ui.y2 = -1;
  ui.dragged = false;
}

/** Upstream `move_cursor` (misc.c): clamp-move the cursor; a first press only
 * reveals it. Returns whether the UI changed. */
function moveCursor(ui: RectUi, button: number, w: number, h: number): boolean {
  let dx = 0;
  let dy = 0;
  if (button === 0x0209)
    dy = -1; // CURSOR_UP
  else if (button === 0x020a)
    dy = 1; // CURSOR_DOWN
  else if (button === 0x020c)
    dx = 1; // CURSOR_RIGHT
  else if (button === 0x020b) dx = -1; // CURSOR_LEFT
  const ox = ui.cursorX;
  const oy = ui.cursorY;
  ui.cursorX = Math.min(Math.max(ui.cursorX + dx, 0), w - 1);
  ui.cursorY = Math.min(Math.max(ui.cursorY + dy, 0), h - 1);
  if (!ui.cursorVisible) {
    ui.cursorVisible = true;
    return true;
  }
  return ui.cursorX !== ox || ui.cursorY !== oy;
}

function interpretMove(
  state: RectState,
  ui: RectUi,
  ds: RectDrawState | null,
  p: Point,
  rawButton: number,
): RectMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state;
  const tile = ds?.tileSize ?? PREFERRED_TILE_SIZE;
  const fromCoord = (px: number) => (px - BORDER) / tile;

  let [xc, yc] = coordRound(fromCoord(p.x), fromCoord(p.y));

  let startdrag = false;
  let enddrag = false;
  let active = false;
  let erasing = false;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    if (ui.dragStartX >= 0 && ui.cursorDragging) resetUi(ui);
    startdrag = true;
    ui.cursorVisible = false;
    ui.cursorDragging = false;
    active = true;
    erasing = button === RIGHT_BUTTON;
  } else if (button === LEFT_RELEASE || button === RIGHT_RELEASE) {
    if (ui.cursorVisible) {
      ui.cursorVisible = false;
      active = true;
    }
    enddrag = true;
    erasing = button === RIGHT_RELEASE;
  } else if (isCursorMove(button)) {
    const changed = moveCursor(ui, button, w, h);
    active = true;
    if (!ui.cursorDragging || !changed) return changed ? UI_UPDATE : null;
    [xc, yc] = coordRound(ui.cursorX + 0.5, ui.cursorY + 0.5);
  } else if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    // Ignore a keyboard drag start while a mouse drag is in progress.
    if (ui.dragStartX >= 0 && !ui.cursorDragging) return null;
    if (!ui.cursorVisible) {
      ui.cursorVisible = true;
      return UI_UPDATE;
    }
    [xc, yc] = coordRound(ui.cursorX + 0.5, ui.cursorY + 0.5);
    erasing = button === CURSOR_SELECT2;
    if (ui.cursorDragging) {
      ui.cursorDragging = false;
      enddrag = true;
      active = true;
    } else {
      ui.cursorDragging = true;
      startdrag = true;
      active = true;
    }
  } else if (button === 8 || button === 27) {
    // Backspace / Escape: cancel.
    if (!ui.cursorDragging) {
      ui.cursorVisible = false;
    } else {
      resetUi(ui);
      ui.cursorDragging = false;
    }
    return UI_UPDATE;
  } else if (button !== LEFT_DRAG && button !== RIGHT_DRAG) {
    return null;
  }

  if (startdrag && xc >= 0 && xc <= 2 * w && yc >= 0 && yc <= 2 * h) {
    ui.dragStartX = xc;
    ui.dragStartY = yc;
    ui.dragEndX = -1;
    ui.dragEndY = -1;
    ui.dragged = false;
    ui.erasing = erasing;
    active = true;
  }

  if (ui.dragStartX >= 0 && (xc !== ui.dragEndX || yc !== ui.dragEndY)) {
    if (ui.dragEndX !== -1 && ui.dragEndY !== -1) ui.dragged = true;
    ui.dragEndX = xc;
    ui.dragEndY = yc;
    active = true;

    if (xc >= 0 && xc <= 2 * w && yc >= 0 && yc <= 2 * h) {
      let x1 = ui.dragStartX;
      let x2 = ui.dragEndX;
      if (x2 < x1) [x1, x2] = [x2, x1];
      let y1 = ui.dragStartY;
      let y2 = ui.dragEndY;
      if (y2 < y1) [y1, y2] = [y2, y1];
      ui.x1 = Math.floor(x1 / 2); // rounds down
      ui.x2 = Math.floor((x2 + 1) / 2); // rounds up
      ui.y1 = Math.floor(y1 / 2);
      ui.y2 = Math.floor((y2 + 1) / 2);
    } else {
      ui.x1 = ui.y1 = ui.x2 = ui.y2 = -1;
    }
  }

  let ret: RectMove | null = null;

  if (enddrag && ui.dragStartX >= 0) {
    if (xc >= 0 && xc <= 2 * w && yc >= 0 && yc <= 2 * h && erasing === ui.erasing) {
      if (ui.dragged) {
        // Only emit if the rectangle would actually change something.
        if (
          gridDrawRect(
            w,
            h,
            state.hedge,
            state.vedge,
            1,
            false,
            !ui.erasing,
            ui.x1,
            ui.y1,
            ui.x2,
            ui.y2,
          )
        ) {
          ret = {
            type: "rect",
            erasing: ui.erasing,
            x: ui.x1,
            y: ui.y1,
            w: ui.x2 - ui.x1,
            h: ui.y2 - ui.y1,
          };
        }
      } else {
        const cx = Math.floor(xc / 2);
        const cy = Math.floor(yc / 2);
        if (xc & 1 && !(yc & 1) && hrange(w, h, cx, cy)) {
          ret = { type: "edge", edge: "h", x: cx, y: cy };
        }
        if (yc & 1 && !(xc & 1) && vrange(w, h, cx, cy)) {
          ret = { type: "edge", edge: "v", x: cx, y: cy };
        }
      }
    }
    resetUi(ui);
    active = true;
  }

  if (ret) return ret;
  if (active) return UI_UPDATE;
  return null;
}

/** Parse a generator `aux` (`"S" + vbits + hbits`) into a solve move. */
function auxToMove(w: number, h: number, aux: string): RectMove {
  const vlen = (w - 1) * h;
  return {
    type: "solve",
    vedge: aux.slice(1, 1 + vlen),
    hedge: aux.slice(1 + vlen),
  };
}

function solve(orig: RectState, _curr: RectState, aux?: string): SolveResult<RectMove> {
  const { w, h } = orig;
  if (aux) return { ok: true, move: auxToMove(w, h, aux) };

  // Run the built-in solver from the fixed numbers.
  const nd: NumberData[] = [];
  for (let i = 0; i < w * h; i++) {
    if (orig.grid[i])
      nd.push({
        area: orig.grid[i],
        npoints: 1,
        points: [{ x: i % w, y: Math.floor(i / w) }],
      });
  }
  const hedge = new Uint8Array(w * h);
  const vedge = new Uint8Array(w * h);
  rectSolver(w, h, nd, hedge, vedge, null);

  let vbits = "";
  for (let y = 0; y < h; y++)
    for (let x = 1; x < w; x++) vbits += vedge[y * w + x] ? "1" : "0";
  let hbits = "";
  for (let y = 1; y < h; y++)
    for (let x = 0; x < w; x++) hbits += hedge[y * w + x] ? "1" : "0";
  return { ok: true, move: { type: "solve", vedge: vbits, hedge: hbits } };
}

/** Boards are uniquely solvable: re-solve from the numbers and flag every edge
 * the player has drawn that the unique solution does not contain (design D4). */
function findMistakes(state: RectState): readonly RectMistake[] {
  const { w, h } = state;
  const nd: NumberData[] = [];
  for (let i = 0; i < w * h; i++) {
    if (state.grid[i])
      nd.push({
        area: state.grid[i],
        npoints: 1,
        points: [{ x: i % w, y: Math.floor(i / w) }],
      });
  }
  const hedge = new Uint8Array(w * h);
  const vedge = new Uint8Array(w * h);
  if (rectSolver(w, h, nd, hedge, vedge, null) !== SOLVE_UNIQUE) return [];

  const out: RectMistake[] = [];
  for (let y = 1; y < h; y++)
    for (let x = 0; x < w; x++)
      if (state.hedge[y * w + x] && !hedge[y * w + x]) out.push({ edge: "h", x, y });
  for (let y = 0; y < h; y++)
    for (let x = 1; x < w; x++)
      if (state.vedge[y * w + x] && !vedge[y * w + x]) out.push({ edge: "v", x, y });
  return out;
}

function flashLength(
  oldState: RectState,
  newState_: RectState,
  _dir: number,
  _ui: RectUi,
): number {
  return !oldState.completed &&
    newState_.completed &&
    !oldState.cheated &&
    !newState_.cheated
    ? FLASH_TIME
    : 0;
}

function statusbarText(s: RectState, ui: RectUi): string {
  let text = "";
  if (ui.dragged && ui.x1 >= 0 && ui.y1 >= 0 && ui.x2 >= 0 && ui.y2 >= 0) {
    text = `${ui.x2 - ui.x1}x${ui.y2 - ui.y1} `;
  }
  if (s.cheated) text += "Auto-solved.";
  else if (s.completed) text += "COMPLETED!";
  return text;
}

export const rectGame: Game<
  RectParams,
  RectState,
  RectMove,
  RectUi,
  RectDrawState,
  RectMistake
> = {
  id: "rect",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    ...dimensionParamConfig<RectParams>(),
    {
      kw: "expansion-factor",
      name: "Expansion factor",
      type: "string",
      get: (p) => formatG(p.expandfactor),
      set: (p, v) => {
        p.expandfactor = Math.fround(atof(v));
      },
    },
    {
      kw: "ensure-unique-solution",
      name: "Ensure unique solution",
      type: "boolean",
      get: (p) => p.unique,
      set: (p, v) => {
        p.unique = v;
      },
    },
  ],
  describeParams: (p) => ({
    width: String(p.w),
    height: String(p.h),
    "expansion-factor": p.expandfactor,
    "ensure-unique-solution": p.unique,
  }),

  newDesc: (p: RectParams, rng: RandomState) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,

  textFormat,
  statusbarText,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: RectParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tileSize = ts;
  },
  newDrawState,
  redraw,

  flashLength,
};

registerGame(rectGame);

// cloneRectState is re-exported for tests.
export { cloneRectState };
