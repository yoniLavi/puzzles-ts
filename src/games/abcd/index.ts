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
import {
  type Game,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { clearKey } from "../../engine/key-labels.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import { stickyPencilPref } from "../../engine/pencil-prefs.ts";
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
import type {
  Colour,
  ConfigValues,
  GameStatus,
  KeyLabel,
  Point,
  Size,
} from "../../engine/types.ts";
import { newAbcdDesc } from "./generator.ts";
import {
  type AbcdDrawState,
  colours,
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
export interface AbcdMistake {
  x: number;
  y: number;
}

const CLEAR = 8; // Backspace
const KEY_ZERO = 48;
const KEY_M = 77;
const KEY_m = 109;

function presetTitle(p: AbcdParams): string {
  const flavour = p.diag ? "No diagonals" : p.removenums ? "Hard" : "Easy";
  return `${p.w}x${p.h}, ${p.n} letters ${flavour}`;
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
  if (button >= 49 && button <= 57 && button - 49 < n) return button - 49; // 1-9
  if (button === CURSOR_SELECT2 || button === CLEAR || button === KEY_ZERO) return null;
  return undefined;
}

/**
 * Would writing `letter` into `(x, y)` leave the state exactly as it is?
 *
 * The two arms mirror `executeMove`'s two `enter` branches: placing a letter
 * touches only the grid, so it is a no-op iff that letter is already there;
 * clearing also wipes the cell's pencil cube, so it is a no-op only when the
 * cell is empty *and* carries no notes.
 */
function noOpEntry(
  state: AbcdState,
  x: number,
  y: number,
  letter: number | null,
): boolean {
  const { w, n } = state.params;
  const cell = state.grid[y * w + x];
  if (letter !== null) return cell === letter;
  if (cell !== EMPTY) return false;
  for (let z = 0; z < n; z++) if (state.pencil[cuboid(x, y, z, n, w)]) return false;
  return true;
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

  if (inGrid(p, gx, gy)) {
    const filled = state.grid[gy * w + gx] !== EMPTY;

    if (button === LEFT_BUTTON) {
      // Sticky pencil mode (fork): a left-click only moves the highlight and
      // keeps the current mode; upstream (sticky off) reverts to real entry.
      if (
        ui.hshow &&
        ui.hx === gx &&
        ui.hy === gy &&
        (ui.pencilSticky || !ui.hpencil)
      ) {
        ui.hshow = false;
      } else {
        ui.hx = gx;
        ui.hy = gy;
        ui.hshow = true;
        if (!ui.pencilSticky) ui.hpencil = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
    if (button === RIGHT_BUTTON) {
      if (ui.pencilSticky) {
        // Toggle the persistent pencil mode (CapsLock-style), and only move the
        // highlight onto a cell that can actually take a mark.
        ui.hpencil = !ui.hpencil;
        if (!filled) {
          ui.hx = gx;
          ui.hy = gy;
          ui.hshow = true;
        }
      } else {
        // Upstream: select this cell for a pencil mark (or deselect a repeat).
        if (!ui.hshow || !ui.hpencil || ui.hx !== gx || ui.hy !== gy) {
          ui.hx = gx;
          ui.hy = gy;
          ui.hpencil = true;
          ui.hshow = true;
        } else {
          ui.hshow = false;
        }
        if (filled) ui.hshow = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.hx, ui.hy, p.w, p.h);
    if (moved) {
      ui.hx = moved.x;
      ui.hy = moved.y;
    }
    ui.hshow = ui.hcursor = true;
    return UI_UPDATE;
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  // Enter or clear a letter.
  const letter = ui.hshow ? keyLetter(button, n) : undefined;
  if (letter !== undefined) {
    // In pencil mode a filled square can't be changed.
    if (ui.hpencil && state.grid[ui.hy * w + ui.hx] !== EMPTY) return null;

    // Suppress an entry that would change nothing, so it costs no undo step
    // (upstream's own `/* TODO Prevent operations which do nothing */`, which
    // its `interpret_move` never got to). Locally decided, as the playbook
    // requires — never by comparing serialised states.
    if (!ui.hpencil && noOpEntry(state, ui.hx, ui.hy, letter)) return null;

    const move: AbcdMove =
      letter === null
        ? { type: "enter", x: ui.hx, y: ui.hy, letter: null }
        : ui.hpencil
          ? { type: "pencil", x: ui.hx, y: ui.hy, letter }
          : { type: "enter", x: ui.hx, y: ui.hy, letter };

    // Hide the mouse cursor after an entry (keyboard/pencil cursors persist).
    if (!ui.hcursor && !ui.hpencil) ui.hshow = false;
    return move;
  }

  // Adaptive mark-all (M), the collection-wide shared behaviour: fill on the
  // first press (any empty cell with *zero* notes), then subsequent presses only
  // *strike* the obvious eliminations — never re-fill/reset (docs/games/mechanics.md § "Pencil marks: the full note-taking UX").
  if (button === KEY_M || button === KEY_m) {
    let needsFill = false;
    for (let y = 0; y < p.h && !needsFill; y++) {
      for (let x = 0; x < w && !needsFill; x++) {
        if (state.grid[y * w + x] !== EMPTY) continue;
        let hasNote = false;
        for (let z = 0; z < n; z++)
          if (state.pencil[cuboid(x, y, z, n, w)]) {
            hasNote = true;
            break;
          }
        if (!hasNote) needsFill = true;
      }
    }
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
        // Clearing wipes the cell's pencil cube too (and never completes).
        next.grid[i] = EMPTY;
        for (let z = 0; z < n; z++) next.pencil[cuboid(move.x, move.y, z, n, w)] = 0;
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
      // Fill every *note-less* empty cell's whole candidate cube (the first
      // mark-all press).
      // **Additive**: fill only the cells that have no notes yet, never reset one
      // the player has narrowed (owner-reported on Salad, 2026-07-29 — resetting
      // threw away their own deductions). `adaptiveMarkAll`'s contract always said
      // "fill every *note-less* empty cell".
      for (let y = 0; y < p.h; y++) {
        for (let x = 0; x < w; x++) {
          if (next.grid[y * w + x] !== EMPTY) continue;
          let hasNote = false;
          for (let z = 0; z < n; z++) {
            if (next.pencil[cuboid(x, y, z, n, w)]) {
              hasNote = true;
              break;
            }
          }
          if (hasNote) continue;
          for (let z = 0; z < n; z++) next.pencil[cuboid(x, y, z, n, w)] = 1;
        }
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
    ui.hshow &&
    ui.hpencil &&
    !ui.hcursor &&
    newSt.grid[ui.hy * w + ui.hx] !== EMPTY
  ) {
    ui.hshow = false;
  }
  if (oldSt && !oldSt.completed && newSt.completed) ui.hshow = false;
}

function solve(
  orig: AbcdState,
  _curr: AbcdState,
  _aux?: string,
): SolveResult<AbcdMove> {
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

function flashLength(from: AbcdState, to: AbcdState): number {
  return !from.completed && to.completed && !from.cheated && !to.cheated
    ? FLASH_TIME
    : 0;
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
  // Param-dependent (a 2-digit clue on a ≥19-wide grid has no single-char
  // rendering) — `textFormat` returns undefined there (upstream
  // `game_can_format_as_text_now`).
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
      // The C exposes the *inverse* of the stored flag — port the inversion.
      kw: "allow-diagonal-touching",
      name: "Allow diagonal touching",
      type: "boolean",
      get: (p) => !p.diag,
      set: (p, v) => {
        p.diag = !v;
      },
    },
  ],

  newDesc: (p, rng) => newAbcdDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status: (s): GameStatus => status(s),

  solve,
  findMistakes,
  requestKeys,
  textFormat,

  prefs: [stickyPencilPref<AbcdUi>()],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: AbcdParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(abcdGame);
