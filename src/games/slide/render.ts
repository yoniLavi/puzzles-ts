/**
 * Slide's palette and renderer (upstream `game_colours` / `game_redraw` /
 * `draw_tile` / `draw_piecepart` / `draw_wallpart`).
 *
 * There is **no slide animation** (upstream's `game_anim_length` is 0), so all
 * the movement feedback lives here:
 *
 *  - while a block is held, it is drawn *where it would land*, lit up
 *    (`FG_GRABBED`), by simulating the release move and drawing the result —
 *    for a pointer drag and for a keyboard selection alike, because both move
 *    the same `ui.grabCurrpos`;
 *  - the keyboard cursor is four corner brackets (`FG_CURSOR`), riding the held
 *    block while there is one;
 *  - the target area is tinted green wherever the main block would land;
 *  - the exit gate is outlined, so it reads that nothing but the main block may
 *    cross it;
 *  - when a Solve route is installed, the next block to move wears an accent
 *    band (`FG_SOLVEPIECE`) and the *outline* of it is drawn where it should end
 *    up (`FG_SHADOW`);
 *  - completing the puzzle plays a three-interval flash.
 *
 * ## The palette
 *
 * The floor, the wall, an ordinary block and the key block have four different
 * fills, where upstream derived all of them from one `game_mkhighlight` trio
 * and told them apart by their bevels alone. The ladder and the reasoning
 * behind it live with the colors, in `engine/color/palette-games.ts` under
 * {@link slideWallBase}.
 *
 * Every material is a base/highlight/lowlight trio at three *consecutive*
 * indices, because `drawTile` derives the bevel from a base as `cc+1`/`cc+2`
 * (the C: "Do not break this, or draw_tile() will get confused"). Upstream's
 * enum order is kept and new entries are appended, because
 * `src/puzzle/augmentation.ts` keys Slide's dark-mode `paletteSwaps` by **color
 * index** — so a new material adds a swap pair there as well as a color here,
 * and reindexing would silently mis-target them
 * (docs/games/rendering.md § "The palette: three layers, meaning first").
 *
 * `draw_piecepart` is the one place this port stays a close transcription
 * rather than a rewrite. Its own author wrote "there's a lot of very fiddly
 * logic here and all I could really think to do was give it my best shot and
 * then test it and correct all the typos" — a 5×5 subdivision of the tile with
 * up to five cases per section. Verbatim transcription is the low-risk way to
 * reproduce a shape like that
 * (docs/games/solver-and-generator.md § "Divergence and what it costs"), so the
 * `maybeRect` calls below stay 1:1 with the C and auditable against it.
 */

import {
  mkhighlight,
  mkhighlightSpecific,
} from "../../engine/color/color-mkhighlight.ts";
import { ORANGE, RED } from "../../engine/color/colors.ts";
import {
  slideBlockBase,
  slideMainBlockBase,
  slideRouteShadow,
  slideTargetBase,
  slideWallBase,
} from "../../engine/color/palette-games.ts";
import { drawRectCorners } from "../../engine/draw.ts";
import { Dsf } from "../../engine/dsf.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { coord as gridCoord } from "../../engine/geometry.ts";
import type { Color, Point, Rect, Size } from "../../engine/types.ts";
import { movePiece } from "./moves.ts";
import {
  cursorPos,
  EMPTY,
  isDist,
  MAINANCHOR,
  type SlideState,
  type SlideUi,
  WALL,
} from "./state.ts";

// --- palette (indices C-identical; see the module header) ---------------

export const COL_BACKGROUND = 0;
export const COL_HIGHLIGHT = 1;
export const COL_LOWLIGHT = 2;
export const COL_GRABBED = 3;
export const COL_GRABBED_HIGHLIGHT = 4;
export const COL_GRABBED_LOWLIGHT = 5;
export const COL_MAIN = 6;
export const COL_MAIN_HIGHLIGHT = 7;
export const COL_MAIN_LOWLIGHT = 8;
export const COL_MAIN_GRABBED = 9;
export const COL_MAIN_GRABBED_HIGHLIGHT = 10;
export const COL_MAIN_GRABBED_LOWLIGHT = 11;
export const COL_TARGET = 12;
export const COL_TARGET_HIGHLIGHT = 13;
export const COL_TARGET_LOWLIGHT = 14;
// Appended past upstream's enum, because a game's palette index order is stable
// (`ts-engine` spec); each trio adds a `paletteSwaps` pair.
export const COL_WALL = 15;
export const COL_WALL_HIGHLIGHT = 16;
export const COL_WALL_LOWLIGHT = 17;
export const COL_BLOCK = 18;
export const COL_BLOCK_HIGHLIGHT = 19;
export const COL_BLOCK_LOWLIGHT = 20;
export const COL_ROUTE = 21;
export const COL_ROUTE_SHADOW = 22;
/** The keyboard cursor. Flat, so it needs no bevel trio and no `paletteSwaps`
 * pair — the token carries its own dark value. */
