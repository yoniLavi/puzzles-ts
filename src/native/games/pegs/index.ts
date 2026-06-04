/**
 * Pegs — native TS port of the classic Peg Solitaire game.
 *
 * Jump pegs over adjacent pegs into empty holes, removing the jumped
 * peg. Win when exactly one peg remains. Three board types: Cross
 * (the classic English/European layouts), Octagon (European with
 * parity-safe starting hole), and Random (reverse-move generation
 * guaranteeing solubility).
 *
 * Idiomatic rendering of `puzzles/pegs.c` (deleted when this ships):
 * immutable state, discriminated `PegsMove`, GC instead of
 * dup/free, `SortedMultiset` standing in for `tree234` in the
 * RANDOM generator. The logic mirrors the C reference; it is not a
 * control-flow transliteration.
 */

import type { Colour, GameStatus, Point, Size } from "../../../puzzle/types.ts";
import { mkhighlightBackground } from "../../engine/colour-mkhighlight.ts";
import {
  type Game,
  type GameDrawing,
  registerGame,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/index.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
} from "../../engine/pointer.ts";
import { SortedMultiset } from "../../engine/sorted-multiset.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";

// --- grid cell values ------------------------------------------------

const GRID_HOLE = 0;
const GRID_PEG = 1;
const GRID_OBST = 2;

/** Draw-state overlay: cursor ring on the cell. */
const GRID_CURSOR = 10;
/** Draw-state overlay: jumping-mode highlight on the cell. */
const GRID_JUMPING = 20;

// --- colour indices --------------------------------------------------

const COL_BACKGROUND = 0;
const COL_HIGHLIGHT = 1;
const COL_LOWLIGHT = 2;
const COL_PEG = 3;
const COL_CURSOR = 4;

// --- board types -----------------------------------------------------

const TYPE_CROSS = 0;
const TYPE_OCTAGON = 1;
const TYPE_RANDOM = 2;

const BOARD_TYPE_NAMES = ["Cross", "Octagon", "Random"] as const;
const BOARD_TYPE_LOWER = ["cross", "octagon", "random"] as const;

// --- flash timing ----------------------------------------------------

const FLASH_FRAME = 0.13;

// --- types -----------------------------------------------------------

export interface PegsParams {
  w: number;
  h: number;
  type: number; // TYPE_CROSS | TYPE_OCTAGON | TYPE_RANDOM
}

export interface PegsState {
  w: number;
  h: number;
  completed: boolean;
  /** Flat Uint8Array grid: GRID_HOLE | GRID_PEG | GRID_OBST. */
  grid: Uint8Array;
}

export type PegsMove = { type: "jump"; sx: number; sy: number; tx: number; ty: number };

export interface PegsUi {
  dragging: boolean;
  /** Grid coords of drag start cell. */
  sx: number;
  sy: number;
  /** Pixel coords of current drag position. */
  dx: number;
  dy: number;
  /** Keyboard cursor position. */
  curX: number;
  curY: number;
  curVisible: boolean;
  /** When true, next cursor-move attempts a jump. */
  curJumping: boolean;
}

interface PegsDrawState {
  tileSize: number;
  dragBackground: unknown; // blitter handle
  dragging: boolean;
  dragX: number;
  dragY: number;
  w: number;
  h: number;
  /** Per-tile cache of last-drawn cell value (including cursor/jumping overlays). */
  grid: Uint8Array;
  started: boolean;
  bgColour: number;
}

// --- presets ---------------------------------------------------------

const PEGS_PRESETS: PegsParams[] = [
  { w: 5, h: 7, type: TYPE_CROSS },
  { w: 7, h: 7, type: TYPE_CROSS },
  { w: 5, h: 9, type: TYPE_CROSS },
  { w: 7, h: 9, type: TYPE_CROSS },
  { w: 9, h: 9, type: TYPE_CROSS },
  { w: 7, h: 7, type: TYPE_OCTAGON },
  { w: 5, h: 5, type: TYPE_RANDOM },
  { w: 7, h: 7, type: TYPE_RANDOM },
  { w: 9, h: 9, type: TYPE_RANDOM },
];

// --- params ----------------------------------------------------------

function defaultParams(): PegsParams {
  return { w: 7, h: 7, type: TYPE_CROSS };
}

