/**
 * Ascent user-interface state and input (upstream `game_ui`, `ui_seek`,
 * `ui_backtrack`, `ascent_mouse_click`, `interpret_move`,
 * `game_changed_state`, `encode_ui`/`decode_ui`).
 *
 * The ephemeral entry state (held number, typing buffer, drag anchor,
 * keyboard cursor, candidate hints) lives on the `Ui`, never on the game
 * state, as upstream has it. Three number-entry methods, free-form path
 * drawing and the Edges arrow drag all reduce to the single-fragment
 * `AscentMove` union.
 */

import { UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  digitOf,
  type GridCursor,
  hideCursor,
  isEraseKey,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MIDDLE_BUTTON,
  MIDDLE_DRAG,
  MOD_NUM_KEYPAD,
  newCursor,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
} from "../../engine/pointer.ts";
import type { Point } from "../../engine/types.ts";
import type { AscentDrawState } from "./render.ts";
import {
  type AscentMove,
  type AscentState,
  CELL_NONE,
  countSegments,
  FLAG_COMPLETE,
  findDirection,
  followPath,
  fromNumberEdge,
  isEdgeValid,
  isHexagonal,
  isNear,
  isNumberEdge,
  isObstacle,
  MODE_HEXAGON,
  MODE_HONEYCOMB,
  movementForMode,
  NUMBER_BOUND,
  NUMBER_EMPTY,
  updatePathHints,
  updatePositions,
} from "./state.ts";

// --- ui constants --------------------------------------------------

export const TARGET_SHOW = 0x1;
export const TARGET_CONNECTED = 0x2;

/** Whether the cursor is shown lives on `ui.cursor`, like every other game's.
 * Ascent also keeps *which device* revealed it, because a mouse hover and a
 * keyboard cursor are drawn differently. `cursorFromKeyboard` is the
 * collection's name and polarity for that flag, shared with the note-taking
 * games; these two read the pair back as the states the code reasons in. */
export const keyboardCursor = (ui: AscentUi): boolean =>
  ui.cursor.visible && ui.cursorFromKeyboard;
export const mouseCursor = (ui: AscentUi): boolean =>
  ui.cursor.visible && !ui.cursorFromKeyboard;

/** Reveal the cursor as a keyboard cursor (`true`) or a mouse hover (`false`). */
export function revealCursor(ui: AscentUi, fromKeyboard: boolean): void {
  ui.cursor.visible = true;
  ui.cursorFromKeyboard = fromKeyboard;
}

const DRAG_RADIUS = 0.6;

export interface AscentUi {
  held: number;
  select: number;
  nextTarget: number;
  prevTarget: number;
  nextTargetMode: number;
  prevTargetMode: number;
  dir: number;

  positions: Int32Array;
  prevhints: Int32Array;
  nexthints: Int32Array;
  s: number;

  cursor: GridCursor;
  /** Whether the visible cursor is a keyboard cursor rather than a mouse
   * hover. Read only alongside `cursor.visible`, and written only by
   * {@link revealCursor}, the sole route to `visible = true`. */
  cursorFromKeyboard: boolean;
  typingCell: number;
  typingNumber: number;

  doubleclickCell: number;
  dragx: number;
  dragy: number;

  /** Preference: numpad enters numbers (false) or moves the cursor (true). */
  moveWithNumpad: boolean;
  /** Preference: when advancing, skip past an already-placed run of numbers so
   * the focus lands on its leading edge and recommends the next open number. */
  autoAdvanceRuns: boolean;
}

const isCursorSelect = (b: number) => b === CURSOR_SELECT || b === CURSOR_SELECT2;

export function newAscentUi(state: AscentState): AscentUi {
  const w = state.w;
  const s = w * state.h;
  const ui: AscentUi = {
    held: CELL_NONE,
    select: NUMBER_EMPTY,
    nextTarget: NUMBER_EMPTY,
    prevTarget: NUMBER_EMPTY,
    nextTargetMode: 0,
    prevTargetMode: 0,
    dir: 0,
    positions: new Int32Array(s),
    prevhints: new Int32Array(s),
    nexthints: new Int32Array(s),
    s,
    cursor: newCursor(),
    cursorFromKeyboard: false,
    typingCell: CELL_NONE,
    typingNumber: 0,
    doubleclickCell: -1,
    dragx: -1,
    dragy: -1,
    moveWithNumpad: false,
    autoAdvanceRuns: true,
  };

  /* Cursor starts at the first non-boundary cell. */
  let i = 0;
  for (; i < s; i++) {
    if (state.grid[i] !== NUMBER_BOUND) break;
  }
  ui.cursor.x = i % w;
  ui.cursor.y = Math.trunc(i / w);

  updatePositions(ui.positions, state.grid, s);
  updatePathHints(ui.prevhints, ui.nexthints, state);
  return ui;
}

