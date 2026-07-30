/**
 * Mathrax rendering — port of `game_redraw` from `mathrax.c`.
 *
 * The board is an `o × o` grid of bordered squares drawn on a black backing
 * rectangle. Each clue is drawn as a circle straddling an interior grid
 * *intersection*, so every clue is painted up to four times — once from each
 * cell it touches, clipped to that cell — which lets the per-tile cache repaint
 * a clue's quarter (and recolour it red) as that cell's error state changes.
 *
 * A cell's pixels depend only on its own digit, pencil marks and flags, so one
 * packed `Int32Array` per-tile cache suffices; the (fork) Check-&-Save mistake
 * overlay rides in an `OverlaySidecar` so it repaints a cell that is otherwise
 * unchanged (playbook §3.2).
 *
 * **One deliberate geometric divergence**: upstream's web build has `BORDER 1`,
 * leaving nowhere to show the pencil-mode indicator every pencil-mark game ships
 * (playbook §3.7). The canvas therefore gains a half-tile strip *below* the
 * board for it. The grid's own geometry is untouched, so pointer mapping and
 * `computeSize`'s width are exactly upstream's.
 */

import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import { ERROR, INK, PENCIL_BODY } from "../../engine/palette.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
import {
  CLUE_ADD,
  CLUE_DIV,
  CLUE_EVN,
  CLUE_MUL,
  CLUE_ODD,
  CLUE_SUB,
  clueNum,
  clueType,
  F_IMMUTABLE,
  FE_BOTLEFT,
  FE_BOTRIGHT,
  FE_COUNT,
  FE_TOPLEFT,
  FE_TOPRIGHT,
  type MathraxState,
  type MathraxUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 40;
export const FLASH_TIME = 0.7;
const FLASH_FRAME = 0.1;

/** Upstream's `NARROW_BORDERS` arm — the web build compiles with it defined, so
 * the board's border is one pixel, not half a tile (playbook §3.2). */
export const BORDER = 1;

// --- palette (index-for-index with the upstream COL_* enum) ----------------

export const COL_BACKGROUND = 0;
export const COL_HIGHLIGHT = 1;
export const COL_LOWLIGHT = 2;
export const COL_BORDER = 3;
export const COL_GUESS = 4;
export const COL_PENCIL = 5;
export const COL_ERROR = 6;
export const COL_ERRORBG = 7;
/** Fork addition, appended past the upstream enum (Mathrax has no dark-mode
 * `paletteOverrides`, so appending is safe): the pencil-mode indicator's body. */
export const COL_PENCIL_BODY = 8;

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_BORDER] = INK;
  out[COL_GUESS] = [0, 0.5, 0];
  out[COL_PENCIL] = [0, 0.5, 0.5];
  out[COL_ERROR] = ERROR;
  // Faithful to upstream: the red channel is saturated and the other two are
  // derived from the *background*, so the error wash tints rather than replaces.
  out[COL_ERRORBG] = [1, 0.85 * background[1], 0.85 * background[2]];
  out[COL_PENCIL_BODY] = PENCIL_BODY;
  return out;
}

// --- draw-only flags (upstream FD_*) ---------------------------------------

const FD_FLASH = 0x100;
const FD_CURSOR = 0x200;
const FD_PENCIL = 0x400;

// --- geometry --------------------------------------------------------------

/** Height of the fork pencil-mode indicator strip below the board. */
const indicatorSize = (ts: number): number => (ts / 2) | 0;

export function computeSize(p: { o: number }, ts: number): Size {
  const side = p.o * ts + 2 * BORDER;
  return { w: side, h: side + indicatorSize(ts) };
}

/** Upstream `FROMCOORD` — C integer division, which **truncates** toward zero,
 * so a pointer inside the one-pixel border maps to row/column 0 rather than −1
 * (the same idiom Sticks needed; playbook §3.8e). */
export function fromCoord(v: number, ts: number): number {
  return Math.trunc((v - BORDER) / ts);
}

// --- draw state ------------------------------------------------------------

export interface MathraxDrawState {
  started: boolean;
  tilesize: number;
  o: number;
  /** `o²` packed last-drawn tile values (−1 = never drawn): the digit in bits
   * 0–3, the pencil-mark bitmap (which itself starts at bit 1) in bits 4–13,
   * and the cell + draw flags in bits 14–24. */
  tiles: Int32Array;
  /** `o²` Check-&-Save mistake overlay. */
  wrong: OverlaySidecar;
  /** Whether the pencil-mode indicator was on last frame. */
  pencilModeShown: boolean;
}

