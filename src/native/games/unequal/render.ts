/**
 * Unequal rendering — port of `game_redraw` / `draw_furniture` / `draw_gts` /
 * `draw_adjs` from `unequal.c`.
 *
 * The board is an `order × order` grid of tiles with a half-tile gap between
 * cells. The clues live in those gaps: in Unequal mode a greater-than polygon
 * (`draw_gt`) pointing toward the smaller cell; in Adjacent mode a bar
 * (`draw_adjs`). Each clue is coloured red when currently violated, grey when
 * struck through ("spent"), else normal. Filled cells show their number; empty
 * cells show their pencil marks in an auto-sized grid. Cells are diffed against
 * a per-tile cache (number + composed flag word + pencil bitmap + mistake +
 * pencil-mode overlay).
 */

import type { Colour, Size } from "../../../puzzle/types.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { UnequalMove } from "./state.ts";
import { hintMarkBit, HintSidecar } from "../../engine/hint-sidecar.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
import {
  checkComplete,
  F_ADJ_DOWN,
  F_ADJ_LEFT,
  F_ADJ_RIGHT,
  F_ADJ_UP,
  F_ERROR,
  F_ERROR_DOWN,
  F_ERROR_LEFT,
  F_ERROR_RIGHT,
  F_ERROR_UP,
  F_SPENT_DOWN,
  F_SPENT_LEFT,
  F_SPENT_RIGHT,
  F_SPENT_UP,
  n2c,
  type UnequalState,
  type UnequalUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.4;

// --- palette (index-for-index with the upstream COL_* enum) ----------------

export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_TEXT = 2;
export const COL_GUESS = 3;
export const COL_ERROR = 4;
export const COL_PENCIL = 5;
export const COL_HIGHLIGHT = 6;
export const COL_LOWLIGHT = 7;
export const COL_SPENT = COL_LOWLIGHT;
// Fork additions, appended past the upstream enum; Unequal has no dark-mode
// paletteOverrides, so a plain append is safe.
export const COL_PENCIL_BODY = 8; // the yellow body of the pencil-mode indicator
export const COL_HINT = 9; // the cell(s)/candidate(s) the deduction acts on
export const COL_HINT_CELL = 10; // the driving clue's cells (evidence shade)

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const bg = background;
  const out: Colour[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = [0.5, 0.5, 0.5];
  out[COL_TEXT] = [0, 0, 0];
  out[COL_GUESS] = [0, 0.6 * bg[1], 0];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_PENCIL] = [0.5 * bg[0], 0.5 * bg[1], bg[2]];
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_PENCIL_BODY] = [1, 0.78, 0.17];
  out[COL_HINT] = [0.62, 0.81, 0.96];
  out[COL_HINT_CELL] = [0.85, 0.92, 0.99];
  return out;
}

/** Highlight payload an Unequal hint step carries (built in `index.ts`). The
 * element-type legend (hint-authoring §5.3): the driving clue's cells shaded
 * `COL_HINT_CELL`, the acted-on cell(s) `COL_HINT`, the ruled-out candidate(s)
 * shown struck. */
export interface UnequalHint {
  /** The driving clue's cells (evidence), shaded `COL_HINT_CELL`. */
  area: { x: number; y: number }[];
  /** The cell(s) the deduction acts on, marked `COL_HINT`. */
  targets: { x: number; y: number }[];
  /** The candidate number(s) ruled out, shown struck among the pencil marks. */
  marks: { x: number; y: number; n: number }[];
}

// --- geometry --------------------------------------------------------------

export const gap = (ts: number): number => Math.floor(ts / 2);
export const square = (ts: number): number => ts + gap(ts);
export const border = (ts: number): number => Math.floor(ts / 2);
export const coord = (v: number, ts: number): number => v * square(ts) + border(ts);

export function fromCoord(v: number, ts: number): number {
  return Math.floor((v - border(ts) + square(ts)) / square(ts)) - 1;
}

export function drawSize(order: number, ts: number): number {
  return ts * order + gap(ts) * (order - 1) + border(ts) * 2;
}

export function computeSize(p: { order: number }, ts: number): Size {
  const s = drawSize(p.order, ts);
  return { w: s, h: s };
}

