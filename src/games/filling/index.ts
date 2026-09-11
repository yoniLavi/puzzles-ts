/**
 * Filling (Fillomino) — port of `filling.c`. Fill every cell with a number
 * `n` so that each maximal orthogonally-connected region of equal numbers
 * contains exactly `n` cells.
 *
 * Input is selection-based: left-click / left-drag (or the keyboard cursor
 * with multi-select) build a selection, then a digit key fills every selected
 * non-clue cell.
 */

import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { commonHintRefusal, DEDUCTION_EXHAUSTED } from "../../engine/hint-refusal.ts";
import { digitKeys } from "../../engine/key-labels.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  digitOf,
  ESCAPE,
  gridCursorMove,
  isCursorMove,
  isEraseKey,
  LEFT_BUTTON,
  LEFT_DRAG,
  newCursor,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { KeyLabel, Point, Size } from "../../engine/types.ts";
import { newFillingDesc } from "./generator.ts";
import { say } from "./hint-text.ts";
import {
  colors,
  computeSize,
  type FillingDrawState,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redrawFilling,
} from "./render.ts";
import { deduceHintPlan, type FillingHintReason, solveFilling } from "./solver.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  type FillingMove,
  type FillingParams,
  type FillingState,
  type FillingUi,
  newState,
  paramConfig,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(_state: FillingState): FillingUi {
  return { sel: null, cursor: newCursor(), keydragging: false };
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

/** Add cell `(x, y)` to the selection (if it isn't a clue). */
function selectCell(ui: FillingUi, state: FillingState, x: number, y: number): void {
  if (!ui.sel) ui.sel = new Set();
  const i = y * state.w + x;
  if (!state.clues[i]) ui.sel.add(i);
}

function interpretMove(
  state: FillingState,
  ui: FillingUi,
  ds: FillingDrawState,
  p: Point,
  rawButton: number,
): FillingMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h, clues, board } = state;
  const ts = ds.tilesize;
  const tx = Math.floor((p.x - Math.floor(ts / 2)) / ts);
  const ty = Math.floor((p.y - Math.floor(ts / 2)) / ts);

  if (button === LEFT_BUTTON || button === LEFT_DRAG) {
    if (button === LEFT_BUTTON) ui.sel = null;
    if (tx >= 0 && tx < w && ty >= 0 && ty < h) selectCell(ui, state, tx, ty);
    ui.cursor.visible = false;
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    ui.cursor.visible = true;
    const moved = gridCursorMove(button, ui.cursor.x, ui.cursor.y, w, h);
    if (moved) {
      ui.cursor.x = moved.x;
      ui.cursor.y = moved.y;
    }
    if (ui.keydragging) selectCell(ui, state, ui.cursor.x, ui.cursor.y);
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT) {
    if (!ui.cursor.visible) {
      ui.cursor.visible = true;
      return UI_UPDATE;
    }
    ui.keydragging = !ui.keydragging;
    if (ui.keydragging) selectCell(ui, state, ui.cursor.x, ui.cursor.y);
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT2) {
    if (!ui.cursor.visible) {
      ui.cursor.visible = true;
      return UI_UPDATE;
    }
    if (!ui.sel) ui.sel = new Set();
    ui.keydragging = false;
    const ci = ui.cursor.y * w + ui.cursor.x;
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

  // A digit (an erase key ≡ '0') fills the selection, or the cursor cell.
  const value = isEraseKey(button) ? 0 : digitOf(button);
  if (value === null) return null; // not a digit → unused
  if (value > (w === 2 && h === 2 ? 3 : Math.max(w, h))) return null;
  ui.keydragging = false;

  const cells: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const targeted =
      (ui.sel?.has(i) ?? false) ||
      (!ui.sel && ui.cursor.visible && ui.cursor.y * w + ui.cursor.x === i);
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
  return { ok: true, move: { type: "solve", board: board.join("") } };
}

/** Re-solve from the immutable clues and flag every player-filled cell whose
 * number contradicts the unique solution (the Check & Save divergence). */
