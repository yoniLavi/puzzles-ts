/**
 * Magnets — native TS port of `magnets.c`. Fill a grid of pre-laid dominoes so
 * each domino is a magnet (`+`/`−`) or neutral, no two orthogonally-adjacent
 * cells share a polarity, and each row/column holds its `+`/`−` clue counts.
 *
 * Input: left-click / `CURSOR_SELECT` cycles a domino cell empty→`+`→`−`→empty
 * (the magnet cycle); right-click / `CURSOR_SELECT2` cycles empty→neutral→
 * not-neutral(`?`)→empty over the domino; a left-click on a border clue toggles
 * its "done" grey; cursor keys move a keyboard cursor.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import type { Game, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
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
import { newMagnetsDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  type MagnetsDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
} from "./render.ts";
import { MagnetsSolver } from "./solver.ts";
import {
  clueIndex,
  DIFF_COUNT,
  DIFF_NAMES,
  decodeParams,
  defaultParams,
  EMPTY,
  encodeParams,
  executeMove,
  GS_NOTNEUTRAL,
  GS_SET,
  isClue,
  type MagnetsMistake,
  type MagnetsMove,
  type MagnetsParams,
  type MagnetsState,
  type MagnetsUi,
  NEGATIVE,
  NEUTRAL,
  newState,
  POSITIVE,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(_state: MagnetsState): MagnetsUi {
  return { curX: 0, curY: 0, cursorVisible: false };
}

function changedState(
  ui: MagnetsUi,
  oldState: MagnetsState | null,
  newState_: MagnetsState,
): void {
  if (oldState && !oldState.completed && newState_.completed) ui.cursorVisible = false;
}

const CYCLE_MAGNET = 0;
const CYCLE_NEUTRAL = 1;

function interpretMove(
  state: MagnetsState,
  ui: MagnetsUi,
  ds: MagnetsDrawState | null,
  p: Point,
  rawButton: number,
): MagnetsMove | null | UiUpdate {
  const { w, h, grid, flags, common } = state;
  const button = stripModifiers(rawButton);
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const fromCoord = (v: number) => Math.floor(v / ts) - 1; // NARROW_BORDERS: BORDER = 0

  let gx = fromCoord(p.x);
  let gy = fromCoord(p.y);
  let action: number;
  let nullret: null | UiUpdate = null;

  if (isCursorMove(button)) {
    const wasVisible = ui.cursorVisible;
    const moved = gridCursorMove(button, ui.curX, ui.curY, w, h);
    if (moved) {
      ui.curX = moved.x;
      ui.curY = moved.y;
    }
    ui.cursorVisible = true;
    return moved || !wasVisible ? UI_UPDATE : null;
  }
  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.cursorVisible) {
      ui.cursorVisible = true;
      return UI_UPDATE;
    }
    action = button === CURSOR_SELECT ? CYCLE_MAGNET : CYCLE_NEUTRAL;
    gx = ui.curX;
    gy = ui.curY;
  } else if (
    gx >= 0 &&
    gx < w &&
    gy >= 0 &&
    gy < h &&
    (button === LEFT_BUTTON || button === RIGHT_BUTTON)
  ) {
    if (ui.cursorVisible) {
      ui.cursorVisible = false;
      nullret = UI_UPDATE;
    }
    action = button === LEFT_BUTTON ? CYCLE_MAGNET : CYCLE_NEUTRAL;
  } else if (button === LEFT_BUTTON && isClue(w, h, gx, gy)) {
    return { type: "clue", clue: clueIndex(w, h, gx, gy) };
  } else {
    return null;
  }

  const idx = gy * w + gx;
  if (common.dominoes[idx] === idx) return nullret; // singleton
  const curr = grid[idx];

  if (action === CYCLE_MAGNET) {
    // empty → + → − → empty; can't cycle a magnet from a placed neutral.
    if (grid[idx] === NEUTRAL && flags[idx] & GS_SET) return nullret;
    if (curr === EMPTY) return { type: "set", idx, which: POSITIVE };
    if (curr === POSITIVE) return { type: "set", idx, which: NEGATIVE };
    return { type: "flag", idx, mode: "empty" };
  }
  // CYCLE_NEUTRAL — empty → neutral → not-neutral → empty; not from a magnet.
  if (grid[idx] !== NEUTRAL) return nullret;
  if (flags[idx] & GS_SET) return { type: "flag", idx, mode: "notneutral" };
  if (flags[idx] & GS_NOTNEUTRAL) return { type: "flag", idx, mode: "empty" };
  return { type: "flag", idx, mode: "neutral" };
}

function flashLength(
  oldState: MagnetsState,
  newState_: MagnetsState,
  _dir: number,
  _ui: MagnetsUi,
): number {
  return !oldState.completed &&
    newState_.completed &&
    !oldState.solved &&
    !newState_.solved
    ? FLASH_TIME
    : 0;
}

const CHAR2GRID = (c: string): number =>
  c === "+" ? POSITIVE : c === "-" ? NEGATIVE : NEUTRAL;

function solve(
  orig: MagnetsState,
  _curr: MagnetsState,
  aux?: string,
): ReturnType<NonNullable<Game<MagnetsParams, MagnetsState, MagnetsMove>["solve"]>> {
  const { wh, common } = orig;
  if (aux && aux.length === wh) {
    const solution = Array.from(aux, CHAR2GRID);
    return { ok: true, move: { type: "solve", solution } };
  }
  const solver = new MagnetsSolver(
    orig.w,
    orig.h,
    common.dominoes,
    common.rowcount,
    common.colcount,
  );
  const ret = solver.solve(DIFF_COUNT);
  if (ret > 0) {
    return { ok: true, move: { type: "solve", solution: Array.from(solver.grid) } };
  }
  return {
    ok: false,
    error: ret < 0 ? "Puzzle is impossible." : "Unable to solve puzzle.",
  };
}

/** Re-solve from the clues and flag every player-set cell whose value
 * contradicts the unique solution (blanks and not-neutral marks are never
 * mistakes; a non-uniquely-solvable board yields none). */
function findMistakes(state: MagnetsState): readonly MagnetsMistake[] {
  const { w, wh, grid, flags, common } = state;
  const solver = new MagnetsSolver(
    w,
    state.h,
    common.dominoes,
    common.rowcount,
    common.colcount,
  );
  if (solver.solve(DIFF_COUNT) <= 0) return [];
  const out: MagnetsMistake[] = [];
  for (let i = 0; i < wh; i++) {
    if (common.dominoes[i] === i) continue;
    if (flags[i] & GS_SET && grid[i] !== solver.grid[i]) {
      out.push({ x: i % w, y: Math.floor(i / w) });
    }
  }
  return out;
}

export const magnetsGame: Game<
  MagnetsParams,
  MagnetsState,
  MagnetsMove,
  MagnetsUi,
  MagnetsDrawState,
  MagnetsMistake
> = {
  id: "magnets",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  needsRightButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    ...dimensionParamConfig<MagnetsParams>(),
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
    {
      kw: "strip-clues",
      name: "Strip clues",
      type: "boolean",
      get: (p) => p.stripclues,
      set: (p, v) => {
        p.stripclues = v;
      },
    },
  ],
  describeParams: (p) => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: p.diff,
    "strip-clues": p.stripclues,
  }),

  newDesc: (p, rng: RandomState) => newMagnetsDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,

  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: MagnetsParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw: (dr, ds, prev, s, dir, ui, animTime, flashTime, _hint, mistakes) =>
    redraw(dr, ds, prev, s, dir, ui, animTime, flashTime, mistakes),

  flashLength,
};

registerGame(magnetsGame);
