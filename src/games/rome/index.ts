/**
 * Rome — native TS port of `puzzles/unreleased/rome.c` (Nikoli's *Roma*).
 *
 * Fill every square with an arrow so that every outlined region holds only
 * distinct arrows and following the arrows from anywhere reaches a circled
 * goal. Grab a square and drag a direction to place an arrow (right-drag for a
 * pencil mark), or move the keyboard cursor and press Enter (Space for pencil)
 * followed by a direction — or type `8`/`2`/`4`/`6` directly.
 *
 * Rule violations are shown live, as upstream does: an arrow duplicated within
 * a region turns red, an arrow pointing off the grid reddens its square, and
 * (by preference) so do the squares of a loop. Check & Save adds the layer the
 * live checks cannot give — see {@link findMistakes}.
 */

import { assertNever } from "../../engine/assert-never.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
import {
  type Game,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  hideCursor,
  isCursorMove,
  isEraseKey,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  moveCursor,
  newCursor,
  RIGHT_BUTTON,
  showCursor,
  stripModifiers,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Colour, ConfigValues, Point, Size } from "../../engine/types.ts";
import { newRomeDesc } from "./generator.ts";
import {
  BORDER,
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  type RomeDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import { romeSolve, validateDesc, validateGame } from "./solver.ts";
import {
  boardFromClues,
  cloneState,
  DIFF_NAMES,
  DIFFCOUNT,
  decodeParams,
  defaultParams,
  EMPTY,
  encodeParams,
  FE_BOUNDS,
  FE_DOUBLE,
  FE_LOOP,
  FM_ARROWMASK,
  FM_DOWN,
  FM_FIXED,
  FM_LEFT,
  FM_RIGHT,
  FM_UP,
  KEYMODE_MOVE,
  KEYMODE_PENCIL,
  KEYMODE_PLACE,
  MOUSEMODE_OFF,
  MOUSEMODE_PENCIL,
  MOUSEMODE_PLACE,
  presets,
  type RomeDir,
  type RomeMove,
  type RomeParams,
  type RomeState,
  type RomeUi,
  readDesc,
  STATUS_COMPLETE,
  STATUS_INVALID,
  status,
  validateParams,
} from "./state.ts";

/**
 * A square Check & Save flags. `bounds` / `double` / `loop` are the rule
 * violations the board already shows live; `wrong` is an arrow that breaks no
 * rule *yet* but contradicts the puzzle's unique solution.
 */
export interface RomeMistake {
  index: number;
  kind: "bounds" | "double" | "loop" | "wrong";
}

// --- setup ------------------------------------------------------------------

function newState(p: RomeParams, desc: string): RomeState {
  const { board } = readDesc(p, desc);
  validateGame(board, true);
  return board;
}

function newUi(_state: RomeState): RomeUi {
  return {
    cursor: newCursor(),
    kmode: KEYMODE_MOVE,
    mmode: MOUSEMODE_OFF,
    mdir: EMPTY,
    // Upstream defaults: highlight the squares that reach a goal (a genuinely
    // useful built-in aid), leave loop highlighting off.
    sloops: false,
    sgoals: true,
  };
}

// --- input ------------------------------------------------------------------

/** Direct arrow entry by character code. Upstream keys off the bare
 * characters, having already stripped `MOD_NUM_KEYPAD` — which this frontend
 * never sets anyway (docs/games/input.md § "The numeric keypad never arrives"), so the number-row digits work too. */
const DIGIT_DIRS: Readonly<Record<number, RomeDir>> = {
  56: FM_UP, // '8'
  50: FM_DOWN, // '2'
  52: FM_LEFT, // '4'
  54: FM_RIGHT, // '6'
};

/** Upstream `FROMCOORD`: C integer division, which **truncates toward zero**,
 * so a pixel inside the two-pixel border maps to row/column 0 rather than to
 * -1. `Math.trunc`, not the shared `fromCoord`'s floor (same idiom as Sticks). */
function fromCoordTrunc(pixel: number, ts: number): number {
  return Math.trunc((pixel - BORDER) / ts);
}

function interpretMove(
  state: RomeState,
  ui: RomeUi,
  ds: RomeDrawState,
  p: Point,
  rawButton: number,
): RomeMove | null | UiUpdate {
  const { w, h, grid } = state;
  const button = stripModifiers(rawButton);
  const ts = ds.tilesize;

  // The highlighted square, captured up front exactly as upstream does: a
  // cursor move below updates `ui`, but every move emitted this call is about
  // the square that was highlighted on entry.
  const x = ui.cursor.x;
  const y = ui.cursor.y;
  const here = grid[y * w + x];

  if (ui.mmode === MOUSEMODE_OFF) {
    if (isCursorMove(button) && ui.kmode === KEYMODE_MOVE) {
      moveCursor(ui.cursor, button, w, h);
      return UI_UPDATE;
    }

    // Enter arms (or disarms) arrow placement.
    if (button === CURSOR_SELECT && !(here & FM_FIXED)) {
      showCursor(ui.cursor);
      ui.kmode = ui.kmode !== KEYMODE_PLACE ? KEYMODE_PLACE : KEYMODE_MOVE;
      return UI_UPDATE;
    }

    // Space arms pencil mode on an empty square...
    if (button === CURSOR_SELECT2 && here === EMPTY && ui.kmode !== KEYMODE_PLACE) {
      showCursor(ui.cursor);
      ui.kmode = ui.kmode !== KEYMODE_PENCIL ? KEYMODE_PENCIL : KEYMODE_MOVE;
      return UI_UPDATE;
    }

    // ...but while placement is armed, Space clears the square instead.
    if (button === CURSOR_SELECT2 && ui.kmode === KEYMODE_PLACE) {
      ui.kmode = KEYMODE_MOVE;
      if (here & FM_FIXED) return UI_UPDATE;
      return { kind: "place", x, y, dir: null };
    }

    // A direction key while armed commits the arrow or the mark.
    if (
      (ui.kmode === KEYMODE_PLACE || ui.kmode === KEYMODE_PENCIL) &&
      isCursorMove(button)
    ) {
      const pencil = ui.kmode === KEYMODE_PENCIL;
      ui.kmode = KEYMODE_MOVE;
      if (here & FM_FIXED) return UI_UPDATE;
      if (here !== EMPTY && pencil) return UI_UPDATE;

      const dir =
        button === CURSOR_UP
          ? FM_UP
          : button === CURSOR_DOWN
            ? FM_DOWN
            : button === CURSOR_LEFT
              ? FM_LEFT
              : FM_RIGHT;
      // Placing the arrow that is already there is a no-op, not a history
      // entry (upstream suppresses it locally here — docs/games/README.md § "Before you start").
      if (here & dir) return UI_UPDATE;
      return { kind: pencil ? "pencil" : "place", x, y, dir };
    }

    // Type a direction directly, in whichever mode the cursor is in.
    if (ui.cursor.visible && !(here & FM_FIXED)) {
      const pencil = ui.kmode === KEYMODE_PENCIL;
      const dir = DIGIT_DIRS[button];
      if (dir !== undefined) {
        ui.kmode = KEYMODE_MOVE;
        return { kind: pencil ? "pencil" : "place", x, y, dir };
      }
      if (isEraseKey(button)) {
        ui.kmode = KEYMODE_MOVE;
        return { kind: "place", x, y, dir: null };
      }
    }

    // Grab a square: left starts an arrow drag, right a pencil drag.
    if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
      const gx = fromCoordTrunc(p.x, ts);
      const gy = fromCoordTrunc(p.y, ts);
      if (gx < 0 || gx >= w || gy < 0 || gy >= h) return null;
      if (grid[gy * w + gx] & FM_FIXED) return null;

      ui.cursor.x = gx;
      ui.cursor.y = gy;
      hideCursor(ui.cursor);
      ui.kmode = KEYMODE_MOVE;
      ui.mmode = button === LEFT_BUTTON ? MOUSEMODE_PLACE : MOUSEMODE_PENCIL;
      ui.mdir = EMPTY;
      return UI_UPDATE;
    }

    return null;
  }

  if (isMouseDrag(button) || isMouseRelease(button)) {
    // The direction is read from the *square* the pointer is over, not from a
    // pixel offset: back on the grabbed square means "clear".
    const cx = p.x >= BORDER ? fromCoordTrunc(p.x, ts) : -1;
    const cy = p.y >= BORDER ? fromCoordTrunc(p.y, ts) : -1;

    let c: number;
    if (cx === x && cy === y) c = EMPTY;
    else if (Math.abs(cx - x) < Math.abs(cy - y)) c = cy < y ? FM_UP : FM_DOWN;
    else c = cx < x ? FM_LEFT : FM_RIGHT;

    if (c !== ui.mdir && isMouseDrag(button)) {
      ui.mdir = c;
      return UI_UPDATE;
    }

    if (isMouseRelease(button)) {
      const pencil = ui.mmode === MOUSEMODE_PENCIL;
      ui.mmode = MOUSEMODE_OFF;
      if (c === EMPTY && pencil) return UI_UPDATE;
      // Upstream compares the *whole* cell here, so a square already carrying
      // an error bit emits a move that changes nothing. Masking to the arrow
      // bits suppresses that genuine no-op instead (input layer only — the
      // desc differential never runs `interpretMove`).
      if (!pencil && c === (here & FM_ARROWMASK)) return UI_UPDATE;

      return {
        kind: pencil ? "pencil" : "place",
        x,
        y,
        dir: c === EMPTY ? null : (c as RomeDir),
      };
    }
  }

  return null;
}

