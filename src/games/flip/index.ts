/**
 * Flip: clicking a cell toggles a set of lights, given by a per-cell matrix
 * over GF(2); the puzzle is won when every light is off. Upstream's `flip.c`,
 * ported idiomatically rather than line for line.
 */

import { assertNever } from "../../engine/assert-never.ts";
import {
  dimensionParamConfig,
  fromCoord,
  type Game,
  registerGame,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/index.ts";
import { parseDimensions } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  LEFT_BUTTON,
  newCursor,
} from "../../engine/pointer.ts";
import { randomUpto } from "../../engine/random/index.ts";
import { genCrossesMatrix, genRandomMatrix } from "./generator.ts";
import {
  ANIM_TIME,
  border,
  colors,
  computeSize,
  FLASH_FRAME,
  type FlipDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  decodeBitmap,
  encodeBitmap,
  type FlipMove,
  type FlipParams,
  type FlipState,
  type FlipUi,
  type MatrixType,
} from "./state.ts";

export type { FlipMove, FlipParams, FlipState, FlipUi };

/** Upstream's `INT_MAX`, for the overflow guards in `validateParams`. */
const INT_MAX = 2147483647;

// --- the Game -------------------------------------------------------

export const flipGame: Game<FlipParams, FlipState, FlipMove, FlipUi, FlipDrawState> = {
  id: "flip",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  // Flipping a cell is the only gesture; the secondary button has no meaning,
  // so a touch player's held press must not be promoted into one.
  ignoresSecondaryButton: true,
  preferredTileSize: PREFERRED_TILE_SIZE,

  defaultParams(): FlipParams {
    return { w: 5, h: 5, matrixType: "crosses" };
  },

  presets() {
    const mk = (w: number, h: number, matrixType: MatrixType) => ({
      title: `${w}x${h} ${matrixType === "crosses" ? "Crosses" : "Random"}`,
      params: { w, h, matrixType },
    });
    return {
      title: "Flip",
      submenu: [
        mk(3, 3, "crosses"),
        mk(4, 4, "crosses"),
        mk(5, 5, "crosses"),
        mk(3, 3, "random"),
        mk(4, 4, "random"),
        mk(5, 5, "random"),
      ],
    };
  },

  encodeParams(p, full): string {
    return `${p.w}x${p.h}${full ? (p.matrixType === "crosses" ? "c" : "r") : ""}`;
  },

  decodeParams(s): FlipParams {
    const { w, h, next } = parseDimensions(s);
    return { w, h, matrixType: s[next] === "r" ? "random" : "crosses" };
  },

  validateParams(p): string | null {
    if (p.w <= 0 || p.h <= 0) {
      return "Width and height must both be greater than zero";
    }
    if (p.w > (INT_MAX - 3) / p.h) {
      return "Width times height must not be unreasonably large";
    }
    const wh = p.w * p.h;
    if (wh > (INT_MAX - 3) / wh) {
      return "Width times height is too large";
    }
    return null;
  },

  paramConfig: [
    ...dimensionParamConfig<FlipParams>(),
    {
      kw: "shape-type",
      name: "Shape type",
      type: "choices",
      choices: ["Crosses", "Random"],
      get: (p) => (p.matrixType === "crosses" ? 0 : 1),
      set: (p, v) => {
        p.matrixType = v === 0 ? "crosses" : "random";
      },
    },
  ],

  describeParams(p) {
    return { "shape-type": p.matrixType === "crosses" ? "0" : "1" };
  },

  newDesc(p, rng) {
    const { w, h } = p;
    const wh = w * h;
    const matrix =
      p.matrixType === "crosses" ? genCrossesMatrix(w, h) : genRandomMatrix(w, h, rng);

    // Random soluble starting lights: choosing equiprobably from the
    // input space and pushing through the matrix is equiprobable over
    // the image space (flip.c's vector-space argument).
    const grid = new Uint8Array(wh);
    do {
      grid.fill(0);
      for (let i = 0; i < wh; i++) {
        if (randomUpto(rng, 2)) {
          for (let j = 0; j < wh; j++) grid[j] ^= matrix[i * wh + j];
        }
      }
    } while (!grid.includes(1));

    return { desc: `${encodeBitmap(matrix, wh * wh)},${encodeBitmap(grid, wh)}` };
  },

  validateDesc(p, desc): string | null {
    const wh = p.w * p.h;
    const mlen = (wh * wh + 3) >> 2;
    const glen = (wh + 3) >> 2;
    const isHex = (s: string) => /^[0-9a-fA-F]*$/.test(s);
    if (desc.length < mlen || !isHex(desc.slice(0, mlen))) {
      return "Matrix description is wrong length";
    }
    if (desc[mlen] !== ",") return "Expected comma after matrix description";
    const g = desc.slice(mlen + 1);
    if (g.length < glen || !isHex(g.slice(0, glen))) {
      return "Grid description is wrong length";
    }
    if (g.length !== glen) return "Unexpected data after grid description";
    return null;
  },

  newState(p, desc): FlipState {
    const { w, h } = p;
    const wh = w * h;
    const mlen = (wh * wh + 3) >> 2;
    const matrix = new Uint8Array(wh * wh);
    const grid = new Uint8Array(wh);
    decodeBitmap(matrix, wh * wh, desc);
    decodeBitmap(grid, wh, desc.slice(mlen + 1));
    return {
      w,
      h,
      matrix,
      grid,
      moves: 0,
      completed: false,
      cheated: false,
      hintsActive: false,
    };
  },

  newUi(): FlipUi {
    return { cursor: newCursor() };
  },

  newDrawState,
  setTileSize,
  colors,
  computeSize,
  redraw,

  interpretMove(s, ui, ds, point, button): FlipMove | null | UiUpdate {
    const { w, h } = s;
    const isSelect = button === CURSOR_SELECT || button === CURSOR_SELECT2;
    if (button === LEFT_BUTTON || isSelect) {
      let tx: number;
      let ty: number;
      if (button === LEFT_BUTTON) {
        const b = border(ds.tileSize);
        tx = fromCoord(point.x, ds.tileSize, b);
        ty = fromCoord(point.y, ds.tileSize, b);
        ui.cursor.visible = false;
      } else {
        tx = ui.cursor.x;
        ty = ui.cursor.y;
        ui.cursor.visible = true;
      }
      if (tx < 0 || tx >= w || ty < 0 || ty >= h) return UI_UPDATE;
      // A cell with an empty matrix row flips nothing (upstream's MOVE_NO_EFFECT).
      const wh = w * h;
      const i = ty * w + tx;
      if (!s.matrix.subarray(i * wh, (i + 1) * wh).includes(1)) return null;
      return { kind: "flip", x: tx, y: ty };
    }

    const d = cursorDelta(button);
    if (!d) return null;

    const nx = Math.min(w - 1, Math.max(0, ui.cursor.x + d.dx));
    const ny = Math.min(h - 1, Math.max(0, ui.cursor.y + d.dy));
    const changed = nx !== ui.cursor.x || ny !== ui.cursor.y || !ui.cursor.visible;
    ui.cursor.x = nx;
    ui.cursor.y = ny;
    ui.cursor.visible = true;
    return changed ? UI_UPDATE : null;
  },

  executeMove(from, move): FlipState {
    const { w, h } = from;
    const wh = w * h;
    if (move.kind === "solve") {
      const grid = from.grid.slice();
      for (let i = 0; i < wh; i++) grid[i] = (grid[i] & ~2) | (move.mask[i] ? 2 : 0);
      return { ...from, grid, hintsActive: true, cheated: true };
    }
    if (move.kind !== "flip") return assertNever(move, "flip: executeMove");

    const { x, y } = move;
    if (x < 0 || x >= w || y < 0 || y >= h) {
      throw new Error(`Flip: move out of range (${x},${y})`);
    }
    const grid = from.grid.slice();
    const moves = from.completed ? from.moves : from.moves + 1;
    const i = y * w + x;
    let done = true;
    for (let j = 0; j < wh; j++) {
      grid[j] ^= from.matrix[i * wh + j];
      if (grid[j] & 1) done = false;
    }
    grid[i] ^= 2; // toggle hint marker
    return {
      ...from,
      grid,
      moves,
      completed: done || from.completed,
      hintsActive: done ? false : from.hintsActive,
    };
  },

  status(s) {
    return s.completed ? "solved" : "ongoing";
  },

  solve(_orig, curr): SolveResult<FlipMove> {
    const wh = curr.w * curr.h;
    // equations[i] : wh coefficients + 1 value, over GF(2).
    const stride = wh + 1;
    const eq = new Uint8Array(stride * wh);
    for (let i = 0; i < wh; i++) {
      for (let j = 0; j < wh; j++) {
        eq[i * stride + j] = curr.matrix[j * wh + i];
      }
      eq[i * stride + wh] = curr.grid[i] & 1;
    }

    const rowXor = (r1: number, r2: number) => {
      for (let c = 0; c < stride; c++) eq[r1 * stride + c] ^= eq[r2 * stride + c];
    };

    let rowsDone = 0;
    let colsDone = 0;
    const und: number[] = [];
    for (;;) {
      let i = colsDone;
      let j = -1;
      for (; i < wh; i++) {
        for (j = rowsDone; j < wh; j++) {
          if (eq[j * stride + i]) break;
        }
        if (j < wh) break;
        und.push(i); // free variable
      }
      if (i === wh) {
        // Remaining equations are 0 = const; any 1 means insoluble.
        for (let r = rowsDone; r < wh; r++) {
          if (eq[r * stride + wh]) {
            return { ok: false, error: "No solution exists for this position" };
          }
        }
        break;
      }
      if (j > rowsDone) rowXor(rowsDone, j);
      for (let r = rowsDone + 1; r < wh; r++) {
        if (eq[r * stride + i]) rowXor(r, rowsDone);
      }
      rowsDone++;
      colsDone = i + 1;
      if (rowsDone >= wh) break;
    }

    // Enumerate all solutions (free vars as a binary counter); keep the
    // one with the fewest flips.
    const solution = new Uint8Array(wh);
    let shortest = new Uint8Array(wh);
    let bestLen = wh + 1;
    for (;;) {
      for (let r = rowsDone - 1; r >= 0; r--) {
        let lead = 0;
        while (lead < wh && !eq[r * stride + lead]) lead++;
        let v = eq[r * stride + wh];
        for (let k = lead + 1; k < wh; k++) {
          if (eq[r * stride + k]) v ^= solution[k];
        }
        solution[lead] = v;
      }
      let len = 0;
      for (let i = 0; i < wh; i++) if (solution[i]) len++;
      if (len < bestLen) {
        bestLen = len;
        shortest = solution.slice();
      }
      let i = 0;
      for (; i < und.length; i++) {
        solution[und[i]] = solution[und[i]] ? 0 : 1;
        if (solution[und[i]]) break;
      }
      if (i === und.length) break;
    }

    return { ok: true, move: { kind: "solve", mask: Array.from(shortest) } };
  },

  textFormat(s): string {
    const { w, h } = s;
    const wh = w * h;
    const cw = 4;
    const ch = 4;
    const gw = w * cw + 2;
    const gh = h * ch + 1;
    const len = gw * gh;
    const board = new Array<string>(len).fill(" ");
    const RIGHT = 1;
    const DOWN = gw;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const cell = r * ch * gw + c * cw;
        const center = cell + ((ch / 2) | 0) * DOWN + ((cw / 2) | 0) * RIGHT;
        const flip = s.grid[r * w + c] & 1 ? "#" : ".";
        for (let dy = -1 + (r === 0 ? 1 : 0); dy <= 1 - (r === h - 1 ? 1 : 0); dy++) {
          for (let dx = -1 + (c === 0 ? 1 : 0); dx <= 1 - (c === w - 1 ? 1 : 0); dx++) {
            if (s.matrix[(r * w + c) * wh + ((r + dy) * w + c + dx)]) {
              board[center + dy * DOWN + dx * RIGHT] = flip;
            }
          }
        }
        board[cell] = "+";
        for (let dx = 1; dx < cw; dx++) board[cell + dx * RIGHT] = "-";
        for (let dy = 1; dy < ch; dy++) board[cell + dy * DOWN] = "|";
      }
      board[r * ch * gw + gw - 2] = "+";
      board[r * ch * gw + gw - 1] = "\n";
      for (let dy = 1; dy < ch; dy++) {
        board[r * ch * gw + gw - 2 + dy * DOWN] = "|";
        board[r * ch * gw + gw - 1 + dy * DOWN] = "\n";
      }
    }
    for (let k = 0; k < gw - 2; k++) board[len - gw + k] = "-";
    for (let c = 0; c <= w; c++) board[len - gw + cw * c] = "+";
    board[len - 1] = "\n";
    return board.join("");
  },

  statusbarText(s): string {
    const prefix = s.completed
      ? s.cheated
        ? "Auto-solved. "
        : "COMPLETED! "
      : s.cheated
        ? "Auto-solver used. "
        : "";
    return `${prefix}Moves: ${s.moves}`;
  },

  animLength() {
    return ANIM_TIME;
  },

  flashLength(oldState, newState) {
    if (!oldState.completed && newState.completed) {
      return (
        FLASH_FRAME *
        (Math.max(((newState.w + 1) / 2) | 0, ((newState.h + 1) / 2) | 0) + 1)
      );
    }
    return 0;
  },
};

registerGame(flipGame);
