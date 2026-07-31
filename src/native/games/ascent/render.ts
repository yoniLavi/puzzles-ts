/**
 * Ascent rendering — imperative `redraw` (upstream `game_redraw`).
 *
 * Display geometry is not byte-parity scope (playbook §3.3): the goal is
 * to match the look with clean code. The per-tile diff cache mirrors
 * upstream's `ds` arrays, with the keyboard cursor folded into the cell
 * repaint instead of a blitter (playbook §3.2). Moves are instant
 * (`animLength = 0`); the only motion is the completion flash.
 */

import type { Colour, Point } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import { BLUE, YELLOW_WASH } from "../../engine/colours.ts";
import { drawRectCorners } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { CURSOR, ERROR, INK, playerEntryColour } from "../../engine/palette.ts";
import {
  type AscentMistake,
  type AscentState,
  FLAG_COMPLETE,
  FLAG_ERROR,
  FLAG_USER,
  findDirection,
  fromNumberEdge,
  isEdgeValid,
  isHexagonal,
  isNear,
  isNumberEdge,
  MODE_EDGES,
  MODE_HONEYCOMB,
  movementForMode,
  NUMBER_BOUND,
  NUMBER_CLEAR,
  NUMBER_EMPTY,
  NUMBER_FLAG_MASK,
  NUMBER_FLAG_MOVE,
  NUMBER_MOVE,
  NUMBER_WALL,
  numberEdge,
} from "./state.ts";
import {
  type AscentUi,
  CSHOW_KEYBOARD,
  CSHOW_MOUSE,
  TARGET_SHOW,
  validatePathMove,
} from "./ui.ts";

// --- palette (upstream enum order) ---------------------------------

export const COL_MIDLIGHT = 0;
export const COL_LOWLIGHT = 1;
export const COL_HIGHLIGHT = 2;
export const COL_BORDER = 3;
export const COL_LINE = 4;
export const COL_IMMUTABLE = 5;
export const COL_ERROR = 6;
export const COL_CURSOR = 7;
export const COL_ARROW = 8;
export const NCOLOURS = 9;

const FLASH_FRAME = 0.03;
const FLASH_SIZE = 4;
const ERROR_MARGIN = 0.1;

export interface AscentDrawState {
  started: boolean;
  tileSize: number;
  /** Physical grid dimensions and mode (from the state). */
  w: number;
  h: number;
  mode: number;
  /** User-facing dimensions (for `computeSize`). */
  userW: number;
  userH: number;
  offsetX: number;
  offsetY: number;
  thickness: number;
  pxW: number;
  pxH: number;

  /** Committed per-cell caches (mirroring upstream `ds`). */
  colours: Int32Array;
  oldnum: Int32Array;
  oldpath: Int32Array;
  path: Int32Array;
  prevhints: Int32Array;
  nexthints: Int32Array;
  oldpositions: Int32Array;
  oldmistake: Uint8Array;
  oldcursor: number;
}

/** User-facing dimensions from a physical grid + mode (inverse of
 * `ascentGridSize`). */
function userDims(
  w: number,
  h: number,
  mode: number,
): { userW: number; userH: number } {
  if (mode === MODE_EDGES) return { userW: w - 2, userH: h - 2 };
  if (mode === MODE_HONEYCOMB)
    return { userW: w - (Math.trunc((h + 1) / 2) - 1), userH: h };
  return { userW: w, userH: h };
}

export function newAscentDrawState(state: AscentState): AscentDrawState {
  const s = state.w * state.h;
  const { userW, userH } = userDims(state.w, state.h, state.mode);
  return {
    started: false,
    tileSize: 0,
    w: state.w,
    h: state.h,
    mode: state.mode,
    userW,
    userH,
    offsetX: 0,
    offsetY: 0,
    thickness: 2,
    pxW: 0,
    pxH: 0,
    colours: new Int32Array(s).fill(-1),
    oldnum: new Int32Array(s).fill(-0x7fff),
    oldpath: new Int32Array(s).fill(-1),
    path: new Int32Array(s),
    prevhints: new Int32Array(s).fill(-0x7fff),
    nexthints: new Int32Array(s).fill(-0x7fff),
    oldpositions: new Int32Array(s).fill(-3),
    oldmistake: new Uint8Array(s),
    oldcursor: -1,
  };
}

// --- sizing --------------------------------------------------------

