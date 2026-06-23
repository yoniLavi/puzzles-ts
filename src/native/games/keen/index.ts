/**
 * Keen (KenKen / Inshi No Heya) — native TS port of `keen.c`. Fill a `w × w`
 * grid with digits `1..w` so every row and column holds each digit once, and so
 * each arithmetic cage's digits satisfy its clue (target value + operation).
 * Left-click / cursor select highlights a cell for a real entry; right-click /
 * select2 highlights it for a pencil mark (or toggles sticky pencil mode); a
 * digit enters (or pencil-toggles) that value; backspace/space clears. Rule
 * violations highlight live; Check & Save additionally flags cells that
 * contradict the unique solution.
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
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newKeenDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  type KeenDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE, solveKeen } from "./solver.ts";
import {
  checkErrors,
  cloneState,
  DIFF_UNREASONABLE,
  decodeParams,
  defaultParams,
  diffName,
  diffToLevel,
  encodeParams,
  type KeenMove,
  type KeenParams,
  type KeenState,
  type KeenUi,
  newState,
  newUi,
  status,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player marking that contradicts the unique solution:
 * - `"cell"` — a filled-in digit that is wrong;
 * - `"note"` — an empty cell whose non-empty pencil notes have crossed out the
 *   cell's solution digit. */
export interface KeenMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
}

const PRESETS: KeenParams[] = [
  { w: 4, diff: "easy", multiplicationOnly: false },
  { w: 5, diff: "easy", multiplicationOnly: false },
  { w: 5, diff: "easy", multiplicationOnly: true },
  { w: 6, diff: "easy", multiplicationOnly: false },
  { w: 6, diff: "normal", multiplicationOnly: false },
  { w: 6, diff: "normal", multiplicationOnly: true },
  { w: 6, diff: "hard", multiplicationOnly: false },
  { w: 6, diff: "extreme", multiplicationOnly: false },
  { w: 6, diff: "unreasonable", multiplicationOnly: false },
  { w: 9, diff: "normal", multiplicationOnly: false },
];

function presetTitle(p: KeenParams): string {
  return `${p.w}x${p.w} ${diffName(p.diff)}${p.multiplicationOnly ? ", multiplication only" : ""}`;
}

function presets(): PresetMenu<KeenParams> {
  return {
    title: "Keen",
    submenu: PRESETS.map((p) => ({ title: presetTitle(p), params: p })),
  };
}

function inGrid(w: number, x: number, y: number): boolean {
  return x >= 0 && x < w && y >= 0 && y < w;
}

/** Move the keyboard cursor (clamped); reveal it on first press. Mirrors
 * `move_cursor`: the position moves even on the reveal press. */