function findMistakes(state: FillingState): readonly Point[] {
  const { w, h, board, clues } = state;
  const { solved, board: solution } = solveFilling(clues, w, h);
  if (!solved) return [];
  const out: Point[] = [];
  for (let i = 0; i < w * h; i++) {
    if (clues[i] === 0 && board[i] !== 0 && board[i] !== solution[i]) {
      out.push({ x: i % w, y: (i / w) | 0 });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

/** Highlight data for a Filling hint step. `cells` are the empty squares the
 * deduction forces (a single firing usually pins a group), ringed with no
 * digit drawn: the narration names the value ("the region of N", "a 1").
 * `value` is the forced number, read by `hintKeepTrack` and never drawn.
 * `area` is the deduction's evidence — the region it reasons about, or the
 * neighbors that pin a lonely or eliminated cell — outlined so the player
 * sees the reasoning, not just the conclusion. */
export interface FillingHint {
  cells: number[];
  value: number;
  area: number[];
}

/** Narrate *why* the squares are forced, per the technique that fired. `count`
 * is how many squares the step forces (singular vs plural wording). The words
 * are [`hint-text.ts`](./hint-text.ts)'s. */
function narrate(reason: FillingHintReason, count: number): string {
  const many = count > 1;
  switch (reason.kind) {
    case "growth":
      return say.growth(reason.n, reason.exact, many);
    case "blocked":
      return say.blocked(reason.n);
    case "lonely":
      return say.lonely;
    case "bitmap":
      return say.bitmap(reason.n);
  }
}

function hint(state: FillingState): HintResult<FillingMove, FillingHint> {
  const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
  if (refusal) return refusal;
  const plan = deduceHintPlan(state.board, state.w, state.h);
  if (plan.length === 0) return { ok: false, error: DEDUCTION_EXHAUSTED };
  const steps: HintStep<FillingMove, FillingHint>[] = plan.map((m) => ({
    move: { type: "set", cells: m.cells, value: m.value },
    explanation: narrate(m.reason, m.cells.length),
    highlights: { cells: m.cells, value: m.value, area: m.area },
  }));
  return { ok: true, steps };
}

/** Classify a player move against a (possibly multi-square) hint step. The
 * move must set the hinted value into a subset of the step's cells (and
 * nothing else): filling all of them completes the step, filling some keeps
 * it on track (the step shrinks so a later auto-hint fills only the rest),
 * and anything else drops the plan to recompute. */
function hintKeepTrack(
  m: FillingMove,
  step: HintStep<FillingMove, FillingHint>,
  _state: FillingState,
): HintTrackVerdict {
  if (m.type !== "set") return "off";
  const t = step.highlights;
  if (!t || m.value !== t.value) return "off";
  if (!m.cells.every((c) => t.cells.includes(c))) return "off"; // touched a non-target
  const filled = new Set(m.cells);
  const remaining = t.cells.filter((c) => !filled.has(c));
  if (remaining.length === t.cells.length) return "off"; // hit none of the targets
  if (remaining.length === 0) return "completed";
  // Partial progress: shrink the step to the squares still to fill.
  step.highlights = { ...t, cells: remaining };
  step.move = { type: "set", cells: remaining, value: t.value };
  return "onTrack";
}

export const fillingGame: Game<
  FillingParams,
  FillingState,
  FillingMove,
  FillingUi,
  FillingDrawState,
  Point
> = {
  id: "filling",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  // Selection is a left press or a left drag across a run of cells, and the
  // secondary button has no meaning, so a held press must not be promoted
  // into one: that would kill the drag mid-gesture.
  ignoresSecondaryButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig,

  newDesc: newFillingDesc,
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve,
  hint,
  hintKeepTrack,
  findMistakes,
  // Upstream's keypad is a fixed 1..9 (region sizes never exceed 9).
  requestKeys: (): KeyLabel[] => digitKeys(9),

  textFormat,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: FillingParams, ts: number): Size => computeSize(p.w, p.h, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw: redrawFilling,

  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(fillingGame);
