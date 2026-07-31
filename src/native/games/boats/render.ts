/**
 * Boats rendering — port of `game_redraw` from `unreleased/boats.c`.
 *
 * The canvas is the `w × h` board, a right column and a bottom row for the
 * occupancy numbers, and — below a half-tile gutter — the **fleet display**: a
 * list of every boat to be found, drawn as segments and struck through once the
 * player has completed one of that size.
 *
 * Each cell paints its own background (water blue for anything decided, the
 * host background for an undecided square), a grid outline, and the boat
 * segment as a circle, a rectangle, or both — the six segment shapes are all
 * the same two primitives clipped differently, so there is one `drawSegment`
 * for the board and the fleet list alike.
 *
 * **Two error layers, deliberately** (design D5):
 *  - the *live* rule violations upstream already draws as you play — a line
 *    whose number is exceeded, a segment contradicting its given clue, a boat
 *    the fleet cannot accommodate, and the warning diamond between two boats
 *    that touch diagonally. These need no solver call.
 *  - the *Check & Save* overlay from `findMistakes`, which re-solves to the
 *    unique solution. It is a strict superset: it also catches a locally-legal
 *    placement no solution permits, which is exactly the board a live-only
 *    check would let Check & Save bless.
 *
 * The per-tile cache is an `Int32Array` (playbook §3.2) holding the drawn
 * segment plus the live error/cursor flags plus the flash phase; the Check &
 * Save overlay rides in an `OverlaySidecar`, so it repaints a cell whose
 * contents are otherwise unchanged (the frame after the move that drew it).
 *
 * Palette indices are **index-for-index with the upstream `COL_*` enum**,
 * because `augmentation.ts` darkens index 4 (the water) in dark mode via
 * `paletteOverrides: { 4: 0.6 }` and a reindexed palette would mis-target it
 * (playbook §3.3).
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { BLUE_WASH, GREEN, GREY_BOLD, GREY_WASH } from "../../engine/colours.ts";
import { drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import { ERROR, HINT_ACTION, HINT_EVIDENCE, INK, PAPER } from "../../engine/palette.ts";
import type { BoatsHint } from "./index.ts";
import type { BoatsMistake } from "./solver.ts";
import {
  type BoatsMove,
  type BoatsParams,
  type BoatsState,
  type BoatsUi,
  boardOf,
  EMPTY,
  isShip,
  NO_CLUE,
  SHIP_BOTTOM,
  SHIP_CENTER,
  SHIP_LEFT,
  SHIP_RIGHT,
  SHIP_SINGLE,
  SHIP_TOP,
  SHIP_VAGUE,
  STATUS_INVALID,
  WATER,
} from "./state.ts";
import {
  checkCollision,
  checkFleet,
  countShips,
  FD_CURSOR,
  FE_COLLISION,
  FE_FLEET,
  FE_MISMATCH,
  validateGridClues,
} from "./validate.ts";

export const PREFERRED_TILE_SIZE = 32;

const FLASH_FRAME = 0.12;
export const FLASH_TIME = FLASH_FRAME * 5;

// --- palette (index-for-index with the upstream COL_* enum) ----------------

export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_CURSOR_A = 2;
export const COL_CURSOR_B = 3;
export const COL_WATER = 4;
export const COL_SHIP_CLUE = 5;
export const COL_SHIP_GUESS = 6;
export const COL_SHIP_ERROR = 7;
export const COL_SHIP_FLEET = 8;
export const COL_SHIP_FLEET_DONE = 9;
export const COL_SHIP_FLEET_STRIPE = 10;
export const COL_COUNT = 11;
export const COL_COUNT_ERROR = 12;
export const COL_COLLISION_ERROR = 13;
export const COL_COLLISION_TEXT = 14;
/**
 * The hint colours are appended **past** the upstream enum. Safe here
 * specifically because `augmentation.ts` darkens this game's palette by index
 * (`paletteOverrides: { 4: 0.6 }` for the water), so only indices at or below 14
 * are spoken for — a *reindexed* palette would mis-target that override
 * (playbook §3.3).
 */
export const COL_HINT = 15;
export const COL_HINT_CELL = 16;

