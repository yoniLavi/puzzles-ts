/**
 * Unequal — native TS port of `unequal.c`. Fill an `order × order` grid so every
 * row and column holds each number `1..order` once, subject to clues between
 * adjacent cells: greater-than signs (Unequal mode) or differ-by-1 bars
 * (Adjacent mode). Left-click / cursor select highlights a cell for a real
 * entry; right-click / select2 toggles pencil mode; a digit enters (or
 * pencil-toggles) that number; clicking a clue sign in the gap between two cells
 * greys it out ("spent"). Rule violations highlight live; Check & Save
 * additionally flags cells that contradict the unique solution.
 */

import type { Colour, ConfigValues, GameStatus, Point, Size } from "../../../puzzle/types.ts";
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
import { newUnequalDesc } from "./generator.ts";
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
  type UnequalDrawState,
} from "./render.ts";
import {
  DIFF_AMBIGUOUS,
  DIFF_IMPOSSIBLE,
  solveUnequal,
} from "./solver.ts";
import {
  ADJTHAN,
  adjToSpent,
  checkComplete,
  cloneState,
  c2n,
  DIFF_RECURSIVE,
  decodeParams,
  defaultParams,
  diffName,
  diffToLevel,
  encodeParams,
  F_ADJ_DOWN,
  F_ADJ_LEFT,
  F_ADJ_RIGHT,
  F_ADJ_UP,
  F_SPENT_DOWN,
  F_SPENT_LEFT,
  F_SPENT_RIGHT,
  F_SPENT_UP,
  newState,
  newUi,
  PRESETS,
  status,
  type UnequalMove,
  type UnequalParams,
  type UnequalState,
  type UnequalUi,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player marking that contradicts the unique solution:
 * - `"cell"` — a filled-in number that is wrong;
 * - `"note"` — an empty cell whose non-empty pencil notes have crossed out the
 *   cell's solution value. */
export interface UnequalMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
}

function presets(): PresetMenu<UnequalParams> {
  return {
    title: "Unequal",
    submenu: PRESETS.map((p) => ({
      title: `${p.mode === "adjacent" ? "Adjacent" : "Unequal"}: ${p.order}x${p.order} ${diffName(p.diff)}`,
      params: p,
    })),
  };
}

function inGrid(o: number, x: number, y: number): boolean {
  return x >= 0 && x < o && y >= 0 && y < o;
}

/** Move the keyboard cursor (clamped); reveal it on first press. */
function moveCursor(button: number, ui: UnequalUi, o: number): UiUpdate | null {
  const ox = ui.hx;
  const oy = ui.hy;
  if (button === CURSOR_UP) ui.hy = Math.max(ui.hy - 1, 0);
  else if (button === CURSOR_DOWN) ui.hy = Math.min(ui.hy + 1, o - 1);
  else if (button === CURSOR_LEFT) ui.hx = Math.max(ui.hx - 1, 0);
  else if (button === CURSOR_RIGHT) ui.hx = Math.min(ui.hx + 1, o - 1);
  if (!ui.hshow) {
    ui.hshow = true;
    return UI_UPDATE;
  }
  return ui.hx !== ox || ui.hy !== oy ? UI_UPDATE : null;
}

