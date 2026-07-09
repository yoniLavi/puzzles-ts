/**
 * dominosa — native TS port of `dominosa.c`. Place one of every possible
 * domino (all number-pairs `0-0 … n-n`) into an `(n+2) × (n+1)` grid so each
 * square's number matches its clue.
 *
 * Left-click / `CURSOR_SELECT` between two adjacent numbers toggles a domino;
 * right-click / `CURSOR_SELECT2` between two adjacent empty squares toggles a
 * barrier edge; right-click or a digit key on a number toggles one of two
 * value highlights.
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import type { Game, SolveResult, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  MOD_NUM_KEYPAD,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newDominosaDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  type DominosaDrawState,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
} from "./render.ts";
import { solveNumbers } from "./solver.ts";
import {
  cloneState,
  DCOUNT,
  DIFF_NAMES,
  DIFFCOUNT,
  DINDEX,
  type DominosaMistake,
  type DominosaMove,
  type DominosaParams,
  type DominosaState,
  type DominosaUi,
  decodeParams,
  defaultParams,
  EDGE_B,
  EDGE_L,
  EDGE_R,
  EDGE_T,
  encodeParams,
  newState,
  presets,
  status,
  TRI,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(_state: DominosaState): DominosaUi {
  return {
    curX: 0,
    curY: 0,
    cursorVisible: false,
    highlight1: -1,
    highlight2: -1,
  };
}

/** Toggle a face number through the two highlight slots (upstream logic,
 * shared by the right-click-on-number and digit-key paths). */
function toggleHighlight(ui: DominosaUi, num: number): boolean {
  if (ui.highlight1 === num) ui.highlight1 = -1;
  else if (ui.highlight2 === num) ui.highlight2 = -1;
  else if (ui.highlight1 === -1) ui.highlight1 = num;
  else if (ui.highlight2 === -1) ui.highlight2 = num;
  else return false; // both slots full and this isn't one of them
  return true;
}

function interpretMove(
  state: DominosaState,
  ui: DominosaUi,
  ds: DominosaDrawState | null,
  p: Point,
  button: number,
): DominosaMove | null | UiUpdate {
  const { w, h } = state;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const border = -Math.floor(ts / 16); // NARROW_BORDERS
  const coord = (v: number) => v * ts + border;
  const fromCoord = (px: number) => Math.floor((px - border + ts) / ts) - 1;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    const tx = fromCoord(p.x);
    const ty = fromCoord(p.y);
    const t = ty * w + tx;
    if (tx < 0 || tx >= w || ty < 0 || ty >= h) return null;

    // Which edge of the square is the click closest to?
    const dx = 2 * (p.x - coord(tx)) - ts;
    const dy = 2 * (p.y - coord(ty)) - ts;

    if (
      button === RIGHT_BUTTON &&
      Math.abs(dx) < (ts * 2) / 5 &&
      Math.abs(dy) < (ts * 2) / 5
    ) {
      // Right-clicked on the number → toggle its highlight.
      toggleHighlight(ui, state.numbers[t]);
      return UI_UPDATE;
    }

    let d1: number;
    let d2: number;
    if (Math.abs(dx) > Math.abs(dy) && dx < 0 && tx > 0) {
      d1 = t - 1;
      d2 = t;
    } else if (Math.abs(dx) > Math.abs(dy) && dx > 0 && tx + 1 < w) {
      d1 = t;
      d2 = t + 1;
    } else if (Math.abs(dy) > Math.abs(dx) && dy < 0 && ty > 0) {
      d1 = t - w;
      d2 = t;
    } else if (Math.abs(dy) > Math.abs(dx) && dy > 0 && ty + 1 < h) {
      d1 = t;
      d2 = t + w;
    } else {
      return null; // clicked precisely on a diagonal
    }

    // A barrier edge can't be marked next to any placed domino.
    if (button === RIGHT_BUTTON && (state.grid[d1] !== d1 || state.grid[d2] !== d2))
      return null;

    ui.cursorVisible = false;
    return button === RIGHT_BUTTON
      ? { type: "edge", d1, d2 }
      : { type: "domino", d1, d2 };
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.curX, ui.curY, 2 * w - 1, 2 * h - 1);
    if (moved) {
      ui.curX = moved.x;
      ui.curY = moved.y;
    }
    ui.cursorVisible = true;
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!((ui.curX ^ ui.curY) & 1)) return null; // need exactly one dimension odd
    const d1 = Math.floor(ui.curY / 2) * w + Math.floor(ui.curX / 2);
    const d2 = Math.floor((ui.curY + 1) / 2) * w + Math.floor((ui.curX + 1) / 2);
    if (button === CURSOR_SELECT2 && (state.grid[d1] !== d1 || state.grid[d2] !== d2))
      return null;
    return button === CURSOR_SELECT2
      ? { type: "edge", d1, d2 }
      : { type: "domino", d1, d2 };
  }

  // Digit keys toggle a value highlight.
  const key = button & ~MOD_NUM_KEYPAD;
  if (key >= 48 && key <= 57) {
    const num = key - 48;
    if (num > state.params.n) return null;
    if (!toggleHighlight(ui, num)) return null;
    return UI_UPDATE;
  }

  return null;
}

