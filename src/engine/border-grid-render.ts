/**
 * The border-marking grid's *look*: the third layer of the mechanic
 * [`border-grid.ts`](./border-grid.ts) owns the model and the input of.
 *
 * WHAT LIVES HERE is what would have to change in both games at once, by the
 * same test `border-grid.ts` states:
 *
 * - **The error model.** A region larger than `k`, a region smaller than `k`, or
 *   a wall that separates nothing, read off the two DSFs each frame. Change what
 *   counts as a wrong wall and both games change together, or one is wrong.
 * - **The half-grid cursor**, whose *movement* `border-grid.ts` owns
 *   (`moveBorderCursor`).
 * - **The four edge rects**, keyed off the border bits the module defines, and
 *   the tile skeleton around them — clip, body, content, edges, unclip, update.
 * - **The geometry.**
 *
 * WHAT DOES NOT live here is the clue layer and everything below it. Palisade
 * draws a digit, counts a cell's walls, and has an explained hint with its own
 * marks; Separate draws a letter, shades regions and reddens a letter repeated
 * inside one. Those are the puzzles. A game supplies its own palette indices and
 * a `drawContent` callback for the middle of the tile, and computes its own
 * validity — the shared code never asks which game it is drawing.
 */

import { BORDER, DISABLED, DX, DY, margin, outOfBounds } from "./border-grid.ts";
import type { Dsf } from "./dsf.ts";
import type { GameDrawing } from "./game.ts";
import type { GridCursor } from "./pointer.ts";
import type { Rect, Size } from "./types.ts";

// --- geometry ---------------------------------------------------------------

/** The wall's thickness: a wall is drawn as a rect, not a line, because it
 * carries three states and an error color. Upstream's expression; every pixel
 * of the board depends on it. */
export const tileWidth = (ts: number): number => Math.max(Math.floor((3 * ts) / 32), 1);

/** The center of a tile's *body*, which is offset by half a wall from the
 * center of its cell. */
export const center = (ts: number): number =>
  Math.floor(ts / 2) + Math.floor(tileWidth(ts) / 2);

/** Room for the outer walls, plus `margin` either side. */
export function borderGridSize(w: number, h: number, ts: number): Size {
  return {
    w: w * ts + tileWidth(ts) + 2 * margin(ts),
    h: h * ts + tileWidth(ts) + 2 * margin(ts),
  };
}

// --- the packed tile flags --------------------------------------------------
//
// One layout for both games, which is free to change because these live only in
// `ds.cache` — a draw-state diff key, rebuilt from scratch by `newDrawState`,
// never persisted and never in a desc or a save. Bits 0..7 are the border bits
// themselves (`BORDER` and its `DISABLED` companions).

/** This edge is wrong: it makes a region the wrong size, or separates nothing. */
export const BORDER_ERROR = (border: number): number => border << 8;
/** The game's own clue on this cell contradicts the board. */
export const F_CLUE_ERROR = 1 << 12;
/** The win flash is on this frame. */
export const F_FLASH = 1 << 13;
/**
 * Which of the nine half-grid positions in this tile the cursor is on, if any.
 *
 * Nothing *draws* from these — the cursor is drawn once, over the tiles, by
 * {@link drawBorderCursor}. They are here so the tile's diff key changes when
 * the cursor moves across it, which is what makes the old cursor get erased
 * (`docs/games/rendering.md` § "The tile cache and the diff key").
 */
export const CONTAINS_CURSOR = (x: number): number => x << 14;
/** This cell is in a region the game considers finished and correct. */
export const F_CORRECT = 1 << 23;
/** This edge is one the displayed hint forces. Unused by a game with no hint. */
export const EDGE_HINT = (border: number): number => border << 24;
/** The first bit a game may use for something of its own (Palisade's
 * hint-referenced cell). Kept as a named floor so a new flag here and a new
 * flag in a game cannot silently collide. */
export const GAME_FLAG_SHIFT = 28;

/** Colors the shared parts draw with, by each game's own palette index. */
export interface BorderGridColors {
  background: number;
  flash: number;
  correct: number;
  /** A wall, and the grid's ink generally. */
  grid: number;
  /** A border known *not* to be a wall. */
  lineNo: number;
  /** A border not yet decided. */
  lineMaybe: number;
  error: number;
  /** An edge the displayed hint forces; omit in a game with no hint. */
  hintEdge?: number;
  /** The keyboard cursor's outline. */
  cursor: number;
}

