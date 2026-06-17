import { parseDimensions, parseLeadingInt } from "../../engine/params.ts";
import { permParity } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";

// --- types -----------------------------------------------------------

export interface SixteenParams {
  w: number;
  h: number;
  /** 0 = random permutation; >0 = shuffle by making this many moves */
  movetarget: number;
}

export interface SixteenState {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  /** 1-indexed tile values (1..n). 0 is unused in sixteen. */
  readonly tiles: Int32Array;
  /** 0 = ongoing; >0 = move count at which the puzzle was completed */
  readonly completed: number;
  readonly usedSolve: boolean;
  readonly moveCount: number;
  readonly moveTarget: number;
  /** dx+dy of the last move, used for animation direction */
  readonly lastMovementSense: number;
  readonly lastMove?: SixteenMove;
}

export type SixteenMove =
  | { type: "slide"; axis: "row" | "column"; index: number; delta: number }
  | { type: "solve" };

export enum CursorMode {
  Unlocked,
  LockTile,
  LockPosition,
}

export interface SixteenUi {
  curX: number;
  curY: number;
  curVisible: boolean;
  curMode: CursorMode;
  dragging?: boolean;
  dragStartX?: number;
  dragStartY?: number;
  dragX?: number;
  dragY?: number;
  dragAxis?: "row" | "column" | null;
  dragIndex?: number;
  dragStartCellX?: number;
  dragStartCellY?: number;
  justDragged?: boolean;
}

// --- params ----------------------------------------------------------

export function defaultParams(): SixteenParams {
  return { w: 4, h: 4, movetarget: 0 };
}

export function encodeParams(p: SixteenParams, _full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (p.movetarget) s += `m${p.movetarget}`;
  return s;
}

export function decodeParams(s: string): SixteenParams {
  // Upstream: w = h = atoi(s); optional 'x'+h (square fallback when no
  // 'x'); then an optional 'm'+movetarget suffix.
  const { w, h, next } = parseDimensions(s);
  let movetarget = 0;
  if (s[next] === "m") {
    movetarget = parseLeadingInt(s, next + 1).value;
  }
  return { w, h, movetarget };
}

export function validateParams(p: SixteenParams, _full: boolean): string | null {
  if (p.w < 2 || p.h < 2) return "Width and height must both be at least two";
  if (p.movetarget < 0) return "Number of shuffling moves may not be negative";
  return null;
}

// --- presets ----------------------------------------------------------

const SIXTEEN_PRESETS: SixteenParams[] = [
  { w: 3, h: 3, movetarget: 0 },
  { w: 4, h: 3, movetarget: 0 },
  { w: 4, h: 4, movetarget: 0 },
  { w: 5, h: 4, movetarget: 0 },
  { w: 5, h: 5, movetarget: 0 },
];

export function presets() {
  return {
    title: "Type",
    submenu: SIXTEEN_PRESETS.map((p) => ({
      title: `${p.w}×${p.h}`,
      params: p,
    })),
  };
}

// --- desc / state -----------------------------------------------------

export function validateDesc(p: SixteenParams, desc: string): string | null {
  const area = p.w * p.h;
  const parts = desc.split(",");
  if (parts.length !== area) return "Not enough numbers in string";
  const used = new Set<number>();
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 1 || n > area) return "Number out of range";
    if (used.has(n)) return "Number used twice";
    used.add(n);
  }
  return null;
}

export function newState(p: SixteenParams, desc: string): SixteenState {
  const n = p.w * p.h;
  const tiles = new Int32Array(n);
  const parts = desc.split(",");
  for (let i = 0; i < n; i++) tiles[i] = Number(parts[i]);
  return {
    w: p.w,
    h: p.h,
    n,
    tiles,
    completed: 0,
    usedSolve: false,
    moveCount: 0,
    moveTarget: p.movetarget,
    lastMovementSense: 0,
  };
}

// --- completion -------------------------------------------------------

export function isCompleted(state: SixteenState): boolean {
  for (let i = 0; i < state.n; i++) {
    if (state.tiles[i] !== i + 1) return false;
  }
  return true;
}

export function status(state: SixteenState): "solved" | "ongoing" {
  return state.completed > 0 ? "solved" : "ongoing";
}

