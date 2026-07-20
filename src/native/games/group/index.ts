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
  adaptiveMarkAllMove,
  anyEmptyLacksNotes,
  candidateHint,
  cleanObviousText,
  emitObviousCleanStep,
  firstUnreflectedPlaceIndex,
  lazyPopulate,
  nakedSingle,
  nextPlace,
  nextStrike,
  populateText,
  regionDuplicateMarks,
} from "../../engine/candidate-hint.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { clearKey } from "../../engine/key-labels.ts";
import { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE } from "../../engine/latin.ts";
import {
  hiddenSingleLine,
  rowColRegions,
  type SingleReason,
  singlePlacementReason,
} from "../../engine/latin-hint.ts";
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
import { stepBudget } from "../../engine/step-budget.ts";
import { newGameDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  flashLength,
  fromCoord,
  type GroupDrawState,
  type GroupHint,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  type HintOp,
  type HintReason,
  recordGroupDeductions,
  solveGroup,
} from "./solver.ts";
import {
  checkErrors,
  cloneState,
  DIFF_EXTREME,
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

  // Uppercase 'M' (the Mark-all toolbar button, ASCII 77): fill every empty cell
  // with all candidate marks, then clean the obvious row/column culls — the
  // populate step the hint teaches. Only *uppercase* M is intercepted, because
  // Group's elements are the letters a–z, so lowercase 'm' (109) is element 13
  // for w ≥ 13 and must still enter that value.
  if (button === 77)
    return adaptiveMarkAllMove<GroupMove>(state.grid, state.pencil, w, (x, y) =>
      rowColRegions(x, y, w),
    );

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
    case "pencilAll": {
      const ret = cloneState(from);
      const all = (1 << (w + 1)) - (1 << 1); // bits 1..w set
      for (let i = 0; i < a; i++) if (!ret.grid[i]) ret.pencil[i] = all;
      return ret;
    }
    case "pencilStrike": {
      const ret = cloneState(from);
      for (const { x, y, n } of move.marks) ret.pencil[y * w + x] &= ~(1 << n);
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

// --- hint ------------------------------------------------------------------

const POPULATE_TEXT = populateText("element");
const CLEAN_OBVIOUS_TEXT = cleanObviousText("element", "placed", "row or column");

/** The reasons a hint step narrates: the Group-specific deductions, the generic
 * Latin reasons, and the naked/hidden/forced classification a placement's `single`
 * reason is re-derived into. */
type NarratableReason = HintReason | SingleReason;

/** Join a list of element letters for narration: `[a]`→"a", `[a,b]`→"a and b",
 * `[a,b,c]`→"a, b and c". */
function joinCh(vals: number[], id: boolean): string {
  const s = vals.map((v) => toChar(v, id));
  if (s.length <= 1) return s[0] ?? "";
  if (s.length === 2) return `${s[0]} and ${s[1]}`;
  return `${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}

/** Narrate *why* a firing is forced (hint-authoring §2): indication → reasoning →
 * necessity-voice conclusion, every cell named by the element letter it shows.
 * `ns` is the value list the step acts on (a placement passes its single value; a
 * strike its struck values). The generic Latin arms mirror `narrateLatinReason`
 * but interpolate `toChar` letters instead of digits, since Group's values are
 * the elements a–z. `identityFill`'s *first-leg* text lives here; its continuation
 * legs are narrated in {@link emitIdentityFillJourney}. */
function narrate(reason: NarratableReason, ns: number[], id: boolean): string {
  const ch = (n: number): string => toChar(n, id);
  switch (reason.kind) {
    case "associativity": {
      const A = ch(reason.a);
      const B = ch(reason.b);
      const C = ch(reason.c);
      const known = reason.knownLeft ? `(${A}·${B})·${C}` : `${A}·(${B}·${C})`;
      const forced = reason.knownLeft ? `${A}·(${B}·${C})` : `(${A}·${B})·${C}`;
      return `You've filled ${A}·${B} = ${ch(reason.ab)}, ${B}·${C} = ${ch(reason.bc)} and ${known} = ${ch(reason.v)}. Because (${A}·${B})·${C} = ${A}·(${B}·${C}) in any group, ${forced} must also be ${ch(reason.v)}.`;
    }
    case "identityFill": {
      const A = ch(reason.a);
      const B = ch(reason.b);
      const shows =
        reason.prod === reason.a
          ? `${A}·${B} = ${A} shows ${B} is the identity`
          : `${A}·${B} = ${B} shows ${A} is the identity`;
      return `${shows}, so its row and column are just the element labels — this cell must be ${ch(ns[0])}.`;
    }
    case "identityElim": {
      const E = ch(reason.elem);
      const O = ch(reason.other);
      const product = reason.left
        ? `${E}·${O} = ${ch(reason.product)}`
        : `${O}·${E} = ${ch(reason.product)}`;
      return `${product}, not ${O} — the identity leaves every element unchanged, so ${E} can't be the identity. Cross out its identity marks.`;
    }
    case "single":
      return `Every other element has been ruled out in this cell, so it can only be ${ch(ns[0])}.`;
    case "hiddenSingle": {
      const line = reason.line === "row" ? "row" : "column";
      return `In this ${line}, ${ch(reason.n)} can go in only this cell — every other cell in the ${line} has ruled it out — so it must be ${ch(reason.n)}.`;
    }
    case "forcedSingle":
      return `Working through this cell's row and column together, only ${ch(reason.n)} can still go here — so it must be ${ch(reason.n)}.`;
    case "dup":
      // "contain X" (not "there's already X") dodges the a/an trap — element
      // letters like "a" would read as the indefinite article after "already".
      return `This row and column already contain ${ch(reason.n)}, so we must cross out ${ch(reason.n)} from the other cells they pass through.`;
    case "set":
      return `Another group of cells already accounts for a fixed set of elements that includes ${joinCh(ns, id)}, so we must cross out ${joinCh(ns, id)} here.`;
    case "forcing":
      return `Following a chain of two-candidate cells, placing ${ch(ns[0])} here would force a contradiction further along — so we must cross out ${joinCh(ns, id)}.`;
  }
}

