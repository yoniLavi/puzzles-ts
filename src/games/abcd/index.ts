/**
 * ABCD — native TS port of `unreleased/abcd.c` (Lennard Sprong, 2011). Fill a
 * `w × h` grid with one of `n` letters so the edge numbers count each letter per
 * row and column, and no two identical letters touch (orthogonally, and — under
 * "no diagonals" mode — diagonally). Solo-style input: left-click / cursor
 * selects a cell for a real entry, right-click / Enter toggles pencil mode, a
 * letter key (`A`–`I` or the bare digits `1`–`9`) enters or pencil-marks,
 * Backspace clears. Rule violations highlight live; Check & Save additionally
 * flags any entry contradicting the unique solution.
 */

import { assertNever } from "../../engine/assert-never.ts";
import { adaptiveMarkAll } from "../../engine/candidate-hint.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { clearKey } from "../../engine/key-labels.ts";
import {
  pressNoteTakingCell,
  releaseHighlightAfterEntry,
} from "../../engine/note-taking-cell.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
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
import type { ConfigValues, KeyLabel, Point } from "../../engine/types.ts";
import { newAbcdDesc } from "./generator.ts";
import {
  type AbcdDrawState,
  colors,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import { type AbcdMark, abcdObviousMarks, solveAbcd } from "./solver.ts";
import {
  type AbcdMove,
  type AbcdParams,
  type AbcdState,
  type AbcdUi,
  abcdPresets,
  cloneState,
  cuboid,
  decodeParams,
  defaultParams,
  EMPTY,
  encodeParams,
  isCompleted,
  newState,
  newUi,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player entry that contradicts the puzzle's unique solution. */
export type AbcdMistake = Point;

const KEY_M = 77;
const KEY_m = 109;

function presetTitle(p: AbcdParams): string {
  const flavor = p.diag ? "No diagonals" : p.removenums ? "Hard" : "Easy";
  return `${p.w}x${p.h}, ${p.n} letters ${flavor}`;
}

function presets(): PresetMenu<AbcdParams> {
  return {
    title: "ABCD",
    submenu: abcdPresets.map((p) => ({ title: presetTitle(p), params: p })),
  };
}

function inGrid(p: AbcdParams, x: number, y: number): boolean {
  return x >= 0 && x < p.w && y >= 0 && y < p.h;
}

/** The letter index a key selects, or `null` for "clear", or `undefined` for
 * "not a letter/clear key for this `n`". */
function keyLetter(button: number, n: number): number | null | undefined {
  if (button >= 97 && button <= 105 && button - 97 < n) return button - 97; // a-i
  if (button >= 65 && button <= 73 && button - 65 < n) return button - 65; // A-I
  const digit = digitOf(button);
  if (digit !== null && digit >= 1 && digit - 1 < n) return digit - 1; // 1-9
  if (button === CURSOR_SELECT2 || isEraseKey(button) || digit === 0) return null;
  return undefined;
}

/** Cell `i`'s pencil marks: a view of its `n` contiguous slots in the cube. */
function notesOf(state: AbcdState, i: number): Uint8Array {
  const { n } = state.params;
  return state.pencil.subarray(i * n, (i + 1) * n);
}

/**
 * Would writing `letter` into `(x, y)` leave the state exactly as it is?
 *
 * The two arms mirror `executeMove`'s two `enter` branches: placing a letter
 * touches only the grid, so it is a no-op iff that letter is already there;
 * clearing also wipes the cell's pencil marks, so it is a no-op only when the
 * cell is empty *and* carries no notes.
 */
function noOpEntry(
  state: AbcdState,
  x: number,
  y: number,
  letter: number | null,
): boolean {
  const i = y * state.params.w + x;
  if (letter !== null) return state.grid[i] === letter;
  return state.grid[i] === EMPTY && !notesOf(state, i).includes(1);
}

function interpretMove(
  state: AbcdState,
  ui: AbcdUi,
  ds: { tilesize: number },
  point: Point,
  rawButton: number,
): AbcdMove | null | UiUpdate {
  const p = state.params;
  const { w, n } = p;
  const ts = ds.tilesize;
  const button = stripModifiers(rawButton);

  const gx = fromCoord(point.x, ts, n);
  const gy = fromCoord(point.y, ts, n);

  if (
    inGrid(p, gx, gy) &&
    pressNoteTakingCell(ui, button, gx, gy, {
      // Abcd has no givens inside the grid — its clues live on the margins —
      // so every square takes ink, and a filled one can be typed over.
      canEnter: true,
      canMark: state.grid[gy * w + gx] === EMPTY,
    })
  ) {
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.cursor.x, ui.cursor.y, p.w, p.h);
    if (moved) {
      ui.cursor.x = moved.x;
      ui.cursor.y = moved.y;
    }
    ui.cursor.visible = ui.cursorFromKeyboard = true;
    return UI_UPDATE;
  }

  if (ui.cursor.visible && button === CURSOR_SELECT) {
    ui.pencilMode = !ui.pencilMode;
    ui.cursorFromKeyboard = true;
    return UI_UPDATE;
  }

  // Enter or clear a letter.
  const letter = ui.cursor.visible ? keyLetter(button, n) : undefined;
  if (letter !== undefined) {
    // In pencil mode a filled square can't be changed.
    if (ui.pencilMode && state.grid[ui.cursor.y * w + ui.cursor.x] !== EMPTY)
      return null;

    // Suppress an entry that would change nothing, so it costs no undo step
    // (upstream left this as a `TODO`), decided locally rather than by
    // comparing states.
    if (!ui.pencilMode && noOpEntry(state, ui.cursor.x, ui.cursor.y, letter))
      return null;

    const move: AbcdMove =
      letter === null
        ? { type: "enter", x: ui.cursor.x, y: ui.cursor.y, letter: null }
        : ui.pencilMode
          ? { type: "pencil", x: ui.cursor.x, y: ui.cursor.y, letter }
          : { type: "enter", x: ui.cursor.x, y: ui.cursor.y, letter };

    // Hide the mouse cursor after an entry (keyboard/pencil cursors persist).
    releaseHighlightAfterEntry(ui);
    return move;
  }

  // Adaptive mark-all (M): fill while some empty cell has no notes, then only
  // strike the obvious eliminations, never re-fill
  // (docs/games/mechanics.md § "Pencil marks: the full note-taking UX").
  if (button === KEY_M || button === KEY_m) {
    const needsFill = state.grid.some(
      (c, i) => c === EMPTY && !notesOf(state, i).includes(1),
    );
    return adaptiveMarkAll<AbcdMove, AbcdMark>(needsFill, () =>
      abcdObviousMarks(p, state.grid, state.pencil, state.numbers),
    );
  }

  return null;
}

function executeMove(state: AbcdState, move: AbcdMove): AbcdState {
  const p = state.params;
  const { w, n } = p;
  const next = cloneState(state);

  switch (move.type) {
    case "enter": {
      const i = move.y * w + move.x;
      if (move.letter === null) {
        // Clearing wipes the cell's pencil marks too (and never completes).
        next.grid[i] = EMPTY;
        notesOf(next, i).fill(0);
        return next;
      }
      next.grid[i] = move.letter;
      if (!next.completed && isCompleted(next)) next.completed = true;
      return next;
    }
    case "pencil": {
      const idx = cuboid(move.x, move.y, move.letter, n, w);
      next.pencil[idx] = next.pencil[idx] ? 0 : 1;
      return next;
    }
    case "pencilAll": {
      // Fill every note-less empty cell with every candidate, never resetting a
      // narrowed one: `candidate-hint.ts`'s `adaptiveMarkAll` § "The additive
      // rule, stated once".
      for (let i = 0; i < w * p.h; i++) {
        const notes = notesOf(next, i);
        if (next.grid[i] === EMPTY && !notes.includes(1)) notes.fill(1);
      }
      return next;
    }
    case "pencilStrike": {
      for (const m of move.marks) next.pencil[cuboid(m.x, m.y, m.letter, n, w)] = 0;
      return next;
    }
    case "solve": {
      for (let i = 0; i < w * p.h; i++) next.grid[i] = move.grid[i];
      next.completed = true;
      next.cheated = true;
      return next;
    }
    default:
      return assertNever(move, "abcd: executeMove");
  }
}

function changedState(ui: AbcdUi, oldSt: AbcdState | null, newSt: AbcdState): void {
  const w = newSt.params.w;
  // Cancel a pencil highlight on a square that just got filled (undo/redo/solve).
  if (
    ui.cursor.visible &&
    ui.pencilMode &&
    !ui.cursorFromKeyboard &&
    newSt.grid[ui.cursor.y * w + ui.cursor.x] !== EMPTY
  ) {
    ui.cursor.visible = false;
  }
  if (oldSt && !oldSt.completed && newSt.completed) ui.cursor.visible = false;
}

function solve(orig: AbcdState): SolveResult<AbcdMove> {
  const res = solveAbcd(orig.params, orig.numbers);
  if (res.status === "contradiction")
    return { ok: false, error: "No solution exists for this puzzle." };
  if (res.status === "ambiguous")
    return { ok: false, error: "Solver could not find a unique solution." };
  return { ok: true, move: { type: "solve", grid: Array.from(res.grid) } };
}

function findMistakes(state: AbcdState): readonly AbcdMistake[] {
  const res = solveAbcd(state.params, state.numbers);
  if (res.status !== "solved") return [];
  const { w, h } = state.params;
  const out: AbcdMistake[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (state.grid[i] !== EMPTY && state.grid[i] !== res.grid[i]) out.push({ x, y });
    }
  }
  return out;
}