// --- hexagonal geometry (deliberate divergence — see design F7) -----
//
// Hexagon/Honeycomb are drawn as *actual* pointy-top hexagons rather than
// upstream's offset squares. The mechanics are already hexagonal (the
// movement table gives 6 neighbours), so this is faithful to the rules and a
// clearer picture. With circumradius R = ts/√3 and row pitch ts·√3/2, the
// horizontal layout is identical to the square version (so `computeOffsets`
// and the width are unchanged) and the six movement directions land exactly
// on the six hexagon neighbours; only the vertical pitch, the cell outline
// and pixel→cell hit-testing differ.

/** Hexagon circumradius (centre → vertex) for a given tile width. */
export function hexR(tileSize: number): number {
  return tileSize / Math.sqrt(3);
}
/** Vertical distance between adjacent hex rows. */
export function hexVpitch(tileSize: number): number {
  return (tileSize * Math.sqrt(3)) / 2;
}
/** Total pixel height of `h` hex rows (top vertex at y = 0). */
function hexPixelHeight(h: number, tileSize: number): number {
  return 2 * hexR(tileSize) + (h - 1) * hexVpitch(tileSize);
}

/** Upstream `game_compute_size` under `NARROW_BORDERS` (BORDER = 0), with
 * the hexagonal modes sized for real hexagons (design F7). */
export function ascentComputeSize(
  w: number,
  h: number,
  mode: number,
  tileSize: number,
): { w: number; h: number } {
  let x = w * tileSize;
  let y = h * tileSize;
  if (mode === MODE_HONEYCOMB) x += Math.trunc(tileSize / 2);
  else if (mode === MODE_EDGES) {
    x += tileSize * 2;
    y += tileSize * 2;
  }
  if (isHexagonal(mode)) y = Math.ceil(hexPixelHeight(h, tileSize));
  x += 1;
  y += 1;
  return { w: x, h: y };
}

/** Centre of cell `i` in pixel space, branching on grid mode. */
function cellCentre(
  i: number,
  w: number,
  mode: number,
  tileSize: number,
  offsetX: number,
  offsetY: number,
): { cx: number; cy: number } {
  const col = i % w;
  const row = Math.trunc(i / w);
  if (isHexagonal(mode)) {
    return {
      cx: offsetX + col * tileSize + row * (tileSize / 2) + tileSize / 2,
      cy: offsetY + hexR(tileSize) + row * hexVpitch(tileSize),
    };
  }
  return {
    cx: offsetX + col * tileSize + tileSize / 2,
    cy: offsetY + row * tileSize + tileSize / 2,
  };
}

/** The six pointy-top hexagon vertices around a centre. */
function hexVertices(cx: number, cy: number, tileSize: number): Point[] {
  const r = hexR(tileSize);
  const hw = tileSize / 2; // R·√3/2
  const hr = r / 2;
  return [
    { x: cx, y: cy - r },
    { x: cx + hw, y: cy - hr },
    { x: cx + hw, y: cy + hr },
    { x: cx, y: cy + r },
    { x: cx - hw, y: cy + hr },
    { x: cx - hw, y: cy - hr },
  ];
}

/** Upstream `game_set_offsets` under `NARROW_BORDERS` (BORDER = 0). */
function computeOffsets(
  h: number,
  mode: number,
  tileSize: number,
): { offsetX: number; offsetY: number } {
  let offsetX = 0;
  const offsetY = 0;
  if (mode === MODE_HONEYCOMB) {
    offsetX -= (Math.trunc(h / 2) - 1) * tileSize;
    if (h & 1) offsetX -= tileSize;
  } else if (mode !== MODE_EDGES && isHexagonal(mode)) {
    offsetX -= Math.trunc(((h - 1) * tileSize) / 4);
  }
  return { offsetX, offsetY };
}

export function setAscentTileSize(ds: AscentDrawState, tileSize: number): void {
  ds.tileSize = tileSize;
  ds.thickness = Math.max(2, tileSize / 7);
  const { offsetX, offsetY } = computeOffsets(ds.h, ds.mode, tileSize);
  ds.offsetX = offsetX;
  ds.offsetY = offsetY;
  const size = ascentComputeSize(ds.userW, ds.userH, ds.mode, tileSize);
  ds.pxW = size.w;
  ds.pxH = size.h;
}

// --- colours -------------------------------------------------------

