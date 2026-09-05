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

import { assertNever } from "../../engine/assert-never.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { digitKeys } from "../../engine/key-labels.ts";
import {
  pressNoteTakingCell,
  releaseHighlightAfterEntry,
} from "../../engine/note-taking-cell.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  pencilKeepHighlightPref,
  stickyPencilPref,
} from "../../engine/pencil-prefs.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  isEraseKey,
  stripModifiers,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type {
  Color,
  ConfigValues,
  GameStatus,
  KeyLabel,
  Point,
  Size,
} from "../../engine/types.ts";
import { maxGeneratedRegionSize, newSeismicDesc } from "./generator.ts";
import {
  colors,
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
 *   cell's solution number (docs/games/mechanics.md § "Pencil marks: the full note-taking UX": notes are first-class markings). */
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

function interpretMove(
  state: SeismicState,
  ui: SeismicUi,
  ds: SeismicDrawState,
  p: Point,
  rawButton: number,
): SeismicMove | null | UiUpdate {
  const { w, h, grid, flags, marks, dsf } = state;
  const ts = ds.tilesize;
  const button = stripModifiers(rawButton);

  const gx = fromCoord(p.x, ts);
  const gy = fromCoord(p.y, ts);

  if (
    gx >= 0 &&
    gx < w &&
    gy >= 0 &&
    gy < h &&
    pressNoteTakingCell(ui, button, gx, gy, {
      canEnter: !(flags[gy * w + gx] & FM_FIXED),
      canMark: grid[gy * w + gx] === 0,
    })
  ) {
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.cursor.x, ui.cursor.y, w, h) ?? {
      x: ui.cursor.x,
      y: ui.cursor.y,
    };
    ui.cursor.x = moved.x;
    ui.cursor.y = moved.y;
    ui.cursor.visible = true;
    ui.cursorFromKeyboard = true;
    return UI_UPDATE;
  }

  if (ui.cursor.visible && button === CURSOR_SELECT) {
    ui.pencilMode = !ui.pencilMode;
    ui.cursorFromKeyboard = true;
    return UI_UPDATE;
  }

  const isDigit = button >= 0x31 && button <= 0x39; // '1'..'9'
  const isClear = button === CURSOR_SELECT2 || isEraseKey(button) || button === 0x30;
  if (ui.cursor.visible && (isDigit || isClear)) {
    const n = isDigit ? button - 0x30 : 0;
    const i = ui.cursor.y * w + ui.cursor.x;

    // Entry is capped at the cell's region size — the interface simply refuses a
    // number the region could never hold (upstream's stated design choice).
    if (n > dsf.size(i)) return null;
    // A filled square can't take a pencil mark (reachable via the cursor).
    if (ui.pencilMode && grid[i] !== 0) return null;
    // Re-entering the number already there changes nothing.
    if (!ui.pencilMode && grid[i] === n) return null;
    if (flags[i] & FM_FIXED) return null;

    // A mouse-driven entry puts the highlight away; a keyboard one keeps it.
    releaseHighlightAfterEntry(ui);
    return { type: "set", x: ui.cursor.x, y: ui.cursor.y, n, pencil: ui.pencilMode };
  }

  // 'M' / 'm': fill every empty cell's notes with its region's candidates.
  //
  // Deliberately *fill-only*, not the adaptive fill-then-clean variant the
  // square Latin games use (docs/games/mechanics.md § "Pencil marks: the full note-taking UX"). The shared
  // `adaptiveMarkAllMove`/`obviousCandidateMarks` helper is written for a square
  // board — it walks `w * w` cells and caps candidates at `w` — whereas Seismic's
  // grid is rectangular and its candidate range is per *region*. Widening a
  // helper five games share for this one game is not worth it; upstream's `M` is
  // fill-only too, so this is also the C's behavior.
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
    default:
      return assertNever(move, "seismic: executeMove");
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

/** Seismic's difficulty contract (`engine/difficulty.ts`). `solveGame` returns
 * the difficulty actually needed, or `SOLVE_FAILED` when the board did not come
 * out complete and valid — and, as `solveFromGivens` records, a valid grid was
 * forced the whole way, so there is no separate ambiguity verdict to consult.
 * Non-fixed cells are cleared first so the player's entries never count. */
const difficulty: DifficultyContract<SeismicParams> = {
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const board = cloneState(newState(p, desc));
    for (let i = 0; i < board.w * board.h; i++) {
      if (!(board.flags[i] & FM_FIXED)) board.grid[i] = 0;
    }
    return solveGame(board, cap) === SOLVE_FAILED ? "unsolved" : "solved";
  },
};

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

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  paramConfig: [
    ...dimensionParamConfig<SeismicParams>(),
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
  difficulty,
  findMistakes,
  // Tectonic's regions are always five cells, so five is the widest number it
  // can ever want; Seismic allows regions up to nine.
  // Sized to what the generator *makes*, not to what the format admits: entry
  // is capped at the cell's region size, so a digit no region can hold is a
  // button that does nothing — and on touch the panel is the only way to type.
  requestKeys: (p): KeyLabel[] => digitKeys(maxGeneratedRegionSize(p.mode)),
  textFormat,

  prefs: [stickyPencilPref<SeismicUi>(), pencilKeepHighlightPref<SeismicUi>()],

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
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
