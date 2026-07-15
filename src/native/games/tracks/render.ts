/**
 * Tracks rendering — a faithful port of `game_redraw` / `draw_square` /
 * `draw_tracks_specific` / `draw_clue` from `tracks.c`, using the
 * `NARROW_BORDERS` geometry the web build compiles (zero gutter, a one-tile
 * margin holding the clue numbers and the A/B entrance/exit labels).
 *
 * Two per-tile `Int32Array`s (`flags` + `flagsDrag`) mirror upstream's
 * committed-vs-drag-preview drawstate; the `findMistakes` overlay rides an
 * `OverlaySidecar` so it is part of the diff key (playbook §3.2). The palette
 * is index-for-index with the C colour enum.
 */
import type { Colour, Point, Rect, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import { copyAndApplyDrag } from "./moves.ts";
import {
  ALLDIR,
  D,
  L,
  NBITS,
  R,
  S_CLUE,
  S_ERROR,
  S_FLASH_MASK,
  S_FLASH_SHIFT,
  S_NOTRACK,
  S_TRACK,
  sECount,
  sEDirs,
  stateToBoard,
  type TracksMistake,
  type TracksMove,
  type TracksState,
  type TracksUi,
  U,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 33;
export const FLASH_TIME = 0.5;

// --- palette (mirrors the tracks.c colour enum index-for-index) -----------
export const COL_BACKGROUND = 0;
export const COL_TRACK_BACKGROUND = 1;
export const COL_GRID = 2;
export const COL_CLUE = 3;
export const COL_CURSOR = 4;
export const COL_TRACK = 5;
export const COL_TRACK_CLUE = 6;
export const COL_SLEEPER = 7;
export const COL_DRAGON = 8;
export const COL_DRAGOFF = 9;
export const COL_ERROR = 10;
export const COL_FLASH = 11;
export const COL_ERROR_BACKGROUND = 12;

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight } = mkhighlight(defaultBackground);
  const mix = (a: Colour, b: Colour, p: number): Colour => [
    a[0] * (1 - p) + b[0] * p,
    a[1] * (1 - p) + b[1] * p,
    a[2] * (1 - p) + b[2] * p,
  ];
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_TRACK_BACKGROUND] = highlight;
  out[COL_GRID] = mix(background, highlight, 0.5);
  out[COL_TRACK_CLUE] = [0, 0, 0];
  out[COL_TRACK] = [0.5, 0.5, 0.5];
  out[COL_CLUE] = [0, 0, 0];
  out[COL_CURSOR] = [0.3, 0.3, 0.3];
  out[COL_ERROR_BACKGROUND] = [1, 1, 1];
  out[COL_SLEEPER] = [0.5, 0.4, 0.1];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_DRAGON] = [0, 0, 1];
  out[COL_DRAGOFF] = [0.8, 0.8, 1];
  out[COL_FLASH] = [1, 1, 1];
  return out;
}

// --- draw-state flag bits (upstream DS_*) ---------------------------------
const DS_ERROR = 1 << 8;
const DS_CLUE = 1 << 9;
const DS_NOTRACK = 1 << 10;
const DS_FLASH = 1 << 11;
const DS_CURSOR = 1 << 12;
const DS_TRACK = 1 << 13;
const DS_NSHIFT = 16; // R/U/L/D shift for no-track edge flags
const DS_CSHIFT = 20; // R/U/L/D shift for cursor-on-edge

// --- geometry (NARROW_BORDERS → border 0) ---------------------------------

export interface Metrics {
  sz6: number;
  tile: number;
  border: number;
  gridLineAll: number;
  gridLineTl: number;
  gridLineBr: number;
}

export function metrics(tileSize: number): Metrics {
  const sz6 = Math.floor(tileSize / 6);
  const tile = sz6 * 6;
  const gridLineAll = Math.max(Math.floor(tile / 16), 1);
  const gridLineBr = Math.floor(gridLineAll / 2);
  return {
    sz6,
    tile,
    border: 0,
    gridLineAll,
    gridLineTl: gridLineAll - gridLineBr,
    gridLineBr,
  };
}

export const coord = (n: number, m: Metrics) => (n + 1) * m.tile + m.border;
export const centeredCoord = (n: number, m: Metrics) =>
  coord(n, m) + Math.floor(m.tile / 2);

