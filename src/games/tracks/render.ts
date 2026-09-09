/**
 * Tracks rendering — a faithful port of `game_redraw` / `draw_square` /
 * `draw_tracks_specific` / `draw_clue` from `tracks.c`, using the
 * `NARROW_BORDERS` geometry the web build compiles (zero gutter, a one-tile
 * margin holding the clue numbers and the A/B entrance/exit labels).
 *
 * Two per-tile `Int32Array`s (`flags` + `flagsDrag`) mirror upstream's
 * committed-vs-drag-preview drawstate; the `findMistakes` overlay rides an
 * `OverlaySidecar` so it is part of the diff key (docs/games/rendering.md § "Overlay sidecars"). The palette
 * is index-for-index with the C color enum.
 */

import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import { BROWN, GRAY } from "../../engine/color/colors.ts";
import {
  CURSOR,
  DRAG_ADD,
  DRAG_REMOVE,
  ERROR,
  FLASH,
  HINT_ACTION,
  HINT_EVIDENCE,
  INK,
  PAPER,
} from "../../engine/color/palette.ts";
import { tracksGrid } from "../../engine/color/palette-games.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { drawMarkSides, MARK_ALL, outlineSides } from "../../engine/hint-mark.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import type { Color, Point, Rect, Size } from "../../engine/types.ts";
import type { TracksHighlights } from "./hint.ts";
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

// --- palette (mirrors the tracks.c color enum index-for-index) -----------
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
/**
 * The hint's action color, past the end of the C enum.
 *
 * **The collection's default blue, kept rather than moved**, and the claimant
 * worth naming is `COL_DRAGON`, which is the same `DRAG_ADD` blue Galaxies
 * moved its hint away from (docs/games/hints.md § "The element-type color
 * legend"). The reasoning that made Galaxies yield does not transfer: there the
 * drag ring and the hint ring pointed at *different* dots, so one hue carried
 * two contradictory claims about the same object. Here the drag preview
 * recolors a square's own rails and crosses while a hint is drawn as a border
 * ring, an edge stub or an edge cross, and the two only ever coincide when the
 * player is dragging to place what the hint just asked for, where agreeing is
 * the point. Tracks' other spent hue is `COL_CURSOR` green, which is the
 * per-game affordance the Sticks precedent says should yield rather than blue.
 */
export const COL_HINT = 13;
/** The hint's evidence color: teal, the collection's, distinct in hue from the
 * action so the words map to the picture. */
export const COL_HINT_CELL = 14;

export function colors(defaultBackground: Color): Color[] {
  const { background, highlight } = mkhighlight(defaultBackground);
  const out: Color[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_TRACK_BACKGROUND] = highlight;
  // Kept a derivation: the grid sits between the board and the track bed drawn
  // in its highlight, and the rails below are gray, which a gray grid would be.
  out[COL_GRID] = tracksGrid(background, highlight);
  out[COL_TRACK_CLUE] = INK;
  // The rails are gray; that is the color, not a grid role.
  out[COL_TRACK] = GRAY;
  out[COL_CLUE] = INK;
  out[COL_CURSOR] = CURSOR;
  // White behind a red clue digit, so the red pops; a red wash would sit red
  // under red.
  out[COL_ERROR_BACKGROUND] = PAPER;
  out[COL_SLEEPER] = BROWN;
  out[COL_ERROR] = ERROR;
  out[COL_DRAGON] = DRAG_ADD;
  out[COL_DRAGOFF] = DRAG_REMOVE;
  out[COL_FLASH] = FLASH;
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE;
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

// --- hint draw flags ------------------------------------------------------
//
// A word of its own rather than more bits in `DS_*`, and a second `Int32Array`
// beside `flags`/`flagsDrag` in the drawstate: that is what puts the overlay in
// the tile cache's diff key, which is the whole of the bug class
// `hint-overlay.test.ts` guards (docs/games/rendering.md § "The tile cache and
// the diff key"). Edge bits are set on **both** squares that share the edge, so
// each paints its own clipped half exactly as the game's own edge crosses do.
const H_RING = 1 << 0; // the square is a target: ring it
const H_EMPTY = 1 << 1; // ...and the move marks it empty, so echo the cross
const H_AREA_SHIFT = 2; // 4 bits: which sides of the evidence outline to paint
const H_TRACK_SHIFT = 6; // 4 bits: sides the step forces to carry track
const H_BLOCK_SHIFT = 10; // 4 bits: sides the step forces blocked
const H_CITED_SHIFT = 14; // 4 bits: sides the deduction reasons from

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
  /** Per-clue: the error flag, plus a bit for "the hint counts with this clue". */
  numErrors: Int32Array;
  /** Per-square hint marks — part of the diff key, see the `H_*` bits. */
  hint: Int32Array;
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
    hint: new Int32Array(n),
    wrong: new OverlaySidecar(n),
  };
}

