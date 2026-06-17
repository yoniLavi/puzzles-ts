import { parseDimensions } from "../../engine/params.ts";
import { permParity } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";

export { permParity };

// --- types -----------------------------------------------------------

export interface FifteenParams {
  w: number;
  h: number;
}

export interface FifteenState {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  /** Tile values in row-major order; `0` is the gap. The solved board
   * reads `1, 2, …, n-1, 0`. */
  readonly tiles: Int32Array;
  /** Flat index of the gap (the cell holding value `0`). */
  readonly gapPos: number;
  /** `0` while ongoing; otherwise the move count at which the puzzle was
   * first completed. */
  readonly completed: number;
  /** Set by Solve; suppresses the completion flash and switches the
   * status bar to "Moves since auto-solve". */
  readonly usedSolve: boolean;
  readonly moveCount: number;
}

/** A slide carries the *destination* gap cell (upstream `"M x,y"`); a
 * solve snaps to the solved board (upstream `"S"`). Both are plain
 * JSON-safe data, so the default move codec suffices. */
export type FifteenMove = { type: "move"; x: number; y: number } | { type: "solve" };

export interface FifteenUi {
  /** Upstream's arrow-semantics preference. `false` (the default we
   * ship) means the pressed arrow moves a *tile* in that direction; the
   * gap moves the opposite way. No UI exposes this yet — the engine has
   * no preferences hook — so it is always `false`. */
  invertCursor: boolean;
}

// --- params ----------------------------------------------------------

export function defaultParams(): FifteenParams {
  return { w: 4, h: 4 };
}

export function encodeParams(p: FifteenParams, _full: boolean): string {
  return `${p.w}x${p.h}`;
}

export function decodeParams(s: string): FifteenParams {
  // Upstream: w = h = atoi(s); then if an 'x' follows the leading
  // digits, h = atoi(after-x). A bare "W" yields a square W×W board.
  const { w, h } = parseDimensions(s);
  return { w, h };
}

export function validateParams(p: FifteenParams, _full: boolean): string | null {
  if (p.w < 2 || p.h < 2) return "Width and height must both be at least two";
  return null;
}

// --- presets ----------------------------------------------------------

export function presets() {
  return {
    title: "Type",
    submenu: [{ title: "4×4", params: { w: 4, h: 4 } }],
  };
}

// --- completion / parity ----------------------------------------------

/** Solved iff each cell `p` holds `p+1`, except the last holds `0`. */
export function isCompletedTiles(tiles: Int32Array, n: number): boolean {
  for (let p = 0; p < n; p++) {
    if (tiles[p] !== (p < n - 1 ? p + 1 : 0)) return false;
  }
  return true;
}

export function isCompleted(state: FifteenState): boolean {
  return isCompletedTiles(state.tiles, state.n);
}

/** Required permutation parity for a board whose gap sits at flat index
 * `gap`: chessboard parity of the gap cell XOR parity of `n` (the solved
 * target `1..n-1,0` is a cyclic rotation of `0..n-1`, odd iff `n` is
 * even). Upstream `PARITY_P`. */
export function parityP(w: number, h: number, gap: number): number {
  const gx = gap % w;
  const gy = Math.floor(gap / w);
  return ((gx - (w - 1)) ^ (gy - (h - 1)) ^ (w * h + 1)) & 1;
}

export function parityS(state: FifteenState): number {
  return parityP(state.w, state.h, state.gapPos);
}

// --- desc / state -----------------------------------------------------

export function validateDesc(p: FifteenParams, desc: string): string | null {
  const area = p.w * p.h;
  const parts = desc.split(",");
  if (parts.length < area) return "Not enough numbers in string";
  if (parts.length > area) return "Excess junk at end of string";
  const used = new Set<number>();
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return "Expected a number";
    const n = Number.parseInt(part, 10);
    if (n < 0 || n >= area) return "Number out of range";
    if (used.has(n)) return "Number used twice";
    used.add(n);
  }
  return null;
}

export function newState(p: FifteenParams, desc: string): FifteenState {
  const n = p.w * p.h;
  const tiles = new Int32Array(n);
  const parts = desc.split(",");
  let gapPos = 0;
  for (let i = 0; i < n; i++) {
    tiles[i] = Number.parseInt(parts[i], 10);
    if (tiles[i] === 0) gapPos = i;
  }
  return {
    w: p.w,
    h: p.h,
    n,
    tiles,
    gapPos,
    completed: 0,
    usedSolve: false,
    moveCount: 0,
  };
}

export function status(state: FifteenState): "solved" | "ongoing" {
  return state.completed > 0 ? "solved" : "ongoing";
}

// --- text format ------------------------------------------------------

export function textFormat(state: FifteenState): string {
  const colWidth = String(state.n - 1).length;
  const lines: string[] = [];
  for (let y = 0; y < state.h; y++) {
    const cells: string[] = [];
    for (let x = 0; x < state.w; x++) {
      const v = state.tiles[y * state.w + x];
      cells.push(v === 0 ? " ".repeat(colWidth) : String(v).padStart(colWidth));
    }
    lines.push(cells.join(" "));
  }
  return lines.join("\n");
}

// --- generator --------------------------------------------------------

/** Faithful port of upstream `new_game_desc`: place all tiles except the
 * last two at random, then pick the final two so the whole permutation's
 * parity matches the required parity (gap chessboard-parity ⊕ parity of
 * `n`), rejecting an already-solved layout. */
export function newDesc(p: FifteenParams, rng: RandomState): { desc: string } {
  const n = p.w * p.h;
  const tiles = new Int32Array(n);
  const used = new Uint8Array(n);

  do {
    tiles.fill(-1);
    used.fill(0);

    const gap = randomUpto(rng, n);
    tiles[gap] = 0;
    used[0] = 1;

    // Place everything except the last two tiles.
    let x = 0;
    for (let i = n - 1; i > 2; i--) {
      let k = randomUpto(rng, i);
      let j = 0;
      for (; j < n; j++) {
        if (used[j]) continue;
        if (k === 0) break;
        k--;
      }
      used[j] = 1;
      while (tiles[x] >= 0) x++;
      tiles[x] = j;
    }

    // Find the last two free locations and the last two unused pieces.
    while (tiles[x] >= 0) x++;
    const x1 = x++;
    while (tiles[x] >= 0) x++;
    const x2 = x;

    let p1 = -1;
    let p2 = -1;
    for (let i = 0; i < n; i++) {
      if (!used[i]) {
        p1 = i;
        break;
      }
    }
    for (let i = p1 + 1; i < n; i++) {
      if (!used[i]) {
        p2 = i;
        break;
      }
    }

    const parity = parityP(p.w, p.h, gap);

    // Try one way round; if parity is wrong, swap the last two.
    tiles[x1] = p1;
    tiles[x2] = p2;
    if (permParity(tiles, n) !== parity) {
      tiles[x1] = p2;
      tiles[x2] = p1;
    }
  } while (isCompletedTiles(tiles, n));

  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(String(tiles[i]));
  return { desc: parts.join(",") };
}
