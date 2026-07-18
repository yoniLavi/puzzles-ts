/**
 * Map (`map.c`) — native TS port. Colour every region of a map so no two
 * adjacent regions share a colour, given some regions pre-coloured as clues.
 *
 * Press picks up the colour of the region under the pointer (or, on a blank
 * region, its pencil marks) into a floating drag blob; release drops it onto
 * the region under the pointer. A right-drag from a colour onto a blank region
 * toggles one pencil bit; a keyboard cursor picks/drops via select. The
 * diagonally-split-cell quadrant hit-test (`region_from_coords`) is ported
 * exactly. A drop that changes nothing produces no move (local no-op
 * suppression — no state-string undo).
 */

import type { Colour, GameStatus, Point, Size } from "../../../puzzle/types.ts";
import type { Game, SolveResult, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newMapDesc } from "./generator.ts";
import { newMapData, validateDesc } from "./map-data.ts";
import {
  colours,
  computeSize,
  flashLengthFromUi,
  type MapDrawState,
  newDrawState,
  redraw,
  regionFromCoords,
  regionFromUiCursor,
  setTileSize,
} from "./render.ts";
import { gradeMap, mapSolver, SOLVER_UNIQUE } from "./solver.ts";
import {
  cloneState,
  DIFF_NAMES,
  DIFFCOUNT,
  decodeParams,
  defaultParams,
  encodeParams,
  type MapMistake,
  type MapMove,
  type MapOp,
  type MapParams,
  type MapState,
  type MapUi,
  newUi,
  presets,
  validateParams,
} from "./state.ts";

const FOUR = 4;

// --- new state -------------------------------------------------------

function newState(p: MapParams, desc: string): MapState {
  const { map, colouring } = newMapData(p, desc);
  return {
    params: p,
    map,
    colouring,
    pencil: new Int32Array(p.n),
    completed: false,
    cheated: false,
  };
}

// --- cursor ----------------------------------------------------------

/** Upstream `move_cursor` (no wrap): clamp-move; always sets the position. */
function moveCursor(ui: MapUi, button: number, w: number, h: number): void {
  let dx = 0;
  let dy = 0;
  if (button === 0x0209) dy = -1;
  else if (button === 0x020a) dy = 1;
  else if (button === 0x020c) dx = 1;
  else if (button === 0x020b) dx = -1;
  ui.curX = Math.min(Math.max(ui.curX + dx, 0), w - 1);
  ui.curY = Math.min(Math.max(ui.curY + dy, 0), h - 1);
}

// --- moves -----------------------------------------------------------

/** Build the ops for dropping colour `c`/pencil `p` on region `r`, or null
 * for a no-op (upstream `drag_dropped`). */
function dragOps(
  state: MapState,
  r: number,
  c: number,
  p: number,
  altButton: boolean,
): MapMove | UiUpdate {
  if (r < 0) return UI_UPDATE; // drag into border
  if (state.map.immutable[r]) return UI_UPDATE; // can't change a clue
  if (state.colouring[r] === c && state.pencil[r] === p) return UI_UPDATE; // no change

  if (altButton) {
    if (state.colouring[r] >= 0) return UI_UPDATE; // can't pencil a coloured region
    if (c >= 0) {
      // Right-drag from a colour onto a blank toggles one pencil.
      p = state.pencil[r] ^ (1 << c);
      c = -1;
    }
    // Otherwise, right-drag blank→blank == left-drag.
  }

  const ops: MapOp[] = [];
  let oldp = state.pencil[r];
  if (c !== state.colouring[r]) {
    ops.push({ op: "colour", region: r, colour: c < 0 ? null : c });
    if (c >= 0) oldp = 0;
  }
  if (p !== oldp) {
    for (let i = 0; i < FOUR; i++)
      if ((oldp ^ p) & (1 << i)) ops.push({ op: "pencil", region: r, bit: i });
  }

  if (ops.length === 0) return UI_UPDATE;
  return { ops };
}