export function computeSize(p: { w: number; h: number }, tileSize: number): Size {
  const m = metrics(tileSize);
  return { w: (p.w + 2) * m.tile + 2 * m.border, h: (p.h + 2) * m.tile + 2 * m.border };
}

// --- draw state -----------------------------------------------------------

export interface TracksDrawState {
  started: boolean;
  tileSize: number;
  w: number;
  h: number;
  flags: Int32Array;
  flagsDrag: Int32Array;
  numErrors: Int32Array;
  wrong: OverlaySidecar;
}

export function newDrawState(state: TracksState): TracksDrawState {
  const n = state.w * state.h;
  return {
    started: false,
    tileSize: 0,
    w: state.w,
    h: state.h,
    flags: new Int32Array(n).fill(-1),
    flagsDrag: new Int32Array(n).fill(-1),
    numErrors: new Int32Array(state.w + state.h).fill(-1),
    wrong: new OverlaySidecar(n),
  };
}

// --- primitive drawing helpers --------------------------------------------

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

function circleSleepers(
  dr: GameDrawing,
  m: Metrics,
  cx: number,
  cy: number,
  r2: number,
  thickness: number,
  c: number,
): void {
  const qr6 = Math.PI / 12;
  const qr3 = Math.PI / 6;
  const r1 = (m.sz6 * 2) / 2; // THIRDSZ / 2
  for (let i = 0; i < 12; i++) {
    const th = qr6 + i * qr3;
    thickLine(
      dr,
      thickness,
      cx + r1 * Math.cos(th),
      cy + r1 * Math.sin(th),
      cx + r2 * Math.cos(th),
      cy + r2 * Math.sin(th),
      c,
    );
  }
}

function thickCircleOutline(
  dr: GameDrawing,
  thickness: number,
  cx: number,
  cy: number,
  r: number,
  colour: number,
): void {
  const circ4 = 0.5 * Math.PI * r;
  const nseg = Math.floor(circ4 / 4) * 4;
  if (nseg <= 0) return;
  const ang = (2 * Math.PI) / nseg;
  for (let i = 0; i < nseg; i++) {
    const th = ang * i;
    const th2 = ang * (i + 1);
    thickLine(
      dr,
      thickness,
      cx + r * Math.cos(th),
      cy + r * Math.sin(th),
      cx + r * Math.cos(th2),
      cy + r * Math.sin(th2),
      colour,
    );
  }
}

function drawTracksSpecific(
  dr: GameDrawing,
  m: Metrics,
  x: number,
  y: number,
  flags: number,
  ctrack: number,
  csleeper: number,
): void {
  const ox = coord(x, m);
  const oy = coord(y, m);
  const t1 = m.tile;
  const t3 = m.tile / 3;
  const t6 = m.tile / 6;
  const thickTrack = m.tile / 8;
  const thickSleeper = m.tile / 12;

  if (flags === (L | R)) {
    for (let i = 1; i <= 7; i += 2) {
      const cx = ox + (m.tile / 8) * i;
      thickLine(dr, thickSleeper, cx, oy + t6, cx, oy + t6 + 2 * t3, csleeper);
    }
    thickLine(dr, thickTrack, ox, oy + t3, ox + m.tile, oy + t3, ctrack);
    thickLine(dr, thickTrack, ox, oy + 2 * t3, ox + m.tile, oy + 2 * t3, ctrack);
    return;
  }
  if (flags === (U | D)) {
    for (let i = 1; i <= 7; i += 2) {
      const cy = oy + (m.tile / 8) * i;
      thickLine(dr, thickSleeper, ox + t6, cy, ox + t6 + 2 * t3, cy, csleeper);
    }
    thickLine(dr, thickTrack, ox + t3, oy, ox + t3, oy + m.tile, ctrack);
    thickLine(dr, thickTrack, ox + 2 * t3, oy, ox + 2 * t3, oy + m.tile, ctrack);
    return;
  }
  if (
    flags === (U | L) ||
    flags === (D | L) ||
    flags === (U | R) ||
    flags === (D | R)
  ) {
    const cx = flags & L ? ox : ox + m.tile;
    const cy = flags & U ? oy : oy + m.tile;
    circleSleepers(dr, m, cx, cy, 5 * t6, thickSleeper, csleeper);
    thickCircleOutline(dr, thickTrack, cx, cy, 2 * t3, ctrack);
    thickCircleOutline(dr, thickTrack, cx, cy, t3, ctrack);
    return;
  }

  // Stub(s): one or more single directions.
  for (let d = 1; d < 16; d *= 2) {
    if (!(flags & d)) continue;
    for (let i = 1; i <= 2; i++) {
      let ox1 = 0;
      let ox2 = 0;
      let oy1 = 0;
      let oy2 = 0;
      if (d === L) {
        ox1 = 0;
        ox2 = thickTrack;
        oy1 = oy2 = i * t3;
      } else if (d === R) {
        ox1 = t1;
        ox2 = t1 - thickTrack;
        oy1 = oy2 = i * t3;
      } else if (d === U) {
        ox1 = ox2 = i * t3;
        oy1 = 0;
        oy2 = thickTrack;
      } else if (d === D) {
        ox1 = ox2 = i * t3;
        oy1 = t1;
        oy2 = t1 - thickTrack;
      }
      thickLine(dr, thickTrack, ox + ox1, oy + oy1, ox + ox2, oy + oy2, ctrack);
    }
  }
}

