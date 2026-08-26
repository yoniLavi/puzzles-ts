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

import { assertNever } from "../../engine/assert-never.ts";
import {
  adaptiveMarkAllMove,
  type CandidateMoveAdapter,
  candidateHint,
  cleanObviousText,
  emitObviousCleanStep,
  firstUnreflectedPlaceIndex,
  keepCandidateHintTrack,
  lazyPopulate,
  nakedSingle,
  nextPlace,
  nextStrike,
  populateText,
  refreshCandidateHintStep,
  regionDuplicateMarks,
} from "../../engine/candidate-hint.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
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
import { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE, latinVerdict } from "../../engine/latin.ts";
import {
  forcingChainArea,
  hiddenSingleLine,
  type LatinVocab,
  narrateLatinReason,
  rowColRegions,
  type SingleReason,
  singlePlacementReason,
} from "../../engine/latin-hint.ts";
import type { OrderedCell } from "../../engine/overlay-sidecar.ts";
import { parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  isEraseKey,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type {
  Colour,
  ConfigValues,
  KeyLabel,
  Point,
  Size,
} from "../../engine/types.ts";
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
  ds: GroupDrawState,
  point: Point,
  buttonRaw: number,
): GroupMove | null | UiUpdate {
  const w = state.w;
  const ts = ds.tilesize;
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
      isEraseKey(button))
  ) {
    let n = fromChar(button, state.id);
    if (button === CURSOR_SELECT2 || isEraseKey(button)) n = 0;

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
      // **Additive**: fill only the cells that have no notes yet, never reset one
      // the player has narrowed. Resetting threw away their own deductions on any
      // board with some pencilled cells and some blank ones (owner-reported on
      // Salad, 2026-07-29); `adaptiveMarkAll`'s contract always said "fill every
      // *note-less* empty cell" — this is the games catching up with it.
      for (let i = 0; i < a; i++) {
        if (!ret.grid[i] && ret.pencil[i] === 0) ret.pencil[i] = all;
      }
      return ret;
    }
    case "pencilStrike": {
      const ret = cloneState(from);
      for (const { x, y, n } of move.marks) ret.pencil[y * w + x] &= ~(1 << n);
      return ret;
    }
    default:
      return assertNever(move, "group: executeMove");
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

/** Group's value vocabulary for the shared generic-Latin narration arms: its
 * values are the elements `a`–`z`, not digits (`share-latin-reason-narration`
 * extended by `add-salad-hint` design D5 — Group was the copy that proved one
 * vocabulary parameter enough). */
function groupVocab(id: boolean): LatinVocab {
  return { noun: "element", value: (n) => toChar(n, id) };
}

/** Narrate *why* a firing is forced (docs/games/hints.md § "Writing the narration"): indication → reasoning →
 * necessity-voice conclusion, every cell named by the element letter it shows.
 * `ns` is the value list the step acts on (a placement passes its single value; a
 * strike its struck values). The six generic Latin arms are delegated to
 * `narrateLatinReason` under {@link groupVocab}; only Group's own three
 * techniques are spelled out here. `identityFill`'s *first-leg* text lives here;
 * its continuation legs are narrated in {@link emitIdentityFillJourney}. */
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
    default:
      // The six generic arms, in element vocabulary. The shared `dup` arm picks
      // "a"/"an" by the rendered value, which is what Group's local copy dodged
      // by rewording ("already contain a" reads as an article for element `a`).
      return narrateLatinReason(reason, ns, groupVocab(id));
  }
}

/** The premise cells a step shades `COL_HINT_CELL` as evidence: associativity's
 * three known products; an identity fill's / identity elimination's revealing
 * cell; a hidden single's whole line. The generic culls have no clean local area
 * (the struck notes carry the premise). */
