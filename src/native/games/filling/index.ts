/**
 * Filling (Fillomino) — native TS port of `filling.c`. Fill every cell with a
 * number `n` so that each maximal orthogonally-connected region of equal
 * numbers contains exactly `n` cells.
 *
 * Input is selection-based: left-click / left-drag (or the keyboard cursor
 * with multi-select) build a selection, then a digit key fills every selected
 * non-clue cell. Read docs/porting/game-port-playbook.md and the Galaxies
 * port first.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import {
  type Game,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newFillingDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  type FillingDrawState,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redrawFilling,
} from "./render.ts";
import { solveFilling } from "./solver.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  type FillingMistake,
  type FillingMove,
  type FillingParams,
  type FillingState,
  type FillingUi,
  newState,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

const ESCAPE = 27;
const BACKSPACE = 8;

function newUi(_state: FillingState): FillingUi {
  return { sel: null, cx: 0, cy: 0, curVisible: false, keydragging: false };
}

function changedState(
  ui: FillingUi,
  _old: FillingState | null,
  _new: FillingState,
): void {
  // Clear any selection after a committed move (upstream game_changed_state).
  ui.sel = null;
  ui.keydragging = false;
}

/** Add the cursor cell to the selection (if it isn't a clue). */
function selectCursor(ui: FillingUi, state: FillingState): void {
  if (!ui.sel) ui.sel = new Set();
  const i = ui.cy * state.w + ui.cx;
  if (!state.clues[i]) ui.sel.add(i);
}

function interpretMove(
  state: FillingState,
  ui: FillingUi,
  ds: FillingDrawState | null,
  p: Point,
  rawButton: number,
): FillingMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h, clues, board } = state;
  const sz = w * h;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const b = Math.floor(ts / 2);
  const tx = Math.floor((p.x + ts - b) / ts) - 1;
  const ty = Math.floor((p.y + ts - b) / ts) - 1;

  if (button === LEFT_BUTTON || button === LEFT_DRAG) {
    if (button === LEFT_BUTTON) ui.sel = null;
    if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
      if (!ui.sel) ui.sel = new Set();
      if (!clues[ty * w + tx]) ui.sel.add(ty * w + tx);
    }
    ui.curVisible = false;
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    ui.curVisible = true;
    const moved = gridCursorMove(button, ui.cx, ui.cy, w, h);
    if (moved) {
      ui.cx = moved.x;
      ui.cy = moved.y;
    }
    if (ui.keydragging) selectCursor(ui, state);
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT) {
    if (!ui.curVisible) {
      ui.curVisible = true;
      return UI_UPDATE;
    }
    ui.keydragging = !ui.keydragging;
    if (ui.keydragging) selectCursor(ui, state);
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT2) {
    if (!ui.curVisible) {
      ui.curVisible = true;
      return UI_UPDATE;
    }
    if (!ui.sel) ui.sel = new Set();
    ui.keydragging = false;
    const ci = ui.cy * w + ui.cx;
    if (!clues[ci]) {
      if (ui.sel.has(ci)) ui.sel.delete(ci);
      else ui.sel.add(ci);
    }
    if (ui.sel.size === 0) ui.sel = null;
    return UI_UPDATE;
  }

  if (button === ESCAPE) {
    ui.sel = null;
    ui.keydragging = false;
    return UI_UPDATE;
  }

  // A digit (backspace ≡ '0') fills the selection, or the cursor cell.
  let key = button;
  if (key === BACKSPACE) key = 48; // '0'
  if (key < 48 || key > 57) return null; // not a digit → unused
  const value = key - 48;
  if (value > (w === 2 && h === 2 ? 3 : Math.max(w, h))) return null;
  ui.keydragging = false;

  const cells: number[] = [];
  for (let i = 0; i < sz; i++) {
    const targeted =
      (ui.sel?.has(i) ?? false) ||
      (!ui.sel && ui.curVisible && ui.cy * w + ui.cx === i);
    if (!targeted) continue;
    if (clues[i] !== 0) continue; // cursor may rest on a clue
    if (board[i] !== value) cells.push(i);
  }
  const move: FillingMove | null =
    cells.length > 0 ? { type: "set", cells, value } : null;

  if (!ui.sel) return move; // no selection: a move, or nothing happened
  ui.sel = null; // selection consumed; redraw even if nothing changed
  return move ?? UI_UPDATE;
}

function solve(orig: FillingState): SolveResult<FillingMove> {
  const { w, h, clues } = orig;
  const { solved, board } = solveFilling(clues, w, h);
  if (!solved) return { ok: false, error: "Sorry, I couldn't find a solution" };
  let s = "";
  for (let i = 0; i < w * h; i++) s += String(board[i]);
  return { ok: true, move: { type: "solve", board: s } };
}

/** Re-solve from the immutable clues and flag every player-filled cell whose
 * number contradicts the unique solution (the Check & Save divergence). */
function findMistakes(state: FillingState): readonly FillingMistake[] {
  const { w, h, board, clues } = state;
  const { solved, board: solution } = solveFilling(clues, w, h);
  if (!solved) return [];
  const out: FillingMistake[] = [];
  for (let i = 0; i < w * h; i++) {
    if (clues[i] !== 0) continue;
    if (board[i] !== 0 && board[i] !== solution[i]) {
      out.push({ x: i % w, y: (i / w) | 0 });
    }
  }
  return out;
}

function flashLength(
  oldState: FillingState,
  newState_: FillingState,
  _dir: number,
  _ui: FillingUi,
): number {
  if (
    !oldState.completed &&
    newState_.completed &&
    !oldState.cheated &&
    !newState_.cheated
  ) {
    return FLASH_TIME;
  }
  return 0;
}

export const fillingGame: Game<
  FillingParams,
  FillingState,
  FillingMove,
  FillingUi,
  FillingDrawState,
  FillingMistake
> = {
  id: "filling",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  newDesc: (p: FillingParams, rng: RandomState) => newFillingDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,

  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: FillingParams, ts: number): Size => computeSize(p.w, p.h, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw: redrawFilling,

  flashLength,
};

registerGame(fillingGame);
