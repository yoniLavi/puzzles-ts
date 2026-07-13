/**
 * Inertia's renderer.
 *
 * The board is a plain per-tile cache (cell value OR'd with the flash bits, in
 * an `Int32Array` — playbook §3.2). The ball is a *sprite*: it is drawn over
 * whatever tile it happens to be over, so the tile beneath it is saved into a
 * blitter first and restored at the top of the next frame. That also means the
 * route arrow, which is drawn on the ball, can never go stale — it is repainted
 * every frame and so is not subject to the §3.2 "overlay must be in the diff
 * key" trap.
 *
 * A move animates the ball sliding along its path; gems disappear as it reaches
 * them, rather than all at once when the move lands.
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { coord as coordE } from "../../engine/geometry.ts";
import {
  BLANK,
  DIRECTIONS,
  DX,
  DY,
  GEM,
  type InertiaParams,
  type InertiaState,
  type InertiaUi,
  MINE,
  STOP,
  WALL,
} from "./state.ts";

// --- palette (index-for-index with the C enum) ------------------------

export const COL_BACKGROUND = 0;
export const COL_OUTLINE = 1;
export const COL_HIGHLIGHT = 2;
export const COL_LOWLIGHT = 3;
export const COL_PLAYER = 4;
export const COL_DEAD_PLAYER = 5;
export const COL_MINE = 6;
export const COL_GEM = 7;
export const COL_WALL = 8;
export const COL_HINT = 9;

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const ret: Colour[] = new Array(10);

  ret[COL_BACKGROUND] = background;
  ret[COL_HIGHLIGHT] = highlight;
  ret[COL_LOWLIGHT] = lowlight;
  ret[COL_OUTLINE] = [0, 0, 0];
  ret[COL_PLAYER] = [0, 1, 0];
  ret[COL_DEAD_PLAYER] = [1, 0, 0];
  ret[COL_MINE] = [0, 0, 0];
  ret[COL_GEM] = [0.6, 1, 1];
  // A wall is the background nudged a quarter of the way to the highlight.
  ret[COL_WALL] = [0, 1, 2].map(
    (i) => (3 * background[i] + highlight[i]) / 4,
  ) as unknown as Colour;
  ret[COL_HINT] = [1, 1, 0];

  return ret;
}

// --- geometry --------------------------------------------------------

export const PREFERRED_TILE_SIZE = 32;

/** The web build compiles with `NARROW_BORDERS` (see `webapp.cmake`), so the
 * border is one pixel, not a whole tile — playbook §3.2. */
export const BORDER = 1;

const coord = (pos: number, ts: number): number => coordE(pos, ts, BORDER);
const highlightWidth = (ts: number): number => Math.floor(ts / 10);

export function computeSize(p: InertiaParams, ts: number): Size {
  return { w: 2 * BORDER + 1 + p.w * ts, h: 2 * BORDER + 1 + p.h * ts };
}

// --- draw state ------------------------------------------------------

/** Flash bits OR'd into a cached tile value, so a flash repaints the board
 * through the ordinary per-tile diff. */
const FLASH_DEAD = 0x100;
const FLASH_WIN = 0x200;

const UNDRAWN = -1;

export interface InertiaDrawState {
  started: boolean;
  tileSize: number;
  /** Cell value | flash bits, per square. */
  grid: Int32Array;
  playerBackground: unknown;
  playerBgSaved: boolean;
  pbgX: number;
  pbgY: number;
}

export function newDrawState(s: InertiaState): InertiaDrawState {
  return {
    started: false,
    tileSize: PREFERRED_TILE_SIZE,
    grid: new Int32Array(s.params.w * s.params.h).fill(UNDRAWN),
    // The blitter can't be allocated until we know the tile size *and* have a
    // GameDrawing, so `redraw` does it lazily (the Pegs pattern).
    playerBackground: null,
    playerBgSaved: false,
    pbgX: -1,
    pbgY: -1,
  };
}

export function setTileSize(ds: InertiaDrawState, ts: number): void {
  ds.tileSize = ts;
  // The old blitter is the wrong size now; drop it and let `redraw` remake it.
  ds.playerBackground = null;
  ds.playerBgSaved = false;
}

// --- tiles -----------------------------------------------------------