export const COL_CURSOR = 23;
export const NCOLORS = 24;

/** Upstream `raise_colour`: two parts `src` to one part `limit`. */
function raise(src: Color, limit: Color): Color {
  return [
    (2 * src[0] + limit[0]) / 3,
    (2 * src[1] + limit[1]) / 3,
    (2 * src[2] + limit[2]) / 3,
  ];
}

export function colors(defaultBackground: Color): Color[] {
  const out = new Array<Color>(NCOLORS);
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);

  // The floor: the board itself. A surface earns no contrast, and empty floor
  // is what a player is hunting for, so it reads as space.
  out[COL_BACKGROUND] = background;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;

  // An ordinary block: an object resting on that floor.
  const block = mkhighlightSpecific(slideBlockBase(background));
  out[COL_BLOCK] = block.base;
  out[COL_BLOCK_HIGHLIGHT] = block.highlight;
  out[COL_BLOCK_LOWLIGHT] = block.lowlight;

  // ...and lit up a bit while it is held — by a pointer or by the keyboard.
  out[COL_GRABBED] = raise(block.base, block.highlight);
  out[COL_GRABBED_HIGHLIGHT] = raise(block.highlight, block.highlight);
  out[COL_GRABBED_LOWLIGHT] = raise(block.lowlight, block.highlight);

  // The wall: the heaviest thing on the board, because it is the one thing that
  // never moves.
  const wall = mkhighlightSpecific(slideWallBase(background));
  out[COL_WALL] = wall.base;
  out[COL_WALL_HIGHLIGHT] = wall.highlight;
  out[COL_WALL_LOWLIGHT] = wall.lowlight;

  // The key block is tinted blue — the help page says so to the player.
  const main = mkhighlightSpecific(slideMainBlockBase(background));
  out[COL_MAIN] = main.base;
  out[COL_MAIN_HIGHLIGHT] = main.highlight;
  out[COL_MAIN_LOWLIGHT] = main.lowlight;
  out[COL_MAIN_GRABBED] = raise(main.base, main.highlight);
  out[COL_MAIN_GRABBED_HIGHLIGHT] = raise(main.highlight, main.highlight);
  out[COL_MAIN_GRABBED_LOWLIGHT] = raise(main.lowlight, main.highlight);

  // The exit area on the floor is tinted green — likewise named to the player,
  // and left pale on purpose: it stays the most prominent thing on the board.
  const target = mkhighlightSpecific(slideTargetBase(background, highlight));
  out[COL_TARGET] = target.base;
  out[COL_TARGET_HIGHLIGHT] = target.highlight;
  out[COL_TARGET_LOWLIGHT] = target.lowlight;

  // The Solve route: one accent at two weights, so "move this" and "to there"
  // read as one instruction.
  out[COL_ROUTE] = ORANGE;
  out[COL_ROUTE_SHADOW] = slideRouteShadow(background);

  // The keyboard cursor. `palette.ts`'s default `CURSOR` is green, but Slide has
  // already spent green on the exit area, which the help page names to the
  // player: a green mark elsewhere would read as "the exit is here", and a green
  // mark *on* the exit would vanish into it.
  //
  // Red works everywhere the cursor can go. The cursor is clamped to the whole
  // grid, so the mark sits on materials from the key block (L 0.44) and the
  // wall (0.48) up to the floor (0.83) and the exit (0.94) — a span no mid-tone
  // can straddle, which rules out teal, pink and orange, and yellow (0.80)
  // disappears into the floor. At the dark end red beats purple twice: darker
  // (0.29 against 0.33), and opposite in hue to the blue-violet key block rather
  // than adjacent to it, where purple read as a smudge.
  //
  // Red carries no "mistake" meaning to steal here: Slide declares no
  // `findMistakes` hook, because every reachable position is legal.
  out[COL_CURSOR] = RED;

  return out;
}

