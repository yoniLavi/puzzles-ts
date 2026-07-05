/**
 * Signpost — native TS port of `puzzles/signpost.c` (the "arrow path"
 * puzzle). Every cell carries an arrow and some cells carry immutable
 * sequence numbers; link the cells into a single chain 1..n where every
 * link follows its cell's arrow and the numbers run consecutively.
 *
 * Idiomatic port: immutable state cloned per move, a discriminated
 * `SignpostMove`, the `Dsf` engine leaf for region binding, a
 * blitter-backed drag sprite (as Pegs). The logic mirrors the C
 * reference; it is not a control-flow transliteration.
 */

import type { Colour, GameStatus, Point, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GamePref } from "../../engine/game.ts";
import {
  fromCoord as fromCoordE,
  type Game,
  type GameDrawing,
  type HintStep,
  type ParamConfigItem,
  registerGame,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/index.ts";
import { dimensionParamConfig, parseDimensions } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../random/index.ts";
import { newSignpostDesc } from "./generator.ts";
import { dragReleaseMove, executeMove } from "./moves.ts";
import { buildPalette, redrawSignpost } from "./render.ts";
import { solveState } from "./solver.ts";
import {
  checkCompletion,
  cloneState,
  FLAG_IMMUTABLE,
  type SignpostDrawState,
  type SignpostMistake,
  type SignpostMove,
  type SignpostParams,
  type SignpostState,
  type SignpostUi,
  stripNums,
  unpickDesc,
  updateNumbers,
} from "./state.ts";

// --- geometry --------------------------------------------------------

const PREFERRED_TILE_SIZE = 48;
const BORDER = 1; // NARROW_BORDERS (webapp.cmake)
const FLASH_SPIN = 0.7;

const coord = (x: number, ts: number): number => x * ts + BORDER;
const fromCoord = (px: number, ts: number): number => fromCoordE(px, ts, BORDER);

// --- presets ---------------------------------------------------------

const SIGNPOST_PRESETS: SignpostParams[] = [
  { w: 4, h: 4, forceCornerStart: true },
  { w: 4, h: 4, forceCornerStart: false },
  { w: 5, h: 5, forceCornerStart: true },
  { w: 5, h: 5, forceCornerStart: false },
  { w: 6, h: 6, forceCornerStart: true },
  { w: 7, h: 7, forceCornerStart: true },
];

function presetName(p: SignpostParams): string {
  return `${p.w}x${p.h}${p.forceCornerStart ? "" : ", free ends"}`;
}

// --- params ----------------------------------------------------------

function defaultParams(): SignpostParams {
  return { w: 4, h: 4, forceCornerStart: true };
}

function encodeParams(p: SignpostParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full && p.forceCornerStart) s += "c";
  return s;
}

function decodeParams(s: string): SignpostParams {
  const { w, h, next } = parseDimensions(s, 0);
  const forceCornerStart = s[next] === "c";
  return { w, h, forceCornerStart };
}

function validateParams(p: SignpostParams, full: boolean): string | null {
  if (p.w < 1) return "Width must be at least one";
  if (p.h < 1) return "Height must be at least one";
  if (p.w > 2147483647 / p.h) {
    return "Width times height must not be unreasonably large";
  }
  if (full && p.w === 1 && p.h === 1) return "Width and height cannot both be one";
  return null;
}

const paramConfig: ParamConfigItem<SignpostParams>[] = [
  ...dimensionParamConfig<SignpostParams>(),
  {
    kw: "start-and-end-in-corners",
    name: "Start and end in corners",
    type: "boolean",
    get: (p) => p.forceCornerStart,
    set: (p, v) => {
      p.forceCornerStart = v;
    },
  },
];

// --- desc / state ----------------------------------------------------

function validateDesc(p: SignpostParams, desc: string): string | null {
  const r = unpickDesc(p, desc);
  return "error" in r ? r.error : null;
}

function newState(p: SignpostParams, desc: string): SignpostState {
  const r = unpickDesc(p, desc);
  if ("error" in r) throw new Error(`signpost newState: ${r.error}`);
  const s = r.state;
  // Upstream `new_game` finalisation: derive numbers and auto-link
  // consecutive immutable numbers.
  updateNumbers(s);
  checkCompletion(s, true);
  return s;
}

function newUi(_state: SignpostState): SignpostUi {
  return {
    cx: 0,
    cy: 0,
    cshow: false,
    dragging: false,
    dragIsFrom: false,
    sx: 0,
    sy: 0,
    dx: 0,
    dy: 0,
    gearMode: false,
  };
}