function presets() {
  return {
    title: "Type",
    submenu: PEGS_PRESETS.map((p) => {
      let name = BOARD_TYPE_NAMES[p.type];
      if (p.type === TYPE_CROSS || p.type === TYPE_RANDOM) {
        name += ` ${p.w}×${p.h}`;
      }
      return { title: name, params: p };
    }),
  };
}

function encodeParams(p: PegsParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += BOARD_TYPE_LOWER[p.type];
  return s;
}

function decodeParams(s: string): PegsParams {
  const xIdx = s.indexOf("x");
  const w = Number.parseInt(s.slice(0, xIdx), 10);
  let rest = s.slice(xIdx + 1);
  let h: number;
  const hMatch = rest.match(/^\d+/);
  if (hMatch) {
    h = Number.parseInt(hMatch[0], 10);
    rest = rest.slice(hMatch[0].length);
  } else {
    h = w;
  }
  let type = TYPE_CROSS;
  for (let i = 0; i < BOARD_TYPE_LOWER.length; i++) {
    if (rest === BOARD_TYPE_LOWER[i]) {
      type = i;
      break;
    }
  }
  return { w, h, type };
}

function validateParams(p: PegsParams, full: boolean): string | null {
  if (full && (p.w <= 3 || p.h <= 3)) {
    return "Width and height must both be greater than three";
  }
  if (p.w < 1 || p.h < 1) {
    return "Width and height must both be at least one";
  }
  if (p.w > 10000 / p.h) {
    return "Width times height must not be unreasonably large";
  }
  if (full && p.type === TYPE_CROSS) {
    const valid =
      (p.w === 9 && p.h === 5) ||
      (p.w === 5 && p.h === 9) ||
      (p.w === 9 && p.h === 9) ||
      (p.w === 7 && p.h === 5) ||
      (p.w === 5 && p.h === 7) ||
      (p.w === 9 && p.h === 7) ||
      (p.w === 7 && p.h === 9) ||
      (p.w === 7 && p.h === 7);
    if (!valid) {
      return "This board type is only supported at 5×7, 5×9, 7×7, 7×9, and 9×9";
    }
  }
  if (full && p.type === TYPE_OCTAGON) {
    if (p.w !== 7 || p.h !== 7) {
      return "This board type is only supported at 7×7";
    }
  }
  return null;
}

// --- generator (Random boards) --------------------------------------

interface GenMove {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** 0, 1, or 2: how many OBST cells must become HOLE to play this move. */
  cost: number;
}

function genMoveCmpByMove(a: GenMove, b: GenMove): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return a.x - b.x;
  if (a.dy !== b.dy) return a.dy - b.dy;
  if (a.dx !== b.dx) return a.dx - b.dx;
  return 0;
}

function genMoveCmpByCost(a: GenMove, b: GenMove): number {
  if (a.cost !== b.cost) return a.cost - b.cost;
  return genMoveCmpByMove(a, b);
}

/**
 * Re-evaluate the twelve moves that can include (x,y) and update
 * the two sorted indexes. Mirrors C's `update_moves`.
 *
 * The C code uses `find234(byMove, &move, NULL)` to find an existing
 * move by position (since byMove's comparator ignores cost), then
 * checks if the cost changed. If so, it removes the old version from
 * both trees using the actual element (not the probe).
 *
 * We replicate this: first delete from byMove (position-only
 * comparator), then if we found the old element, delete *it* from
 * byCost (using the old element's actual cost for the comparator).
 * Then re-add if the move is still valid.
 */
