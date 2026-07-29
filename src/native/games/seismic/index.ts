/**
 * Seismic — native TS port of `puzzles/unreleased/seismic.c` (© 2013 Lennard
 * Sprong). The grid is divided into regions; a region of `N` cells holds one
 * each of `1..N`, and two equal numbers are kept apart — at least `Z` cells
 * between two `Z`s along a row or column in **Seismic** (Hakyuu / Ripple Effect)
 * mode, or never even diagonally adjacent in **Tectonic** mode.
 *
 * Controls follow the Solo/Keen family: left-click (or the cursor keys)
 * highlights a cell for a real entry, right-click switches to pencil marks, a
 * digit enters or toggles that value, and backspace/space/`0` clears. Entry is
 * capped at the cell's own region size, so an out-of-range number cannot be
 * typed at all. Rule violations redden live; Check & Save additionally flags
 * entries — and notes — that contradict the unique solution.
 */

import type {
  Colour,
  ConfigValues,
  GameStatus,
  KeyLabel,
  Point,
  Size,
} from "../../../puzzle/types.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { digitKeys } from "../../engine/key-labels.ts";
import { parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newSeismicDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SeismicDrawState,
  setTileSize,
} from "./render.ts";
import { SOLVE_FAILED, STATUS_COMPLETE, solveGame, validateGame } from "./solver.ts";
import {
  areaBits,
  cloneState,
  DIFF_NAMES,
  DIFFCOUNT,
  decodeParams,
  defaultParams,
  diffFromLevel,
  diffToLevel,
  encodeParams,
  FM_FIXED,
  MODE_NAMES,
  MODE_SEISMIC,
  MODE_TECTONIC,
  newState,
  newUi,
  numBit,
  PRESETS,
  presetName,
  type SeismicMove,
  type SeismicParams,
  type SeismicState,
  type SeismicUi,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player marking that contradicts the unique solution:
 * - `"cell"` — a placed number that is wrong;
 * - `"note"` — an empty cell whose non-empty pencil notes have crossed out the
 *   cell's solution number (playbook §3.7: notes are first-class markings). */
export interface SeismicMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
}

// --- presets ---------------------------------------------------------------

function presets(): PresetMenu<SeismicParams> {
  return {
    title: "Seismic",
    submenu: PRESETS.map((p) => ({ title: presetName(p), params: { ...p } })),
  };
}

// --- input -----------------------------------------------------------------

/** ASCII backspace and delete. Upstream binds only `'\b'`, but the web frontend
 * delivers Delete as 127 and there is nothing else it could mean here. */
const BACKSPACE = 8;
const DELETE = 127;