/** Pick which of the committed vs drag bits to draw and the drag colour
 * (upstream `best_bits`). Returns the bits and, when the two differ, the
 * drag-on / drag-off colour. */
function bestBits(
  flags: number,
  flagsDrag: number,
  col: number,
): { bits: number; col: number } {
  const nbOrig = NBITS[flags & ALLDIR];
  const nbDrag = NBITS[flagsDrag & ALLDIR];
  if (nbOrig > nbDrag) return { bits: flags & ALLDIR, col: COL_DRAGOFF };
  if (nbOrig < nbDrag) return { bits: flagsDrag & ALLDIR, col: COL_DRAGON };
  return { bits: flags & ALLDIR, col };
}

function drawSquare(
  dr: GameDrawing,
  m: Metrics,
  x: number,
  y: number,
  flags: number,
  flagsDrag: number,
  wrong: boolean,
): void {
  const t2 = m.sz6 * 3; // HALFSZ
  const t16 = Math.floor((m.sz6 * 3) / 4); // HALFSZ/4
  const ox = coord(x, m);
  const oy = coord(y, m);
  let cx = ox + t2;
  let cy = oy + t2;
  const lineThick = Math.max(Math.floor(m.tile / 16), 1);

  dr.clip({ x: ox, y: oy, w: m.tile, h: m.tile });

  // Background (in the drag colour when the drag toggles this square's track).
  const bg = bestBits(
    (flags & DS_TRACK) === DS_TRACK ? 1 : 0,
    (flagsDrag & DS_TRACK) === DS_TRACK ? 1 : 0,
    flags & DS_TRACK ? COL_TRACK_BACKGROUND : COL_BACKGROUND,
  ).col;
  dr.drawRect({ x: ox, y: oy, w: m.tile, h: m.tile }, COL_GRID);
  dr.drawRect(
    {
      x: ox + m.gridLineTl,
      y: oy + m.gridLineTl,
      w: m.tile - m.gridLineAll,
      h: m.tile - m.gridLineAll,
    },
    bg,
  );

  // Cursor outline (centre, or nudged onto an edge).
  if (flags & DS_CURSOR) {
    const off = t16;
    let curx = ox + off;
    let cury = oy + off;
    let curw = m.tile - 2 * off + 1;
    let curh = m.tile - 2 * off + 1;
    if (flags & (U << DS_CSHIFT)) {
      cury = oy - off;
      curh = 2 * off + 1;
    } else if (flags & (D << DS_CSHIFT)) {
      cury = oy + m.tile - off;
      curh = 2 * off + 1;
    } else if (flags & (L << DS_CSHIFT)) {
      curx = ox - off;
      curw = 2 * off + 1;
    } else if (flags & (R << DS_CSHIFT)) {
      curx = ox + m.tile - off;
      curw = 2 * off + 1;
    }
    rectOutline(dr, { x: curx, y: cury, w: curw, h: curh }, COL_CURSOR);
  }

  // Tracks.
  const c =
    flags & DS_ERROR
      ? COL_ERROR
      : flags & DS_FLASH
        ? COL_FLASH
        : flags & DS_CLUE
          ? COL_TRACK_CLUE
          : COL_TRACK;
  const track = bestBits(flags, flagsDrag, c);
  drawTracksSpecific(dr, m, x, y, track.bits, track.col, COL_SLEEPER);

  // No-track square mark (a central cross).
  const sq = bestBits(
    (flags & DS_NOTRACK) === DS_NOTRACK ? 1 : 0,
    (flagsDrag & DS_NOTRACK) === DS_NOTRACK ? 1 : 0,
    COL_TRACK,
  );
  if (sq.bits) {
    const off = Math.floor(t2 / 2);
    thickLine(dr, lineThick, cx - off, cy - off, cx + off, cy + off, sq.col);
    thickLine(dr, lineThick, cx - off, cy + off, cx + off, cy - off, sq.col);
  }

  // No-track edge marks (a cross on the edge midpoint).
  const edge = bestBits(flags >> DS_NSHIFT, flagsDrag >> DS_NSHIFT, COL_TRACK);
  for (let d = 1; d < 16; d *= 2) {
    const off = t16;
    cx = ox + t2;
    cy = oy + t2;
    if (edge.bits & d) {
      cx += d === R ? t2 : d === L ? -t2 : 0;
      cy += d === D ? t2 : d === U ? -t2 : 0;
      thickLine(dr, lineThick, cx - off, cy - off, cx + off, cy + off, edge.col);
      thickLine(dr, lineThick, cx - off, cy + off, cx + off, cy - off, edge.col);
    }
  }

  // findMistakes overlay: an inset red outline (the fork's mistake styling).
  if (wrong) {
    const t = Math.max(1, Math.floor(m.tile / 16));
    const inset = Math.max(2, Math.floor(m.tile / 8));
    const sx = ox + inset;
    const sy = oy + inset;
    const span = m.tile - 2 * inset;
    dr.drawRect({ x: sx, y: sy, w: span, h: t }, COL_ERROR);
    dr.drawRect({ x: sx, y: sy + span - t, w: span, h: t }, COL_ERROR);
    dr.drawRect({ x: sx, y: sy, w: t, h: span }, COL_ERROR);
    dr.drawRect({ x: sx + span - t, y: sy, w: t, h: span }, COL_ERROR);
  }

  dr.unclip();
  dr.drawUpdate({ x: ox, y: oy, w: m.tile, h: m.tile });
}