function updateMoves(
  grid: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  byMove: SortedMultiset<GenMove>,
  byCost: SortedMultiset<GenMove>,
): void {
  const DIRS: [number, number][] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  for (const [ddx, ddy] of DIRS) {
    for (let pos = 0; pos < 3; pos++) {
      const mx = x - pos * ddx;
      const my = y - pos * ddy;
      if (mx < 0 || mx >= w || my < 0 || my >= h) continue;
      const ex = mx + 2 * ddx;
      const ey = my + 2 * ddy;
      if (ex < 0 || ex >= w || ey < 0 || ey >= h) continue;

      const v1 = grid[my * w + mx];
      const v2 = grid[(my + ddy) * w + (mx + ddx)];
      const v3 = grid[ey * w + ex];

      const newCost = (v2 === GRID_OBST ? 1 : 0) + (v3 === GRID_OBST ? 1 : 0);

      // Probe for the existing move by position (cost doesn't matter
      // for the byMove comparator).
      const positionProbe: GenMove = {
        x: mx,
        y: my,
        dx: ddx,
        dy: ddy,
        cost: 0, // ignored by genMoveCmpByMove
      };

      // Remove from byMove (finds by position).
      byMove.delete(positionProbe);

      // Remove from byCost using the position probe. Since byCost
      // compares cost first, we need to try all possible costs.
      // But we can be smarter: just try deleting with the new cost.
      // If the old element had a different cost, this won't find it.
      // So we also need to try the other cost values.
      // Actually, the simplest correct approach: delete from byCost
      // for each possible cost (0, 1, 2). Only one will match.
      for (let c = 0; c <= 2; c++) {
        byCost.delete({ x: mx, y: my, dx: ddx, dy: ddy, cost: c });
      }

      if (v1 === GRID_PEG && v2 !== GRID_PEG && v3 !== GRID_PEG) {
        // Move is valid. Add fresh copies to both trees.
        const fresh: GenMove = { x: mx, y: my, dx: ddx, dy: ddy, cost: newCost };
        byMove.add({ ...fresh });
        byCost.add({ ...fresh });
      }
    }
  }
}

/**
 * Build a random board by reverse-moves. Mirrors C's `pegs_genmoves`.
 * The grid is mutated in place.
 */
function genMoves(grid: Uint8Array, w: number, h: number, rng: RandomState): void {
  const byMove = new SortedMultiset<GenMove>(genMoveCmpByMove);
  const byCost = new SortedMultiset<GenMove>(genMoveCmpByCost);

  // Seed the move trees from all pegs on the board.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === GRID_PEG) {
        updateMoves(grid, w, h, x, y, byMove, byCost);
      }
    }
  }

  let nMoves = 0;

  while (true) {
    // Find the cheapest available moves.
    const maxCost = nMoves < (w * h) / 2 ? 2 : 1;
    let limit = -1;
    let move: GenMove | undefined;

    for (let cost = 0; cost <= maxCost; cost++) {
      const probe: GenMove = { x: 0, y: h + 1, dx: 0, dy: 0, cost };
      limit = byCost.lastIndexLessThan(probe);
      if (limit >= 0) {
        move = byCost.get(limit);
        break;
      }
    }

    if (!move) break;

    // Pick a random move among those with the same cost.
    // `limit` is the index of the last element with cost <= move.cost.
    // We need the range of elements with cost == move.cost.
    const costProbe: GenMove = { x: 0, y: -1, dx: 0, dy: 0, cost: move.cost };
    const firstIdx = byCost.lastIndexLessThan(costProbe) + 1;
    const rangeSize = limit - firstIdx + 1;
    const pickIdx = firstIdx + randomUpto(rng, rangeSize);
    const picked = byCost.get(pickIdx);

    // Apply the reverse move: source becomes HOLE, middle becomes PEG, end becomes PEG.
    grid[picked.y * w + picked.x] = GRID_HOLE;
    grid[(picked.y + picked.dy) * w + (picked.x + picked.dx)] = GRID_PEG;
    grid[(picked.y + 2 * picked.dy) * w + (picked.x + 2 * picked.dx)] = GRID_PEG;

    // Re-evaluate moves around the three affected cells.
    for (let i = 0; i <= 2; i++) {
      const tx = picked.x + i * picked.dx;
      const ty = picked.y + i * picked.dy;
      updateMoves(grid, w, h, tx, ty, byMove, byCost);
    }

    nMoves++;
  }
}

/**
 * Generate a random board, retrying until it touches all four edges.
 * Mirrors C's `pegs_generate`.
 */
function generate(grid: Uint8Array, w: number, h: number, rng: RandomState): void {
  while (true) {
    grid.fill(GRID_OBST);
    grid[Math.floor(h / 2) * w + Math.floor(w / 2)] = GRID_PEG;
    genMoves(grid, w, h, rng);

    // Check that the board touches all four edges.
    let extremes = 0;
    for (let y = 0; y < h; y++) {
      if (grid[y * w] !== GRID_OBST) extremes |= 1;
      if (grid[y * w + w - 1] !== GRID_OBST) extremes |= 2;
    }
    for (let x = 0; x < w; x++) {
      if (grid[x] !== GRID_OBST) extremes |= 4;
      if (grid[(h - 1) * w + x] !== GRID_OBST) extremes |= 8;
    }

    if (extremes === 15) break;
  }
}

