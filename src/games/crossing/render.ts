/**
 * Crossing rendering — idiomatic port of `game_redraw` and its helpers from
 * `unreleased/crossing.c`.
 *
 * The board sits inside a **half-tile margin** on every side (so the pointer
 * conversion subtracts `tilesize/2`, unlike the zero-border `NARROW_BORDERS`
 * geometry most ports use), with a three-tile **number-list panel** below it.
 * Every cell is a beveled tile: walls are drawn indented in gray, an entered
 * digit outdented in that digit's own color, and an empty cell shows the inner
 * background (or the selection highlight) plus its pencil marks. A run that is
 * full but reads as no listed number gets a thick red frame drawn around the
 * whole run, one clipped tile at a time.
 *
 * Upstream repaints the entire canvas every frame — its own TODO list asks for
 * "optimize drawing routines". Here each cell's pixels depend only on its own
 * digit, notes, error/cursor flags and the flash phase, so a per-tile
 * `Int32Array` cache suffices (docs/games/rendering.md § "The tile cache and the diff key"), with the Check-&-Save mistake
 * overlay in an `OverlaySidecar` so a mistaken-but-otherwise-unchanged cell
 * still repaints. The number panel repaints only when a clue's used/duplicate
 * state changes.
 *
 * Two deliberate display divergences, both recorded in the change's design.md:
 * the completion flash animates through the nine digit colors (upstream
 * declares its frame counter `bool`, so its "flash" is a single static color
 * shift — clearly not the intent of `FLASH_TIME = 9 × FLASH_FRAME`), and the
 * sticky pencil mode adds a mode-indicator glyph in the top-left margin.
 */