function moveCursor(button: number, ui: KeenUi, w: number): UiUpdate | null {
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
  state: KeenState,
  ui: KeenUi,
  ds: KeenDrawState | null,
  p: Point,
  rawButton: number,
): KeenMove | null | UiUpdate {
  const w = state.params.w;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const button = stripModifiers(rawButton);

  const tx = fromCoord(p.x, ts);
  const ty = fromCoord(p.y, ts);

  if (inGrid(w, tx, ty)) {
    if (button === LEFT_BUTTON) {
      // Sticky pencil mode: a left-click keeps the current pencil/real mode (it
      // only moves the highlight); non-sticky (upstream) reverts to real entry.
      if (
        tx === ui.hx &&
        ty === ui.hy &&
        ui.hshow &&
        (ui.pencilSticky || !ui.hpencil)
      ) {
        ui.hshow = false;
      } else {
        ui.hx = tx;
        ui.hy = ty;
        ui.hshow = true; // Keen has no immutable givens
        if (!ui.pencilSticky) ui.hpencil = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
    if (button === RIGHT_BUTTON) {
      if (ui.pencilSticky) {
        // Toggle the persistent pencil mode (CapsLock-style). Only move the
        // highlight onto an empty cell — a filled cell can't take a pencil mark.
        ui.hpencil = !ui.hpencil;
        if (state.grid[ty * w + tx] === 0) {
          ui.hx = tx;
          ui.hy = ty;
          ui.hshow = true;
        }
      } else if (state.grid[ty * w + tx] === 0) {
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
  }

  if (isCursorMove(button)) {
    ui.hcursor = true;
    return moveCursor(button, ui, w);
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  const isNum = button >= 48 && button <= 57 && button - 48 <= w;
  const isClear = button === CURSOR_SELECT2 || button === 8 || button === 127;
  if (ui.hshow && (isNum || isClear)) {
    const n = isClear ? 0 : button - 48;
    const i = ui.hy * w + ui.hx;

    // Can't pencil-mark a filled square (reachable only via the cursor).
    if (ui.hpencil && state.grid[i]) return null;

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
    return pencil
      ? { type: "set", x: ui.hx, y: ui.hy, n, pencil }
      : { type: "set", x: ui.hx, y: ui.hy, n, pencil, autoElim: ui.autoPencil };
  }

  if (button === 77 || button === 109) return { type: "pencilAll" }; // 'M' / 'm'

  return null;
}

function executeMove(state: KeenState, move: KeenMove): KeenState {
  const w = state.params.w;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * w + move.x;
      if (move.pencil && move.n > 0) {
        next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
        next.pencil[i] = 0;
        if (move.autoElim && move.n > 0) {
          const bit = ~(1 << move.n);
          for (let k = 0; k < w; k++) {
            if (k !== move.x) next.pencil[move.y * w + k] &= bit;
            if (k !== move.y) next.pencil[k * w + move.x] &= bit;
          }
        }
        if (!next.completed && !checkErrors(next)) next.completed = true;
      }
      return next;
    }
    case "pencilAll": {
      const all = (1 << (w + 1)) - (1 << 1);
      for (let i = 0; i < w * w; i++) if (!next.grid[i]) next.pencil[i] = all;
      return next;
    }
    case "pencilStrike": {
      for (const { x, y, n } of move.marks) next.pencil[y * w + x] &= ~(1 << n);
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

function changedState(ui: KeenUi, _old: KeenState | null, newSt: KeenState): void {
  const w = newSt.params.w;
  if (ui.hshow && ui.hpencil && !ui.hcursor && newSt.grid[ui.hy * w + ui.hx] !== 0) {
    ui.hshow = false;
  }
}

function solve(orig: KeenState, _curr: KeenState, aux?: string): SolveResult<KeenMove> {
  const w = orig.params.w;
  if (aux) {
    const grid: number[] = [];
    for (let i = 0; i < w * w; i++) grid[i] = aux.charCodeAt(i + 1) - 48;
    return { ok: true, move: { type: "solve", grid } };
  }
  const soln = new Uint8Array(w * w);
  const ret = solveKeen(w, orig.clues, soln, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (ret === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(soln, (v) => v) } };
}

function findMistakes(state: KeenState): readonly KeenMistake[] {
  const w = state.params.w;
  // The solution is derived from the cage clue structure only (Keen has no
  // givens) — never from the player's notes (a note can be wrong; that is what
  // we are checking).
  const soln = new Uint8Array(w * w);
  const ret = solveKeen(w, state.clues, soln, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE || ret === DIFF_AMBIGUOUS) return [];
  const out: KeenMistake[] = [];
  for (let i = 0; i < w * w; i++) {
    if (state.grid[i]) {
      if (state.grid[i] !== soln[i])
        out.push({ kind: "cell", x: i % w, y: (i / w) | 0 });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & (1 << soln[i]))) {
      out.push({ kind: "note", x: i % w, y: (i / w) | 0 });
    }
  }
  return out;
}

function flashLength(
  from: KeenState,
  to: KeenState,
  _dir: number,
  _ui: KeenUi,
): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
}

export const keenGame: Game<
  KeenParams,
  KeenState,
  KeenMove,
  KeenUi,
  KeenDrawState,
  KeenMistake
> = {
  id: "keen",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,
  canMarkAll: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  // Keys/shape match the `keen` config template in augmentation.ts
  // ("{grid-size}x{grid-size} {difficulty:...}{multiplication-only:|, …}").
  describeParams: (p): ConfigValues => ({
    "grid-size": String(p.w),
    difficulty: diffToLevel(p.diff),
    "multiplication-only": p.multiplicationOnly ? 1 : 0,
  }),

  newDesc: (p, rng: RandomState) => newKeenDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status: (s): GameStatus => status(s),

  solve,
  findMistakes,

  prefs: [
    {
      kw: "auto-pencil",
      name: "When you place a number, remove it from pencil marks in its row and column",
      type: "boolean",
      get: (ui) => ui.autoPencil,
      set: (ui, v) => {
        ui.autoPencil = v;
      },
    },
    {
      kw: "sticky-pencil-mode",
      name: "Right-click toggles a sticky pencil mode (stays on until right-clicked again)",
      type: "boolean",
      get: (ui) => ui.pencilSticky,
      set: (ui, v) => {
        ui.pencilSticky = v;
      },
    },
    {
      kw: "pencil-keep-highlight",
      name: "Keep mouse highlight after changing a pencil mark",
      type: "boolean",
      get: (ui) => ui.pencilKeepHighlight,
      set: (ui, v) => {
        ui.pencilKeepHighlight = v;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: KeenParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(keenGame);
