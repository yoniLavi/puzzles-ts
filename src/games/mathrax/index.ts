/**
 * Mathrax — native TS port of `puzzles/unreleased/mathrax.c` (© 2019 Lennard
 * Sprong). Fill an `o × o` grid with digits `1..o`, no repeat in any row or
 * column, so that every clue sitting on an interior grid intersection holds: an
 * arithmetic clue means the operation gives the same result on both diagonal
 * pairs, `=` means each diagonal pair is equal, and `E`/`O` mean all four
 * surrounding digits are even / odd.
 *
 * Controls follow the Solo/Keen family: left-click (or the cursor) highlights a
 * cell for a real entry, right-click toggles pencil mode, a digit enters or
 * pencil-toggles that value, and backspace/space/`0` clears. Contradictions
 * highlight red live; Check & Save additionally flags entries and notes that
 * contradict the unique solution.
 */

import { assertNever } from "../../engine/assert-never.ts";
import { adaptiveMarkAllMove } from "../../engine/candidate-hint.ts";
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
import { rowColRegions } from "../../engine/latin-hint.ts";
import {
  pressNoteTakingCell,
  releaseHighlightAfterEntry,
} from "../../engine/note-taking-cell.ts";
import { parseConfigInt } from "../../engine/params.ts";
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
import { newMathraxDesc } from "./generator.ts";
import {
  colors,
  computeSize,
  FLASH_TIME,
  fromCoord,
  type MathraxDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  mathraxSolve,
  SOLVE_AMBIGUOUS,
  SOLVE_IMPOSSIBLE,
  SOLVE_UNIQUE,
} from "./solver.ts";
import {
  cloneState,
  DIFF_NAMES,
  DIFF_RECURSIVE,
  decodeParams,
  defaultParams,
  diffFromLevel,
  diffName,
  diffToLevel,
  encodeParams,
  F_IMMUTABLE,
  type MathraxMove,
  type MathraxParams,
  type MathraxState,
  type MathraxUi,
  mathraxValidate,
  newState,
  newUi,
  OPTION_ADD,
  OPTION_DIV,
  OPTION_EQL,
  OPTION_MUL,
  OPTION_ODD,
  OPTION_SUB,
  OPTIONSMASK,
  STATUS_COMPLETE,
  status,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player marking that contradicts the unique solution:
 * - `"cell"` — a filled-in digit that is wrong;
 * - `"note"` — an empty cell whose non-empty pencil notes have crossed out the
 *   cell's solution digit
 *   (docs/games/mechanics.md § "Pencil marks: the full note-taking UX"). */
export interface MathraxMistake extends Point {
  kind: "cell" | "note";
}

// --- presets ---------------------------------------------------------------

const PRESETS: MathraxParams[] = [
  { o: 5, diff: "easy", options: OPTIONSMASK },
  { o: 5, diff: "normal", options: OPTIONSMASK },
  { o: 5, diff: "tricky", options: OPTIONSMASK },
  { o: 6, diff: "easy", options: OPTIONSMASK },
  { o: 6, diff: "normal", options: OPTIONSMASK },
  { o: 6, diff: "tricky", options: OPTIONSMASK },
  { o: 7, diff: "normal", options: OPTIONSMASK },
  { o: 8, diff: "normal", options: OPTIONSMASK },
  { o: 9, diff: "normal", options: OPTIONSMASK },
];

function presets(): PresetMenu<MathraxParams> {
  return {
    title: "Mathrax",
    submenu: PRESETS.map((p) => ({
      title: `${p.o}x${p.o} ${diffName(p.diff)}`,
      params: p,
    })),
  };
}

// --- input -----------------------------------------------------------------

function interpretMove(
  state: MathraxState,
  ui: MathraxUi,
  ds: MathraxDrawState,
  p: Point,
  rawButton: number,
): MathraxMove | null | UiUpdate {
  const o = state.params.o;
  const ts = ds.tileSize;
  const button = stripModifiers(rawButton);

  const gx = fromCoord(p.x, ts);
  const gy = fromCoord(p.y, ts);

  if (
    gx >= 0 &&
    gx < o &&
    gy >= 0 &&
    gy < o &&
    pressNoteTakingCell(ui, button, gx, gy, {
      canEnter: !(state.flags[gy * o + gx] & F_IMMUTABLE),
      canMark: state.grid[gy * o + gx] === 0,
    })
  ) {
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.cursor.x, ui.cursor.y, o, o);
    if (moved) {
      ui.cursor.x = moved.x;
      ui.cursor.y = moved.y;
    }
    ui.cursor.visible = true;
    ui.cursorFromKeyboard = true;
    return UI_UPDATE;
  }

  if (ui.cursor.visible && button === CURSOR_SELECT) {
    ui.pencilMode = !ui.pencilMode;
    ui.cursorFromKeyboard = true;
    return UI_UPDATE;
  }

  // Digit entry. Space (`CURSOR_SELECT2`), backspace/delete and `0` clear;
  // upstream binds only `'\b'`, which this frontend never sends.
  const isClear = button === CURSOR_SELECT2 || isEraseKey(button);
  const c = isClear ? 0 : digitOf(button);
  if (ui.cursor.visible && c !== null) {
    const i = ui.cursor.y * o + ui.cursor.x;

    if (c > o) return null;
    // A filled square can't take a pencil mark (reachable via the cursor).
    if (ui.pencilMode && state.grid[i] !== 0) return null;
    // Re-entering the digit already there changes nothing.
    if (!ui.pencilMode && state.grid[i] === c) {
      if (ui.cursorFromKeyboard) return null;
      ui.cursor.visible = false;
      return UI_UPDATE;
    }
    if (state.flags[i] & F_IMMUTABLE) return null;

    releaseHighlightAfterEntry(ui);
    return { type: "set", x: ui.cursor.x, y: ui.cursor.y, n: c, pencil: ui.pencilMode };
  }

  // 'M' / 'm': adaptive mark-all
  // (docs/games/mechanics.md § "Pencil marks: the full note-taking UX").
  // Mathrax's uniqueness regions are exactly the row and the column; a clue is
  // *not* one.
  if (button === 77 || button === 109) {
    return adaptiveMarkAllMove<MathraxMove>(state.grid, state.pencil, o, (x, y) =>
      rowColRegions(x, y, o),
    );
  }

  return null;
}

