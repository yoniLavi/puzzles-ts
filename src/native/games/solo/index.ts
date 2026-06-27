/**
 * Solo (Sudoku) — native TS port of `solo.c`. Fill a `cr × cr` grid (`cr = c·r`)
 * with digits `1..cr` so every row, column and sub-block holds each digit once;
 * variants add irregular (jigsaw) blocks, two main diagonals (X), and digit-sum
 * cages (killer). Left-click / cursor-select highlights a cell for a real entry;
 * right-click / select2 highlights it for a pencil mark (or toggles sticky
 * pencil mode); a digit enters (or pencil-toggles) that value; backspace/space
 * clears. Duplicate digits and over-full cages highlight live; Check & Save
 * additionally flags cells that contradict the unique solution.
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
import { newSoloDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SoloDrawState,
  setTileSize,
} from "./render.ts";
import { solveSolo } from "./solver.ts";
import {
  checkValid,
  cloneState,
  DIFF_AMBIGUOUS,
  DIFF_BLOCK,
  DIFF_EXTREME,
  DIFF_IMPOSSIBLE,
  DIFF_INTERSECT,
  DIFF_KINTERSECT,
  DIFF_KMINMAX,
  DIFF_RECURSIVE,
  DIFF_SET,
  DIFF_SIMPLE,
  decodeParams,
  defaultParams,
  encodeParams,
  newState,
  newUi,
  type SoloMistake,
  type SoloMove,
  type SoloParams,
  type SoloState,
  type SoloUi,
  SYMM_NONE,
  SYMM_ROT2,
  status as soloStatus,
  validateDesc,
  validateParams,
} from "./state.ts";

interface Preset {
  title: string;
  params: SoloParams;
}

/** Faithful to `game_presets` (the non-SLOW_SYSTEM entries are always shown). */
function soloPresets(): Preset[] {
  const P = (
    c: number,
    r: number,
    symm: number,
    diff: number,
    kdiff: number,
    xtype: boolean,
    killer: boolean,
    title: string,
  ): Preset => ({ title, params: { c, r, symm, diff, kdiff, xtype, killer } });
  const K = DIFF_KMINMAX;
  return [
    P(2, 2, SYMM_ROT2, DIFF_BLOCK, K, false, false, "2x2 Trivial"),
    P(2, 3, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "2x3 Basic"),
    P(3, 3, SYMM_ROT2, DIFF_BLOCK, K, false, false, "3x3 Trivial"),
    P(3, 3, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "3x3 Basic"),
    P(3, 3, SYMM_ROT2, DIFF_SIMPLE, K, true, false, "3x3 Basic X"),
    P(3, 3, SYMM_ROT2, DIFF_INTERSECT, K, false, false, "3x3 Intermediate"),
    P(3, 3, SYMM_ROT2, DIFF_SET, K, false, false, "3x3 Advanced"),
    P(3, 3, SYMM_ROT2, DIFF_SET, K, true, false, "3x3 Advanced X"),
    P(3, 3, SYMM_ROT2, DIFF_EXTREME, K, false, false, "3x3 Extreme"),
    P(3, 3, SYMM_ROT2, DIFF_RECURSIVE, K, false, false, "3x3 Unreasonable"),
    P(3, 3, SYMM_NONE, DIFF_BLOCK, DIFF_KINTERSECT, false, true, "3x3 Killer"),
    P(9, 1, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "9 Jigsaw Basic"),
    P(9, 1, SYMM_ROT2, DIFF_SIMPLE, K, true, false, "9 Jigsaw Basic X"),
    P(9, 1, SYMM_ROT2, DIFF_SET, K, false, false, "9 Jigsaw Advanced"),
    P(3, 4, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "3x4 Basic"),
    P(4, 4, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "4x4 Basic"),
  ];
}

function presets(): PresetMenu<SoloParams> {
  return {
    title: "Solo",
    submenu: soloPresets().map((p) => ({ title: p.title, params: p.params })),
  };
}

function inGrid(cr: number, x: number, y: number): boolean {
  return x >= 0 && x < cr && y >= 0 && y < cr;
}

/** Move the keyboard cursor (clamped); reveal it on first press. Mirrors
 * `move_cursor`: the position moves even on the reveal press. */