// --- move serialisation -----------------------------------------------

export function serialiseMove(m: SixteenMove): string {
  if (m.type === "solve") return "S";
  const axis = m.axis === "row" ? "R" : "C";
  return `${axis}${m.index},${m.delta}`;
}

export function deserialiseMove(s: string): SixteenMove {
  if (s === "S") return { type: "solve" };
  const axis = s[0] === "R" ? "row" : "column";
  const commaIdx = s.indexOf(",");
  const index = Number(s.slice(1, commaIdx));
  const delta = Number(s.slice(commaIdx + 1));
  return { type: "slide", axis, index, delta };
}

// --- text format ------------------------------------------------------

export function textFormat(state: SixteenState): string {
  const colWidth = String(state.n).length;
  const lines: string[] = [];
  for (let y = 0; y < state.h; y++) {
    const cells: string[] = [];
    for (let x = 0; x < state.w; x++) {
      cells.push(String(state.tiles[y * state.w + x]).padStart(colWidth));
    }
    lines.push(cells.join(" "));
  }
  return lines.join("\n");
}

// --- generator --------------------------------------------------------

export function newDesc(p: SixteenParams, rng: RandomState): { desc: string } {
  const n = p.w * p.h;
  const tiles = new Int32Array(n);

  if (p.movetarget > 0) {
    // Shuffle by making random moves from the solved state.
    for (let i = 0; i < n; i++) tiles[i] = i + 1;

    const max = Math.max(p.w, p.h);
    const prevmoves = new Int32Array(max);
    let prevoffset = -1;

    for (let i = 0; i < p.movetarget; i++) {
      while (true) {
        const j = randomUpto(rng, p.w + p.h);
        let start: number, offset: number, len: number, index: number;

        if (j < p.w) {
          // Column
          index = j;
          start = j;
          offset = p.w;
          len = p.h;
        } else {
          // Row
          index = j - p.w;
          start = index * p.w;
          offset = 1;
          len = p.w;
        }

        const direction = randomUpto(rng, 2) ? 1 : -1;

        // Anti-cancellation: avoid undoing or over-repeating.
        if (offset === prevoffset) {
          const tmp = prevmoves[index] + direction;
          if (Math.abs(2 * tmp) > len || Math.abs(tmp) < Math.abs(prevmoves[index]))
            continue;
        }

        // Accept the move.
        if (offset !== prevoffset) {
          prevmoves.fill(0);
          prevoffset = offset;
        }
        prevmoves[index] += direction;

        // Execute the move.
        let s = start;
        let o = offset;
        if (direction < 0) {
          s += (len - 1) * offset;
          o = -offset;
        }
        const tmp = tiles[s];
        for (let k = 0; k + 1 < len; k++) tiles[s + k * o] = tiles[s + (k + 1) * o];
        tiles[s + (len - 1) * o] = tmp;
        break;
      }
    }
  } else {
    // Random permutation with parity correction.
    const used = new Uint8Array(n);
    let x = 0;

    // If both dimensions are odd, there's a parity constraint.
    const stop = p.w & 1 & (p.h & 1) ? 2 : 0;

    // Place everything except (possibly) the last two tiles.
    for (let i = n; i > stop; i--) {
      let k = i > 1 ? randomUpto(rng, i) : 0;
      let j = 0;
      while (used[j] || k-- > 0) j++;
      used[j] = 1;
      while (tiles[x] !== 0) x++;
      tiles[x] = j + 1;
    }

    if (stop) {
      // Find the last two locations and pieces.
      while (tiles[x] !== 0) x++;
      const x1 = x++;
      while (tiles[x] !== 0) x++;
      const x2 = x;

      let p1 = -1,
        p2 = -1;
      for (let i = 0; i < n; i++) {
        if (!used[i]) {
          if (p1 < 0) p1 = i;
          else p2 = i;
        }
      }

      // Try one way; if parity is wrong, swap.
      tiles[x1] = p1 + 1;
      tiles[x2] = p2 + 1;
      if (permParity(tiles, n) !== 0) {
        tiles[x1] = p2 + 1;
        tiles[x2] = p1 + 1;
      }
    }
  }

  // Encode as comma-separated integers.
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(String(tiles[i]));
  return { desc: parts.join(",") };
}