export function newDrawState(state: MathraxState): MathraxDrawState {
  const o = state.params.o;
  return {
    started: false,
    tilesize: 0,
    o,
    tiles: new Int32Array(o * o).fill(-1),
    wrong: new OverlaySidecar(o * o),
    pencilModeShown: false,
  };
}

export function setTileSize(ds: MathraxDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- clue drawing ----------------------------------------------------------

const MINUS_SIGN = "−";
const TIMES_SIGN = "×";
const DIVIDE_SIGN = "÷";

/** The clue's label (upstream `mathrax_clue_label`); a subtraction clue of 0 is
 * the equality clue, which reads `=`. */
export function clueLabel(clue: number): string {
  const n = clueNum(clue);
  switch (clueType(clue)) {
    case CLUE_ADD:
      return `${n}+`;
    case CLUE_SUB:
      return n ? `${n}${MINUS_SIGN}` : "=";
    case CLUE_MUL:
      return `${n}${TIMES_SIGN}`;
    case CLUE_DIV:
      return `${n}${DIVIDE_SIGN}`;
    case CLUE_EVN:
      return "E";
    case CLUE_ODD:
      return "O";
    default:
      return "";
  }
}

function drawClue(
  dr: GameDrawing,
  ts: number,
  clue: number,
  x: number,
  y: number,
  error: boolean,
): void {
  if (!clue) return;
  dr.drawCircle(
    { x, y },
    (ts / 3) | 0,
    error ? COL_ERRORBG : COL_HIGHLIGHT,
    error ? COL_ERROR : COL_BORDER,
  );
  dr.drawText(
    { x, y },
    {
      align: "center",
      baseline: "mathematical",
      fontType: "variable",
      size: (ts / 3) | 0,
    },
    COL_BORDER,
    clueLabel(clue),
  );
}

// --- tile drawing ----------------------------------------------------------

function drawTile(
  dr: GameDrawing,
  ds: MathraxDrawState,
  state: MathraxState,
  x: number,
  y: number,
  fs: number,
  wrong: boolean,
): void {
  const ts = ds.tilesize;
  const o = state.params.o;
  const co = o - 1;
  const i = y * o + x;
  const tx = BORDER + x * ts;
  const ty = BORDER + y * ts;

  dr.clip({ x: tx, y: ty, w: ts, h: ts });
  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });

  dr.drawRect(
    { x: tx, y: ty, w: ts, h: ts },
    fs & (FD_FLASH | FD_CURSOR) ? COL_LOWLIGHT : COL_BACKGROUND,
  );

  // Pencil-mode highlight: a triangle in the cell's top-left corner.
  if (fs & FD_PENCIL) {
    dr.drawPolygon(
      [
        { x: tx, y: ty },
        { x: tx + ((ts / 2) | 0), y: ty },
        { x: tx, y: ty + ((ts / 2) | 0) },
      ],
      COL_LOWLIGHT,
      COL_LOWLIGHT,
    );
  }

  // The cell's own outline.
  dr.drawPolygon(
    [
      { x: tx, y: ty - 1 },
      { x: tx + ts, y: ty - 1 },
      { x: tx + ts, y: ty + ts - 1 },
      { x: tx, y: ty + ts - 1 },
    ],
    -1,
    COL_BORDER,
  );

  if (state.grid[i]) {
    dr.drawText(
      { x: tx + ((ts / 2) | 0), y: ty + ((ts / 2) | 0) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: (ts / 2) | 0,
      },
      fs & F_IMMUTABLE ? COL_BORDER : fs & FE_COUNT ? COL_ERROR : COL_GUESS,
      String(state.grid[i]),
    );
  } else if (state.marks[i]) {
    drawPencilMarks(dr, ts, tx, ty, state.marks[i], o);
  }

  // The (up to) four clues at this cell's corners, each coloured by *this*
  // cell's error flag for that corner.
  if (y < o - 1 && x < o - 1)
    drawClue(dr, ts, state.clues[y * co + x], tx + ts, ty + ts, !!(fs & FE_BOTRIGHT));
  if (y > 0 && x < o - 1)
    drawClue(dr, ts, state.clues[(y - 1) * co + x], tx + ts, ty, !!(fs & FE_TOPRIGHT));
  if (y < o - 1 && x > 0)
    drawClue(dr, ts, state.clues[y * co + x - 1], tx, ty + ts, !!(fs & FE_BOTLEFT));
  if (y > 0 && x > 0)
    drawClue(dr, ts, state.clues[(y - 1) * co + x - 1], tx, ty, !!(fs & FE_TOPLEFT));

  // Check & Save mistake overlay (fork addition): an inset red outline.
  if (wrong) {
    for (const inset of [2, 3]) {
      const l = tx + inset;
      const t = ty + inset;
      const r = tx + ts - 1 - inset;
      const b = ty + ts - 1 - inset;
      dr.drawLine({ x: l, y: t }, { x: r, y: t }, COL_ERROR, 1);
      dr.drawLine({ x: r, y: t }, { x: r, y: b }, COL_ERROR, 1);
      dr.drawLine({ x: r, y: b }, { x: l, y: b }, COL_ERROR, 1);
      dr.drawLine({ x: l, y: b }, { x: l, y: t }, COL_ERROR, 1);
    }
  }

  dr.unclip();
}