// --- geometry ---------------------------------------------------------

export const PREFERRED_TILE_SIZE = 32;
/** The web build defines `NARROW_BORDERS` (docs/games/rendering.md § "Sizing"), so the board is
 * exactly `w*TILESIZE` by `h*TILESIZE` with no border at all. */
export const BORDER = 0;

export const FLASH_INTERVAL = 0.1;
export const FLASH_TIME = 3 * FLASH_INTERVAL;

const borderWidth = (ts: number): number => 1 + Math.floor(ts / 20);
const highlightWidth = (ts: number): number => 1 + Math.floor(ts / 16);

export function computeSize(p: { w: number; h: number }, ts: number): Size {
  return { w: p.w * ts + 2 * BORDER, h: p.h * ts + 2 * BORDER };
}

// --- the packed per-tile value ----------------------------------------

/**
 * The keyboard cursor is on this square. It takes bit 0, which upstream spent
 * on a write-only `BG_NORMAL`.
 *
 * Bits 0–30 are now all in use (bit 31 is the `Int32Array`'s sign), so the next
 * overlay has to widen the diff key rather than find a spare flag. Widening is
 * cheap — it is a repaint cache, not a wire format — but must be deliberate,
 * because an overlay that does not fit in the word silently fails to repaint
 * (docs/games/rendering.md § "A packed diff key runs out of bits, and dead flags are where the next one comes from").
 */
const FG_CURSOR = 0x00000001;
const BG_TARGET = 0x00000002;
const BG_FORCEFIELD = 0x00000004;
const FLASH_LOW = 0x00000008;
const FLASH_HIGH = 0x00000010;
const FG_WALL = 0x00000020;
const FG_MAIN = 0x00000040;
const FG_NORMAL = 0x00000080;
const FG_GRABBED = 0x00000100;
const FG_SHADOW = 0x00000200;
const FG_SOLVEPIECE = 0x00000400;
/** Shift of the block's own border/corner flags within the packed value. */
const FG_MAINPIECESH = 11;
/** Shift of the solve-shadow's border/corner flags. */
const FG_SHADOWSH = 19;
/** Which of this square's four sides face *out* of the exit gate (bits 27–30).
 * The gate is outlined around its whole region rather than filled per square,
 * so a square has to know about its neighbors. */
const GATE_LBORDER = 0x08000000;
const GATE_TBORDER = 0x10000000;
const GATE_RBORDER = 0x20000000;
const GATE_BBORDER = 0x40000000;

const PIECE_LBORDER = 0x01;
const PIECE_TBORDER = 0x02;
const PIECE_RBORDER = 0x04;
const PIECE_BBORDER = 0x08;
const PIECE_TLCORNER = 0x10;
const PIECE_TRCORNER = 0x20;
const PIECE_BLCORNER = 0x40;
const PIECE_BRCORNER = 0x80;
const PIECE_MASK = 0xff;

const hasAll = (val: number, mask: number): boolean => (val & mask) === mask;

// --- draw state -------------------------------------------------------

export interface SlideDrawState {
  started: boolean;
  tileSize: number;
  /** Last-drawn packed value per cell; `-1` forces a repaint. Every overlay
   * (drag, solve highlight, shadow, flash) is part of this one word, so they
   * all sit in the diff key by construction (docs/games/rendering.md § "The tile cache and the diff key"). */
  grid: Int32Array;
}

export function newDrawState(state: SlideState): SlideDrawState {
  return {
    started: false,
    tileSize: 0,
    grid: new Int32Array(state.w * state.h).fill(-1),
  };
}

export function setTileSize(ds: SlideDrawState, ts: number): void {
  ds.tileSize = ts;
}

// --- the fiddly bit: one section of one tile ---------------------------

const TYPE_MASK = 0xf000;
const COL_MASK = 0x0fff;
const TYPE_RECT = 0x0000;
const TYPE_TLCIRC = 0x4000;
const TYPE_TRCIRC = 0x5000;
const TYPE_BLCIRC = 0x6000;
const TYPE_BRCIRC = 0x7000;
/** Passed as a color to mean "leave this section alone". */
const SKIP = -1;