function drawTile(dr: GameDrawing, ts: number, x: number, y: number, v: number): void {
  const tx = coord(x, ts);
  const ty = coord(y, ts);
  const bg =
    v & FLASH_DEAD ? COL_DEAD_PLAYER : v & FLASH_WIN ? COL_HIGHLIGHT : COL_BACKGROUND;
  const cell = v & ~(FLASH_DEAD | FLASH_WIN);
  const hw = highlightWidth(ts);

  dr.clip({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 });
  dr.drawRect({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 }, bg);

  if (cell === WALL) {
    // A bevelled block: lit from the top left.
    dr.drawPolygon(
      [
        { x: tx + ts, y: ty + ts },
        { x: tx + ts, y: ty + 1 },
        { x: tx + 1, y: ty + ts },
      ],
      COL_LOWLIGHT,
      COL_LOWLIGHT,
    );
    dr.drawPolygon(
      [
        { x: tx + 1, y: ty + 1 },
        { x: tx + ts, y: ty + 1 },
        { x: tx + 1, y: ty + ts },
      ],
      COL_HIGHLIGHT,
      COL_HIGHLIGHT,
    );
    dr.drawRect(
      { x: tx + 1 + hw, y: ty + 1 + hw, w: ts - 2 * hw, h: ts - 2 * hw },
      COL_WALL,
    );
  } else if (cell === MINE) {
    const cx = tx + Math.floor(ts / 2);
    const cy = ty + Math.floor(ts / 2);
    const r = Math.floor(ts / 2) - 3;
    const spike = Math.floor(r / 6);

    dr.drawCircle({ x: cx, y: cy }, Math.floor((5 * r) / 6), COL_MINE, COL_MINE);
    dr.drawRect({ x: cx - spike, y: cy - r, w: 2 * spike + 1, h: 2 * r + 1 }, COL_MINE);
    dr.drawRect({ x: cx - r, y: cy - spike, w: 2 * r + 1, h: 2 * spike + 1 }, COL_MINE);
    // A glint, so it reads as a shiny sphere.
    dr.drawRect(
      {
        x: cx - Math.floor(r / 3),
        y: cy - Math.floor(r / 3),
        w: Math.floor(r / 3),
        h: Math.floor(r / 4),
      },
      COL_HIGHLIGHT,
    );
  } else if (cell === STOP) {
    // A ring: an outlined circle with its horizontal and vertical bands erased.
    const band = Math.floor((ts * 3) / 7);
    dr.drawCircle(
      { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
      band,
      -1,
      COL_OUTLINE,
    );
    dr.drawRect({ x: tx + band, y: ty + 1, w: ts - 2 * band + 1, h: ts - 1 }, bg);
    dr.drawRect({ x: tx + 1, y: ty + band, w: ts - 1, h: ts - 2 * band + 1 }, bg);
  } else if (cell === GEM) {
    const half = Math.floor(ts / 2);
    const r = Math.floor((ts * 5) / 14);
    dr.drawPolygon(
      [
        { x: tx + half, y: ty + half - r },
        { x: tx + half - r, y: ty + half },
        { x: tx + half, y: ty + half + r },
        { x: tx + half + r, y: ty + half },
      ],
      COL_GEM,
      COL_OUTLINE,
    );
  }

  dr.unclip();
  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });
}

// --- the ball --------------------------------------------------------

/** The ball, plus the route arrow when a route is installed. `x`/`y` are the
 * sprite's top-left pixel, which is fractional mid-slide. */
function drawPlayer(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  dead: boolean,
  hintDir: number,
): void {
  const half = Math.floor(ts / 2);

  if (dead) {
    // A jagged splat: eight spikes out to the tile edge, with the gaps between
    // them pulled in to a quarter of the radius.
    const coords: Point[] = [];
    const reach = Math.floor((ts * 3) / 7);
    for (let d = 0; d < DIRECTIONS; d++) {
      let x1 = DX[d];
      let y1 = DY[d];
      let len = Math.sqrt(x1 * x1 + y1 * y1);
      x1 /= len;
      y1 /= len;

      let x3 = DX[(d + 1) % DIRECTIONS];
      let y3 = DY[(d + 1) % DIRECTIONS];
      len = Math.sqrt(x3 * x3 + y3 * y3);
      x3 /= len;
      y3 /= len;

      const x2 = (x1 + x3) / 4;
      const y2 = (y1 + y3) / 4;

      coords.push({
        x: x + half + Math.trunc(reach * x1),
        y: y + half + Math.trunc(reach * y1),
      });
      coords.push({
        x: x + half + Math.trunc(reach * x2),
        y: y + half + Math.trunc(reach * y2),
      });
    }
    dr.drawPolygon(coords, COL_DEAD_PLAYER, COL_OUTLINE);
  } else {
    dr.drawCircle(
      { x: x + half, y: y + half },
      Math.floor(ts / 3),
      COL_PLAYER,
      COL_OUTLINE,
    );
  }

  if (!dead && hintDir >= 0) {
    // An arrow along the route's next direction. Diagonals are shortened so
    // they don't stick out further than the orthogonals.
    const scale = DX[hintDir] && DY[hintDir] ? 0.8 : 1.0;
    const reach = Math.floor((ts * 2) / 5);
    const ax = Math.trunc(reach * scale * DX[hintDir]);
    const ay = Math.trunc(reach * scale * DY[hintDir]);
    const px = -ay;
    const py = ax;
    const ox = x + half;
    const oy = y + half;
    const t = (n: number, d: number): number => Math.trunc(n / d);

    dr.drawPolygon(
      [
        { x: ox + t(px, 9), y: oy + t(py, 9) },
        { x: ox + t(px, 9) + t(ax * 2, 3), y: oy + t(py, 9) + t(ay * 2, 3) },
        { x: ox + t(px, 3) + t(ax * 2, 3), y: oy + t(py, 3) + t(ay * 2, 3) },
        { x: ox + ax, y: oy + ay },
        { x: ox - t(px, 3) + t(ax * 2, 3), y: oy - t(py, 3) + t(ay * 2, 3) },
        { x: ox - t(px, 9) + t(ax * 2, 3), y: oy - t(py, 9) + t(ay * 2, 3) },
        { x: ox - t(px, 9), y: oy - t(py, 9) },
      ],
      COL_HINT,
      COL_OUTLINE,
    );
  }

  dr.drawUpdate({ x, y, w: ts, h: ts });
}