function reasonArea(reason: NarratableReason, w: number): OrderedCell[] {
  switch (reason.kind) {
    case "associativity":
      return [reason.abCell, reason.bcCell, reason.thirdCell];
    case "identityFill":
      return [{ x: reason.viaX, y: reason.viaY }];
    case "identityElim":
      return [{ x: reason.wx, y: reason.wy }];
    case "hiddenSingle":
      return hiddenSingleLine(reason.line, reason.index, w);
    // A forcing chain names the cells it ran through, **numbered**, so the
    // narration can cite them and the player can walk it.
    case "forcing":
      return forcingChainArea(reason);
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
    // `ops.length > 0` is load-bearing, not defensive.
    // `firstUnreflectedPlaceIndex` returns `ops.length` to mean "no placement
    // found" — a sentinel that collides with a valid index of `0` exactly when
    // `ops` is empty, so this read as "a placement leads, at index 0" and then
    // dereferenced `ops[0]` (undefined) and crashed. An empty `ops` is reachable
    // whenever deduction runs out under the hint's cap — on an `Unreasonable`
    // board, whose rungs the cap deliberately withholds, that is ordinary rather
    // than exotic. Found by the cross-game trial guard walking *every tier*
    // rather than each game's easiest preset, which is the only reason it was
    // ever reached: the guard's own tier sweep exists because a tier-gated rung
    // can never fire on a game's easiest preset.
    if (ops.length > 0 && firstUnreflectedPlaceIndex(ops, wGrid, w) === 0) {
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

/**
 * How Group's `Move` union reads as the shared candidate shapes: its `set` /
 * `pencil` carry a *cell list* (for the diagonal multifill) rather than an
 * `x`/`y` pair, so a hint's single-cell move is `cells[0]` and a real multifill
 * is off-plan. Everything else — the shrink-in-place bookkeeping, the
 * "a toggle only counts when the candidate is present" rule — is the shared
 * mechanics, which this replaced a byte-identical hand-rolled copy of.
 */
const groupCandidateMoves: CandidateMoveAdapter<GroupMove> = {
  read: (m) => {
    if ((m.type === "set" || m.type === "pencil") && m.n > 0 && m.cells.length === 1) {
      const { x, y } = m.cells[0];
      return { type: "set", x, y, n: m.n, pencil: m.type === "pencil" };
    }
    if (m.type === "pencilAll") return { type: "pencilAll" };
    if (m.type === "pencilStrike") return { type: "pencilStrike", marks: [...m.marks] };
    return null;
  },
  strike: (marks) => ({ type: "pencilStrike", marks }),
};

/** Classify a player move against the displayed hint step (the engine's
 * keep-track contract). `state` is the PRE-move board. */
function hintKeepTrack(
  m: GroupMove,
  step: HintStep<GroupMove, GroupHint>,
  state: GroupState,
): HintTrackVerdict {
  return keepCandidateHintTrack(m, step, state.pencil, state.w, groupCandidateMoves);
}

/** Re-validate a stored hint step against the current board before it is
 * (re-)displayed (the engine's "never show a stale step" guarantee). */
function refreshHintStep(
  step: HintStep<GroupMove, GroupHint>,
  state: GroupState,
): HintStep<GroupMove, GroupHint> | null {
  return refreshCandidateHintStep(
    step,
    state.grid,
    state.pencil,
    state.w,
    groupCandidateMoves,
  );
}

// --- config / params summary -----------------------------------------------

function describeParams(p: GroupParams): ConfigValues {
  // Keys/shape match the `group` template in augmentation.ts
  // ("{grid-size}x{grid-size} {difficulty:...}{show-identity:, identity hidden|}").
  return { "grid-size": String(p.w), difficulty: p.diff, "show-identity": p.id };
}

/** Group's difficulty contract (`engine/difficulty.ts`). `solveGroup` follows
 * the shared latin-family return convention — the difficulty reached, or one of
 * `latin.ts`'s sentinels — so `latinVerdict` reads it. */
const difficulty: DifficultyContract<GroupParams> = {
  tiers: DIFF_NAMES,
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const s = newState(p, desc);
    return latinVerdict(solveGroup(s.grid.slice(), s.w, cap));
  },
};

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
  difficulty,
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
