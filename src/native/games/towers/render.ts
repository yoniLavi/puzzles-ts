/**
 * Towers (Skyscrapers) rendering — port of `game_redraw` / `draw_tile` from
 * `towers.c`.
 *
 * The board is modelled as a `(w+2) × (w+2)` array of tiles: a ring of clue
 * cells around a `w × w` play area. A filled play cell is drawn — under the 3D
 * appearance preference — as a tower whose drawn solid scales with its height
 * (the left and bottom faces protrude up-left), or, in 2D, as a plain centred
 * digit. Empty cells show their pencil marks in an auto-sized grid. Because a
 * 3D tower paints up-left into its neighbours, a changed tile is diffed and
 * repainted along with the three neighbours whose towers can reach into it
 * (the upstream four-corner cache key).
 */

import type { Colour, Size } from "../../../puzzle/types.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import {
  checkErrors,
  cluePos,
  type TowersMove,
  type TowersState,
  type TowersUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 48;
export const FLASH_TIME = 0.4;

// --- palette (index-for-index with the upstream COL_* enum) ----------------

export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_USER = 2;
export const COL_HIGHLIGHT = 3;
export const COL_ERROR = 4;
export const COL_PENCIL = 5;
export const COL_DONE = 6;

export function colours(defaultBackground: Colour): Colour[] {
  const bg = defaultBackground;
  const out: Colour[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = [0, 0, 0];
  out[COL_USER] = [0, 0.6 * bg[1], 0];
  out[COL_HIGHLIGHT] = [0.78 * bg[0], 0.78 * bg[1], 0.78 * bg[2]];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_PENCIL] = [0.5 * bg[0], 0.5 * bg[1], bg[2]];
  out[COL_DONE] = [bg[0] / 1.5, bg[1] / 1.5, bg[2] / 1.5];
  return out;
}

// --- tile flag bits (upstream DF_*) ----------------------------------------

const DF_PENCIL_SHIFT = 16;
const DF_CLUE_DONE = 0x10000;
const DF_ERROR = 0x8000;
const DF_HIGHLIGHT = 0x4000;
const DF_HIGHLIGHT_PENCIL = 0x2000;
const DF_IMMUTABLE = 0x1000;
const DF_PLAYAREA = 0x0800;
const DF_DIGIT_MASK = 0x00ff;
// Fork addition (mistake overlay; not packed alongside the upstream bits, kept
// in a sidecar so it never collides with the pencil bitmap above bit 16).

// --- geometry --------------------------------------------------------------

export const border = (ts: number): number => Math.floor((ts * 9) / 8);
export const coord = (v: number, ts: number): number => v * ts + border(ts);
export const x3d = (height: number, w: number, ts: number): number =>
  Math.floor((height * ts) / (8 * w));
export const y3d = (height: number, w: number, ts: number): number =>
  Math.floor((height * ts) / (4 * w));

export function fromCoord(v: number, ts: number): number {
  return Math.floor((v + (ts - border(ts))) / ts) - 1;
}

export function computeSize(p: { w: number }, ts: number): Size {
  const s = p.w * ts + 2 * border(ts);
  return { w: s, h: s };
}

// --- draw state ------------------------------------------------------------

export interface TowersDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  /** `(w+2)²` scratch tile values, rebuilt each redraw. */
  tiles: Int32Array;
  /** `(w+2)² × 4` last-drawn four-corner cache (-1 = never drawn). */
  drawn: Int32Array;
  /** `(w+2)²` error flags, refilled each redraw by `checkErrors`. */
  errtmp: Uint8Array;
  /** `(w+2)²` mistake-overlay flags (fork addition). */
  wrong: Uint8Array;
}

export function newDrawState(state: TowersState): TowersDrawState {
  const w = state.w;
  const W = w + 2;
  return {
    started: false,
    tilesize: 0,
    w,
    tiles: new Int32Array(W * W),
    drawn: new Int32Array(W * W * 4).fill(-1),
    errtmp: new Uint8Array(W * W),
    wrong: new Uint8Array(W * W),
  };
}