// --- redraw ----------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: InertiaDrawState | null,
  prev: InertiaState | null,
  s: InertiaState,
  dir: number,
  ui: InertiaUi,
  animTime: number,
  flashTime: number,
): void {
  if (!ds) return;
  const { w, h } = s.params;
  const ts = ds.tileSize;

  // The flash blinks over its length: on for the first and third of three
  // phases, off for the middle one.
  const flashing =
    flashTime > 0 && Math.floor((flashTime * 3) / FLASH_LENGTH) % 2 === 0;
  const flashType = flashing ? ui.flashType : 0;

  // Erase the ball, restoring whatever tile it was sitting on.
  if (ds.playerBgSaved && ds.playerBackground) {
    dr.blitterLoad(ds.playerBackground, { x: ds.pbgX, y: ds.pbgY });
    dr.drawUpdate({ x: ds.pbgX, y: ds.pbgY, w: ts, h: ts });
    ds.playerBgSaved = false;
  }

  if (!ds.started) {
    // The engine paints no pixels of its own: fill the whole background, then
    // rule the grid.
    const size = computeSize(s.params, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });

    for (let y = 0; y <= h; y++) {
      dr.drawLine(
        { x: coord(0, ts), y: coord(y, ts) },
        { x: coord(w, ts), y: coord(y, ts) },
        COL_LOWLIGHT,
        1,
      );
    }
    for (let x = 0; x <= w; x++) {
      dr.drawLine(
        { x: coord(x, ts), y: coord(0, ts) },
        { x: coord(x, ts), y: coord(h, ts) },
        COL_LOWLIGHT,
        1,
      );
    }

    ds.started = true;
  }

  // How far along its slide the ball has got, in squares.
  let ap = 0;
  let playerDist = 0;
  if (prev && ui.animLength > 0) {
    ap = animTime / ui.animLength;
    playerDist = ap * (dir > 0 ? s : prev).distanceMoved;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v: number = s.board.at(x, y);

      // A gem the ball is in the process of sliding over stays on screen until
      // the ball actually reaches it.
      if (prev && prev.board.at(x, y) !== s.board.at(x, y)) {
        const dist = Math.max(Math.abs(x - prev.px), Math.abs(y - prev.py));
        v = playerDist < dist ? prev.board.at(x, y) : s.board.at(x, y);
      }

      // The mine the dead ball is sitting on is hidden by the splat, so erase
      // it — but only once the move has finished playing out.
      if (v === MINE && !prev && s.dead && x === s.px && y === s.py) v = BLANK;

      v |= flashType;

      if (ds.grid[y * w + x] !== v) {
        drawTile(dr, ts, x, y, v);
        ds.grid[y * w + x] = v;
      }
    }
  }

  // Draw the ball, saving the background under it first.
  const nx = coord(s.px, ts);
  const ny = coord(s.py, ts);
  const ox = prev ? coord(prev.px, ts) : nx;
  const oy = prev ? coord(prev.py, ts) : ny;
  ds.pbgX = Math.round(ox + ap * (nx - ox));
  ds.pbgY = Math.round(oy + ap * (ny - oy));

  if (!ds.playerBackground) ds.playerBackground = dr.blitterNew({ w: ts, h: ts });
  dr.blitterSave(ds.playerBackground, { x: ds.pbgX, y: ds.pbgY });
  drawPlayer(
    dr,
    ts,
    ds.pbgX,
    ds.pbgY,
    s.dead && !prev,
    // The route arrow only shows on a settled board, not mid-slide.
    !prev && s.route ? s.route[s.routePos] : -1,
  );
  ds.playerBgSaved = true;
}

// --- animation / flash timing ----------------------------------------

const BASE_ANIM_LENGTH = 0.1;
const FLASH_LENGTH = 0.3;

export function animLength(
  a: InertiaState,
  b: InertiaState,
  dir: number,
  ui: InertiaUi,
): number {
  const dist = dir > 0 ? b.distanceMoved : a.distanceMoved;
  ui.animLength = Math.sqrt(dist) * BASE_ANIM_LENGTH;
  return ui.animLength;
}

export function flashLength(
  a: InertiaState,
  b: InertiaState,
  _dir: number,
  ui: InertiaUi,
): number {
  if (!a.dead && b.dead) {
    ui.flashType = FLASH_DEAD;
    return FLASH_LENGTH;
  }
  if (a.gems && !b.gems) {
    ui.flashType = FLASH_WIN;
    return FLASH_LENGTH;
  }
  return 0;
}