// --- moves -----------------------------------------------------------------

function executeMove(state: MathraxState, move: MathraxMove): MathraxState {
  const o = state.params.o;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * o + move.x;
      if (state.flags[i] & F_IMMUTABLE) throw new Error("mathrax: cell is a given");
      if (move.pencil) {
        if (move.n === 0) next.pencil[i] = 0;
        else next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
      }
      // Upstream recomputes the live error flags (and the completion test) after
      // *both* a real entry and a pencil change.
      if (mathraxValidate(o, next.grid, next.clues, next.flags) === STATUS_COMPLETE) {
        next.completed = true;
      }
      return next;
    }
    case "pencilAll": {
      const all = (1 << (o + 1)) - (1 << 1); // bits 1..o
      // Additive — fill only note-less empty cells, never reset a narrowed one:
      // `candidate-hint.ts`'s `adaptiveMarkAll` § "The additive rule, stated once".
      for (let i = 0; i < o * o; i++) {
        if (!next.grid[i] && next.pencil[i] === 0) next.pencil[i] = all;
      }
      return next;
    }
    case "pencilStrike": {
      for (const { x, y, n } of move.marks) next.pencil[y * o + x] &= ~(1 << n);
      return next;
    }
    case "solve": {
      for (let i = 0; i < o * o; i++) {
        if (!(next.flags[i] & F_IMMUTABLE)) {
          next.grid[i] = move.grid[i];
          next.pencil[i] = 0;
        }
      }
      next.completed =
        mathraxValidate(o, next.grid, next.clues, next.flags) === STATUS_COMPLETE;
      next.cheated = next.completed;
      return next;
    }
    default:
      return assertNever(move, "mathrax: executeMove");
  }
}

// --- solving ---------------------------------------------------------------

/** A fresh grid holding only the givens, for the solver to fill. */
const givens = (s: MathraxState): Uint8Array =>
  s.grid.map((d, i) => (s.flags[i] & F_IMMUTABLE ? d : 0));

/**
 * Solve from the givens alone into a fresh grid. Derives the answer from the
 * placed givens only — never from the player's notes, since a note can be wrong
 * and that is exactly what `findMistakes` is checking.
 *
 * `requireUnique` separates the two callers. `findMistakes` needs a *unique*
 * answer: with several solutions, a cell differing from the one we happened to
 * find is not a mistake. `solve` does not — any complete valid grid is a
 * legitimate answer to show, which keeps Solve working on the ambiguous boards
 * an upstream-generated `Recursive` game ID still describes (see the
 * divergence note in `generator.ts`).
 */