export function ascentColours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const ret: Colour[] = new Array(NCOLOURS);
  ret[COL_MIDLIGHT] = background;
  ret[COL_HIGHLIGHT] = highlight;
  ret[COL_LOWLIGHT] = lowlight;
  ret[COL_BORDER] = INK;
  ret[COL_LINE] = playerEntryColour(background);
  ret[COL_IMMUTABLE] = BLUE;
  ret[COL_ERROR] = ERROR;
  ret[COL_CURSOR] = CURSOR;
  ret[COL_ARROW] = YELLOW_WASH;
  return ret;
}

// --- drawing primitives --------------------------------------------

function thickLine(
  dr: GameDrawing,
  thickness: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colour: number,
): void {
  dr.drawLine(
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    colour,
    Math.max(1, Math.round(thickness)),
  );
}

const HORIZONTAL_ARROW = [0.45, 0, 0.35, 0.45, -0.45, 0.45, -0.45, -0.45, 0.35, -0.45];
const DIAGONAL_ARROW = [-0.45, 0.3, -0.45, -0.45, 0.3, -0.45, 0.45, 0.45];

function drawArrow(
  dr: GameDrawing,
  i: number,
  w: number,
  h: number,
  tx: number,
  ty: number,
  fill: number,
  border: number,
  tileSize: number,
): void {
  const col = i % w;
  const row = Math.trunc(i / w);
  const pts: Point[] = [];

  if (row > 0 && row < h - 1) {
    const hdir = col ? -1 : +1;
    for (let k = 0; k < 10; k += 2)
      pts.push({
        x: HORIZONTAL_ARROW[k] * tileSize * hdir + 1 + tx,
        y: HORIZONTAL_ARROW[k + 1] * tileSize + 1 + ty,
      });
  } else if (col > 0 && col < w - 1) {
    const vdir = i > w ? -1 : +1;
    for (let k = 0; k < 10; k += 2)
      pts.push({
        x: HORIZONTAL_ARROW[k + 1] * tileSize + 1 + tx,
        y: HORIZONTAL_ARROW[k] * tileSize * vdir + 1 + ty,
      });
  } else {
    const hdir = col ? -1 : +1;
    const vdir = i > w ? -1 : +1;
    for (let k = 0; k < 8; k += 2)
      pts.push({
        x: DIAGONAL_ARROW[k] * tileSize * hdir + 1 + tx,
        y: DIAGONAL_ARROW[k + 1] * tileSize * vdir + 1 + ty,
      });
  }

  dr.drawPolygon(pts, fill, border);
}

/** The number/symbol to show at cell `i` (upstream `ascent_display_number`). */
function displayNumber(i: number, ui: AscentUi, state: AscentState): number {
  let n = state.grid[i];
  const w = state.w;
  const h = state.h;
  const movement = movementForMode(state.mode);

  if (n === NUMBER_BOUND || n === NUMBER_WALL) return n;

  if (ui.typingCell === i) return ui.typingNumber - 1;

  if (!isNumberEdge(ui.select) && ui.held >= 0 && validatePathMove(i, state, ui)) {
    if (n === NUMBER_EMPTY)
      n =
        ui.select >= 0 && ui.positions[ui.select] === -1
          ? ui.select
          : ui.cshow === CSHOW_KEYBOARD
            ? NUMBER_MOVE
            : NUMBER_EMPTY;
    else if (ui.cshow === CSHOW_KEYBOARD) n |= NUMBER_FLAG_MOVE;
  }

  if (
    n !== NUMBER_MOVE &&
    ui.nexthints[i] !== NUMBER_EMPTY &&
    ui.nexthints[i] !== n &&
    ui.prevhints[i] !== n
  )
    n = NUMBER_EMPTY;

  if (n === NUMBER_EMPTY && isNumberEdge(ui.select) && isEdgeValid(ui.held, i, w, h))
    n = numberEdge(ui.select);

  if (state.path && state.path[i] & (1 << findDirection(i, ui.held, w, movement))) {
    if (n === NUMBER_MOVE) n = ui.cy * w + ui.cx === i ? NUMBER_CLEAR : NUMBER_EMPTY;
    else if (n >= 0 && n & NUMBER_FLAG_MOVE && ui.cy * w + ui.cx === i)
      n = NUMBER_CLEAR;
    else if (n >= 0) n &= ~NUMBER_FLAG_MOVE;
  }

  return n;
}