function interpretMove(
  state: MapState,
  ui: MapUi,
  ds: MapDrawState | null,
  point: Point,
  rawButton: number,
): MapMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state.params;
  const ts = ds?.tileSize ?? 20;

  // Toggle region numbers.
  if (button === 108 || button === 76) {
    ui.showNumbers = !ui.showNumbers;
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    moveCursor(ui, button, w, h);
    ui.curVisible = true;
    ui.curMoved = true;
    ui.curLastmove = button;
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.curVisible) {
      ui.curVisible = true;
      return UI_UPDATE;
    }
    if (ui.dragColour === -2) {
      // Start a cursor drag: pick up the region under the cursor.
      const r = regionFromUiCursor(state.map, ui);
      if (r >= 0) {
        ui.dragColour = state.colouring[r];
        ui.dragPencil = ui.dragColour >= 0 ? 0 : state.pencil[r];
      } else {
        ui.dragColour = -1;
        ui.dragPencil = 0;
      }
      ui.curMoved = false;
      return UI_UPDATE;
    }
    // Drop the held colour into the region under the cursor.
    const altButton = button === CURSOR_SELECT2;
    if (!ui.curMoved) ui.dragColour = -1; // double-select removes the colour
    const r = regionFromUiCursor(state.map, ui);
    const c = ui.dragColour;
    const p = ui.dragPencil;
    ui.dragColour = -2;
    return dragOps(state, r, c, p, altButton);
  }

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    const r = regionFromCoords(state.map, ts, point.x, point.y);
    if (r >= 0) {
      ui.dragColour = state.colouring[r];
      ui.dragPencil = state.pencil[r];
      if (ui.dragColour >= 0) ui.dragPencil = 0;
    } else {
      ui.dragColour = -1;
      ui.dragPencil = 0;
    }
    ui.dragx = point.x;
    ui.dragy = point.y;
    ui.curVisible = false;
    return UI_UPDATE;
  }

  if ((button === LEFT_DRAG || button === RIGHT_DRAG) && ui.dragColour > -2) {
    ui.dragx = point.x;
    ui.dragy = point.y;
    return UI_UPDATE;
  }

  if ((button === LEFT_RELEASE || button === RIGHT_RELEASE) && ui.dragColour > -2) {
    const altButton = button === RIGHT_RELEASE;
    const r = regionFromCoords(state.map, ts, point.x, point.y);
    const c = ui.dragColour;
    const p = ui.dragPencil;
    ui.dragColour = -2;
    return dragOps(state, r, c, p, altButton);
  }

  return null;
}

function isComplete(s: MapState): boolean {
  const n = s.params.n;
  for (let i = 0; i < n; i++) if (s.colouring[i] < 0) return false;
  const { graph, ngraph } = s.map;
  for (let i = 0; i < ngraph; i++) {
    const j = Math.floor(graph[i] / n);
    const k = graph[i] % n;
    if (s.colouring[j] === s.colouring[k]) return false;
  }
  return true;
}

function executeMove(s: MapState, m: MapMove): MapState {
  const ret = cloneState(s);
  for (const op of m.ops) {
    if (op.op === "colour") {
      ret.colouring[op.region] = op.colour ?? -1;
      ret.pencil[op.region] = 0;
    } else {
      // pencil toggle — illegal on a coloured region (upstream returns NULL).
      if (ret.colouring[op.region] >= 0)
        throw new Error("map: pencil on a coloured region");
      ret.pencil[op.region] ^= 1 << op.bit;
    }
  }
  if (m.solve) return { ...ret, cheated: true };

  if (!ret.completed && isComplete(ret)) return { ...ret, completed: true };
  return ret;
}

function status(s: MapState): GameStatus {
  return s.completed ? "solved" : "ongoing";
}

// --- solve / mistakes ------------------------------------------------

/** The clue colouring: clue colours at immutable regions, -1 elsewhere. */
function clueColouring(s: MapState): Int32Array {
  const n = s.params.n;
  const clues = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (s.map.immutable[i]) clues[i] = s.colouring[i];
  return clues;
}

/** Parse a generator `aux` (`"S;c:r;c:r;…"`) into a solution colouring. */
function solutionFromAux(aux: string, n: number): Int32Array {
  const sol = new Int32Array(n).fill(-1);
  for (const tok of aux.split(";")) {
    if (tok === "S" || tok === "") continue;
    const [c, r] = tok.split(":");
    sol[Number(r)] = Number(c);
  }
  return sol;
}

