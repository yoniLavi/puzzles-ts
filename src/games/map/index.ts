/**
 * Map (`map.c`) — native TS port. Color every region of a map so no two
 * adjacent regions share a color, given some regions pre-colored as clues.
 *
 * Press picks up the color of the region under the pointer (or, on a blank
 * region, its pencil marks) into a floating drag blob; release drops it onto
 * the region under the pointer. A right-drag from a color onto a blank region
 * toggles one pencil bit; a keyboard cursor picks/drops via select. The
 * diagonally-split-cell quadrant hit-test (`region_from_coords`) is ported
 * exactly. A drop that changes nothing produces no move (local no-op
 * suppression — no state-string undo).
 */

import { assertNever, rejectMove } from "../../engine/assert-never.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
import type { Game, SolveResult, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  moveCursor,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Color, GameStatus, Point, Size } from "../../engine/types.ts";
import { newMapDesc } from "./generator.ts";
import { newMapData, validateDesc } from "./map-data.ts";
import {
  colors,
  computeSize,
  flashLengthFromUi,
  type MapDrawState,
  newDrawState,
  redraw,
  regionFromCoords,
  regionFromUiCursor,
  setTileSize,
} from "./render.ts";
import { gradeMap, mapSolver, SOLVER_IMPOSSIBLE, SOLVER_UNIQUE } from "./solver.ts";
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
  const { map, coloring } = newMapData(p, desc);
  return {
    params: p,
    map,
    coloring,
    pencil: new Int32Array(p.n),
    completed: false,
    cheated: false,
  };
}

// --- moves -----------------------------------------------------------

/** Build the ops for dropping color `c`/pencil `p` on region `r`, or null
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
  if (state.coloring[r] === c && state.pencil[r] === p) return UI_UPDATE; // no change

  if (altButton) {
    if (state.coloring[r] >= 0) return UI_UPDATE; // can't pencil a colored region
    if (c >= 0) {
      // Right-drag from a color onto a blank toggles one pencil.
      p = state.pencil[r] ^ (1 << c);
      c = -1;
    }
    // Otherwise, right-drag blank→blank == left-drag.
  }

  const ops: MapOp[] = [];
  let oldp = state.pencil[r];
  if (c !== state.coloring[r]) {
    ops.push({ op: "color", region: r, color: c < 0 ? null : c });
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
  ds: MapDrawState,
  point: Point,
  rawButton: number,
): MapMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state.params;
  const ts = ds.tileSize;

  // Toggle region numbers.
  if (button === 108 || button === 76) {
    ui.showNumbers = !ui.showNumbers;
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    moveCursor(ui.cursor, button, w, h);
    ui.curMoved = true;
    ui.curLastmove = button;
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.cursor.visible) {
      ui.cursor.visible = true;
      return UI_UPDATE;
    }
    if (ui.dragColor === -2) {
      // Start a cursor drag: pick up the region under the cursor.
      const r = regionFromUiCursor(state.map, ui);
      if (r >= 0) {
        ui.dragColor = state.coloring[r];
        ui.dragPencil = ui.dragColor >= 0 ? 0 : state.pencil[r];
      } else {
        ui.dragColor = -1;
        ui.dragPencil = 0;
      }
      ui.curMoved = false;
      return UI_UPDATE;
    }
    // Drop the held color into the region under the cursor.
    const altButton = button === CURSOR_SELECT2;
    if (!ui.curMoved) ui.dragColor = -1; // double-select removes the color
    const r = regionFromUiCursor(state.map, ui);
    const c = ui.dragColor;
    const p = ui.dragPencil;
    ui.dragColor = -2;
    return dragOps(state, r, c, p, altButton);
  }

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    const r = regionFromCoords(state.map, ts, point.x, point.y);
    if (r >= 0) {
      ui.dragColor = state.coloring[r];
      ui.dragPencil = state.pencil[r];
      if (ui.dragColor >= 0) ui.dragPencil = 0;
    } else {
      ui.dragColor = -1;
      ui.dragPencil = 0;
    }
    ui.dragx = point.x;
    ui.dragy = point.y;
    ui.cursor.visible = false;
    return UI_UPDATE;
  }

  if ((button === LEFT_DRAG || button === RIGHT_DRAG) && ui.dragColor > -2) {
    ui.dragx = point.x;
    ui.dragy = point.y;
    return UI_UPDATE;
  }

  if ((button === LEFT_RELEASE || button === RIGHT_RELEASE) && ui.dragColor > -2) {
    const altButton = button === RIGHT_RELEASE;
    const r = regionFromCoords(state.map, ts, point.x, point.y);
    const c = ui.dragColor;
    const p = ui.dragPencil;
    ui.dragColor = -2;
    return dragOps(state, r, c, p, altButton);
  }

  return null;
}

function isComplete(s: MapState): boolean {
  const n = s.params.n;
  for (let i = 0; i < n; i++) if (s.coloring[i] < 0) return false;
  const { graph, ngraph } = s.map;
  for (let i = 0; i < ngraph; i++) {
    const j = Math.floor(graph[i] / n);
    const k = graph[i] % n;
    if (s.coloring[j] === s.coloring[k]) return false;
  }
  return true;
}

function executeMove(s: MapState, m: MapMove): MapState {
  // A move is an op list, not a union, so there is no discriminant to narrow to
  // `never`: check the one field the dispatch reads (see `rejectMove`).
  if (!Array.isArray(m.ops)) rejectMove(m, "map: executeMove");

  const ret = cloneState(s);
  for (const op of m.ops) {
    if (op.op === "color") {
      ret.coloring[op.region] = op.color ?? -1;
      ret.pencil[op.region] = 0;
    } else if (op.op === "pencil") {
      // pencil toggle — illegal on a colored region (upstream returns NULL).
      if (ret.coloring[op.region] >= 0)
        throw new Error("map: pencil on a coloured region");
      ret.pencil[op.region] ^= 1 << op.bit;
    } else {
      return assertNever(op, "map: executeMove");
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

/** The clue coloring: clue colors at immutable regions, -1 elsewhere. */
function clueColoring(s: MapState): Int32Array {
  const n = s.params.n;
  const clues = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (s.map.immutable[i]) clues[i] = s.coloring[i];
  return clues;
}