/**
 * Fill one rectangular section of a tile (upstream `maybe_rect`). `coltype`
 * is a palette index optionally ORed with a `TYPE_*CIRC` code, which asks for
 * a rounded corner — a quadrant of a circle inscribed in the section, with the
 * center at whichever corner the code names. `SKIP` draws nothing.
 *
 * With two colors, the quadrant is split along its diagonal by walking
 * Bresenham's circle directly and filling a horizontal and a vertical span per
 * step, because the drawing API has no draw-sector primitive.
 */
function maybeRect(dr: GameDrawing, rect: Rect, coltype: number, col2: number): void {
  if (coltype === SKIP) return;
  const color = coltype & COL_MASK;
  const type = coltype & TYPE_MASK;

  if (type === TYPE_RECT) {
    dr.drawRect(rect, color);
    return;
  }

  dr.clip(rect);

  const r = rect.w - 1;
  const cx = rect.x + (type & 0x1000 ? r : 0);
  const cy = rect.y + (type & 0x2000 ? r : 0);

  if (col2 === SKIP || col2 === coltype) {
    dr.drawCircle({ x: cx, y: cy }, r, color, color);
  } else {
    const xm = type & 0x1000 ? -1 : 1;
    const ym = type & 0x2000 ? -1 : 1;
    let by = r;
    let bx = 0;
    let bd = 0;
    while (by >= bx) {
      const x1 = cx + xm * bx;
      const y1 = cy + ym * bx;
      const x2 = cx + xm * by;
      const y2 = cy + ym * by;
      dr.drawRect(
        { x: Math.min(x1, x2), y: y1, w: Math.abs(x1 - x2) + 1, h: 1 },
        color,
      );
      dr.drawRect({ x: x1, y: Math.min(y1, y2), w: 1, h: Math.abs(y1 - y2) + 1 }, col2);

      bd += 2 * bx + 1;
      const bd2 = bd - (2 * by - 1);
      if (Math.abs(bd2) < Math.abs(bd)) {
        bd = bd2;
        by--;
      }
      bx++;
    }
  }

  dr.unclip();
}

/**
 * A wall square (upstream `draw_wallpart`). Walls fill their tile edge to edge
 * — no gap, so adjacent walls read as one continuous mass — with a bevel on
 * each side that faces something other than another wall, and a mitered
 * diagonal where a highlight and a lowlight edge meet.
 */
function drawWallpart(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  val: number,
  cl: number,
  cc: number,
  ch: number,
): void {
  const hw = highlightWidth(ts);

  dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, cc);
  if (val & PIECE_LBORDER) dr.drawRect({ x: tx, y: ty, w: hw, h: ts }, ch);
  if (val & PIECE_RBORDER) dr.drawRect({ x: tx + ts - hw, y: ty, w: hw, h: ts }, cl);
  if (val & PIECE_TBORDER) dr.drawRect({ x: tx, y: ty, w: ts, h: hw }, ch);
  if (val & PIECE_BBORDER) dr.drawRect({ x: tx, y: ty + ts - hw, w: ts, h: hw }, cl);

  /** One `hw`-square corner at `(x, y)`: filled `under`, with the triangle
   * drawn `over` it. */
  const miter = (
    x: number,
    y: number,
    triangle: Point[],
    under: number,
    over: number,
  ) => {
    const corner = { x, y, w: hw, h: hw };
    dr.drawRect(corner, under);
    dr.clip(corner);
    dr.drawPolygon(triangle, over, over);
    dr.unclip();
  };
  const bottomLeftTriangle: Point[] = [
    { x: tx - 1, y: ty + ts - hw - 1 },
    { x: tx + hw, y: ty + ts - hw - 1 },
    { x: tx - 1, y: ty + ts },
  ];
  const topRightTriangle: Point[] = [
    { x: tx + ts - hw - 1, y: ty - 1 },
    { x: tx + ts, y: ty - 1 },
    { x: tx + ts - hw - 1, y: ty + hw },
  ];

  if (hasAll(val, PIECE_BBORDER | PIECE_LBORDER))
    miter(tx, ty + ts - hw, bottomLeftTriangle, cl, ch);
  else if (val & PIECE_BLCORNER) miter(tx, ty + ts - hw, bottomLeftTriangle, ch, cl);

  if (hasAll(val, PIECE_TBORDER | PIECE_RBORDER))
    miter(tx + ts - hw, ty, topRightTriangle, cl, ch);
  else if (val & PIECE_TRCORNER) miter(tx + ts - hw, ty, topRightTriangle, ch, cl);

  if (val & PIECE_TLCORNER) dr.drawRect({ x: tx, y: ty, w: hw, h: hw }, ch);
  if (val & PIECE_BRCORNER)
    dr.drawRect({ x: tx + ts - hw, y: ty + ts - hw, w: hw, h: hw }, cl);
}