function solveFromGivens(
  state: MathraxState,
  requireUnique: boolean,
): Uint8Array | null {
  const grid = givens(state);
  const verdict = mathraxSolve(state.params.o, grid, state.clues, DIFF_RECURSIVE);
  const ok = requireUnique
    ? verdict === SOLVE_UNIQUE
    : verdict === SOLVE_UNIQUE || verdict === SOLVE_AMBIGUOUS;
  return ok ? grid : null;
}

function solve(orig: MathraxState): SolveResult<MathraxMove> {
  const soln = solveFromGivens(orig, false);
  if (!soln) return { ok: false, error: "No solution exists for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(soln) } };
}

function findMistakes(state: MathraxState): readonly MathraxMistake[] {
  const o = state.params.o;
  const soln = solveFromGivens(state, true);
  if (!soln) return [];

  const out: MathraxMistake[] = [];
  for (let i = 0; i < o * o; i++) {
    const x = i % o;
    const y = (i / o) | 0;
    if (state.grid[i]) {
      if (state.grid[i] !== soln[i]) out.push({ kind: "cell", x, y });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & (1 << soln[i]))) {
      // Notes are first-class markings: crossing the solution digit out of a
      // cell is as wrong as writing the wrong digit in it.
      out.push({ kind: "note", x, y });
    }
  }
  return out;
}

// --- the game --------------------------------------------------------------

/** The six clue-type checkboxes, in the Custom dialog's (and the description
 * summary's) order. The `kw`s are upstream's config-name slugs, which
 * `augmentation.ts`'s Mathrax summary reads. */
const CLUE_OPTIONS: ReadonlyArray<{ kw: string; name: string; bit: number }> = [
  { kw: "addition-clues", name: "Addition clues", bit: OPTION_ADD },
  { kw: "subtraction-clues", name: "Subtraction clues", bit: OPTION_SUB },
  { kw: "multiplication-clues", name: "Multiplication clues", bit: OPTION_MUL },
  { kw: "division-clues", name: "Division clues", bit: OPTION_DIV },
  { kw: "equality-clues", name: "Equality clues", bit: OPTION_EQL },
  { kw: "even-odd-clues", name: "Even/odd clues", bit: OPTION_ODD },
];

/** Mathrax's difficulty contract (`engine/difficulty.ts`). `mathraxSolve` has
 * its own four-way return (`SOLVE_IMPOSSIBLE` / `SOLVE_STUCK` / `SOLVE_UNIQUE` /
 * `SOLVE_AMBIGUOUS`) rather than the latin-family sentinels its solver is built
 * on, so it is read here and not by `latinVerdict`. The solve starts from the
 * board's givens: a blank grid would make every board unsolvable at every cap. */
const difficulty: DifficultyContract<MathraxParams> = {
  tierOf: (p) => diffToLevel(p.diff),
  withTier: (p, tier) => ({ ...p, diff: diffFromLevel(tier) }),
  solveAtCap: (p, desc, cap) => {
    const s = newState(p, desc);
    const ret = mathraxSolve(p.o, givens(s), s.clues, cap);
    if (ret === SOLVE_UNIQUE) return "solved";
    return ret === SOLVE_IMPOSSIBLE ? "impossible" : "unsolved";
  },
};

export const mathraxGame: Game<
  MathraxParams,
  MathraxState,
  MathraxMove,
  MathraxUi,
  MathraxDrawState,
  MathraxMistake
> = {
  id: "mathrax",
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

  paramConfig: [
    {
      kw: "size",
      name: "Size",
      type: "string",
      get: (p) => String(p.o),
      set: (p, v) => {
        p.o = parseConfigInt(v);
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
    ...CLUE_OPTIONS.map(({ kw, name, bit }) => ({
      kw,
      name,
      type: "boolean" as const,
      get: (p: MathraxParams) => (p.options & bit) !== 0,
      set: (p: MathraxParams, v: boolean) => {
        p.options = v ? p.options | bit : p.options & ~bit;
      },
    })),
  ],
  describeParams: (p) => ({
    size: String(p.o),
    difficulty: diffToLevel(p.diff),
    ...Object.fromEntries(
      CLUE_OPTIONS.map(({ kw, bit }) => [kw, p.options & bit ? 1 : 0]),
    ),
  }),

  newDesc: (p, rng) => newMathraxDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  difficulty,
  findMistakes,
  requestKeys: (p) => digitKeys(p.o),

  prefs: [stickyPencilPref<MathraxUi>(), pencilKeepHighlightPref<MathraxUi>()],

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(mathraxGame);