/** The `H_*` word for every square, from the displayed step. */
function hintFlags(
  state: TracksState,
  step?: HintStep<TracksMove, TracksHighlights>,
): Int32Array {
  const { w, h } = state;
  const out = new Int32Array(w * h);
  const hl = step?.highlights;
  if (!hl) return out;

  const mark = (x: number, y: number, bits: number): void => {
    if (x >= 0 && x < w && y >= 0 && y < h) out[y * w + x] |= bits;
  };
  /** Set `shift`'s direction bit on both squares sharing the edge. */
  const markEdge = (x: number, y: number, dir: number, shift: number): void => {
    mark(x, y, dir << shift);
    const fd = ((dir << 2) | (dir >> 2)) & 0xf; // upstream FLIP
    mark(
      x + (dir === R ? 1 : dir === L ? -1 : 0),
      y + (dir === D ? 1 : dir === U ? -1 : 0),
      fd << shift,
    );
  };

  for (const t of hl.targets) mark(t.x, t.y, H_RING | (t.track ? 0 : H_EMPTY));
  for (const e of hl.targetEdges) {
    markEdge(e.x, e.y, e.dir, e.track ? H_TRACK_SHIFT : H_BLOCK_SHIFT);
  }
  for (const e of hl.areaEdges) markEdge(e.x, e.y, e.dir, H_CITED_SHIFT);

  // One contour round a contiguous region, one ring per scattered cell — the
  // shared rule, so the picture never draws a boundary the deduction did not
  // reason across (`engine/hint-mark.ts`).
  const inArea = new Set(hl.area.map((c) => c.y * w + c.x));
  for (const c of hl.area) {
    const sides = outlineSides(c.x, c.y, (ax, ay) => inArea.has(ay * w + ax));
    mark(c.x, c.y, sides << H_AREA_SHIFT);
  }
  return out;
}

// --- primitive drawing helpers --------------------------------------------

function thickLine(
  dr: GameDrawing,
  thickness: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number,
): void {
  dr.drawLine(
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    color,
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
  color: number,
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
      color,
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
  drawTrackStubs(dr, m, x, y, flags, ctrack);
}

/**
 * The pair of short rail ends poking into a square from each named side.
 *
 * Split out of {@link drawTracksSpecific}'s last branch so the hint can borrow
 * the game's own vocabulary for "track runs through this side" without also
 * borrowing the finished rails-and-sleepers a full piece is drawn with
 * (docs/games/hints.md § "Echo the move's shape in the hint color"). Stubs are
 * the right shape for a suggestion precisely because they are what an
 * *unfinished* square already looks like.
 */
function drawTrackStubs(
  dr: GameDrawing,
  m: Metrics,
  x: number,
  y: number,
  dirs: number,
  color: number,
): void {
  const ox = coord(x, m);
  const oy = coord(y, m);
  const t1 = m.tile;
  const t3 = m.tile / 3;
  const thickTrack = m.tile / 8;
  for (let d = 1; d < 16; d *= 2) {
    if (!(dirs & d)) continue;
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
      thickLine(dr, thickTrack, ox + ox1, oy + oy1, ox + ox2, oy + oy2, color);
    }
  }
}