function requestKeys(p: AbcdParams): KeyLabel[] {
  const keys: KeyLabel[] = [];
  for (let i = 0; i < p.n; i++)
    keys.push({ button: 65 + i, label: String.fromCharCode(65 + i) });
  keys.push(clearKey);
  return keys;
}

export const abcdGame: Game<
  AbcdParams,
  AbcdState,
  AbcdMove,
  AbcdUi,
  AbcdDrawState,
  AbcdMistake
> = {
  id: "abcd",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  // `textFormat` still declines a board whose clues could be two digits.
  canFormatAsText: true,
  canMarkAll: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    letters: String(p.n),
    "remove-clues": p.removenums ? 1 : 0,
    "allow-diagonal-touching": p.diag ? 0 : 1,
  }),
  paramConfig: [
    ...dimensionParamConfig<AbcdParams>(),
    {
      kw: "letters",
      name: "Letters",
      type: "string",
      get: (p) => String(p.n),
      set: (p, v) => {
        p.n = parseConfigInt(v);
      },
    },
    {
      kw: "remove-clues",
      name: "Remove clues",
      type: "boolean",
      get: (p) => p.removenums,
      set: (p, v) => {
        p.removenums = v;
      },
    },
    {
      // The option is the inverse of the stored flag, as upstream's is.
      kw: "allow-diagonal-touching",
      name: "Allow diagonal touching",
      type: "boolean",
      get: (p) => !p.diag,
      set: (p, v) => {
        p.diag = !v;
      },
    },
  ],

  newDesc: newAbcdDesc,
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,
  requestKeys,
  textFormat,

  prefs: [stickyPencilPref<AbcdUi>(), pencilKeepHighlightPref<AbcdUi>()],

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(abcdGame);
