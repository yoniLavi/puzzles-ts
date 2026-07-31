/**
 * Rome rendering — port of `game_redraw` / `rome_draw_arrow` in
 * `puzzles/unreleased/rome.c`.
 *
 * ## The grid lines are negative space, not strokes
 *
 * Nothing here draws a grid line. The first frame floods the whole canvas with
 * `COL_BORDER`, and every square then paints its own background rect *inset*
 * by `GRIDEXTRA` on each side that borders a different outlined region (and by
 * one pixel everywhere else, since `cw = tilesize - 1`). What is left showing
 * through is the grid: a hairline between squares of one region, a double-width
 * line along a region boundary. So the region outlines cost no drawing code at
 * all — they fall out of four comparisons of the region forest.
 *
 * ## Borders
 *
 * The web build compiles `NARROW_BORDERS` (`cmake/platforms/webapp.cmake`), so
 * `BORDER` is `GRIDEXTRA * 2` — **not** the desktop `tilesize / 2` — and
 * `computeSize` subtracts `GRIDEXTRA * 2` back off because the outer grid
 * outline is drawn inside the border area (playbook §3.2).
 *
 * ## Colours
 *
 * The palette is upstream's, index for index, derived from the host
 * background with no luminance adjustment: `puzzle-view.ts` hands the game
 * pure white in dark mode precisely so `background × 0.95` derivations still
 * work, then adapts the returned palette itself (playbook §3.3).
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import { drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import { ERROR, errorWash, INK } from "../../engine/palette.ts";
import type { RomeMistake } from "./index.ts";
import {
  EMPTY,
  FD_CURSOR,
  FD_ENTRY,
  FD_KBMASK,
  FD_PENCIL,
  FD_PLACE,
  FD_TOGOAL,
  FE_BOUNDS,
  FE_DOUBLE,
  FE_LOOP,
  FM_ARROWMASK,
  FM_DOWN,
  FM_FIXED,
  FM_GOAL,
  FM_LEFT,
  FM_RIGHT,
  FM_UP,
  KEYMODE_OFF,
  KEYMODE_PENCIL,
  KEYMODE_PLACE,
  MOUSEMODE_PENCIL,
  MOUSEMODE_PLACE,
  type RomeParams,
  type RomeState,
  type RomeUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 40;

const GRIDEXTRA = 1;
/** `NARROW_BORDERS` arm: the top/left grid outline is drawn in the border. */
export const BORDER = GRIDEXTRA * 2;

const FLASH_FRAME = 0.1;
export const FLASH_TIME = 0.7;

/** Arrow head half-width, as a fraction of the arrow's half-length. */
const SIDE_SIZE = 0.6;

// --- palette (upstream COL_* enum, index for index) -------------------------

export const COL_BACKGROUND = 0;
export const COL_HIGHLIGHT = 1;
export const COL_LOWLIGHT = 2;
export const COL_BORDER = 3;
export const COL_ARROW_FIXED = 4;
export const COL_ARROW_GUESS = 5;
export const COL_ARROW_ERROR = 6;
export const COL_ARROW_PENCIL = 7;
export const COL_ARROW_ENTRY = 8;
export const COL_ERRORBG = 9;
export const COL_GOALBG = 10;
export const COL_GOAL = 11;

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_BORDER] = INK;
  out[COL_ARROW_FIXED] = INK;
  out[COL_ARROW_GUESS] = [0, 0.5, 0];
  out[COL_ARROW_ERROR] = ERROR;
  out[COL_ARROW_PENCIL] = [0, 0.5, 0.5];
  out[COL_ARROW_ENTRY] = [0, 0, 1];
  out[COL_ERRORBG] = errorWash(background);
  out[COL_GOALBG] = [0.95 * background[0], 0.95 * background[1], 1];
  out[COL_GOAL] = [0, 0, 0.5];
  return out;
}

// --- geometry ---------------------------------------------------------------

export function computeSize(p: RomeParams, ts: number): Size {
  // Compensate for the outer grid outline drawn in the border area.
  return {
    w: p.w * ts + 2 * BORDER - GRIDEXTRA * 2,
    h: p.h * ts + 2 * BORDER - GRIDEXTRA * 2,
  };
}

// --- draw state -------------------------------------------------------------

/** Mistake-overlay bit (the only one; `OverlaySidecar` keeps it in the diff
 * key so the highlight paints on a frame where nothing else changed). */
const HB_MISTAKE = 1;

export interface RomeDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Packed `(effective cell, effective marks, flash phase)` per square. */
  cache: Int32Array;
  mistakes: OverlaySidecar;
}

export function newDrawState(state: RomeState): RomeDrawState {
  const s = state.w * state.h;
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    cache: new Int32Array(s).fill(-1),
    mistakes: new OverlaySidecar(s),
  };
}