function interpretMove(
  state: SeismicState,
  ui: SeismicUi,
  ds: SeismicDrawState | null,
  p: Point,
  rawButton: number,
): SeismicMove | null | UiUpdate {
  const { w, h, grid, flags, marks, dsf } = state;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const button = stripModifiers(rawButton);

  const gx = fromCoord(p.x, ts);
  const gy = fromCoord(p.y, ts);

  if (gx >= 0 && gx < w && gy >= 0 && gy < h) {
    const i = gy * w + gx;

    if (button === LEFT_BUTTON) {
      // Sticky pencil mode (fork, playbook §3.7): a left-click only moves the
      // highlight and keeps the current mode; upstream (sticky off) reverts to
      // real entry.
      if (
        ui.cshow &&
        ui.hx === gx &&
        ui.hy === gy &&
        (ui.pencilSticky || !ui.cpencil)
      ) {
        ui.cshow = false;
      } else {
        ui.hx = gx;
        ui.hy = gy;
        ui.cshow = true;
        if (!ui.pencilSticky) ui.cpencil = false;
      }
      // A given can't be edited, so never leave it highlighted.
      if (flags[i] & FM_FIXED) ui.cshow = false;
      ui.ckey = false;
      return UI_UPDATE;
    }

    if (button === RIGHT_BUTTON) {
      if (ui.pencilSticky) {
        // Toggle the persistent pencil mode, and only move the highlight onto a
        // cell that can actually take a mark.
        ui.cpencil = !ui.cpencil;
        if (grid[i] === 0) {
          ui.hx = gx;
          ui.hy = gy;
          ui.cshow = true;
        }
      } else {
        if (!ui.cshow || !ui.cpencil || ui.hx !== gx || ui.hy !== gy) {
          ui.hx = gx;
          ui.hy = gy;
          ui.cpencil = true;
          ui.cshow = true;
        } else {
          ui.cshow = false;
        }
        // A cell that already holds a number can't take a mark.
        if (grid[i] !== 0) ui.cshow = false;
      }
      ui.ckey = false;
      return UI_UPDATE;
    }
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.hx, ui.hy, w, h) ?? { x: ui.hx, y: ui.hy };
    ui.hx = moved.x;
    ui.hy = moved.y;
    ui.cshow = true;
    ui.ckey = true;
    return UI_UPDATE;
  }

  if (ui.cshow && button === CURSOR_SELECT) {
    ui.cpencil = !ui.cpencil;
    ui.ckey = true;
    return UI_UPDATE;
  }

  const isDigit = button >= 0x31 && button <= 0x39; // '1'..'9'
  const isClear =
    button === CURSOR_SELECT2 ||
    button === BACKSPACE ||
    button === DELETE ||
    button === 0x30; // '0'
  if (ui.cshow && (isDigit || isClear)) {
    const n = isDigit ? button - 0x30 : 0;
    const i = ui.hy * w + ui.hx;

    // Entry is capped at the cell's region size — the interface simply refuses a
    // number the region could never hold (upstream's stated design choice).
    if (n > dsf.size(i)) return null;
    // A filled square can't take a pencil mark (reachable via the cursor).
    if (ui.cpencil && grid[i] !== 0) return null;
    // Re-entering the number already there changes nothing.
    if (!ui.cpencil && grid[i] === n) return null;
    if (flags[i] & FM_FIXED) return null;

    // A mouse-driven entry puts the highlight away; a keyboard one keeps it.
    if (!ui.ckey && !ui.cpencil) ui.cshow = false;
    return { type: "set", x: ui.hx, y: ui.hy, n, pencil: ui.cpencil };
  }

  // 'M' / 'm': fill every empty cell's notes with its region's candidates.
  //
  // Deliberately *fill-only*, not the adaptive fill-then-clean variant the
  // square Latin games use (playbook §3.7). The shared
  // `adaptiveMarkAllMove`/`obviousCandidateMarks` helper is written for a square
  // board — it walks `w * w` cells and caps candidates at `w` — whereas Seismic's
  // grid is rectangular and its candidate range is per *region*. Widening a
  // helper five games share for this one game is not worth it; upstream's `M` is
  // fill-only too, so this is also the C's behaviour.
  if (button === 0x4d || button === 0x6d) {
    // The fill is additive, so the gate is "some empty cell has *no* notes" —
    // not "some cell differs from its region's full set", which would keep
    // emitting a move that changes nothing (an undo entry per press).
    for (let i = 0; i < w * h; i++) {
      if (grid[i] === 0 && marks[i] === 0) return { type: "pencilAll" };
    }
  }

  return null;
}

// --- moves -----------------------------------------------------------------

function executeMove(state: SeismicState, move: SeismicMove): SeismicState {
  const { w, h, dsf } = state;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * w + move.x;
      if (state.flags[i] & FM_FIXED) throw new Error("seismic: cell is a given");
      if (move.pencil) {
        if (move.n === 0) next.marks[i] = 0;
        else next.marks[i] ^= numBit(move.n);
      } else {
        next.grid[i] = move.n;
      }
      // Upstream refreshes the live error flags (and re-tests completion) after
      // both a real entry and a pencil change.
      if (validateGame(next) === STATUS_COMPLETE) next.completed = true;
      return next;
    }
    case "pencilAll": {
      // **Additive**: fill only the cells that have no notes yet, never reset one
      // the player has narrowed (owner-reported on Salad, 2026-07-29 — resetting
      // threw away their own deductions). `adaptiveMarkAll`'s contract always said
      // "fill every *note-less* empty cell".
      for (let i = 0; i < w * h; i++) {
        if (next.grid[i] === 0 && next.marks[i] === 0) {
          next.marks[i] = areaBits(dsf.size(i));
        }
      }
      return next;
    }
    case "solve": {
      for (let i = 0; i < w * h; i++) {
        if (!(next.flags[i] & FM_FIXED)) next.grid[i] = move.grid[i];
      }
      next.completed = validateGame(next) === STATUS_COMPLETE;
      next.cheated = next.completed;
      return next;
    }
  }
}

