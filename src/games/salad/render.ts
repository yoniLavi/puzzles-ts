/**
 * Salad rendering — the port of `game_redraw` and its helpers from `salad.c`.
 *
 * The board is `(order + 2)²` tiles: a genuine one-tile margin all round that
 * holds the ABC End View border clues (`FROMCOORD(x) = x/TILE_SIZE − 1`), with
 * the `order × order` play area inside it. Each play tile draws, in order, its
 * background (or a flash phase), the cursor / pencil-mode highlight, the cell
 * border, a **ball** (two concentric circles) or a **cross**, and then either
 * the entered symbol or the solo.c-style grid of pencil marks.
 *
 * Two error layers coexist, and they are not alternatives (docs/games/solver-and-generator.md § "The solvable-game contract"):
 * upstream's **live** rule check (a symbol repeated in a line, too many holes
 * in a line, a border clue the visible squares already contradict) reds the
 * offending glyph as you play, while the fork's **Check & Save** overlay marks
 * every square that contradicts the *unique solution* with an inset red box.
 */

import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import { GREEN_WASH } from "../../engine/color/colors.ts";
import {
  ERROR,
  HINT_ACTION,
  HINT_EVIDENCE,
  highlightWash,
  INK,
  PAPER,
  PENCIL_BODY,
  pencilColor,
  playerEntryColor,
} from "../../engine/color/palette.ts";
import { drawRectOutline, glyphFont } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { fromCoord as fromCoordE } from "../../engine/geometry.ts";
import { HintMarks, type MarkBand, type MarkCell } from "../../engine/hint-mark.ts";
import { drawHintOrdinal } from "../../engine/hint-ordinal.ts";
import {
  HINT_AREA,
  HINT_TARGET,
  hintMarkBit,
  OverlaySidecar,
} from "../../engine/overlay-sidecar.ts";
import {
  type PencilIndicatorBox,
  type PencilIndicatorStyle,
  repaintPencilIndicator,
} from "../../engine/pencil-indicator.ts";
import type { Color, Size } from "../../engine/types.ts";
import type { SaladHint } from "./hint.ts";
import type { SaladMistake } from "./solver.ts";
import {
  borderScans,
  CIRCLE,
  CROSS,
  GAMEMODE_LETTERS,
  type SaladMove,
  type SaladState,
  type SaladUi,
  scanDir,
  symbolChar,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 40;
export const FLASH_TIME = 0.7;
const FLASH_FRAME = 0.1;

// --- palette (index-for-index with the upstream COL_* enum) ----------------

export const COL_BACKGROUND = 0;
export const COL_HIGHLIGHT = 1;
export const COL_LOWLIGHT = 2;
export const COL_BORDER = 3;
export const COL_BORDERCLUE = 4;
export const COL_PENCIL = 5;
export const COL_I_NUM = 6; // immutable (given) colors
export const COL_I_BALL = 7;
export const COL_I_BALLBG = 8;
export const COL_I_HOLE = 9;
export const COL_G_NUM = 10; // the player's own guesses
export const COL_G_BALL = 11;
export const COL_G_BALLBG = 12;
export const COL_G_HOLE = 13;
export const COL_E_BORDERCLUE = 14; // live rule errors
export const COL_E_NUM = 15;
export const COL_E_HOLE = 16;
/** Fork addition: the Check & Save overlay outline. Appended past the upstream
 * enum, which is safe because `augmentation.ts` gives Salad no dark-mode
 * `paletteOverrides` keyed by index. */
export const COL_MISTAKE = 17;
/** Fork addition: the yellow body of the pencil-mode indicator glyph. */
export const COL_PENCIL_BODY = 18;
// Fork additions: the explained-hint legend (docs/games/hints.md § "The element-type color legend").
/** The square(s) / candidate(s) / entry the deduction acts on. */
export const COL_HINT = 19;
/** The deduction's evidence — a clue's line of sight, or a whole line, outlined
 * — **and** a forcing chain's ordinal, one index because the number indexes the
 * evidence. */
export const COL_HINT_CELL = 20;
/** Fork addition: the keyboard cursor's cell fill. Upstream used the bevel
 * lowlight, a tint of the board. */
export const COL_CURSOR = 21;

export function colors(defaultBackground: Color): Color[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Color[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_BORDER] = INK;
  out[COL_BORDERCLUE] = INK;
  out[COL_PENCIL] = pencilColor(background);
  out[COL_I_NUM] = INK;
  out[COL_I_BALL] = INK;
  out[COL_I_BALLBG] = PAPER;
  out[COL_I_HOLE] = INK;
  // The player's letter, ball ring and cross are one meaning — "you put this
  // here", against the given ones in ink — drawn in the entry green.
  out[COL_G_NUM] = playerEntryColor(background);
  out[COL_G_BALL] = playerEntryColor(background);
  out[COL_G_HOLE] = playerEntryColor(background);
  // The inside of the player's ball: the entry green as a fill, where a given
  // ball's inside is paper. No role covers an entry *fill*, so the named wash.
  out[COL_G_BALLBG] = GREEN_WASH;
  out[COL_E_BORDERCLUE] = ERROR;
  out[COL_E_NUM] = ERROR;
  out[COL_E_HOLE] = ERROR;
  out[COL_MISTAKE] = ERROR;
  out[COL_PENCIL_BODY] = PENCIL_BODY;
  out[COL_HINT] = HINT_ACTION;
  // Both hint marks are outlines on the square's border. A Salad square carries
  // a letter, a ghosted preview and up to three struck notes, so an evidence
  // wash would have to be pale enough to read all of that through — and at that
  // lightness it stops reading as a mark at all. `HINT_EVIDENCE` covers the
  // chain ordinal too; see its doc comment for why they are one role.
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  // A cell fill under the letter and notes: the "you are here" wash the Latin
  // family draws its cursor cell with (palette.ts, `CURSOR`).
  out[COL_CURSOR] = highlightWash(background);
  return out;
}

// --- tile flags (upstream FD_*) --------------------------------------------

const FD_CURSOR = 0x01;
const FD_PENCIL = 0x02;
const FD_ERROR = 0x04;
const FD_CIRCLE = 0x08;
const FD_CROSS = 0x10;
/** Fork addition, on a *border clue*: this clue is the premise of the hint on
 * screen, so it lights `COL_HINT`. It lives in `ds.borderfs`, which is already
 * the clue's whole cache key, so the highlight repaints for free. */
const FD_HINT = 0x20;

// --- hint overlay bits (packed into `ds.hint`) ------------------------------

/** Bits 0–1 are the shared target/area flags and bits 2+ the struck candidates
 * (`hintMarkBit(n)`, `n` up to `nums + 1` ⇒ at most bit 11). The *entry* a step
 * asks for — Salad has three move shapes, each echoed in the hint color — is
 * packed above them: a symbol `1..9` verbatim, or one of the two marker codes. */
const HINT_GHOST_SHIFT = 16;
const HINT_GHOST_MASK = 0xf << HINT_GHOST_SHIFT;
const GHOST_CROSS = 10;
const GHOST_CIRCLE = 11;

/** The packed ghost code for what a step writes, or 0 for "nothing". */
function ghostCode(ghost: "cross" | "circle" | number | undefined): number {
  if (ghost === undefined) return 0;
  if (ghost === "cross") return GHOST_CROSS << HINT_GHOST_SHIFT;
  if (ghost === "circle") return GHOST_CIRCLE << HINT_GHOST_SHIFT;
  return ghost << HINT_GHOST_SHIFT;
}

// --- geometry --------------------------------------------------------------

export function computeSize(p: { order: number }, ts: number): Size {
  const s = (p.order + 2) * ts;
  return { w: s, h: s };
}

/** Upstream `FROMCOORD`: the one-tile clue margin means cell 0 starts at
 * `TILE_SIZE`, and a click in the margin lands outside the play area. */
export function fromCoord(v: number, ts: number): number {
  return fromCoordE(v, ts, ts);
}

// --- draw state ------------------------------------------------------------

export interface SaladDrawState {
  started: boolean;
  tilesize: number;
  order: number;
  /** `order²` display flags for this frame (upstream `ds->gridfs`). */
  gridfs: Int32Array;
  /** `order²` last-drawn cache keys (−1 = never drawn). */
  drawn: Int32Array;
  /** `order*4` border-clue flags for this frame, and what was last drawn. */
  borderfs: Int32Array;
  borderDrawn: Int32Array;
  /** Check & Save overlay — kept in a sidecar so it is part of the cache-miss
   * test (docs/games/rendering.md § "The tile cache and the diff key"); it changes nothing in a cell's tile value. */
  wrong: OverlaySidecar;
  /** Explained-hint overlay, same rule: target/area flags, struck candidates and
   * the ghosted entry, none of which touch a square's tile value. */
  hint: OverlaySidecar;
  /** The hint target's ring and the evidence area's outline (fork additions),
   * drawn after the cell loop. See {@link markBand}. */
  marks: HintMarks;
  /** Scratch symbol/hole counts per line, refilled each frame. */
  rowcount: Int32Array;
  colcount: Int32Array;
  /** Whether the pencil-mode indicator was drawn last frame (it lives in the
   * clue margin, outside the per-tile cache). */
  pencilModeShown: boolean | null;
}

export function newDrawState(s: SaladState): SaladDrawState {
  const o = s.order;
  const o2 = o * o;
  return {
    started: false,
    tilesize: PREFERRED_TILE_SIZE,
    order: o,
    gridfs: new Int32Array(o2),
    drawn: new Int32Array(o2).fill(-1),
    borderfs: new Int32Array(o * 4),
    borderDrawn: new Int32Array(o * 4).fill(-1),
    wrong: new OverlaySidecar(o2),
    hint: new OverlaySidecar(o2),
    marks: new HintMarks(),
    rowcount: new Int32Array(o2),
    colcount: new Int32Array(o2),
    pencilModeShown: null,
  };
}

/**
 * Where a hint mark sits around square `(x, y)` — **on the square's own border**,
 * where the grid line already runs.
 *
 * Salad's squares tile exactly at a `TILESIZE` pitch, so the band lies wholly
 * inside the box (`outer` 0) and a square whose overlay changes repaints itself
 * and takes its mark with it. There is room because the content — a letter, a
 * ghosted preview, up to three struck notes — is laid out inside the square's
 * `drawBall`/`drawGhost` insets rather than to its edge.
 */
function markBand(ds: SaladDrawState, x: number, y: number): MarkBand {
  const ts = ds.tilesize;
  return {
    box: { x: (x + 1) * ts, y: (y + 1) * ts, w: ts, h: ts },
    outer: 0,
    inner: Math.max(2, ts >> 4),
  };
}

export function setTileSize(ds: SaladDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- live rule errors ------------------------------------------------------

/** Upstream `salad_set_drawflags`: per-cell display flags (cursor, pencil,
 * marker, live error) plus the border-clue error flags. */
function setDrawFlags(
  ds: SaladDrawState,
  ui: SaladUi,
  s: SaladState,
  cursorShown: boolean,
): void {
  const o = s.order;
  const nums = s.nums;
  const rowcount = ds.rowcount;
  const colcount = ds.colcount;
  rowcount.fill(0);
  colcount.fill(0);

  for (let x = 0; x < o; x++) {
    for (let y = 0; y < o; y++) {
      if (s.holes[y * o + x] === CROSS) {
        rowcount[y + nums * o]++;
        colcount[x + nums * o]++;
      } else if (s.grid[y * o + x]) {
        const d = s.grid[y * o + x] - 1;
        rowcount[y + d * o]++;
        colcount[x + d * o]++;
      }
    }
  }

  for (let x = 0; x < o; x++) {
    for (let y = 0; y < o; y++) {
      const i = y * o + x;
      let f = 0;
      if (cursorShown && ui.cursor.x === x && ui.cursor.y === y)
        f |= ui.pencilMode ? FD_PENCIL : FD_CURSOR;

      const d = s.grid[i];
      if (
        s.holes[i] === CROSS &&
        (rowcount[y + nums * o] > o - nums || colcount[x + nums * o] > o - nums)
      ) {
        f |= FD_ERROR;
      } else if (
        d > 0 &&
        (rowcount[y + (d - 1) * o] > 1 || colcount[x + (d - 1) * o] > 1)
      ) {
        f |= FD_ERROR;
      }

      if (s.holes[i] === CROSS) f |= FD_CROSS;
      if (s.holes[i] === CIRCLE) f |= FD_CIRCLE;
      ds.gridfs[i] = f;
    }
  }

  // Border clues: a clue is in error once the squares between it and the first
  // *known* content disagree with it. `scanDir(direct)` returns 0 while the
  // answer is still unknown, so an unfinished line is never flagged.
  for (let i = 0; i < o; i++) {
    for (const sc of borderScans(i, o)) {
      if (!s.borderclues[sc.clue]) continue;
      const c = scanDir(s.grid, s.holes, sc.start, sc.step, sc.end, true);
      if (c && c !== s.borderclues[sc.clue]) ds.borderfs[sc.clue] |= FD_ERROR;
      else ds.borderfs[sc.clue] &= ~FD_ERROR;
    }
  }
}

// --- tile painting ---------------------------------------------------------

function drawBall(
  dr: GameDrawing,
  ts: number,
  s: SaladState,
  x: number,
  y: number,
  flags: number,
  flash: number,
): void {
  const i = x + y * s.order;
  if (s.mode === GAMEMODE_LETTERS && s.grid[i] !== 0) return;

  const tx = (x + 1) * ts + Math.floor(ts / 2);
  const ty = (y + 1) * ts + Math.floor(ts / 2);

  let bg: number;
  if (s.mode !== GAMEMODE_LETTERS) {
    bg =
      (x + y) % 3 === flash
        ? COL_BACKGROUND
        : (x + y + 1) % 3 === flash
          ? COL_LOWLIGHT
          : s.gridclues[i]
            ? COL_I_BALLBG
            : COL_G_BALLBG;
  } else {
    // Letters mode draws the ball "transparent" over whatever is behind it.
    bg = flags & FD_CURSOR ? COL_CURSOR : COL_BACKGROUND;
  }
  const color = s.gridclues[i] ? COL_I_BALL : COL_G_BALL;

  dr.drawCircle({ x: tx, y: ty }, ts * 0.4, color, color);
  dr.drawCircle({ x: tx, y: ty }, ts * 0.38, bg, color);
}

function drawCross(
  dr: GameDrawing,
  ts: number,
  s: SaladState,
  x: number,
  y: number,
  flags: number,
  thick: number,
): void {
  const i = x + y * s.order;
  const color = s.gridclues[i]
    ? COL_I_HOLE
    : flags & FD_ERROR
      ? COL_E_HOLE
      : COL_G_HOLE;
  drawX(dr, (x + 1) * ts, (y + 1) * ts, ts, color, thick);
}

/** The two strokes of a cross over the tile at `(tx, ty)`. */
function drawX(
  dr: GameDrawing,
  tx: number,
  ty: number,
  ts: number,
  color: number,
  thick: number,
): void {
  dr.drawLine(
    { x: tx + ts * 0.2, y: ty + ts * 0.2 },
    { x: tx + ts * 0.8, y: ty + ts * 0.8 },
    color,
    thick,
  );
  dr.drawLine(
    { x: tx + ts * 0.2, y: ty + ts * 0.8 },
    { x: tx + ts * 0.8, y: ty + ts * 0.2 },
    color,
    thick,
  );
}

/** Upstream `salad_draw_pencil` — solo.c's candidate-grid layout, with the last
 * mark (bit `nums`) drawn as an `X` for "this square might be empty".
 *
 * `struck` is the hint's set of candidates this deduction rules out (bit `n` for
 * candidate `n`, so bit `nums + 1` is the X mark). A struck mark keeps its normal
 * pencil color — high contrast, still reading as a real note — and gains a
 * strikethrough, the Towers convention. */
function drawPencilMarks(
  dr: GameDrawing,
  s: SaladState,
  x: number,
  y: number,
  mode: number,
  ts: number,
  tx: number,
  ty: number,
  struck: number,
): void {
  const o = s.order;
  const mmx = s.nums + 1;
  const marks = s.pencil[y * o + x];

  let nhints = 0;
  for (let i = 0; i < mmx; i++) if (marks & (1 << i)) nhints++;
  if (!nhints) return;

  let hw = 1;
  while (hw * hw < nhints) hw++;
  if (hw < 3) hw = 3;
  let hh = Math.floor((nhints + hw - 1) / hw);
  if (hh < 2) hh = 2;
  const hmax = Math.max(hw, hh);
  const fontsz = Math.floor(ts / Math.floor((hmax * (11 - hmax)) / 8));

  let j = 0;
  for (let i = 0; i < mmx; i++) {
    if (!(marks & (1 << i))) continue;
    const hx = j % hw;
    const hy = Math.floor(j / hw);
    const ch = i === mmx - 1 ? "X" : symbolChar(mode, i + 1);
    const cx = tx + Math.floor(((4 * hx + 3) * ts) / (4 * hw + 2));
    const cy = ty + Math.floor(((4 * hy + 3) * ts) / (4 * hh + 2));
    dr.drawText({ x: cx, y: cy }, glyphFont(fontsz), COL_PENCIL, ch);
    // Candidate `i + 1` in the mark bitmap is candidate `i + 1` to the hint too.
    if (struck & (1 << (i + 1))) {
      const r = Math.max(2, Math.floor(fontsz / 3));
      dr.drawLine({ x: cx - r, y: cy }, { x: cx + r, y: cy }, COL_PENCIL, 2);
    }
    j++;
  }
}

/** The entry a hint step is asking for, previewed in `COL_HINT` in the shape the
 * move itself would draw (`docs/games/hints.md` § "Echo the move's shape in the
 * hint color"): a symbol as its glyph, an empty-square marker
 * as a cross, a holds-a-symbol marker as a ball outline. */
function drawGhost(
  dr: GameDrawing,
  ts: number,
  mode: number,
  tx: number,
  ty: number,
  code: number,
): void {
  const cx = tx + Math.floor(ts / 2);
  const cy = ty + Math.floor(ts / 2);
  if (code === GHOST_CROSS) {
    drawX(dr, tx, ty, ts, COL_HINT, 2.5);
    return;
  }
  if (code === GHOST_CIRCLE) {
    dr.drawCircle({ x: cx, y: cy }, ts * 0.4, -1, COL_HINT);
    dr.drawCircle({ x: cx, y: cy }, ts * 0.38, -1, COL_HINT);
    return;
  }
  const ch = symbolChar(mode, code);
  dr.drawText({ x: cx, y: cy }, glyphFont(Math.floor(ts / 2)), COL_HINT, ch);
}

/** The fork's Check & Save marker: an inset red box, the same cue Towers uses,
 * so a wrong *empty* square (which has no glyph to recolor) is still visible. */
function drawMistakeBox(dr: GameDrawing, tx: number, ty: number, ts: number): void {
  for (const inset of [2, 3]) {
    const side = ts - 2 * inset;
    drawRectOutline(dr, tx + inset, ty + inset, side, side, COL_MISTAKE);
  }
}

const PENCIL_STYLE: PencilIndicatorStyle = {
  background: COL_BACKGROUND,
  body: COL_PENCIL_BODY,
  ink: COL_BORDER,
};
/** The top-left margin tile: a corner, so it never holds a border clue in
 * either mode and nothing else ever paints there. */
const PENCIL_BOX = (ts: number): PencilIndicatorBox => ({ x: 0, y: 0, size: ts });

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SaladDrawState,
  _prev: SaladState | null,
  s: SaladState,
  _dir: number,
  ui: SaladUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<SaladMove, SaladHint>,
  mistakes?: readonly SaladMistake[],
): void {
  const ts = ds.tilesize;
  const o = s.order;
  const thick = ts <= 21 ? 1 : 2.5;

  let flash = -1;
  let cursorShown = ui.cursor.visible;
  if (flashTime > 0) {
    flash = Math.floor(flashTime / FLASH_FRAME) % 3;
    cursorShown = false;
  }

  if (!ds.started) {
    const size = computeSize(s, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
  }

  setDrawFlags(ds, ui, s, cursorShown);
  const flags = ds.gridfs;
  ds.wrong.packCells(mistakes, (x, y) => y * o + x);

  // The hint overlay: the shared target/area/marks pack, plus the ghosted entry
  // the step asks for. Both live in `ds.hint`, so both are part of the
  // cache-miss test below (docs/games/rendering.md § "The tile cache and the diff key").
  const hl = hint?.highlights;
  ds.hint.pack(
    hl,
    (x, y) => y * o + x,
    (m) => hintMarkBit(m.n),
  );
  if (hl?.ghost !== undefined) {
    const code = ghostCode(hl.ghost);
    for (const t of hl.targets) ds.hint.add(t.y * o + t.x, code);
  }
  // A border clue that is the hint's premise lights up with its line of sight.
  for (let j = 0; j < o * 4; j++) ds.borderfs[j] &= ~FD_HINT;
  for (const c of hl?.clues ?? []) ds.borderfs[c] |= FD_HINT;

  for (let y = 0; y < o; y++) {
    for (let x = 0; x < o; x++) {
      const i = y * o + x;
      // Packed key: flags (5) | symbol (4) | marks (nums+1 ≤ 10) | flash (2).
      // Every overlay is in here or in a sidecar (docs/games/rendering.md
      // § "Overlay sidecars"), so nothing can change on screen without the cell
      // missing the cache.
      const key =
        flags[i] | (s.grid[i] << 5) | (s.pencil[i] << 9) | ((flash + 1) << 19);
      if (ds.drawn[i] === key && !ds.wrong.stale(i) && !ds.hint.stale(i)) continue;
      ds.drawn[i] = key;

      const tx = (x + 1) * ts;
      const ty = (y + 1) * ts;
      const overlay = ds.hint.packed[i];
      const struck = (overlay & ~HINT_GHOST_MASK) >> 2;
      const ghost = (overlay & HINT_GHOST_MASK) >> HINT_GHOST_SHIFT;

      // Background, or the three-phase completion wave (letters mode paints the
      // whole cell; numbers mode waves the ball backgrounds instead). Neither
      // hint mark appears here: the acted-on square is ringed and the evidence
      // area outlined, both on the square's own border in the pass below, so a
      // hinted square keeps showing its ghost entry and its struck notes.
      const hinted = flash === -1 && (overlay & (HINT_TARGET | HINT_AREA)) !== 0;
      if (s.mode === GAMEMODE_LETTERS && flash >= 0) {
        const color =
          (x + y) % 3 === flash
            ? COL_BACKGROUND
            : (x + y + 1) % 3 === flash
              ? COL_LOWLIGHT
              : COL_HIGHLIGHT;
        dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, color);
      } else {
        dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, COL_BACKGROUND);
      }

      if (hinted && flags[i] & FD_CURSOR && !(flags[i] & FD_PENCIL)) {
        // The cursor's own fill would swamp the square a hint is pointing at —
        // and the hint deliberately stays while the player types into it, so the
        // two cues have to coexist. The ring says which square the deduction is
        // about; the cursor keeps its corner triangle below.
      } else if (flash === -1 && flags[i] & FD_PENCIL) {
        dr.drawPolygon(
          [
            { x: tx, y: ty },
            { x: tx + Math.floor(ts / 2), y: ty },
            { x: tx, y: ty + Math.floor(ts / 2) },
          ],
          COL_LOWLIGHT,
          COL_LOWLIGHT,
        );
      } else if (flash === -1 && flags[i] & FD_CURSOR) {
        dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, COL_LOWLIGHT);
      }

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

      if (flags[i] & FD_CIRCLE) drawBall(dr, ts, s, x, y, flags[i], flash);
      else if (flags[i] & FD_CROSS) drawCross(dr, ts, s, x, y, flags[i], thick);

      if (s.grid[i] === 0 && s.holes[i] !== CROSS) {
        if (s.holes[i] === CIRCLE) {
          // Inside a ball, the marks are drawn smaller and inset.
          drawPencilMarks(
            dr,
            s,
            x,
            y,
            s.mode,
            Math.floor(ts * 0.8),
            Math.floor((x + 1.1) * ts),
            Math.floor((y + 1.1) * ts),
            struck,
          );
        } else {
          drawPencilMarks(dr, s, x, y, s.mode, ts, tx, ty, struck);
        }
      } else if (s.grid[i] !== 0) {
        const color =
          s.gridclues[i] > 0 && s.gridclues[i] <= o
            ? COL_I_NUM
            : flags[i] & FD_ERROR
              ? COL_E_NUM
              : COL_G_NUM;
        dr.drawText(
          { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
          glyphFont(Math.floor(ts / 2)),
          color,
          symbolChar(s.mode, s.grid[i]),
        );
      }

      // The entry the hint asks for, and the ring saying "act here".
      if (ghost !== 0) drawGhost(dr, ts, s.mode, tx, ty, ghost);

      // A forcing chain's place in the order it fires, so the narration can
      // cite the squares by number rather than asking the player to
      // reconstruct the chain.
      if (ds.hint.order[i] > 0)
        drawHintOrdinal(dr, { x: tx, y: ty }, ts, ds.hint.order[i], COL_HINT_CELL);

      if (ds.wrong.at(i)) drawMistakeBox(dr, tx, ty, ts);
      ds.wrong.commit(i);
      ds.hint.commit(i);

      dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });
    }
  }

  // The hint marks, after the cell loop and outside every clip. A Salad square
  // carries a letter, a ghost preview and up to three struck notes, so neither
  // mark can be a fill; both go on the square's own border, where the grid line
  // already is.
  {
    const targets: MarkCell[] = [];
    const evidence: MarkCell[] = [];
    for (let y = 0; y < o; y++) {
      for (let x = 0; x < o; x++) {
        const packed = ds.hint.packed[y * o + x];
        if (packed & HINT_TARGET) targets.push({ x, y });
        if (packed & HINT_AREA) evidence.push({ x, y });
      }
    }
    ds.marks.paint(dr, targets, evidence, {
      band: (x, y) => markBand(ds, x, y),
      targetColor: COL_HINT,
      evidenceColor: COL_HINT_CELL,
    });
  }

  // Border clues, in the one-tile margin.
  //
  // Each clue erases its own margin tile before drawing the letter, and the
  // erase rect is **deliberately asymmetric on the right edge** (`inset`). The
  // grid's outermost boundary line is drawn *by the neighboring cell*, and the
  // last cell's right edge sits at exactly `(o+1)·ts`, the right clue tile's own
  // origin — so a full erase there wipes it — whereas the top/left/bottom
  // boundaries land at `ts − 1` / `ts` / `(o+1)·ts − 1`, all outside their clue
  // tile's `ts − 1` erase. Upstream's one-off `tx+1, ty+1, TILE_SIZE-2` for the
  // right clue; do not fold the four sides into one uniform rect
  // (docs/games/rendering.md § "A clue-ring erase must not wipe the grid").
  for (let i = 0; i < o; i++) {
    const spots = [
      { j: i, tx: (i + 1) * ts, ty: 0, inset: 0 },
      { j: i + o, tx: 0, ty: (i + 1) * ts, inset: 0 },
      { j: i + o * 2, tx: (i + 1) * ts, ty: (o + 1) * ts, inset: 0 },
      { j: i + o * 3, tx: (o + 1) * ts, ty: (i + 1) * ts, inset: 1 },
    ];
    for (const spot of spots) {
      if (!s.borderclues[spot.j]) continue;
      if (ds.borderfs[spot.j] === ds.borderDrawn[spot.j]) continue;
      ds.borderDrawn[spot.j] = ds.borderfs[spot.j];

      const color =
        ds.borderfs[spot.j] & FD_ERROR
          ? COL_E_BORDERCLUE
          : ds.borderfs[spot.j] & FD_HINT
            ? COL_HINT
            : COL_BORDERCLUE;
      const erase = {
        x: spot.tx + spot.inset,
        y: spot.ty + spot.inset,
        w: ts - 1 - spot.inset,
        h: ts - 1 - spot.inset,
      };
      dr.drawRect(erase, COL_BACKGROUND);
      dr.drawText(
        { x: spot.tx + Math.floor(ts / 2), y: spot.ty + Math.floor(ts / 2) },
        glyphFont(Math.floor(ts / 2)),
        color,
        String.fromCharCode(64 + s.borderclues[spot.j]),
      );
      dr.drawUpdate(erase);
    }
  }

  // Fork addition: the CapsLock-style pencil-mode indicator.
  repaintPencilIndicator(dr, ds, ui.pencilMode, PENCIL_BOX(ts), PENCIL_STYLE);

  ds.started = true;
}