/** A one-pixel rectangle outline (upstream `draw_rect_outline`). */
function rectOutline(dr: GameDrawing, rect: Rect, colour: number): void {
  const { x, y, w, h } = rect;
  dr.drawRect({ x, y, w, h: 1 }, colour);
  dr.drawRect({ x, y: y + h - 1, w, h: 1 }, colour);
  dr.drawRect({ x, y, w: 1, h }, colour);
  dr.drawRect({ x: x + w - 1, y, w: 1, h }, colour);
}

function drawClue(
  dr: GameDrawing,
  m: Metrics,
  w: number,
  clue: number,
  i: number,
  col: number,
  bg: number,
): void {
  const tsz = Math.floor(m.tile / 2);
  let cx: number;
  let cy: number;
  if (i < w) {
    cx = centeredCoord(i, m);
    cy = centeredCoord(-1, m);
  } else {
    cx = centeredCoord(w, m);
    cy = centeredCoord(i - w, m);
  }
  if (bg >= 0) {
    dr.drawRect(
      {
        x: cx - tsz + m.gridLineTl,
        y: cy - tsz + m.gridLineTl,
        w: m.tile - m.gridLineAll,
        h: m.tile - m.gridLineAll,
      },
      bg,
    );
  }
  dr.drawText(
    { x: cx, y: cy },
    { align: "center", baseline: "mathematical", fontType: "variable", size: tsz },
    col,
    String(clue),
  );
}

function drawLoopEnds(
  dr: GameDrawing,
  m: Metrics,
  state: TracksState,
  c: number,
): void {
  const tsz = Math.floor(m.tile / 2);
  const label = (p: Point, text: string) =>
    dr.drawText(
      p,
      { align: "center", baseline: "mathematical", fontType: "variable", size: tsz },
      c,
      text,
    );
  label({ x: centeredCoord(-1, m), y: centeredCoord(state.numbers.rowS, m) }, "A");
  label({ x: centeredCoord(state.numbers.colS, m), y: centeredCoord(state.h, m) }, "B");
}