export function colours(defaultBackground: Colour): Colour[] {
  const out: Colour[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_GRID] = INK;
  out[COL_CURSOR_A] = INK;
  out[COL_CURSOR_B] = PAPER;
  out[COL_WATER] = BLUE_WASH;
  out[COL_SHIP_CLUE] = GREY_BOLD;
  out[COL_SHIP_GUESS] = INK;
  out[COL_SHIP_ERROR] = ERROR;
  out[COL_SHIP_FLEET] = GREEN;
  out[COL_SHIP_FLEET_DONE] = GREY_WASH;
  out[COL_SHIP_FLEET_STRIPE] = INK;
  out[COL_COUNT] = INK;
  out[COL_COUNT_ERROR] = ERROR;
  out[COL_COLLISION_ERROR] = ERROR;
  out[COL_COLLISION_TEXT] = PAPER;
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  return out;
}

// --- geometry --------------------------------------------------------------

/** The web build compiles `NARROW_BORDERS`, so there is no outer margin
 * (playbook §3.2: check the define, don't port the desktop default). */
export const BORDER = 0;

/** Vertical gap between the number row and the fleet display. */
const gutter = (ts: number): number => (ts / 2) | 0;

/** Where the fleet display's first boat starts, in tile units. */
const FLEET_X = 0.5;
/** One fleet segment's size, as a fraction of a tile. */
const FLEET_SIZE = 0.75;
/** Gap between two boats in the fleet display, in tile units. */
const FLEET_MARGIN = 0.25;
/** Thickness of the stripe through a boat the player has found. */
const STRIPE_SIZE = 2;

export function fromCoord(pixel: number, ts: number): number {
  return Math.floor((pixel - BORDER) / ts);
}

/**
 * How many rows the fleet display needs — upstream's `boats_draw_fleet` run in
 * measuring mode (`dr == NULL`). Boats of one size are laid out together and
 * wrap to a new row when the next batch would run past the board's width.
 */
export function fleetRows(p: BoatsParams): number {
  let fx = FLEET_X;
  let y = 0;
  for (let i = 0; i < p.fleet; i++) {
    const batchWidth = p.fleetData[i] * ((i + 1) * FLEET_SIZE + FLEET_MARGIN);
    if (fx + batchWidth > p.w + 2 && fx !== FLEET_X) {
      fx = FLEET_X;
      y++;
    }
    fx += p.fleetData[i] * ((i + 1) * FLEET_SIZE + FLEET_MARGIN);
  }
  return y + 1;
}

/** Upstream `game_compute_size`: the board plus one row/column of numbers, the
 * gutter, and the fleet rows — less the fleet's own bottom padding. */
export function computeSize(p: BoatsParams, ts: number): Size {
  const rows = fleetRows(p);
  return {
    w: 2 * BORDER + (p.w + 1) * ts,
    h:
      2 * BORDER +
      gutter(ts) +
      (p.h + 1 + rows) * ts -
      Math.trunc((1 - FLEET_SIZE) * ts),
  };
}

// --- draw state ------------------------------------------------------------

export interface BoatsDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  fleet: number;
  /** Per-tile last-drawn contents (−1 = never drawn): the segment shape in bits
   * 0–3, the live error/cursor flags in bits 4–7, the flash phase in bit 8, and
   * the displayed hint step's role for this square in bits 9–11. */
  tiles: Int32Array;
  /** Last-drawn `STATUS_*` for each of the `w + h` border numbers. */
  border: Int32Array;
  /** Last-drawn count of completed boats per size. */
  fleetCount: Int32Array;
  /** The Check & Save mistake overlay (playbook §3.2 — it must be in the diff
   * key or it never repaints). */
  wrong: OverlaySidecar;
}

export function newDrawState(state: BoatsState): BoatsDrawState {
  const { w, h, fleet } = state.params;
  return {
    started: false,
    tilesize: 0,
    w,
    h,
    fleet,
    tiles: new Int32Array(w * h).fill(-1),
    border: new Int32Array(w + h).fill(-1),
    fleetCount: new Int32Array(fleet).fill(-1),
    wrong: new OverlaySidecar(w * h),
  };
}