export function setTileSize(ds: RomeDrawState, ts: number): void {
  ds.tilesize = ts;
  ds.started = false;
}

// --- primitives -------------------------------------------------------------

function line(
  dr: GameDrawing,
  thick: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colour: number,
): void {
  dr.drawLine(
    { x: Math.round(x1), y: Math.round(y1) },
    { x: Math.round(x2), y: Math.round(y2) },
    colour,
    thick,
  );
}

/**
 * An arrow centred on `(tx, ty)` with half-length `size`: a shaft plus two
 * head strokes. `ink` of `-1` picks the colour from the cell's own bits — an
 * in-progress mouse entry is blue, a fixed clue black, a duplicated arrow red,
 * and a player's own arrow green.
 */
export function drawArrow(
  dr: GameDrawing,
  tx: number,
  ty: number,
  size: number,
  data: number,
  ink: number,
): void {
  const thick = size <= 8 ? 1 : 2;
  const sd = size * SIDE_SIZE;
  const colour =
    ink !== -1
      ? ink
      : data & FD_ENTRY
        ? COL_ARROW_ENTRY
        : data & FM_FIXED
          ? COL_ARROW_FIXED
          : data & FE_DOUBLE
            ? COL_ARROW_ERROR
            : COL_ARROW_GUESS;

  if (data & (FM_UP | FM_DOWN)) line(dr, thick, tx, ty - size, tx, ty + size, colour);
  else line(dr, thick, tx - size, ty, tx + size, ty, colour);

  if (data & FM_UP) {
    line(dr, thick, tx, ty - size, tx - sd, ty, colour);
    line(dr, thick, tx, ty - size, tx + sd, ty, colour);
  }
  if (data & FM_LEFT) {
    line(dr, thick, tx, ty - sd, tx - size, ty, colour);
    line(dr, thick, tx, ty + sd, tx - size, ty, colour);
  }
  if (data & FM_RIGHT) {
    line(dr, thick, tx, ty - sd, tx + size, ty, colour);
    line(dr, thick, tx, ty + sd, tx + size, ty, colour);
  }
  if (data & FM_DOWN) {
    line(dr, thick, tx, ty + size, tx - sd, ty, colour);
    line(dr, thick, tx, ty + size, tx + sd, ty, colour);
  }
}

