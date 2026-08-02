/**
 * Pearl move application, drag interpretation and completion checking —
 * faithful ports of `execute_move`, `interpret_ui_drag` / `update_ui_drag`
 * and `check_completion` / `dsf_update_completion` (pearl.c).
 *
 * Split out of `index.ts` so `render.ts` (which reflects the in-progress
 * drag) and `index.ts` can both import the drag helpers without a cycle
 * (playbook §3.2).
 */
import { Dsf } from "../../engine/dsf.ts";
import { pearlSolve } from "./solver.ts";
import {
  BLANK,
  bLD,
  bLR,
  bLU,
  bRD,
  bRU,
  bUD,
  CORNER,
  cloneState,
  D,
  DIFF_COUNT,
  DX,
  DY,
  ERROR_CLUE,
  F,
  inGrid,
  L,
  NBITS,
  NOCLUE,
  type PearlMove,
  type PearlState,
  R,
  STRAIGHT,
  U,
} from "./state.ts";

// --- drag interpretation ---------------------------------------------------
export interface DragLeg {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  dir: number;
  oldstate: number;
  newstate: number;
}

/** Work out the intended effect of drag leg `i` on the grid (upstream
 * `interpret_ui_drag`). `clearing` is threaded via a mutable holder. */
export function interpretUiDrag(
  state: PearlState,
  dragcoords: number[],
  clearing: { v: boolean },
  i: number,
): DragLeg {
  const w = state.w;
  const sp = dragcoords[i];
  const dp = dragcoords[i + 1];
  const sy = (sp / w) | 0;
  const sx = sp % w;
  const dy = (dp / w) | 0;
  const dx = dp % w;
  const dir = dy > sy ? D : dy < sy ? U : dx > sx ? R : L;
  const oldstate = state.lines[sp] & dir;
  let newstate: number;
  if (oldstate) {
    // The edge was present: set it absent, unless we've stopped clearing.
    newstate = clearing.v ? 0 : dir;
  } else {
    // The edge was absent: set it present, and cancel the 'clearing' flag.
    newstate = dir;
    clearing.v = false;
  }
  return { sx, sy, dx, dy, dir, oldstate, newstate };
}

/** Extend/truncate the drag path to include `(gx, gy)` (upstream
 * `update_ui_drag`). Mutates `dragcoords`/`ndragcoords` on `ui`. */
export function updateUiDrag(
  state: PearlState,
  ui: { dragcoords: number[]; ndragcoords: number },
  gx: number,
  gy: number,
): void {
  const w = state.w;
  if (!inGrid(state, gx, gy)) return; // outside grid
  if (ui.ndragcoords < 0) return; // drag not in progress

  const pos = gy * w + gx;
  const lastpos = ui.dragcoords[ui.ndragcoords > 0 ? ui.ndragcoords - 1 : 0];
  if (pos === lastpos) return; // same square as last visited

  if (ui.ndragcoords === 0) ui.ndragcoords = 1; // drag confirmed

  // Dragging into an already-visited square truncates the path back to it.
  for (let i = 1; i < ui.ndragcoords; i++)
    if (pos === ui.dragcoords[i]) {
      ui.ndragcoords = i + 1;
      return;
    }

  if (pos === ui.dragcoords[0]) {
    // A loop-shaped drag back to the start: allowed unless it makes a
    // vertex of the wrong degree.
    ui.dragcoords[ui.ndragcoords] = pos;
    const clearing = { v: true };
    let lines = state.lines[pos] & (L | R | U | D);
    for (let i = 0; i < ui.ndragcoords; i++) {
      const leg = interpretUiDrag(state, ui.dragcoords, clearing, i);
      if (leg.sx === gx && leg.sy === gy) lines ^= leg.oldstate ^ leg.newstate;
      if (leg.dx === gx && leg.dy === gy) lines ^= F(leg.oldstate) ^ F(leg.newstate);
    }
    if (NBITS(lines) > 2) {
      // Bad vertex degree: fall back to backtracking behaviour.
      ui.ndragcoords = 1;
      return;
    }
  }

  // A rook-move away from the last square extends the path.
  let oy = (ui.dragcoords[ui.ndragcoords - 1] / w) | 0;
  let ox = ui.dragcoords[ui.ndragcoords - 1] % w;
  if (ox === gx || oy === gy) {
    const dx = gx < ox ? -1 : gx > ox ? 1 : 0;
    const dy = gy < oy ? -1 : gy > oy ? 1 : 0;
    const dir = dy > 0 ? D : dy < 0 ? U : dx > 0 ? R : L;
    while (ox !== gx || oy !== gy) {
      // Stop at a 'no line here' mark — we don't let the drag cross one.
      if (state.marks[oy * w + ox] & dir) break;
      ox += dx;
      oy += dy;
      ui.dragcoords[ui.ndragcoords++] = oy * w + ox;
    }
  }
  // Failing that, a diagonal drag does nothing.
}

