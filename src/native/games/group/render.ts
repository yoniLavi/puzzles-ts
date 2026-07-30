/**
 * Group rendering — port of `game_redraw` / `draw_tile` / `game_colours` from
 * `group.c`.
 *
 * The board is a `w × w` Cayley table with a one-tile legend row/column showing
 * the element names, drawn in the current display `sequence` (which the player
 * can drag to reorder). Each cell shows its element (or pencil marks), with the
 * `x == y` diagonal shaded, subgroup dividers as thick edges, and — the fork's
 * Check & Save divergence — a red outline on any cell that contradicts the
 * unique solution. The renderer diffs every cell against a per-display-cell
 * cache (composed tile word + pencil bitmap + error word + mistake bit).
 *
 * Display code is out of byte-parity scope (the palette and geometry target
 * neat visuals), but the palette is transcribed from upstream anyway since it is
 * trivial and looks right.
 */

import type { Colour, DrawTextOptions, Size } from "../../../puzzle/types.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { hintMarkBit, OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import { ERROR, HINT_EVIDENCE, HINT_FILL, INK } from "../../engine/palette.ts";
import type { GroupMove } from "./state.ts";
import {
  checkErrors,
  EF_DIGIT_MASK,
  EF_DIGIT_SHIFT,
  EF_LATIN,
  EF_LEFT_MASK,
  EF_LEFT_SHIFT,
  EF_RIGHT_MASK,
  EF_RIGHT_SHIFT,
  type GroupState,
  type GroupUi,
  toChar,
} from "./state.ts";

// --- palette (game_colours) ------------------------------------------------

export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_USER = 2;
export const COL_HIGHLIGHT = 3;
export const COL_ERROR = 4;
export const COL_PENCIL = 5;
export const COL_DIAGONAL = 6;
/** Fork addition (past the upstream enum): the Check & Save mistake outline. */
export const COL_MISTAKE = 7;
/** Hint overlay (fork addition): the cell(s)/candidate(s) the deduction acts on. */
export const COL_HINT = 8;
/** Hint overlay: the premise cells shaded as evidence (associativity's three
 * known products, an identity fill's revealing cell). */
export const COL_HINT_CELL = 9;

