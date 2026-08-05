/**
 * Ascent (Hidoku / Hidato) — native TS port. Implements the engine Game
 * interface. Port of `puzzles/unreleased/ascent.c` (© 2015 Lennard Sprong).
 */

import type { DifficultyContract } from "../../engine/difficulty.ts";
import type {
  Game,
  GamePref,
  ParamConfigItem,
  PresetMenu,
  SolveResult,
  UiUpdate,
} from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type {
  Colour,
  ConfigValues,
  GameStatus,
  Point,
  Size,
} from "../../engine/types.ts";
import { newAscentDesc } from "./generator.ts";
import { executeAscentMove } from "./moves.ts";
import {
  type AscentDrawState,
  ascentColours,
  ascentComputeSize,
  newAscentDrawState,
  redrawAscent,
  setAscentTileSize,
} from "./render.ts";
import { ascentSolve, SolverScratch } from "./solver.ts";
import {
  ASCENT_DIFFCHARS,
  ASCENT_DIFFNAMES,
  ASCENT_MODECHARS,
  ASCENT_MODENAMES,
  type AscentMistake,
  type AscentMove,
  type AscentParams,
  type AscentState,
  checkCompletion,
  cloneAscentState,
  DIFF_NORMAL,
  DIFFCOUNT,
  fromNumberEdge,
  isHexagonal,
  isNumberEdge,
  MODE_EDGES,
  MODE_HEXAGON,
  MODE_RECT,
  MODECOUNT,
  NUMBER_BOUND,
  NUMBER_EMPTY,
  NUMBER_WALL,
  newAscentState,
  validateAscentDesc,
} from "./state.ts";
import {
  type AscentUi,
  changedState,
  decodeAscentUi,
  encodeAscentUi,
  interpretAscentMove,
  newAscentUi,
} from "./ui.ts";

// --- presets -------------------------------------------------------

function mk(
  w: number,
  h: number,
  diff: number,
  mode: number,
  removeends: boolean,
  symmetrical: boolean,
): AscentParams {
  return { w, h, diff, mode, removeends, symmetrical };
}

const MAIN_PRESETS: AscentParams[] = [
  mk(7, 6, 0, MODE_RECT, false, false),
  mk(7, 6, 1, MODE_RECT, false, false),
  mk(7, 6, 2, MODE_RECT, false, false),
  mk(7, 6, 3, MODE_RECT, false, false),
  mk(10, 8, 0, MODE_RECT, false, false),
  mk(10, 8, 1, MODE_RECT, false, false),
  mk(10, 8, 2, MODE_RECT, false, false),
  mk(10, 8, 3, MODE_RECT, false, false),
  mk(5, 5, 1, MODE_EDGES, true, false),
  mk(5, 5, 2, MODE_EDGES, true, false),
  mk(5, 5, 3, MODE_EDGES, true, false),
];

const HONEYCOMB_PRESETS: AscentParams[] = [
  mk(7, 6, 1, 3, false, false),
  mk(7, 6, 2, 3, false, false),
  mk(7, 6, 3, 3, false, false),
  mk(10, 8, 1, 3, false, false),
  mk(10, 8, 2, 3, false, false),
  mk(10, 8, 3, 3, false, false),
];

const HEXAGON_PRESETS: AscentParams[] = [
  mk(7, 7, 1, MODE_HEXAGON, false, false),
  mk(7, 7, 2, MODE_HEXAGON, false, false),
  mk(7, 7, 3, MODE_HEXAGON, false, false),
  mk(9, 9, 1, MODE_HEXAGON, false, false),
  mk(9, 9, 2, MODE_HEXAGON, false, false),
  mk(9, 9, 3, MODE_HEXAGON, false, false),
];

function presetTitle(p: AscentParams): string {
  return `${p.w}x${p.h} ${p.mode === MODE_EDGES ? "Edges " : ""}${ASCENT_DIFFNAMES[p.diff]}`;
}