// --- moves ------------------------------------------------------------------

function executeMove(state: RomeState, move: RomeMove): RomeState {
  const next = cloneState(state);
  const { w, h, grid, marks } = next;

  if (move.kind === "solve") {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] & FM_FIXED) continue;
      grid[i] = move.arrows[i] ?? EMPTY;
    }
    next.completed = validateGame(next, true) === STATUS_COMPLETE;
    next.cheated = next.completed;
    return next;
  }
  // Before the bounds check below, not inside it: a move with no coordinates
  // makes every one of those comparisons false rather than true.
  if (move.kind !== "place" && move.kind !== "pencil") {
    return assertNever(move, "rome: executeMove");
  }

  const { x, y } = move;
  if (x < 0 || x >= w || y < 0 || y >= h) {
    throw new Error(`rome: move out of range (${x}, ${y})`);
  }
  const i = y * w + x;
  if (grid[i] & FM_FIXED) throw new Error("rome: cannot change a fixed clue");

  if (move.kind === "place") grid[i] = move.dir ?? EMPTY;
  else marks[i] = move.dir === null ? EMPTY : marks[i] ^ move.dir;

  if (validateGame(next, true) === STATUS_COMPLETE) next.completed = true;
  return next;
}

/**
 * The unique solution's grid, re-derived from the fixed clues alone, or `null`
 * when this board is not deducible (a hand-written description, say). Never
 * derived from anything the player entered.
 */