// --- newDesc ---------------------------------------------------------

function newDesc(p: PegsParams, rng: RandomState): { desc: string } {
  const { w, h, type } = p;
  const grid = new Uint8Array(w * h);

  if (type === TYPE_RANDOM) {
    generate(grid, w, h, rng);
  } else {
    // Cross or Octagon layout.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cx = Math.abs(x - Math.floor(w / 2));
        const cy = Math.abs(y - Math.floor(h / 2));
        if (type === TYPE_CROSS) {
          if (cx === 0 && cy === 0) grid[y * w + x] = GRID_HOLE;
          else if (cx > 1 && cy > 1) grid[y * w + x] = GRID_OBST;
          else grid[y * w + x] = GRID_PEG;
        } else {
          // TYPE_OCTAGON
          if (cx + cy > 1 + Math.floor(Math.max(w, h) / 2)) {
            grid[y * w + x] = GRID_OBST;
          } else {
            grid[y * w + x] = GRID_PEG;
          }
        }
      }
    }

    // Octagon: the centre hole is insoluble (parity proof in C comments).
    // Pick a random solvable starting hole from one of three equivalence classes.
    if (type === TYPE_OCTAGON) {
      const cls = randomUpto(rng, 3);
      let dx: number;
      let dy: number;
      if (cls === 0) {
        // Remove a random corner piece.
        dx = randomUpto(rng, 2) * 2 - 1;
        dy = randomUpto(rng, 2) * 2 - 1;
        if (randomUpto(rng, 2)) dy *= 3;
        else dx *= 3;
      } else if (cls === 1) {
        // Remove a random piece two from the centre.
        dx = 2 * (randomUpto(rng, 2) * 2 - 1);
        if (randomUpto(rng, 2)) dy = 0;
        else {
          dy = dx;
          dx = 0;
        }
      } else {
        // Remove a random piece one from the centre.
        dx = randomUpto(rng, 2) * 2 - 1;
        if (randomUpto(rng, 2)) dy = 0;
        else {
          dy = dx;
          dx = 0;
        }
      }
      grid[(3 + dy) * w + (3 + dx)] = GRID_HOLE;
    }
  }

  // Encode: P=peg, H=hole, O=obstacle.
  let desc = "";
  for (let i = 0; i < w * h; i++) {
    desc += grid[i] === GRID_PEG ? "P" : grid[i] === GRID_HOLE ? "H" : "O";
  }
  return { desc };
}

// --- validateDesc ----------------------------------------------------

function validateDesc(p: PegsParams, desc: string): string | null {
  const len = p.w * p.h;
  if (desc.length !== len) return "Game description is wrong length";
  let nPeg = 0;
  let nHole = 0;
  for (let i = 0; i < len; i++) {
    const ch = desc[i];
    if (ch !== "P" && ch !== "H" && ch !== "O") {
      return "Invalid character in game description";
    }
    if (ch === "P") nPeg++;
    if (ch === "H") nHole++;
  }
  if (nPeg < 2) return "Too few pegs in game description";
  if (nHole < 1) return "Too few holes in game description";
  return null;
}

// --- state -----------------------------------------------------------

function newState(p: PegsParams, desc: string): PegsState {
  const grid = new Uint8Array(p.w * p.h);
  for (let i = 0; i < desc.length; i++) {
    grid[i] = desc[i] === "P" ? GRID_PEG : desc[i] === "H" ? GRID_HOLE : GRID_OBST;
  }
  return { w: p.w, h: p.h, completed: false, grid };
}

function newUi(state: PegsState): PegsUi {
  // Place cursor on the first peg or hole.
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const v = state.grid[y * state.w + x];
      if (v === GRID_PEG || v === GRID_HOLE) {
        return {
          dragging: false,
          sx: 0,
          sy: 0,
          dx: 0,
          dy: 0,
          curX: x,
          curY: y,
          curVisible: false,
          curJumping: false,
        };
      }
    }
  }
  // Should never happen (valid desc always has pegs/holes).
  return {
    dragging: false,
    sx: 0,
    sy: 0,
    dx: 0,
    dy: 0,
    curX: 0,
    curY: 0,
    curVisible: false,
    curJumping: false,
  };
}