/** The auto-sized pencil-mark grid (upstream's layout arithmetic verbatim —
 * integer division throughout). Note the marks bitmap is in this port's
 * player-facing convention, bit `n` for candidate `n`. */
function drawPencilMarks(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  marks: number,
  o: number,
): void {
  let nhints = 0;
  for (let n = 1; n <= o; n++) if (marks & (1 << n)) nhints++;
  if (!nhints) return;

  let hw = 1;
  while (hw * hw < nhints) hw++;
  if (hw < 3) hw = 3;
  let hh = ((nhints + hw - 1) / hw) | 0;
  if (hh < 2) hh = 2;
  const hmax = Math.max(hw, hh);
  const fontsz = (ts / (((hmax * (11 - hmax)) / 8) | 0)) | 0;

  let j = 0;
  for (let n = 1; n <= o; n++) {
    if (!(marks & (1 << n))) continue;
    const hx = j % hw;
    const hy = (j / hw) | 0;
    dr.drawText(
      {
        x: tx + ((((4 * hx + 3) * ts) / (4 * hw + 2)) | 0),
        y: ty + ((((4 * hy + 3) * ts) / (4 * hh + 2)) | 0),
      },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: fontsz,
      },
      COL_PENCIL,
      String(n),
    );
    j++;
  }
}

// --- pencil-mode indicator (fork addition) ---------------------------------

function drawPencilIndicator(
  dr: GameDrawing,
  o: number,
  ts: number,
  on: boolean,
): void {
  const size = indicatorSize(ts);
  const oy = o * ts + 2 * BORDER;
  const ox = computeSize({ o }, ts).w - size;
  dr.drawRect({ x: ox, y: oy, w: size, h: size }, COL_BACKGROUND);
  if (on) drawPencilGlyph(dr, ox, oy, size, COL_PENCIL_BODY, COL_BORDER);
  dr.drawUpdate({ x: ox, y: oy, w: size, h: size });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: MathraxDrawState | null,
  _prev: MathraxState | null,
  state: MathraxState,
  _dir: number,
  ui: MathraxUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly { x: number; y: number }[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const o = state.params.o;
  const size = computeSize({ o }, ts);
  const firstFrame = !ds.started;

  if (!ds.started) {
    // The engine paints no pixels of its own (playbook §3.2) — the game fills
    // its whole canvas, then the black rectangle the cell outlines sit on.
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawRect({ x: BORDER, y: BORDER - 1, w: o * ts + 1, h: o * ts + 1 }, COL_BORDER);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  const flash = flashTime > 0 ? Math.floor(flashTime / FLASH_FRAME) % 3 : -1;
  ds.wrong.packCells(mistakes, (x, y) => y * o + x);

  for (let y = 0; y < o; y++) {
    for (let x = 0; x < o; x++) {
      const i = y * o + x;
      let fs = state.flags[i];

      if (flashTime > 0 && (x + y) % 3 === flash) fs |= FD_FLASH;
      if (flashTime === 0 && ui.cshow && ui.hx === x && ui.hy === y)
        fs |= ui.cpencil ? FD_PENCIL : FD_CURSOR;

      const tile = state.grid[i] | (state.marks[i] << 4) | (fs << 14);
      if (ds.tiles[i] !== tile || ds.wrong.stale(i)) {
        drawTile(dr, ds, state, x, y, fs, ds.wrong.at(i));
        ds.tiles[i] = tile;
        ds.wrong.commit(i);
      }
    }
  }

  if (firstFrame || ds.pencilModeShown !== ui.cpencil) {
    drawPencilIndicator(dr, o, ts, ui.cpencil);
    ds.pencilModeShown = ui.cpencil;
  }
}