/**
 * One tile's worth of a movable block (upstream `draw_piecepart`, transcribed
 * 1:1 — see the module header for why).
 *
 * Blocks do not fill their tile: there is a `BORDER_WIDTH` gap around the
 * block's outer edges, then a `HIGHLIGHT_WIDTH` bevel, and rounded corners.
 * The tile is ruled into 25 sections by four horizontal and four vertical
 * lines (at `BORDER_WIDTH` and `BORDER_WIDTH + HIGHLIGHT_WIDTH` from each
 * side), and each section is decided separately from the border/corner flags.
 */
function drawPiecepart(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  val: number,
  cl: number,
  cc: number,
  ch: number,
): void {
  const bw = borderWidth(ts);
  const hw = highlightWidth(ts);

  const x = [tx, tx + bw, tx + bw + hw, ts + tx - bw - hw, ts + tx - bw, tx + ts];
  const y = [ty, ty + bw, ty + bw + hw, ts + ty - bw - hw, ts + ty - bw, ty + ts];

  const mr = (p: number, q: number, coltype: number, col2 = SKIP): void =>
    maybeRect(
      dr,
      { x: x[p], y: y[q], w: x[p + 1] - x[p], h: y[q + 1] - y[q] },
      coltype,
      col2,
    );

  const tb = val & PIECE_TBORDER;
  const bb = val & PIECE_BBORDER;
  const lb = val & PIECE_LBORDER;
  const rb = val & PIECE_RBORDER;
  const tl = val & PIECE_TLCORNER;
  const tr = val & PIECE_TRCORNER;
  const bl = val & PIECE_BLCORNER;
  const br = val & PIECE_BRCORNER;

  mr(0, 0, val & (PIECE_TLCORNER | PIECE_TBORDER | PIECE_LBORDER) ? SKIP : cc);
  mr(1, 0, tl ? ch : tb ? SKIP : lb ? ch : cc);
  mr(2, 0, tb ? SKIP : cc);
  mr(3, 0, tr ? cl : tb ? SKIP : rb ? cl : cc);
  mr(4, 0, val & (PIECE_TRCORNER | PIECE_TBORDER | PIECE_RBORDER) ? SKIP : cc);

  mr(0, 1, tl ? ch : lb ? SKIP : tb ? ch : cc);
  mr(1, 1, tl ? cc : SKIP);
  mr(
    1,
    1,
    tl
      ? ch | TYPE_TLCIRC
      : hasAll(val, PIECE_TBORDER | PIECE_LBORDER)
        ? ch | TYPE_BRCIRC
        : tb || lb
          ? ch
          : cc,
  );
  mr(2, 1, tb ? ch : cc);
  mr(3, 1, tr ? cc : SKIP);
  mr(
    3,
    1,
    (val & (PIECE_TBORDER | PIECE_RBORDER)) === PIECE_TBORDER
      ? ch
      : (val & (PIECE_TBORDER | PIECE_RBORDER)) === PIECE_RBORDER
        ? cl
        : hasAll(val, PIECE_TBORDER | PIECE_RBORDER)
          ? cl | TYPE_BLCIRC
          : tr
            ? cl | TYPE_TRCIRC
            : cc,
    ch,
  );
  mr(4, 1, tr ? ch : rb ? SKIP : tb ? ch : cc);

  mr(0, 2, lb ? SKIP : cc);
  mr(1, 2, lb ? ch : cc);
  mr(2, 2, cc);
  mr(3, 2, rb ? cl : cc);
  mr(4, 2, rb ? SKIP : cc);

  mr(0, 3, bl ? cl : lb ? SKIP : bb ? cl : cc);
  mr(1, 3, bl ? cc : SKIP);
  mr(
    1,
    3,
    (val & (PIECE_BBORDER | PIECE_LBORDER)) === PIECE_BBORDER
      ? cl
      : (val & (PIECE_BBORDER | PIECE_LBORDER)) === PIECE_LBORDER
        ? ch
        : hasAll(val, PIECE_BBORDER | PIECE_LBORDER)
          ? ch | TYPE_TRCIRC
          : bl
            ? ch | TYPE_BLCIRC
            : cc,
    cl,
  );
  mr(2, 3, bb ? cl : cc);
  mr(3, 3, br ? cc : SKIP);
  mr(
    3,
    3,
    br
      ? cl | TYPE_BRCIRC
      : hasAll(val, PIECE_BBORDER | PIECE_RBORDER)
        ? cl | TYPE_TLCIRC
        : bb || rb
          ? cl
          : cc,
  );
  mr(4, 3, br ? cl : rb ? SKIP : bb ? cl : cc);

  mr(0, 4, val & (PIECE_BLCORNER | PIECE_BBORDER | PIECE_LBORDER) ? SKIP : cc);
  mr(1, 4, bl ? ch : bb ? SKIP : lb ? ch : cc);
  mr(2, 4, bb ? SKIP : cc);
  mr(3, 4, br ? cl : bb ? SKIP : rb ? cl : cc);
  mr(4, 4, val & (PIECE_BRCORNER | PIECE_BBORDER | PIECE_RBORDER) ? SKIP : cc);
}