function uiClear(ui: AscentUi): void {
  ui.held = CELL_NONE;
  ui.select = ui.nextTarget = ui.prevTarget = NUMBER_EMPTY;
  ui.nextTargetMode = ui.prevTargetMode = 0;
  ui.dir = 0;
}

/** Find the two numbers to highlight around the held number (upstream
 * `ui_seek`). */
function uiSeek(ui: AscentUi, state: AscentState): void {
  let start: number;

  if (ui.held < 0) start = NUMBER_EMPTY;
  else if (ui.nexthints[ui.held] !== NUMBER_EMPTY)
    start = followPath(state, ui.held, CELL_NONE);
  else start = state.grid[ui.held];

  ui.nextTargetMode = ui.prevTargetMode = 0;

  if (start < 0) {
    ui.select = NUMBER_EMPTY;
    ui.nextTarget = NUMBER_EMPTY;
    ui.prevTarget = NUMBER_EMPTY;
    return;
  }

  let n = start;
  let hasnext = n === state.last || ui.positions[n + 1] !== CELL_NONE;
  let hasprev = n === 0 || ui.positions[n - 1] !== CELL_NONE;
  ui.dir = n < 0 || (hasnext && hasprev) ? 0 : hasnext ? -1 : hasprev ? +1 : 0;
  ui.select = start + ui.dir;

  n = start;
  do {
    n++;
  } while (n + 1 <= state.last && ui.positions[n] === CELL_NONE);
  ui.nextTarget = n;

  n = start;
  do {
    n--;
  } while (n - 1 >= 0 && ui.positions[n] === CELL_NONE);
  ui.prevTarget = n;

  hasprev = start === 0 || Math.abs(ui.prevTarget - start) === 1;
  hasnext = start === state.last || Math.abs(ui.nextTarget - start) === 1;

  if (!hasnext || hasprev) ui.nextTargetMode |= TARGET_SHOW;
  if (!hasprev || hasnext) ui.prevTargetMode |= TARGET_SHOW;
  if (hasnext && hasprev) {
    ui.nextTargetMode |= TARGET_CONNECTED;
    ui.prevTargetMode |= TARGET_CONNECTED;
  }

  /* Look for the edges of the current line. */
  if (hasnext) {
    while (
      ui.nextTarget + 1 <= state.last &&
      ui.positions[ui.nextTarget + 1] !== CELL_NONE
    )
      ui.nextTarget++;
    if (ui.nextTarget === state.last) ui.nextTargetMode &= ~TARGET_SHOW;
  }
  if (hasprev) {
    while (ui.prevTarget - 1 >= 0 && ui.positions[ui.prevTarget - 1] !== CELL_NONE)
      ui.prevTarget--;
    if (ui.prevTarget === 0) ui.prevTargetMode &= ~TARGET_SHOW;
  }

  if (ui.nextTarget > state.last) ui.nextTarget = NUMBER_EMPTY;
}

/** Move the selection back to a placed number, then point forward again
 * (upstream `ui_backtrack`). */
function uiBacktrack(ui: AscentUi, state: AscentState): void {
  let n = ui.select;
  if (!ui.dir || n < 0) {
    const i = ui.held;
    const path = state.path && i >= 0 ? state.path[i] : 0;

    if (path && state.grid[i] === NUMBER_EMPTY) {
      const movement = movementForMode(state.mode);
      const w = state.w;
      n = 0;
      for (let dir = 0; dir < movement.dircount && !n; dir++) {
        if (!(path & (1 << dir))) continue;
        const i2 = movement.dirs[dir].dy * w + movement.dirs[dir].dx + i;
        n = followPath(state, i2, i);
      }
    }

    ui.select = n;
    ui.dir = 0;
    uiSeek(ui, state);
    return;
  }

  do {
    n -= ui.dir;
    ui.held = ui.positions[n];
  } while (ui.dir && n > 0 && n < state.last && ui.held === CELL_NONE);

  ui.select = n + ui.dir;
  uiSeek(ui, state);
}