/** The premise cells a step shades `COL_HINT_CELL` as evidence: associativity's
 * three known products; an identity fill's / identity elimination's revealing
 * cell; a hidden single's whole line. The generic culls have no clean local area
 * (the struck notes carry the premise). */
function reasonArea(reason: NarratableReason, w: number): { x: number; y: number }[] {
  switch (reason.kind) {
    case "associativity":
      return [reason.abCell, reason.bcCell, reason.thirdCell];
    case "identityFill":
      return [{ x: reason.viaX, y: reason.viaY }];
    case "identityElim":
      return [{ x: reason.wx, y: reason.wy }];
    case "hiddenSingle":
      return hiddenSingleLine(reason.line, reason.index, w);
    default:
      return [];
  }
}

/** Emit a placement step (a native single-cell `set`) and apply it to the working
 * board, striking the placed value from the rest of its row and column. Group has
 * no auto-pencil, so that cleanup is always an explicit `pencilStrike` journey
 * continuation when notes exist (and a no-op — no step — when they don't, the
 * placement-first common case on a note-free board). */
function emitPlacement(
  steps: HintStep<GroupMove, GroupHint>[],
  wGrid: Uint8Array,
  wPen: Int32Array,
  w: number,
  id: boolean,
  x: number,
  y: number,
  n: number,
  reason: NarratableReason,
): void {
  steps.push({
    move: { type: "set", cells: [{ x, y }], n },
    explanation: narrate(reason, [n], id),
    highlights: { area: reasonArea(reason, w), targets: [{ x, y }], marks: [] },
  });
  wGrid[y * w + x] = n;
  wPen[y * w + x] = 0;

  const dupMarks = regionDuplicateMarks(
    wGrid,
    wPen,
    x,
    y,
    n,
    w,
    rowColRegions(x, y, w),
  );
  for (const m of dupMarks) wPen[m.y * w + m.x] &= ~(1 << m.n);
  if (dupMarks.length > 0) {
    steps.push({
      move: { type: "pencilStrike", marks: dupMarks },
      explanation: narrate({ kind: "dup", n, px: x, py: y }, [], id),
      highlights: {
        area: [],
        targets: dupMarks.map((m) => ({ x: m.x, y: m.y })),
        marks: dupMarks,
      },
      continuesPrevious: true,
    });
  }
}

/** Emit the identity's whole row and column as **one multi-leg journey** (design
 * D4): the deduction that "learns" the identity forces every empty cell of its
 * row and column at once, so those placements read and auto-play as a single hint
 * (continuation legs flagged `continuesPrevious`), not `2w−1` disjoint ones. The
 * revealing cell is shaded on every leg as the shared premise. */