// --- interpretMove ---------------------------------------------------

const PREFERRED_TILE_SIZE = 33;

function interpretMove(
  s: PegsState,
  ui: PegsUi,
  ds: PegsDrawState | null,
  p: Point,
  button: number,
): PegsMove | null | UiUpdate {
  const { w, h } = s;
  const ts = ds?.tileSize ?? PREFERRED_TILE_SIZE;

  if (button === LEFT_BUTTON) {
    const tx = fromCoordWithTileSize(p.x, ts);
    const ty = fromCoordWithTileSize(p.y, ts);
    if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
      const v = s.grid[ty * w + tx];
      if (v === GRID_PEG) {
        ui.dragging = true;
        ui.sx = tx;
        ui.sy = ty;
        ui.dx = p.x;
        ui.dy = p.y;
        ui.curVisible = false;
        ui.curJumping = false;
        return UI_UPDATE;
      }
      if (v === GRID_HOLE) return null; // MOVE_NO_EFFECT
      return null; // MOVE_UNUSED (OBST)
    }
    return null;
  }

  if (button === LEFT_DRAG && ui.dragging) {
    ui.dx = p.x;
    ui.dy = p.y;
    return UI_UPDATE;
  }

  if (button === LEFT_RELEASE && ui.dragging) {
    ui.dragging = false;
    const tx = fromCoordWithTileSize(p.x, ts);
    const ty = fromCoordWithTileSize(p.y, ts);
    if (tx < 0 || tx >= w || ty < 0 || ty >= h) return UI_UPDATE;
    const ddx = tx - ui.sx;
    const ddy = ty - ui.sy;
    if (
      Math.max(Math.abs(ddx), Math.abs(ddy)) !== 2 ||
      Math.min(Math.abs(ddx), Math.abs(ddy)) !== 0
    ) {
      return UI_UPDATE;
    }
    const mx = ui.sx + ddx / 2;
    const my = ui.sy + ddy / 2;
    if (
      s.grid[ty * w + tx] !== GRID_HOLE ||
      s.grid[my * w + mx] !== GRID_PEG ||
      s.grid[ui.sy * w + ui.sx] !== GRID_PEG
    ) {
      return UI_UPDATE;
    }
    return { type: "jump", sx: ui.sx, sy: ui.sy, tx, ty };
  }

  // Cursor movement.
  if (
    button === CURSOR_UP ||
    button === CURSOR_DOWN ||
    button === CURSOR_LEFT ||
    button === CURSOR_RIGHT
  ) {
    if (!ui.curJumping) {
      // Normal cursor movement: try to move, skip OBST cells.
      const cx = ui.curX;
      const cy = ui.curY;
      const ddx = button === CURSOR_RIGHT ? 1 : button === CURSOR_LEFT ? -1 : 0;
      const ddy = button === CURSOR_DOWN ? 1 : button === CURSOR_UP ? -1 : 0;
      const nx = cx + ddx;
      const ny = cy + ddy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const v = s.grid[ny * w + nx];
        if (v === GRID_HOLE || v === GRID_PEG) {
          ui.curX = nx;
          ui.curY = ny;
        }
      }
      ui.curVisible = true;
      return UI_UPDATE;
    }

    // Jumping mode: attempt a jump in the given direction.
    const ddx = button === CURSOR_RIGHT ? 1 : button === CURSOR_LEFT ? -1 : 0;
    const ddy = button === CURSOR_DOWN ? 1 : button === CURSOR_UP ? -1 : 0;
    const mx = ui.curX + ddx;
    const my = ui.curY + ddy;
    const jx = mx + ddx;
    const jy = my + ddy;

    ui.curJumping = false;
    if (
      jx >= 0 &&
      jx < w &&
      jy >= 0 &&
      jy < h &&
      s.grid[my * w + mx] === GRID_PEG &&
      s.grid[jy * w + jx] === GRID_HOLE
    ) {
      ui.curX = jx;
      ui.curY = jy;
      return {
        type: "jump",
        sx: ui.curX - 2 * ddx,
        sy: ui.curY - 2 * ddy,
        tx: jx,
        ty: jy,
      };
    }
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.curVisible) {
      ui.curVisible = true;
      return UI_UPDATE;
    }
    if (ui.curJumping) {
      ui.curJumping = false;
      return UI_UPDATE;
    }
    if (s.grid[ui.curY * w + ui.curX] === GRID_PEG) {
      ui.curJumping = true;
      return UI_UPDATE;
    }
    return null; // MOVE_NO_EFFECT
  }

  return null; // MOVE_UNUSED
}