export function changedState(
  ui: AscentUi,
  oldState: AscentState | null,
  newState: AscentState,
): void {
  updatePositions(ui.positions, newState.grid, newState.w * newState.h);
  updatePathHints(ui.prevhints, ui.nexthints, newState);

  if (ui.held >= 0 && ui.select >= 0 && newState.grid[ui.held] === NUMBER_EMPTY) {
    uiBacktrack(ui, newState);
  }
  const oldCompleted = oldState ? oldState.completed : false;
  if (!oldCompleted && newState.completed) {
    uiClear(ui);
  } else {
    if (ui.held >= 0) ui.select = newState.grid[ui.held];
    uiSeek(ui, newState);
  }
}

/** Can a path line be drawn from `ui.held` to cell `i` (upstream
 * `ascent_validate_path_move`)? */
export function validatePathMove(i: number, state: AscentState, ui: AscentUi): boolean {
  if (ui.held < 0 || ui.held === i) return false;

  const w = state.w;
  const start = ui.held >= 0 ? state.grid[ui.held] : NUMBER_EMPTY;
  const n = state.grid[i];

  if (!isNear(ui.held, i, w, state.mode)) return false;

  const movement = movementForMode(state.mode);
  const dir1 = findDirection(ui.held, i, w, movement);
  const dir2 = findDirection(i, ui.held, w, movement);

  /* Don't draw a line between two adjacent confirmed numbers. */
  if (state.grid[i] >= 0 && start >= 0) return false;

  /* Don't connect to a cell with two path segments, except when erasing. */
  if (
    countSegments(state, ui.held) === 2 &&
    !(state.path && state.path[ui.held] & (1 << dir1))
  )
    return false;
  if (countSegments(state, i) === 2 && !(state.path && state.path[i] & (1 << dir2)))
    return false;

  if (state.path && !(state.path[i] & (1 << dir2))) {
    if (
      start >= 0 &&
      ui.nexthints[i] !== NUMBER_EMPTY &&
      ui.nexthints[i] - start !== -1 &&
      ui.prevhints[i] - start !== +1
    )
      return false;

    if (
      n >= 0 &&
      ui.nexthints[ui.held] !== NUMBER_EMPTY &&
      ui.nexthints[ui.held] - n !== -1 &&
      ui.prevhints[ui.held] - n !== +1
    )
      return false;

    if (
      ui.nexthints[i] !== NUMBER_EMPTY &&
      ui.nexthints[ui.held] !== NUMBER_EMPTY &&
      ui.nexthints[ui.held] - ui.prevhints[i] !== -1 &&
      ui.prevhints[ui.held] - ui.nexthints[i] !== +1
    )
      return false;
  }

  return true;
}

/**
 * The two candidate numbers a right-click cycles cell `i` through, or `null`
 * when the cell has no two-option ambiguity (so the normal clear applies).
 * Deliberate divergence: a cell that could take either of two consecutive
 * numbers is common in Ascent (an open path end next to a placed number, or a
 * cell adjacent to a held number). Covers three sources — an origin number
 * held adjacent to `i`, an empty cell already showing two path hints, and a
 * filled cell adjacent to exactly one consecutive placed number (so toggling
 * keeps working after the first placement). Returns the pair sorted ascending.
 */