function changedState(
  ui: SignpostUi,
  oldState: SignpostState | null,
  next: SignpostState,
): void {
  if (oldState && !oldState.completed && next.completed) {
    ui.cshow = false;
    ui.dragging = false;
  }
}

// --- input -----------------------------------------------------------

function interpretMove(
  s: SignpostState,
  ui: SignpostUi,
  ds: SignpostDrawState | null,
  p: Point,
  button: number,
): SignpostMove | null | UiUpdate {
  const { w, h } = s;
  const ts = ds?.tileSize ?? PREFERRED_TILE_SIZE;

  if (isCursorMove(button)) {
    const delta = cursorDelta(button);
    if (!delta) return null;
    let changed = false;
    if (!ui.cshow) {
      ui.cshow = true;
      changed = true;
    } else {
      const nx = Math.max(0, Math.min(w - 1, ui.cx + delta.dx));
      const ny = Math.max(0, Math.min(h - 1, ui.cy + delta.dy));
      if (nx !== ui.cx || ny !== ui.cy) {
        ui.cx = nx;
        ui.cy = ny;
        changed = true;
      }
    }
    if (ui.dragging) {
      ui.dx = coord(ui.cx, ts) + ts / 2;
      ui.dy = coord(ui.cy, ts) + ts / 2;
    }
    return changed || ui.dragging ? UI_UPDATE : null;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.cshow) {
      ui.cshow = true;
      return UI_UPDATE;
    }
    if (ui.dragging) {
      ui.dragging = false;
      if (ui.sx === ui.cx && ui.sy === ui.cy) return UI_UPDATE;
      const m = ui.dragIsFrom
        ? linkIfValid(s, ui.sx, ui.sy, ui.cx, ui.cy)
        : linkIfValid(s, ui.cx, ui.cy, ui.sx, ui.sy);
      return m ?? UI_UPDATE;
    }
    ui.dragging = true;
    ui.sx = ui.cx;
    ui.sy = ui.cy;
    ui.dx = coord(ui.cx, ts) + ts / 2;
    ui.dy = coord(ui.cy, ts) + ts / 2;
    ui.dragIsFrom = button === CURSOR_SELECT;
    return UI_UPDATE;
  }

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    if (ui.cshow) {
      ui.cshow = false;
      ui.dragging = false;
    }
    const x = fromCoord(p.x, ts);
    const y = fromCoord(p.y, ts);
    if (x < 0 || x >= w || y < 0 || y >= h) return null;
    const si = y * w + x;
    if (button === LEFT_BUTTON) {
      if (s.nums[si] === s.n && s.flags[si] & FLAG_IMMUTABLE) return null;
    } else if (s.nums[si] === 1 && s.flags[si] & FLAG_IMMUTABLE) {
      return null;
    }
    ui.dragging = true;
    ui.dragIsFrom = button === LEFT_BUTTON;
    ui.sx = x;
    ui.sy = y;
    ui.dx = p.x;
    ui.dy = p.y;
    ui.cshow = false;
    return UI_UPDATE;
  }

  if ((button === LEFT_DRAG || button === RIGHT_DRAG) && ui.dragging) {
    ui.dx = p.x;
    ui.dy = p.y;
    return UI_UPDATE;
  }

  if ((button === LEFT_RELEASE || button === RIGHT_RELEASE) && ui.dragging) {
    ui.dragging = false;
    const x = fromCoord(p.x, ts);
    const y = fromCoord(p.y, ts);
    return dragReleaseMove(s, ui, x, y) ?? UI_UPDATE;
  }

  // 'x' / 'X' key: unlink at the cursor.
  if ((button === 120 || button === 88) && ui.cshow) {
    const si = ui.cy * w + ui.cx;
    if (s.prev[si] === -1 && s.next[si] === -1) return UI_UPDATE;
    return button === 120
      ? { type: "unlinkNext", x: ui.cx, y: ui.cy }
      : { type: "unlinkPrev", x: ui.cx, y: ui.cy };
  }

  return null;
}

/** A forward-link move (from → to) if valid, else null. Reuses the
 * drag-release logic with a synthetic forward drag. */
function linkIfValid(
  s: SignpostState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): SignpostMove | null {
  return dragReleaseMove(
    s,
    { sx: fromX, sy: fromY, dragIsFrom: true } as SignpostUi,
    toX,
    toY,
  );
}

// --- solve / mistakes ------------------------------------------------

function solve(orig: SignpostState, curr: SignpostState): SolveResult<SignpostMove> {
  const fromCurr = cloneState(curr);
  if (solveState(fromCurr) > 0) {
    return { ok: true, move: { type: "solve", next: Array.from(fromCurr.next) } };
  }
  const fromOrig = cloneState(orig);
  const r = solveState(fromOrig);
  if (r < 0) return { ok: false, error: "Puzzle is impossible." };
  if (r === 0) return { ok: false, error: "Unable to solve puzzle." };
  return { ok: true, move: { type: "solve", next: Array.from(fromOrig.next) } };
}