// --- executeMove -----------------------------------------------------

function executeMove(s: PegsState, m: PegsMove): PegsState {
  if (m.type !== "jump") throw new Error(`Unknown move type: ${m.type}`);

  const { w, h } = s;
  const { sx, sy, tx, ty } = m;

  // Validate the move.
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) throw new Error("Source out of range");
  if (tx < 0 || tx >= w || ty < 0 || ty >= h) throw new Error("Target out of range");

  const ddx = tx - sx;
  const ddy = ty - sy;
  if (
    Math.max(Math.abs(ddx), Math.abs(ddy)) !== 2 ||
    Math.min(Math.abs(ddx), Math.abs(ddy)) !== 0
  ) {
    throw new Error("Move length was wrong");
  }
  const mx = sx + ddx / 2;
  const my = sy + ddy / 2;

  if (
    s.grid[sy * w + sx] !== GRID_PEG ||
    s.grid[my * w + mx] !== GRID_PEG ||
    s.grid[ty * w + tx] !== GRID_HOLE
  ) {
    throw new Error("Grid contents were invalid for this move");
  }

  // Apply the move to a new state.
  const grid = new Uint8Array(s.grid);
  grid[sy * w + sx] = GRID_HOLE;
  grid[my * w + mx] = GRID_HOLE;
  grid[ty * w + tx] = GRID_PEG;

  // Check completion: exactly one peg remains.
  let completed = s.completed;
  if (!completed) {
    let count = 0;
    for (let i = 0; i < w * h; i++) {
      if (grid[i] === GRID_PEG) count++;
    }
    if (count === 1) completed = true;
  }

  return { w, h, completed, grid };
}

// --- status ----------------------------------------------------------

function status(s: PegsState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- text format -----------------------------------------------------

function textFormat(s: PegsState): string {
  const { w, h } = s;
  let ret = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = s.grid[y * w + x];
      ret += v === GRID_HOLE ? "-" : v === GRID_PEG ? "*" : " ";
    }
    if (y < h - 1) ret += "\n";
  }
  return ret;
}

// --- move serialisation ----------------------------------------------

function serialiseMove(m: PegsMove): unknown {
  return `${m.sx},${m.sy}-${m.tx},${m.ty}`;
}

function deserialiseMove(raw: unknown): PegsMove {
  const s = String(raw);
  const match = s.match(/^(-?\d+),(-?\d+)-(-?\d+),(-?\d+)$/);
  if (!match) throw new Error(`Invalid pegs move: ${s}`);
  return {
    type: "jump",
    sx: Number.parseInt(match[1], 10),
    sy: Number.parseInt(match[2], 10),
    tx: Number.parseInt(match[3], 10),
    ty: Number.parseInt(match[4], 10),
  };
}

// --- coordinate helpers ----------------------------------------------

function highlightWidth(ts: number): number {
  return Math.floor(ts / 16);
}

function border(ts: number): number {
  return Math.floor(ts / 2);
}

function coord(x: number, ts: number): number {
  return border(ts) + x * ts;
}

function fromCoordWithTileSize(x: number, ts: number): number {
  return Math.floor((x + ts - border(ts)) / ts) - 1;
}

// --- colours ---------------------------------------------------------

function colours(defaultBackground: Colour): Colour[] {
  const bg = mkhighlightBackground(defaultBackground);

  // Derive highlight and lowlight from the adjusted background,
  // matching C's game_mkhighlight which shifts toward white/black.
  const K = Math.sqrt(3) / 6;
  const colourDistance = (a: Colour, b: Colour) =>
    Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  const colourMix = (a: Colour, b: Colour, t: number): Colour => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const black: Colour = [0, 0, 0];
  const white: Colour = [1, 1, 1];

  // Highlight: shift toward white by K.
  const dw = colourDistance(bg, white);
  const hi: Colour =
    dw < K ? colourMix(white, black, K / Math.sqrt(3)) : colourMix(bg, white, K / dw);

  // Lowlight: shift toward black by K.
  const db = colourDistance(bg, black);
  const lo: Colour =
    db < K ? colourMix(black, white, K / Math.sqrt(3)) : colourMix(bg, black, K / db);

  const peg: Colour = [0, 0, 1];
  const cursor: Colour = [0.5, 0.5, 1];

  return [bg, hi, lo, peg, cursor];
}