function solveToMove(curr: MapState, solution: Int32Array): SolveResult<MapMove> {
  const n = curr.params.n;
  const ops: MapOp[] = [];
  for (let i = 0; i < n; i++)
    if (solution[i] >= 0 && solution[i] !== curr.colouring[i])
      ops.push({ op: "colour", region: i, colour: solution[i] });
  return { ok: true, move: { ops, solve: true } };
}

function solve(orig: MapState, curr: MapState, aux?: string): SolveResult<MapMove> {
  const n = orig.params.n;
  if (aux) return solveToMove(curr, solutionFromAux(aux, n));

  const colouring = clueColouring(orig);
  const ret = mapSolver(orig.map.graph, n, orig.map.ngraph, colouring, DIFFCOUNT - 1);
  if (ret !== SOLVER_UNIQUE) {
    return {
      ok: false,
      error:
        ret === 0
          ? "Puzzle is inconsistent"
          : "Unable to find a unique solution for this puzzle",
    };
  }
  return solveToMove(curr, colouring);
}

/**
 * Boards are uniquely solvable, so any region coloured against the unique
 * solution is a definite mistake (design D6). Re-solve from the clues; if not
 * unique, report none.
 */
function findMistakes(state: MapState): readonly MapMistake[] {
  const n = state.params.n;
  const colouring = clueColouring(state);
  if (
    mapSolver(state.map.graph, n, state.map.ngraph, colouring, DIFFCOUNT - 1) !==
    SOLVER_UNIQUE
  )
    return [];

  const out: MapMistake[] = [];
  for (let i = 0; i < n; i++)
    if (state.colouring[i] >= 0 && state.colouring[i] !== colouring[i])
      out.push({ region: i });
  return out;
}

// --- flash -----------------------------------------------------------

function flashLength(
  oldState: MapState,
  newState_: MapState,
  _dir: number,
  ui: MapUi,
): number {
  return !oldState.completed && newState_.completed && !newState_.cheated
    ? flashLengthFromUi(ui)
    : 0;
}

// --- register --------------------------------------------------------

export const mapGame: Game<
  MapParams,
  MapState,
  MapMove,
  MapUi,
  MapDrawState,
  MapMistake
> = {
  id: "map",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,
  needsRightButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    {
      kw: "width",
      name: "Width",
      type: "string",
      get: (p) => String(p.w),
      set: (p, v) => {
        p.w = parseConfigInt(v);
      },
    },
    {
      kw: "height",
      name: "Height",
      type: "string",
      get: (p) => String(p.h),
      set: (p, v) => {
        p.h = parseConfigInt(v);
      },
    },
    {
      kw: "regions",
      name: "Regions",
      type: "string",
      get: (p) => String(p.n),
      set: (p, v) => {
        p.n = parseConfigInt(v);
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
  describeParams: (p) => ({
    width: String(p.w),
    height: String(p.h),
    regions: String(p.n),
    difficulty: p.diff,
  }),

  newDesc: (p: MapParams, rng: RandomState) => newMapDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,

  prefs: [
    {
      kw: "flash-type",
      name: "Victory flash effect",
      type: "choices",
      choices: ["Cyclic", "Each to white", "All to white"],
      get: (ui) => ui.flashType,
      set: (ui, v) => {
        ui.flashType = v;
      },
    },
    {
      kw: "show-numbers",
      name: "Number regions",
      type: "boolean",
      get: (ui) => ui.showNumbers,
      set: (ui, v) => {
        ui.showNumbers = v;
      },
    },
    {
      kw: "stipple-style",
      name: "Display style for stipple marks",
      type: "choices",
      choices: ["Small", "Large"],
      get: (ui) => (ui.largeStipples ? 1 : 0),
      set: (ui, v) => {
        ui.largeStipples = v === 1;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: 20,
  computeSize: (p: MapParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  flashLength,
};

registerGame(mapGame);

// Re-exported for tests.
export { cloneState, gradeMap };