function status(state: SeismicState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

// --- solving ---------------------------------------------------------------

/**
 * Solve from the **givens alone**, never from the player's entries or notes — a
 * note can be wrong, and that is exactly what `findMistakes` is checking.
 *
 * Seismic's solver backtracks at no rung, so a board it drives to a complete
 * valid grid was *forced* the whole way: the answer it returns is the unique
 * one, and there is no separate ambiguity verdict to consult.
 */
function solveFromGivens(state: SeismicState): Uint8Array | null {
  const scratch = cloneState(state);
  for (let i = 0; i < state.w * state.h; i++) {
    if (!(scratch.flags[i] & FM_FIXED)) scratch.grid[i] = 0;
  }
  if (solveGame(scratch, DIFFCOUNT) === SOLVE_FAILED) return null;
  return scratch.grid;
}

function solve(orig: SeismicState): SolveResult<SeismicMove> {
  const soln = solveFromGivens(orig);
  if (!soln) return { ok: false, error: "No solution exists for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(soln) } };
}

function findMistakes(state: SeismicState): readonly SeismicMistake[] {
  const soln = solveFromGivens(state);
  if (!soln) return [];

  const out: SeismicMistake[] = [];
  for (let i = 0; i < state.w * state.h; i++) {
    const x = i % state.w;
    const y = (i / state.w) | 0;
    if (state.grid[i]) {
      if (state.grid[i] !== soln[i]) out.push({ kind: "cell", x, y });
    } else if (state.marks[i] !== 0 && !(state.marks[i] & numBit(soln[i]))) {
      out.push({ kind: "note", x, y });
    }
  }
  return out;
}

function flashLength(
  from: SeismicState,
  to: SeismicState,
  _dir: number,
  _ui: SeismicUi,
): number {
  return winFlash(from, to, FLASH_TIME);
}

// --- the game --------------------------------------------------------------

export const seismicGame: Game<
  SeismicParams,
  SeismicState,
  SeismicMove,
  SeismicUi,
  SeismicDrawState,
  SeismicMistake
> = {
  id: "seismic",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  canMarkAll: true,
  // The right button is pencil mode, so a touch frontend must surface a
  // secondary-action affordance.
  needsRightButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  paramConfig: [
    {
      kw: "width",
      name: "Width",
      type: "string",
      get: (p) => String(p.w),
      set: (p, v) => {
        p.w = parseConfigInt(v);
      },
    },
    {
      kw: "height",
      name: "Height",
      type: "string",
      get: (p) => String(p.h),
      set: (p, v) => {
        p.h = parseConfigInt(v);
      },
    },
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: [...DIFF_NAMES],
      get: (p) => diffToLevel(p.diff),
      set: (p, v) => {
        p.diff = diffFromLevel(v);
      },
    },
    {
      kw: "game-mode",
      name: "Game mode",
      type: "choices",
      choices: [...MODE_NAMES],
      get: (p) => p.mode,
      set: (p, v) => {
        p.mode = v === MODE_TECTONIC ? MODE_TECTONIC : MODE_SEISMIC;
      },
    },
  ],
  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: diffToLevel(p.diff),
    "game-mode": p.mode,
  }),

  newDesc: (p: SeismicParams, rng: RandomState) => newSeismicDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,
  // Tectonic's regions are always five cells, so five is the widest number it
  // can ever want; Seismic allows regions up to nine.
  requestKeys: (p): KeyLabel[] => digitKeys(p.mode === MODE_TECTONIC ? 5 : 9),
  textFormat,

  prefs: [
    {
      kw: "sticky-pencil-mode",
      name: "Right-click toggles a sticky pencil mode (stays on until right-clicked again)",
      type: "boolean",
      get: (ui) => ui.pencilSticky,
      set: (ui, v) => {
        ui.pencilSticky = v;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SeismicParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(seismicGame);

export { MODE_SEISMIC, MODE_TECTONIC };
