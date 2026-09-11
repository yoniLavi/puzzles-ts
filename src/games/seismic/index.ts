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
  digitOf,
  gridCursorMove,
  isCursorMove,
  isEraseKey,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
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
  DIFF_EASY,
  DIFF_NAMES,
  DIFF_NORMAL,
  DIFFCOUNT,
  decodeParams,
  defaultParams,
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

/** A player marking that contradicts the unique solution: a wrong placed number
 * (`"cell"`), or an empty cell whose notes have crossed out its solution number
 * (`"note"` — notes are first-class markings, docs/games/mechanics.md § "Pencil
 * marks: the full note-taking UX"). */
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
  const { w, h, grid, flags, pencil, dsf } = state;
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

  // `0` clears, like the erase keys.
  const isClear = button === CURSOR_SELECT2 || isEraseKey(button);
  const n = isClear ? 0 : digitOf(button);
  if (ui.cursor.visible && n !== null) {
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
  // Fill-only, like upstream's `M`, not the adaptive fill-then-clean the square
  // Latin games use: `adaptiveMarkAllMove` assumes a square board with
  // candidates capped at `w`, while Seismic's candidates are per region.
  if (button === 0x4d || button === 0x6d) {
    // The fill is additive, so the gate is "some empty cell has *no* notes" —
    // not "some cell differs from its region's full set", which would keep
    // emitting a move that changes nothing (an undo entry per press).
    for (let i = 0; i < w * h; i++) {
      if (grid[i] === 0 && pencil[i] === 0) return { type: "pencilAll" };
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
        if (move.n === 0) next.pencil[i] = 0;
        else next.pencil[i] ^= numBit(move.n);
      } else {
        next.grid[i] = move.n;
      }
      // `validateGame` also refreshes the live error flags, which upstream does
      // after a pencil change too.
      if (validateGame(next) === STATUS_COMPLETE) next.completed = true;
      return next;
    }
    case "pencilAll": {
      // Additive — fill only note-less empty cells, never reset a narrowed one:
      // `candidate-hint.ts`'s `adaptiveMarkAll` § "The additive rule, stated once".
      // The mask is per-cell here: a region's size decides its candidates.
      for (let i = 0; i < w * h; i++) {
        if (next.grid[i] === 0 && next.pencil[i] === 0) {
          next.pencil[i] = areaBits(dsf.size(i));
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
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & numBit(soln[i]))) {
      out.push({ kind: "note", x, y });
    }
  }
  return out;
}

// --- the game --------------------------------------------------------------

/** Seismic's difficulty contract (`engine/difficulty.ts`). A board `newState`
 * deals holds only its givens, and — as `solveFromGivens` records — a grid the
 * solver completes was forced the whole way, so there is no separate ambiguity
 * verdict to consult. */
const difficulty: DifficultyContract<SeismicParams> = {
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) =>
    solveGame(newState(p, desc), cap) === SOLVE_FAILED ? "unsolved" : "solved",
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
      get: (p) => p.diff,
      set: (p, v) => {
        p.diff = v === DIFF_NORMAL ? DIFF_NORMAL : DIFF_EASY;
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
  describeParams: (p) => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: p.diff,
    "game-mode": p.mode,
  }),

  newDesc: (p, rng) => newSeismicDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status: (state) => (state.completed ? "solved" : "ongoing"),

  solve,
  difficulty,
  findMistakes,
  // Sized to the regions the generator *makes*, not the nine the format admits:
  // entry is capped at the cell's region size, so a digit no region can hold is
  // a button that does nothing — and on touch the panel is the only way to type.
  requestKeys: (p) => digitKeys(maxGeneratedRegionSize(p.mode)),
  textFormat,

  prefs: [stickyPencilPref<SeismicUi>(), pencilKeepHighlightPref<SeismicUi>()],

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(seismicGame);
