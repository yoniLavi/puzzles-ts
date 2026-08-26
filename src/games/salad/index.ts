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
import { parseConfigInt } from "../../engine/params.ts";
import { stickyPencilPref } from "../../engine/pencil-prefs.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  isEraseKey,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type {
  Colour,
  ConfigValues,
  GameStatus,
  KeyLabel,
  Point,
  Size,
} from "../../engine/types.ts";
import { newSaladDesc } from "./generator.ts";
import { hint, hintKeepTrack, refreshHintStep } from "./hint.ts";
import {
  colours,
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
  type SaladMistake,
  saladFindMistakes,
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
 * secondary-select key and **Space** (which `docs/salad.md` documents as a
 * clear but the C never wired up) are fork additions — see `design.md`. */
function isClearKey(button: number): boolean {
  return isEraseKey(button) || button === 32 || button === CURSOR_SELECT2;
}

/** The symbol a key stands for, or `null` when it names none. Upstream accepts
 * the digits, `a-i` and `A-I` regardless of mode, and treats `'0'` as a clear. */
function symbolFor(button: number): number | "clear" | null {
  if (button === 48) return "clear"; // '0'
  if (button >= 49 && button <= 57) return button - 48; // '1'..'9'
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
  const pos = ui.hx + o * ui.hy;

  if (gx >= 0 && gx < o && gy >= 0 && gy < o) {
    const i = gy * o + gx;
    // Only a blank square or one carrying a bare ball is the player's to fill.
    const selectable = state.gridclues[i] === 0 || state.gridclues[i] === CIRCLE;

    if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
      const newpencil = button === RIGHT_BUTTON;
      if (ui.pencilSticky) {
        // Fork divergence (docs/games/mechanics.md § "Pencil marks: the full note-taking UX"): right-click toggles a *persistent*
        // pencil mode instead of pencil-selecting one square, and a left-click
        // only moves the highlight. A filled square can show no pencil mark, so
        // the toggle never drags the highlight onto one.
        if (newpencil) {
          ui.hpencil = !ui.hpencil;
          if (selectable && state.grid[i] === 0) {
            ui.hx = gx;
            ui.hy = gy;
            ui.hshow = true;
          }
        } else if (selectable && !(ui.hshow && ui.hx === gx && ui.hy === gy)) {
          ui.hx = gx;
          ui.hy = gy;
          ui.hshow = true;
        } else {
          ui.hshow = false;
        }
      } else if (
        selectable &&
        (!ui.hshow ||
          (newpencil ? !ui.hpencil : ui.hpencil) ||
          ui.hx !== gx ||
          ui.hy !== gy)
      ) {
        ui.hx = gx;
        ui.hy = gy;
        ui.hpencil = newpencil;
        ui.hshow = true;
      } else {
        ui.hshow = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }

    // Middle-click cycles a blank square: blank → ball → cross → blank.
    if (button === MIDDLE_BUTTON && state.gridclues[i] === 0) {
      let value: SaladEntry | null = null;
      if (state.holes[i] === 0) value = "circle";
      else if (state.holes[i] === CIRCLE && state.grid[i] === 0) value = "cross";
      else if (state.holes[i] === CROSS) value = "clear";
      if (value !== null) {
        ui.hshow = false;
        return { type: "set", x: gx, y: gy, value };
      }
    }
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.hx, ui.hy, o, o);
    if (moved) {
      ui.hx = moved.x;
      ui.hy = moved.y;
    }
    ui.hshow = true;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  if (ui.hshow && (state.gridclues[pos] === 0 || state.gridclues[pos] === CIRCLE)) {
    const type = ui.hpencil ? "pencil" : "set";
    /** Upstream: a mouse-driven real entry drops the highlight afterwards. */
    const commit = (value: SaladEntry): SaladMove => {
      if (!ui.hcursor && !ui.hpencil) ui.hshow = false;
      return { type, x: ui.hx, y: ui.hy, value };
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
      if (state.gridclues[pos] === CIRCLE && ui.hpencil) return null;
      if (state.grid[pos] !== 0 && ui.hpencil) return null;
      return commit("circle");
    }
  }

  // 'M' / 'm' (and the toolbar's pencil-marks button): the collection's adaptive
  // Mark-all press — fill the squares that have no marks yet, else clear the
  // candidates a placed symbol already rules out of its row or column. **Only
  // ever adds or removes; never resets** (owner-directed 2026-07-29), so pressing
  // it can't undo deductions the player has pencilled. Upstream's resetting `M`
  // (`markAll`) is no longer reachable from input.
  if (button === 77 || button === 109) {
    return adaptiveMarkAll<SaladMove, SaladMark>(needsPencilFill(state), () =>
      obviousCandidateMarks(
        state.grid,
        state.marks,
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
      // `pencilAll` fills only the squares that carry no mark yet, so it can
      // never throw away notes the player has narrowed; `markAll` (upstream's
      // `M`) *resets* every fillable square and survives for replay of move logs
      // saved before the button moved to the additive path.
      const fillOnly = move.type === "pencilAll";
      for (let i = 0; i < o * o; i++) {
        if (!state.grid[i] && state.holes[i] !== CROSS) {
          if (fillOnly && state.marks[i] !== 0) continue;
          next.marks[i] = state.holes[i] === CIRCLE ? marks : allmarks;
        }
      }
      return next;
    }
    case "pencilStrike": {
      // Only ever removes, so replaying it is idempotent (unlike the `pencil`
      // toggle) and a partly-followed hint strike stays safe to re-apply. Mark
      // `n = nums + 1` is the "might be empty" X, which `1 << (n − 1)` places at
      // bit `nums` — the same formula as a symbol's bit.
      for (const { x, y, n } of move.marks) next.marks[y * o + x] &= ~(1 << (n - 1));
      return next;
    }
    // Named rather than left as the `default`, which used to be this working
    // arm: an unrecognised move fell into it and was read as an entry at
    // `(undefined, undefined)`. The `default` below is now only a guard.
    case "set":
    case "pencil": {
      const i = move.y * o + move.x;
      const pencil = move.type === "pencil";
      const v = move.value;

      if (v === "clear") {
        // Clearing an already-empty square wipes its pencil marks instead.
        // (Upstream applies this arm to a pencil move too.)
        if (!next.grid[i] && next.holes[i] !== CROSS) next.marks[i] = 0;
        next.grid[i] = 0;
        if (next.gridclues[i] !== CIRCLE) next.holes[i] = 0;
      } else if (typeof v === "number") {
        if (pencil) next.marks[i] ^= 1 << (v - 1);
        else {
          next.grid[i] = v;
          next.holes[i] = CIRCLE;
        }
      } else if (v === "cross") {
        if (pencil) next.marks[i] ^= 1 << nums;
        else {
          next.grid[i] = 0;
          next.holes[i] = CROSS;
        }
      } else {
        // A pencilled circle is upstream's oddity: it toggles the *real* marker
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
 * `scratchBoard` seeds it with the clues only. `DIFF_HOLESONLY` (−1) is a
 * generator quality gate rather than a playable tier, which is one more reason
 * the tier list is declared and not counted off the `DIFF_*` family. */
const difficulty: DifficultyContract<SaladParams> = {
  tiers: DIFF_NAMES,
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
  // The C/WASM build compiles without STYLUS_BASED, so it shows the symbol
  // range in the status bar; keep that.
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  canMarkAll: true, // handles 'M' (markAll) in interpretMove

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

  newDesc: (p: SaladParams, rng: RandomState) => newSaladDesc(p, rng),
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
  findMistakes: saladFindMistakes,
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
  statusbarText: (s) =>
    symbolRange({ order: s.order, nums: s.nums, mode: s.mode, diff: s.diff }),

  prefs: [stickyPencilPref<SaladUi>()],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SaladParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(saladGame);
