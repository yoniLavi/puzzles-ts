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

import { TEAL_BOLD } from "../../engine/colour/colours.ts";
import {
  ERROR,
  HINT_ACTION,
  HINT_ORDER,
  highlightWash,
  INK,
  PENCIL_BODY,
  pencilColour,
  playerEntryColour,
} from "../../engine/colour/palette.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { drawHintOrdinal } from "../../engine/hint-ordinal.ts";
import {
  HINT_AREA,
  HINT_TARGET,
  hintMarkBit,
  type OrderedCell,
  OverlaySidecar,
} from "../../engine/overlay-sidecar.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
import type { Colour, Size } from "../../engine/types.ts";
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
export const COL_HINT = 7; // the acted-on cell's ring (drawn in redraw's last block)
export const COL_HINT_CELL = 8; // the driving cage's outline (same block)
export const COL_HINT_ORDER = 9; // a forcing chain's ordinal, indexing the above

export function colours(defaultBackground: Colour): Colour[] {
  const bg = defaultBackground;
  const out: Colour[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = INK;
  out[COL_USER] = playerEntryColour(bg);
  out[COL_HIGHLIGHT] = highlightWash(bg);
  out[COL_ERROR] = ERROR;
  out[COL_PENCIL] = pencilColour(bg);
  out[COL_PENCIL_BODY] = PENCIL_BODY;
  out[COL_HINT] = HINT_ACTION;
  // Both hint marks are outlines in the grid gutter, so both take a **strong**
  // colour: `HINT_EVIDENCE` is a wash, sized to be read *through*, and an
  // outline is read *against*. They differ in shape as well as hue — a region's
  // contour against one cell's ring.
  //
  // Teal's **bold** step, not its base, because the bold step is the one defined
  // to be "dark in light mode, light in dark mode": it therefore stands off the
  // board by a similar margin in both schemes (0.48 / 0.64), where the base sits
  // at L 0.72 under either and comes out a soft line on a pale board and a
  // bright one on a dark board. `colour-dark-check` measures precisely that and
  // flags the base.
  out[COL_HINT_CELL] = TEAL_BOLD;
  out[COL_HINT_ORDER] = HINT_ORDER;
  return out;
}

/** Highlight payload a Keen hint step carries (built in `index.ts`). The
 * element-type legend (docs/games/hints.md § "The element-type colour legend"): the driving cage's cells shaded
 * `COL_HINT_CELL`, the acted-on cell(s) **ringed** `COL_HINT`, the ruled-out
 * candidate(s) shown struck. */
export interface KeenHint {
  /** The driving cage's cells (evidence), shaded `COL_HINT_CELL`. A forcing
   * chain's cells additionally carry their place in it, drawn as an ordinal. */
  area: OrderedCell[];
  /** The cell(s) the deduction acts on, ringed `COL_HINT`. */
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
  /** `w²` hint-overlay sidecar (fork addition): bit 0 = target cell, bit 1 =
   * evidence, bits 2.. = struck-candidate mask (`hintMarkBit(n)`). Owns the
   * repack/stale/commit dance that keeps the overlay in the cache diff key
   * (docs/games/rendering.md § "The tile cache and the diff key"). */
  hint: OverlaySidecar;
  /** `w²` mistake-overlay sidecar (fork addition) — same dance, so Check & Save
   * repaints a cell whose tile value is otherwise unchanged. */
  wrong: OverlaySidecar;
  /** Whether the pencil-mode indicator was on last frame (fork addition). */
  pencilModeShown: boolean;
  /** Cells currently carrying a hint-target ring, and cells currently inside the
   * outlined evidence region (fork additions). Both are drawn in the **gutter**,
   * which no tile repaints, so their removal has to be driven from here rather
   * than from the tile cache — see {@link drawCellSides}. */
  ringed: number[];
  evidenced: number[];
}

export function newDrawState(state: KeenState): KeenDrawState {
  const a = state.params.w * state.params.w;
  return {
    started: false,
    tilesize: 0,
    w: state.params.w,
    tiles: new Int32Array(a).fill(-1),
    errors: new Int32Array(a),
    hint: new OverlaySidecar(a),
    wrong: new OverlaySidecar(a),
    pencilModeShown: false,
    ringed: [],
    evidenced: [],
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
  hintOrder: number,
): void {
  const ts = ds.tilesize;
  const w = state.params.w;
  const ge = gridExtra(ts);
  const { dsf, minimal, clues } = state.clues;
  const cell = y * w + x;
  const drawClue = minimal[cell] === cell;

  // Hint overlay (docs/games/hints.md § "The element-type colour legend"): the
  // evidence cell washes COL_HINT_CELL, and the target is *ringed* COL_HINT at
  // the end of this function rather than competing for the background. `struck`
  // is the set of candidates this firing rules out, drawn crossed through among
  // the marks.
  // (both hint bits are read in `redraw`, which draws the target's ring and the
  // evidence region's outline in the gutter, so neither is a background here)
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

  // Background. No hint role appears here: the target's ring and the evidence
  // region's outline are both drawn in the gutter (see `redraw`), so a hint
  // never paints over the digits it is talking about.
  const bg = tile & DF_HIGHLIGHT ? COL_HIGHLIGHT : COL_BACKGROUND;
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
          // same-colour strikethrough — the "ruled out" cue (docs/games/hints.md § "The element-type colour legend").
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

  // A forcing chain's place in the order it fires, so the narration can cite
  // the cells by number instead of asking the player to reconstruct the chain
  // (`walk-tactic-hint-chains`). Drawn inside the clip, so it can never spill
  // into a neighbouring cage.
  if (hintOrder > 0)
    drawHintOrdinal(dr, { x: tx, y: ty }, ts - 2 * ge, hintOrder, COL_HINT_ORDER);

  dr.unclip();
  dr.drawUpdate({ x: cx, y: cy, w: cw, h: ch });
}

/** Sides of a cell, for {@link drawCellSides}. */
const S_TOP = 1;
const S_LEFT = 2;
const S_BOTTOM = 4;
const S_RIGHT = 8;
const S_ALL = S_TOP | S_LEFT | S_BOTTOM | S_RIGHT;

/**
 * Paint some sides of cell `(x, y)` **in its own gutter** — the grid line around
 * it — rather than inside the tile.
 *
 * Hint marks go here rather than behind the content, because a fill behind a
 * digit has to be pale enough to read through and no colour in the palette is:
 * `HINT_FILL` measures 1.91:1 against a pencil mark in light and 1.96 in dark,
 * and the only hues clearing ~2.6 sit next to `ERROR_WASH`, which would make the
 * cell a hint points at look like the cell that is wrong. Out here a mark is read
 * *against* rather than *through*, so it can take a strong colour.
 *
 * **There is no room inside the tile**, so this is not a matter of taste. Keen
 * lays its pencil marks across the *whole* tile — `pl = tx + (ts − fontsize·pw) /
 * 2` is a block as wide as the cell — leaving a glyph only its own few pixels of
 * font padding at the edge. Anything thick enough to read eats into it.
 *
 * Thickness is the gutter's **exact** width: neighbouring cell contents are
 * `2·ge + 1` apart (cell `x` ends at `border + x·ts − ge`, cell `x + 1` starts at
 * `border + (x + 1)·ts + 1 + ge`), which is the most a mark can take while
 * touching neither tile. It reads as a highlight by *colour*, not by weight.
 */
function drawCellSides(
  dr: GameDrawing,
  ds: KeenDrawState,
  x: number,
  y: number,
  sides: number,
  colour: number,
): void {
  const ts = ds.tilesize;
  const ge = gridExtra(ts);
  const g = 2 * ge + 1;
  const tx = border(ts) + x * ts + 1 + ge;
  const ty = border(ts) + y * ts + 1 + ge;
  const inner = ts - 1 - 2 * ge;
  const o = inner + 2 * g; // outer extent: the tile plus its gutter on both sides
  const l = tx - g;
  const t = ty - g;
  if (sides & S_TOP) dr.drawRect({ x: l, y: t, w: o, h: g }, colour);
  if (sides & S_LEFT) dr.drawRect({ x: l, y: t, w: g, h: o }, colour);
  if (sides & S_BOTTOM) dr.drawRect({ x: l, y: t + o - g, w: o, h: g }, colour);
  if (sides & S_RIGHT) dr.drawRect({ x: l + o - g, y: t, w: g, h: o }, colour);
  if (sides) dr.drawUpdate({ x: l, y: t, w: o, h: o });
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
  ds: KeenDrawState,
  _prev: KeenState | null,
  state: KeenState,
  _dir: number,
  ui: KeenUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<KeenMove, KeenHint>,
  mistakes?: readonly { x: number; y: number }[],
): void {
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

  // Pack both overlays per cell.
  const index = (x: number, y: number) => y * w + x;
  ds.hint.pack(hint?.highlights, index, (m) => hintMarkBit(m.n));
  ds.wrong.packCells(mistakes, index);

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

      if (ds.tiles[i] !== tile || ds.hint.stale(i) || ds.wrong.stale(i)) {
        drawTile(
          dr,
          ds,
          state,
          x,
          y,
          tile,
          state.params.multiplicationOnly,
          ds.wrong.at(i),
          ds.hint.packed[i],
          ds.hint.order[i],
        );
        ds.tiles[i] = tile;
        ds.hint.commit(i);
        ds.wrong.commit(i);
      }
    }
  }

  // The hint marks, **after** the tile loop and outside every clip, because they
  // live in the gutter: no tile owns those pixels, so a tile can neither paint
  // them nor rub them out. Two things follow that the tile cache cannot express,
  // and they are what `ds.ringed` / `ds.evidenced` are for:
  //
  //  - a mark that *moves or goes* must be erased explicitly, by painting its
  //    old gutter back to `COL_GRID`. The cell underneath does repaint (the
  //    sidecar sees the overlay change) but stops at its own edge;
  //  - a mark that *stays* is repainted every frame, unconditionally. These are
  //    a handful of thin rects, and a neighbouring cell repainting for its own
  //    reasons (a cursor move, an error appearing) widens its background into
  //    the shared gutter and would otherwise clip a side off.
  const ringed: number[] = [];
  const evidence: number[] = [];
  for (let i = 0; i < w * w; i++) {
    if (ds.hint.packed[i] & HINT_TARGET) ringed.push(i);
    if (ds.hint.packed[i] & HINT_AREA) evidence.push(i);
  }
  const isEvidence = (x: number, y: number): boolean =>
    x >= 0 && x < w && y >= 0 && y < w && (ds.hint.packed[y * w + x] & HINT_AREA) !== 0;

  // Restore every previously-marked gutter to COL_GRID before drawing anything,
  // all four sides: a side that is still wanted is repainted below, and going in
  // this order is what stops a shrinking region leaving an interior edge behind.
  const same =
    ringed.length === ds.ringed.length &&
    evidence.length === ds.evidenced.length &&
    ringed.every((v, k) => v === ds.ringed[k]) &&
    evidence.every((v, k) => v === ds.evidenced[k]);
  if (!same) {
    for (const i of [...ds.ringed, ...ds.evidenced])
      drawCellSides(dr, ds, i % w, (i / w) | 0, S_ALL, COL_GRID);
  }

  // The evidence region's **outline**. A wash over it would face the same squeeze
  // as a fill behind the target and lose it twice over: pale enough to read the
  // digits through leaves it too faint to read as a mark itself.
  //
  // One rule draws both shapes it needs: paint a side wherever the neighbour
  // across it is *not* also evidence. A contiguous region (a cage, a row) comes
  // out as a single contour; a scattered set (a forcing chain's cells) comes out
  // as one ring per cell, which is honest — they really are separate cells.
  for (const i of evidence) {
    const x = i % w;
    const y = (i / w) | 0;
    const sides =
      (isEvidence(x, y - 1) ? 0 : S_TOP) |
      (isEvidence(x - 1, y) ? 0 : S_LEFT) |
      (isEvidence(x, y + 1) ? 0 : S_BOTTOM) |
      (isEvidence(x + 1, y) ? 0 : S_RIGHT);
    drawCellSides(dr, ds, x, y, sides, COL_HINT_CELL);
  }
  // The target last, so it wins any gutter the two share.
  for (const i of ringed) drawCellSides(dr, ds, i % w, (i / w) | 0, S_ALL, COL_HINT);
  ds.ringed = ringed;
  ds.evidenced = evidence;

  // Pencil-mode indicator (fork addition).
  if (firstFrame || ds.pencilModeShown !== ui.hpencil) {
    drawPencilIndicator(dr, w, ts, ui.hpencil);
    ds.pencilModeShown = ui.hpencil;
  }
}
