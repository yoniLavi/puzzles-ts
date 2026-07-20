/**
 * Group — a Latin-square puzzle played on a group's Cayley table: fill the grid
 * so it is a valid group multiplication table (Latin **and** associative).
 *
 * Port of `puzzles/unfinished/group.c`. The solver rides on the shared
 * `engine/latin.ts` (see `solver.ts`); this module is the Game glue — params,
 * move interpretation/execution, the two Group-specific visual aids (row/column
 * reorder + subgroup dividers) and the diagonal multifill, `findMistakes` for
 * Check & Save, and the config/pref forms.
 */

import type {
  Colour,
  ConfigValues,
  KeyLabel,
  Point,
  Size,
} from "../../../puzzle/types.ts";
import {
  type Game,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { clearKey } from "../../engine/key-labels.ts";
import { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE } from "../../engine/latin.ts";
import { parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MIDDLE_BUTTON,
  MIDDLE_DRAG,
  MIDDLE_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { newGameDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  flashLength,
  fromCoord,
  type GroupDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import { solveGroup } from "./solver.ts";
import {
  checkErrors,
  cloneState,
  DIFF_NAMES,
  DIFF_UNREASONABLE,
  decodeParams,
  defaultParams,
  encodeParams,
  fromChar,
  type GroupMistake,
  type GroupMove,
  type GroupParams,
  type GroupState,
  type GroupUi,
  isChar,
  newState,
  newUi,
  PRESETS,
  presetName,
  status,
  textFormat,
  toChar,
  validateDesc,
  validateParams,
} from "./state.ts";

const BACKSPACE = 8;

const isMouseDown = (b: number): boolean =>
  b === LEFT_BUTTON || b === MIDDLE_BUTTON || b === RIGHT_BUTTON;
const isMouseDrag = (b: number): boolean =>
  b === LEFT_DRAG || b === MIDDLE_DRAG || b === RIGHT_DRAG;
const isMouseRelease = (b: number): boolean =>
  b === LEFT_RELEASE || b === MIDDLE_RELEASE || b === RIGHT_RELEASE;

function presets(): PresetMenu<GroupParams> {
  return {
    title: "Group",
    submenu: PRESETS.map((p) => ({ title: presetName(p), params: { ...p } })),
  };
}

function requestKeys(p: GroupParams): KeyLabel[] {
  const keys: KeyLabel[] = [];
  for (let i = 0; i < p.w; i++) {
    const ch = toChar(i + 1, p.id);
    keys.push({ button: ch.charCodeAt(0), label: ch });
  }
  keys.push(clearKey);
  return keys;
}

// --- input (interpret_move) ------------------------------------------------

function interpretMove(
  state: GroupState,
  ui: GroupUi,
  ds: GroupDrawState | null,
  point: Point,
  buttonRaw: number,
): GroupMove | null | UiUpdate {
  const w = state.w;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const button = stripModifiers(buttonRaw);

  const tx = fromCoord(point.x, ts);
  const ty = fromCoord(point.y, ts);

  if (ui.drag) {
    if (isMouseDrag(button)) {
      const tcoord = (ui.drag & ~4) === 1 ? ty : tx;
      ui.drag |= 4; // some movement has happened
      if (tcoord >= 0 && tcoord < w) {
        ui.dragpos = tcoord;
        return UI_UPDATE;
      }
    } else if (isMouseRelease(button)) {
      if (ui.drag & 4) {
        ui.drag = 0; // end drag
        if (state.sequence[ui.dragpos] === ui.dragnum) return UI_UPDATE; // no-op
        return { type: "reorder", num: ui.dragnum, pos: ui.dragpos };
      }
      ui.drag = 0; // end 'drag' (a click on a header edge = divider toggle)
      if (ui.edgepos > 0 && ui.edgepos < w) {
        return {
          type: "divider",
          i: state.sequence[ui.edgepos - 1],
          j: state.sequence[ui.edgepos],
        };
      }
      return UI_UPDATE;
    }
  } else if (isMouseDown(button)) {
    if (tx >= 0 && tx < w && ty >= 0 && ty < w) {
      const otx = tx;
      const oty = ty;
      const cx = state.sequence[tx];
      const cy = state.sequence[ty];
      if (button === LEFT_BUTTON) {
        if (cx === ui.hx && cy === ui.hy && ui.hshow && !ui.hpencil) {
          ui.hshow = false;
        } else {
          ui.hx = cx;
          ui.hy = cy;
          ui.ohx = otx;
          ui.ohy = oty;
          ui.odx = 0;
          ui.ody = 0;
          ui.odn = 1;
          ui.hshow = !state.immutable[cy * w + cx];
          ui.hpencil = false;
        }
        ui.hcursor = false;
        return UI_UPDATE;
      }
      if (button === RIGHT_BUTTON) {
        // Pencil-mode highlighting for non-filled squares only.
        if (state.grid[cy * w + cx] === 0) {
          if (cx === ui.hx && cy === ui.hy && ui.hshow && ui.hpencil) {
            ui.hshow = false;
          } else {
            ui.hpencil = true;
            ui.hx = cx;
            ui.hy = cy;
            ui.ohx = otx;
            ui.ohy = oty;
            ui.odx = 0;
            ui.ody = 0;
            ui.odn = 1;
            ui.hshow = true;
          }
        } else {
          ui.hshow = false;
        }
        ui.hcursor = false;
        return UI_UPDATE;
      }
    } else if (tx >= 0 && tx < w && ty === -1) {
      // Click on the top legend row: start dragging a column.
      ui.drag = 2;
      ui.dragnum = state.sequence[tx];
      ui.dragpos = tx;
      ui.edgepos = fromCoord(point.x + Math.trunc(ts / 2), ts);
      return UI_UPDATE;
    } else if (ty >= 0 && ty < w && tx === -1) {
      // Click on the left legend column: start dragging a row.
      ui.drag = 1;
      ui.dragnum = state.sequence[ty];
      ui.dragpos = ty;
      ui.edgepos = fromCoord(point.y + Math.trunc(ts / 2), ts);
      return UI_UPDATE;
    }
  } else if (isMouseDrag(button)) {
    // Diagonal multifill selection from the highlighted square.
    if (
      !ui.hpencil &&
      tx >= 0 &&
      tx < w &&
      ty >= 0 &&
      ty < w &&
      Math.abs(tx - ui.ohx) === Math.abs(ty - ui.ohy)
    ) {
      ui.odn = Math.abs(tx - ui.ohx) + 1;
      ui.odx = tx < ui.ohx ? -1 : 1;
      ui.ody = ty < ui.ohy ? -1 : 1;
    } else {
      ui.odx = 0;
      ui.ody = 0;
      ui.odn = 1;
    }
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    // The cursor moves in display space; hx/hy track the element there.
    let cx = state.sequence.indexOf(ui.hx);
    let cy = state.sequence.indexOf(ui.hy);
    if (cx < 0) cx = 0;
    if (cy < 0) cy = 0;
    const moved = gridCursorMove(button, cx, cy, w, w, false);
    if (moved) {
      cx = moved.x;
      cy = moved.y;
    }
    ui.hx = state.sequence[cx];
    ui.hy = state.sequence[cy];
    ui.hshow = true;
    ui.hcursor = true;
    ui.ohx = cx;
    ui.ohy = cy;
    ui.odx = 0;
    ui.ody = 0;
    ui.odn = 1;
    return UI_UPDATE;
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  if (
    ui.hshow &&
    ((isChar(button) && fromChar(button, state.id) <= w) ||
      button === CURSOR_SELECT2 ||
      button === BACKSPACE)
  ) {
    let n = fromChar(button, state.id);
    if (button === CURSOR_SELECT2 || button === BACKSPACE) n = 0;

    const cells: { x: number; y: number }[] = [];
    for (let i = 0; i < ui.odn; i++) {
      const x = state.sequence[ui.ohx + i * ui.odx];
      const y = state.sequence[ui.ohy + i * ui.ody];
      const index = y * w + x;
      // Can't pencil-mark a filled square.
      if (ui.hpencil && state.grid[index]) return null;
      // Can't touch an immutable square — unless setting it to what it holds
      // (so a multifill can cross an already-correct immutable cell).
      if (!(!ui.hpencil && state.grid[index] === n) && state.immutable[index])
        return null;
      cells.push({ x, y });
    }

    const type = ui.hpencil && n > 0 ? "pencil" : "set";
    // Hide a mouse-generated highlight after a keypress, unless a pencil change
    // and the keep-highlight preference is set.
    if (!ui.hcursor && !(ui.hpencil && ui.pencilKeepHighlight)) ui.hshow = false;
    return { type, cells, n };
  }

  return null;
}

// --- move execution (execute_move) -----------------------------------------

function executeMove(from: GroupState, move: GroupMove): GroupState {
  const w = from.w;
  const a = w * w;

  switch (move.type) {
    case "solve": {
      const ret = cloneState(from);
      ret.completed = true;
      ret.cheated = true;
      for (let i = 0; i < a; i++) {
        ret.grid[i] = move.grid[i];
        ret.pencil[i] = 0;
      }
      return ret;
    }
    case "set":
    case "pencil": {
      const ret = cloneState(from);
      const n = move.n;
      for (const c of move.cells) {
        if (c.x < 0 || c.x >= w || c.y < 0 || c.y >= w) throw new Error("bad move");
        const idx = c.y * w + c.x;
        if (from.immutable[idx] && !(move.type === "set" && from.grid[idx] === n))
          throw new Error("bad move");
        if (move.type === "pencil" && n > 0) {
          ret.pencil[idx] ^= 1 << n;
        } else {
          ret.grid[idx] = n;
          ret.pencil[idx] = 0;
        }
      }
      if (!ret.completed && !checkErrors(ret)) ret.completed = true;
      return ret;
    }
    case "reorder": {
      const ret = cloneState(from);
      // Reorder so element `num` sits at display position `pos`.
      let j = 0;
      for (let i = 0; i < w; i++) {
        if (i === move.pos) {
          ret.sequence[i] = move.num;
        } else {
          if (from.sequence[j] === move.num) j++;
          ret.sequence[i] = from.sequence[j++];
        }
      }
      // Eliminate dividers no longer between the same two adjacent elements.
      for (let x = 0; x < w; x++) {
        const el = ret.sequence[x];
        const nxt = x + 1 < w ? ret.sequence[x + 1] : -1;
        if (ret.dividers[el] !== nxt) ret.dividers[el] = -1;
      }
      return ret;
    }
    case "divider": {
      const ret = cloneState(from);
      ret.dividers[move.i] = ret.dividers[move.i] === move.j ? -1 : move.j;
      return ret;
    }
  }
}

// --- Ui reconciliation (game_changed_state) --------------------------------

function changedState(
  ui: GroupUi,
  oldState: GroupState | null,
  newState: GroupState,
): void {
  const w = newState.w;

  // Cancel a pencil highlight on a square that just became filled.
  if (ui.hshow && ui.hpencil && !ui.hcursor && newState.grid[ui.hy * w + ui.hx] !== 0) {
    ui.hshow = false;
  }

  if (ui.hshow && ui.odn > 1 && oldState) {
    // Reordering within a multifill selection cancels it entirely.
    for (let i = 0; i < ui.odn; i++) {
      if (
        oldState.sequence[ui.ohx + i * ui.odx] !==
          newState.sequence[ui.ohx + i * ui.odx] ||
        oldState.sequence[ui.ohy + i * ui.ody] !==
          newState.sequence[ui.ohy + i * ui.ody]
      ) {
        ui.hshow = false;
        break;
      }
    }
  } else if (
    ui.hshow &&
    (newState.sequence[ui.ohx] !== ui.hx || newState.sequence[ui.ohy] !== ui.hy)
  ) {
    // Reordering the row/column of the selection moves the selection with it.
    for (let i = 0; i < w; i++) {
      if (newState.sequence[i] === ui.hx) ui.ohx = i;
      if (newState.sequence[i] === ui.hy) ui.ohy = i;
    }
  }
}

// --- solve + findMistakes --------------------------------------------------

function solve(
  orig: GroupState,
  _curr: GroupState,
  aux?: string,
): SolveResult<GroupMove> {
  const w = orig.w;
  const a = w * w;
  if (aux) {
    const grid: number[] = [];
    for (let i = 0; i < a; i++) grid[i] = fromChar(aux.charCodeAt(i + 1), orig.id);
    return { ok: true, move: { type: "solve", grid } };
  }
  const soln = orig.grid.slice();
  const ret = solveGroup(soln, w, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (ret === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(soln) } };
}

/** Flag every user entry that contradicts the unique solution (re-solved from
 * the givens only), for Check & Save. Group is uniquely solvable, so this is
 * well-defined (design D7). */
function findMistakes(state: GroupState): readonly GroupMistake[] {
  const w = state.w;
  const a = w * w;
  const soln = new Uint8Array(a);
  for (let i = 0; i < a; i++) if (state.immutable[i]) soln[i] = state.grid[i];
  const ret = solveGroup(soln, w, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE || ret === DIFF_AMBIGUOUS) return [];

  const out: GroupMistake[] = [];
  for (let i = 0; i < a; i++) {
    if (state.immutable[i]) continue;
    if (state.grid[i] && state.grid[i] !== soln[i])
      out.push({ x: i % w, y: (i / w) | 0 });
  }
  return out;
}

// --- config / params summary -----------------------------------------------

function describeParams(p: GroupParams): ConfigValues {
  // Keys/shape match the `group` template in augmentation.ts
  // ("{grid-size}x{grid-size} {difficulty:...}{show-identity:, identity hidden|}").
  return { "grid-size": String(p.w), difficulty: p.diff, "show-identity": p.id };
}

export const groupGame: Game<
  GroupParams,
  GroupState,
  GroupMove,
  GroupUi,
  GroupDrawState,
  GroupMistake
> = {
  id: "group",
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
    {
      kw: "size",
      name: "Grid size",
      type: "string",
      get: (p) => String(p.w),
      set: (p, v) => {
        p.w = parseConfigInt(v);
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
    {
      kw: "show-identity",
      name: "Show identity",
      type: "boolean",
      get: (p) => p.id,
      set: (p, v) => {
        p.id = v;
      },
    },
  ],
  describeParams,

  newDesc: (p, rng) => newGameDesc(p, rng),
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

  prefs: [
    {
      kw: "pencil-keep-highlight",
      name: "Keep mouse highlight after changing a pencil mark",
      type: "boolean",
      get: (ui) => ui.pencilKeepHighlight,
      set: (ui, v) => {
        ui.pencilKeepHighlight = v;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: GroupParams, ts: number): Size => computeSize(p.w, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(groupGame);