function candidatesFor(
  state: AscentState,
  ui: AscentUi,
  i: number,
): [number, number] | null {
  if (state.immutable[i]) return null;
  const w = state.w;
  const v = state.grid[i];
  const canUse = (c: number) =>
    c >= 0 &&
    c <= state.last &&
    (ui.positions[c] === CELL_NONE || ui.positions[c] === i);
  const pair = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

  // 1. An origin number is held and adjacent (also the "still holding the
  //    origin, then right-click a target" case).
  if (ui.held >= 0 && state.grid[ui.held] >= 0 && isNear(ui.held, i, w, state.mode)) {
    const nHeld = state.grid[ui.held];
    if (v === NUMBER_EMPTY || v === nHeld - 1 || v === nHeld + 1) {
      const opts = [nHeld - 1, nHeld + 1].filter(canUse);
      if (opts.length === 2) return pair(opts[0], opts[1]);
    }
  }

  // 2. An empty cell already showing two path-hint options.
  if (
    v === NUMBER_EMPTY &&
    ui.prevhints[i] >= 0 &&
    ui.nexthints[i] >= 0 &&
    ui.prevhints[i] !== ui.nexthints[i]
  ) {
    return pair(ui.prevhints[i], ui.nexthints[i]);
  }

  // 3. A filled cell adjacent to exactly one consecutive placed number: it
  //    could be its own value or the reflection across that number.
  if (v >= 0) {
    const movement = movementForMode(state.mode);
    let m = -1;
    let count = 0;
    for (let dir = 0; dir < movement.dircount; dir++) {
      const j = i + movement.dirs[dir].dy * w + movement.dirs[dir].dx;
      if (j < 0 || j >= w * state.h || !isNear(i, j, w, state.mode)) continue;
      const nv = state.grid[j];
      if (nv >= 0 && Math.abs(nv - v) === 1) {
        m = nv;
        count++;
      }
    }
    if (count === 1) {
      const other = 2 * m - v;
      if (other !== v && canUse(other)) return pair(v, other);
    }
  }

  return null;
}

/** Handle a click/drag at grid cell (gx,gy), mutating `ui` and returning a
 * move fragment or `null` (upstream `ascent_mouse_click`). */
