/**
 * Salad — native TS port of `puzzles/unreleased/salad.c` (© 2013 Lennard
 * Sprong). Place each of `nums` symbols once in every row and column of an
 * `order × order` grid, leaving the rest of each line empty. **ABC End View**
 * puts the clues outside the grid (the first symbol seen looking in); **Number
 * Ball** puts them inside it (a ball must hold a symbol, a cross must not).
 *
 * Left-click selects a square for a real entry, right-click for a pencil mark
 * (a sticky mode by default — see `SaladUi.pencilSticky`); a symbol key enters
 * it, `X`/`O` mark a square as definitely-empty / definitely-filled, and
 * Backspace clears. Middle-click cycles a square through circle → cross →
 * blank. Rule violations highlight live as you play; Check & Save additionally
 * flags every marking that contradicts the unique solution.
 */

import { assertNever } from "../../engine/assert-never.ts";
import { adaptiveMarkAll, obviousCandidateMarks } from "../../engine/candidate-hint.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
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
  MIDDLE_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { ConfigValues, GameStatus, KeyLabel, Point } from "../../engine/types.ts";
import { newSaladDesc } from "./generator.ts";
import { hint, hintKeepTrack, refreshHintStep } from "./hint.ts";
import {
  colors,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SaladDrawState,
  setTileSize,
} from "./render.ts";
import {
  findMistakes,
  type SaladMistake,
  saladSolution,
  saladSolve,
} from "./solver.ts";
import {
  CIRCLE,
  CROSS,
  cloneState,
  DIFF_NAMES,
  decodeParams,
  defaultParams,
  encodeParams,
  GAMEMODE_LETTERS,
  GAMEMODE_NUMBERS,
  isComplete,
  needsPencilFill,
  newState,
  newUi,
  PRESETS,
  presetLabel,
  type SaladEntry,
  type SaladMark,
  type SaladMove,
  type SaladParams,
  type SaladState,
  type SaladUi,
  saladNotes,
  saladRegions,
  scratchBoard,
  symbolRange,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

export type { SaladMistake } from "./solver.ts";

function presets(): PresetMenu<SaladParams> {
  return {
    title: "Salad",
    submenu: PRESETS.map((p) => ({ title: presetLabel(p), params: { ...p } })),
  };
}

// --- input -----------------------------------------------------------------

/** Clear keys. Upstream binds only Backspace; the app's delete key, its
 * secondary-select key and **Space** (which upstream's documentation calls a
 * clear but its code never wired up) are fork additions. */
function isClearKey(button: number): boolean {
  return isEraseKey(button) || button === 32 || button === CURSOR_SELECT2;
}

/** The symbol a key stands for, or `null` when it names none. Upstream accepts
 * the digits, `a-i` and `A-I` regardless of mode, and treats `'0'` as a clear. */
function symbolFor(button: number): number | "clear" | null {
  const digit = digitOf(button);
  if (digit === 0) return "clear";
  if (digit !== null) return digit; // '1'..'9'
  if (button >= 97 && button <= 105) return button - 96; // 'a'..'i'
  if (button >= 65 && button <= 73) return button - 64; // 'A'..'I'
  return null;
}

function interpretMove(
  state: SaladState,
  ui: SaladUi,
  ds: SaladDrawState,
  p: Point,
  rawButton: number,
): SaladMove | null | UiUpdate {
  const o = state.order;
  const nums = state.nums;
  const ts = ds.tilesize;
  const button = stripModifiers(rawButton);
  const gx = fromCoord(p.x, ts);
  const gy = fromCoord(p.y, ts);
  const pos = ui.cursor.x + o * ui.cursor.y;
  // Only a blank square or one carrying a bare ball is the player's to fill.
  const selectable = (i: number): boolean =>
    state.gridclues[i] === 0 || state.gridclues[i] === CIRCLE;

  if (gx >= 0 && gx < o && gy >= 0 && gy < o) {
    const i = gy * o + gx;
    if (
      pressNoteTakingCell(ui, button, gx, gy, {
        canEnter: selectable(i),
        canMark: selectable(i) && state.grid[i] === 0,
      }) !== null
    ) {
      return UI_UPDATE;
    }

    // Middle-click cycles a blank square: blank → ball → cross → blank.
    if (button === MIDDLE_BUTTON && state.gridclues[i] === 0) {
      let value: SaladEntry | null = null;
      if (state.holes[i] === 0) value = "circle";
      else if (state.holes[i] === CIRCLE && state.grid[i] === 0) value = "cross";
      else if (state.holes[i] === CROSS) value = "clear";
      if (value !== null) {
        ui.cursor.visible = false;
        return { type: "set", x: gx, y: gy, value };
      }
    }
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

  if (ui.cursor.visible && selectable(pos)) {
    const type = ui.pencilMode ? "pencil" : "set";
    /** Upstream: a mouse-driven real entry drops the highlight afterwards. */
    const commit = (value: SaladEntry): SaladMove => {
      releaseHighlightAfterEntry(ui);
      return { type, x: ui.cursor.x, y: ui.cursor.y, value };
    };

    const symbol = symbolFor(button);
    if (symbol !== null) {
      if (symbol !== "clear" && symbol > nums) return null;
      return commit(symbol);
    }
    if (isClearKey(button)) return commit("clear");

    // 'X' / 'x' / '-' / '_': definitely empty.
    if (button === 88 || button === 120 || button === 45 || button === 95) {
      if (state.gridclues[pos] === CIRCLE) return null;
      return commit("cross");
    }
    // 'O' / 'o' / '+' / '=': definitely not empty.
    if (button === 79 || button === 111 || button === 43 || button === 61) {
      if (state.gridclues[pos] === CIRCLE && ui.pencilMode) return null;
      if (state.grid[pos] !== 0 && ui.pencilMode) return null;
      return commit("circle");
    }
  }

  // 'M' / 'm' (and the toolbar's pencil-marks button): the collection's adaptive
  // Mark-all press — fill the squares that have no marks yet, else clear the
  // candidates a placed symbol already rules out of its row or column. It only
  // ever adds or removes, never resets, so it can't undo the player's notes.
  if (button === 77 || button === 109) {
    return adaptiveMarkAll<SaladMove, SaladMark>(needsPencilFill(state), () =>
      obviousCandidateMarks(
        state.grid,
        state.pencil,
        o,
        saladRegions(o),
        saladNotes(nums),
      ),
    );
  }

  return null;
}

function executeMove(state: SaladState, move: SaladMove): SaladState {
  const o = state.order;
  const nums = state.nums;
  const next = cloneState(state);

  switch (move.type) {
    case "solve": {
      for (let i = 0; i < o * o; i++) {
        const v = move.cells[i];
        if (v) {
          next.grid[i] = v;
          next.holes[i] = CIRCLE;
        } else {
          next.grid[i] = 0;
          next.holes[i] = CROSS;
        }
      }
      next.completed = true;
      next.cheated = true;
      return next;
    }
    case "markAll":
    case "pencilAll": {
      const allmarks = (1 << (nums + 1)) - 1;
      const marks = (1 << nums) - 1;
      // `pencilAll` skips a square that already carries marks; `markAll` resets it.
      const fillOnly = move.type === "pencilAll";
      for (let i = 0; i < o * o; i++) {
        if (!state.grid[i] && state.holes[i] !== CROSS) {
          if (fillOnly && state.pencil[i] !== 0) continue;
          next.pencil[i] = state.holes[i] === CIRCLE ? marks : allmarks;
        }
      }
      return next;
    }
    case "pencilStrike":
      for (const { x, y, n } of move.marks) next.pencil[y * o + x] &= ~(1 << (n - 1));
      return next;
    case "set":
    case "pencil": {
      const i = move.y * o + move.x;
      const pencil = move.type === "pencil";
      const v = move.value;

      if (v === "clear") {
        // Clearing an already-empty square wipes its pencil marks instead.
        // (Upstream applies this arm to a pencil move too.)
        if (!next.grid[i] && next.holes[i] !== CROSS) next.pencil[i] = 0;
        next.grid[i] = 0;
        if (next.gridclues[i] !== CIRCLE) next.holes[i] = 0;
      } else if (typeof v === "number") {
        if (pencil) next.pencil[i] ^= 1 << (v - 1);
        else {
          next.grid[i] = v;
          next.holes[i] = CIRCLE;
        }
      } else if (v === "cross") {
        if (pencil) next.pencil[i] ^= 1 << nums;
        else {
          next.grid[i] = 0;
          next.holes[i] = CROSS;
        }
      } else {
        // A penciled circle is upstream's oddity: it toggles the *real* marker
        // without emptying the square.
        if (pencil) {
          if (next.holes[i] === 0) next.holes[i] = CIRCLE;
          else if (next.holes[i] === CIRCLE) next.holes[i] = 0;
        } else {
          next.grid[i] = 0;
          next.holes[i] = CIRCLE;
        }
      }

      if (isComplete(next)) next.completed = true;
      return next;
    }
    default:
      return assertNever(move, "salad: executeMove");
  }
}

function solve(orig: SaladState): SolveResult<SaladMove> {
  const cells = saladSolution(orig);
  if (!cells) return { ok: false, error: "No solution found." };
  return { ok: true, move: { type: "solve", cells } };
}

// --- the Game --------------------------------------------------------------

/** Salad's difficulty contract (`engine/difficulty.ts`). `saladSolve` answers a
 * plain boolean — "did this come out a complete, valid board?" — and
 * `scratchBoard` seeds it with the clues only. */
const difficulty: DifficultyContract<SaladParams> = {
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) =>
    saladSolve(scratchBoard(newState(p, desc)), cap) ? "solved" : "unsolved",
};

export const saladGame: Game<
  SaladParams,
  SaladState,
  SaladMove,
  SaladUi,
  SaladDrawState,
  SaladMistake
> = {
  id: "salad",
  // The symbol range, as upstream shows it in its non-stylus builds.
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  canMarkAll: true, // the adaptive 'M' press in interpretMove

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    {
      kw: "game-mode",
      name: "Game Mode",
      type: "choices",
      choices: ["ABC End View", "Number Ball"],
      get: (p) => p.mode,
      set: (p, v) => {
        p.mode = v === GAMEMODE_NUMBERS ? GAMEMODE_NUMBERS : GAMEMODE_LETTERS;
      },
    },
    {
      kw: "size",
      name: "Size (s*s)",
      type: "string",
      get: (p) => String(p.order),
      set: (p, v) => {
        p.order = parseConfigInt(v);
      },
    },
    {
      kw: "symbols",
      name: "Symbols",
      type: "string",
      get: (p) => String(p.nums),
      set: (p, v) => {
        p.nums = parseConfigInt(v);
      },
    },
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: [...DIFF_NAMES],
      get: (p) => p.diff,
      set: (p, v) => {
        p.diff = v;
      },
    },
  ],
  // Keys match the bespoke `salad` summary in augmentation.ts, which reads
  // `game-mode`, `size`, `symbols` and `difficulty`.
  describeParams: (p): ConfigValues => ({
    "game-mode": p.mode,
    size: String(p.order),
    symbols: String(p.nums),
    difficulty: p.diff,
  }),

  newDesc: (p, rng) => newSaladDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status: (s): GameStatus => (s.completed ? "solved" : "ongoing"),

  solve,
  difficulty,
  hint,
  hintKeepTrack,
  refreshHintStep,
  findMistakes,
  requestKeys: (p): KeyLabel[] => {
    // Upstream `game_request_keys`: the symbol keys, then X, O and clear.
    const base = p.mode === GAMEMODE_LETTERS ? 65 : 49;
    const keys: KeyLabel[] = [];
    for (let i = 0; i < p.nums; i++) {
      keys.push({ button: base + i, label: String.fromCharCode(base + i) });
    }
    keys.push({ button: 88, label: "X" });
    keys.push({ button: 79, label: "O" });
    keys.push(clearKey);
    return keys;
  },
  textFormat,
  statusbarText: (s) => symbolRange(s),

  prefs: [stickyPencilPref<SaladUi>(), pencilKeepHighlightPref<SaladUi>()],

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(saladGame);