/** Pick which of the committed vs drag bits to draw and the drag color
 * (upstream `best_bits`). Returns the bits and, when the two differ, the
 * drag-on / drag-off color. */
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

/** The cross the game draws for "no track here", at an arbitrary center. */
function drawCross(
  dr: GameDrawing,
  cx: number,
  cy: number,
  off: number,
  thickness: number,
  color: number,
): void {
  thickLine(dr, thickness, cx - off, cy - off, cx + off, cy + off, color);
  thickLine(dr, thickness, cx - off, cy + off, cx + off, cy - off, color);
}

/**
 * The hint marks for one square, drawn inside its clip after its own content.
 *
 * Every mark is the game's own vocabulary recolored, or a border band; nothing
 * is a fill, which is the cross-game rule `hint-mark.test.ts` enforces
 * (docs/games/hints.md § "Shade vs ring"). The three action shapes are
 * deliberately different from each other so the *shape* says which action is
 * being asked for and the color only says "not yet": a ring for a square, rail
 * stubs for a side that must carry track, a cross for a side that must be
 * blocked. Evidence is a plain bar along a cited side, a shape no action uses.
 */
function drawHintMarks(
  dr: GameDrawing,
  m: Metrics,
  x: number,
  y: number,
  hint: number,
): void {
  if (!hint) return;
  const ox = coord(x, m);
  const oy = coord(y, m);
  const t2 = m.sz6 * 3; // HALFSZ
  const band = m.gridLineAll;
  const lineThick = Math.max(Math.floor(m.tile / 16), 1);
  const box = { x: ox, y: oy, w: m.tile, h: m.tile };

  // Evidence first, so a target's ring wins any border the two share.
  const cited = (hint >> H_CITED_SHIFT) & ALLDIR;
  for (let d = 1; d < 16; d *= 2) {
    if (!(cited & d)) continue;
    const half = Math.max(2, Math.floor(m.tile / 5));
    const along = Math.max(2, Math.floor(band * 1.5));
    if (d === L || d === R) {
      const ex = d === L ? ox : ox + m.tile - along;
      dr.drawRect({ x: ex, y: oy + t2 - half, w: along, h: 2 * half }, COL_HINT_CELL);
    } else {
      const ey = d === U ? oy : oy + m.tile - along;
      dr.drawRect({ x: ox + t2 - half, y: ey, w: 2 * half, h: along }, COL_HINT_CELL);
    }
  }
  const area = (hint >> H_AREA_SHIFT) & MARK_ALL;
  if (area) drawMarkSides(dr, { box, outer: 0, inner: band }, area, COL_HINT_CELL);

  // Actions.
  const stubs = (hint >> H_TRACK_SHIFT) & ALLDIR;
  if (stubs) drawTrackStubs(dr, m, x, y, stubs, COL_HINT);
  const blocked = (hint >> H_BLOCK_SHIFT) & ALLDIR;
  for (let d = 1; d < 16; d *= 2) {
    if (!(blocked & d)) continue;
    const cx = ox + t2 + (d === R ? t2 : d === L ? -t2 : 0);
    const cy = oy + t2 + (d === D ? t2 : d === U ? -t2 : 0);
    drawCross(dr, cx, cy, Math.floor((m.sz6 * 3) / 4), lineThick, COL_HINT);
  }
  if (hint & H_EMPTY) {
    drawCross(dr, ox + t2, oy + t2, Math.floor(t2 / 2), lineThick, COL_HINT);
  }
  if (hint & H_RING)
    drawMarkSides(dr, { box, outer: 0, inner: band }, MARK_ALL, COL_HINT);
}