// --- draw state --------------------------------------------------------------

export interface BorderGridDrawState {
  started: boolean;
  tileSize: number;
  w: number;
  h: number;
  /** `w·h` cache of last-drawn packed tile flags; `-1` forces a draw. */
  cache: Int32Array;
}

export function newBorderGridDrawState(w: number, h: number): BorderGridDrawState {
  return { started: false, tileSize: 0, w, h, cache: new Int32Array(w * h).fill(-1) };
}

// --- the flags a frame computes ----------------------------------------------

/**
 * The mechanic's own error bits for one cell: for each of its four borders,
 * whether that border makes a region too large, too small, or is a wall that
 * separates nothing.
 *
 * `black` is the DSF over wall-separated regions, `yellow` the one over
 * no-wall regions — `buildDsf(w, h, borders, true | false)`.
 */
export function borderErrorBits(
  c: number,
  r: number,
  w: number,
  h: number,
  k: number,
  borders: Uint8Array,
  black: Dsf,
  yellow: Dsf,
): number {
  const i = r * w + c;
  let bits = 0;
  for (let dir = 0; dir < 4; dir++) {
    const cc = c + DX[dir];
    const rr = r + DY[dir];
    if (outOfBounds(cc, rr, w, h)) continue;
    const ii = rr * w + cc;
    const tooLarge =
      (yellow.size(i) > k || yellow.size(ii) > k) && !yellow.equivalent(i, ii);
    const tooSmall =
      (black.size(i) < k || black.size(ii) < k) && !black.equivalent(i, ii);
    const dangling =
      borders[i] & BORDER(dir) &&
      (yellow.equivalent(i, ii) || (black.size(i) <= k && black.equivalent(i, ii)));
    if (tooLarge || tooSmall || dangling) bits |= BORDER_ERROR(BORDER(dir));
  }
  return bits;
}

/**
 * The Check & Save overlay, as per-cell edge-error bits.
 *
 * A mistake is an edge that contradicts the unique solution, and it reddens
 * through the *same* channel as the live error model above — one red edge means
 * one thing to a player, whichever of the two found it.
 */
export function mistakeEdgeBits(
  w: number,
  h: number,
  mistakes: readonly { x: number; y: number; dir: number }[] | undefined,
): Int32Array {
  const mask = new Int32Array(w * h);
  for (const m of mistakes ?? []) mask[m.y * w + m.x] |= BORDER_ERROR(BORDER(m.dir));
  return mask;
}

/** The cursor-containment bits for this tile — see {@link CONTAINS_CURSOR}. */
export function cursorBits(cursor: GridCursor, c: number, r: number): number {
  const u = cursor.x - 2 * c;
  const v = cursor.y - 2 * r;
  if (!cursor.visible || u < 0 || u > 2 || v < 0 || v > 2) return 0;
  return CONTAINS_CURSOR(1 << (3 * u + v));
}

/**
 * A wall interior to a wall-bounded region separates nothing, so that region is
 * not finished however right its size or contents are. Both games invalidate on
 * it, and neither could want to differ: it is the same "dangling" the error
 * bits above already redden.
 */
export function invalidateDanglingRegions(
  w: number,
  h: number,
  borders: Uint8Array,
  black: Dsf,
  validRoot: Map<number, boolean>,
): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w && borders[i] & BORDER(1) && black.equivalent(i, i + 1))
        validRoot.set(black.canonify(i), false);
      if (y + 1 < h && borders[i] & BORDER(2) && black.equivalent(i, i + w))
        validRoot.set(black.canonify(i), false);
    }
  }
}

// --- drawing ------------------------------------------------------------------

function edgeColor(flags: number, dir: number, colors: BorderGridColors): number {
  const b = BORDER(dir);
  // A hint's forced edges win over the normal states: they share a fate, so
  // they share a color.
  if (colors.hintEdge !== undefined && flags & EDGE_HINT(b)) return colors.hintEdge;
  if (flags & BORDER_ERROR(b)) return colors.error;
  if (flags & b) return colors.grid; // a wall
  if (flags & DISABLED(b)) return colors.lineNo;
  return colors.lineMaybe;
}