// --- computeSize / setTileSize ---------------------------------------

function computeSize(p: PegsParams, ts: number): Size {
  const b = border(ts);
  return {
    w: ts * p.w + 2 * b,
    h: ts * p.h + 2 * b,
  };
}

function setTileSize(ds: PegsDrawState, ts: number): void {
  if (ds.tileSize !== ts) {
    ds.tileSize = ts;
    ds.started = false;
    ds.grid.fill(255);
  }
}

// --- draw state ------------------------------------------------------

function newDrawState(s: PegsState): PegsDrawState {
  return {
    tileSize: 0,
    dragBackground: null,
    dragging: false,
    dragX: 0,
    dragY: 0,
    w: s.w,
    h: s.h,
    grid: new Uint8Array(s.w * s.h).fill(255),
    started: false,
    bgColour: -1,
  };
}

// --- draw_tile -------------------------------------------------------

function drawTile(
  dr: GameDrawing,
  ds: PegsDrawState,
  x: number,
  y: number,
  v: number,
  bgColour: number,
): void {
  const ts = ds.tileSize;
  let jumping = false;
  let cursor = false;

  if (bgColour >= 0) {
    dr.drawRect({ x, y, w: ts, h: ts }, bgColour);
  }

  if (v >= GRID_JUMPING) {
    jumping = true;
    v -= GRID_JUMPING;
  }
  if (v >= GRID_CURSOR) {
    cursor = true;
    v -= GRID_CURSOR;
  }

  if (v === GRID_HOLE) {
    const bg = cursor ? COL_HIGHLIGHT : COL_LOWLIGHT;
    dr.drawCircle({ x: x + ts / 2, y: y + ts / 2 }, ts / 4, bg, bg);
  } else if (v === GRID_PEG) {
    const outerBg = cursor || jumping ? COL_CURSOR : COL_PEG;
    const innerBg = !cursor || jumping ? COL_PEG : COL_CURSOR;
    dr.drawCircle({ x: x + ts / 2, y: y + ts / 2 }, ts / 3, outerBg, outerBg);
    dr.drawCircle({ x: x + ts / 2, y: y + ts / 2 }, ts / 4, innerBg, innerBg);
  }

  dr.drawUpdate({ x, y, w: ts, h: ts });
}

// --- redraw ----------------------------------------------------------