// --- redraw -----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: RomeDrawState | null,
  _prev: RomeState | null,
  state: RomeState,
  _dir: number,
  ui: RomeUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly RomeMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, grid, marks, regions } = state;

  // Upstream copies `kmode` into a local and forces it off while the win
  // animation runs — the *displayed* cursor goes away, but `ui.kmode` still
  // feeds the cell value (and so the cache key), so both are kept apart here
  // exactly as in the C.
  let flash = -1;
  let kmode = ui.kmode;
  if (flashTime > 0) {
    flash = Math.floor(flashTime / FLASH_FRAME) % 3;
    kmode = KEYMODE_OFF;
  }

  if (!ds.started) {
    const fullW = w * ts + 2 * BORDER;
    const fullH = h * ts + 2 * BORDER;
    dr.drawRect({ x: 0, y: 0, w: fullW, h: fullH }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: fullW, h: fullH });
    // The grid: every square's own rect is inset into this, so what survives
    // is the outline.
    dr.drawRect(
      {
        x: BORDER - GRIDEXTRA * 2,
        y: BORDER - GRIDEXTRA * 2,
        w: w * ts + GRIDEXTRA * 2,
        h: h * ts + GRIDEXTRA * 2,
      },
      COL_BORDER,
    );
    ds.started = true;
  }

  ds.mistakes.clear();
  if (mistakes) {
    for (const m of mistakes) ds.mistakes.add(m.index, HB_MISTAKE);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i1 = y * w + x;
      const onHighlight = ui.hx === x && ui.hy === y;
      let c = grid[i1];
      let p = marks[i1];

      // The in-flight mouse drag previews its direction in place.
      if (ui.mmode === MOUSEMODE_PLACE && onHighlight) {
        c = ui.mdir | FD_ENTRY;
      } else if (ui.mmode === MOUSEMODE_PENCIL && onHighlight) {
        if (ui.mdir !== EMPTY) p ^= ui.mdir;
        else p |= FD_ENTRY;
      }
      if (ui.kmode !== KEYMODE_OFF && onHighlight) {
        c |=
          ui.kmode === KEYMODE_PLACE
            ? FD_PLACE
            : ui.kmode === KEYMODE_PENCIL
              ? FD_PENCIL
              : FD_CURSOR;
      }

      const key =
        (c & 0x7fff) |
        (((p >> 2) & 0xf) << 15) |
        ((p & FD_ENTRY ? 1 : 0) << 19) |
        ((flash + 1) << 20);
      if (ds.cache[i1] === key && !ds.mistakes.stale(i1)) continue;
      ds.cache[i1] = key;
      ds.mistakes.commit(i1);

      let cx = BORDER + x * ts;
      let cy = BORDER + y * ts;
      let cw = ts - 1;
      let ch = ts - 1;
      dr.drawUpdate({ x: cx, y: cy, w: cw, h: ch });

      let colour: number;
      if (flash === -1) {
        colour =
          ui.sloops && grid[i1] & FE_LOOP
            ? COL_ERRORBG
            : ui.sgoals && grid[i1] & FD_TOGOAL
              ? COL_GOALBG
              : grid[i1] & FE_BOUNDS
                ? COL_ERRORBG
                : COL_BACKGROUND;
        if (kmode !== KEYMODE_OFF && onHighlight) {
          colour = kmode === KEYMODE_PLACE ? COL_HIGHLIGHT : COL_LOWLIGHT;
        }
      } else {
        colour =
          (x + y) % 3 === flash
            ? COL_BACKGROUND
            : (x + y + 1) % 3 === flash
              ? COL_LOWLIGHT
              : COL_HIGHLIGHT;
      }

      // Inset each side that meets a different region, leaving the outline.
      if (x === 0 || !regions.equivalent(i1, i1 - 1)) {
        cx += GRIDEXTRA;
        cw -= GRIDEXTRA;
      }
      if (x === w - 1 || !regions.equivalent(i1, i1 + 1)) cw -= GRIDEXTRA * 2;
      if (y === 0 || !regions.equivalent(i1, i1 - w)) {
        cy += GRIDEXTRA;
        ch -= GRIDEXTRA;
      }
      if (y === h - 1 || !regions.equivalent(i1, i1 + w)) ch -= GRIDEXTRA * 2;

      dr.drawRect({ x: cx, y: cy, w: cw, h: ch }, colour);

      const midX = BORDER + x * ts + Math.floor(ts / 2);
      const midY = BORDER + y * ts + Math.floor(ts / 2);

      if (kmode === KEYMODE_PENCIL && onHighlight) {
        dr.drawText(
          { x: midX, y: midY },
          {
            align: "center",
            baseline: "mathematical",
            fontType: "fixed",
            size: Math.trunc(ts / 1.8),
          },
          COL_HIGHLIGHT,
          "?",
        );
      }

      // Pencil marks show only on a square with no arrow or goal of its own.
      if ((c & FD_KBMASK) === c) {
        const q = ts * 0.12;
        if (p & FM_UP) {
          drawArrow(
            dr,
            midX,
            BORDER + y * ts + Math.floor(ts / 4),
            q,
            FM_UP,
            COL_ARROW_PENCIL,
          );
        }
        if (p & FM_DOWN) {
          drawArrow(
            dr,
            midX,
            BORDER + y * ts + Math.floor((3 * ts) / 4),
            q,
            FM_DOWN,
            COL_ARROW_PENCIL,
          );
        }
        if (p & FM_LEFT) {
          drawArrow(
            dr,
            BORDER + x * ts + Math.floor(ts / 4),
            midY,
            q,
            FM_LEFT,
            COL_ARROW_PENCIL,
          );
        }
        if (p & FM_RIGHT) {
          drawArrow(
            dr,
            BORDER + x * ts + Math.floor((3 * ts) / 4),
            midY,
            q,
            FM_RIGHT,
            COL_ARROW_PENCIL,
          );
        }
        if (p & FD_ENTRY) {
          dr.drawRect({ x: midX - 2, y: midY - 2, w: 4, h: 4 }, COL_ARROW_PENCIL);
        }
      }

      if (c & FM_GOAL) {
        dr.drawCircle({ x: midX, y: midY }, Math.floor(ts / 3), COL_GOAL, COL_GOAL);
      } else if (c & FM_ARROWMASK) {
        drawArrow(dr, midX, midY, ts * 0.3, c, -1);
      } else if (c & FD_ENTRY) {
        dr.drawRect({ x: midX - 2, y: midY - 2, w: 4, h: 4 }, COL_ARROW_ENTRY);
      }

      // Check & Save's mistake overlay. Upstream already reds a duplicated
      // arrow and an off-grid arrow's background as you play; the inset ring
      // is what makes the *other* kind visible — a legal-looking arrow that
      // contradicts the unique solution has nothing to recolour.
      if (ds.mistakes.packed[i1] & HB_MISTAKE) {
        const inset = Math.max(2, Math.floor(ts / 10));
        drawRectOutline(
          dr,
          BORDER + x * ts + inset,
          BORDER + y * ts + inset,
          ts - 1 - 2 * inset,
          ts - 1 - 2 * inset,
          COL_ARROW_ERROR,
        );
      }
    }
  }
}