/**
 * **The exit gate** — the squares only the key block may cross (upstream's
 * "forcefield"; the help page calls it the exit gate, which is what it is).
 *
 * A dashed outline around the gate *region*, drawn in the wall's color: a gate
 * is a gap in the wall, and the one boundary on this board that is crossed
 * rather than obeyed. Dashes are the whole message — a solid line reads as a
 * wall, and this one is permeable.
 *
 * It replaces upstream's "cattle grid", which its author called *"disgusting"*
 * and asked to have replaced with "something completely different" (it was in
 * fact a full lattice of thick lowlight bars over the whole cell). Marking the
 * boundary instead of filling the cell stays legible as tiles get small, where
 * a texture turns to mud, and lets it lie **on top of** the exit's green — the
 * gate is usually inside the exit area — without either marking obscuring the
 * other, which a second fill could not do.
 */
function drawGate(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  val: number,
): void {
  const thickness = Math.max(2, Math.floor(ts / 16));
  // Four dashes per side, on-off-on-… — enough to read as dashed at the smallest
  // tile the board is ever laid out at, and phase-aligned to the square so a
  // run of gate squares makes one continuous dashed line.
  const dashes = 4;
  const period = ts / dashes;
  const dash = Math.max(2, Math.round(period * 0.55));

  const side = (horizontal: boolean, x0: number, y0: number): void => {
    for (let i = 0; i < dashes; i++) {
      const at = Math.round(i * period);
      const len = Math.min(dash, ts - at);
      dr.drawRect(
        horizontal
          ? { x: x0 + at, y: y0, w: len, h: thickness }
          : { x: x0, y: y0 + at, w: thickness, h: len },
        COL_WALL,
      );
    }
  };

  if (val & GATE_TBORDER) side(true, tx, ty);
  if (val & GATE_BBORDER) side(true, tx, ty + ts - thickness);
  if (val & GATE_LBORDER) side(false, tx, ty);
  if (val & GATE_RBORDER) side(false, tx + ts - thickness, ty);
}

