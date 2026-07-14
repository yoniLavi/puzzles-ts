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
import { hintMarkBit, OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
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
// Fork addition: the yellow body of the pencil-mode indicator glyph (a classic
// #2 school pencil). Appended past the upstream enum; Towers has no dark-mode
// paletteOverrides, so the extra indices are safe.
export const COL_PENCIL_BODY = 7;
// Fork additions: the explained-hint legend (see hint-authoring §5.3).
export const COL_HINT = 8; // the cell(s)/candidate(s) the deduction acts on
export const COL_HINT_CELL = 9; // the driving clue's line of sight (evidence)

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
  out[COL_PENCIL_BODY] = [1, 0.78, 0.17];
  out[COL_HINT] = [0.62, 0.81, 0.96];
  out[COL_HINT_CELL] = [0.85, 0.92, 0.99];
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
// Fork addition: a CapsLock-style "pencil mode is on" indicator, drawn as a
// small pencil glyph in the (tower-safe, never-overlapped) top-right corner of
// the clue ring. A high bit clear of the pencil bitmap (bits 17..25) and the
// upstream flags below bit 16.
const DF_PENCIL_MODE = 1 << 30;

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
  /** `(w+2)²` hint-overlay sidecar (fork addition): bit 0 = target cell,
   * bit 1 = evidence area, bits 2.. = struck-candidate mask
   * (`hintMarkBit(height)`). Owns the repack/stale/commit dance that keeps
   * a hint change repainting affected cells even when their tile value is
   * otherwise unchanged (playbook §3.2). */
  hint: OverlaySidecar;
  /** `(w+2)²` mistake-overlay sidecar (fork addition). Neither overlay changes
   * a cell's tile value, so both must be in the diff key — this one is where
   * that was learnt: a Check & Save on an already-drawn cell repainted nothing. */
  wrong: OverlaySidecar;
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
    hint: new OverlaySidecar(W * W),
    wrong: new OverlaySidecar(W * W),
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
  hint: number,
): void {
  let tx = coord(x, ts);
  let ty = coord(y, ts);
  const digit = tile & DF_DIGIT_MASK;
  // Hint overlay: target cell (COL_HINT) > evidence area (COL_HINT_CELL) >
  // cursor highlight > background. `struck` is the set of candidate heights
  // this firing rules out, drawn struck in COL_HINT among the pencil marks.
  const hintTarget = (hint & 1) !== 0;
  const hintArea = (hint & 2) !== 0;
  const struck = hint >> 2;
  let bg = tile & DF_HIGHLIGHT ? COL_HIGHLIGHT : COL_BACKGROUND;
  if (hintArea) bg = COL_HINT_CELL;
  // A solid COL_HINT background is the *placement*-target fill. A strike step
  // also flags its cells as targets, but their struck candidates are drawn in
  // COL_HINT too — painting the cell COL_HINT as well would hide the very digit
  // the hint is crossing out (blue-on-blue). So only fill solid when there is
  // nothing struck here; a strike cell keeps the lighter evidence/normal
  // background and the COL_HINT strikethrough digit stays legible against it.
  if (hintTarget && struck === 0) bg = COL_HINT;

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

  // CapsLock-style "pencil mode is on" indicator (shared glyph).
  if (tile & DF_PENCIL_MODE) {
    drawPencilGlyph(dr, tx, ty, ts, COL_PENCIL_BODY, COL_GRID);
  }

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
          const cx = pl + Math.floor((fontsize * (2 * dx + 1)) / 2);
          const cy = pt2 + Math.floor((fontsize * (2 * dy + 1)) / 2);
          const isStruck = (struck & (1 << i)) !== 0;
          // The struck candidate keeps its normal pencil colour (high contrast,
          // reads as a real note); the strikethrough line — drawn in the same
          // COL_PENCIL colour as the digit — is the cue that the hint is ruling
          // it out. Colouring either against the lighter hint background washed
          // them out.
          dr.drawText(
            { x: cx, y: cy },
            {
              align: "center",
              baseline: "mathematical",
              fontType: "variable",
              size: fontsize,
            },
            COL_PENCIL,
            String(i),
          );
          // Cross the ruled-out candidate through so the elimination is legible.
          if (isStruck) {
            const r = Math.max(2, Math.floor(fontsize / 3));
            dr.drawLine({ x: cx - r, y: cy }, { x: cx + r, y: cy }, COL_PENCIL, 2);
          }
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

// --- hint overlay ----------------------------------------------------------

/** Highlight payload a Towers hint step carries (built in `index.ts`). Defined
 * here so `redraw` can consume it without a circular import. See
 * hint-authoring §5.3 for the element-type legend. */
export interface TowersHint {
  /** The driving clue's line of sight, shaded `COL_HINT_CELL`. */
  area: { x: number; y: number }[];
  /** The cell(s) the deduction acts on, marked `COL_HINT`. */
  targets: { x: number; y: number }[];
  /** The candidate digit(s) ruled out, shown struck in `COL_HINT`. */
  marks: { x: number; y: number; n: number }[];
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
  hint?: HintStep<TowersMove, TowersHint>,
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

  // Pack both overlays per play cell (border-ring indexing).
  const index = (x: number, y: number) => (y + 1) * W + (x + 1);
  ds.hint.pack(hint?.highlights, index, (m) => hintMarkBit(m.n));
  ds.wrong.packCells(mistakes, index);

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

  // Pencil-mode indicator in the top-right clue-ring corner (W-pos (w+1, 0)).
  // Towers protrude up-left, so nothing ever overlaps this corner; it is also
  // no cell's up-left neighbour, so the diff cache repaints it cleanly on
  // toggle. Driven straight off the persistent `hpencil` mode flag.
  if (ui.hpencil) ds.tiles[w + 1] |= DF_PENCIL_MODE;

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
        ds.drawn[i * 4 + 3] !== br ||
        ds.hint.stale(i) ||
        ds.wrong.stale(i)
      ) {
        dr.clip({ x: coord(x - 1, ts), y: coord(y - 1, ts), w: ts, h: ts });
        drawTile(dr, ts, w, threeD, x - 1, y - 1, tr, ds.wrong.at(i), ds.hint.packed[i]);
        if (x > 0)
          drawTile(
            dr,
            ts,
            w,
            threeD,
            x - 2,
            y - 1,
            tl,
            ds.wrong.at(y * W + (x - 1)),
            ds.hint.packed[y * W + (x - 1)],
          );
        if (y <= w)
          drawTile(
            dr,
            ts,
            w,
            threeD,
            x - 1,
            y,
            br,
            ds.wrong.at((y + 1) * W + x),
            ds.hint.packed[(y + 1) * W + x],
          );
        if (x > 0 && y <= w)
          drawTile(
            dr,
            ts,
            w,
            threeD,
            x - 2,
            y,
            bl,
            ds.wrong.at((y + 1) * W + (x - 1)),
            ds.hint.packed[(y + 1) * W + (x - 1)],
          );
        dr.unclip();
        dr.drawUpdate({ x: coord(x - 1, ts), y: coord(y - 1, ts), w: ts, h: ts });

        ds.drawn[i * 4] = tl;
        ds.drawn[i * 4 + 1] = tr;
        ds.drawn[i * 4 + 2] = bl;
        ds.drawn[i * 4 + 3] = br;
        ds.hint.commit(i);
        ds.wrong.commit(i);
      }
    }
  }

  ds.started = true;
}