// --- draw state ------------------------------------------------------------

export interface UnequalDrawState {
  started: boolean;
  tilesize: number;
  order: number;
  /** `order²` last-drawn numbers. */
  nums: Int8Array;
  /** `order²` last-drawn composed flag word (clue | spent | error | immutable). */
  flags: Int32Array;
  /** `order³` last-drawn pencil bitmaps (one byte per candidate). */
  hints: Uint8Array;
  /** `order²` last-drawn mistake-overlay flags (fork addition, in the diff key
   * via {@link drawnWrong} so Check & Save repaints an already-drawn cell). */
  wrong: Uint8Array;
  drawnWrong: Int8Array;
  /** `order²` hint-overlay sidecar (fork addition): bit 0 = target cell, bit 1 =
   * evidence, bits 2.. = struck-candidate mask (`hintMarkBit(n)`). Owns the
   * repack/stale/commit dance that keeps the overlay in the cache diff key
   * (playbook §3.2). */
  hint: HintSidecar;
  /** `order²` scratch error flags, refilled each redraw by `checkComplete`. */
  errFlags: Int32Array;
  hx: number;
  hy: number;
  hshow: boolean;
  hpencil: boolean;
  hflash: boolean;
  /** Whether the pencil-mode indicator was on last frame (fork addition). */
  pencilModeShown: boolean;
}

export function newDrawState(state: UnequalState): UnequalDrawState {
  const o = state.order;
  return {
    started: false,
    tilesize: 0,
    order: o,
    nums: new Int8Array(o * o).fill(-1),
    flags: new Int32Array(o * o).fill(-1),
    hints: new Uint8Array(o * o * o).fill(255),
    wrong: new Uint8Array(o * o),
    drawnWrong: new Int8Array(o * o).fill(-1),
    hint: new HintSidecar(o * o),
    errFlags: new Int32Array(o * o),
    hx: 0,
    hy: 0,
    hshow: false,
    hpencil: false,
    hflash: false,
    pencilModeShown: false,
  };
}