/** Upstream `draw_tile`. */
function drawTile(
  dr: GameDrawing,
  ds: SlideDrawState,
  gx: number,
  gy: number,
  val: number,
): void {
  const ts = ds.tileSize;
  const tx = gridCoord(gx, ts, BORDER);
  const ty = gridCoord(gy, ts, BORDER);

  // Background: the floor, or the target area's green.
  let cc = val & BG_TARGET ? COL_TARGET : COL_BACKGROUND;
  let ch = cc + 1;
  let cl = cc + 2;
  if (val & FLASH_LOW) cc = cl;
  else if (val & FLASH_HIGH) cc = ch;

  dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, cc);
  if (val & BG_FORCEFIELD) drawGate(dr, ts, tx, ty, val);

  // Midground: where the Solve route wants the next piece to end up, drawn as
  // the piece's own outline with **nothing inside it** — `SKIP` as the body
  // color leaves `drawPiecepart` painting only the bevel bands, which trace
  // the shape exactly. A filled ghost reads as another piece, whatever color
  // it is; an empty one reads as a space shaped like the piece, which is what a
  // destination is. (Upstream filled it with the lowlight, and its author
  // noted "the shadow blends in too well with the piece lowlights".)
  if (val & FG_SHADOW)
    drawPiecepart(
      dr,
      ts,
      tx,
      ty,
      (val >> FG_SHADOWSH) & PIECE_MASK,
      COL_ROUTE_SHADOW,
      SKIP,
      COL_ROUTE_SHADOW,
    );

  // Foreground: a section of a block, or of the wall.
  if (val & FG_WALL) {
    cc = COL_WALL;
    ch = cc + 1;
    cl = cc + 2;
    if (val & FLASH_LOW) cc = cl;
    else if (val & FLASH_HIGH) cc = ch;

    drawWallpart(dr, ts, tx, ty, (val >> FG_MAINPIECESH) & PIECE_MASK, cl, cc, ch);
  } else if (val & (FG_MAIN | FG_NORMAL)) {
    if (val & FG_GRABBED) cc = val & FG_MAIN ? COL_MAIN_GRABBED : COL_GRABBED;
    else cc = val & FG_MAIN ? COL_MAIN : COL_BLOCK;
    ch = cc + 1;
    cl = cc + 2;

    if (val & FLASH_LOW) cc = cl;
    else if (val & FLASH_HIGH) cc = ch;

    // The Solve route's next piece keeps its own fill and wears the accent as a
    // band where its bevel would be. (Upstream painted the whole piece in its
    // highlight — pure white on a light host — which its author called
    // excessive: a light source, where an ordering cue is wanted.)
    if (val & FG_SOLVEPIECE) {
      ch = COL_ROUTE;
      cl = COL_ROUTE;
    }

    drawPiecepart(dr, ts, tx, ty, (val >> FG_MAINPIECESH) & PIECE_MASK, cl, cc, ch);
  }

  // Topmost: the keyboard cursor, as the collection's four corner brackets.
  // They sit *beside* the content rather than over it, so a block's bevel and
  // the exit's tint still read underneath, and every game uses them for "the
  // keyboard is here". `r` is floored at 2 so the arms stay two distinct
  // strokes per corner at the smallest tile; the stroke scales with the tile,
  // because this board is four shades of one gray and a hairline has nothing
  // carrying it.
  if (val & FG_CURSOR) {
    const r = Math.max(2, Math.floor(ts / 2) - highlightWidth(ts));
    drawRectCorners(
      dr,
      tx + Math.floor(ts / 2),
      ty + Math.floor(ts / 2),
      r,
      COL_CURSOR,
      1 + Math.floor(ts / 24),
    );
  }

  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });
}

/**
 * Which of this square's four sides and four corners face something that is
 * not part of the same block (upstream `find_piecepart`). A corner flag means
 * "the diagonal neighbor is a different block even though both adjoining
 * sides are ours", i.e. a concave notch.
 */
function findPiecepart(w: number, h: number, dsf: Dsf, x: number, y: number): number {
  const i = y * w + x;
  const canon = dsf.canonify(i);
  let val = 0;

  if (x === 0 || canon !== dsf.canonify(i - 1)) val |= PIECE_LBORDER;
  if (y === 0 || canon !== dsf.canonify(i - w)) val |= PIECE_TBORDER;
  if (x === w - 1 || canon !== dsf.canonify(i + 1)) val |= PIECE_RBORDER;
  if (y === h - 1 || canon !== dsf.canonify(i + w)) val |= PIECE_BBORDER;
  if (!(val & (PIECE_TBORDER | PIECE_LBORDER)) && canon !== dsf.canonify(i - 1 - w))
    val |= PIECE_TLCORNER;
  if (!(val & (PIECE_TBORDER | PIECE_RBORDER)) && canon !== dsf.canonify(i + 1 - w))
    val |= PIECE_TRCORNER;
  if (!(val & (PIECE_BBORDER | PIECE_LBORDER)) && canon !== dsf.canonify(i - 1 + w))
    val |= PIECE_BLCORNER;
  if (!(val & (PIECE_BBORDER | PIECE_RBORDER)) && canon !== dsf.canonify(i + 1 + w))
    val |= PIECE_BRCORNER;
  return val;
}