/** Parse a generator `aux` (`"S;c:r;c:r;…"`) into a solution coloring. */
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
    if (solution[i] >= 0 && solution[i] !== curr.coloring[i])
      ops.push({ op: "color", region: i, color: solution[i] });
  return { ok: true, move: { ops, solve: true } };
}

function solve(orig: MapState, curr: MapState, aux?: string): SolveResult<MapMove> {
  const n = orig.params.n;
  if (aux) return solveToMove(curr, solutionFromAux(aux, n));

  const coloring = clueColoring(orig);
  const ret = mapSolver(orig.map.graph, n, orig.map.ngraph, coloring, DIFFCOUNT - 1);
  if (ret !== SOLVER_UNIQUE) {
    return {
      ok: false,
      error:
        ret === 0
          ? "Puzzle is inconsistent"
          : "Unable to find a unique solution for this puzzle",
    };
  }
  return solveToMove(curr, coloring);
}

/**
 * Boards are uniquely solvable, so any region colored against the unique
 * solution is a definite mistake (design D6). Re-solve from the clues; if not
 * unique, report none.
 */
function findMistakes(state: MapState): readonly MapMistake[] {
  const n = state.params.n;
  const coloring = clueColoring(state);
  if (
    mapSolver(state.map.graph, n, state.map.ngraph, coloring, DIFFCOUNT - 1) !==
    SOLVER_UNIQUE
  )
    return [];

  const out: MapMistake[] = [];
  for (let i = 0; i < n; i++)
    if (state.coloring[i] >= 0 && state.coloring[i] !== coloring[i])
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

/** Map's difficulty contract (`engine/difficulty.ts`). `mapSolver` reports
 * `SOLVER_IMPOSSIBLE` / `SOLVER_UNIQUE` / `SOLVER_STUCK`; the coloring it works
 * from is `clueColoring`, the givens alone, so the player's own colors never
 * enter the verdict. */
const difficulty: DifficultyContract<MapParams> = {
  tiers: DIFF_NAMES,
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const s = newState(p, desc);
    const ret = mapSolver(s.map.graph, p.n, s.map.ngraph, clueColoring(s), cap);
    if (ret === SOLVER_UNIQUE) return "solved";
    return ret === SOLVER_IMPOSSIBLE ? "impossible" : "unsolved";
  },
};

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

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    ...dimensionParamConfig<MapParams>(),
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
  difficulty,
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

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
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