// --- completion checking ---------------------------------------------------
const COMP_NONE = 0;
const COMP_LOOP = 1;
const COMP_PATH = 2;
const COMP_SILLY = 3;
const COMP_EMPTY = 4;

/** Merge the two squares an edge connects, or report the state invalid
 * (upstream `dsf_update_completion`). */
function dsfUpdateCompletion(
  state: PearlState,
  ax: number,
  ay: number,
  dir: number,
  dsf: Dsf,
): boolean {
  const w = state.w;
  const ac = ay * w + ax;
  if (!(state.lines[ac] & dir)) return true; // no link
  const bx = ax + DX(dir);
  const by = ay + DY(dir);
  if (!inGrid(state, bx, by)) return false; // link off grid
  const bc = by * w + bx;
  if (!(state.lines[bc] & F(dir))) return false; // no reciprocal link
  dsf.merge(ac, bc);
  return true;
}

export interface CompletionResult {
  /** False when the line data is structurally invalid (a bad move). */
  valid: boolean;
  completed: boolean;
  errors: Uint8Array;
}

/** Classify the loop and mark errors (upstream `check_completion` with
 * `mark = true`). Pure: builds and returns a fresh `errors` array. */
export function checkCompletion(state: PearlState): CompletionResult {
  const { w, h, lines, clues } = state;
  const errors = new Uint8Array(w * h);
  let hadError = false;
  let completed = state.completed;

  const error = (x: number, y: number, e: number): void => {
    hadError = true;
    errors[y * w + x] |= e;
  };

  const dsf = new Dsf(w * h);
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      if (
        !dsfUpdateCompletion(state, x, y, R, dsf) ||
        !dsfUpdateCompletion(state, x, y, D, dsf)
      ) {
        return { valid: false, completed, errors };
      }
    }

  const compState = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++)
    compState[i] = dsf.canonify(i) === i ? COMP_LOOP : COMP_NONE;

  // Classify components; mark squares of degree > 2.
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      const type = lines[y * w + x];
      const degree = NBITS(type);
      const comp = dsf.canonify(y * w + x);
      if (degree > 2) {
        error(x, y, type);
        compState[comp] = COMP_SILLY;
      } else if (degree === 0) {
        compState[comp] = COMP_EMPTY;
      } else if (degree === 1) {
        if (compState[comp] !== COMP_SILLY) compState[comp] = COMP_PATH;
      }
    }

  // Count components, find the largest sensible one.
  let nsilly = 0;
  let nloop = 0;
  let npath = 0;
  let totalPathsize = 0;
  let largestComp = -1;
  let largestSize = -1;
  for (let i = 0; i < w * h; i++) {
    if (compState[i] === COMP_SILLY) {
      nsilly++;
    } else if (compState[i] === COMP_PATH) {
      totalPathsize += dsf.size(i);
      npath = 1;
    } else if (compState[i] === COMP_LOOP) {
      nloop++;
      const thisSize = dsf.size(i);
      if (thisSize > largestSize) {
        largestComp = i;
        largestSize = thisSize;
      }
    }
  }
  if (largestSize < totalPathsize) {
    largestComp = -1; // means the paths
    largestSize = totalPathsize;
  }

  if (nloop > 0 && nloop + npath > 1) {
    // Highlight every sensible component that isn't the largest.
    for (let i = 0; i < w * h; i++) {
      const comp = dsf.canonify(i);
      if (
        (compState[comp] === COMP_PATH && largestComp !== -1) ||
        (compState[comp] === COMP_LOOP && comp !== largestComp)
      )
        error(i % w, (i / w) | 0, lines[i]);
    }
  }

  // Check no clues are contradicted.
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      const type = lines[y * w + x];
      if (clues[y * w + x] === CORNER) {
        if ((bLR | bUD) & (1 << type)) error(x, y, ERROR_CLUE); // actually straight
        for (let d = 1; d <= 8; d += d)
          if (type & d) {
            const xx = x + DX(d);
            const yy = y + DY(d);
            if (!inGrid(state, xx, yy)) {
              error(x, y, d); // leads off grid
            } else if ((bLU | bLD | bRU | bRD) & (1 << lines[yy * w + xx])) {
              error(x, y, ERROR_CLUE); // touches a corner
            }
          }
      } else if (clues[y * w + x] === STRAIGHT) {
        if ((bLU | bLD | bRU | bRD) & (1 << type)) error(x, y, ERROR_CLUE); // a corner
        let straightTouches = 0;
        for (let d = 1; d <= 8; d += d)
          if (type & d) {
            const xx = x + DX(d);
            const yy = y + DY(d);
            if (!inGrid(state, xx, yy)) {
              error(x, y, d); // leads off grid
            } else if ((bLR | bUD) & (1 << lines[yy * w + xx])) {
              straightTouches++;
            }
          }
        if (straightTouches >= 2 && NBITS(type) >= 2) error(x, y, ERROR_CLUE);
      }
    }

  if (nloop === 1 && nsilly === 0 && npath === 0) {
    // A potentially-complete single loop: ensure no clue was left out.
    for (let x = 0; x < w; x++)
      for (let y = 0; y < h; y++) {
        if (lines[y * w + x] === BLANK && clues[y * w + x] !== NOCLUE)
          error(x, y, ERROR_CLUE);
      }
    if (!hadError) completed = true;
  }

  return { valid: true, completed, errors };
}