function presets(): PresetMenu<AscentParams> {
  return {
    title: "Ascent",
    submenu: [
      ...MAIN_PRESETS.map((p) => ({ title: presetTitle(p), params: p })),
      {
        title: "Honeycomb",
        submenu: HONEYCOMB_PRESETS.map((p) => ({
          title: `${p.w}x${p.h} Honeycomb ${ASCENT_DIFFNAMES[p.diff]}`,
          params: p,
        })),
      },
      {
        title: "Hexagon",
        submenu: HEXAGON_PRESETS.map((p) => ({
          title: `Size ${p.w} Hexagon ${ASCENT_DIFFNAMES[p.diff]}`,
          params: p,
        })),
      },
    ],
  };
}

// --- params codec --------------------------------------------------

function defaultParams(): AscentParams {
  return { ...MAIN_PRESETS[0] };
}

function encodeParams(p: AscentParams, full: boolean): string {
  let out = `${p.w}x${p.h}m${ASCENT_MODECHARS[p.mode]}`;
  if (full && p.removeends) out += "E";
  if (full) {
    out += `d${ASCENT_DIFFCHARS[p.diff]}`;
    if (p.symmetrical && p.mode !== MODE_EDGES) out += "S";
  }
  return out;
}

const isDigitCh = (c: string) => c >= "0" && c <= "9";

function decodeParams(s: string): AscentParams {
  const p = defaultParams();
  let i = 0;

  let numStr = "";
  while (i < s.length && isDigitCh(s[i])) numStr += s[i++];
  p.w = p.h = Number.parseInt(numStr || "0", 10);

  if (s[i] === "x") {
    i++;
    numStr = "";
    while (i < s.length && isDigitCh(s[i])) numStr += s[i++];
    p.h = Number.parseInt(numStr || "0", 10);
  }
  if (s[i] === "m") {
    i++;
    p.mode = MODECOUNT + 1; /* invalid until matched */
    if (i < s.length) {
      for (let m = 0; m < MODECOUNT; m++) if (s[i] === ASCENT_MODECHARS[m]) p.mode = m;
      i++;
    }
  }
  if (s[i] === "E") {
    p.removeends = true;
    i++;
  }
  if (s[i] === "d") {
    i++;
    p.diff = DIFFCOUNT + 1; /* invalid until matched */
    if (i < s.length) {
      for (let d = 0; d < DIFFCOUNT; d++) if (s[i] === ASCENT_DIFFCHARS[d]) p.diff = d;
      i++;
    }
  } else if (p.mode === MODE_EDGES) {
    p.diff = Math.max(p.diff, DIFF_NORMAL);
  }

  if (s[i] === "S") {
    p.symmetrical = true;
    i++;
  } else {
    p.symmetrical = false;
  }

  return p;
}

function validateParams(p: AscentParams, full: boolean): string | null {
  const { w, h } = p;
  if (w * h >= 1000) return "Puzzle is too large";
  if (w < 2) return "Width must be at least 2";
  if (h < 2) return "Height must be at least 2";
  if (w > 50) return "Width must be no more than 50";
  if (h > 50) return "Height must be no more than 50";
  if (p.mode === MODE_HEXAGON && (h & 1) === 0) return "Height must be an odd number";
  if (p.mode === MODE_HEXAGON && w <= Math.trunc(h / 2))
    return "Width is too low for hexagon grid";
  if (p.mode === MODE_EDGES && w === 2 && h === 2)
    return "Grid for Edges mode must be bigger than 2x2";
  if (full && p.mode === MODE_EDGES && p.diff < DIFF_NORMAL)
    return "Difficulty level for Edges mode must be at least Normal";
  if (full && p.symmetrical && p.mode === MODE_EDGES)
    return "Symmetrical clues must be disabled for Edges mode";
  return null;
}