function interpretMove(
  state: UnequalState,
  ui: UnequalUi,
  ds: UnequalDrawState | null,
  p: Point,
  rawButton: number,
): UnequalMove | null | UiUpdate {
  const o = state.order;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const shiftOrCtrl = (rawButton & (MOD_SHFT | MOD_CTRL)) !== 0;
  const button = stripModifiers(rawButton);

  const tx = fromCoord(p.x, ts);
  const ty = fromCoord(p.y, ts);

  if (
    inGrid(o, tx, ty) &&
    (button === LEFT_BUTTON || button === RIGHT_BUTTON)
  ) {
    // A click in the gap below/right of a cell toggles that clue's spent flag.
    const gapBelow = p.y - coord(ty, ts) > ts;
    const gapRight = p.x - coord(tx, ts) > ts;
    if (gapBelow && gapRight) return null;
    if (gapBelow) {
      if (state.clueFlags[ty * o + tx] & F_ADJ_DOWN)
        return { type: "spent", x: tx, y: ty, flag: F_SPENT_DOWN };
      if (ty + 1 < o && state.clueFlags[(ty + 1) * o + tx] & F_ADJ_UP)
        return { type: "spent", x: tx, y: ty + 1, flag: F_SPENT_UP };
      return null;
    }
    if (gapRight) {
      if (state.clueFlags[ty * o + tx] & F_ADJ_RIGHT)
        return { type: "spent", x: tx, y: ty, flag: F_SPENT_RIGHT };
      if (tx + 1 < o && state.clueFlags[ty * o + tx + 1] & F_ADJ_LEFT)
        return { type: "spent", x: tx + 1, y: ty, flag: F_SPENT_LEFT };
      return null;
    }

    if (button === LEFT_BUTTON) {
      // Sticky pencil: a left-click keeps the current mode (only moves the
      // highlight); non-sticky reverts to real entry (upstream).
      if (tx === ui.hx && ty === ui.hy && ui.hshow && (ui.pencilSticky || !ui.hpencil)) {
        ui.hshow = false;
      } else {
        ui.hx = tx;
        ui.hy = ty;
        ui.hshow = !state.immutable[ty * o + tx];
        if (!ui.pencilSticky) ui.hpencil = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
    // RIGHT_BUTTON
    if (ui.pencilSticky) {
      ui.hpencil = !ui.hpencil;
      if (state.grid[ty * o + tx] === 0) {
        ui.hx = tx;
        ui.hy = ty;
        ui.hshow = true;
      }
    } else if (state.grid[ty * o + tx] === 0) {
      if (tx === ui.hx && ty === ui.hy && ui.hshow && ui.hpencil) ui.hshow = false;
      else {
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

  if (isCursorMove(button)) {
    if (shiftOrCtrl) {
      // Toggle the spent state of the clue between the cursor cell and the cell
      // the arrow points to.
      let nx = ui.hx;
      let ny = ui.hy;
      if (button === CURSOR_LEFT) nx = Math.max(nx - 1, 0);
      else if (button === CURSOR_RIGHT) nx = Math.min(nx + 1, o - 1);
      else if (button === CURSOR_UP) ny = Math.max(ny - 1, 0);
      else if (button === CURSOR_DOWN) ny = Math.min(ny + 1, o - 1);
      ui.hshow = true;
      ui.hcursor = true;

      let i = 0;
      for (; i < 4; i++) {
        if (nx === ui.hx + ADJTHAN[i].dx && ny === ui.hy + ADJTHAN[i].dy) break;
      }
      if (i === 4) return UI_UPDATE; // not a single step in a clue direction

      const here = state.clueFlags[ui.hy * o + ui.hx];
      const there = state.clueFlags[ny * o + nx];
      if (!(here & ADJTHAN[i].f || there & ADJTHAN[i].fo)) return UI_UPDATE; // no clue

      const self = state.mode === "adjacent"
        ? ADJTHAN[i].dx >= 0 && ADJTHAN[i].dy >= 0
        : (here & ADJTHAN[i].f) !== 0;
      return self
        ? { type: "spent", x: ui.hx, y: ui.hy, flag: adjToSpent(ADJTHAN[i].f) }
        : { type: "spent", x: nx, y: ny, flag: adjToSpent(ADJTHAN[i].fo) };
    }
    ui.hcursor = true;
    return moveCursor(button, ui, o);
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  // 'M' / 'm' fill-all-pencil-marks.
  if (button === 77 || button === 109) return { type: "pencilAll" };

  const n = c2n(button, o);
  if (ui.hshow && n >= 0 && n <= o) {
    const i = ui.hy * o + ui.hx;
    if (state.immutable[i]) return null; // can't edit a given
    if (ui.hpencil && state.grid[i] > 0) return null; // can't pencil a filled cell

    // No-op: setting a cell to what it already holds (and no pencil marks).
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

  return null;
}

function executeMove(state: UnequalState, move: UnequalMove): UnequalState {
  const o = state.order;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * o + move.x;
      if (state.immutable[i]) throw new Error("unequal: move into an immutable cell");
      if (move.pencil && move.n > 0) {
        next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
        next.pencil[i] = 0;
        if (move.autoElim && move.n > 0) {
          const bit = ~(1 << move.n);
          for (let k = 0; k < o; k++) {
            if (k !== move.x) next.pencil[move.y * o + k] &= bit;
            if (k !== move.y) next.pencil[k * o + move.x] &= bit;
          }
        }
        if (!next.completed && checkComplete(next) > 0) next.completed = true;
      }
      return next;
    }
    case "spent": {
      next.spent[move.y * o + move.x] ^= move.flag;
      return next;
    }
    case "pencilAll": {
      const all = (1 << (o + 1)) - (1 << 1); // bits 1..o set
      for (let i = 0; i < o * o; i++) if (!next.grid[i]) next.pencil[i] = all;
      return next;
    }
    case "pencilStrike": {
      for (const { x, y, n } of move.marks) next.pencil[y * o + x] &= ~(1 << n);
      return next;
    }
    case "solve": {
      for (let i = 0; i < o * o; i++) {
        next.grid[i] = move.grid[i];
        next.pencil[i] = 0;
      }
      next.completed = true;
      next.cheated = true;
      return next;
    }
  }
}

function changedState(ui: UnequalUi, _old: UnequalState | null, newSt: UnequalState): void {
  const o = newSt.order;
  if (ui.hshow && ui.hpencil && !ui.hcursor && newSt.grid[ui.hy * o + ui.hx] !== 0) {
    ui.hshow = false;
  }
}

function solve(orig: UnequalState, _curr: UnequalState, aux?: string): SolveResult<UnequalMove> {
  const o = orig.order;
  if (aux) {
    const grid: number[] = [];
    for (let i = 0; i < o * o; i++) grid[i] = c2n(aux.charCodeAt(i + 1), o);
    return { ok: true, move: { type: "solve", grid } };
  }
  const soln = Uint8Array.from(orig.immutable);
  const ret = solveUnequal(o, orig.mode, orig.clueFlags, soln, DIFF_RECURSIVE);
  if (ret === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (ret === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(soln, (v) => v) } };
}

function findMistakes(state: UnequalState): readonly UnequalMistake[] {
  const o = state.order;
  // The solution is derived from the placed givens only — never from the notes.
  const soln = Uint8Array.from(state.immutable);
  const ret = solveUnequal(o, state.mode, state.clueFlags, soln, DIFF_RECURSIVE);
  if (ret === DIFF_IMPOSSIBLE || ret === DIFF_AMBIGUOUS) return [];
  const out: UnequalMistake[] = [];
  for (let i = 0; i < o * o; i++) {
    if (state.immutable[i]) continue;
    if (state.grid[i]) {
      if (state.grid[i] !== soln[i]) out.push({ kind: "cell", x: i % o, y: (i / o) | 0 });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & (1 << soln[i]))) {
      out.push({ kind: "note", x: i % o, y: (i / o) | 0 });
    }
  }
  return out;
}

function flashLength(from: UnequalState, to: UnequalState, _dir: number, _ui: UnequalUi): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated) return FLASH_TIME;
  return 0;
}

export const unequalGame: Game<
  UnequalParams,
  UnequalState,
  UnequalMove,
  UnequalUi,
  UnequalDrawState,
  UnequalMistake
> = {
  id: "unequal",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  canMarkAll: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  // Keys/shape match the `unequal` config template in augmentation.ts
  // ("{mode:Unequal|Adjacent}: {size}x{size} {difficulty:...}").
  describeParams: (p): ConfigValues => ({
    mode: p.mode === "adjacent" ? 1 : 0,
    size: String(p.order),
    difficulty: diffToLevel(p.diff),
  }),

  newDesc: (p, rng: RandomState) => newUnequalDesc(p, rng),
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
  computeSize: (p: UnequalParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(unequalGame);