export function setTileSize(ds: UnequalDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- inter-cell clue drawing -----------------------------------------------

/** Colour for a clue direction: error (red) > spent (grey) > the normal `fg`. */
function clueColour(f: number, errBit: number, spentBit: number, fg: number): number {
  if (f & errBit) return COL_ERROR;
  if (f & spentBit) return COL_SPENT;
  return fg;
}

/** A greater-than chevron (upstream `draw_gt`), a 6-point polygon. */
function drawGt(
  dr: GameDrawing,
  ox: number,
  oy: number,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
  col: number,
): void {
  const xdx = dx1 + dx2 ? 0 : 1;
  const xdy = dx1 + dx2 ? 1 : 0;
  dr.drawPolygon(
    [
      { x: ox + xdx, y: oy + xdy },
      { x: ox + xdx + dx1, y: oy + xdy + dy1 },
      { x: ox + xdx + dx1 + dx2, y: oy + xdy + dy1 + dy2 },
      { x: ox - xdx + dx1 + dx2, y: oy - xdy + dy1 + dy2 },
      { x: ox - xdx + dx1, y: oy - xdy + dy1 },
      { x: ox - xdx, y: oy - xdy },
    ],
    col,
    col,
  );
}

/** Draw the greater-than signs emanating from a cell (Unequal mode). */
function drawGts(
  dr: GameDrawing,
  ts: number,
  ox: number,
  oy: number,
  f: number,
  fg: number,
): void {
  const g = gap(ts);
  const g2 = Math.floor((g + 1) / 2);
  const g4 = Math.floor((g + 1) / 4);

  if (f & F_ADJ_UP) {
    dr.drawRect({ x: ox, y: oy - g, w: ts, h: g }, COL_BACKGROUND);
    drawGt(dr, ox + g2, oy - g4, g2, -g2, g2, g2, clueColour(f, F_ERROR_UP, F_SPENT_UP, fg));
    dr.drawUpdate({ x: ox, y: oy - g, w: ts, h: g });
  }
  if (f & F_ADJ_RIGHT) {
    dr.drawRect({ x: ox + ts, y: oy, w: g, h: ts }, COL_BACKGROUND);
    drawGt(dr, ox + ts + g4, oy + g2, g2, g2, -g2, g2, clueColour(f, F_ERROR_RIGHT, F_SPENT_RIGHT, fg));
    dr.drawUpdate({ x: ox + ts, y: oy, w: g, h: ts });
  }
  if (f & F_ADJ_DOWN) {
    dr.drawRect({ x: ox, y: oy + ts, w: ts, h: g }, COL_BACKGROUND);
    drawGt(dr, ox + g2, oy + ts + g4, g2, g2, g2, -g2, clueColour(f, F_ERROR_DOWN, F_SPENT_DOWN, fg));
    dr.drawUpdate({ x: ox, y: oy + ts, w: ts, h: g });
  }
  if (f & F_ADJ_LEFT) {
    dr.drawRect({ x: ox - g, y: oy, w: g, h: ts }, COL_BACKGROUND);
    drawGt(dr, ox - g4, oy + g2, -g2, g2, g2, g2, clueColour(f, F_ERROR_LEFT, F_SPENT_LEFT, fg));
    dr.drawUpdate({ x: ox - g, y: oy, w: g, h: ts });
  }
}

/** Draw the adjacency bars relevant to a cell (Adjacent mode); only RIGHT and
 * DOWN need drawing (each gap is owned once). A pure error (numbers adjacent
 * where they should not be) draws an outline red bar. */
function drawAdjs(
  dr: GameDrawing,
  ts: number,
  ox: number,
  oy: number,
  f: number,
  fg: number,
): void {
  const g = gap(ts);
  const g38 = Math.floor((3 * (g + 1)) / 8);
  const g4 = Math.floor((g + 1) / 4);

  if (f & (F_ADJ_RIGHT | F_ERROR_RIGHT)) {
    if (f & F_ADJ_RIGHT) {
      dr.drawRect(
        { x: ox + ts + g38, y: oy, w: g4, h: ts },
        clueColour(f, F_ERROR_RIGHT, F_SPENT_RIGHT, fg),
      );
    } else {
      rectOutline(dr, ox + ts + g38, oy, g4, ts, COL_ERROR);
    }
  } else {
    dr.drawRect({ x: ox + ts + g38, y: oy, w: g4, h: ts }, COL_BACKGROUND);
  }
  dr.drawUpdate({ x: ox + ts, y: oy, w: g, h: ts });

  if (f & (F_ADJ_DOWN | F_ERROR_DOWN)) {
    if (f & F_ADJ_DOWN) {
      dr.drawRect(
        { x: ox, y: oy + ts + g38, w: ts, h: g4 },
        clueColour(f, F_ERROR_DOWN, F_SPENT_DOWN, fg),
      );
    } else {
      rectOutline(dr, ox, oy + ts + g38, ts, g4, COL_ERROR);
    }
  } else {
    dr.drawRect({ x: ox, y: oy + ts + g38, w: ts, h: g4 }, COL_BACKGROUND);
  }
  dr.drawUpdate({ x: ox, y: oy + ts, w: ts, h: g });
}

/** A stroked rectangle outline (the canvas `Drawing` has no native one). */
function rectOutline(
  dr: GameDrawing,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: number,
): void {
  dr.drawPolygon(
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    -1,
    colour,
  );
}

// --- per-cell drawing ------------------------------------------------------

const DF_IMMUTABLE = 1 << 20; // composed flag (clear of F_* bits)

function drawCell(
  dr: GameDrawing,
  ts: number,
  state: UnequalState,
  ui: UnequalUi,
  x: number,
  y: number,
  num: number,
  flags: number,
  pencil: number,
  wrong: boolean,
  hflash: boolean,
  hint: number,
): void {
  const o = state.order;
  const ox = coord(x, ts);
  const oy = coord(y, ts);
  const hon = ui.hshow && x === ui.hx && y === ui.hy;

  // Hint overlay (hint-authoring §5.3): target cell (COL_HINT) > evidence cell
  // (COL_HINT_CELL) > cursor highlight > flash > background. `struck` is the set
  // of candidates this firing rules out, drawn crossed through among the marks.
  const hintTarget = (hint & 1) !== 0;
  const hintArea = (hint & 2) !== 0;
  const struck = hint >> 2; // bit (2 + n) ⇒ candidate n struck
  let bg = hflash ? COL_HIGHLIGHT : COL_BACKGROUND;
  if (hon && !ui.hpencil) bg = COL_HIGHLIGHT;
  if (hintArea) bg = COL_HINT_CELL;
  // A solid COL_HINT background is the *placement*-target fill. A strike step
  // also flags its cell as a target, but its struck candidates are drawn over
  // the background, so painting it COL_HINT would wash them out — fill solid
  // only when nothing is struck here (a placement); a strike keeps the lighter
  // background so the crossed-through digit stays legible.
  if (hintTarget && struck === 0) bg = COL_HINT;

  // Clear the square.
  dr.drawRect({ x: ox, y: oy, w: ts, h: ts }, bg);

  // Pencil-mode highlight: a top-left triangle.
  if (hon && ui.hpencil) {
    dr.drawPolygon(
      [
        { x: ox, y: oy },
        { x: ox + Math.floor(ts / 2), y: oy },
        { x: ox, y: oy + Math.floor(ts / 2) },
      ],
      COL_HIGHLIGHT,
      COL_HIGHLIGHT,
    );
  }

  // Box outline (also the cursor).
  rectOutline(dr, ox, oy, ts, ts, COL_GRID);
  dr.drawUpdate({ x: ox, y: oy, w: ts, h: ts });

  // Inter-cell clue signs.
  if (state.mode === "adjacent") drawAdjs(dr, ts, ox, oy, flags, COL_GRID);
  else drawGts(dr, ts, ox, oy, flags, COL_TEXT);

  if (num > 0) {
    const colour = flags & DF_IMMUTABLE ? COL_TEXT : flags & F_ERROR ? COL_ERROR : COL_GUESS;
    dr.drawText(
      { x: ox + Math.floor(ts / 2), y: oy + Math.floor(ts / 2) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: Math.floor((3 * ts) / 4),
      },
      colour,
      n2c(num, o),
    );
  } else {
    drawHints(dr, ts, o, ox, oy, pencil, struck);
  }

  // Check & Save mistake overlay (fork addition): an inset red outline.
  if (wrong) {
    for (const inset of [2, 3]) rectOutline(dr, ox + inset, oy + inset, ts - 2 * inset, ts - 2 * inset, COL_ERROR);
  }
}

/** Pencil-mark grid (upstream `draw_hints`, stolen from solo). A candidate in
 * `struck` (bit `1 << n`) is a hint-ruled-out mark, drawn in its normal pencil
 * colour with a same-colour strikethrough — high-contrast, reads as a real note,
 * and the line is the "ruled out" cue (hint-authoring §5.3). */
function drawHints(
  dr: GameDrawing,
  ts: number,
  o: number,
  ox: number,
  oy: number,
  pencil: number,
  struck = 0,
): void {
  let nhints = 0;
  for (let i = 0; i < o; i++) if (pencil & (1 << (i + 1))) nhints++;
  if (nhints === 0) return;

  let hw = 1;
  while (hw * hw < nhints) hw++;
  if (hw < 3) hw = 3;
  let hh = Math.floor((nhints + hw - 1) / hw);
  if (hh < 2) hh = 2;
  const hmax = Math.max(hw, hh);
  const fontsz = Math.floor(ts / ((hmax * (11 - hmax)) / 8));

  let j = 0;
  for (let i = 0; i < o; i++) {
    if (pencil & (1 << (i + 1))) {
      const hx = j % hw;
      const hy = Math.floor(j / hw);
      const cx = ox + Math.floor(((4 * hx + 3) * ts) / (4 * hw + 2));
      const cy = oy + Math.floor(((4 * hy + 3) * ts) / (4 * hh + 2));
      dr.drawText(
        { x: cx, y: cy },
        {
          align: "center",
          baseline: "mathematical",
          fontType: "variable",
          size: fontsz,
        },
        COL_PENCIL,
        n2c(i + 1, o),
      );
      if (struck & (1 << (i + 1))) {
        const r = Math.max(2, Math.floor(fontsz / 3));
        dr.drawLine({ x: cx - r, y: cy }, { x: cx + r, y: cy }, COL_PENCIL, 2);
      }
      j++;
    }
  }
}

/** The pencil-mode indicator: the shared diagonal pencil glyph, drawn in the
 * empty top-right border corner (outside the grid, never overlapping a cell or a
 * gap clue) — the same corner Towers uses, via the same {@link drawPencilGlyph}. */
function drawPencilIndicator(dr: GameDrawing, order: number, ts: number, on: boolean): void {
  const b = border(ts);
  const ox = drawSize(order, ts) - b;
  dr.drawRect({ x: ox, y: 0, w: b, h: b }, COL_BACKGROUND);
  if (on) drawPencilGlyph(dr, ox, 0, b, COL_PENCIL_BODY, COL_GRID);
  dr.drawUpdate({ x: ox, y: 0, w: b, h: b });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: UnequalDrawState | null,
  _prev: UnequalState | null,
  state: UnequalState,
  _dir: number,
  ui: UnequalUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<UnequalMove, UnequalHint>,
  mistakes?: readonly { x: number; y: number }[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const o = state.order;
  const total = drawSize(o, ts);

  if (!ds.started) {
    dr.drawRect({ x: 0, y: 0, w: total, h: total }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: total, h: total });
  }

  const hflash =
    flashTime > 0 && (flashTime <= FLASH_TIME / 3 || flashTime >= (FLASH_TIME * 2) / 3);

  // Live error flags + mistake overlay.
  checkComplete(state, ds.errFlags);
  ds.wrong.fill(0);
  if (mistakes) for (const m of mistakes) ds.wrong[m.y * o + m.x] = 1;

  // Pack the displayed hint overlay per cell.
  ds.hint.pack(hint?.highlights, (x, y) => y * o + x, (m) => hintMarkBit(m.n));

  const hchanged =
    ds.hx !== ui.hx || ds.hy !== ui.hy || ds.hshow !== ui.hshow || ds.hpencil !== ui.hpencil;

  for (let x = 0; x < o; x++) {
    for (let y = 0; y < o; y++) {
      const i = y * o + x;
      const num = state.grid[i];
      const flags =
        state.clueFlags[i] |
        state.spent[i] |
        ds.errFlags[i] |
        (state.immutable[i] ? DF_IMMUTABLE : 0);
      const pencil = num === 0 ? state.pencil[i] : 0;

      let stale = !ds.started || hflash !== ds.hflash;
      if (hchanged && ((x === ui.hx && y === ui.hy) || (x === ds.hx && y === ds.hy)))
        stale = true;
      if (ds.nums[i] !== num) stale = true;
      if (ds.flags[i] !== flags) stale = true;
      if (ds.wrong[i] !== ds.drawnWrong[i]) stale = true;
      if (ds.hint.stale(i)) stale = true;
      if (num === 0) {
        for (let n = 0; n < o; n++) {
          if (ds.hints[i * o + n] !== ((pencil >> (n + 1)) & 1)) stale = true;
        }
      }

      if (stale) {
        drawCell(
          dr,
          ts,
          state,
          ui,
          x,
          y,
          num,
          flags,
          pencil,
          ds.wrong[i] !== 0,
          hflash,
          ds.hint.packed[i],
        );
        ds.nums[i] = num;
        ds.flags[i] = flags;
        ds.drawnWrong[i] = ds.wrong[i];
        ds.hint.commit(i);
        for (let n = 0; n < o; n++) ds.hints[i * o + n] = (pencil >> (n + 1)) & 1;
      }
    }
  }

  // Pencil-mode indicator (fork addition).
  if (!ds.started || ds.pencilModeShown !== ui.hpencil) {
    drawPencilIndicator(dr, o, ts, ui.hpencil);
    ds.pencilModeShown = ui.hpencil;
  }

  ds.hx = ui.hx;
  ds.hy = ui.hy;
  ds.hshow = ui.hshow;
  ds.hpencil = ui.hpencil;
  ds.hflash = hflash;
  ds.started = true;
}