// --- redraw -----------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SlideDrawState,
  _prev: SlideState | null,
  state: SlideState,
  _dir: number,
  ui: SlideUi,
  _animTime: number,
  flashTime: number,
): void {
  const { w, h } = state;
  const wh = w * h;
  const ts = ds.tileSize;

  if (!ds.started) {
    // The engine paints no pixels of its own
    // (docs/games/rendering.md § "The rendering doctrine").
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    ds.started = true;
  }

  // The board we display, which is not state's board while a block is held:
  // the held block is drawn where it would land if it were put down now. That
  // is the whole of the keyboard's move preview too — a keyboard grab moves the
  // same `grabCurrpos`, so it needs no rendering of its own.
  //
  // Upstream asserts if the held block no longer fits. Only a state change under
  // a live grab could cause that, and `changedState` cancels the grab — but draw
  // the plain board rather than throw if it ever happens anyway.
  const board = state.board.slice();
  if (
    ui.grabbed &&
    !movePiece(
      w,
      h,
      state.board,
      board,
      state.forcefield,
      ui.grabAnchor,
      ui.grabCurrpos,
    )
  )
    board.set(state.board);

  // Where the installed Solve route wants to move next, if any.
  let solvesrc = -1;
  let solvedst = -1;
  if (state.soln) {
    const step = state.soln[state.solnIndex];
    solvesrc = step.from;
    solvedst = step.to;
    if (solvesrc === state.lastmovedPos) solvesrc = state.lastmoved;
    if (solvesrc === ui.grabAnchor) solvesrc = ui.grabCurrpos;
  }

  // A dsf over the displayed board, so we can tell which edges are internal to
  // a block and which are boundaries. Walls join up with each other.
  const dsf = new Dsf(wh);
  let mainanchor = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      if (isDist(board[i])) dsf.merge(i, i - board[i]);
      if (board[i] === MAINANCHOR) mainanchor = i;
      if (board[i] === WALL) {
        if (x > 0 && board[i - 1] === WALL) dsf.merge(i, i - 1);
        if (y > 0 && board[i - w] === WALL) dsf.merge(i, i - w);
      }
    }
  if (mainanchor < 0) throw new Error("slide: board has no main block");

  const mainpos = dsf.canonify(mainanchor);
  const grabpos = ui.grabCurrpos > 0 ? dsf.canonify(ui.grabCurrpos) : -1;
  const solvepos = solvesrc >= 0 ? dsf.canonify(solvesrc) : -1;
  const cursor = ui.cursor.visible ? cursorPos(ui, w) : -1;
  let flash = 0;
  if (flashTime > 0)
    flash = Math.floor(flashTime / FLASH_INTERVAL) & 1 ? FLASH_LOW : FLASH_HIGH;

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      // Is this square part of the target area? Translate it by the offset
      // that would take the target back to where the main block is, and see
      // whether it lands on the main block.
      let j = i + mainanchor - (state.ty * w + state.tx);
      while (j >= 0 && j < wh && isDist(board[j])) j -= board[j];
      let val = j === mainanchor ? BG_TARGET : 0;

      if (i === cursor) val |= FG_CURSOR;

      if (state.forcefield[i]) {
        // The gate is outlined as a region, so each square carries the sides
        // that face out of it — including the board edge, which is an outside.
        val |= BG_FORCEFIELD;
        if (x === 0 || !state.forcefield[i - 1]) val |= GATE_LBORDER;
        if (y === 0 || !state.forcefield[i - w]) val |= GATE_TBORDER;
        if (x === w - 1 || !state.forcefield[i + 1]) val |= GATE_RBORDER;
        if (y === h - 1 || !state.forcefield[i + w]) val |= GATE_BBORDER;
      }

      val |= flash;

      if (board[i] !== EMPTY) {
        const canon = dsf.canonify(i);

        if (board[i] === WALL) val |= FG_WALL;
        else if (canon === mainpos) val |= FG_MAIN;
        else val |= FG_NORMAL;
        if (canon === grabpos) val |= FG_GRABBED;
        if (canon === solvepos) val |= FG_SOLVEPIECE;

        val |= findPiecepart(w, h, dsf, x, y) << FG_MAINPIECESH;
      }

      // Mid-route: a shadow of the block where the route wants it to end up.
      if (solvepos >= 0) {
        const si = i - solvedst + solvesrc;
        if (si >= 0 && si < wh && dsf.canonify(si) === solvepos) {
          val |= findPiecepart(w, h, dsf, si % w, Math.floor(si / w)) << FG_SHADOWSH;
          val |= FG_SHADOW;
        }
      }

      if (val !== ds.grid[i]) {
        drawTile(dr, ds, x, y, val);
        ds.grid[i] = val;
      }
    }
}