// --- move application ------------------------------------------------------
/** Apply a move purely, recompute completion/errors. Throws on an illegal
 * move (upstream `execute_move` returning NULL). Faithful to `execute_move`. */
export function executeMove(state: PearlState, move: PearlMove): PearlState {
  const w = state.w;
  const h = state.h;
  const ret = cloneState(state);

  for (const op of move.ops) {
    if (op.kind === "solve") {
      (ret as { usedSolve: boolean }).usedSolve = true;
      continue;
    }
    if (op.kind === "hint") {
      pearlSolve(w, h, ret.clues, ret.lines, DIFF_COUNT, true);
      for (let n = 0; n < w * h; n++) ret.marks[n] &= ~ret.lines[n];
      continue;
    }
    const { l, x, y } = op;
    if (!inGrid(state, x, y)) throw new Error("pearl: move off grid");
    if (l < 0 || l > 15) throw new Error("pearl: bad line value");
    const idx = y * w + x;
    if (op.kind === "line") ret.lines[idx] |= l;
    else if (op.kind === "noline") ret.lines[idx] &= ~l;
    else if (op.kind === "replace") {
      ret.lines[idx] = l;
      ret.marks[idx] &= ~l; // erase marks too
    } else if (op.kind === "flip") ret.lines[idx] ^= l;
    else if (op.kind === "mark") ret.marks[idx] ^= l;

    // Reject laying a line over a mark (interpret_move should prevent it).
    if (ret.lines[idx] & l && ret.marks[idx] & l)
      throw new Error("pearl: line over mark");
  }

  const check = checkCompletion(ret);
  if (!check.valid) throw new Error("pearl: invalid move");
  (ret as { completed: boolean }).completed = check.completed;
  (ret as { errors: Uint8Array }).errors = check.errors;
  return ret;
}
