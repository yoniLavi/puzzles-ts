/**
 * Solo (Sudoku) — native TS port of `solo.c`. Fill a `cr × cr` grid (`cr = c·r`)
 * with digits `1..cr` so every row, column and sub-block holds each digit once;
 * variants add irregular (jigsaw) blocks, two main diagonals (X), and digit-sum
 * cages (killer). Left-click / cursor-select highlights a cell for a real entry;
 * right-click / select2 highlights it for a pencil mark (or toggles sticky
 * pencil mode); a digit enters (or pencil-toggles) that value; backspace/space
 * clears. Duplicate digits and over-full cages highlight live; Check & Save
 * additionally flags cells that contradict the unique solution.
 */

import type {
  Colour,
  ConfigValues,
  GameStatus,
  KeyLabel,
  Point,
  Size,
} from "../../../puzzle/types.ts";
import { digitKeys } from "../../engine/key-labels.ts";
import {
  adaptiveMarkAllMove,
  anyEmptyLacksNotes,
  findRegionDuplicate,
  joinNums,
  keepCandidateHintTrack,
  nakedSingle,
  nextPlace,
  nextStrike,
  refreshCandidateHintStep,
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
import { classifyPlacementInRegions } from "../../engine/latin-hint.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  isCursorMove,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { RandomState } from "../../random/index.ts";
import { newSoloDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SoloDrawState,
  type SoloHint,
  setTileSize,
} from "./render.ts";
import {
  type HintOp,
  recordSoloDeductions,
  type SoloReason,
  type SoloRegion,
  solveSolo,
} from "./solver.ts";
import {
  checkValid,
  cloneState,
  DIFF_AMBIGUOUS,
  DIFF_BLOCK,
  DIFF_EXTREME,
  DIFF_IMPOSSIBLE,
  DIFF_INTERSECT,
  DIFF_KINTERSECT,
  DIFF_KMINMAX,
  DIFF_RECURSIVE,
  DIFF_SET,
  DIFF_SIMPLE,
  decodeParams,
  defaultParams,
  diag0,
  diag1,
  encodeParams,
  newState,
  newUi,
  onDiag0,
  onDiag1,
  type SoloMistake,
  type SoloMove,
  type SoloParams,
  type SoloState,
  type SoloUi,
  SYMM_NONE,
  SYMM_ROT2,
  status as soloStatus,
  validateDesc,
  validateParams,
} from "./state.ts";

interface Preset {
  title: string;
  params: SoloParams;
}

/** Faithful to `game_presets` (the non-SLOW_SYSTEM entries are always shown). */
function soloPresets(): Preset[] {
  const P = (
    c: number,
    r: number,
    symm: number,
    diff: number,
    kdiff: number,
    xtype: boolean,
    killer: boolean,
    title: string,
  ): Preset => ({ title, params: { c, r, symm, diff, kdiff, xtype, killer } });
  const K = DIFF_KMINMAX;
  return [
    P(2, 2, SYMM_ROT2, DIFF_BLOCK, K, false, false, "2x2 Trivial"),
    P(2, 3, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "2x3 Basic"),
    P(3, 3, SYMM_ROT2, DIFF_BLOCK, K, false, false, "3x3 Trivial"),
    P(3, 3, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "3x3 Basic"),
    P(3, 3, SYMM_ROT2, DIFF_SIMPLE, K, true, false, "3x3 Basic X"),
    P(3, 3, SYMM_ROT2, DIFF_INTERSECT, K, false, false, "3x3 Intermediate"),
    P(3, 3, SYMM_ROT2, DIFF_SET, K, false, false, "3x3 Advanced"),
    P(3, 3, SYMM_ROT2, DIFF_SET, K, true, false, "3x3 Advanced X"),
    P(3, 3, SYMM_ROT2, DIFF_EXTREME, K, false, false, "3x3 Extreme"),
    P(3, 3, SYMM_ROT2, DIFF_RECURSIVE, K, false, false, "3x3 Unreasonable"),
    P(3, 3, SYMM_NONE, DIFF_BLOCK, DIFF_KINTERSECT, false, true, "3x3 Killer"),
    P(9, 1, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "9 Jigsaw Basic"),
    P(9, 1, SYMM_ROT2, DIFF_SIMPLE, K, true, false, "9 Jigsaw Basic X"),
    P(9, 1, SYMM_ROT2, DIFF_SET, K, false, false, "9 Jigsaw Advanced"),
    P(3, 4, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "3x4 Basic"),
    P(4, 4, SYMM_ROT2, DIFF_SIMPLE, K, false, false, "4x4 Basic"),
  ];
}

function presets(): PresetMenu<SoloParams> {
  return {
    title: "Solo",
    submenu: soloPresets().map((p) => ({ title: p.title, params: p.params })),
  };
}

function inGrid(cr: number, x: number, y: number): boolean {
  return x >= 0 && x < cr && y >= 0 && y < cr;
}

/** Move the keyboard cursor (clamped); reveal it on first press. Mirrors
 * `move_cursor`: the position moves even on the reveal press. */
function moveCursor(button: number, ui: SoloUi, cr: number): UiUpdate | null {
  const ox = ui.hx;
  const oy = ui.hy;
  if (button === CURSOR_UP) ui.hy = Math.max(ui.hy - 1, 0);
  else if (button === CURSOR_DOWN) ui.hy = Math.min(ui.hy + 1, cr - 1);
  else if (button === CURSOR_LEFT) ui.hx = Math.max(ui.hx - 1, 0);
  else if (button === CURSOR_RIGHT) ui.hx = Math.min(ui.hx + 1, cr - 1);
  if (!ui.hshow) {
    ui.hshow = true;
    return UI_UPDATE;
  }
  return ui.hx !== ox || ui.hy !== oy ? UI_UPDATE : null;
}

function interpretMove(
  state: SoloState,
  ui: SoloUi,
  ds: SoloDrawState | null,
  p: Point,
  rawButton: number,
): SoloMove | null | UiUpdate {
  const cr = state.cr;
  const ts = ds?.tileSize ?? PREFERRED_TILE_SIZE;
  const button = stripModifiers(rawButton);

  const tx = fromCoord(p.x, ts);
  const ty = fromCoord(p.y, ts);

  if (inGrid(cr, tx, ty)) {
    if (button === LEFT_BUTTON) {
      // Sticky pencil mode: a left-click on an already-selected cell keeps the
      // current pencil/real mode (it only moves the highlight); non-sticky
      // (upstream) reverts to real entry. A click on a given cell hides the
      // highlight (can't be edited).
      if (state.immutable[ty * cr + tx]) {
        ui.hshow = false;
      } else if (
        tx === ui.hx &&
        ty === ui.hy &&
        ui.hshow &&
        (ui.pencilSticky || !ui.hpencil)
      ) {
        ui.hshow = false;
      } else {
        ui.hx = tx;
        ui.hy = ty;
        ui.hshow = true;
        if (!ui.pencilSticky) ui.hpencil = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
    if (button === RIGHT_BUTTON) {
      if (ui.pencilSticky) {
        // Toggle the persistent pencil mode (CapsLock-style). Only move the
        // highlight onto an empty cell — a filled/given cell can't take a mark.
        ui.hpencil = !ui.hpencil;
        if (state.grid[ty * cr + tx] === 0) {
          ui.hx = tx;
          ui.hy = ty;
          ui.hshow = true;
        }
      } else if (state.grid[ty * cr + tx] === 0) {
        if (tx === ui.hx && ty === ui.hy && ui.hshow && ui.hpencil) {
          ui.hshow = false;
        } else {
          ui.hpencil = true;
          ui.hx = tx;
          ui.hy = ty;
          ui.hshow = true;
        }
      } else {
        ui.hshow = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
  }

  if (isCursorMove(button)) {
    ui.hcursor = true;
    return moveCursor(button, ui, cr);
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  // A digit key (1..9 then a..z / A..Z for orders > 9), or a clear.
  let n = -1;
  if (button >= 48 && button <= 57 && button - 48 <= cr) n = button - 48;
  else if (button >= 97 && button <= 122 && button - 97 + 10 <= cr)
    n = button - 97 + 10;
  else if (button >= 65 && button <= 90 && button - 65 + 10 <= cr) n = button - 65 + 10;
  else if (button === CURSOR_SELECT2 || button === 8 || button === 127) n = 0;

  if (ui.hshow && n >= 0) {
    const i = ui.hy * cr + ui.hx;

    // Can't overwrite a given (reachable only via the cursor).
    if (state.immutable[i]) return null;
    // Can't pencil-mark a filled square (reachable only via the cursor).
    if (ui.hpencil && state.grid[i]) return null;

    // No-op: re-entering the value the cell already holds (or clearing an empty
    // cell) with no pencil marks to wipe.
    if ((!ui.hpencil || n === 0) && state.grid[i] === n && state.pencil[i] === 0) {
      if (!ui.hcursor) {
        ui.hshow = false;
        return UI_UPDATE;
      }
      return null;
    }

    const pencil = ui.hpencil && n > 0;
    if (!ui.hcursor && !(ui.hpencil && ui.pencilKeepHighlight)) ui.hshow = false;
    return pencil
      ? { type: "set", x: ui.hx, y: ui.hy, n, pencil }
      : { type: "set", x: ui.hx, y: ui.hy, n, pencil, autoElim: ui.autoPencil };
  }

  // 'M' / 'm': fill all pencil marks, then (on a fully-noted board) clean the
  // obvious candidates already placed in each cell's row, column, block or (X)
  // diagonal — the basic-region opening, in one press.
  if (button === 77 || button === 109)
    return adaptiveMarkAllMove<SoloMove>(state.grid, state.pencil, cr, (x, y) =>
      regionsOf(state, x, y),
    );

  return null;
}

/** Strike digit `n` from the pencil marks of every cell sharing a row, column,
 * block (or diagonal when xtype) with `(x, y)` — auto-pencil cleanup on a real
 * placement. */
function autoEliminate(state: SoloState, x: number, y: number, n: number): void {
  const cr = state.cr;
  const bit = ~(1 << n);
  const wb = state.blocks.whichblock;
  const home = wb[y * cr + x];
  for (let k = 0; k < cr; k++) {
    if (k !== x) state.pencil[y * cr + k] &= bit; // row
    if (k !== y) state.pencil[k * cr + x] &= bit; // column
  }
  // Block (the block can extend beyond the row/column already cleared).
  for (let i = 0; i < cr * cr; i++) {
    if (i !== y * cr + x && wb[i] === home) state.pencil[i] &= bit;
  }
  if (state.xtype) {
    const cell = y * cr + x;
    if (onDiag0Cell(cell, cr))
      for (let k = 0; k < cr; k++) {
        const d = k * (cr + 1);
        if (d !== cell) state.pencil[d] &= bit;
      }
    if (onDiag1Cell(cell, cr))
      for (let k = 0; k < cr; k++) {
        const d = (k + 1) * (cr - 1);
        if (d !== cell) state.pencil[d] &= bit;
      }
  }
}

function onDiag0Cell(xy: number, cr: number): boolean {
  return xy % (cr + 1) === 0;
}
function onDiag1Cell(xy: number, cr: number): boolean {
  return xy % (cr - 1) === 0 && xy > 0 && xy < cr * cr - 1;
}

function executeMove(state: SoloState, move: SoloMove): SoloState {
  const cr = state.cr;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * cr + move.x;
      if (move.pencil && move.n > 0) {
        next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
        next.pencil[i] = 0;
        if (move.autoElim && move.n > 0) autoEliminate(next, move.x, move.y, move.n);
        if (!next.completed && isComplete(next)) next.completed = true;
      }
      return next;
    }
    case "pencilAll": {
      // Bits 1..cr set (digit n ⇒ bit 1<<n).
      const all = ((1 << (cr + 1)) - (1 << 1)) | 0;
      for (let i = 0; i < cr * cr; i++) if (!next.grid[i]) next.pencil[i] = all;
      return next;
    }
    case "pencilStrike": {
      for (const { x, y, n } of move.marks) next.pencil[y * cr + x] &= ~(1 << n);
      return next;
    }
    case "solve": {
      for (let i = 0; i < cr * cr; i++) {
        next.grid[i] = move.grid[i];
        next.pencil[i] = 0;
      }
      next.completed = true;
      next.cheated = true;
      return next;
    }
  }
}

/** `check_valid` over the working grid (every region complete, cages sum). */
function isComplete(state: SoloState): boolean {
  return checkValid(state.cr, state.blocks, state.killerData, state.xtype, state.grid);
}

function solve(orig: SoloState, _curr: SoloState, aux?: string): SolveResult<SoloMove> {
  const cr = orig.cr;
  if (aux) {
    // aux is an "S<digit><digit>…" encoded full solution (encode_solve_move).
    const grid: number[] = [];
    for (let i = 0; i < cr * cr; i++) grid[i] = aux.charCodeAt(i + 1) - 48;
    return { ok: true, move: { type: "solve", grid } };
  }
  // Re-derive from the givens only.
  const fromGivens = givensOnly(orig);
  const { diff, grid } = solveSolo(fromGivens, DIFF_RECURSIVE, DIFF_KINTERSECT);
  if (diff === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (diff === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(grid, (v) => v) } };
}

/** A copy of `state` with every non-given cell cleared (so the solver works
 * from the puzzle's fixed clues, never the player's entries/notes). */
function givensOnly(state: SoloState): SoloState {
  const s = cloneState(state);
  for (let i = 0; i < s.cr * s.cr; i++) {
    if (!s.immutable[i]) s.grid[i] = 0;
    s.pencil[i] = 0;
  }
  return s;
}

function findMistakes(state: SoloState): readonly SoloMistake[] {
  const cr = state.cr;
  // The solution is derived from the givens (+ cage clues) only — never from the
  // player's notes (a note can be wrong; that is what we are checking).
  const { diff, grid: soln } = solveSolo(
    givensOnly(state),
    DIFF_RECURSIVE,
    DIFF_KINTERSECT,
  );
  if (diff === DIFF_IMPOSSIBLE || diff === DIFF_AMBIGUOUS) return [];
  const out: SoloMistake[] = [];
  for (let i = 0; i < cr * cr; i++) {
    if (state.immutable[i]) continue;
    if (state.grid[i]) {
      if (state.grid[i] !== soln[i])
        out.push({ kind: "cell", x: i % cr, y: (i / cr) | 0 });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & (1 << soln[i]))) {
      out.push({ kind: "note", x: i % cr, y: (i / cr) | 0 });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

const POPULATE_TEXT =
  "Start by pencilling in every candidate number in each empty cell, so the eliminations that follow have something to cross out.";

/** Join a value list for narration: `[3]`→"3", `[1,2]`→"1 and 2",
 * `[1,2,3]`→"1, 2 and 3". */
/** A region's cells (reading order) — for evidence shading. */
function regionCells(region: SoloRegion, state: SoloState): { x: number; y: number }[] {
  const cr = state.cr;
  const out: { x: number; y: number }[] = [];
  switch (region.kind) {
    case "row":
      for (let k = 0; k < cr; k++) out.push({ x: k, y: region.index });
      break;
    case "col":
      for (let k = 0; k < cr; k++) out.push({ x: region.index, y: k });
      break;
    case "block":
      for (const c of state.blocks.blocks[region.index])
        out.push({ x: c % cr, y: (c / cr) | 0 });
      break;
    case "diag0":
      for (let k = 0; k < cr; k++) {
        const c = diag0(k, cr);
        out.push({ x: c % cr, y: (c / cr) | 0 });
      }
      break;
    case "diag1":
      for (let k = 0; k < cr; k++) {
        const c = diag1(k, cr);
        out.push({ x: c % cr, y: (c / cr) | 0 });
      }
      break;
  }
  return out;
}

/** The reader-facing name of a region. */
function regionName(region: SoloRegion): string {
  switch (region.kind) {
    case "row":
      return "row";
    case "col":
      return "column";
    case "block":
      return "block";
    case "diag0":
    case "diag1":
      return "diagonal";
  }
}

/** The uniqueness regions of cell `(x, y)`, in narration-preference order (row,
 * column, sub-block, then the X diagonals it lies on). Each carries its `SoloRegion`
 * tag for naming. The single source of truth for "this cell's uniqueness regions",
 * shared by the placement classifier ({@link soloPlacementReason}), the
 * basic-region strike and the placement dup-cull, so they can never disagree. */
function regionsOf(
  state: SoloState,
  x: number,
  y: number,
): { cells: number[]; region: SoloRegion }[] {
  const cr = state.cr;
  const cell = y * cr + x;
  const line = (build: (k: number) => number): number[] =>
    Array.from({ length: cr }, (_, k) => build(k));
  const regions: { cells: number[]; region: SoloRegion }[] = [
    { cells: line((k) => y * cr + k), region: { kind: "row", index: y } },
    { cells: line((k) => k * cr + x), region: { kind: "col", index: x } },
  ];
  const b = state.blocks.whichblock[cell];
  regions.push({ cells: state.blocks.blocks[b], region: { kind: "block", index: b } });
  if (state.xtype) {
    if (onDiag0(cell, cr))
      regions.push({ cells: line((k) => diag0(k, cr)), region: { kind: "diag0" } });
    if (onDiag1(cell, cr))
      regions.push({ cells: line((k) => diag1(k, cr)), region: { kind: "diag1" } });
  }
  return regions;
}

/** Re-derive *why* a generic-`single` placement is forced, from the working board
 * (§9.3a — the recorded `place` carries a bare `single`, conflating naked and
 * positional/hidden singles): a naked single (the cell's notes collapsed to one),
 * a hidden single in a row/column/sub-block/diagonal, or a forced single (the
 * notes lag a deeper deduction). */
function soloPlacementReason(
  wGrid: Int8Array,
  wPen: Int32Array,
  x: number,
  y: number,
  n: number,
  state: SoloState,
): SoloReason {
  const cell = y * state.cr + x;
  const c = classifyPlacementInRegions(wGrid, wPen, cell, n, regionsOf(state, x, y));
  if (c.kind === "naked") return { kind: "single" };
  if (c.kind === "hidden") return { kind: "hiddenSingle", n, region: c.region.region };
  return { kind: "forcedSingle", n };
}

/** Narrate *why* a firing is forced (hint-authoring §2): indication → reasoning →
 * necessity-voice conclusion. `ns` is the struck value list (a placement passes
 * its single digit). */
function narrate(reason: SoloReason, ns: number[]): string {
  switch (reason.kind) {
    case "single":
      return `Every other number has been ruled out in this cell, so it can only be ${ns[0]}.`;
    case "hiddenSingle": {
      const r = regionName(reason.region);
      return `In this ${r}, ${reason.n} can go in only this cell — every other cell in the ${r} has ruled it out — so it must be ${reason.n}.`;
    }
    case "forcedSingle":
      return `Working through this cell's row, column and block together, only ${reason.n} can still go here — so it must be ${reason.n}.`;
    case "dup":
      return `A ${reason.n} is already placed in this cell, so it can't repeat in the same row, column or block — cross out the ${reason.n} from these cells.`;
    case "intersect": {
      const cName = regionName(reason.confined);
      const tName = regionName(reason.target);
      return `In this ${cName}, every cell that can still take ${reason.n} also lies in this ${tName} — so ${reason.n} must sit where they overlap, and is crossed out of the rest of the ${tName}.`;
    }
    case "set":
      return reason.region
        ? `Another group of cells in this ${regionName(reason.region)} already accounts for a fixed set of numbers that includes ${joinNums(ns)}, so we must cross out ${joinNums(ns)} here.`
        : `A locked pattern of cells across these lines already accounts for ${joinNums(ns)}, so we must cross out ${joinNums(ns)} here.`;
    case "forcing":
      return `Following a chain of forced candidates, placing ${ns[0]} here would lead to a contradiction — so we must cross out ${joinNums(ns)}.`;
    case "cageSingle":
      return `The rest of this killer cage is filled in, and the one cell left must bring the cage to its total — so it can only be ${ns[0]}.`;
    case "cageIntersect":
      return `These cells must together total ${reason.clue} once the cages within their region are accounted for, and only this cell is left undetermined — so it must be ${ns[0]}.`;
    case "cageMinMax":
      return `This killer cage must total ${reason.clue}; the digits its other cells can still hold leave no room for ${joinNums(ns)} here — so cross out ${joinNums(ns)}.`;
    case "cageSums":
      return `No way to make this killer cage total ${reason.clue} uses ${joinNums(ns)} in this cell, so cross out ${joinNums(ns)}.`;
  }
}

/** The deduction's evidence cells to shade `COL_HINT_CELL`. */
function reasonArea(reason: SoloReason, state: SoloState): { x: number; y: number }[] {
  switch (reason.kind) {
    case "intersect":
      return regionCells(reason.confined, state);
    case "set":
      return reason.region ? regionCells(reason.region, state) : [];
    case "cageSingle":
    case "cageIntersect":
    case "cageMinMax":
    case "cageSums":
      return reason.cells;
    default:
      return [];
  }
}

/** A placement's evidence cells: a hidden single shades the whole region it
 * reasons over; a killer placement shades its cage; a naked single needs none. */
function placementArea(
  reason: SoloReason,
  state: SoloState,
): { x: number; y: number }[] {
  if (reason.kind === "hiddenSingle") return regionCells(reason.region, state);
  if (reason.kind === "cageSingle" || reason.kind === "cageIntersect")
    return reason.cells;
  return [];
}

/** Emit one firing's strikes as a journey. A digit-confined firing (`intersect`)
 * is one multi-cell step (it crosses a single digit from several cells); every
 * other firing (cage pruning, a region subset) is split by cell — one leg each
 * narrating "this cell" — so a multi-digit strike never shows a single value
 * crossed in the wrong place (hint-authoring §9.3). */
function emitStrikeJourney(
  steps: HintStep<SoloMove, SoloHint>[],
  wPen: Int32Array,
  state: SoloState,
  groupOps: HintOp[],
): void {
  const cr = state.cr;
  const reason = groupOps[0].reason;
  const apply = (marks: { x: number; y: number; n: number }[]): void => {
    for (const m of marks) wPen[m.y * cr + m.x] &= ~(1 << m.n);
  };

  if (reason.kind === "intersect") {
    const marks = groupOps.map((op) => ({ x: op.x, y: op.y, n: op.n }));
    steps.push({
      move: { type: "pencilStrike", marks },
      explanation: narrate(reason, [reason.n]),
      highlights: {
        area: reasonArea(reason, state),
        targets: marks.map((m) => ({ x: m.x, y: m.y })),
        marks,
      },
    });
    apply(marks);
    return;
  }

  const byCell = new Map<number, HintOp[]>();
  for (const op of groupOps) {
    const key = op.y * cr + op.x;
    const arr = byCell.get(key);
    if (arr) arr.push(op);
    else byCell.set(key, [op]);
  }
  let first = true;
  for (const [key, cellOps] of byCell) {
    const x = key % cr;
    const y = (key / cr) | 0;
    const marks = cellOps.map((op) => ({ x, y, n: op.n }));
    const values = marks.map((m) => m.n).sort((a, b) => a - b);
    steps.push({
      move: { type: "pencilStrike", marks },
      explanation: narrate(reason, values),
      highlights: { area: reasonArea(reason, state), targets: [{ x, y }], marks },
      continuesPrevious: !first,
    });
    apply(marks);
    first = false;
  }
}

/** Emit a placement step and apply it, striking the placed value from the rest of
 * its row, column, sub-block and (X) diagonal. With auto-pencil on (`autoClean`)
 * that cleanup is silent (the move's own `autoElim` does it); with it off it
 * becomes an explicit `pencilStrike` journey continuation. */
function emitPlacement(
  steps: HintStep<SoloMove, SoloHint>[],
  wGrid: Int8Array,
  wPen: Int32Array,
  state: SoloState,
  x: number,
  y: number,
  n: number,
  reason: SoloReason,
  autoClean: boolean,
): void {
  const cr = state.cr;
  steps.push({
    move: { type: "set", x, y, n, pencil: false, autoElim: autoClean },
    explanation: narrate(reason, [n]),
    highlights: { area: placementArea(reason, state), targets: [{ x, y }], marks: [] },
  });
  wGrid[y * cr + x] = n;
  wPen[y * cr + x] = 0;

  // The row/column/block/diagonal copies the placement rules out.
  const dupMarks = regionDuplicateMarks(wGrid, wPen, x, y, n, cr, regionsOf(state, x, y));
  for (const m of dupMarks) wPen[m.y * cr + m.x] &= ~(1 << n);

  if (!autoClean && dupMarks.length > 0) {
    steps.push({
      move: { type: "pencilStrike", marks: dupMarks },
      explanation: narrate({ kind: "dup", n, px: x, py: y }, []),
      highlights: {
        area: [{ x, y }],
        targets: dupMarks.map((m) => ({ x: m.x, y: m.y })),
        marks: dupMarks,
      },
      continuesPrevious: true,
    });
  }
}

/** Build the hint plan by walking a working copy the way a person solves it: a
 * naked single first; else (after a lazy populate) the basic-region cull a placed
 * value forces; else the next deductive elimination; else a forced placement. */
function buildSteps(
  state: SoloState,
  autoClean: boolean,
): HintStep<SoloMove, SoloHint>[] {
  const cr = state.cr;
  const steps: HintStep<SoloMove, SoloHint>[] = [];
  const wGrid = Int8Array.from(state.grid);
  const wPen = Int32Array.from(state.pencil);
  const maxdiff = Math.min(state.params.diff, DIFF_EXTREME);
  const maxkdiff = state.params.kdiff;
  const recOps = (): HintOp[] =>
    recordSoloDeductions({ ...state, grid: wGrid }, maxdiff, maxkdiff);

  let populated = !anyEmptyLacksNotes(state.grid, state.pencil, cr);
  const ensurePopulated = (): void => {
    if (populated) return;
    const all = ((1 << (cr + 1)) - (1 << 1)) | 0;
    for (let i = 0; i < cr * cr; i++) if (!wGrid[i]) wPen[i] = all;
    steps.push({
      move: { type: "pencilAll" },
      explanation: POPULATE_TEXT,
      highlights: { area: [], targets: [], marks: [] },
    });
    populated = true;
  };

  let ops = recOps();
  const budget = stepBudget("solo hint plan");
  const cap = cr * cr * cr * 4 + 4;
  for (let guard = 0; guard < cap; guard++) {
    budget.tick();
    let filled = true;
    for (let i = 0; i < cr * cr; i++) if (!wGrid[i]) filled = false;
    if (filled) break;

    // 1. A naked single — the next move a human makes.
    const ns = nakedSingle(wGrid, wPen, cr);
    if (ns) {
      emitPlacement(
        steps,
        wGrid,
        wPen,
        state,
        ns.x,
        ns.y,
        ns.n,
        { kind: "single" },
        autoClean,
      );
      ops = recOps();
      continue;
    }

    // 2. Pencil in the notes (once) before any elimination needs them.
    if (!populated) {
      ensurePopulated();
      continue;
    }

    // 3. The basic-region cull a placed value forces.
    const bs = findRegionDuplicate(wGrid, wPen, cr, (x, y) => regionsOf(state, x, y));
    if (bs) {
      steps.push({
        move: { type: "pencilStrike", marks: bs.marks },
        explanation: narrate({ kind: "dup", n: bs.n, px: bs.px, py: bs.py }, []),
        highlights: {
          area: [{ x: bs.px, y: bs.py }],
          targets: bs.marks.map((m) => ({ x: m.x, y: m.y })),
          marks: bs.marks,
        },
      });
      for (const m of bs.marks) wPen[m.y * cr + m.x] &= ~(1 << m.n);
      continue;
    }

    // 4. The next deductive elimination (the technique worth teaching).
    const cs = nextStrike(ops, wGrid, wPen, cr);
    if (cs) {
      emitStrikeJourney(steps, wPen, state, cs);
      continue;
    }

    // 5. A forced placement (a cube collapse the notes lag) — re-derive *why*
    // (naked vs hidden single) from the working board for the generic singles;
    // a killer placement keeps its recorded cage reason.
    const pl = nextPlace(ops, wGrid, cr);
    if (pl) {
      const reason =
        pl.reason.kind === "single"
          ? soloPlacementReason(wGrid, wPen, pl.x, pl.y, pl.n, state)
          : pl.reason;
      emitPlacement(steps, wGrid, wPen, state, pl.x, pl.y, pl.n, reason, autoClean);
      ops = recOps();
      continue;
    }

    break; // stuck (e.g. an Unreasonable board now needing a guess)
  }

  return steps;
}

function hint(
  state: SoloState,
  _aux?: string,
  ui?: SoloUi,
): HintResult<SoloMove, SoloHint> {
  if (state.completed) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error:
        "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.",
    };
  }
  const autoClean = ui?.autoPencil ?? false;
  const steps = buildSteps(state, autoClean);
  if (steps.length === 0) {
    return { ok: false, error: "No further move can be deduced from this position." };
  }
  return { ok: true, steps };
}

/** Classify a player move against the displayed hint step (shared
 * candidate-elimination keep-track; `SoloHint` is structurally
 * `CandidateHighlights`). */
function hintKeepTrack(
  m: SoloMove,
  step: HintStep<SoloMove, SoloHint>,
  state: SoloState,
): HintTrackVerdict {
  return keepCandidateHintTrack(m, step, state.pencil, state.cr);
}

/** Re-validate a stored hint step against the current board before (re-)display
 * (shared "never show a stale step" guarantee). */
function refreshHintStep(
  step: HintStep<SoloMove, SoloHint>,
  state: SoloState,
): HintStep<SoloMove, SoloHint> | null {
  return refreshCandidateHintStep(step, state.grid, state.pencil, state.cr);
}

function flashLength(
  from: SoloState,
  to: SoloState,
  _dir: number,
  _ui: SoloUi,
): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
}

export const soloGame: Game<
  SoloParams,
  SoloState,
  SoloMove,
  SoloUi,
  SoloDrawState,
  SoloMistake
> = {
  id: "solo",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,
  canMarkAll: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  // Keys match the custom `solo` describeConfig in augmentation.ts.
  describeParams: (p): ConfigValues => ({
    "columns-of-sub-blocks": p.c,
    "rows-of-sub-blocks": p.r,
    jigsaw: p.r === 1,
    killer: p.killer,
    x: p.xtype,
    difficulty: p.diff,
    symmetry: p.symm,
  }),

  newDesc: (p, rng: RandomState) => newSoloDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status: (s): GameStatus => soloStatus(s),

  solve,
  hint,
  hintKeepTrack,
  refreshHintStep,
  findMistakes,
  requestKeys: (p): KeyLabel[] => digitKeys(p.c * p.r),

  prefs: [
    {
      kw: "auto-pencil",
      name: "When you place a number, remove it from pencil marks in its row, column and block",
      type: "boolean",
      get: (ui) => ui.autoPencil,
      set: (ui, v) => {
        ui.autoPencil = v;
      },
    },
    {
      kw: "sticky-pencil-mode",
      name: "Right-click toggles a sticky pencil mode (stays on until right-clicked again)",
      type: "boolean",
      get: (ui) => ui.pencilSticky,
      set: (ui, v) => {
        ui.pencilSticky = v;
      },
    },
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
  computeSize: (p: SoloParams, ts: number): Size => computeSize(p.c * p.r, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(soloGame);