function mouseClick(
  state: AscentState,
  ui: AscentUi,
  gx: number,
  gy: number,
  button: number,
  keyboard: boolean,
): AscentMove | null {
  const w = state.w;
  const h = state.h;
  const i = gy * w + gx;
  const n = state.grid[i];
  const start = ui.held >= 0 ? state.grid[ui.held] : NUMBER_EMPTY;

  /* The LEFT_DRAG arm, which upstream's LEFT_BUTTON case falls into. It reads
   * the outer `button`, so its LEFT_BUTTON- and LEFT_DRAG-only branches still
   * gate correctly. */
  const leftDragArm = (): AscentMove | null => {
    if (ui.doubleclickCell !== i) ui.doubleclickCell = -1;

    /* Update drag cursor when dragging a number from the edge */
    if (isNumberEdge(ui.select) && button === LEFT_DRAG) {
      ui.dragx = gx;
      ui.dragy = gy;
      if (ui.held % w > 0 && ui.held % w < w - 1) ui.dragx = -1;
      if (Math.trunc(ui.held / w) > 0 && Math.trunc(ui.held / w) < h - 1) ui.dragy = -1;
      return null;
    }
    /* Dragging over a number in sequence moves the highlight */
    if (
      n >= 0 &&
      ui.held >= 0 &&
      start >= 0 &&
      ((n > start && ui.nextTargetMode & TARGET_CONNECTED && n <= ui.nextTarget) ||
        (n < start && ui.prevTargetMode & TARGET_CONNECTED && n >= ui.prevTarget))
    ) {
      ui.held = i;
      uiSeek(ui, state);
      hideCursor(ui.cursor);
      return null;
    }
    /* Place the next number */
    if (
      n === NUMBER_EMPTY &&
      ui.held >= CELL_NONE &&
      ui.select >= 0 &&
      ui.positions[ui.select] === CELL_NONE &&
      isNear(ui.held, i, w, state.mode) &&
      !(
        ui.nexthints[i] !== NUMBER_EMPTY &&
        ui.nexthints[i] !== ui.select &&
        ui.prevhints[i] !== ui.select
      )
    ) {
      if (state.path && state.path[i] & FLAG_COMPLETE) return null;
      const move: AscentMove = { kind: "place", cell: i, n: ui.select };
      const placedNum = ui.select;
      const placedDir = ui.dir;
      ui.held = i;
      /* Auto-advance across an already-placed run (preference, default on):
       * if the numbers past the one just placed are already on the board, jump
       * the focus to the leading edge of that run so the next open number is
       * recommended straight away — place 14 next to a placed 15-16 run and the
       * focus jumps to 16, recommending 17, instead of stalling on 14. */
      if (ui.autoAdvanceRuns && (placedDir === 1 || placedDir === -1)) {
        let edge = placedNum;
        while (true) {
          const nxt = edge + placedDir;
          if (nxt < 0 || nxt > state.last || ui.positions[nxt] < 0) break;
          edge = nxt;
        }
        if (edge !== placedNum && ui.positions[edge] >= 0) ui.held = ui.positions[edge];
      }
      uiSeek(ui, state);
      if (!keyboard) hideCursor(ui.cursor);
      return move;
    }
    /* Keyboard-drag a path line */
    if (keyboard && !ui.dir && validatePathMove(i, state, ui)) {
      const move: AscentMove = { kind: "line", from: i, to: ui.held, erase: false };
      ui.held = i;
      return move;
    }
    /* Highlight an empty cell */
    if (n === NUMBER_EMPTY && button === LEFT_BUTTON) {
      uiClear(ui);
      ui.cursor.x = i % w;
      ui.cursor.y = Math.trunc(i / w);
      revealCursor(ui, keyboard);
      ui.held = i;
      ui.select = NUMBER_EMPTY;
      ui.dir = 0;
      uiBacktrack(ui, state);
      return null;
    }
    /* Drag a path line */
    if (!ui.dir && validatePathMove(i, state, ui)) {
      const move: AscentMove = { kind: "line", from: i, to: ui.held, erase: false };
      ui.held = i;
      hideCursor(ui.cursor);
      return move;
    }
    return null;
  };

  /* The MIDDLE/RIGHT_DRAG arm (upstream falls into it from MIDDLE/RIGHT_BUTTON). */
  const rightDragArm = (): AscentMove | null => {
    if (
      ui.typingCell === CELL_NONE &&
      !state.immutable[i] &&
      (n !== NUMBER_EMPTY || state.path?.[i])
    ) {
      return { kind: "clear", cell: i };
    }
    return null;
  };

  if (button === LEFT_BUTTON) {
    ui.doubleclickCell = ui.held === i ? i : -1;

    /* Click on edge number */
    if (isNumberEdge(n) && ui.positions[fromNumberEdge(n)] === CELL_NONE) {
      ui.held = i;
      ui.nextTarget = ui.prevTarget = NUMBER_EMPTY;
      ui.select = n;
      ui.dir = 0;
      return null;
    }
    /* Click on wall */
    if (isObstacle(n)) {
      uiClear(ui);
      return null;
    }
    if (n >= 0) {
      /* Keyboard: draw a line to this number */
      if (keyboard && validatePathMove(i, state, ui)) {
        const move: AscentMove = { kind: "line", from: i, to: ui.held, erase: false };
        ui.held = i;
        return move;
      }
      /* Highlight a placed number */
      ui.held = i;
      uiSeek(ui, state);
      return null;
    }
    if (
      n === NUMBER_EMPTY &&
      isNumberEdge(ui.select) &&
      isEdgeValid(ui.held, i, w, h)
    ) {
      const num = fromNumberEdge(ui.select);
      ui.held = i;
      uiSeek(ui, state);
      return { kind: "place", cell: i, n: num };
    }
    return leftDragArm(); /* deliberate fallthrough */
  }

  if (button === LEFT_DRAG) return leftDragArm();

  if (button === LEFT_RELEASE) {
    ui.dragx = ui.dragy = -1;
    if (ui.doubleclickCell === i) {
      uiClear(ui);
      if (mouseCursor(ui)) hideCursor(ui.cursor);
    } else if (
      n === NUMBER_EMPTY &&
      isNumberEdge(ui.select) &&
      isEdgeValid(ui.held, i, w, h)
    ) {
      const num = fromNumberEdge(ui.select);
      uiClear(ui);
      return { kind: "place", cell: i, n: num };
    }
    return null;
  }

  if (button === RIGHT_BUTTON) {
    /* Deliberate divergence: on a cell with two candidate numbers, cycle
     * none → lower → higher → none instead of clearing, so a right-click (or
     * the keyboard secondary-select) toggles between the two options. */
    const cands = candidatesFor(state, ui, i);
    if (cands) {
      const target =
        state.grid[i] === cands[0]
          ? cands[1]
          : state.grid[i] === cands[1]
            ? NUMBER_EMPTY
            : cands[0];
      return target === NUMBER_EMPTY
        ? { kind: "clear", cell: i }
        : { kind: "place", cell: i, n: target };
    }
    if (n === NUMBER_EMPTY || state.immutable[i]) uiClear(ui);
    return rightDragArm();
  }

  if (button === MIDDLE_BUTTON) {
    /* Middle-click always clears (a two-option-free way to erase). */
    if (n === NUMBER_EMPTY || state.immutable[i]) uiClear(ui);
    return rightDragArm();
  }

  if (button === MIDDLE_DRAG || button === RIGHT_DRAG) return rightDragArm();

  return null;
}

