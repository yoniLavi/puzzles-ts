/**
 * Keen rendering — port of `game_redraw` / `draw_tile` from `keen.c`.
 *
 * The board is a `w × w` grid drawn on a `COL_GRID` backing rectangle so the
 * thin grid lines show between cells. Each cell's background is widened by
 * `GRIDEXTRA` toward same-cage neighbours (so a cage reads as one merged
 * region), with explicit corner-jut squares where a diagonal neighbour is a
 * different cage. Each cage's clue (target + operation symbol) is drawn at the
 * cage's minimal cell; a filled cell shows its digit, an empty cell an
 * auto-sized grid of pencil marks. Because a cell's drawn pixels depend only on
 * its own tile value (digit | pencil | highlight | error) plus the immutable
 * cage dsf, a single per-tile value cache suffices — with the (fork) mistake
 * overlay tracked in a sidecar so Check & Save repaints an already-drawn cell.
 */

import type { Colour, Size } from "../../../puzzle/types.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { hintMarkBit, HintSidecar } from "../../engine/hint-sidecar.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
import {
  C_ADD,
  C_MUL,
  C_SUB,
  checkErrors,
  clueOp,
  clueVal,
  ERR_CLUE,
  ERR_LATIN,
  type KeenMove,
  type KeenState,
  type KeenUi,
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
// Fork additions, appended past the upstream enum; Keen has no dark-mode
// paletteOverrides, so a plain append is safe.
export const COL_PENCIL_BODY = 6; // the yellow body of the pencil-mode indicator
export const COL_HINT = 7; // the cell(s)/candidate(s) the deduction acts on
export const COL_HINT_CELL = 8; // the driving cage's cells (evidence shade)

export function colours(defaultBackground: Colour): Colour[] {
  const bg = defaultBackground;
  const out: Colour[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = [0, 0, 0];
  out[COL_USER] = [0, 0.6 * bg[1], 0];
  out[COL_HIGHLIGHT] = [0.78 * bg[0], 0.78 * bg[1], 0.78 * bg[2]];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_PENCIL] = [0.5 * bg[0], 0.5 * bg[1], bg[2]];
  out[COL_PENCIL_BODY] = [1, 0.78, 0.17];
  out[COL_HINT] = [0.62, 0.81, 0.96];
  out[COL_HINT_CELL] = [0.85, 0.92, 0.99];
  return out;
}

/** Highlight payload a Keen hint step carries (built in `index.ts`). The
 * element-type legend (hint-authoring §5.3): the driving cage's cells shaded
 * `COL_HINT_CELL`, the acted-on cell(s) `COL_HINT`, the ruled-out candidate(s)
 * shown struck. */
export interface KeenHint {
  /** The driving cage's cells (evidence), shaded `COL_HINT_CELL`. */
  area: { x: number; y: number }[];
  /** The cell(s) the deduction acts on, marked `COL_HINT`. */
  targets: { x: number; y: number }[];
  /** The candidate number(s) ruled out, shown struck among the pencil marks. */
  marks: { x: number; y: number; n: number }[];
}

// --- operation symbols (upstream text_fallback first choice) ---------------

const MINUS_SIGN = "−";
const TIMES_SIGN = "×";
const DIVIDE_SIGN = "÷";

// --- tile flag bits (upstream DF_*) ----------------------------------------

const DF_PENCIL_SHIFT = 16;
const DF_ERR_LATIN = 0x8000;
const DF_ERR_CLUE = 0x4000;
const DF_HIGHLIGHT = 0x2000;
const DF_HIGHLIGHT_PENCIL = 0x1000;
const DF_DIGIT_MASK = 0x000f;

// --- geometry --------------------------------------------------------------

export const border = (ts: number): number => (ts / 2) | 0;
export const gridExtra = (ts: number): number => Math.max((ts / 32) | 0, 1);
export const coord = (v: number, ts: number): number => v * ts + border(ts);

export function fromCoord(v: number, ts: number): number {
  return Math.floor((v + (ts - border(ts))) / ts) - 1;
}

export function computeSize(p: { w: number }, ts: number): Size {
  const s = p.w * ts + 2 * border(ts);
  return { w: s, h: s };
}

// --- draw state ------------------------------------------------------------

export interface KeenDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  /** `w²` last-drawn tile values (-1 = never drawn). */
  tiles: Int32Array;
  /** `w²` scratch error flags, refilled each redraw by `checkErrors`. */
  errors: Int32Array;
  /** `w²` mistake-overlay flags (fork addition). */
  wrong: Uint8Array;
  /** `w²` last-drawn mistake-overlay flags (-1 = never drawn). In the diff key
   * so Check & Save repaints a cell whose tile value is otherwise unchanged. */
  drawnWrong: Int8Array;
  /** `w²` hint-overlay sidecar (fork addition): bit 0 = target cell, bit 1 =
   * evidence, bits 2.. = struck-candidate mask (`hintMarkBit(n)`). Owns the
   * repack/stale/commit dance that keeps the overlay in the cache diff key
   * (playbook §3.2). */
  hint: HintSidecar;
  /** Whether the pencil-mode indicator was on last frame (fork addition). */
  pencilModeShown: boolean;
}