import {
  mkhighlight,
  mkhighlightSpecific,
} from "../../engine/color/color-mkhighlight.ts";
import {
  BLUE_BOLD,
  GREEN,
  GREEN_BOLD,
  ORANGE_BOLD,
} from "../../engine/color/colors.ts";
import {
  ERROR,
  GRID_DARK,
  highlightWash,
  INK,
  PAPER,
  PENCIL_BODY,
  pencilColor,
} from "../../engine/color/palette.ts";
import { crossingGhost } from "../../engine/color/palette-games.ts";
import { drawRectCorners, drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import {
  drawMarkSides,
  HintMarks,
  MARK_ALL,
  type MarkBand,
  type MarkCell,
} from "../../engine/hint-mark.ts";
import {
  HINT_AREA,
  HINT_TARGET,
  hintMarkBit,
  OverlaySidecar,
} from "../../engine/overlay-sidecar.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
import type { Color, DrawTextOptions, Size } from "../../engine/types.ts";
import type { CrossingMistake } from "./solver.ts";
import {
  type CrossingMove,
  type CrossingPuzzle,
  type CrossingState,
  type CrossingUi,
  numberAvailableTo,
  placedRuns,
  runForNumber,
  validateBoard,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 40;
const FLASH_FRAME = 0.08;
export const FLASH_TIME = FLASH_FRAME * 9;

// --- palette (index-for-index with the upstream COL_* enum) -----------------

export const COL_OUTERBG = 0;
export const COL_LOWLIGHT = 1;
export const COL_INNERBG = 2;
export const COL_HIGHLIGHT = 3;
export const COL_GRID = 4;
export const COL_ERROR = 5;
export const COL_WALL_L = 6;
export const COL_WALL_M = 7;
export const COL_WALL_H = 8;
/** Fork additions, appended past the (now much shorter) upstream enum. Crossing
 * declares no dark-mode `paletteOverrides`, so appending is safe. */
export const COL_PENCIL = 9;
export const COL_PENCIL_BODY = 10;
/** The preview of a held clue number, ghosted into the runs it still fits. */
export const COL_GHOST = 11;
/** Outline drawn round the clue currently held. Held is a passing state, so it
 * is marked by a shape — the hues below are reserved for saying *direction*. */
export const COL_HELD = 12;
/**
 * Two hues, one per dimension, each in a pale wash for the board and a
 * saturated ink for the clue list: **blue = horizontal, amber = vertical**,
 * everywhere and always. A run washed blue and a clue written in blue are
 * saying the same thing, so the list needs no legend. Tying the hue to the
 * dimension rather than to "the run being filled" keeps it stable — otherwise
 * toggling the fill direction would swap every color on screen.
 *
 * Blue/amber is also the safest pair to tell apart with any common form of
 * color blindness, which matters here because the hue *is* the information.
 */
export const COL_ACROSS = 13;
export const COL_DOWN = 14;
export const COL_ACROSSFIT = 15;
export const COL_DOWNFIT = 16;
/** The square(s) a hint's deduction acts on, and the clue it writes in. */
export const COL_HINT = 17;
/** The deduction's evidence — the run(s) it reasons over, and the listed
 * numbers that still fit them. */
export const COL_HINT_CELL = 18;
/**
 * A placed digit sitting **on** a run highlight.
 *
 * The run colors are the same values the clue list inks its numbers in, so the
 * board and the list say "across" and "down" with one color each rather than
 * two shades of each. That makes the highlight a *strong* fill — light under a
 * dark scheme, dark under a light one — and `COL_GRID` is the wrong ink on it in
 * both, being exactly the opposite in each. This is `PAPER`, which adapts the
 * other way round from ink and is therefore right in both without a second
 * decision.
 */
export const COL_RUNTEXT = 19;
/**
 * **Type here** — the empty square the keyboard is pointing at.
 *
 * A color of its own rather than `COL_HIGHLIGHT`, which is what it used to be:
 * the highlight is `mkhighlight`'s near-white, and the app's dark-mode pass
 * inverts it, so the one square that should be the most inviting on the board
 * came out **pure black** — reading as a hole rather than an invitation. Anything
 * defined as "brightest" has that problem, because brightest is relative to the
 * scheme; only an authored color is prominent in both.
 *
 * `highlightWash`, the collection's "type here" wash (Solo's family): a step
 * *down* from the board survives the dark-mode pass, where a step up inverts.
 * A wash rather than a hue, because a held clue previews a ghosted digit on
 * this square and has to stay readable — and every hue is spoken for here
 * anyway: blue and amber are the two run directions, green is the hint, red is
 * an error.
 */
export const COL_SELECTED = 20;
export const NCOLORS = 21;

export function colors(defaultBackground: Color): Color[] {
  const out: Color[] = new Array(NCOLORS);
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  out[COL_OUTERBG] = defaultBackground;
  out[COL_INNERBG] = background;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_GRID] = INK;
  out[COL_ERROR] = ERROR;

  const wall = mkhighlightSpecific(GRID_DARK);
  out[COL_WALL_M] = wall.base;
  out[COL_WALL_H] = wall.highlight;
  out[COL_WALL_L] = wall.lowlight;

  // A muted blue-gray for pencil marks, the collection's convention (ABCD,
  // Towers): clearly subordinate to an entered digit without vanishing.
  out[COL_PENCIL] = pencilColor(background);
  out[COL_PENCIL_BODY] = PENCIL_BODY;
  out[COL_GHOST] = crossingGhost(background);
  // Not `HELD`: green is the hint, and blue would say "across" round a down
  // clue. Held is a box, not a color — see `COL_HELD`'s declaration.
  out[COL_HELD] = INK;
  // **One color per direction**, on the board and in the clue list alike.
  //
  // These four slots used to be two shades of each hue: a wash under the board's
  // run highlight, and the bold step for the list's ink. That is defensible — a
  // fill and an ink want opposite lightness — but it made the player learn the
  // link between a navy square and light-blue text, when the whole point of the
  // hue is to say "across" in one glance. So the board takes the list's color,
  // and the digit that lands on a highlighted square switches to
  // {@link COL_RUNTEXT} rather than the highlight giving way.
  //
  // The pair is matched in **OKLCH**, not in RGB: identical lightness and
  // identical chroma, differing only in hue (258 blue / 62 amber). Matching in
  // RGB — the obvious thing, and the first thing tried — does not work, because
  // the channels carry wildly different luminance: the "mirrored" pair
  // rgb(152,194,211) / rgb(211,194,152) measured L=0.789 C=0.051 against
  // L=0.818 C=0.059, so the amber was both lighter *and* more colorful and duly
  // looked stronger. Perceived colorfulness is what the eye compares, so it is
  // what has to be equal — and that match is the palette's job now, pinned by
  // `colors.test.ts`, not a discipline this file has to keep.
  // The board slot and the list slot hold the same value on purpose — that *is*
  // the change. They stay two indices because they are two surfaces, and a
  // future scheme wanting to separate them again should not have to re-derive
  // which is which; `scripts/checks/color-collide.test.ts` reports the pair, and this
  // is the note that says it is meant.
  out[COL_ACROSS] = BLUE_BOLD;
  out[COL_ACROSSFIT] = BLUE_BOLD;
  out[COL_DOWN] = ORANGE_BOLD;
  out[COL_DOWNFIT] = ORANGE_BOLD;
  out[COL_RUNTEXT] = PAPER;
  out[COL_SELECTED] = highlightWash(background);
  // The hint pair — a **deliberate departure** from the collection's blue
  // `COL_HINT` (documented in the change's design.md). Crossing has already
  // spent blue: `COL_ACROSS` means "this is a horizontal run", and the
  // collection's hint blue is the same hue. A hint mark the player reads as
  // "across" is worse than a hint in an unfamiliar hue, so the hint takes
  // green — the far corner of the wheel from both dimension hues.
  //
  // Both marks are outlines rather than fills, so the run wash and the hint
  // occupy different pixels and can be on screen together: the hint says *which
  // square*, the wash still says *which run*.
  //
  // Green's **bold** step for the evidence outline, not its base — the base sits
  // at one lightness under both schemes and comes out a soft line on a pale
  // board and a bright one on a dark board, which `color-dark-check` measures.
  // The target keeps the base, as the emphatic end of its own hue.
  out[COL_HINT] = GREEN;
  out[COL_HINT_CELL] = GREEN_BOLD; // the evidence outline, per the note above
  return out;
}

// --- geometry --------------------------------------------------------------

/** Half a tile of margin surrounds the grid, and three tiles below it hold the
 * number list. */
export function computeSize(p: { w: number; h: number }, ts: number): Size {
  return { w: (p.w + 1) * ts, h: (p.h + 1 + 3) * ts };
}

/** Pixel → cell index along one axis. Upstream's `FROMCOORD` is C's
 * *truncating* division, so a pointer inside the top/left margin maps to row or
 * column 0 rather than off-grid — reproduced with `Math.trunc` (as Sticks does)
 * rather than the shared floor-based `fromCoord`. */
export function fromCoord(pixel: number, ts: number): number {
  return Math.trunc((pixel - Math.floor(ts / 2)) / ts);
}

/** Top-left pixel of cell `v` along one axis. */
const tileOrigin = (v: number, ts: number): number => v * ts + Math.floor(ts / 2);

// --- draw state ------------------------------------------------------------

// Per-cell error flags (upstream `FE_*`): which end(s) of an erroneous run the
// cell is, per axis.
const FE_LEFT = 0x01;
const FE_RIGHT = 0x02;
const FE_CENTER = FE_LEFT | FE_RIGHT;
const FE_TOP = 0x04;
const FE_BOT = 0x08;
const FE_MID = FE_TOP | FE_BOT;

// Cache-key bit layout for a cell's packed tile value.
const K_DIGIT = 0; // bits 0-3: the entered digit (0 = empty)
const K_ERR = 4; // bits 4-7: the FE_* flags
const DF_SELECT = 1 << 8; // mouse ink selection (a highlighted background)
const DF_PENCIL = 1 << 9; // pencil selection (the corner triangle)
const DF_KEYCUR = 1 << 10; // keyboard cursor (corner brackets)
const K_FLASH = 11; // bits 11-12: flash phase + 1 (0 = not flashing)
const DF_ACROSS = 1 << 13; // marked as part of a horizontal run in play
const DF_DOWN = 1 << 14; // marked as part of a vertical run in play
const K_MARKS = 15; // bits 15-23: the nine pencil-mark bits
const K_GHOST = 24; // bits 24-27: previewed digit of a held clue number (0 = none)

/** What a hint asks the player to see. `area` and `targets` are the usual
 * evidence/action split; `numbers` is the half of the evidence that lives in
 * the **clue list** rather than on the board (design D2) — both techniques
 * reason over "which listed numbers still fit this run", so a grid-only
 * highlight would point at something the player cannot see. */
export interface CrossingHint {
  /** The run(s) the deduction reasons over. */
  area: { x: number; y: number }[];
  /** The square(s) the move writes into. */
  targets: { x: number; y: number }[];
  /** The candidate(s) a rule-out strikes — marked on the candidate glyph, not
   * on the whole square (striking one note is not the same action as filling
   * the square, and one color over both would read as one action). */
  marks: { x: number; y: number; n: number }[];
  /** The listed numbers that still fit — the premise, highlighted in the panel. */
  numbers: number[];
  /** The listed number a whole-run placement writes in, if any. */
  numberTarget: number | null;
}

export interface CrossingDrawState {
  started: boolean;
  tilesize: number;
  /** `w·h` last-drawn packed tile values (-1 = never drawn). */
  tiles: Int32Array;
  /** Mistake-overlay sidecar (fork addition) — keeps Check & Save in the diff key. */
  wrong: OverlaySidecar;
  /** Hint-overlay sidecar — same reason as `wrong`: a hint is requested a frame
   * *after* the move that drew the board, so without it in the diff key the
   * overlay would never paint (docs/games/rendering.md § "Overlay sidecars"). */
  hint: OverlaySidecar;
  /** Per-number last-drawn panel state: the color class, plus the hint class
   * in the high nibble (-1 = never drawn). */
  numberState: Int8Array;
  /** The hint target's ring and the evidence region's outline (fork additions),
   * drawn after the cell loop. See {@link markBand}. */
  marks: HintMarks;
  /** Whether the pencil-mode indicator was on last frame (fork addition). */
  pencilModeShown: boolean;
}

export function newDrawState(state: CrossingState): CrossingDrawState {
  const { w, h, numbers } = state.puzzle;
  return {
    started: false,
    tilesize: 0,
    tiles: new Int32Array(w * h).fill(-1),
    wrong: new OverlaySidecar(w * h),
    hint: new OverlaySidecar(w * h),
    marks: new HintMarks(),
    numberState: new Int8Array(numbers.length).fill(-1),
    pencilModeShown: false,
  };
}

export function setTileSize(ds: CrossingDrawState, ts: number): void {
  ds.tilesize = ts;
}

/**
 * Where a hint mark sits around square `(x, y)` — **on the square's own
 * border**, replacing the `COL_GRID` outline `drawCell` finishes with.
 *
 * Crossing's squares tile exactly, so the band lies wholly inside the box
 * (`outer` 0) and a square whose overlay changes repaints itself and takes its
 * mark with it. Room comes from the bevel: a placed digit is drawn at half the
 * tile size in the center and the pencil-mark grid is inset inside the bevel
 * faces, so the outermost pixels are already frame rather than content.
 */
function markBand(ds: CrossingDrawState, x: number, y: number): MarkBand {
  const ts = ds.tilesize;
  return {
    box: { x: tileOrigin(x, ts), y: tileOrigin(y, ts), w: ts + 1, h: ts + 1 },
    outer: 0,
    inner: Math.max(2, ts >> 4),
  };
}

// --- drawing helpers -------------------------------------------------------

const textOpts = (
  size: number,
  align: DrawTextOptions["align"],
  baseline: DrawTextOptions["baseline"],
  fontType: DrawTextOptions["fontType"] = "variable",
): DrawTextOptions => ({ align, baseline, fontType, size });

/** Upstream `draw_tile`: a beveled square. Passing `(low, mid, high)` draws it
 * outdented, `(high, mid, low)` indented. */
function drawBevelTile(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  low: number,
  mid: number,
  high: number,
): void {
  const hw = Math.floor(ts / 10);
  dr.clip({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 });
  dr.drawRect({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 }, mid);
  dr.drawPolygon(
    [
      { x: tx + ts, y: ty + ts },
      { x: tx + ts, y: ty + 1 },
      { x: tx + 1, y: ty + ts },
    ],
    low,
    low,
  );
  dr.drawPolygon(
    [
      { x: tx + 1, y: ty + 1 },
      { x: tx + ts, y: ty + 1 },
      { x: tx + 1, y: ty + ts },
    ],
    high,
    high,
  );
  dr.drawRect({ x: tx + 1 + hw, y: ty + 1 + hw, w: ts - 2 * hw, h: ts - 2 * hw }, mid);
  dr.unclip();
  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });
}