/** Erase every barrier edge lurking around a square that has just become part
 * of a domino (clearing the reciprocal bit on the neighbour). */
function clearEdgesAround(edges: Int32Array, d: number, w: number): void {
  if (edges[d] & EDGE_L) edges[d - 1] &= ~EDGE_R;
  if (edges[d] & EDGE_R) edges[d + 1] &= ~EDGE_L;
  if (edges[d] & EDGE_T) edges[d - w] &= ~EDGE_B;
  if (edges[d] & EDGE_B) edges[d + w] &= ~EDGE_T;
  edges[d] = 0;
}

function checkCompletion(s: DominosaState): void {
  if (s.completed) return;
  const n = s.params.n;
  const used = new Uint8Array(TRI(n + 1));
  let ok = 0;
  for (let i = 0; i < s.w * s.h; i++)
    if (s.grid[i] > i) {
      const di = DINDEX(s.numbers[i], s.numbers[s.grid[i]]);
      if (!used[di]) {
        used[di] = 1;
        ok++;
      }
    }
  if (ok === DCOUNT(n)) s.completed = true;
}

function executeMove(state: DominosaState, m: DominosaMove): DominosaState {
  const ret = cloneState(state);
  const { w, h } = ret;
  const wh = w * h;

  if (m.type === "solve") {
    ret.cheated = true;
    for (let i = 0; i < wh; i++) {
      ret.grid[i] = i;
      ret.edges[i] = 0;
    }
    for (const [a, b] of m.dominoes) {
      ret.grid[a] = b;
      ret.grid[b] = a;
    }
  } else {
    const { d1, d2 } = m;
    if (!(d1 >= 0 && d2 < wh && d1 < d2 && (d2 - d1 === 1 || d2 - d1 === w)))
      throw new Error(`dominosa: illegal move ${JSON.stringify(m)}`);

    if (m.type === "domino") {
      if (ret.grid[d1] === d2) {
        ret.grid[d1] = d1;
        ret.grid[d2] = d2;
      } else {
        // Erase any dominoes overlapping the new one.
        let d3 = ret.grid[d1];
        if (d3 !== d1) ret.grid[d3] = d3;
        d3 = ret.grid[d2];
        if (d3 !== d2) ret.grid[d3] = d3;
        // Place the new one and destroy any lurking edges.
        ret.grid[d1] = d2;
        ret.grid[d2] = d1;
        clearEdgesAround(ret.edges, d1, w);
        clearEdgesAround(ret.edges, d2, w);
      }
    } else {
      // edge
      if (ret.grid[d1] !== d1 || ret.grid[d2] !== d2)
        throw new Error("dominosa: edge move next to a domino");
      if (d2 === d1 + 1) {
        ret.edges[d1] ^= EDGE_R;
        ret.edges[d2] ^= EDGE_L;
      } else {
        ret.edges[d1] ^= EDGE_B;
        ret.edges[d2] ^= EDGE_T;
      }
    }
  }

  checkCompletion(ret);
  return ret;
}

function solve(
  orig: DominosaState,
  _curr: DominosaState,
  aux?: string,
): SolveResult<DominosaMove> {
  const { w, numbers, params } = orig;
  const wh = numbers.length;

  if (aux && aux.length === wh) {
    const dominoes: Array<[number, number]> = [];
    for (let i = 0; i < wh; i++) {
      if (aux[i] === "L") dominoes.push([i, i + 1]);
      else if (aux[i] === "T") dominoes.push([i, i + w]);
    }
    return { ok: true, move: { type: "solve", dominoes } };
  }

  const { result, pairs } = solveNumbers(params.n, numbers, DIFFCOUNT);
  if (result !== 1)
    return { ok: false, error: "Unable to find a unique solution for this puzzle" };
  return { ok: true, move: { type: "solve", dominoes: pairs } };
}

/** Boards this fork generates are uniquely solvable: re-solve to the unique
 * solution and flag both cells of every player-placed domino the solution does
 * not contain. A non-uniquely-solvable board degrades to no mistakes. */