function redraw(
  dr: GameDrawing,
  ds: PegsDrawState | null,
  _prev: PegsState | null,
  s: PegsState,
  _dir: number,
  ui: PegsUi,
  _animTime: number,
  flashTime: number,
): void {
  if (!ds) return;
  const { w, h } = s;
  const ts = ds.tileSize;
  const hw = highlightWidth(ts);
  const b = border(ts);

  let bgColour: number;
  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    bgColour = frame % 2 ? COL_LOWLIGHT : COL_HIGHLIGHT;
  } else {
    bgColour = COL_BACKGROUND;
  }

  // Erase the sprite currently being dragged, if any.
  if (ds.dragging) {
    if (ds.dragBackground) {
      dr.blitterLoad(ds.dragBackground, { x: ds.dragX, y: ds.dragY });
      dr.drawUpdate({ x: ds.dragX, y: ds.dragY, w: ts, h: ts });
    }
    ds.dragging = false;
  }

  if (!ds.started) {
    // First-draw setup: relief borders around all playable cells.
    // Four passes, matching C's game_redraw.

    // Pass 1: diagonal corner triangles.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (s.grid[y * w + x] !== GRID_OBST) {
          const cx = coord(x, ts);
          const cy = coord(y, ts);
          dr.drawPolygon(
            [
              { x: cx + ts + hw - 1, y: cy - hw },
              { x: cx - hw, y: cy + ts + hw - 1 },
              { x: cx - hw, y: cy - hw },
            ],
            COL_HIGHLIGHT,
            COL_HIGHLIGHT,
          );
          dr.drawPolygon(
            [
              { x: cx + ts + hw - 1, y: cy - hw },
              { x: cx - hw, y: cy + ts + hw - 1 },
              { x: cx + ts + hw - 1, y: cy + ts + hw - 1 },
            ],
            COL_LOWLIGHT,
            COL_LOWLIGHT,
          );
        }
      }
    }

    // Pass 2: overlapping rectangles to fill the edges.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (s.grid[y * w + x] !== GRID_OBST) {
          const cx = coord(x, ts);
          const cy = coord(y, ts);
          dr.drawRect(
            { x: cx - hw, y: cy - hw, w: ts + hw, h: ts + hw },
            COL_HIGHLIGHT,
          );
          dr.drawRect({ x: cx, y: cy, w: ts + hw, h: ts + hw }, COL_LOWLIGHT);
        }
      }
    }

    // Pass 3: trapeziums on each edge.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (s.grid[y * w + x] !== GRID_OBST) {
          const cx = coord(x, ts);
          const cy = coord(y, ts);
          for (let ddx = 0; ddx < 2; ddx++) {
            const ddy = 1 - ddx;
            for (let si = 0; si < 2; si++) {
              const sn = 2 * si - 1;
              const c = si ? COL_LOWLIGHT : COL_HIGHLIGHT;
              const coords: Point[] = [
                { x: cx + si * ddx * (ts - 1), y: cy + si * ddy * (ts - 1) },
                {
                  x: cx + (si * ddx + ddy) * (ts - 1),
                  y: cy + (si * ddy + ddx) * (ts - 1),
                },
                {
                  x: cx + (si * ddx + ddy) * (ts - 1) - hw * (ddy - sn * ddx),
                  y: cy + (si * ddy + ddx) * (ts - 1) - hw * (ddx - sn * ddy),
                },
                {
                  x: cx + si * ddx * (ts - 1) + hw * (ddy + sn * ddx),
                  y: cy + si * ddy * (ts - 1) + hw * (ddx + sn * ddy),
                },
              ];
              dr.drawPolygon(coords, c, c);
            }
          }
        }
      }
    }

    // Pass 4: fill playable cells with background colour.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (s.grid[y * w + x] !== GRID_OBST) {
          dr.drawRect(
            { x: coord(x, ts), y: coord(y, ts), w: ts, h: ts },
            COL_BACKGROUND,
          );
        }
      }
    }

    ds.started = true;
    dr.drawUpdate({
      x: 0,
      y: 0,
      w: ts * w + 2 * b,
      h: ts * h + 2 * b,
    });
  }

  // Incremental redraw: only changed cells.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = s.grid[y * w + x];
      // Blank the drag source so the peg looks picked up.
      if (ui.dragging && ui.sx === x && ui.sy === y && v === GRID_PEG) {
        v = GRID_HOLE;
      }
      if (ui.curVisible && ui.curX === x && ui.curY === y) {
        v += ui.curJumping ? GRID_JUMPING : GRID_CURSOR;
      }
      if (v !== GRID_OBST && (bgColour !== ds.bgColour || v !== ds.grid[y * w + x])) {
        drawTile(dr, ds, coord(x, ts), coord(y, ts), v, bgColour);
        ds.grid[y * w + x] = v;
      }
    }
  }

  // Draw the dragging sprite.
  if (ui.dragging) {
    // Allocate the blitter lazily (we don't have GameDrawing in setTileSize).
    if (!ds.dragBackground) {
      ds.dragBackground = dr.blitterNew({ w: ts, h: ts });
    }
    ds.dragging = true;
    ds.dragX = ui.dx - ts / 2;
    ds.dragY = ui.dy - ts / 2;
    dr.blitterSave(ds.dragBackground, { x: ds.dragX, y: ds.dragY });
    drawTile(dr, ds, ds.dragX, ds.dragY, GRID_PEG, -1);
  }

  ds.bgColour = bgColour;
}

// --- animation / flash -----------------------------------------------

function flashLength(a: PegsState, b: PegsState): number {
  if (!a.completed && b.completed) return 2 * FLASH_FRAME;
  return 0;
}

// --- register --------------------------------------------------------

export const pegsGame: Game<PegsParams, PegsState, PegsMove, PegsUi, PegsDrawState> = {
  id: "pegs",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: false,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  textFormat,
  serialiseMove,
  deserialiseMove,

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,
  flashLength,
};

registerGame(pegsGame);