function describeParams(p: AscentParams): ConfigValues {
  return {
    width: p.w,
    height: p.h,
    "grid-type": p.mode,
    difficulty: p.diff,
    "always-show-start-and-end-points": p.removeends ? 0 : 1,
    "symmetrical-clues": p.symmetrical ? 1 : 0,
  };
}

const paramConfig: ParamConfigItem<AscentParams>[] = [
  ...dimensionParamConfig<AscentParams>(),
  {
    kw: "always-show-start-and-end-points",
    name: "Always show start and end points",
    type: "boolean",
    get: (p) => !p.removeends,
    set: (p, v) => {
      p.removeends = !v;
    },
  },
  {
    kw: "symmetrical-clues",
    name: "Symmetrical clues",
    type: "boolean",
    get: (p) => p.symmetrical,
    set: (p, v) => {
      p.symmetrical = v;
    },
  },
  {
    kw: "grid-type",
    name: "Grid type",
    type: "choices",
    choices: ASCENT_MODENAMES,
    get: (p) => p.mode,
    set: (p, v) => {
      p.mode = v;
    },
  },
  {
    kw: "difficulty",
    name: "Difficulty",
    type: "choices",
    choices: ASCENT_DIFFNAMES,
    get: (p) => p.diff,
    set: (p, v) => {
      p.diff = v;
    },
  },
];

/** Ascent's difficulty contract (`engine/difficulty.ts`). `ascentSolve` reports
 * nothing itself — it deduces into `sc.grid` and the caller asks
 * `checkCompletion`, exactly as the generator's tier gate does — so there is no
 * "impossible" verdict to map. **The scratch is fresh per call**: its
 * `foundEndpoints` deliberately persists and permanently weakens the solver, and
 * reusing one is the defect `grade-difficulty-tiers-honestly` hit here first. */
const difficulty: DifficultyContract<AscentParams> = {
  tiers: ASCENT_DIFFNAMES,
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const s = newAscentState(p, desc);
    const sc = new SolverScratch(s.w, s.h, s.mode, s.last);
    ascentSolve(s.grid, cap, sc);
    return checkCompletion(sc.grid, s.w, s.h, s.mode) ? "solved" : "unsolved";
  },
};

const prefs: GamePref<AscentUi>[] = [
  {
    kw: "numpad",
    name: "Numpad inputs",
    type: "choices",
    choices: ["Enter numbers", "Move cursor"],
    get: (ui) => (ui.moveWithNumpad ? 1 : 0),
    set: (ui, v) => {
      ui.moveWithNumpad = v === 1;
    },
  },
  {
    kw: "auto-advance-runs",
    name: "Skip past already-placed numbers when advancing",
    type: "boolean",
    get: (ui) => ui.autoAdvanceRuns,
    set: (ui, v) => {
      ui.autoAdvanceRuns = v;
    },
  },
];

// --- solve & mistakes ----------------------------------------------

function solve(orig: AscentState): SolveResult<AscentMove> {
  const sc = new SolverScratch(orig.w, orig.h, orig.mode, orig.last);
  ascentSolve(orig.grid, DIFFCOUNT, sc);
  const grid: number[] = new Array(orig.w * orig.h);
  for (let i = 0; i < grid.length; i++)
    grid[i] = sc.grid[i] >= 0 ? sc.grid[i] : NUMBER_EMPTY;
  return { ok: true, move: { kind: "solve", grid } };
}

function findMistakes(state: AscentState): readonly AscentMistake[] {
  const w = state.w;
  const h = state.h;
  const s = w * h;
  const clues = new Int16Array(s);
  for (let i = 0; i < s; i++)
    clues[i] = state.immutable[i] ? state.grid[i] : NUMBER_EMPTY;

  const sc = new SolverScratch(w, h, state.mode, state.last);
  ascentSolve(clues, DIFFCOUNT, sc);
  if (!checkCompletion(sc.grid, w, h, state.mode)) return [];

  const out: AscentMistake[] = [];
  for (let i = 0; i < s; i++) {
    if (!state.immutable[i] && state.grid[i] >= 0 && sc.grid[i] !== state.grid[i])
      out.push({ cell: i });
  }
  return out;
}