function moveCursor(button: number, ui: SoloUi, cr: number): UiUpdate | null {
  const ox = ui.hx;
  const oy = ui.hy;
  if (button === CURSOR_UP) ui.hy = Math.max(ui.hy - 1, 0);
  else if (button === CURSOR_DOWN) ui.hy = Math.min(ui.hy + 1, cr - 1);
  else if (button === CURSOR_LEFT) ui.hx = Math.max(ui.hx - 1, 0);
  else if (button === CURSOR_RIGHT) ui.hx = Math.min(ui.hx + 1, cr - 1);
  if (!ui.hshow) {
    ui.hshow = true;
    return UI_UPDATE;
  }
  return ui.hx !== ox || ui.hy !== oy ? UI_UPDATE : null;
}

function interpretMove(
  state: SoloState,
  ui: SoloUi,
  ds: SoloDrawState | null,
  p: Point,
  rawButton: number,
): SoloMove | null | UiUpdate {
  const cr = state.cr;
  const ts = ds?.tileSize ?? PREFERRED_TILE_SIZE;
  const button = stripModifiers(rawButton);

  const tx = fromCoord(p.x, ts);
  const ty = fromCoord(p.y, ts);

  if (inGrid(cr, tx, ty)) {
    if (button === LEFT_BUTTON) {
      // Sticky pencil mode: a left-click on an already-selected cell keeps the
      // current pencil/real mode (it only moves the highlight); non-sticky
      // (upstream) reverts to real entry. A click on a given cell hides the
      // highlight (can't be edited).
      if (state.immutable[ty * cr + tx]) {
        ui.hshow = false;
      } else if (
        tx === ui.hx &&
        ty === ui.hy &&
        ui.hshow &&
        (ui.pencilSticky || !ui.hpencil)
      ) {
        ui.hshow = false;
      } else {
        ui.hx = tx;
        ui.hy = ty;
        ui.hshow = true;
        if (!ui.pencilSticky) ui.hpencil = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
    if (button === RIGHT_BUTTON) {
      if (ui.pencilSticky) {
        // Toggle the persistent pencil mode (CapsLock-style). Only move the
        // highlight onto an empty cell — a filled/given cell can't take a mark.
        ui.hpencil = !ui.hpencil;
        if (state.grid[ty * cr + tx] === 0) {
          ui.hx = tx;
          ui.hy = ty;
          ui.hshow = true;
        }
      } else if (state.grid[ty * cr + tx] === 0) {
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
    return moveCursor(button, ui, cr);
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  // A digit key (1..9 then a..z / A..Z for orders > 9), or a clear.
  let n = -1;
  if (button >= 48 && button <= 57 && button - 48 <= cr) n = button - 48;
  else if (button >= 97 && button <= 122 && button - 97 + 10 <= cr)
    n = button - 97 + 10;
  else if (button >= 65 && button <= 90 && button - 65 + 10 <= cr) n = button - 65 + 10;
  else if (button === CURSOR_SELECT2 || button === 8 || button === 127) n = 0;

  if (ui.hshow && n >= 0) {
    const i = ui.hy * cr + ui.hx;

    // Can't overwrite a given (reachable only via the cursor).
    if (state.immutable[i]) return null;
    // Can't pencil-mark a filled square (reachable only via the cursor).
    if (ui.hpencil && state.grid[i]) return null;

    // No-op: re-entering the value the cell already holds (or clearing an empty
    // cell) with no pencil marks to wipe.
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

/** Strike digit `n` from the pencil marks of every cell sharing a row, column,
 * block (or diagonal when xtype) with `(x, y)` — auto-pencil cleanup on a real
 * placement. */
function autoEliminate(state: SoloState, x: number, y: number, n: number): void {
  const cr = state.cr;
  const bit = ~(1 << n);
  const wb = state.blocks.whichblock;
  const home = wb[y * cr + x];
  for (let k = 0; k < cr; k++) {
    if (k !== x) state.pencil[y * cr + k] &= bit; // row
    if (k !== y) state.pencil[k * cr + x] &= bit; // column
  }
  // Block (the block can extend beyond the row/column already cleared).
  for (let i = 0; i < cr * cr; i++) {
    if (i !== y * cr + x && wb[i] === home) state.pencil[i] &= bit;
  }
  if (state.xtype) {
    const cell = y * cr + x;
    if (onDiag0Cell(cell, cr))
      for (let k = 0; k < cr; k++) {
        const d = k * (cr + 1);
        if (d !== cell) state.pencil[d] &= bit;
      }
    if (onDiag1Cell(cell, cr))
      for (let k = 0; k < cr; k++) {
        const d = (k + 1) * (cr - 1);
        if (d !== cell) state.pencil[d] &= bit;
      }
  }
}

function onDiag0Cell(xy: number, cr: number): boolean {
  return xy % (cr + 1) === 0;
}
function onDiag1Cell(xy: number, cr: number): boolean {
  return xy % (cr - 1) === 0 && xy > 0 && xy < cr * cr - 1;
}

function executeMove(state: SoloState, move: SoloMove): SoloState {
  const cr = state.cr;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * cr + move.x;
      if (move.pencil && move.n > 0) {
        next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
        next.pencil[i] = 0;
        if (move.autoElim && move.n > 0) autoEliminate(next, move.x, move.y, move.n);
        if (!next.completed && isComplete(next)) next.completed = true;
      }
      return next;
    }
    case "pencilAll": {
      // Bits 1..cr set (digit n ⇒ bit 1<<n).
      const all = ((1 << (cr + 1)) - (1 << 1)) | 0;
      for (let i = 0; i < cr * cr; i++) if (!next.grid[i]) next.pencil[i] = all;
      return next;
    }
    case "pencilStrike": {
      for (const { x, y, n } of move.marks) next.pencil[y * cr + x] &= ~(1 << n);
      return next;
    }
    case "solve": {
      for (let i = 0; i < cr * cr; i++) {
        next.grid[i] = move.grid[i];
        next.pencil[i] = 0;
      }
      next.completed = true;
      next.cheated = true;
      return next;
    }
  }
}

/** `check_valid` over the working grid (every region complete, cages sum). */
function isComplete(state: SoloState): boolean {
  return checkValid(state.cr, state.blocks, state.killerData, state.xtype, state.grid);
}

function solve(orig: SoloState, _curr: SoloState, aux?: string): SolveResult<SoloMove> {
  const cr = orig.cr;
  if (aux) {
    // aux is an "S<digit><digit>…" encoded full solution (encode_solve_move).
    const grid: number[] = [];
    for (let i = 0; i < cr * cr; i++) grid[i] = aux.charCodeAt(i + 1) - 48;
    return { ok: true, move: { type: "solve", grid } };
  }
  // Re-derive from the givens only.
  const fromGivens = givensOnly(orig);
  const { diff, grid } = solveSolo(fromGivens, DIFF_RECURSIVE, DIFF_KINTERSECT);
  if (diff === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (diff === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(grid, (v) => v) } };
}

/** A copy of `state` with every non-given cell cleared (so the solver works
 * from the puzzle's fixed clues, never the player's entries/notes). */
function givensOnly(state: SoloState): SoloState {
  const s = cloneState(state);
  for (let i = 0; i < s.cr * s.cr; i++) {
    if (!s.immutable[i]) s.grid[i] = 0;
    s.pencil[i] = 0;
  }
  return s;
}

function findMistakes(state: SoloState): readonly SoloMistake[] {
  const cr = state.cr;
  // The solution is derived from the givens (+ cage clues) only — never from the
  // player's notes (a note can be wrong; that is what we are checking).
  const { diff, grid: soln } = solveSolo(
    givensOnly(state),
    DIFF_RECURSIVE,
    DIFF_KINTERSECT,
  );
  if (diff === DIFF_IMPOSSIBLE || diff === DIFF_AMBIGUOUS) return [];
  const out: SoloMistake[] = [];
  for (let i = 0; i < cr * cr; i++) {
    if (state.immutable[i]) continue;
    if (state.grid[i]) {
      if (state.grid[i] !== soln[i])
        out.push({ kind: "cell", x: i % cr, y: (i / cr) | 0 });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & (1 << soln[i]))) {
      out.push({ kind: "note", x: i % cr, y: (i / cr) | 0 });
    }
  }
  return out;
}

function flashLength(
  from: SoloState,
  to: SoloState,
  _dir: number,
  _ui: SoloUi,
): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
}

export const soloGame: Game<
  SoloParams,
  SoloState,
  SoloMove,
  SoloUi,
  SoloDrawState,
  SoloMistake
> = {
  id: "solo",
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
  // Keys match the custom `solo` describeConfig in augmentation.ts.
  describeParams: (p): ConfigValues => ({
    "columns-of-sub-blocks": p.c,
    "rows-of-sub-blocks": p.r,
    jigsaw: p.r === 1,
    killer: p.killer,
    x: p.xtype,
    difficulty: p.diff,
    symmetry: p.symm,
  }),

  newDesc: (p, rng: RandomState) => newSoloDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status: (s): GameStatus => soloStatus(s),

  solve,
  findMistakes,

  prefs: [
    {
      kw: "auto-pencil",
      name: "When you place a number, remove it from pencil marks in its row, column and block",
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
  computeSize: (p: SoloParams, ts: number): Size => computeSize(p.c * p.r, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(soloGame);