export function setTileSize(ds: TowersDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- tile drawing ----------------------------------------------------------

function drawTile(
  dr: GameDrawing,
  ts: number,
  w: number,
  threeD: boolean,
  x: number,
  y: number,
  tile: number,
  wrong: boolean,
): void {
  let tx = coord(x, ts);
  let ty = coord(y, ts);
  const digit = tile & DF_DIGIT_MASK;
  const bg = tile & DF_HIGHLIGHT ? COL_HIGHLIGHT : COL_BACKGROUND;

  // 3D tower: left + bottom faces, then offset to the top face.
  if (threeD && tile & DF_PLAYAREA && digit) {
    const xoff = x3d(digit, w, ts);
    const yoff = y3d(digit, w, ts);
    // left face
    dr.drawPolygon(
      [
        { x: tx, y: ty - 1 },
        { x: tx, y: ty + ts - 1 },
        { x: tx + xoff, y: ty + ts - 1 - yoff },
        { x: tx + xoff, y: ty - 1 - yoff },
      ],
      bg,
      COL_GRID,
    );
    // bottom face
    dr.drawPolygon(
      [
        { x: tx + ts, y: ty + ts - 1 },
        { x: tx, y: ty + ts - 1 },
        { x: tx + xoff, y: ty + ts - 1 - yoff },
        { x: tx + ts + xoff, y: ty + ts - 1 - yoff },
      ],
      bg,
      COL_GRID,
    );
    tx += xoff;
    ty -= yoff;
  }

  // erase background
  dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, bg);

  // pencil-mode highlight (top-left triangle)
  if (tile & DF_HIGHLIGHT_PENCIL) {
    dr.drawPolygon(
      [
        { x: tx, y: ty },
        { x: tx + Math.floor(ts / 2), y: ty },
        { x: tx, y: ty + Math.floor(ts / 2) },
      ],
      COL_HIGHLIGHT,
      COL_HIGHLIGHT,
    );
  }

  // box outline (play area only)
  if (tile & DF_PLAYAREA) {
    dr.drawPolygon(
      [
        { x: tx, y: ty - 1 },
        { x: tx + ts, y: ty - 1 },
        { x: tx + ts, y: ty + ts - 1 },
        { x: tx, y: ty + ts - 1 },
      ],
      -1,
      COL_GRID,
    );
  }

  if (digit) {
    let colour: number;
    if (tile & DF_ERROR) colour = COL_ERROR;
    else if (tile & DF_CLUE_DONE) colour = COL_DONE;
    else if (x < 0 || y < 0 || x >= w || y >= w) colour = COL_GRID;
    else if (tile & DF_IMMUTABLE) colour = COL_GRID;
    else colour = COL_USER;

    dr.drawText(
      { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: tile & DF_PLAYAREA ? Math.floor(ts / 2) : Math.floor((ts * 2) / 5),
      },
      colour,
      String(digit),
    );
  } else {
    // pencil marks
    let npencil = 0;
    for (let i = 1; i <= w; i++) if (tile & (1 << (i + DF_PENCIL_SHIFT))) npencil++;
    if (npencil) {
      const minph = 2;
      let pl = tx + (threeD ? x3d(w, w, ts) : 0);
      const pr = tx + ts;
      const pt = ty;
      const pb = ty + ts - (threeD ? y3d(w, w, ts) : 0);

      // Choose a grid layout maximising the font size.
      let bestsize = 0;
      let pbest = 0;
      for (let pw = 3; pw < Math.max(npencil, 4); pw++) {
        let ph = Math.floor((npencil + pw - 1) / pw);
        ph = Math.max(ph, minph);
        const fw = (pr - pl) / pw;
        const fh = (pb - pt) / ph;
        const fs = Math.min(fw, fh);
        if (fs > bestsize) {
          bestsize = fs;
          pbest = pw;
        }
      }
      const pw = pbest;
      let ph = Math.floor((npencil + pw - 1) / pw);
      ph = Math.max(ph, minph);

      const fontsize = Math.min(Math.floor((pr - pl) / pw), Math.floor((pb - pt) / ph));
      pl = pl + Math.floor((pr - pl - fontsize * pw) / 2);
      const pt2 = pt + Math.floor((pb - pt - fontsize * ph) / 2);

      let j = 0;
      for (let i = 1; i <= w; i++) {
        if (tile & (1 << (i + DF_PENCIL_SHIFT))) {
          const dx = j % pw;
          const dy = Math.floor(j / pw);
          dr.drawText(
            {
              x: pl + Math.floor((fontsize * (2 * dx + 1)) / 2),
              y: pt2 + Math.floor((fontsize * (2 * dy + 1)) / 2),
            },
            {
              align: "center",
              baseline: "mathematical",
              fontType: "variable",
              size: fontsize,
            },
            COL_PENCIL,
            String(i),
          );
          j++;
        }
      }
    }
  }

  // Check & Save mistake overlay (fork addition): an inset red outline.
  if (wrong) {
    const r = tx + ts - 1;
    const b = ty + ts - 1;
    for (const inset of [2, 3]) {
      dr.drawLine(
        { x: tx + inset, y: ty + inset },
        { x: r - inset, y: ty + inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: r - inset, y: ty + inset },
        { x: r - inset, y: b - inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: r - inset, y: b - inset },
        { x: tx + inset, y: b - inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: tx + inset, y: b - inset },
        { x: tx + inset, y: ty + inset },
        COL_ERROR,
        1,
      );
    }
  }
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: TowersDrawState | null,
  _prev: TowersState | null,
  state: TowersState,
  _dir: number,
  ui: TowersUi,
  _animTime: number,
  flashTime: number,
  _hint?: HintStep<TowersMove>,
  mistakes?: readonly { x: number; y: number }[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const w = state.w;
  const W = w + 2;
  const threeD = ui.threeD;

  if (!ds.started) {
    const size = computeSize({ w }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
  }

  checkErrors(state, ds.errtmp);

  ds.wrong.fill(0);
  if (mistakes) {
    for (const m of mistakes) ds.wrong[(m.y + 1) * W + (m.x + 1)] = 1;
  }

  // Build the tile values.
  ds.tiles.fill(0);
  // clue squares
  for (let i = 0; i < 4 * w; i++) {
    let tile = state.clues[i];
    const { x, y } = cluePos(i, w);
    if (ds.errtmp[(y + 1) * W + (x + 1)]) tile |= DF_ERROR;
    else if (state.cluesDone[i]) tile |= DF_CLUE_DONE;
    ds.tiles[(y + 1) * W + (x + 1)] = tile;
  }
  // main grid
  const flash =
    flashTime > 0 && (flashTime <= FLASH_TIME / 3 || flashTime >= (FLASH_TIME * 2) / 3);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      let tile = DF_PLAYAREA;
      if (state.grid[y * w + x]) tile |= state.grid[y * w + x];
      else tile |= state.pencil[y * w + x] << DF_PENCIL_SHIFT;
      if (ui.hshow && ui.hx === x && ui.hy === y)
        tile |= ui.hpencil ? DF_HIGHLIGHT_PENCIL : DF_HIGHLIGHT;
      if (state.immutable[y * w + x]) tile |= DF_IMMUTABLE;
      if (flash) tile |= DF_HIGHLIGHT;
      if (ds.errtmp[(y + 1) * W + (x + 1)]) tile |= DF_ERROR;
      ds.tiles[(y + 1) * W + (x + 1)] = tile;
    }
  }

  // Diff and repaint, drawing each changed cell's tower-overlapping neighbours.
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const tr = ds.tiles[y * W + x];
      const tl = x === 0 ? 0 : ds.tiles[y * W + (x - 1)];
      const br = y === w + 1 ? 0 : ds.tiles[(y + 1) * W + x];
      const bl = x === 0 || y === w + 1 ? 0 : ds.tiles[(y + 1) * W + (x - 1)];

      if (
        ds.drawn[i * 4] !== tl ||
        ds.drawn[i * 4 + 1] !== tr ||
        ds.drawn[i * 4 + 2] !== bl ||
        ds.drawn[i * 4 + 3] !== br
      ) {
        dr.clip({ x: coord(x - 1, ts), y: coord(y - 1, ts), w: ts, h: ts });
        drawTile(dr, ts, w, threeD, x - 1, y - 1, tr, ds.wrong[i] !== 0);
        if (x > 0)
          drawTile(
            dr,
            ts,
            w,
            threeD,
            x - 2,
            y - 1,
            tl,
            ds.wrong[y * W + (x - 1)] !== 0,
          );
        if (y <= w)
          drawTile(dr, ts, w, threeD, x - 1, y, br, ds.wrong[(y + 1) * W + x] !== 0);
        if (x > 0 && y <= w)
          drawTile(
            dr,
            ts,
            w,
            threeD,
            x - 2,
            y,
            bl,
            ds.wrong[(y + 1) * W + (x - 1)] !== 0,
          );
        dr.unclip();
        dr.drawUpdate({ x: coord(x - 1, ts), y: coord(y - 1, ts), w: ts, h: ts });

        ds.drawn[i * 4] = tl;
        ds.drawn[i * 4 + 1] = tr;
        ds.drawn[i * 4 + 2] = bl;
        ds.drawn[i * 4 + 3] = br;
      }
    }
  }

  ds.started = true;
}