function emitIdentityFillJourney(
  steps: HintStep<GroupMove, GroupHint>[],
  wGrid: Uint8Array,
  wPen: Int32Array,
  w: number,
  id: boolean,
  ops: HintOp[],
  group: number,
): void {
  const fills = ops.filter(
    (op) => op.kind === "place" && op.group === group && wGrid[op.y * w + op.x] === 0,
  );
  fills.forEach((op, i) => {
    const reason = op.reason;
    const area =
      reason.kind === "identityFill" ? [{ x: reason.viaX, y: reason.viaY }] : [];
    const explanation =
      i === 0
        ? narrate(reason, [op.n], id)
        : `The identity's row and column are just the element labels, so this cell must be ${toChar(op.n, id)}.`;
    steps.push({
      move: { type: "set", cells: [{ x: op.x, y: op.y }], n: op.n },
      explanation,
      highlights: { area, targets: [{ x: op.x, y: op.y }], marks: [] },
      continuesPrevious: i > 0,
    });
    wGrid[op.y * w + op.x] = op.n;
    wPen[op.y * w + op.x] = 0;
  });
}

/** Emit one recorded placement (Group's own or a generic single), re-deriving a
 * generic `single` reason into naked/hidden/forced from the working board. */
function emitRecordedPlacement(
  steps: HintStep<GroupMove, GroupHint>[],
  wGrid: Uint8Array,
  wPen: Int32Array,
  w: number,
  id: boolean,
  ops: HintOp[],
  pl: HintOp,
): void {
  if (pl.reason.kind === "identityFill") {
    emitIdentityFillJourney(steps, wGrid, wPen, w, id, ops, pl.group);
    return;
  }
  const reason: NarratableReason =
    pl.reason.kind === "single"
      ? singlePlacementReason(wGrid, wPen, pl.x, pl.y, pl.n, w)
      : (pl.reason as NarratableReason);
  emitPlacement(steps, wGrid, wPen, w, id, pl.x, pl.y, pl.n, reason);
}

/** Build the hint plan by walking a working copy the way a person solves it
 * (design D3, placement-first): a naked single first; else, when a placement is
 * the solver's *immediate* next deduction, teach it (Group's associativity or an
 * identity-row/column fill, or a generic single); else — when an elimination
 * precedes the next placement — a lazy populate + obvious-cull cleanup, then the
 * elimination (Group's identity-mark strike, or a generic set/forcing cull), then
 * the placement it enables. Capped below recursion (a guess is not teachable). */
function buildSteps(state: GroupState): HintStep<GroupMove, GroupHint>[] {
  const w = state.w;
  const id = state.id;
  const steps: HintStep<GroupMove, GroupHint>[] = [];
  const wGrid = Uint8Array.from(state.grid);
  const wPen = Int32Array.from(state.pencil);
  const maxdiff = Math.min(state.diff, DIFF_EXTREME);

  const pop = lazyPopulate<GroupMove, GroupHint>(
    state,
    wGrid,
    wPen,
    w,
    steps,
    POPULATE_TEXT,
  );
  let cleaned = false;
  let ops = recordGroupDeductions(wGrid, w, maxdiff);

  const budget = stepBudget("group hint plan");
  const cap = w * w * w * 4 + 4;
  for (let guard = 0; guard < cap; guard++) {
    budget.tick();
    let filled = true;
    for (let i = 0; i < w * w; i++) if (!wGrid[i]) filled = false;
    if (filled) break;

    // 1. A naked single — the next move a human makes.
    const ns = nakedSingle(wGrid, wPen, w);
    if (ns) {
      emitPlacement(steps, wGrid, wPen, w, id, ns.x, ns.y, ns.n, { kind: "single" });
      ops = recordGroupDeductions(wGrid, w, maxdiff);
      continue;
    }

    // 2. A placement is the solver's immediate next deduction (nothing precedes
    //    it in solver order) — teach it directly, no notes needed (placement-
    //    first: Group's associativity / identity fill lead, not a populate).
    if (firstUnreflectedPlaceIndex(ops, wGrid, w) === 0) {
      emitRecordedPlacement(steps, wGrid, wPen, w, id, ops, ops[0]);
      ops = recordGroupDeductions(wGrid, w, maxdiff);
      continue;
    }

    // 3. An elimination precedes the next placement (Group's identity-mark strike,
    //    or a set/forcing cull) — its notes are what the strike crosses out, so
    //    populate (and clean the obvious culls) first, then teach the deduction.
    if (!pop.done()) {
      pop.ensure();
      continue;
    }
    if (!cleaned) {
      cleaned = true;
      if (
        emitObviousCleanStep(
          steps,
          wGrid,
          wPen,
          w,
          (x, y) => rowColRegions(x, y, w),
          CLEAN_OBVIOUS_TEXT,
        )
      )
        continue;
    }
    const strike = nextStrike(ops, wGrid, wPen, w);
    if (strike) {
      const reason = strike[0].reason;
      const marks = strike.map((op) => ({ x: op.x, y: op.y, n: op.n }));
      const values = marks.map((m) => m.n).sort((a, b) => a - b);
      steps.push({
        move: { type: "pencilStrike", marks },
        explanation: narrate(reason, values, id),
        highlights: {
          area: reasonArea(reason, w),
          targets: marks.map((m) => ({ x: m.x, y: m.y })),
          marks,
        },
      });
      for (const m of marks) wPen[m.y * w + m.x] &= ~(1 << m.n);
      continue;
    }

    // 4. The strikes are exhausted; the placement they enabled (a forced single
    //    the notes now reflect) is next.
    const pl = nextPlace(ops, wGrid, w);
    if (pl) {
      emitRecordedPlacement(steps, wGrid, wPen, w, id, ops, pl);
      ops = recordGroupDeductions(wGrid, w, maxdiff);
      continue;
    }

    break; // stuck (an Unreasonable board now needing a guess)
  }

  return steps;
}