// --- redraw --------------------------------------------------------

export function redrawAscent(
  dr: GameDrawing,
  ds: AscentDrawState | null,
  _prev: AscentState | null,
  state: AscentState,
  _dir: number,
  ui: AscentUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly AscentMistake[],
): void {
  if (!ds) return;
  const w = state.w;
  const h = state.h;
  const tilesize = ds.tileSize;
  const positions = ui.positions;
  const movement = movementForMode(state.mode);
  const margin = tilesize * ERROR_MARGIN;

  const flash = flashTime > 0 ? Math.trunc(flashTime / FLASH_FRAME) : -2;

  const mistakeSet = new Uint8Array(w * h);
  if (mistakes) for (const m of mistakes) mistakeSet[m.cell] = 1;

  if (!ds.started) {
    dr.drawRect({ x: 0, y: 0, w: ds.pxW, h: ds.pxH }, COL_MIDLIGHT);
    dr.drawUpdate({ x: 0, y: 0, w: ds.pxW, h: ds.pxH });
    ds.started = true;
    ds.colours.fill(-1);
    ds.oldpath.fill(-1);
  }

  /* Build the render path for every cell. */
  for (let i = 0; i < w * h; i++) {
    let pathline = state.path ? state.path[i] : 0;
    let lines = 0;
    const n = state.grid[i];

    if (n > 0 && positions[n] !== -2 && positions[n - 1] >= 0) {
      const i2 = positions[n - 1];
      if (isNear(i, i2, w, state.mode))
        pathline |= 1 << findDirection(i, i2, w, movement);
      else pathline |= FLAG_ERROR;
      lines++;
    }
    if (n >= 0 && n < state.last && positions[n] !== -2 && positions[n + 1] >= 0) {
      const i2 = positions[n + 1];
      if (isNear(i, i2, w, state.mode))
        pathline |= 1 << findDirection(i, i2, w, movement);
      else pathline |= FLAG_ERROR;
      lines++;
    }
    if (n === 0 || n === state.last) lines++;
    if (lines === 2) pathline |= FLAG_COMPLETE;
    if (state.path && state.path[i] & ~FLAG_COMPLETE) pathline |= FLAG_USER;

    ds.path[i] = pathline;
  }

  /* Deliberate divergence: preview the connecting line for a *typed* number
   * (keyboard entry) before it is committed with Enter, so the link shows
   * immediately. Add reciprocal segments between the preview cell and each
   * placed consecutive neighbour it is genuinely adjacent to — only when
   * adjacent, so a real cell never flashes an error because of a preview. */
  const typingN = ui.typingCell >= 0 && ui.typingNumber > 0 ? ui.typingNumber - 1 : -1;
  if (typingN >= 0 && typingN <= state.last && positions[typingN] < 0) {
    const pc = ui.typingCell;
    for (const nb of [typingN - 1, typingN + 1]) {
      if (nb < 0 || nb > state.last) continue;
      const j = positions[nb];
      if (j < 0 || !isNear(pc, j, w, state.mode)) continue;
      ds.path[pc] |= 1 << findDirection(pc, j, w, movement);
      ds.path[j] |= 1 << findDirection(j, pc, w, movement);
    }
  }

  const oldNextTarget = ui.nextTargetMode & TARGET_SHOW ? ui.nextTarget : NUMBER_EMPTY;
  const oldPrevTarget = ui.prevTargetMode & TARGET_SHOW ? ui.prevTarget : NUMBER_EMPTY;
  const cursorCell = ui.cshow === CSHOW_KEYBOARD ? ui.cy * w + ui.cx : -1;

  /* Invalidate cells whose contents/path/hints/overlays changed. */
  for (let i = 0; i < w * h; i++) {
    let dirty = false;
    const n = displayNumber(i, ui, state);

    if (ds.oldnum[i] !== n) {
      dirty = true;
      ds.oldnum[i] = n;
    }
    if (ds.oldpath[i] !== ds.path[i]) {
      dirty = true;
      for (let i2 = Math.max(0, i - (w + 1)); i2 < w * h && i2 < i + w + 1; i2++) {
        if (isNear(i, i2, w, state.mode)) ds.colours[i2] = -1;
      }
      ds.oldpath[i] = ds.path[i];
    }
    if (
      isNumberEdge(n) &&
      positions[fromNumberEdge(n)] !== ds.oldpositions[fromNumberEdge(n)]
    )
      dirty = true;
    if (ds.prevhints[i] !== ui.prevhints[i] || ds.nexthints[i] !== ui.nexthints[i]) {
      ds.prevhints[i] = ui.prevhints[i];
      ds.nexthints[i] = ui.nexthints[i];
      dirty = true;
    }
    if (ds.oldmistake[i] !== mistakeSet[i]) {
      ds.oldmistake[i] = mistakeSet[i];
      dirty = true;
    }
    if ((cursorCell === i) !== (ds.oldcursor === i)) dirty = true;

    if (dirty) ds.colours[i] = -1;
  }
  ds.oldcursor = cursorCell;

  for (let n = 0; n <= state.last; n++) {
    if (ds.oldpositions[n] !== positions[n]) {
      if (ds.oldpositions[n] >= 0) ds.colours[ds.oldpositions[n]] = -1;
      if (positions[n] >= 0) ds.colours[positions[n]] = -1;
      ds.oldpositions[n] = positions[n];
    }
  }

  /* Draw cells (hexagons for the hexagonal modes, squares otherwise). */
  const hex = isHexagonal(state.mode);
  const r = hexR(tilesize);
  for (let i = 0; i < w * h; i++) {
    const { cx, cy } = cellCentre(i, w, state.mode, tilesize, ds.offsetX, ds.offsetY);
    const tx1 = Math.round(cx);
    const ty1 = Math.round(cy);
    /* Top-left of a tile-sized box centred on the cell — used for the
     * square outline (non-hex) and for centred decorations. */
    const tx = Math.round(cx - tilesize / 2);
    const ty = Math.round(cy - tilesize / 2);
    let sn = state.grid[i];

    if (sn === NUMBER_BOUND) continue;

    const colour =
      sn === NUMBER_WALL
        ? COL_BORDER
        : flash >= sn && flash <= sn + FLASH_SIZE
          ? COL_LOWLIGHT
          : ui.dragx === i % w || ui.dragy === Math.trunc(i / w)
            ? COL_HIGHLIGHT
            : ui.held === i ||
                ui.typingCell === i ||
                (ui.cshow === CSHOW_MOUSE && ui.cy * w + ui.cx === i)
              ? COL_LOWLIGHT
              : oldNextTarget >= 0 && positions[oldNextTarget] === i
                ? COL_HIGHLIGHT
                : oldPrevTarget >= 0 && positions[oldPrevTarget] === i
                  ? COL_HIGHLIGHT
                  : COL_MIDLIGHT;

    if (ds.colours[i] === colour) continue;

    const fn = displayNumber(i, ui, state);
    sn = fn < 0 ? fn : fn & ~NUMBER_FLAG_MASK;

    const fillColour = isNumberEdge(sn) ? COL_MIDLIGHT : colour;
    if (hex) {
      /* Clip to the hexagon's bounding box (for drawUpdate); fill only the
       * hexagon itself so interlocking neighbours aren't erased. */
      const clip = {
        x: tx1 - Math.ceil(tilesize / 2) - 1,
        y: ty1 - Math.ceil(r) - 1,
        w: tilesize + 2,
        h: Math.ceil(2 * r) + 2,
      };
      dr.clip(clip);
      dr.drawUpdate(clip);
      const verts = hexVertices(cx, cy, tilesize);
      dr.drawPolygon(verts, fillColour, fillColour);
    } else {
      dr.clip({ x: tx, y: ty, w: tilesize + 1, h: tilesize + 1 });
      dr.drawUpdate({ x: tx, y: ty, w: tilesize + 1, h: tilesize + 1 });
      dr.drawRect(
        { x: tx + 1, y: ty + 1, w: tilesize - 1, h: tilesize - 1 },
        fillColour,
      );
    }
    ds.colours[i] = colour;

    if (ui.typingCell !== i) {
      const linecolour = ds.path[i] & FLAG_USER ? COL_LINE : COL_HIGHLIGHT;

      if (!isHexagonal(state.mode)) {
        for (let dy = -1; dy <= 1; dy += 2) {
          const i2 = i + w * dy;
          if (i2 < 0 || i2 >= w * h) continue;
          const tx2 = (i2 % w) * tilesize + ds.offsetX + Math.trunc(tilesize / 2);
          const ty2 =
            Math.trunc(i2 / w) * tilesize + ds.offsetY + Math.trunc(tilesize / 2);
          for (let dir = 0; dir < movement.dircount; dir++) {
            if (!movement.dirs[dir].dy || !movement.dirs[dir].dx) continue;
            if (ds.path[i2] & (1 << dir))
              thickLine(
                dr,
                ds.thickness,
                tx2 + movement.dirs[dir].dx * tilesize,
                ty2 + movement.dirs[dir].dy * tilesize,
                tx2,
                ty2,
                ds.path[i2] & FLAG_USER ? COL_LINE : COL_HIGHLIGHT,
              );
          }
        }
      }

      /* Circle on the beginning/end of the path. */
      if (
        (sn === 0 || sn === state.last) &&
        (state.immutable[i] || positions[sn] !== -2)
      ) {
        if (fn & NUMBER_FLAG_MOVE) {
          dr.drawCircle({ x: tx1, y: ty1 }, tilesize * 0.4, COL_LOWLIGHT, COL_LOWLIGHT);
          dr.drawCircle(
            { x: tx1, y: ty1 },
            tilesize * 0.3,
            COL_HIGHLIGHT,
            COL_HIGHLIGHT,
          );
        } else {
          dr.drawCircle(
            { x: tx1, y: ty1 },
            Math.trunc(tilesize / 3),
            COL_HIGHLIGHT,
            COL_HIGHLIGHT,
          );
        }
      } else if (ds.path[i] & ~FLAG_COMPLETE) {
        dr.drawCircle(
          { x: tx1, y: ty1 },
          Math.trunc(ds.thickness / 2),
          linecolour,
          linecolour,
        );
      }

      /* Path lines to neighbours. In hex modes draw to the shared-edge
       * midpoint (= the midpoint of the two centres) so the line stays inside
       * this cell; the neighbour draws its own half. Square modes draw the
       * full segment and rely on the tile clip. */
      for (let dir = 0; dir < movement.dircount; dir++) {
        if (!(ds.path[i] & (1 << dir))) continue;
        const i2 = i + w * movement.dirs[dir].dy + movement.dirs[dir].dx;
        const nc = cellCentre(i2, w, state.mode, tilesize, ds.offsetX, ds.offsetY);
        const ex = hex ? (cx + nc.cx) / 2 : nc.cx;
        const ey = hex ? (cy + nc.cy) / 2 : nc.cy;
        thickLine(dr, ds.thickness, tx1, ty1, ex, ey, linecolour);
      }
    } else if (i === ui.typingCell) {
      /* The typing cell skips the block above (it shows the typed number on a
       * clean background), but still draws its half of any preview connecting
       * line so the link is visible while typing. */
      for (let dir = 0; dir < movement.dircount; dir++) {
        if (!(ds.path[i] & (1 << dir))) continue;
        const i2 = i + w * movement.dirs[dir].dy + movement.dirs[dir].dx;
        const nc = cellCentre(i2, w, state.mode, tilesize, ds.offsetX, ds.offsetY);
        const ex = hex ? (cx + nc.cx) / 2 : nc.cx;
        const ey = hex ? (cy + nc.cy) / 2 : nc.cy;
        thickLine(dr, ds.thickness, tx1, ty1, ex, ey, COL_HIGHLIGHT);
      }
    }

    /* Cell border. */
    if (!isNumberEdge(sn)) {
      if (hex) {
        dr.drawPolygon(hexVertices(cx, cy, tilesize), -1, COL_BORDER);
      } else {
        dr.drawPolygon(
          [
            { x: tx, y: ty },
            { x: tx + tilesize, y: ty },
            { x: tx + tilesize, y: ty + tilesize },
            { x: tx, y: ty + tilesize },
          ],
          -1,
          COL_BORDER,
        );
      }
    }

    /* Light circle on possible endpoints. */
    if (state.grid[i] === NUMBER_EMPTY && (sn === 0 || sn === state.last)) {
      dr.drawCircle({ x: tx1, y: ty1 }, Math.trunc(tilesize / 3), colour, COL_LOWLIGHT);
    }

    /* Background circle over lines so numbers stay readable. */
    if (sn > 0 && sn < state.last && state.path && state.path[i] & ~FLAG_COMPLETE) {
      dr.drawCircle({ x: tx1, y: ty1 }, Math.trunc(tilesize / 3), colour, colour);
      if (fn > 0 && fn & NUMBER_FLAG_MOVE)
        dr.drawCircle({ x: tx1, y: ty1 }, tilesize * 0.22, COL_LOWLIGHT, COL_LOWLIGHT);
    } else if (sn > 0 && sn < state.last && fn & NUMBER_FLAG_MOVE) {
      dr.drawCircle({ x: tx1, y: ty1 }, tilesize * 0.28, COL_LOWLIGHT, COL_LOWLIGHT);
    } else if (sn === NUMBER_MOVE) {
      dr.drawCircle({ x: tx1, y: ty1 }, tilesize * 0.22, COL_LOWLIGHT, COL_LOWLIGHT);
    }

    if (sn === NUMBER_CLEAR) {
      const shape = Math.trunc(tilesize / 4);
      thickLine(
        dr,
        tilesize / 7,
        tx + shape,
        ty + shape,
        tx + tilesize - shape,
        ty + tilesize - shape,
        COL_LOWLIGHT,
      );
      thickLine(
        dr,
        tilesize / 7,
        tx + tilesize - shape,
        ty + shape,
        tx + shape,
        ty + tilesize - shape,
        COL_LOWLIGHT,
      );
    }

    /* Draw the number / edge arrow / candidate hints. */
    if (sn >= 0) {
      dr.drawText(
        { x: tx1, y: ty1 },
        {
          align: "center",
          baseline: "mathematical",
          fontType: "variable",
          size: Math.trunc(tilesize / 2),
        },
        state.immutable[i]
          ? COL_IMMUTABLE
          : state.grid[i] === NUMBER_EMPTY && ui.typingCell !== i
            ? COL_LOWLIGHT
            : sn <= state.last && positions[sn] === -2 && ui.typingCell !== i
              ? COL_ERROR
              : COL_BORDER,
        String(sn + 1),
      );
      if (ds.path[i] & FLAG_ERROR)
        thickLine(
          dr,
          2,
          tx + margin,
          ty + margin,
          tx + tilesize - margin,
          ty + tilesize - margin,
          COL_ERROR,
        );
    } else if (isNumberEdge(sn)) {
      const i2 = positions[fromNumberEdge(sn)];
      const error = i2 >= 0 && !isEdgeValid(i, i2, w, h);
      drawArrow(dr, i, w, h, tx1, ty1, COL_ARROW, COL_BORDER, tilesize);
      dr.drawText(
        { x: tx1, y: ty1 },
        {
          align: "center",
          baseline: "mathematical",
          fontType: "variable",
          size: Math.trunc(tilesize / 2),
        },
        error ? COL_ERROR : i2 >= 0 ? COL_LOWLIGHT : COL_BORDER,
        String(fromNumberEdge(sn) + 1),
      );
    } else if (sn !== NUMBER_CLEAR) {
      if (ui.prevhints[i] >= 0)
        dr.drawText(
          { x: tx1 - Math.trunc(tilesize / 4), y: ty1 - Math.trunc(tilesize / 4) },
          {
            align: "center",
            baseline: "mathematical",
            fontType: "variable",
            size: Math.trunc(tilesize / 3),
          },
          COL_BORDER,
          String(ui.prevhints[i] + 1),
        );
      if (ui.nexthints[i] >= 0)
        dr.drawText(
          { x: tx1 + Math.trunc(tilesize / 4), y: ty1 + Math.trunc(tilesize / 4) },
          {
            align: "center",
            baseline: "mathematical",
            fontType: "variable",
            size: Math.trunc(tilesize / 3),
          },
          COL_BORDER,
          String(ui.nexthints[i] + 1),
        );
    }

    /* findMistakes overlay: an inset red outline. */
    if (mistakeSet[i]) {
      const m = Math.trunc(tilesize * 0.12);
      dr.drawPolygon(
        [
          { x: tx + m, y: ty + m },
          { x: tx + tilesize - m, y: ty + m },
          { x: tx + tilesize - m, y: ty + tilesize - m },
          { x: tx + m, y: ty + tilesize - m },
        ],
        -1,
        COL_ERROR,
      );
    }

    /* Keyboard cursor, folded into this cell's repaint (no blitter). */
    if (cursorCell === i) {
      const blr = Math.trunc(tilesize * 0.4);
      drawRectCorners(dr, tx1, ty1, blr - 1, COL_CURSOR);
    }

    dr.unclip();
  }
}