/**
 * Upstream `draw_err_rectangle`: one tile's slice of the thick red frame drawn
 * around an erroneous run. The caller deliberately passes a rectangle that
 * overhangs the tile at any end the run continues through, and the clip then
 * hides the overhanging bars — which is what makes the frame continuous along
 * the run and closed at its ends.
 */
function drawErrRectangle(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const thick = Math.floor(ts / 10);
  const margin = Math.floor(ts / 20);
  dr.clip({ x: tx, y: ty, w: ts, h: ts });
  dr.drawRect({ x: x + margin, y: y + margin, w: w - 2 * margin, h: thick }, COL_ERROR);
  dr.drawRect({ x: x + margin, y: y + margin, w: thick, h: h - 2 * margin }, COL_ERROR);
  dr.drawRect(
    { x: x + margin, y: y + h - margin - thick, w: w - 2 * margin, h: thick },
    COL_ERROR,
  );
  dr.drawRect(
    { x: x + w - margin - thick, y: y + margin, w: thick, h: h - 2 * margin },
    COL_ERROR,
  );
  dr.unclip();
}

/** Upstream's pencil-selection cue: a small triangle in the tile's top-left.
 * Drawn dark on a hinted square, where the pale `COL_LOWLIGHT` gray reads
 * poorly against the hint green (the same reason the corner cue switches). */
