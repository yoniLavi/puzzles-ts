/**
 * Towers (Skyscrapers) rendering — port of `game_redraw` / `draw_tile` from
 * `towers.c`.
 *
 * The board is modeled as a `(w+2) × (w+2)` array of tiles: a ring of clue
 * cells around a `w × w` play area. A filled play cell is drawn — under the 3D
 * appearance preference — as a tower whose drawn solid scales with its height
 * (the left and bottom faces protrude up-left), or, in 2D, as a plain centered
 * digit. Empty cells show their pencil marks in an auto-sized grid. Because a
 * 3D tower paints up-left into its neighbors, a changed tile is diffed and
 * repainted along with the three neighbors whose towers can reach into it
 * (the upstream four-corner cache key).
 */

import {
  clueDoneColor,
  ERROR,
  HINT_ACTION,
  HINT_EVIDENCE,
  highlightWash,
  INK,
  PENCIL_BODY,
  pencilColor,
  playerEntryColor,
} from "../../engine/color/palette.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { HintMarks, type MarkBand, type MarkCell } from "../../engine/hint-mark.ts";
import { drawHintOrdinal } from "../../engine/hint-ordinal.ts";
import {
  HINT_AREA,
  HINT_TARGET,
  hintMarkBit,
  type OrderedCell,
  OverlaySidecar,
} from "../../engine/overlay-sidecar.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
import type { Color, Size } from "../../engine/types.ts";
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
// Fork additions: the explained-hint legend (see docs/games/hints.md § "The element-type color legend").
export const COL_HINT = 8; // the acted-on cell's ring (drawn once per frame in redraw)
/** The driving clue's line of sight, outlined (same pass), **and** a forcing
 * chain's ordinal — one index, because the number indexes the evidence. */
export const COL_HINT_CELL = 9;

export function colors(defaultBackground: Color): Color[] {
  const bg = defaultBackground;
  const out: Color[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = INK;
  out[COL_USER] = playerEntryColor(bg);
  out[COL_HIGHLIGHT] = highlightWash(bg);
  out[COL_ERROR] = ERROR;
  out[COL_PENCIL] = pencilColor(bg);
  out[COL_DONE] = clueDoneColor(bg);
  out[COL_PENCIL_BODY] = PENCIL_BODY;
  out[COL_HINT] = HINT_ACTION;
  // Both hint marks are outlines on the cell's border, so both take a strong
  // color and differ in shape rather than in weight — a line of sight's contour
  // against one cell's ring. `HINT_EVIDENCE` covers the chain ordinal too; see
  // its doc comment for why the index and the thing it indexes are one role.
  out[COL_HINT_CELL] = HINT_EVIDENCE;
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
   * otherwise unchanged (docs/games/rendering.md § "The tile cache and the diff key"). */
  hint: OverlaySidecar;
  /** `(w+2)²` mistake-overlay sidecar (fork addition). Neither overlay changes
   * a cell's tile value, so both must be in the diff key — this one is where
   * that was learned: a Check & Save on an already-drawn cell repainted nothing. */
  wrong: OverlaySidecar;
  /** The hint target's ring and the evidence area's outline (fork additions),
   * drawn once per frame after the tile loop. See {@link markBand}. */
  marks: HintMarks;
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
    marks: new HintMarks(),
  };
}

export function setTileSize(ds: TowersDrawState, ts: number): void {
  ds.tilesize = ts;
}

/**
 * Where a hint mark sits around cell `(x, y)` — **on the cell's own border**,
 * the outline `drawTile` already paints there, rather than in a gutter.
 *
 * Towers has no gutter: `coord` puts consecutive tiles at a `TILESIZE` pitch and
 * each fills its whole square, so the grid the player sees is the one-pixel box
 * outline at each tile's edge. The band therefore lies wholly *inside* the box
 * (`outer` 0), which is also what undoes it — a cell whose overlay changes
 * repaints itself and takes its mark with it, so there is nothing for
 * {@link HintMarks} to erase.
 *
 * There is room for it because a Towers cell holds at most six pencil marks, so
 * the layout search settles on a 3×2 grid whose glyph ink clears the tile edge by
 * about a quarter of the font size. That is a fact about Towers, not about
 * candidate games in general: Keen and Solo pack up to sixteen marks into the
 * same square and have no such slack, which is why they mark in the gutter.
 *
 * `x`/`y` are play coordinates, so `-1` and `w` are the clue ring — a hint's
 * evidence names the clue it reasons from as well as the line it sees.
 */