/** Translate a pointer/key event to a move (upstream `interpret_move`). */
export function interpretAscentMove(
  state: AscentState,
  ui: AscentUi,
  ds: AscentDrawState,
  p: Point,
  button: number,
): AscentMove | null | UiUpdate {
  const w = state.w;
  const h = state.h;
  const tilesize = ds ? ds.tileSize : 1;
  let ret: AscentMove | null = null;
  let finishTyping = false;

  let ox = p.x - (ds ? ds.offsetX : 0);
  let oy = p.y - (ds ? ds.offsetY : 0);

  /* Dragging a number from a (possibly diagonal) edge clue. */
  if (isNumberEdge(ui.select) && (button === LEFT_DRAG || button === LEFT_RELEASE)) {
    const ex = ui.held % w;
    const ey = Math.trunc(ui.held / w);
    let tx = ex * tilesize;
    let ty = ey * tilesize;
    if (ex > 0 && ex < w - 1) ox = tx;
    else if (ey > 0 && ey < h - 1) oy = ty;
    else {
      if (ex > 0) tx += tilesize - 1;
      if (ey > 0) ty += tilesize - 1;
      let distance = Math.trunc((Math.abs(ox - tx) + Math.abs(oy - ty) + 1) / 2);
      if (distance >= (Math.min(w, h) - 1) * tilesize) distance = 0;
      ox = ex === 0 ? distance : tx - distance;
      oy = ey === 0 ? distance : ty - distance;
    }
  }

  let gx: number;
  let gy: number;
  if (isHexagonal(state.mode)) {
    /* Real hexagons (design F7): pick the cell whose center is nearest the
     * pointer. `(col,row)` are axial coords, so this is a small neighborhood
     * search around the fractional estimate. */
    const R = tilesize / Math.sqrt(3);
    const vp = (tilesize * Math.sqrt(3)) / 2;
    const rowEst = Math.round((oy - R) / vp);
    let bestD = Number.POSITIVE_INFINITY;
    gx = -1;
    gy = -1;
    for (let row = rowEst - 1; row <= rowEst + 1; row++) {
      const colEst = Math.round((ox - tilesize / 2 - (row * tilesize) / 2) / tilesize);
      for (let col = colEst - 1; col <= colEst + 1; col++) {
        const cx = col * tilesize + (row * tilesize) / 2 + tilesize / 2;
        const cy = R + row * vp;
        const d = (ox - cx) ** 2 + (oy - cy) ** 2;
        if (d < bestD) {
          bestD = d;
          gx = col;
          gy = row;
        }
      }
    }
  } else {
    gy = oy < 0 ? -1 : Math.trunc(oy / tilesize);
    gx = ox < 0 ? -1 : Math.trunc(ox / tilesize);
  }

  if (isMouseDown(button)) {
    hideCursor(ui.cursor);
    finishTyping = true;
  }

  /* Numpad → cursor movement, or strip the numpad modifier. */
  if (ui.moveWithNumpad) {
    if (button === (MOD_NUM_KEYPAD | 0x38)) button = CURSOR_UP; // '8'
    if (button === (MOD_NUM_KEYPAD | 0x32)) button = CURSOR_DOWN; // '2'
    if (button === (MOD_NUM_KEYPAD | 0x34)) button = CURSOR_LEFT; // '4'
    if (button === (MOD_NUM_KEYPAD | 0x36)) button = CURSOR_RIGHT; // '6'
  } else {
    button &= ~MOD_NUM_KEYPAD;
  }

  if (isHexagonal(state.mode)) {
    if (button === CURSOR_UP && ui.cursor.y > 0 && (ui.cursor.y & 1) === 0)
      button = MOD_NUM_KEYPAD | 0x39; // '9'
    else if (button === CURSOR_DOWN && ui.cursor.y < h - 1 && ui.cursor.y & 1)
      button = MOD_NUM_KEYPAD | 0x31; // '1'
    else if (button === (MOD_NUM_KEYPAD | 0x37))
      button = CURSOR_UP; // '7'
    else if (button === (MOD_NUM_KEYPAD | 0x33)) button = CURSOR_DOWN; // '3'
  }

  let dirx = 0;
  let diry = 0;
  if (button === CURSOR_UP) diry = -1;
  else if (button === CURSOR_DOWN) diry = 1;
  else if (button === CURSOR_LEFT) dirx = -1;
  else if (button === CURSOR_RIGHT) dirx = 1;
  else if (button === (MOD_NUM_KEYPAD | 0x37)) {
    dirx = -1;
    diry = -1;
  } else if (button === (MOD_NUM_KEYPAD | 0x31)) {
    dirx = -1;
    diry = 1;
  } else if (button === (MOD_NUM_KEYPAD | 0x39)) {
    dirx = 1;
    diry = -1;
  } else if (button === (MOD_NUM_KEYPAD | 0x33)) {
    dirx = 1;
    diry = 1;
  }

  if (dirx || diry) {
    revealCursor(ui, true);
    ui.cursor.x += dirx;
    ui.cursor.y += diry;
    ui.cursor.x = Math.max(0, Math.min(ui.cursor.x, w - 1));
    ui.cursor.y = Math.max(0, Math.min(ui.cursor.y, h - 1));

    if (state.mode === MODE_HEXAGON) {
      const center = Math.trunc(h / 2);
      if (ui.cursor.y < center)
        ui.cursor.x = Math.max(ui.cursor.x, center - ui.cursor.y);
      else ui.cursor.x = Math.min(ui.cursor.x, w - 1 + center - ui.cursor.y);
    }
    if (state.mode === MODE_HONEYCOMB) {
      const extra = (h | ui.cursor.y) & 1 ? 0 : 1;
      ui.cursor.x = Math.min(ui.cursor.x, w - Math.trunc(ui.cursor.y / 2) - 1);
      ui.cursor.x = Math.max(ui.cursor.x, Math.trunc((h - ui.cursor.y) / 2) - extra);
    }

    finishTyping = true;
  }

  if (isMouseDown(button) && (gx < 0 || gy < 0 || gx >= w || gy >= h)) uiClear(ui);

  /* Enter/Backspace when not typing emulates a mouse click. */
  if (isEraseKey(button) && ui.typingCell === CELL_NONE) button = CURSOR_SELECT2;
  if (isCursorSelect(button) && keyboardCursor(ui) && ui.typingCell === CELL_NONE) {
    ret = mouseClick(
      state,
      ui,
      ui.cursor.x,
      ui.cursor.y,
      button === CURSOR_SELECT ? LEFT_BUTTON : RIGHT_BUTTON,
      true,
    );
    if (!ret)
      ret = mouseClick(
        state,
        ui,
        ui.cursor.x,
        ui.cursor.y,
        button === CURSOR_SELECT ? LEFT_RELEASE : RIGHT_RELEASE,
        true,
      );
  }
  if (isCursorSelect(button)) finishTyping = true;

  /* Typing a number */
  const digit = digitOf(button);
  if (digit !== null && ui.cursor.visible) {
    const i = ui.cursor.y * w + ui.cursor.x;
    if (state.immutable[i]) return null;
    if (ui.typingCell === CELL_NONE && state.grid[i] !== NUMBER_EMPTY) return null;
    let num = ui.typingNumber;
    num *= 10;
    num += digit;
    uiClear(ui);
    ui.typingCell = i;
    if (num < 1000) ui.typingNumber = num;
    return UI_UPDATE;
  }

  /* Backspace while typing */
  if (isEraseKey(button) && ui.typingCell !== CELL_NONE) {
    ui.typingNumber = Math.trunc(ui.typingNumber / 10);
    if (ui.typingNumber === 0) ui.typingCell = CELL_NONE;
    return UI_UPDATE;
  }

  /* **This arm needs a pointer button, not merely a pointer coordinate.**
   * Keyboard events arrive at (0, 0), inside every grid, so a coordinate-only
   * gate would set `finishTyping` for every key and the tail would answer
   * `UI_UPDATE` to anything. That answer is read: the app derives its
   * bare-letter shortcuts from whether the game declined the key
   * (`src/puzzle/shortcuts.ts`), and the input guards ask by the same value.
   * Upstream can gate on coordinates alone because its midend claims
   * `n`/`u`/`r`/`q` before the game sees them; this frontend does not. */
  const pointer = isMouseDown(button) || isMouseDrag(button) || isMouseRelease(button);
  if (pointer && gx >= 0 && gx < w && gy >= 0 && gy < h) {
    if (isMouseDrag(button) && ui.held >= 0 && !isNumberEdge(ui.select)) {
      const hx = isHexagonal(state.mode)
        ? gx * tilesize + (gy * tilesize) / 2 + tilesize / 2
        : gx * tilesize + Math.trunc(tilesize / 2);
      const hy = isHexagonal(state.mode)
        ? tilesize / Math.sqrt(3) + gy * ((tilesize * Math.sqrt(3)) / 2)
        : gy * tilesize + Math.trunc(tilesize / 2);
      /* Octagon-shaped hitbox so a near-miss doesn't force a straight line. */
      if (Math.abs(ox - hx) + Math.abs(oy - hy) > DRAG_RADIUS * tilesize) return null;
    }
    ret = mouseClick(state, ui, gx, gy, button, false);
    finishTyping = true;
  }

  /* Confirm a typed number. */
  if (finishTyping && !ret && ui.typingCell !== CELL_NONE) {
    const num = ui.typingNumber - 1;
    const i = ui.typingCell;
    ui.typingCell = CELL_NONE;
    ui.typingNumber = 0;

    if (mouseCursor(ui) && ui.cursor.y * w + ui.cursor.x === i) {
      ui.held = i;
      ui.dir =
        num < state.last && ui.positions[num + 1] === CELL_NONE
          ? +1
          : num > 0 && ui.positions[num - 1] === CELL_NONE
            ? -1
            : +1;
      ui.select = num + ui.dir;
      uiSeek(ui, state);
    }

    if (state.grid[i] === num || num > state.last) return UI_UPDATE;
    ret = { kind: "place", cell: i, n: num };
  }

  if (finishTyping && !ret) return UI_UPDATE;
  return ret;
}

