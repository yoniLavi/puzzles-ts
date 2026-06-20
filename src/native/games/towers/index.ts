/**
 * Towers (Skyscrapers) — native TS port of `towers.c`. Fill a `w × w` grid so
 * every row and column holds each height `1..w` once, and so each outside clue
 * equals the number of towers visible from that edge (a taller tower hides
 * every shorter one behind it). Left-click / cursor select highlights a cell
 * for a real entry; right-click / select2 highlights it for a pencil mark; a
 * digit enters (or pencil-toggles) that height; a click or shift/ctrl-cursor
 * on an outside clue strikes it through. Rule violations highlight live; Check
 * & Save additionally flags cells that contradict the unique solution.
 */

import type {
  Colour,
  ConfigValues,
  GameStatus,
  Point,
  Size,
} from "../../../puzzle/types.ts";
import {
  type Game,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  isCursorMove,
  LEFT_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newTowersDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  coord,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
  type TowersDrawState,
  x3d,
  y3d,
} from "./render.ts";
import { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE, solveTowers } from "./solver.ts";
import {
  checkErrors,
  cloneState,
  clueIndex,
  DIFF_UNREASONABLE,
  decodeParams,
  defaultParams,
  diffName,
  diffToLevel,
  encodeParams,
  isClue,
  newState,
  newUi,
  status,
  type TowersMove,
  type TowersParams,
  type TowersState,
  type TowersUi,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player-entered cell whose height contradicts the unique solution. */
export interface TowersMistake {
  x: number;
  y: number;
}

const PRESETS: TowersParams[] = [
  { w: 4, diff: "easy" },
  { w: 5, diff: "easy" },
  { w: 5, diff: "hard" },
  { w: 6, diff: "easy" },
  { w: 6, diff: "hard" },
  { w: 6, diff: "extreme" },
  { w: 6, diff: "unreasonable" },
];

function presets(): PresetMenu<TowersParams> {
  return {
    title: "Towers",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.w} ${diffName(p.diff)}`,
      params: p,
    })),
  };
}

function inGrid(w: number, x: number, y: number): boolean {
  return x >= 0 && x < w && y >= 0 && y < w;
}

/** Move the keyboard cursor (clamped); reveal it on first press. Mirrors
 * `move_cursor`: the position moves even on the reveal press. */
function moveCursor(button: number, ui: TowersUi, w: number): UiUpdate | null {
  const ox = ui.hx;
  const oy = ui.hy;
  if (button === CURSOR_UP) ui.hy = Math.max(ui.hy - 1, 0);
  else if (button === CURSOR_DOWN) ui.hy = Math.min(ui.hy + 1, w - 1);
  else if (button === CURSOR_LEFT) ui.hx = Math.max(ui.hx - 1, 0);
  else if (button === CURSOR_RIGHT) ui.hx = Math.min(ui.hx + 1, w - 1);
  if (!ui.hshow) {
    ui.hshow = true;
    return UI_UPDATE;
  }
  return ui.hx !== ox || ui.hy !== oy ? UI_UPDATE : null;
}

function interpretMove(
  state: TowersState,
  ui: TowersUi,
  ds: TowersDrawState | null,
  p: Point,
  rawButton: number,
): TowersMove | null | UiUpdate {
  const w = state.w;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const shiftOrCtrl = (rawButton & (MOD_SHFT | MOD_CTRL)) !== 0;
  const button = stripModifiers(rawButton);

  let tx = fromCoord(p.x, ts);
  let ty = fromCoord(p.y, ts);

  if (ui.threeD) {
    // A click may land on a tower protruding up-left from a neighbouring cell;
    // check the tops of nearby towers and retarget if so.
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx >= -1; dx--) {
        const cx = tx + dx;
        const cy = ty + dy;
        if (!inGrid(w, cx, cy)) continue;
        const height = state.grid[cy * w + cx];
        const bx = coord(cx, ts);
        const by = coord(cy, ts);
        const ox = bx + x3d(height, w, ts);
        const oy = by - y3d(height, w, ts);
        if (
          // on the top face?
          (p.x - ox >= 0 && p.x - ox < ts && p.y - oy >= 0 && p.y - oy < ts) ||
          // in the triangle between the top-left corners?
          (ox > bx &&
            p.x >= bx &&
            p.x <= ox &&
            p.y <= by &&
            (by - p.y) * (ox - bx) <= (by - oy) * (p.x - bx)) ||
          // in the triangle between the bottom-right corners?
          (ox > bx &&
            p.x >= bx + ts &&
            p.x <= ox + ts &&
            p.y >= oy + ts &&
            (by - p.y + ts) * (ox - bx) >= (by - oy) * (p.x - bx - ts))
        ) {
          tx = cx;
          ty = cy;
        }
      }
    }
  }

  if (inGrid(w, tx, ty)) {
    if (button === LEFT_BUTTON) {
      if (tx === ui.hx && ty === ui.hy && ui.hshow && !ui.hpencil) {
        ui.hshow = false;
      } else {
        ui.hx = tx;
        ui.hy = ty;
        ui.hshow = !state.immutable[ty * w + tx];
        ui.hpencil = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
    if (button === RIGHT_BUTTON) {
      if (state.grid[ty * w + tx] === 0) {
        if (tx === ui.hx && ty === ui.hy && ui.hshow && ui.hpencil) {
          ui.hshow = false;
        } else {
          ui.hpencil = true;
          ui.hx = tx;
          ui.hy = ty;
          ui.hshow = true;
        }
      } else {
        ui.hshow = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
  } else if (button === LEFT_BUTTON) {
    if (isClue(state, tx, ty)) {
      return { type: "clueDone", index: clueIndex(tx, ty, w) };
    }
  }

  if (isCursorMove(button)) {
    if (shiftOrCtrl) {
      let cx = ui.hx;
      let cy = ui.hy;
      if (button === CURSOR_LEFT) cx = -1;
      else if (button === CURSOR_RIGHT) cx = w;
      else if (button === CURSOR_UP) cy = -1;
      else if (button === CURSOR_DOWN) cy = w;
      if (isClue(state, cx, cy))
        return { type: "clueDone", index: clueIndex(cx, cy, w) };
      return null;
    }
    ui.hcursor = true;
    return moveCursor(button, ui, w);
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  const isDigit = button >= 48 && button <= 57 && button - 48 <= w;
  const isClear = button === CURSOR_SELECT2 || button === 8 || button === 127;
  if (ui.hshow && (isDigit || isClear)) {
    const n = isClear ? 0 : button - 48;
    const i = ui.hy * w + ui.hx;

    // Can't pencil-mark a filled square; can't touch an immutable one.
    if (ui.hpencil && state.grid[i]) return null;
    if (state.immutable[i]) return null;

    // No-op: setting a square to what it already holds (and no pencil marks).
    if ((!ui.hpencil || n === 0) && state.grid[i] === n && state.pencil[i] === 0) {
      if (!ui.hcursor) {
        ui.hshow = false;
        return UI_UPDATE;
      }
      return null;
    }

    const pencil = ui.hpencil && n > 0;
    if (!ui.hcursor && !(ui.hpencil && ui.pencilKeepHighlight)) ui.hshow = false;
    return { type: "set", x: ui.hx, y: ui.hy, n, pencil };
  }

  if (button === 77 || button === 109) return { type: "pencilAll" }; // 'M' / 'm'

  return null;
}

function executeMove(state: TowersState, move: TowersMove): TowersState {
  const w = state.w;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * w + move.x;
      if (state.immutable[i]) throw new Error("towers: move into an immutable cell");
      if (move.pencil && move.n > 0) {
        next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
        next.pencil[i] = 0;
        if (!next.completed && !checkErrors(next)) next.completed = true;
      }
      return next;
    }
    case "clueDone": {
      next.cluesDone[move.index] = next.cluesDone[move.index] ? 0 : 1;
      return next;
    }
    case "pencilAll": {
      const all = (1 << (w + 1)) - (1 << 1);
      for (let i = 0; i < w * w; i++) if (!next.grid[i]) next.pencil[i] = all;
      return next;
    }
    case "solve": {
      for (let i = 0; i < w * w; i++) {
        next.grid[i] = move.grid[i];
        next.pencil[i] = 0;
      }
      next.completed = true;
      next.cheated = true;
      return next;
    }
  }
}

function changedState(
  ui: TowersUi,
  _old: TowersState | null,
  newSt: TowersState,
): void {
  const w = newSt.w;
  if (ui.hshow && ui.hpencil && !ui.hcursor && newSt.grid[ui.hy * w + ui.hx] !== 0) {
    ui.hshow = false;
  }
}

function gridFromSoln(soln: Uint8Array): number[] {
  return Array.from(soln, (v) => v);
}

function solve(
  orig: TowersState,
  _curr: TowersState,
  aux?: string,
): SolveResult<TowersMove> {
  const w = orig.w;
  if (aux) {
    const grid: number[] = [];
    for (let i = 0; i < w * w; i++) grid[i] = Number(aux[i + 1]);
    return { ok: true, move: { type: "solve", grid } };
  }
  const soln = Uint8Array.from(orig.immutable);
  const ret = solveTowers(w, orig.clues, soln, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (ret === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: gridFromSoln(soln) } };
}

function findMistakes(state: TowersState): readonly TowersMistake[] {
  const w = state.w;
  const soln = Uint8Array.from(state.immutable);
  const ret = solveTowers(w, state.clues, soln, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE || ret === DIFF_AMBIGUOUS) return [];
  const out: TowersMistake[] = [];
  for (let i = 0; i < w * w; i++) {
    if (state.immutable[i]) continue; // givens are always correct
    if (state.grid[i] && state.grid[i] !== soln[i]) {
      out.push({ x: i % w, y: (i / w) | 0 });
    }
  }
  return out;
}

function flashLength(
  from: TowersState,
  to: TowersState,
  _dir: number,
  _ui: TowersUi,
): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
}

export const towersGame: Game<
  TowersParams,
  TowersState,
  TowersMove,
  TowersUi,
  TowersDrawState,
  TowersMistake
> = {
  id: "towers",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  canMarkAll: true, // handles 'M' (pencilAll) in interpretMove

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  // Keys/shape match the `towers` config template in augmentation.ts
  // ("{grid-size}x{grid-size} {difficulty:Easy|Hard|Extreme|Unreasonable}"):
  // `grid-size` is the value, `difficulty` the zero-based label index.
  describeParams: (p): ConfigValues => ({
    "grid-size": String(p.w),
    difficulty: diffToLevel(p.diff),
  }),

  newDesc: (p, rng: RandomState) => newTowersDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status: (s): GameStatus => status(s),

  solve,
  findMistakes,
  textFormat,

  prefs: [
    {
      kw: "pencil-keep-highlight",
      name: "Keep mouse highlight after changing a pencil mark",
      type: "boolean",
      get: (ui) => ui.pencilKeepHighlight,
      set: (ui, v) => {
        ui.pencilKeepHighlight = v;
      },
    },
    {
      kw: "appearance",
      name: "Puzzle appearance",
      type: "choices",
      choices: ["2D", "3D"],
      get: (ui) => (ui.threeD ? 1 : 0),
      set: (ui, v) => {
        ui.threeD = v === 1;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: TowersParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(towersGame);