function solutionGrid(state: RomeState): Int32Array | null {
  const board = boardFromClues(state);
  return romeSolve(board, DIFFCOUNT) === STATUS_COMPLETE ? board.grid : null;
}

function solve(orig: RomeState): SolveResult<RomeMove> {
  const solution = solutionGrid(orig);
  if (!solution) return { ok: false, error: "Unable to solve this puzzle." };
  const arrows: (RomeDir | null)[] = Array.from(solution, (c) => {
    const arrow = c & FM_ARROWMASK;
    return arrow === 0 ? null : (arrow as RomeDir);
  });
  return { ok: true, move: { kind: "solve", arrows } };
}

/**
 * Two layers, because either alone would bless a wrong board (docs/games/solver-and-generator.md § "The solvable-game contract").
 *
 * The **rule violations** — an off-grid arrow, an arrow duplicated inside a
 * region, an arrow on a loop — are what upstream already paints as you play,
 * and they are free: the validity check has computed them into the grid
 * already.
 *
 * But they are a strict subset of "wrong". An arrow can break no rule at all
 * and still contradict the puzzle's unique answer, and a live-only check would
 * let Check & Save store that board — which is exactly the failure the hook
 * exists to prevent. So the second layer re-solves from the fixed clues and
 * flags every arrow the player has placed that the solution disagrees with.
 *
 * Pencil marks are deliberately **not** checked. In the candidate-elimination
 * games a note that has crossed out the true value is a mistake, but Rome's
 * own documentation says its pencil marks "can be used for any purpose" — a
 * player may equally be marking the arrows they have *ruled out*, so there is
 * no reading of a note that can be called wrong.
 */
function findMistakes(state: RomeState): readonly RomeMistake[] {
  const out: RomeMistake[] = [];
  const flagged = new Set<number>();
  const { grid } = state;

  for (let i = 0; i < grid.length; i++) {
    const c = grid[i];
    const kind =
      c & FE_BOUNDS ? "bounds" : c & FE_DOUBLE ? "double" : c & FE_LOOP ? "loop" : null;
    if (kind) {
      out.push({ index: i, kind });
      flagged.add(i);
    }
  }

  const solution = solutionGrid(state);
  if (solution) {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] & FM_FIXED || flagged.has(i)) continue;
      const arrow = grid[i] & FM_ARROWMASK;
      // An empty square is incomplete, never wrong.
      if (arrow !== 0 && arrow !== (solution[i] & FM_ARROWMASK)) {
        out.push({ index: i, kind: "wrong" });
      }
    }
  }

  return out;
}

function flashLength(
  from: RomeState,
  to: RomeState,
  _dir: number,
  _ui: RomeUi,
): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
}

// --- the game ---------------------------------------------------------------

/** Rome's difficulty contract (`engine/difficulty.ts`). `romeSolve` returns a
 * `STATUS_*`; `boardFromClues` is the game's own "the position the puzzle
 * started from" helper, so the verdict is about the puzzle and not about what
 * the player has entered. */
const difficulty: DifficultyContract<RomeParams> = {
  tiers: DIFF_NAMES,
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const ret = romeSolve(boardFromClues(newState(p, desc)), cap);
    if (ret === STATUS_COMPLETE) return "solved";
    return ret === STATUS_INVALID ? "impossible" : "unsolved";
  },
};

export const romeGame: Game<
  RomeParams,
  RomeState,
  RomeMove,
  RomeUi,
  RomeDrawState,
  RomeMistake
> = {
  id: "rome",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: p.diff,
  }),
  paramConfig: [
    ...dimensionParamConfig<RomeParams>(),
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

  newDesc: (p: RomeParams, rng: RandomState) => newRomeDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  difficulty,
  findMistakes,

  // Upstream's two highlight preferences, with its own keywords and defaults.
  prefs: [
    {
      kw: "goal",
      name: "Highlight arrows pointing towards goal",
      type: "boolean",
      get: (ui) => ui.sgoals,
      set: (ui, v) => {
        ui.sgoals = v;
      },
    },
    {
      kw: "loop",
      name: "Highlight loops",
      type: "boolean",
      get: (ui) => ui.sloops,
      set: (ui, v) => {
        ui.sloops = v;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: RomeParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(romeGame);