function drawSquare(
  dr: GameDrawing,
  m: Metrics,
  x: number,
  y: number,
  flags: number,
  flagsDrag: number,
  wrong: boolean,
  hint: number,
): void {
  const t2 = m.sz6 * 3; // HALFSZ
  const t16 = Math.floor((m.sz6 * 3) / 4); // HALFSZ/4
  const ox = coord(x, m);
  const oy = coord(y, m);
  let cx = ox + t2;
  let cy = oy + t2;
  const lineThick = Math.max(Math.floor(m.tile / 16), 1);

  dr.clip({ x: ox, y: oy, w: m.tile, h: m.tile });

  // Background (in the drag color when the drag toggles this square's track).
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

  // Cursor outline (center, or nudged onto an edge).
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
  if (sq.bits) drawCross(dr, cx, cy, Math.floor(t2 / 2), lineThick, sq.col);

  // No-track edge marks (a cross on the edge midpoint).
  const edge = bestBits(flags >> DS_NSHIFT, flagsDrag >> DS_NSHIFT, COL_TRACK);
  for (let d = 1; d < 16; d *= 2) {
    cx = ox + t2;
    cy = oy + t2;
    if (edge.bits & d) {
      cx += d === R ? t2 : d === L ? -t2 : 0;
      cy += d === D ? t2 : d === U ? -t2 : 0;
      drawCross(dr, cx, cy, t16, lineThick, edge.col);
    }
  }

  drawHintMarks(dr, m, x, y, hint);

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
function rectOutline(dr: GameDrawing, rect: Rect, color: number): void {
  const { x, y, w, h } = rect;
  dr.drawRect({ x, y, w, h: 1 }, color);
  dr.drawRect({ x, y: y + h - 1, w, h: 1 }, color);
  dr.drawRect({ x, y, w: 1, h }, color);
  dr.drawRect({ x: x + w - 1, y, w: 1, h }, color);
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
  if (ui.cursor.visible) {
    if (
      ui.cursor.x >= x * 2 &&
      ui.cursor.x <= (x + 1) * 2 &&
      ui.cursor.y >= y * 2 &&
      ui.cursor.y <= (y + 1) * 2
    ) {
      f |= DS_CURSOR;
      if (ui.cursor.x === x * 2) f |= L << DS_CSHIFT;
      if (ui.cursor.x === (x + 1) * 2) f |= R << DS_CSHIFT;
      if (ui.cursor.y === y * 2) f |= U << DS_CSHIFT;
      if (ui.cursor.y === (y + 1) * 2) f |= D << DS_CSHIFT;
    }
  }
  return f;
}

// --- redraw ---------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: TracksDrawState,
  _prev: TracksState | null,
  state: TracksState,
  _dir: number,
  ui: TracksUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<TracksMove>,
  mistakes?: readonly TracksMistake[],
): void {
  const m = metrics(ds.tileSize);
  const { w, h } = state;
  let force = false;
  const hintMarks = hintFlags(
    state,
    hint as HintStep<TracksMove, TracksHighlights> | undefined,
  );
  const hintedClues = new Set(
    (hint as HintStep<TracksMove, TracksHighlights> | undefined)?.highlights?.clues ??
      [],
  );

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

  // Clue numbers in the margin. Half of several deductions lives out here
  // rather than on the grid, so the clue the hint counts with recolors with the
  // rest of the mark (docs/games/hints.md § "Off-board evidence") — which means
  // the hint has to be part of *this* surface's cache key too, not only the
  // per-tile one.
  for (let i = 0; i < w + h; i++) {
    const key = state.numErrors[i] | (hintedClues.has(i) ? 2 : 0);
    if (force || key !== ds.numErrors[i]) {
      ds.numErrors[i] = key;
      drawClue(
        dr,
        m,
        w,
        state.numbers.numbers[i],
        i,
        key & 1 ? COL_ERROR : key & 2 ? COL_HINT : COL_CLUE,
        key & 1 ? COL_ERROR_BACKGROUND : COL_BACKGROUND,
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
      const hf = hintMarks[i];
      if (
        f !== ds.flags[i] ||
        fD !== ds.flagsDrag[i] ||
        hf !== ds.hint[i] ||
        ds.wrong.stale(i) ||
        force
      ) {
        drawSquare(dr, m, x, y, f, fD, ds.wrong.at(i), hf);
        ds.flags[i] = f;
        ds.flagsDrag[i] = fD;
        ds.hint[i] = hf;
        ds.wrong.commit(i);
      }
    }
  }
}