function drawPencilCorner(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  onHint = false,
): void {
  const half = Math.floor(ts / 2);
  const color = onHint ? COL_GRID : COL_LOWLIGHT;
  dr.drawPolygon(
    [
      { x: tx, y: ty },
      { x: tx + half, y: ty },
      { x: tx, y: ty + half },
    ],
    color,
    color,
  );
}

/** The pencil-mark grid inside an empty cell (upstream's inline block).
 * `struck` is the hint's rule-out set, in the same bit-`n−1` encoding: those
 * candidates keep their normal pencil color (they are still real notes) and
 * gain a strikethrough — the Towers cue, and the reason the whole square is
 * *not* filled `COL_HINT` for a rule-out (it would hide the very digit being
 * crossed out). */
function drawMarks(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  marks: number,
  struck = 0,
): void {
  let nhints = 0;
  for (let i = 0; i < 9; i++) if (marks & (1 << i)) nhints++;
  if (nhints === 0) return;

  let hw = 1;
  while (hw * hw < nhints) hw++;
  if (hw < 3) hw = 3;
  let hh = Math.floor((nhints + hw - 1) / hw);
  if (hh < 2) hh = 2;
  const hmax = Math.max(hw, hh);
  const fontsz = Math.floor(ts / Math.floor((hmax * (11 - hmax)) / 8));

  let j = 0;
  for (let i = 0; i < 9; i++) {
    if (!(marks & (1 << i))) continue;
    const hx = j % hw;
    const hy = Math.floor(j / hw);
    const cx = tx + Math.floor(((4 * hx + 3) * ts) / (4 * hw + 2));
    const cy = ty + Math.floor(((4 * hy + 3) * ts) / (4 * hh + 2));
    dr.drawText(
      { x: cx, y: cy },
      textOpts(fontsz, "center", "mathematical"),
      COL_PENCIL,
      String(i + 1),
    );
    if (struck & (1 << i)) {
      const r = Math.max(2, Math.floor(fontsz / 3));
      dr.drawLine({ x: cx - r, y: cy }, { x: cx + r, y: cy }, COL_PENCIL, 2);
    }
    j++;
  }
}

/** The Check-&-Save mistake overlay (fork addition): a red box inset well
 * inside the tile, so it stays distinguishable from the run-error frame drawn
 * at the tile's edge. */
function drawMistake(dr: GameDrawing, ts: number, tx: number, ty: number): void {
  const inset = Math.max(3, Math.floor(ts / 6));
  const size = ts - 2 * inset;
  for (const d of [0, 1]) {
    drawRectOutline(
      dr,
      tx + inset + d,
      ty + inset + d,
      size - 2 * d,
      size - 2 * d,
      COL_ERROR,
    );
  }
}

// --- per-cell painting -----------------------------------------------------