/** Re-solve from the immutable clues; flag every player link that
 * disagrees with the unique solution. */
function findMistakes(state: SignpostState): readonly SignpostMistake[] {
  const copy = cloneState(state);
  stripNums(copy);
  if (solveState(copy) !== 1) return [];
  const mistakes: SignpostMistake[] = [];
  for (let i = 0; i < state.n; i++) {
    if (state.next[i] !== -1 && state.next[i] !== copy.next[i]) {
      mistakes.push({ kind: "link", index: i });
    }
  }
  return mistakes;
}

// --- status / text ---------------------------------------------------

function status(s: SignpostState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

const DIR_STRINGS = ["N ", "NE", "E ", "SE", "S ", "SW", "W ", "NW"] as const;

function textFormat(s: SignpostState): string {
  const { w, h, n } = s;
  let ret = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      ret += DIR_STRINGS[s.dirs[i]];
      ret += s.flags[i] & FLAG_IMMUTABLE ? "I" : " ";
      ret += " ";
    }
    ret += "\n";
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const num = s.nums[i];
      if (num === 0) {
        ret += "   ";
      } else {
        const nn = num % (n + 1);
        const set = Math.floor(num / (n + 1));
        if (set !== 0) ret += String.fromCharCode(set + 96); // 'a' - 1 + set
        ret += nn >= 10 ? String(Math.floor(nn / 10)) : " ";
        ret += String(nn % 10);
        if (set === 0) ret += " ";
      }
      ret += " ";
    }
    ret += "\n\n";
  }
  return ret;
}

// --- preferences -----------------------------------------------------

const prefs: GamePref<SignpostUi>[] = [
  {
    kw: "flash-type",
    name: "Victory rotation effect",
    type: "choices",
    choices: ["Unidirectional", "Meshing gears"],
    get: (ui) => (ui.gearMode ? 1 : 0),
    set: (ui, v) => {
      ui.gearMode = v === 1;
    },
  },
];

// --- rendering plumbing ----------------------------------------------

function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  return buildPalette(background, highlight, lowlight);
}

function computeSize(p: SignpostParams, ts: number): Size {
  return { w: ts * p.w + 2 * BORDER, h: ts * p.h + 2 * BORDER };
}

function setTileSize(ds: SignpostDrawState, ts: number): void {
  if (ds.tileSize !== ts) {
    ds.tileSize = ts;
    ds.started = false;
    ds.cache.fill(-1);
    ds.nums.fill(-1);
    ds.dirp.fill(-2);
  }
}

function newDrawState(s: SignpostState): SignpostDrawState {
  return {
    started: false,
    tileSize: 0,
    w: s.w,
    h: s.h,
    n: s.n,
    cache: new Int32Array(s.n).fill(-1),
    nums: new Int32Array(s.n).fill(-1),
    dirp: new Int32Array(s.n).fill(-2),
    angleOffset: 0,
    dragging: false,
    dragBackground: null,
    dragX: 0,
    dragY: 0,
  };
}

function flashLength(a: SignpostState, b: SignpostState): number {
  if (!a.completed && b.completed && !b.usedSolve) return FLASH_SPIN;
  return 0;
}

// --- register --------------------------------------------------------

export const signpostGame: Game<
  SignpostParams,
  SignpostState,
  SignpostMove,
  SignpostUi,
  SignpostDrawState,
  SignpostMistake
> = {
  id: "signpost",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets() {
    return {
      title: "Signpost",
      submenu: SIGNPOST_PRESETS.map((p) => ({ title: presetName(p), params: p })),
    };
  },
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig,
  describeParams: (p) => ({ "start-and-end-in-corners": p.forceCornerStart }),

  newDesc(p: SignpostParams, rng: RandomState) {
    return newSignpostDesc(p, rng);
  },
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

  prefs,

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw(
    dr: GameDrawing,
    ds: SignpostDrawState | null,
    prev: SignpostState | null,
    s: SignpostState,
    dir: number,
    ui: SignpostUi,
    animTime: number,
    flashTime: number,
    _hint?: HintStep<SignpostMove>,
    mistakes?: readonly SignpostMistake[],
  ): void {
    redrawSignpost(dr, ds, prev, s, dir, ui, animTime, flashTime, mistakes);
  },
  flashLength,
  animLength: () => 0,
};

registerGame(signpostGame);