export function colours(defaultBackground: Colour): Colour[] {
  const bg = defaultBackground;
  const out: Colour[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = INK;
  out[COL_USER] = [0, 0.6 * bg[1], 0];
  out[COL_HIGHLIGHT] = [0.78 * bg[0], 0.78 * bg[1], 0.78 * bg[2]];
  out[COL_ERROR] = ERROR;
  out[COL_PENCIL] = [0.5 * bg[0], 0.5 * bg[1], bg[2]];
  out[COL_DIAGONAL] = [0.95 * bg[0], 0.95 * bg[1], 0.95 * bg[2]];
  out[COL_MISTAKE] = ERROR;
  out[COL_HINT] = HINT_FILL;
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  return out;
}

/** Highlight payload a Group hint step carries (built in `index.ts`), the
 * `CandidateHighlights` shape the shared plan helpers consume: the premise cells
 * shaded `COL_HINT_CELL` (`area`), the acted-on cell(s) `COL_HINT` (`targets`),
 * and the struck candidate(s) crossed through among the pencil marks (`marks`).
 * All coordinates are grid `{x = col, y = row}`. */
export interface GroupHint {
  area: { x: number; y: number }[];
  targets: { x: number; y: number }[];
  marks: { x: number; y: number; n: number }[];
}

// --- draw-flag bits (DF_*) --------------------------------------------------

const DF_DIVIDER_TOP = 0x1000;
const DF_DIVIDER_BOT = 0x2000;
const DF_DIVIDER_LEFT = 0x4000;
const DF_DIVIDER_RIGHT = 0x8000;
const DF_HIGHLIGHT = 0x0400;
const DF_HIGHLIGHT_PENCIL = 0x0200;
const DF_IMMUTABLE = 0x0100;
const DF_LEGEND = 0x0080;
const DF_DIGIT_MASK = 0x001f;

export const FLASH_TIME = 0.4;

// --- geometry (BORDER = TILESIZE/2, LEGEND = TILESIZE; NARROW_BORDERS is not
// defined in this fork's build) ---------------------------------------------

export const PREFERRED_TILE_SIZE = 48;

const border = (ts: number): number => ts >> 1;
const legend = (ts: number): number => ts;
const gridextra = (ts: number): number => Math.max(ts >> 5, 1);

/** `COORD` — pixel origin of display column/row `pos`. */
export function coord(pos: number, ts: number): number {
  return pos * ts + border(ts) + legend(ts);
}

/** `FROMCOORD` — display column/row for a pixel (C integer division, so a click
 * in the legend area yields -1). */
export function fromCoord(px: number, ts: number): number {
  return Math.trunc((px + (ts - border(ts) - legend(ts))) / ts) - 1;
}

/** `SIZE(w)` — the square canvas dimension. */
function sizePx(w: number, ts: number): number {
  return w * ts + 2 * border(ts) + legend(ts) + gridextra(ts) + 1;
}

export function computeSize(w: number, ts: number): Size {
  const s = sizePx(w, ts);
  return { w: s, h: s };
}

// --- draw state ------------------------------------------------------------

export interface GroupDrawState {
  w: number;
  id: boolean;
  tilesize: number;
  started: boolean;
  /** Per-display-cell composed tile word cache (`-1` = never drawn). */
  tiles: Int32Array;
  /** Per-legend-slot cache. */
  legend: Int32Array;
  /** Per-display-cell pencil bitmap cache. */
  pencil: Int32Array;
  /** Per-display-cell error word cache. */
  errors: Int32Array;
  /** Per-display-cell mistake-bit cache. */
  mistakes: Uint8Array;
  /** Grid-indexed hint-overlay sidecar (fork addition): bit 0 = target cell,
   * bit 1 = evidence, bits 2.. = struck-candidate mask (`hintMarkBit(n)`). Keyed
   * by grid cell (`y·w + x`) so the overlay follows an element through a display
   * reorder; owns its own drawn-vs-packed diff (playbook §3.2 / OverlaySidecar). */
  hint: OverlaySidecar;
  /** Scratch: the drag-modified display sequence, rebuilt each redraw. */
  sequence: Uint8Array;
  /** Scratch: grid-indexed error overlay from `checkErrors`. */
  errtmp: Int32Array;
}

export function newDrawState(state: GroupState): GroupDrawState {
  const w = state.w;
  const a = w * w;
  return {
    w,
    id: state.id,
    tilesize: 0,
    started: false,
    tiles: new Int32Array(a).fill(-1),
    legend: new Int32Array(w).fill(-1),
    pencil: new Int32Array(a).fill(-1),
    errors: new Int32Array(a),
    mistakes: new Uint8Array(a),
    hint: new OverlaySidecar(a),
    sequence: new Uint8Array(w),
    errtmp: new Int32Array(a),
  };
}

export function setTileSize(ds: GroupDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- per-tile drawing (draw_tile) ------------------------------------------

const CENTRE: DrawTextOptions = {
  align: "center",
  baseline: "mathematical",
  fontType: "variable",
  size: 0, // overwritten per call
};

function textOpts(size: number): DrawTextOptions {
  return { ...CENTRE, size };
}

function drawTile(
  dr: GameDrawing,
  ds: GroupDrawState,
  x: number,
  y: number,
  tileIn: number,
  pencil: number,
  error: number,
  mistake: boolean,
  hint: number,
): void {
  const w = ds.w;
  const ts = ds.tilesize;
  const id = ds.id;
  let tile = tileIn;

  // Hint overlay (hint-authoring §5.3): a placement target fills solid COL_HINT;
  // an evidence cell shades COL_HINT_CELL; a strike keeps its ordinary background
  // so the crossed-through candidates stay legible (`struck` bit `2 + n`).
  const hintTarget = (hint & 1) !== 0;
  const hintArea = (hint & 2) !== 0;
  const struck = hint >> 2;

  const tx = border(ts) + legend(ts) + x * ts + 1;
  const ty = border(ts) + legend(ts) + y * ts + 1;

  let cx = tx;
  let cy = ty;
  let cw = ts - 1;
  let ch = ts - 1;

  if (tile & DF_LEGEND) {
    cx += Math.trunc(ts / 10);
    cy += Math.trunc(ts / 10);
    cw -= Math.trunc(ts / 5);
    ch -= Math.trunc(ts / 5);
    tile |= DF_IMMUTABLE;
  }

  dr.clip({ x: cx, y: cy, w: cw, h: ch });

  // Background: hint target (solid, placement only) > hint evidence > highlight >
  // diagonal shade > plain.
  let bg =
    tile & DF_HIGHLIGHT ? COL_HIGHLIGHT : x === y ? COL_DIAGONAL : COL_BACKGROUND;
  if (hintArea) bg = COL_HINT_CELL;
  if (hintTarget && struck === 0) bg = COL_HINT;
  dr.drawRect({ x: cx, y: cy, w: cw, h: ch }, bg);

  // Dividers.
  if (tile & DF_DIVIDER_TOP) dr.drawRect({ x: cx, y: cy, w: cw, h: 1 }, COL_GRID);
  if (tile & DF_DIVIDER_BOT)
    dr.drawRect({ x: cx, y: cy + ch - 1, w: cw, h: 1 }, COL_GRID);
  if (tile & DF_DIVIDER_LEFT) dr.drawRect({ x: cx, y: cy, w: 1, h: ch }, COL_GRID);
  if (tile & DF_DIVIDER_RIGHT)
    dr.drawRect({ x: cx + cw - 1, y: cy, w: 1, h: ch }, COL_GRID);

  // Pencil-mode highlight (a triangle in the top-left corner).
  if (tile & DF_HIGHLIGHT_PENCIL) {
    dr.drawPolygon(
      [
        { x: cx, y: cy },
        { x: cx + (cw >> 1), y: cy },
        { x: cx, y: cy + (ch >> 1) },
      ],
      COL_HIGHLIGHT,
      COL_HIGHLIGHT,
    );
  }

  if (tile & DF_DIGIT_MASK) {
    const digit = tile & DF_DIGIT_MASK;
    dr.drawText(
      { x: tx + Math.trunc(ts / 2), y: ty + Math.trunc(ts / 2) },
      textOpts(Math.trunc(ts / 2)),
      error & EF_LATIN ? COL_ERROR : tile & DF_IMMUTABLE ? COL_GRID : COL_USER,
      toChar(digit, id),
    );

    // Associativity-failure annotations: "(ab)c" above, "a(bc)" below.
    if (error & EF_LEFT_MASK) {
      const av = (error >> (EF_LEFT_SHIFT + 2 * EF_DIGIT_SHIFT)) & EF_DIGIT_MASK;
      const bv = (error >> (EF_LEFT_SHIFT + 1 * EF_DIGIT_SHIFT)) & EF_DIGIT_MASK;
      const cv = (error >> EF_LEFT_SHIFT) & EF_DIGIT_MASK;
      dr.drawText(
        { x: tx + Math.trunc(ts / 2), y: ty + Math.trunc(ts / 6) },
        textOpts(Math.trunc(ts / 6)),
        COL_ERROR,
        `(${toChar(av, id)}${toChar(bv, id)})${toChar(cv, id)}`,
      );
    }
    if (error & EF_RIGHT_MASK) {
      const av = (error >> (EF_RIGHT_SHIFT + 2 * EF_DIGIT_SHIFT)) & EF_DIGIT_MASK;
      const bv = (error >> (EF_RIGHT_SHIFT + 1 * EF_DIGIT_SHIFT)) & EF_DIGIT_MASK;
      const cv = (error >> EF_RIGHT_SHIFT) & EF_DIGIT_MASK;
      dr.drawText(
        { x: tx + Math.trunc(ts / 2), y: ty + ts - Math.trunc(ts / 6) },
        textOpts(Math.trunc(ts / 6)),
        COL_ERROR,
        `${toChar(av, id)}(${toChar(bv, id)}${toChar(cv, id)})`,
      );
    }
  } else {
    // Pencil marks, in an auto-sized grid within the cell.
    let npencil = 0;
    for (let i = 1; i <= w; i++) if (pencil & (1 << i)) npencil++;
    if (npencil) {
      const minph = 2;
      const pl0 = tx + gridextra(ts);
      const pr = pl0 + ts - gridextra(ts);
      const pt0 = ty + gridextra(ts);
      const pb = pt0 + ts - gridextra(ts);

      let bestsize = 0;
      let pbest = 0;
      for (let pw = 3; pw < Math.max(npencil, 4); pw++) {
        let ph = Math.trunc((npencil + pw - 1) / pw);
        ph = Math.max(ph, minph);
        const fw = (pr - pl0) / pw;
        const fh = (pb - pt0) / ph;
        const fs = Math.min(fw, fh);
        if (fs > bestsize) {
          bestsize = fs;
          pbest = pw;
        }
      }
      const pw = pbest;
      let ph = Math.trunc((npencil + pw - 1) / pw);
      ph = Math.max(ph, minph);

      const fontsize = Math.min(
        Math.trunc((pr - pl0) / pw),
        Math.trunc((pb - pt0) / ph),
      );
      const pl = tx + Math.trunc((ts - fontsize * pw) / 2);
      const pt = ty + Math.trunc((ts - fontsize * ph) / 2);

      let j = 0;
      for (let i = 1; i <= w; i++) {
        if (pencil & (1 << i)) {
          const dx = j % pw;
          const dy = Math.trunc(j / pw);
          const px = pl + Math.trunc((fontsize * (2 * dx + 1)) / 2);
          const py = pt + Math.trunc((fontsize * (2 * dy + 1)) / 2);
          dr.drawText({ x: px, y: py }, textOpts(fontsize), COL_PENCIL, toChar(i, id));
          // A hint-struck candidate keeps its normal pencil colour with a
          // same-colour strikethrough as the "ruled out" cue (hint-authoring §5.3).
          if (struck & (1 << i)) {
            const r = Math.max(2, Math.trunc(fontsize / 3));
            dr.drawLine({ x: px - r, y: py }, { x: px + r, y: py }, COL_PENCIL, 2);
          }
          j++;
        }
      }
    }
  }

  // Fork addition: the Check & Save mistake outline (a red inset border).
  if (mistake) {
    dr.drawRect({ x: cx, y: cy, w: cw, h: 2 }, COL_MISTAKE);
    dr.drawRect({ x: cx, y: cy + ch - 2, w: cw, h: 2 }, COL_MISTAKE);
    dr.drawRect({ x: cx, y: cy, w: 2, h: ch }, COL_MISTAKE);
    dr.drawRect({ x: cx + cw - 2, y: cy, w: 2, h: ch }, COL_MISTAKE);
  }

  dr.unclip();
  dr.drawUpdate({ x: cx, y: cy, w: cw, h: ch });
}

// --- full redraw (game_redraw) ---------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: GroupDrawState,
  _prev: GroupState | null,
  state: GroupState,
  _dir: number,
  ui: GroupUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<GroupMove, GroupHint>,
  mistakes?: readonly { x: number; y: number }[],
): void {
  const w = state.w;
  const ts = ds.tilesize;

  if (!ds.started) {
    // The engine emits no pixels of its own — fill the whole canvas, then the
    // grid rectangle (COL_GRID) the cells sit on top of.
    const total = sizePx(w, ts);
    dr.drawRect({ x: 0, y: 0, w: total, h: total }, COL_BACKGROUND);
    const ge = gridextra(ts);
    dr.drawRect(
      {
        x: coord(0, ts) - ge,
        y: coord(0, ts) - ge,
        w: w * ts + 1 + ge * 2,
        h: w * ts + 1 + ge * 2,
      },
      COL_GRID,
    );
    dr.drawUpdate({ x: 0, y: 0, w: total, h: total });
    ds.started = true;
  }

  checkErrors(state, ds.errtmp);

  // Build the drag-modified display sequence.
  let dragElem = -1;
  let dragPos = -1;
  if (ui.drag) {
    dragElem = ui.dragnum;
    dragPos = ui.dragpos;
  }
  for (let i = 0, j = 0; i < w; i++) {
    if (i === dragPos) {
      ds.sequence[i] = dragElem;
    } else {
      if (state.sequence[j] === dragElem) j++;
      ds.sequence[i] = state.sequence[j++];
    }
  }

  // Mistake lookup (grid-indexed).
  const mistakeFlags = new Uint8Array(w * w);
  if (mistakes) for (const m of mistakes) mistakeFlags[m.y * w + m.x] = 1;

  // Hint overlay, packed by grid cell so it follows an element through a reorder.
  ds.hint.pack(
    hint?.highlights,
    (x, y) => y * w + x,
    (m) => hintMarkBit(m.n),
  );

  // Legend row/column.
  for (let x = 0; x < w; x++) {
    const sx = ds.sequence[x];
    const tile = (sx + 1) | DF_LEGEND;
    if (ds.legend[x] !== tile) {
      ds.legend[x] = tile;
      drawTile(dr, ds, -1, x, tile, 0, 0, false, 0);
      drawTile(dr, ds, x, -1, tile, 0, 0, false, 0);
    }
  }

  // Cells.
  const flashOn =
    flashTime > 0 && (flashTime <= FLASH_TIME / 3 || flashTime >= (FLASH_TIME * 2) / 3);

  for (let y = 0; y < w; y++) {
    const sy = ds.sequence[y];
    for (let x = 0; x < w; x++) {
      const sx = ds.sequence[x];
      let tile = 0;
      let pencil = 0;

      if (state.grid[sy * w + sx]) tile = state.grid[sy * w + sx];
      else pencil = state.pencil[sy * w + sx];

      if (state.immutable[sy * w + sx]) tile |= DF_IMMUTABLE;

      if (
        (ui.drag === 5 && ui.dragnum === sy) ||
        (ui.drag === 6 && ui.dragnum === sx)
      ) {
        tile |= DF_HIGHLIGHT;
      } else if (ui.hshow) {
        let highlight = false;
        if (ui.odn > 1) {
          const i = Math.abs(x - ui.ohx);
          if (
            i >= 0 &&
            i < ui.odn &&
            x === ui.ohx + i * ui.odx &&
            y === ui.ohy + i * ui.ody
          )
            highlight = true;
        } else {
          highlight = ui.hx === sx && ui.hy === sy;
        }
        if (highlight) tile |= ui.hpencil ? DF_HIGHLIGHT_PENCIL : DF_HIGHLIGHT;
      }

      if (flashOn) tile |= DF_HIGHLIGHT; // completion flash

      if (y <= 0 || state.dividers[ds.sequence[y - 1]] === sy) tile |= DF_DIVIDER_TOP;
      if (y + 1 >= w || state.dividers[sy] === ds.sequence[y + 1])
        tile |= DF_DIVIDER_BOT;
      if (x <= 0 || state.dividers[ds.sequence[x - 1]] === sx) tile |= DF_DIVIDER_LEFT;
      if (x + 1 >= w || state.dividers[sx] === ds.sequence[x + 1])
        tile |= DF_DIVIDER_RIGHT;

      const gi = sy * w + sx;
      const error = ds.errtmp[gi];
      const mistake = mistakeFlags[gi] !== 0;
      const hintWord = ds.hint.packed[gi];

      const idx = y * w + x;
      if (
        ds.tiles[idx] !== tile ||
        ds.pencil[idx] !== pencil ||
        ds.errors[idx] !== error ||
        ds.mistakes[idx] !== (mistake ? 1 : 0) ||
        ds.hint.stale(gi)
      ) {
        ds.tiles[idx] = tile;
        ds.pencil[idx] = pencil;
        ds.errors[idx] = error;
        ds.mistakes[idx] = mistake ? 1 : 0;
        drawTile(dr, ds, x, y, tile, pencil, error, mistake, hintWord);
        ds.hint.commit(gi);
      }
    }
  }
}

export function flashLength(a: GroupState, b: GroupState): number {
  if (!a.completed && b.completed && !a.cheated && !b.cheated) return FLASH_TIME;
  return 0;
}