function drawCell(
  dr: GameDrawing,
  ds: CrossingDrawState,
  puzzle: CrossingPuzzle,
  state: CrossingState,
  x: number,
  y: number,
  errFlags: number,
  flags: number,
  flash: number,
  wrong: boolean,
  hintBits: number,
): void {
  const ts = ds.tilesize;
  const { w, walls } = puzzle;
  const i = y * w + x;
  const tx = tileOrigin(x, ts);
  const ty = tileOrigin(y, ts);
  const digit = state.grid[i];
  const selected = (flags & DF_SELECT) !== 0;
  // Both cell-level hint marks are drawn in `redraw`, which rings the target and
  // outlines the evidence on the square's own border, so a hint never takes the
  // background from the run wash or from the penciled candidates it is ruling
  // out. What is left here is `struck`: `hintMarkBit(n)` is bit `2 + n` and the
  // pencil grid indexes digit `n` at bit `n − 1`, so shifting by 3 re-bases one
  // onto the other.
  const struck = hintBits >> 3;
  const runWash = flags & DF_ACROSS ? COL_ACROSS : flags & DF_DOWN ? COL_DOWN : -1;
  const wash = runWash >= 0 ? runWash : COL_INNERBG;

  if (!digit) {
    dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, selected ? COL_SELECTED : wash);
  }

  if (walls[i]) {
    drawBevelTile(dr, ts, tx, ty, COL_WALL_H, COL_WALL_M, COL_WALL_L);
  } else if (digit) {
    // An entered digit is a raised neutral tile: the bevel is what says
    // "placed", and the digit is plain black on it. Upstream painted each digit
    // its own saturated color — a leftover from a scrapped drag-and-drop design
    // that its author asked to have removed (see the module note).
    //
    // The completion flash sweeps a diagonal wave of highlight/lowlight across
    // the board (the shape ABCD uses) in place of upstream's color cycle.
    const mid =
      flash < 0
        ? wash
        : (x + y) % 3 === flash
          ? COL_HIGHLIGHT
          : (x + y + 2) % 3 === flash
            ? COL_LOWLIGHT
            : COL_INNERBG;
    const low = selected ? COL_HIGHLIGHT : COL_LOWLIGHT;
    const high = selected ? COL_LOWLIGHT : COL_HIGHLIGHT;
    drawBevelTile(dr, ts, tx, ty, low, mid, high);
    dr.drawText(
      { x: (x + 1) * ts, y: (y + 1) * ts },
      textOpts(Math.floor(ts / 2), "center", "mathematical"),
      mid === runWash ? COL_RUNTEXT : COL_GRID,
      String(digit),
    );
  }

  // The erroneous-run frame, drawn per tile and clipped (see drawErrRectangle).
  if (errFlags & (FE_LEFT | FE_RIGHT)) {
    let left = tx + 1;
    let right = tx + ts;
    if (errFlags & FE_LEFT) right += Math.floor(ts / 2);
    if (errFlags & FE_RIGHT) left -= Math.floor(ts / 2);
    drawErrRectangle(dr, ts, tx, ty, left, ty + 1, right - left, ts - 1);
  }
  if (errFlags & (FE_TOP | FE_BOT)) {
    let top = ty + 1;
    let bottom = ty + ts;
    if (errFlags & FE_TOP) bottom += Math.floor(ts / 2);
    if (errFlags & FE_BOT) top -= Math.floor(ts / 2);
    drawErrRectangle(dr, ts, tx, ty, tx + 1, top, ts - 1, bottom - top);
  }

  if (flags & DF_PENCIL) drawPencilCorner(dr, ts, tx, ty);

  const ghost = (flags >> K_GHOST) & 0xf;
  if (!walls[i] && !digit && ghost) {
    // The held clue number previewed where it would land.
    dr.drawText(
      { x: (x + 1) * ts, y: (y + 1) * ts },
      textOpts(Math.floor(ts / 2), "center", "mathematical"),
      COL_GHOST,
      String(ghost),
    );
  } else if (!walls[i] && !digit) {
    drawMarks(dr, ts, tx, ty, (flags >> K_MARKS) & 0x1ff, struck);
  }

  // The cursor cue. The *mouse* selection is a highlighted background
  // (`DF_SELECT`, painted above) and only the keyboard cursor draws corners.
  // The background is the selection's to keep even under a hint, which matters
  // because the hint deliberately *stays* while the player works inside it
  // (`uiUpdateClearsHint` in `index.ts`): they have to see where they are about
  // to type.
  if (flags & DF_KEYCUR)
    drawRectCorners(
      dr,
      (1 + x) * ts,
      (1 + y) * ts,
      Math.floor(ts * 0.35),
      COL_HIGHLIGHT,
    );

  if (wrong) drawMistake(dr, ts, tx, ty);

  drawRectOutline(dr, tx, ty, ts + 1, ts + 1, COL_GRID);
  dr.drawUpdate({ x: tx, y: ty, w: ts + 1, h: ts + 1 });
}

// --- the number-list panel -------------------------------------------------

/** Guard on upstream's `while (1)` row-growing loop; it converges long before
 * this (once `rows ≥ numcount` each column holds one number). */
const MAX_PANEL_ROWS = 1000;

/** Where one clue number sits in the panel: the text origin (left edge, text
 * baseline) plus the box a click on it should hit. */
export interface NumberSlot {
  x: number;
  y: number;
  /** Clickable box (`x`,`y` at its top-left). */
  hit: { x: number; y: number; w: number; h: number };
}

/**
 * Lay the clue list out under the grid — upstream `draw_numbers`' sizing loop,
 * extracted so the renderer and `interpretMove` cannot disagree about where a
 * number is (the same rule as Bricks' shared `offsets`, docs/games/mechanics.md § "Padded rectangles and sheared draws").
 *
 * The row count and font size are grown/shrunk until the widest number of each
 * column fits the board width — upstream's answer to its own "find a way to fit
 * the number list on the screen" TODO, and a genuinely adaptive one, so it is
 * ported rather than replaced.
 */