// --- per-tile draw flags (upstream s2d_flags) -----------------------------

function s2dFlags(
  b: ReturnType<typeof stateToBoard>,
  x: number,
  y: number,
  ui: TracksUi,
): number {
  const w = b.w;
  let f = sEDirs(b, x, y, 1 /* E_TRACK */);
  f |= sEDirs(b, x, y, 2 /* E_NOTRACK */) << DS_NSHIFT;
  const sf = b.sflags[y * w + x];
  if (sf & S_ERROR) f |= DS_ERROR;
  if (sf & S_CLUE) f |= DS_CLUE;
  if (sf & S_NOTRACK) f |= DS_NOTRACK;
  if (sf & S_TRACK || sECount(b, x, y, 1) > 0) f |= DS_TRACK;
  if (ui.cursorActive) {
    if (
      ui.curx >= x * 2 &&
      ui.curx <= (x + 1) * 2 &&
      ui.cury >= y * 2 &&
      ui.cury <= (y + 1) * 2
    ) {
      f |= DS_CURSOR;
      if (ui.curx === x * 2) f |= L << DS_CSHIFT;
      if (ui.curx === (x + 1) * 2) f |= R << DS_CSHIFT;
      if (ui.cury === y * 2) f |= U << DS_CSHIFT;
      if (ui.cury === (y + 1) * 2) f |= D << DS_CSHIFT;
    }
  }
  return f;
}

// --- redraw ---------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: TracksDrawState | null,
  _prev: TracksState | null,
  state: TracksState,
  _dir: number,
  ui: TracksUi,
  _animTime: number,
  flashTime: number,
  _hint?: HintStep<TracksMove>,
  mistakes?: readonly TracksMistake[],
): void {
  if (!ds) return;
  const m = metrics(ds.tileSize);
  const { w, h } = state;
  let force = false;

  if (!ds.started) {
    // The engine paints no pixels of its own: fill the whole background.
    const size = computeSize(state, ds.tileSize);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    drawLoopEnds(dr, m, state, COL_CLUE);
    dr.drawRect(
      {
        x: coord(0, m) - m.gridLineBr,
        y: coord(0, m) - m.gridLineBr,
        w: w * m.tile + m.gridLineAll,
        h: h * m.tile + m.gridLineAll,
      },
      COL_GRID,
    );
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
    force = true;
  }

  // Clue numbers in the margin.
  for (let i = 0; i < w + h; i++) {
    if (force || state.numErrors[i] !== ds.numErrors[i]) {
      ds.numErrors[i] = state.numErrors[i];
      drawClue(
        dr,
        m,
        w,
        state.numbers.numbers[i],
        i,
        ds.numErrors[i] ? COL_ERROR : COL_CLUE,
        ds.numErrors[i] ? COL_ERROR_BACKGROUND : COL_BACKGROUND,
      );
    }
  }

  const board = stateToBoard(state);
  const dragBoard = ui.dragging ? copyAndApplyDrag(board, ui) : null;

  ds.wrong.packCells(mistakes, (x, y) => y * w + x);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      let flashing = 0;
      if (flashTime > 0) {
        const flashpos =
          ((state.sflags[i] >> S_FLASH_SHIFT) & S_FLASH_MASK) / S_FLASH_MASK;
        if (
          flashTime > (FLASH_TIME / 2) * flashpos &&
          flashTime <= (FLASH_TIME / 2) * (flashpos + 1)
        ) {
          flashing = DS_FLASH;
        }
      }
      const f = s2dFlags(board, x, y, ui) | flashing;
      const fD = dragBoard ? s2dFlags(dragBoard, x, y, ui) : f;
      if (f !== ds.flags[i] || fD !== ds.flagsDrag[i] || ds.wrong.stale(i) || force) {
        drawSquare(dr, m, x, y, f, fD, ds.wrong.at(i));
        ds.flags[i] = f;
        ds.flagsDrag[i] = fD;
        ds.wrong.commit(i);
      }
    }
  }
}