// --- text format ---------------------------------------------------

function textFormat(state: AscentState): string | undefined {
  if (isHexagonal(state.mode)) return undefined; // game_can_format_as_text_now
  const w = state.w;
  const h = state.h;
  const space = w * h >= 100 ? 3 : 2;
  let out = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = state.grid[y * w + x];
      if (isNumberEdge(n)) n = fromNumberEdge(n);
      let cell: string;
      if (n >= 0) cell = String(n + 1);
      else if (n === NUMBER_WALL) cell = "#";
      else if (n === NUMBER_BOUND) cell = " ";
      else cell = ".";
      out += cell.padStart(space, " ");
      out += x < w - 1 ? " " : "\n";
    }
  }
  return out;
}

// --- flash ---------------------------------------------------------

const FLASH_FRAME = 0.03;
const FLASH_SIZE = 4;

function flashLength(a: AscentState, b: AscentState): number {
  if (!a.completed && b.completed && !a.cheated && !b.cheated)
    return FLASH_FRAME * (b.w * b.h + FLASH_SIZE);
  return 0;
}

// --- Game object ---------------------------------------------------

export const ascentGame: Game<
  AscentParams,
  AscentState,
  AscentMove,
  AscentUi,
  AscentDrawState,
  AscentMistake
> = {
  id: "ascent",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  needsRightButton: true,
  preferredTileSize: 48,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  describeParams,
  paramConfig,
  prefs,

  newDesc(p: AscentParams, rng: RandomState): { desc: string } {
    return newAscentDesc(p, rng);
  },
  validateDesc(p: AscentParams, desc: string): string | null {
    return validateAscentDesc(p, desc);
  },
  newState(p: AscentParams, desc: string): AscentState {
    return newAscentState(p, desc);
  },
  newUi(state: AscentState): AscentUi {
    return newAscentUi(state);
  },
  changedState(ui, oldState, newState): void {
    changedState(ui, oldState, newState);
  },
  encodeUi(ui: AscentUi): string {
    return encodeAscentUi(ui);
  },
  decodeUi(ui: AscentUi, encoded: string): void {
    decodeAscentUi(ui, encoded);
  },

  interpretMove(
    s: AscentState,
    ui: AscentUi,
    ds: AscentDrawState | null,
    p: Point,
    button: number,
  ): AscentMove | null | UiUpdate {
    return interpretAscentMove(s, ui, ds, p, button);
  },
  executeMove(s: AscentState, m: AscentMove): AscentState {
    return executeAscentMove(s, m);
  },

  solve(orig: AscentState): SolveResult<AscentMove> {
    return solve(orig);
  },
  findMistakes,
  difficulty,
  textFormat,

  status(s: AscentState): GameStatus {
    return s.completed ? "solved" : "ongoing";
  },

  colours(defaultBackground: Colour): Colour[] {
    return ascentColours(defaultBackground);
  },
  computeSize(p: AscentParams, tileSize: number): Size {
    return ascentComputeSize(p.w, p.h, p.mode, tileSize);
  },
  setTileSize(ds: AscentDrawState, tileSize: number): void {
    setAscentTileSize(ds, tileSize);
  },
  newDrawState(s: AscentState): AscentDrawState {
    return newAscentDrawState(s);
  },
  redraw(dr, ds, prev, s, dir, ui, animTime, flashTime, hint, mistakes): void {
    redrawAscent(dr, ds, prev, s, dir, ui, animTime, flashTime, hint, mistakes);
  },
  flashLength,
};

// `cloneAscentState` is exported for tests.
export { cloneAscentState };

registerGame(ascentGame);
