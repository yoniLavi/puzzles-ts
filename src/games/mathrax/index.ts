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
import { pressNoteTakingCell } from "../../engine/note-taking-cell.ts";
import { parseConfigInt } from "../../engine/params.ts";
import { stickyPencilPref } from "../../engine/pencil-prefs.ts";
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
 *   cell's solution digit (docs/games/mechanics.md § "Pencil marks: the full note-taking UX"). */
export interface MathraxMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
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
  const ts = ds.tilesize;
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
    const moved = gridCursorMove(button, ui.cursor.x, ui.cursor.y, o, o) ?? {
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

  // Digit entry / clear. `CURSOR_SELECT2` is the space bar; `isEraseKey` is
  // backspace/delete (upstream binds only `'\b'`, which this frontend never
  // sends — see `engine/pointer.ts`).
  const isDigit = button >= 49 && button <= 57; // '1'..'9'
  const isClear = button === CURSOR_SELECT2 || isEraseKey(button) || button === 48;
  if (ui.cursor.visible && (isDigit || isClear)) {
    const c = isDigit ? button - 48 : 0;
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

    if (!ui.cursorFromKeyboard && !ui.pencilMode) ui.cursor.visible = false;
    return { type: "set", x: ui.cursor.x, y: ui.cursor.y, n: c, pencil: ui.pencilMode };
  }

  // 'M' / 'm': fill every empty cell's notes, then — on an already-noted board —
  // strike the candidates already placed in that cell's row or column
  // (docs/games/mechanics.md § "Pencil marks: the full note-taking UX"'s adaptive mark-all). Mathrax's uniqueness regions are
  // exactly the row and the column; a clue is *not* a uniqueness region.
  if (button === 77 || button === 109) {
    return adaptiveMarkAllMove<MathraxMove>(state.grid, state.marks, o, (x, y) =>
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
        if (move.n === 0) next.marks[i] = 0;
        else next.marks[i] ^= 1 << move.n;
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
      // **Additive**: fill only the cells that have no notes yet, never reset one
      // the player has narrowed. Resetting threw away their own deductions on any
      // board with some penciled cells and some blank ones (owner-reported on
      // Salad, 2026-07-29); `adaptiveMarkAll`'s contract always said "fill every
      // *note-less* empty cell" — this is the games catching up with it.
      for (let i = 0; i < o * o; i++) {
        if (!next.grid[i] && next.marks[i] === 0) next.marks[i] = all;
      }
      return next;
    }
    case "pencilStrike": {
      for (const { x, y, n } of move.marks) next.marks[y * o + x] &= ~(1 << n);
      return next;
    }
    case "solve": {
      for (let i = 0; i < o * o; i++) {
        if (!(next.flags[i] & F_IMMUTABLE)) {
          next.grid[i] = move.grid[i];
          next.marks[i] = 0;
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
  const o = state.params.o;
  const grid = new Uint8Array(o * o);
  for (let i = 0; i < o * o; i++)
    if (state.flags[i] & F_IMMUTABLE) grid[i] = state.grid[i];
  const verdict = mathraxSolve(o, grid, state.clues, DIFF_RECURSIVE);
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
    } else if (state.marks[i] !== 0 && !(state.marks[i] & (1 << soln[i]))) {
      // Notes are first-class markings: crossing the solution digit out of a
      // cell is as wrong as writing the wrong digit in it.
      out.push({ kind: "note", x, y });
    }
  }
  return out;
}

function flashLength(
  from: MathraxState,
  to: MathraxState,
  _dir: number,
  _ui: MathraxUi,
): number {
  return winFlash(from, to, FLASH_TIME);
}

// --- the game --------------------------------------------------------------

/** The six clue-type checkboxes, in the Custom dialog's (and the description
 * summary's) order. The `kw`s are the C config-name slugs, so the TS and C
 * builds present the identical form and `augmentation.ts`'s Mathrax summary
 * reads the keys it expects. */
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
 * on, so it is read here and not by `latinVerdict`.
 *
 * **The grid must be seeded from the `F_IMMUTABLE` givens.** Mathrax boards do
 * carry given digits, and the first version of this adapter passed a blank grid
 * — which makes every board unsolvable at every cap. The cross-game guard
 * caught it on its first run, which is exactly the "an adapter that lies makes a
 * guard pass vacuously" risk the contract's design named. `solveFromGivens` does
 * the same seeding for `solve` and `findMistakes`. */
const difficulty: DifficultyContract<MathraxParams> = {
  tierOf: (p) => diffToLevel(p.diff),
  withTier: (p, tier) => ({ ...p, diff: diffFromLevel(tier) }),
  solveAtCap: (p, desc, cap) => {
    const s = newState(p, desc);
    const o = s.params.o;
    const grid = new Uint8Array(o * o);
    for (let i = 0; i < o * o; i++) if (s.flags[i] & F_IMMUTABLE) grid[i] = s.grid[i];
    const ret = mathraxSolve(o, grid, s.clues, cap);
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
  describeParams: (p): ConfigValues => ({
    size: String(p.o),
    difficulty: diffToLevel(p.diff),
    ...Object.fromEntries(
      CLUE_OPTIONS.map(({ kw, bit }) => [kw, p.options & bit ? 1 : 0]),
    ),
  }),

  newDesc: (p, rng: RandomState) => newMathraxDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status: (s): GameStatus => status(s),

  solve,
  difficulty,
  findMistakes,
  requestKeys: (p): KeyLabel[] => digitKeys(p.o),

  prefs: [stickyPencilPref<MathraxUi>()],

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: MathraxParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(mathraxGame);