/** The board background and the grid's dots, drawn once on the first frame. */
export function drawBorderGridBackground(
  dr: GameDrawing,
  ts: number,
  w: number,
  h: number,
  colors: BorderGridColors,
): void {
  const size = borderGridSize(w, h, ts);
  dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, colors.background);
  const tw = tileWidth(ts);
  for (let r = 0; r <= h; r++) {
    for (let c = 0; c <= w; c++) {
      dr.drawRect(
        { x: margin(ts) + ts * c, y: margin(ts) + ts * r, w: tw, h: tw },
        colors.grid,
      );
    }
  }
  dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
}

/**
 * One tile: clip, body, the game's own content, the four border edges, unclip,
 * update.
 *
 * `drawContent` draws the middle — a digit, a letter, a hint outline. It gets
 * the **body** rect (inside the walls, which is what an inset outline wants) and
 * the tile **origin** (which is what a centered glyph wants, since `center`
 * already accounts for the wall). Both, because each game needs a different one
 * and re-deriving either at the call site puts the geometry back in two places.
 *
 * It is a callback rather than three exported steps because the *order* is the
 * point: content goes under the edges, and the clip/unclip/update bookkeeping
 * around all of it is exactly the sort of thing that drifts when two games each
 * spell it.
 */
export function drawBorderTile(
  dr: GameDrawing,
  ts: number,
  r: number,
  c: number,
  flags: number,
  colors: BorderGridColors,
  drawContent?: (body: Rect, origin: { x: number; y: number }) => void,
): void {
  const w = tileWidth(ts);
  const x = margin(ts) + ts * c;
  const y = margin(ts) + ts * r;

  dr.clip({ x, y, w: ts + w, h: ts + w });

  const body = { x: x + w, y: y + w, w: ts - w, h: ts - w };
  dr.drawRect(
    body,
    flags & F_FLASH
      ? colors.flash
      : flags & F_CORRECT
        ? colors.correct
        : colors.background,
  );

  drawContent?.(body, { x, y });

  // Four border edges (U, R, D, L).
  dr.drawRect({ x: x + w, y, w: ts - w, h: w }, edgeColor(flags, 0, colors));
  dr.drawRect({ x: x + ts, y: y + w, w, h: ts - w }, edgeColor(flags, 1, colors));
  dr.drawRect({ x: x + w, y: y + ts, w: ts - w, h: w }, edgeColor(flags, 2, colors));
  dr.drawRect({ x, y: y + w, w, h: ts - w }, edgeColor(flags, 3, colors));

  dr.unclip();
  dr.drawUpdate({ x, y, w: ts + w, h: ts + w });
}

/**
 * The half-grid cursor, drawn over the tiles.
 *
 * `cur_type = (offX << 1) + offY`: 0 a corner, 1 a left border, 2 a top border,
 * 3 a cell center — which is why the box is a third of a tile across the axes
 * the cursor sits *between* cells on, and two thirds along the others.
 */
export function drawBorderCursor(
  dr: GameDrawing,
  ts: number,
  curX: number,
  curY: number,
  color: number,
): void {
  const offX = curX % 2;
  const offY = curY % 2;
  const x = margin(ts) + ts * Math.floor(curX / 2);
  const y = margin(ts) + ts * Math.floor(curY / 2);
  const w = tileWidth(ts);

  const centerX = x + (offX === 0 ? Math.floor(w / 2) : center(ts));
  const centerY = y + (offY === 0 ? Math.floor(w / 2) : center(ts));

  const third = Math.floor(ts / 3);
  const twoThird = Math.floor((2 * ts) / 3);
  const cw = offX === 0 ? third : twoThird;
  const ch = offY === 0 ? third : twoThird;

  const ox = centerX - Math.floor(cw / 2);
  const oy = centerY - Math.floor(ch / 2);
  // Outline (upstream `draw_rect_outline`): four 1-px edges.
  dr.drawLine({ x: ox, y: oy }, { x: ox + cw, y: oy }, color, 1);
  dr.drawLine({ x: ox + cw, y: oy }, { x: ox + cw, y: oy + ch }, color, 1);
  dr.drawLine({ x: ox + cw, y: oy + ch }, { x: ox, y: oy + ch }, color, 1);
  dr.drawLine({ x: ox, y: oy + ch }, { x: ox, y: oy }, color, 1);
  dr.drawUpdate({ x: ox, y: oy, w: cw + 1, h: ch + 1 });
}