export function layoutNumbers(
  ts: number,
  w: number,
  h: number,
  numbers: readonly string[],
): { fontsz: number; slots: NumberSlot[] } {
  const count = numbers.length;
  if (count === 0) return { fontsz: 0, slots: [] };

  const hgt = 2.8 * ts;
  const wdt = w * ts;
  const whprop = 0.6;
  const yoff = (h + 1.2) * ts;
  let rows = 4;
  let space = 0.8;
  let fontsz = 0;

  for (let guard = 0; guard < MAX_PANEL_ROWS; guard++) {
    fontsz = hgt / rows / 1.4;
    let tmpwdt = -space;
    // The widest number of each column decides that column's width.
    for (let i = rows - 1; i < count + rows - 1; i += rows) {
      tmpwdt += numbers[Math.min(i, count - 1)].length * whprop + space;
    }
    if (fontsz * tmpwdt <= wdt) {
      // It fits: spread the slack evenly between the columns.
      if (count > rows)
        space += (wdt / fontsz - tmpwdt) / (Math.floor((count + rows - 1) / rows) - 1);
      break;
    }
    // More rows would make the text smaller than simply shrinking it here.
    if (wdt / tmpwdt > hgt / (rows + 1) / 1.4) {
      fontsz = wdt / tmpwdt;
      break;
    }
    rows++;
  }

  const rowHeight = hgt / rows;
  const slots: NumberSlot[] = [];
  let x = 0.5 * ts - space * fontsz;
  let y = yoff;
  let len = 0;
  for (let i = 0; i < count; i++) {
    if (i % rows === 0) {
      x += (len * whprop + space) * fontsz;
      y = yoff;
    }
    len = numbers[i].length;
    const ox = Math.trunc(x);
    const oy = Math.trunc(y);
    slots.push({
      x: ox,
      y: oy,
      // The text is left-aligned on an alphabetic baseline, so it occupies
      // roughly one font-size above the origin; the box is padded to the row
      // pitch so there are no dead gaps between clickable numbers.
      hit: {
        x: ox,
        y: Math.trunc(oy - fontsz),
        w: Math.max(1, Math.ceil(len * whprop * fontsz)),
        h: Math.max(1, Math.ceil(rowHeight)),
      },
    });
    y += rowHeight;
  }
  return { fontsz, slots };
}

/** Which clue number is at pixel `(px, py)`, or -1. */
export function numberAtPoint(
  ts: number,
  w: number,
  h: number,
  numbers: readonly string[],
  px: number,
  py: number,
): number {
  const { slots } = layoutNumbers(ts, w, h, numbers);
  for (let i = 0; i < slots.length; i++) {
    const b = slots[i].hit;
    if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) return i;
  }
  return -1;
}

/** Draw the clue list. `colorOf` gives each clue's color; `struckOf` marks the
 * ones already written into the grid, which are crossed off the list exactly as
 * a player does on paper — the distinction between "used up" and "cannot go in
 * the run you are looking at" has to survive both being grayed. */
function drawNumbers(
  dr: GameDrawing,
  ts: number,
  w: number,
  h: number,
  numbers: readonly string[],
  colorOf: (i: number) => number,
  struckOf: (i: number) => boolean,
  heldOf: (i: number) => boolean,
  hintOf: (i: number) => number = () => 0,
): void {
  const { fontsz, slots } = layoutNumbers(ts, w, h, numbers);
  if (slots.length === 0) return;
  const opts = textOpts(Math.trunc(fontsz), "left", "alphabetic", "fixed");
  const pad = Math.max(2, Math.round(fontsz * 0.15));
  const markT = Math.max(2, Math.round(fontsz / 8));
  for (let i = 0; i < slots.length; i++) {
    const color = colorOf(i);
    const hinted = hintOf(i);
    if (hinted) {
      // A **box**, not a patch behind the number. A clue's own ink is what says
      // which run it can go in, and that ink is one of the two saturated
      // dimension hues — a fill behind it is the same losing trade the board's
      // marks make (`hint-mark.ts`), one surface further out.
      //
      // It nests *outside* the held box rather than sharing its rectangle, so a
      // clue that is both held and hinted shows both.
      drawMarkSides(
        dr,
        {
          box: {
            x: slots[i].x - pad,
            y: Math.round(slots[i].y - fontsz * 0.85),
            w: slots[i].hit.w + 2 * pad,
            h: Math.round(fontsz * 1.1),
          },
          outer: markT,
          inner: 0,
        },
        MARK_ALL,
        hinted === 2 ? COL_HINT : COL_HINT_CELL,
      );
    }
    dr.drawText({ x: slots[i].x, y: slots[i].y }, opts, color, numbers[i]);
    if (struckOf(i)) {
      const y = Math.round(slots[i].y - fontsz * 0.3);
      dr.drawLine(
        { x: slots[i].x, y },
        { x: slots[i].x + slots[i].hit.w, y },
        color,
        Math.max(1, Math.round(fontsz / 12)),
      );
    }
    if (heldOf(i)) {
      // Held is marked by a box, not a color: the hues are spoken for by the
      // two dimensions, and a held clue still belongs to one of them.
      drawRectOutline(
        dr,
        slots[i].x - pad,
        Math.round(slots[i].y - fontsz * 0.85),
        slots[i].hit.w + 2 * pad,
        Math.round(fontsz * 1.1),
        COL_HELD,
      );
    }
  }
}