export function newDrawState(state: KeenState): KeenDrawState {
  const a = state.params.w * state.params.w;
  return {
    started: false,
    tilesize: 0,
    w: state.params.w,
    tiles: new Int32Array(a).fill(-1),
    errors: new Int32Array(a),
    wrong: new Uint8Array(a),
    drawnWrong: new Int8Array(a).fill(-1),
    hint: new HintSidecar(a),
    pencilModeShown: false,
  };
}

export function setTileSize(ds: KeenDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- tile drawing ----------------------------------------------------------

function drawTile(
  dr: GameDrawing,
  ds: KeenDrawState,
  state: KeenState,
  x: number,
  y: number,
  tile: number,
  onlyOneOp: boolean,
  wrong: boolean,
  hint: number,
): void {
  const ts = ds.tilesize;
  const w = state.params.w;
  const ge = gridExtra(ts);
  const { dsf, minimal, clues } = state.clues;
  const cell = y * w + x;
  const drawClue = minimal[cell] === cell;

  // Hint overlay (hint-authoring §5.3): target cell (COL_HINT) > evidence cell
  // (COL_HINT_CELL) > cursor/flash highlight > background. `struck` is the set of
  // candidates this firing rules out, drawn crossed through among the marks.
  const hintTarget = (hint & 1) !== 0;
  const hintArea = (hint & 2) !== 0;
  const struck = hint >> 2; // bit n ⇒ candidate n struck

  const tx = border(ts) + x * ts + 1 + ge;
  const ty = border(ts) + y * ts + 1 + ge;

  let cx = tx;
  let cy = ty;
  let cw = ts - 1 - 2 * ge;
  let ch = ts - 1 - 2 * ge;

  // Widen the background toward same-cage neighbours so the cage merges.
  if (x > 0 && dsf.equivalent(cell, cell - 1)) {
    cx -= ge;
    cw += ge;
  }
  if (x + 1 < w && dsf.equivalent(cell, cell + 1)) cw += ge;
  if (y > 0 && dsf.equivalent(cell, cell - w)) {
    cy -= ge;
    ch += ge;
  }
  if (y + 1 < w && dsf.equivalent(cell, cell + w)) ch += ge;

  dr.clip({ x: cx, y: cy, w: cw, h: ch });

  // Background. A solid COL_HINT fill is the *placement*-target fill; a strike
  // step also flags its cell as a target, but its struck candidates are drawn over
  // the background, so painting it COL_HINT would wash them out — fill solid only
  // when nothing is struck here (a placement), else keep the lighter evidence /
  // normal background so the crossed-through digit stays legible.
  let bg = tile & DF_HIGHLIGHT ? COL_HIGHLIGHT : COL_BACKGROUND;
  if (hintArea) bg = COL_HINT_CELL;
  if (hintTarget && struck === 0) bg = COL_HINT;
  dr.drawRect({ x: cx, y: cy, w: cw, h: ch }, bg);

  // Pencil-mode highlight (top-left triangle).
  if (tile & DF_HIGHLIGHT_PENCIL) {
    dr.drawPolygon(
      [
        { x: cx, y: cy },
        { x: cx + ((cw / 2) | 0), y: cy },
        { x: cx, y: cy + ((ch / 2) | 0) },
      ],
      COL_HIGHLIGHT,
      COL_HIGHLIGHT,
    );
  }

  // Corner juts: a GRIDEXTRA square where the diagonal neighbour is a different
  // cage (so the grid corner shows).
  if (x > 0 && y > 0 && !dsf.equivalent(cell, (y - 1) * w + x - 1))
    dr.drawRect({ x: tx - ge, y: ty - ge, w: ge, h: ge }, COL_GRID);
  if (x + 1 < w && y > 0 && !dsf.equivalent(cell, (y - 1) * w + x + 1))
    dr.drawRect({ x: tx + ts - 1 - 2 * ge, y: ty - ge, w: ge, h: ge }, COL_GRID);
  if (x > 0 && y + 1 < w && !dsf.equivalent(cell, (y + 1) * w + x - 1))
    dr.drawRect({ x: tx - ge, y: ty + ts - 1 - 2 * ge, w: ge, h: ge }, COL_GRID);
  if (x + 1 < w && y + 1 < w && !dsf.equivalent(cell, (y + 1) * w + x + 1))
    dr.drawRect(
      { x: tx + ts - 1 - 2 * ge, y: ty + ts - 1 - 2 * ge, w: ge, h: ge },
      COL_GRID,
    );

  // Cage clue text (top-left of the minimal cell).
  if (drawClue) {
    const clue = clues[cell];
    const op = clueOp(clue);
    const val = clueVal(clue);
    const size = dsf.size(cell);
    const symbol =
      size === 1 || onlyOneOp
        ? ""
        : op === C_ADD
          ? "+"
          : op === C_SUB
            ? MINUS_SIGN
            : op === C_MUL
              ? TIMES_SIGN
              : DIVIDE_SIGN;
    dr.drawText(
      { x: tx + ge * 2, y: ty + ge * 2 + ((ts / 4) | 0) },
      {
        align: "left",
        baseline: "alphabetic",
        fontType: "variable",
        size: (ts / 4) | 0,
      },
      tile & DF_ERR_CLUE ? COL_ERROR : COL_GRID,
      `${val}${symbol}`,
    );
  }

  // Digit, or pencil marks.
  if (tile & DF_DIGIT_MASK) {
    dr.drawText(
      { x: tx + ((ts / 2) | 0), y: ty + ((ts / 2) | 0) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: (ts / 2) | 0,
      },
      tile & DF_ERR_LATIN ? COL_ERROR : COL_USER,
      String(tile & DF_DIGIT_MASK),
    );
  } else {
    let npencil = 0;
    for (let i = 1; i <= w; i++) if (tile & (1 << (i + DF_PENCIL_SHIFT))) npencil++;
    if (npencil) {
      const minph = 2;
      let pl = tx + ge;
      const pr = pl + ts - ge;
      let pt = ty + ge;
      const pb = pt + ts - ge;
      if (drawClue) pt += (ts / 4) | 0;

      // Choose the grid layout maximising the font size.
      let bestsize = 0;
      let pbest = 0;
      for (let pw = 3; pw < Math.max(npencil, 4); pw++) {
        let ph = ((npencil + pw - 1) / pw) | 0;
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
      let ph = ((npencil + pw - 1) / pw) | 0;
      ph = Math.max(ph, minph);
      const fontsize = Math.min(((pr - pl) / pw) | 0, ((pb - pt) / ph) | 0);

      pl = tx + (((ts - fontsize * pw) / 2) | 0);
      let pt2 = ty + (((ts - fontsize * ph) / 2) | 0);
      if (drawClue) pt2 = Math.max(pt2, ty + ge * 3 + ((ts / 4) | 0));

      let j = 0;
      for (let i = 1; i <= w; i++) {
        if (tile & (1 << (i + DF_PENCIL_SHIFT))) {
          const dx = j % pw;
          const dy = (j / pw) | 0;
          const cx = pl + (((fontsize * (2 * dx + 1)) / 2) | 0);
          const cy = pt2 + (((fontsize * (2 * dy + 1)) / 2) | 0);
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
          // A hint-ruled-out candidate keeps its normal pencil colour with a
          // same-colour strikethrough — the "ruled out" cue (hint-authoring §5.3).
          if (struck & (1 << i)) {
            const r = Math.max(2, (fontsize / 3) | 0);
            dr.drawLine({ x: cx - r, y: cy }, { x: cx + r, y: cy }, COL_PENCIL, 2);
          }
          j++;
        }
      }
    }
  }

  // Check & Save mistake overlay (fork addition): an inset red outline.
  if (wrong) {
    const l = tx;
    const t = ty;
    const r = tx + ts - 1 - 2 * ge;
    const b = ty + ts - 1 - 2 * ge;
    for (const inset of [2, 3]) {
      dr.drawLine(
        { x: l + inset, y: t + inset },
        { x: r - inset, y: t + inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: r - inset, y: t + inset },
        { x: r - inset, y: b - inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: r - inset, y: b - inset },
        { x: l + inset, y: b - inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: l + inset, y: b - inset },
        { x: l + inset, y: t + inset },
        COL_ERROR,
        1,
      );
    }
  }

  dr.unclip();
  dr.drawUpdate({ x: cx, y: cy, w: cw, h: ch });
}

// --- pencil-mode indicator -------------------------------------------------

/** The shared diagonal pencil glyph, drawn in the empty top-right border corner
 * (outside the grid, never overlapping a cell) — the same corner Unequal uses. */
function drawPencilIndicator(
  dr: GameDrawing,
  w: number,
  ts: number,
  on: boolean,
): void {
  const b = border(ts);
  const ox = computeSize({ w }, ts).w - b;
  dr.drawRect({ x: ox, y: 0, w: b, h: b }, COL_BACKGROUND);
  if (on) drawPencilGlyph(dr, ox, 0, b, COL_PENCIL_BODY, COL_GRID);
  dr.drawUpdate({ x: ox, y: 0, w: b, h: b });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: KeenDrawState | null,
  _prev: KeenState | null,
  state: KeenState,
  _dir: number,
  ui: KeenUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<KeenMove, KeenHint>,
  mistakes?: readonly { x: number; y: number }[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const w = state.params.w;
  const ge = gridExtra(ts);
  const size = computeSize({ w }, ts);
  const firstFrame = !ds.started;

  if (!ds.started) {
    // Engine paints no pixels of its own — fill the whole canvas, then the grid
    // backing rectangle the thin lines show through.
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawRect(
      {
        x: coord(0, ts) - ge,
        y: coord(0, ts) - ge,
        w: w * ts + 1 + ge * 2,
        h: w * ts + 1 + ge * 2,
      },
      COL_GRID,
    );
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  checkErrors(state, ds.errors);

  ds.wrong.fill(0);
  if (mistakes) for (const m of mistakes) ds.wrong[m.y * w + m.x] = 1;

  // Pack the displayed hint overlay per cell.
  ds.hint.pack(hint?.highlights, (x, y) => y * w + x, (m) => hintMarkBit(m.n));

  const flash =
    flashTime > 0 && (flashTime <= FLASH_TIME / 3 || flashTime >= (FLASH_TIME * 2) / 3);

  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let tile = state.grid[i] ? state.grid[i] : state.pencil[i] << DF_PENCIL_SHIFT;
      if (ui.hshow && ui.hx === x && ui.hy === y)
        tile |= ui.hpencil ? DF_HIGHLIGHT_PENCIL : DF_HIGHLIGHT;
      if (flash) tile |= DF_HIGHLIGHT;
      if (ds.errors[i] & ERR_LATIN) tile |= DF_ERR_LATIN;
      if (ds.errors[i] & ERR_CLUE) tile |= DF_ERR_CLUE;

      if (
        ds.tiles[i] !== tile ||
        ds.drawnWrong[i] !== ds.wrong[i] ||
        ds.hint.stale(i)
      ) {
        drawTile(
          dr,
          ds,
          state,
          x,
          y,
          tile,
          state.params.multiplicationOnly,
          ds.wrong[i] !== 0,
          ds.hint.packed[i],
        );
        ds.tiles[i] = tile;
        ds.drawnWrong[i] = ds.wrong[i];
        ds.hint.commit(i);
      }
    }
  }

  // Pencil-mode indicator (fork addition).
  if (firstFrame || ds.pencilModeShown !== ui.hpencil) {
    drawPencilIndicator(dr, w, ts, ui.hpencil);
    ds.pencilModeShown = ui.hpencil;
  }
}