function findMistakes(state: DominosaState): readonly DominosaMistake[] {
  const { numbers, grid, params } = state;
  const wh = numbers.length;
  const { result, pairs } = solveNumbers(params.n, numbers, DIFFCOUNT);
  if (result !== 1) return [];

  const solutionPartner = new Int32Array(wh);
  for (let i = 0; i < wh; i++) solutionPartner[i] = i;
  for (const [a, b] of pairs) {
    solutionPartner[a] = b;
    solutionPartner[b] = a;
  }

  const out: DominosaMistake[] = [];
  for (let i = 0; i < wh; i++) {
    if (grid[i] > i && solutionPartner[i] !== grid[i]) {
      out.push({ index: i });
      out.push({ index: grid[i] });
    }
  }
  return out;
}

// --- text format (upstream game_text_format / draw_domino) -----------------

function drawDomino(
  board: string[],
  start: number,
  corner: string,
  dshort: number,
  nshort: number,
  cshort: string,
  dlong: number,
  nlong: number,
  clong: string,
): void {
  const goShort = nshort * dshort;
  const goLong = nlong * dlong;
  board[start] = corner;
  board[start + goShort] = corner;
  board[start + goLong] = corner;
  board[start + goShort + goLong] = corner;
  for (let i = 1; i < nshort; i++) {
    const j = start + i * dshort;
    const k = start + i * dshort + goLong;
    if (board[j] !== corner) board[j] = cshort;
    if (board[k] !== corner) board[k] = cshort;
  }
  for (let i = 1; i < nlong; i++) {
    const j = start + i * dlong;
    const k = start + i * dlong + goShort;
    if (board[j] !== corner) board[j] = clong;
    if (board[k] !== corner) board[k] = clong;
  }
}

function textFormat(state: DominosaState): string {
  const { w, h, numbers, grid, edges } = state;
  const cw = 4;
  const ch = 2;
  const gw = cw * w + 2;
  const gh = ch * h + 1;
  const len = gw * gh;
  const board: string[] = new Array(len).fill(" ");

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = r * ch * gw + cw * c;
      const center = cell + Math.floor((gw * ch) / 2) + Math.floor(cw / 2);
      const i = r * w + c;
      const num = numbers[i];
      if (num < 100) {
        board[center] = String(num % 10);
        if (num >= 10) board[center - 1] = String(Math.floor(num / 10));
      } else {
        board[center + 1] = String(num % 10);
        board[center] = String(Math.floor(num / 10) % 10);
        board[center - 1] = String(Math.floor(num / 100));
      }
      if (edges[i] & EDGE_L) board[center - cw / 2] = "|";
      if (edges[i] & EDGE_R) board[center + cw / 2] = "|";
      if (edges[i] & EDGE_T) board[center - gw] = "-";
      if (edges[i] & EDGE_B) board[center + gw] = "-";

      if (grid[i] === i) continue; // no pairing
      if (grid[i] < i) continue; // already drawn
      if (grid[i] === i + 1) drawDomino(board, cell, "+", gw, ch, "|", 1, 2 * cw, "-");
      else if (grid[i] === i + w)
        drawDomino(board, cell, "+", 1, cw, "-", gw, 2 * ch, "|");
    }
    board[r * ch * gw + gw - 1] = "\n";
    board[r * ch * gw + gw + gw - 1] = "\n";
  }
  board[len - 1] = "\n";
  return board.join("");
}

function flashLength(
  oldState: DominosaState,
  newState_: DominosaState,
  _dir: number,
  ui: DominosaUi,
): number {
  if (
    !oldState.completed &&
    newState_.completed &&
    !oldState.cheated &&
    !newState_.cheated
  ) {
    ui.highlight1 = -1;
    ui.highlight2 = -1;
    return FLASH_TIME;
  }
  return 0;
}

export const dominosaGame: Game<
  DominosaParams,
  DominosaState,
  DominosaMove,
  DominosaUi,
  DominosaDrawState,
  DominosaMistake
> = {
  id: "dominosa",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  needsRightButton: true, // upstream REQUIRE_RBUTTON (barrier edges)

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    {
      kw: "maximum-number-on-dominoes",
      name: "Maximum number on dominoes",
      type: "string",
      get: (p) => String(p.n),
      set: (p, v) => {
        p.n = parseConfigInt(v);
      },
    },
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: [...DIFF_NAMES],
      get: (p) => p.diff,
      set: (p, v) => {
        p.diff = v;
      },
    },
  ],
  describeParams: (p) => ({
    "maximum-number-on-dominoes": String(p.n),
    difficulty: p.diff,
  }),

  newDesc: (p: DominosaParams, rng: RandomState) => newDominosaDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,

  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: DominosaParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  flashLength,
};

registerGame(dominosaGame);