// --- pencil-mode indicator -------------------------------------------------

/** The shared CapsLock-style pencil-mode glyph, drawn in the empty half-tile
 * margin above and left of the grid — the same indicator Towers/Unequal/ABCD
 * use. */
function drawPencilIndicator(dr: GameDrawing, ts: number, on: boolean): void {
  const size = Math.floor(ts / 2);
  dr.drawRect({ x: 0, y: 0, w: size, h: size }, COL_OUTERBG);
  if (on) drawPencilGlyph(dr, 0, 0, size, COL_PENCIL_BODY, COL_GRID);
  dr.drawUpdate({ x: 0, y: 0, w: size, h: size });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: CrossingDrawState,
  _prev: CrossingState | null,
  state: CrossingState,
  _dir: number,
  ui: CrossingUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<CrossingMove, CrossingHint>,
  mistakes?: readonly CrossingMistake[],
): void {
  const ts = ds.tilesize;
  const puzzle = state.puzzle;
  const { w, h, walls, numbers, runs } = puzzle;

  if (!ds.started) {
    const size = computeSize(puzzle, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_OUTERBG);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
    ds.pencilModeShown = false;
    drawPencilIndicator(dr, ts, ui.cpencil);
    ds.pencilModeShown = ui.cpencil;
  }

  const flash = flashTime > 0 ? Math.floor(flashTime / FLASH_FRAME) % 3 : -1;
  // Upstream hides the selection while the win flash runs.
  const cshow = ui.cursor.visible && flashTime === 0;

  // Live errors: which runs read as no listed number, spread over their cells.
  const { done, runErrs } = validateBoard(puzzle, state.grid);
  const errFlags = new Uint8Array(w * h);
  for (let r = 0; r < runs.length; r++) {
    if (!runErrs[r]) continue;
    const cells = runs[r].cells;
    const horizontal = runs[r].horizontal;
    for (let k = 0; k < cells.length; k++) {
      errFlags[cells[k]] |=
        k === 0
          ? horizontal
            ? FE_LEFT
            : FE_TOP
          : k === cells.length - 1
            ? horizontal
              ? FE_RIGHT
              : FE_BOT
            : horizontal
              ? FE_CENTER
              : FE_MID;
    }
  }

  ds.wrong.packCells(mistakes, (x, y) => y * w + x);
  ds.hint.pack(
    hint?.highlights,
    (x, y) => y * w + x,
    (m) => hintMarkBit(m.n),
  );
  const hintNumbers = new Set(hint?.highlights?.numbers ?? []);
  const hintNumberTarget = hint?.highlights?.numberTarget ?? null;

  // The held clue number, previewed in every run that can still take it, and —
  // when a cell is selected — the list dimmed to the numbers that still fit it.
  const placed = placedRuns(puzzle, state.grid);
  const ghost = new Uint8Array(w * h);
  const acrossWash = new Uint8Array(w * h);
  const downWash = new Uint8Array(w * h);
  const markRun = (r: number): void => {
    // A displayed hint owns the board's coloring: a washed square must not
    // mean two things at once ("this run passes through your selection" /
    // "this run is the hint's evidence"), and the hint's own green is
    // deliberately nothing like either dimension hue. Dismissing the hint
    // brings the wash straight back.
    if (hint) return;
    const mark = runs[r].horizontal ? acrossWash : downWash;
    for (const i of runs[r].cells) mark[i] = 1;
  };

  // The two runs through the selected cell: the one being filled, and the one
  // crossing it. The crossing run is washed so that the second color used for
  // its clues in the list below has something to point at.
  const selCell = cshow && !ui.cpencil ? ui.cursor.y * w + ui.cursor.x : -1;
  const activeRun =
    selCell < 0
      ? -1
      : ui.dir === "across"
        ? puzzle.acrossRun[selCell]
        : puzzle.downRun[selCell];
  const crossRun =
    selCell < 0
      ? -1
      : ui.dir === "across"
        ? puzzle.downRun[selCell]
        : puzzle.acrossRun[selCell];
  if (ui.highlightRuns) {
    // Both runs through the selected cell are marked, each in its dimension's
    // hue — the same hue its clues take in the list below. Marking only one
    // leaves the other's clues with nothing to point at.
    if (activeRun >= 0) markRun(activeRun);
    if (crossRun >= 0) markRun(crossRun);
  }

  // Holding a clue always previews it: it is an explicit action, and without
  // board feedback there would be nothing to act on.
  if (ui.heldNumber !== null) {
    const held = ui.heldNumber;
    const alreadyOnBoard = placed[held];
    // A clue already written in shows *where it is*; one still to place shows
    // every run it could go in.
    const where =
      alreadyOnBoard >= 0
        ? [alreadyOnBoard]
        : runs
            .map((_r, i) => i)
            .filter((i) => numberAvailableTo(puzzle, state.grid, placed, i, held));
    for (const r of where) markRun(r);

    // The digits are only previewed when there is exactly **one** run it could
    // go in. Writing them into every candidate at once reads as the game
    // asserting several placements (a 2-digit clue matches ten runs on a fresh
    // 9x9), and two candidates that cross would disagree about the digit in the
    // cell they share. One candidate is also the case where the preview is a
    // real prediction rather than a list of options.
    if (where.length === 1 && alreadyOnBoard < 0) {
      const cells = runs[where[0]].cells;
      const text = numbers[held];
      for (let k = 0; k < cells.length; k++) {
        if (!state.grid[cells[k]]) ghost[cells[k]] = text.charCodeAt(k) - 48;
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const here = cshow && ui.cursor.x === x && ui.cursor.y === y;
      let flags = 0;
      if (here && ui.cpencil) flags |= DF_PENCIL;
      else if (here && ui.ckey) flags |= DF_KEYCUR;
      else if (here) flags |= DF_SELECT;
      if (!walls[i] && !state.grid[i]) flags |= (state.marks[i] & 0x1ff) << K_MARKS;
      if (ghost[i]) flags |= ghost[i] << K_GHOST;
      if (acrossWash[i]) flags |= DF_ACROSS;
      else if (downWash[i]) flags |= DF_DOWN;

      const tile =
        (state.grid[i] << K_DIGIT) |
        (errFlags[i] << K_ERR) |
        flags |
        ((flash + 1) << K_FLASH);

      if (ds.tiles[i] !== tile || ds.wrong.stale(i) || ds.hint.stale(i)) {
        drawCell(
          dr,
          ds,
          puzzle,
          state,
          x,
          y,
          errFlags[i],
          flags,
          flash,
          ds.wrong.at(i),
          ds.hint.packed[i],
        );
        ds.tiles[i] = tile;
        ds.wrong.commit(i);
        ds.hint.commit(i);
      }
    }
  }

  // The hint marks, after the cell loop and outside every clip, so a mark on a
  // shared square edge is not half-covered by the neighbor drawing its own
  // grid outline.
  const targets: MarkCell[] = [];
  const evidence: MarkCell[] = [];
  for (let i = 0; i < w * h; i++) {
    const c = { x: i % w, y: (i / w) | 0 };
    if (ds.hint.packed[i] & HINT_TARGET) targets.push(c);
    if (ds.hint.packed[i] & HINT_AREA) evidence.push(c);
  }
  ds.marks.paint(dr, targets, evidence, {
    band: (x, y) => markBand(ds, x, y),
    targetColor: COL_HINT,
    evidenceColor: COL_HINT_CELL,
  });

  // The number panel. Each clue reads as one of: held, already written in
  // (struck off), duplicated, fits the run being filled, fits the *crossing*
  // run instead, or cannot go here at all.
  const colorClass = (l: number): number => {
    if (done[l] > 1) return 2;
    if (done[l] === 1) return 1; // already on the board — struck off
    if (ui.fitHighlight && selCell >= 0) {
      // Each of the two runs through the selected cell has its own color, and
      // the board washes that run in the matching shade. A clue that fits
      // either is one click from being placed there.
      //
      // *Which* run is asked of `runForNumber` — the same function the click
      // itself goes through — so the color can never name one run while a
      // click sends the clue to the other. (It could: both runs often admit a
      // clue, and the tie is settled by how much of each is already written,
      // not by the fill direction. Duplicating that rule here is exactly how
      // the two would drift apart.)
      const r = runForNumber(
        puzzle,
        state.grid,
        placed,
        ui.cursor.x,
        ui.cursor.y,
        l,
        ui.dir,
      );
      if (r >= 0) return runs[r].horizontal ? 0 : 5;
      return 4;
    }
    return 6;
  };
  // 0 across-fit · 1 placed (struck) · 2 duplicated · 3 held · 4 nowhere here
  // · 5 down-fit · 6 no selection.
  const CLASS_COLOR = [
    COL_ACROSSFIT,
    COL_LOWLIGHT,
    COL_ERROR,
    COL_GRID,
    COL_LOWLIGHT,
    COL_DOWNFIT,
    COL_GRID,
  ];

  // The hint's half of the evidence (design D2): the numbers the deduction
  // reasons over get a pale patch behind them, and the one a whole-run
  // placement writes in gets the solid target color — the same two shades the
  // board uses, so the words ("only one number left fits this run") point at
  // something the player can see. It rides *behind* the fit-highlight ink
  // rather than replacing it, so the two aids stay legible together and the
  // clue list keeps saying which numbers can go where.
  const hintClass = (l: number): number =>
    l === hintNumberTarget ? 2 : hintNumbers.has(l) ? 1 : 0;
  const panelState = (l: number): number => colorClass(l) | (hintClass(l) << 4);

  let panelStale = false;
  for (let l = 0; l < numbers.length; l++) {
    if (ds.numberState[l] !== panelState(l)) {
      panelStale = true;
      break;
    }
  }
  if (panelStale) {
    // Start below the grid's bottom outline so the panel repaint can't erase it.
    const top = tileOrigin(h - 1, ts) + ts + 2;
    const size = computeSize(puzzle, ts);
    dr.drawRect({ x: 0, y: top, w: size.w, h: size.h - top }, COL_OUTERBG);
    drawNumbers(
      dr,
      ts,
      w,
      h,
      numbers,
      (l) => CLASS_COLOR[colorClass(l)],
      (l) => colorClass(l) === 1,
      (l) => l === ui.heldNumber,
      hintClass,
    );
    dr.drawUpdate({ x: 0, y: top, w: size.w, h: size.h - top });
    for (let l = 0; l < numbers.length; l++) ds.numberState[l] = panelState(l);
  }

  if (ds.pencilModeShown !== ui.cpencil) {
    drawPencilIndicator(dr, ts, ui.cpencil);
    ds.pencilModeShown = ui.cpencil;
  }
}