export function setTileSize(ds: BoatsDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- primitives ------------------------------------------------------------

/**
 * Upstream `boats_draw_ship`: one boat segment. Every shape is a circle, a
 * rectangle, or both — an end cap is a circle with a rectangle filling the half
 * that continues into the next segment, a centre is a plain rectangle, a single
 * is a bare circle, and an unresolved segment is a small square.
 */
function drawSegment(
  dr: GameDrawing,
  tx: number,
  ty: number,
  ts: number,
  ship: number,
  colour: number,
): void {
  const off = ts / 20;
  const cx = tx + ts / 2;
  const cy = ty + ts / 2;
  let r = ts / 2 - off * 2;

  if (ship !== SHIP_CENTER && ship !== SHIP_VAGUE)
    dr.drawCircle({ x: cx, y: cy }, r, colour, colour);

  if (ship === SHIP_VAGUE) r *= 0.7;

  let x0 = 0;
  let y0 = 0;
  let x1 = 0;
  let y1 = 0;
  switch (ship) {
    case SHIP_CENTER:
    case SHIP_VAGUE:
      [x0, y0, x1, y1] = [cx - r, cy - r, cx + r, cy + r];
      break;
    case SHIP_TOP: // the half that continues downward
      [x0, y0, x1, y1] = [cx - r, cy, cx + r, cy + r];
      break;
    case SHIP_BOTTOM:
      [x0, y0, x1, y1] = [cx - r, cy - r, cx + r, cy];
      break;
    case SHIP_LEFT:
      [x0, y0, x1, y1] = [cx, cy - r, cx + r, cy + r];
      break;
    case SHIP_RIGHT:
      [x0, y0, x1, y1] = [cx - r, cy - r, cx, cy + r];
      break;
  }

  if (ship !== SHIP_SINGLE)
    dr.drawPolygon(
      [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      colour,
      colour,
    );
}

/** Upstream `boats_draw_collision` (itself copied from `tents.c`): a warning
 * diamond with an exclamation mark, centred on the corner where two boats
 * touch. */
function drawCollision(dr: GameDrawing, ts: number, x: number, y: number): void {
  const ext = (ts * 2) / 5;
  dr.drawPolygon(
    [
      { x: x - ext, y },
      { x, y: y - ext },
      { x: x + ext, y },
      { x, y: y + ext },
    ],
    COL_COLLISION_ERROR,
    COL_GRID,
  );

  const xext = (ts / 16) | 0;
  const yext = ((ts * 2) / 5 - (xext * 2 + 2)) | 0;
  dr.drawRect(
    { x: x - xext, y: y - yext, w: xext * 2 + 1, h: yext * 2 + 1 - xext * 3 },
    COL_COLLISION_TEXT,
  );
  dr.drawRect(
    { x: x - xext, y: y + yext - xext * 2 + 1, w: xext * 2 + 1, h: xext * 2 },
    COL_COLLISION_TEXT,
  );
}

/**
 * Upstream `boats_draw_fleet` in drawing mode: the inventory of boats under the
 * board, one drawn boat per boat to be found, greyed and struck through once
 * that many have been located.
 */
function drawFleet(
  dr: GameDrawing,
  ds: BoatsDrawState,
  p: BoatsParams,
  fleetCount: Int32Array,
  full: boolean,
): void {
  const ts = ds.tilesize;
  const { h, fleet, fleetData } = p;
  const fxCoord = (fx: number): number => BORDER + (fx - FLEET_X) * ts;
  const fyCoord = (fy: number): number => BORDER + gutter(ts) + (h + 1 + fy) * ts;

  // One slope for every boat size, so the stripes all lean the same way.
  const slope =
    (FLEET_SIZE * ts - STRIPE_SIZE * 2) / (fleet * FLEET_SIZE * ts - STRIPE_SIZE * 2);

  let fx = FLEET_X;
  let row = 0;

  for (let i = 0; i < fleet; i++) {
    const batchWidth = fleetData[i] * ((i + 1) * FLEET_SIZE + FLEET_MARGIN);
    if (fx + batchWidth > p.w + 2 && fx !== FLEET_X) {
      fx = FLEET_X;
      row++;
    }

    for (let j = 0; j < fleetData[i]; j++) {
      const boatWidth = (i + 1) * FLEET_SIZE + FLEET_MARGIN;
      if (!full && fleetCount[i] === ds.fleetCount[i]) {
        fx += boatWidth;
        continue;
      }

      const startFx = fx;
      dr.drawUpdate({
        x: fxCoord(startFx),
        y: fyCoord(row),
        w: boatWidth * ts,
        h: FLEET_SIZE * ts,
      });
      dr.drawRect(
        {
          x: fxCoord(startFx),
          y: fyCoord(row),
          w: boatWidth * ts,
          h: FLEET_SIZE * ts,
        },
        COL_BACKGROUND,
      );

      const found = j < fleetCount[i];
      const colour = found ? COL_SHIP_FLEET_DONE : COL_SHIP_FLEET;

      for (let k = 0; k <= i; k++) {
        const ship =
          i === 0
            ? SHIP_SINGLE
            : k === 0
              ? SHIP_LEFT
              : k === i
                ? SHIP_RIGHT
                : SHIP_CENTER;
        drawSegment(dr, fxCoord(fx), fyCoord(row), ts * FLEET_SIZE, ship, colour);
        fx += FLEET_SIZE;
      }

      if (found) {
        // Red rather than black when more boats of this size are on the board
        // than the fleet holds.
        const stripe =
          fleetData[i] >= fleetCount[i] ? COL_SHIP_FLEET_STRIPE : COL_COUNT_ERROR;
        const cy = fyCoord(row) + (FLEET_SIZE * ts) / 2;
        const stripeH = slope * ((i + 1) * FLEET_SIZE * ts - STRIPE_SIZE * 2);
        dr.drawLine(
          { x: fxCoord(startFx) + STRIPE_SIZE, y: cy + stripeH / 2 },
          { x: fxCoord(fx) - STRIPE_SIZE, y: cy - stripeH / 2 },
          stripe,
          STRIPE_SIZE,
        );
      }

      fx += FLEET_MARGIN;
    }

    ds.fleetCount[i] = fleetCount[i];
  }
}

// --- the frame -------------------------------------------------------------

// Hint bits, folded into the per-tile cache key so the overlay both paints and
// clears (playbook §3.2 — a hint bit outside the key is a hint that never
// repaints a warm frame).
const HINT_SHIP = 1 << 9; // a square the step asks for a boat segment on
const HINT_WATER = 1 << 10; // …or for water
const HINT_EVID = 1 << 11; // a square the deduction reasons over

/** Pack a cell's drawn appearance into the per-tile cache word. */
function tileKey(ship: number, flags: number, flash: boolean, hint: number): number {
  return ship | (flags << 4) | ((flash ? 1 : 0) << 8) | hint;
}

/** The per-cell hint bits for the displayed step. */
function hintBits(
  step: HintStep<BoatsMove, BoatsHint> | undefined,
  w: number,
  h: number,
): Int32Array | null {
  const hl = step?.highlights;
  if (!hl) return null;
  const bits = new Int32Array(w * h);
  for (const c of hl.evidence)
    if (c.x >= 0 && c.y >= 0 && c.x < w && c.y < h) bits[c.y * w + c.x] |= HINT_EVID;
  // Targets win over evidence on the same cell — the action outranks its reason.
  for (const t of hl.targets)
    if (t.x >= 0 && t.y >= 0 && t.x < w && t.y < h)
      bits[t.y * w + t.x] =
        (bits[t.y * w + t.x] & ~HINT_EVID) | (t.ship ? HINT_SHIP : HINT_WATER);
  return bits;
}

/** The two tildes Boats draws for a *given* water square — reused in the hint
 * colour so a "place water here" suggestion speaks the game's own vocabulary
 * rather than a shape the player would have to translate (§5.1a). */
function drawWaves(
  dr: GameDrawing,
  tx: number,
  ty: number,
  ts: number,
  colour: number,
): void {
  for (const frac of [0.42, 0.58])
    dr.drawText(
      { x: tx + ts / 2, y: ty + ts * frac },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: (ts / 2) | 0,
      },
      colour,
      "~",
    );
}

export function redraw(
  dr: GameDrawing,
  ds: BoatsDrawState | null,
  _prev: BoatsState | null,
  state: BoatsState,
  _dir: number,
  ui: BoatsUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<BoatsMove, BoatsHint>,
  mistakes?: readonly BoatsMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const p = state.params;
  const { w, h } = p;
  const full = !ds.started;
  const flash = flashTime > 0 ? ((flashTime / FLASH_FRAME) | 0) % 2 === 1 : false;

  if (full) {
    // The engine paints no pixels of its own (playbook §3.2).
    const size = computeSize(p, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
  }

  // The validation family writes its verdicts into caller-supplied arrays and
  // takes a mutable `BoatsBoard`, so give it a scratch copy rather than the
  // immutable state. (No `adjustShips` is needed here: `executeMove` already
  // resolved every segment's shape before the state was published.)
  const board = boardOf(state);
  const borderStatus = new Int32Array(w + h);
  const cellFlags = new Int32Array(w * h);
  const fleetCount = new Int32Array(p.fleet);

  countShips(board, undefined, undefined, borderStatus);
  checkFleet(board, fleetCount, cellFlags);
  validateGridClues(board, cellFlags);
  checkCollision(board, cellFlags);

  ds.wrong.packCells(mistakes, (x, y) => y * w + x);

  // --- the border numbers ---
  {
    const ty = BORDER + (h + 1) * ts;
    for (let x = 0; x < w; x++) {
      if (state.borderClues[x] === NO_CLUE) continue;
      if (!full && borderStatus[x] === ds.border[x]) continue;

      const tx = BORDER + x * ts + ((ts / 2) | 0);
      const colour = borderStatus[x] === STATUS_INVALID ? COL_COUNT_ERROR : COL_COUNT;
      const cell: Point = { x: tx - ((ts / 2) | 0), y: ty - ((ts / 2) | 0) };
      dr.drawRect({ x: cell.x, y: cell.y, w: ts, h: ts }, COL_BACKGROUND);
      dr.drawUpdate({ x: cell.x, y: cell.y, w: ts, h: ts });
      dr.drawText(
        { x: tx, y: ty },
        {
          align: "center",
          baseline: "alphabetic",
          fontType: "variable",
          size: (ts / 2) | 0,
        },
        colour,
        String(state.borderClues[x]),
      );
      ds.border[x] = borderStatus[x];
    }
  }
  {
    const tx = BORDER + (w + 1) * ts;
    for (let y = 0; y < h; y++) {
      if (state.borderClues[y + w] === NO_CLUE) continue;
      if (!full && borderStatus[y + w] === ds.border[y + w]) continue;

      const ty = BORDER + y * ts + ((ts / 2) | 0);
      const colour =
        borderStatus[y + w] === STATUS_INVALID ? COL_COUNT_ERROR : COL_COUNT;
      const cell: Point = { x: tx - ((ts / 2) | 0), y: ty - ((ts / 2) | 0) };
      dr.drawRect({ x: cell.x, y: cell.y, w: ts, h: ts }, COL_BACKGROUND);
      dr.drawUpdate({ x: cell.x, y: cell.y, w: ts, h: ts });
      dr.drawText(
        { x: tx, y: ty },
        {
          align: "right",
          baseline: "mathematical",
          fontType: "variable",
          size: (ts / 2) | 0,
        },
        colour,
        String(state.borderClues[y + w]),
      );
      ds.border[y + w] = borderStatus[y + w];
    }
  }

  // A collision diamond straddles the corner of four cells, so a change to one
  // must repaint the other three (the flagged cell repaints on its own flags).
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const drawn = ds.tiles[y * w + x];
      // A never-drawn cell (−1) has nothing to erase, so it is not a change.
      const wasCollision = drawn < 0 ? 0 : (drawn >> 4) & FE_COLLISION;
      if (wasCollision !== (cellFlags[y * w + x] & FE_COLLISION)) {
        if (y + 1 < h) ds.tiles[(y + 1) * w + x] = -1;
        if (x + 1 < w) ds.tiles[y * w + (x + 1)] = -1;
        if (x + 1 < w && y + 1 < h) ds.tiles[(y + 1) * w + (x + 1)] = -1;
      }
    }
  }

  const drag = dragBounds(ui);
  const hints = flashTime === 0 ? hintBits(hint, w, h) : null;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      const tx = BORDER + x * ts;
      const ty = BORDER + y * ts;

      if (flashTime === 0 && ui.cursor && ui.cx === x && ui.cy === y)
        cellFlags[i] |= FD_CURSOR;
      else cellFlags[i] &= ~FD_CURSOR;

      let ship = state.gridClues[i] !== EMPTY ? state.gridClues[i] : board.grid[i];

      // Preview the in-progress drag without committing a move.
      if (
        drag &&
        x >= drag.xmin &&
        x <= drag.xmax &&
        y >= drag.ymin &&
        y <= drag.ymax &&
        state.gridClues[i] === EMPTY &&
        (ui.dragFrom === "*" ||
          (ui.dragFrom === "-" && ship === EMPTY) ||
          (ui.dragFrom === "W" && ship === WATER) ||
          (ui.dragFrom === "B" && isShip(ship)))
      ) {
        ship = ui.dragTo === "B" ? SHIP_VAGUE : ui.dragTo === "W" ? WATER : EMPTY;
      }

      const hintBit = hints ? hints[i] : 0;
      const key = tileKey(ship, cellFlags[i], flash, hintBit);
      if (ds.tiles[i] === key && !ds.wrong.stale(i)) continue;
      ds.tiles[i] = key;

      dr.drawUpdate({ x: tx, y: ty, w: ts + 1, h: ts + 1 });
      // Shade an *undecided* evidence square, ring a decided one: a light-blue
      // fill over water or a segment would paint over the very thing that makes
      // the square evidence (hint-authoring §5.4).
      const shadeEvidence = hintBit & HINT_EVID && ship === EMPTY;
      dr.drawRect(
        { x: tx, y: ty, w: ts, h: ts },
        shadeEvidence ? COL_HINT_CELL : ship !== EMPTY ? COL_WATER : COL_BACKGROUND,
      );
      drawRectOutline(dr, tx, ty, ts + 1, ts + 1, COL_GRID);

      if (!flash && isShip(ship)) {
        const colour =
          cellFlags[i] & FE_MISMATCH || ds.wrong.at(i)
            ? COL_SHIP_ERROR
            : state.gridClues[i] === EMPTY
              ? COL_SHIP_GUESS
              : COL_SHIP_CLUE;
        drawSegment(dr, tx, ty, ts + 1, ship, colour);
      } else if (!flash && state.gridClues[i] === WATER) {
        // A *given* water square is marked with waves; player water is the
        // plain blue fill.
        drawWaves(dr, tx, ty, ts, COL_GRID);
      }

      // The hint marks *where and which action*, in the game's own vocabulary
      // and the hint colour — it never performs the move (§5.1/§5.1a). A boat
      // suggestion is the unresolved-segment square; a water suggestion is the
      // same waves a given water square carries.
      if (hintBit & (HINT_SHIP | HINT_WATER)) {
        if (hintBit & HINT_SHIP) drawSegment(dr, tx, ty, ts + 1, SHIP_VAGUE, COL_HINT);
        else drawWaves(dr, tx, ty, ts, COL_HINT);
      }

      // A decided evidence square keeps its own colour and gets an inset ring.
      if (hintBit & HINT_EVID && ship !== EMPTY) {
        const inset = (ts / 6) | 0;
        drawRectOutline(
          dr,
          tx + inset,
          ty + inset,
          ts - inset * 2 + 1,
          ts - inset * 2 + 1,
          COL_HINT_CELL,
        );
      }

      if (isShip(ship) && cellFlags[i] & FE_FLEET)
        dr.drawText(
          { x: tx + ts / 2, y: ty + ts / 2 },
          {
            align: "center",
            baseline: "mathematical",
            fontType: "variable",
            size: (ts / 2) | 0,
          },
          COL_COUNT_ERROR,
          "?",
        );

      // Check & Save: a square the unique solution contradicts. A wrong *ship*
      // is already red above; this outline is what makes a wrong *water* square
      // visible too.
      if (ds.wrong.at(i)) {
        const inset = (ts / 12) | 0;
        drawRectOutline(
          dr,
          tx + inset,
          ty + inset,
          ts - inset * 2 + 1,
          ts - inset * 2 + 1,
          COL_SHIP_ERROR,
        );
      }

      if (cellFlags[i] & FD_CURSOR) {
        const coff = (ts / 8) | 0;
        drawRectOutline(
          dr,
          tx + coff,
          ty + coff,
          ts - coff * 2 + 1,
          ts - coff * 2 + 1,
          state.grid[i] === EMPTY ? COL_CURSOR_A : COL_CURSOR_B,
        );
      }

      ds.wrong.commit(i);
    }
  }

  for (let x = 0; x < w - 1; x++)
    for (let y = 0; y < h - 1; y++)
      if (cellFlags[y * w + x] & FE_COLLISION)
        drawCollision(dr, ts, BORDER + (x + 1) * ts, BORDER + (y + 1) * ts);

  drawFleet(dr, ds, p, fleetCount, full);

  ds.started = true;
}

/** The rectangle the current drag covers, or null when no drag is in progress. */
function dragBounds(
  ui: BoatsUi,
): { xmin: number; xmax: number; ymin: number; ymax: number } | null {
  if (!ui.dragOk) return null;
  return {
    xmin: Math.min(ui.dsx, ui.dex),
    xmax: Math.max(ui.dsx, ui.dex),
    ymin: Math.min(ui.dsy, ui.dey),
    ymax: Math.max(ui.dsy, ui.dey),
  };
}