// --- encode / decode ui (positions + hints survive a save) ---------

function encodeUiItem(arr: Int32Array, s: number): string {
  let out = "";
  let run = 0;
  for (let i = 0; i < s; i++) {
    if (arr[i] !== -1) {
      if (i !== 0) out += run ? String.fromCharCode("a".charCodeAt(0) + run - 1) : "_";
      out += arr[i] === -2 ? "-" : String(arr[i]);
      run = 0;
    } else {
      if (run === 26) {
        out += String.fromCharCode("a".charCodeAt(0) - 1 + run);
        run = 0;
      }
      run++;
    }
  }
  if (run) out += String.fromCharCode("a".charCodeAt(0) + run - 1);
  return out;
}

export function encodeAscentUi(ui: AscentUi): string {
  const s = ui.s;
  return `P${encodeUiItem(ui.positions, s)}H${encodeUiItem(ui.prevhints, s)}N${encodeUiItem(
    ui.nexthints,
    s,
  )}`;
}

const isDigitCh = (c: string) => c >= "0" && c <= "9";

function decodeUiItem(
  arr: Int32Array,
  s: number,
  stop: string,
  enc: string,
  p: number,
): number {
  let i = 0;
  while (p < enc.length && enc[p] !== stop && i < s) {
    const c = enc[p];
    if (isDigitCh(c)) {
      let numStr = "";
      while (p < enc.length && isDigitCh(enc[p])) numStr += enc[p++];
      arr[i] = Number.parseInt(numStr, 10);
      if (arr[i] >= s) arr[i] = -2;
      ++i;
    } else if (c === "-") {
      arr[i] = -2;
      ++i;
      ++p;
    } else if (c >= "a" && c <= "z") {
      i += c.charCodeAt(0) - "a".charCodeAt(0) + 1;
      ++p;
    } else {
      ++p;
    }
  }
  return p;
}

export function decodeAscentUi(ui: AscentUi, encoding: string): void {
  if (!encoding || encoding[0] !== "P") return;
  const s = ui.s;
  ui.positions.fill(CELL_NONE, 0, s);
  ui.prevhints.fill(NUMBER_EMPTY, 0, s);
  ui.nexthints.fill(NUMBER_EMPTY, 0, s);
  let p = decodeUiItem(ui.positions, s, "H", encoding, 1);
  p = decodeUiItem(ui.prevhints, s, "N", encoding, p);
  decodeUiItem(ui.nexthints, s, "\0", encoding, p);
}