function hint(
  state: GroupState,
  _aux?: string,
  _ui?: GroupUi,
): HintResult<GroupMove, GroupHint> {
  return candidateHint(state, undefined, findMistakes, (s) => buildSteps(s));
}

/** Classify a player move against the displayed hint step (the engine's
 * keep-track contract). A placement completes a `set` step; a native `pencil`
 * toggle that *clears* one of a strike step's marks shrinks it (`onTrack`) or
 * finishes it (`completed`); a Mark-all completes a `pencilAll` step; anything
 * else drops the plan. `state` is the PRE-move board. */
function hintKeepTrack(
  m: GroupMove,
  step: HintStep<GroupMove, GroupHint>,
  state: GroupState,
): HintTrackVerdict {
  const w = state.w;
  const sm = step.move;
  if (sm.type === "pencilAll") return m.type === "pencilAll" ? "completed" : "off";
  if (sm.type === "set") {
    if (m.type !== "set" || m.n <= 0 || m.cells.length !== 1) return "off";
    const c = m.cells[0];
    const s = sm.cells[0];
    return c.x === s.x && c.y === s.y && m.n === sm.n ? "completed" : "off";
  }
  if (sm.type === "pencilStrike") {
    // A manual strike is a right-click pencil toggle of a single candidate.
    if (m.type !== "pencil" || m.n <= 0 || m.cells.length !== 1) return "off";
    const c = m.cells[0];
    const hit = sm.marks.findIndex((k) => k.x === c.x && k.y === c.y && k.n === m.n);
    if (hit < 0) return "off"; // touched a non-target candidate
    // The toggle clears the candidate iff it is present now; an absent candidate
    // would be *re-added* — off-plan.
    if (!(state.pencil[c.y * w + c.x] & (1 << m.n))) return "off";
    const remaining = sm.marks.filter((_, j) => j !== hit);
    if (remaining.length === 0) return "completed";
    step.move = { type: "pencilStrike", marks: remaining };
    if (step.highlights) {
      step.highlights = {
        ...step.highlights,
        targets: remaining.map((k) => ({ x: k.x, y: k.y })),
        marks: remaining,
      };
    }
    return "onTrack";
  }
  return "off";
}

/** Re-validate a stored hint step against the current board before it is
 * (re-)displayed (the engine's "never show a stale step" guarantee): drop a
 * strike step's dead marks (or resolve it), resolve a placement once its cell is
 * filled, resolve a populate once every empty cell has notes. */
function refreshHintStep(
  step: HintStep<GroupMove, GroupHint>,
  state: GroupState,
): HintStep<GroupMove, GroupHint> | null {
  const w = state.w;
  const m = step.move;
  if (m.type === "pencilStrike") {
    const live = m.marks.filter(
      ({ x, y, n }) =>
        state.grid[y * w + x] === 0 && (state.pencil[y * w + x] & (1 << n)) !== 0,
    );
    if (live.length === 0) return null;
    if (live.length === m.marks.length) return step;
    return {
      ...step,
      move: { type: "pencilStrike", marks: live },
      highlights: step.highlights
        ? {
            ...step.highlights,
            targets: live.map((k) => ({ x: k.x, y: k.y })),
            marks: live,
          }
        : undefined,
    };
  }
  if (m.type === "set" && m.n > 0) {
    const c = m.cells[0];
    return state.grid[c.y * w + c.x] !== 0 ? null : step;
  }
  if (m.type === "pencilAll") {
    return anyEmptyLacksNotes(state.grid, state.pencil, w) ? step : null;
  }
  return step;
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
  canMarkAll: true,
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
  hint,
  hintKeepTrack,
  refreshHintStep,
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