function markBand(ds: TowersDrawState, x: number, y: number): MarkBand {
  const ts = ds.tilesize;
  return {
    box: { x: coord(x, ts), y: coord(y, ts), w: ts, h: ts },
    outer: 0,
    inner: Math.max(2, ts >> 4),
  };
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
  hintOrder: number,
): void {
  let tx = coord(x, ts);
  let ty = coord(y, ts);
  const digit = tile & DF_DIGIT_MASK;
  // Hint overlay: both cell-level marks are read in `redraw`, which rings the
  // target and outlines the evidence area on the cell's own border, so a hint
  // never paints over the digits it is talking about. What is left here is
  // `struck`, the set of candidate heights this firing rules out, crossed
  // through among the pencil marks.
  const struck = hint >> 2;
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
    let color: number;
    if (tile & DF_ERROR) color = COL_ERROR;
    else if (tile & DF_CLUE_DONE) color = COL_DONE;
    else if (x < 0 || y < 0 || x >= w || y >= w) color = COL_GRID;
    else if (tile & DF_IMMUTABLE) color = COL_GRID;
    else color = COL_USER;

    dr.drawText(
      { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: tile & DF_PLAYAREA ? Math.floor(ts / 2) : Math.floor((ts * 2) / 5),
      },
      color,
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

      // Choose a grid layout maximizing the font size.
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
          // The struck candidate keeps its normal pencil color (high contrast,
          // reads as a real note); the strikethrough line — drawn in the same
          // COL_PENCIL color as the digit — is the cue that the hint is ruling
          // it out. Coloring either against the lighter hint background washed
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

  // A forcing chain's place in the order it fires, so the narration can cite
  // the cells by number rather than asking the player to reconstruct the chain
  // (`walk-tactic-hint-chains`). `tx`/`ty` are the *drawn* origin, already
  // offset for a 3D tower's top face, so the ordinal follows the tile it
  // belongs to rather than floating over the one behind it.
  if (hintOrder > 0)
    drawHintOrdinal(dr, { x: tx, y: ty }, ts, hintOrder, COL_HINT_CELL);
}

// --- hint overlay ----------------------------------------------------------

/** Highlight payload a Towers hint step carries (built in `index.ts`). Defined
 * here so `redraw` can consume it without a circular import. See
 * docs/games/hints.md § "The element-type color legend" for the element-type legend. */
export interface TowersHint {
  /** The driving clue's line of sight, shaded `COL_HINT_CELL`. A forcing
   * chain's cells additionally carry their place in it, drawn as an ordinal. */
  area: OrderedCell[];
  /** The cell(s) the deduction acts on, marked `COL_HINT`. */
  targets: { x: number; y: number }[];
  /** The candidate digit(s) ruled out, shown struck in `COL_HINT`. */
  marks: { x: number; y: number; n: number }[];
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: TowersDrawState,
  _prev: TowersState | null,
  state: TowersState,
  _dir: number,
  ui: TowersUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<TowersMove, TowersHint>,
  mistakes?: readonly { x: number; y: number }[],
): void {
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
      if (ui.cursor.visible && ui.cursor.x === x && ui.cursor.y === y)
        tile |= ui.hpencil ? DF_HIGHLIGHT_PENCIL : DF_HIGHLIGHT;
      if (state.immutable[y * w + x]) tile |= DF_IMMUTABLE;
      if (flash) tile |= DF_HIGHLIGHT;
      if (ds.errtmp[(y + 1) * W + (x + 1)]) tile |= DF_ERROR;
      ds.tiles[(y + 1) * W + (x + 1)] = tile;
    }
  }

  // Pencil-mode indicator in the top-right clue-ring corner (W-pos (w+1, 0)).
  // Towers protrude up-left, so nothing ever overlaps this corner; it is also
  // no cell's up-left neighbor, so the diff cache repaints it cleanly on
  // toggle. Driven straight off the persistent `hpencil` mode flag.
  if (ui.hpencil) ds.tiles[w + 1] |= DF_PENCIL_MODE;

  // Diff and repaint, drawing each changed cell's tower-overlapping neighbors.
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
        drawTile(
          dr,
          ts,
          w,
          threeD,
          x - 1,
          y - 1,
          tr,
          ds.wrong.at(i),
          ds.hint.packed[i],
          ds.hint.order[i],
        );
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
            ds.hint.order[y * W + (x - 1)],
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
            ds.hint.order[(y + 1) * W + x],
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
            ds.hint.order[(y + 1) * W + (x - 1)],
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

  // The hint marks, **once per frame after the tile loop** and outside every
  // clip. Once, because Towers repaints each tile up to four times inside a
  // single clip (a 3D tower spills into the cells up and to the left of its
  // own); after and unclipped, so a neighbor's tower cannot bury the mark.
  const targets: MarkCell[] = [];
  const evidence: MarkCell[] = [];
  for (let i = 0; i < W * W; i++) {
    const c = { x: (i % W) - 1, y: ((i / W) | 0) - 1 };
    if (ds.hint.packed[i] & HINT_TARGET) targets.push(c);
    if (ds.hint.packed[i] & HINT_AREA) evidence.push(c);
  }
  ds.marks.paint(dr, targets, evidence, {
    band: (x, y) => markBand(ds, x, y),
    targetColor: COL_HINT,
    evidenceColor: COL_HINT_CELL,
  });

  ds.started = true;
}
