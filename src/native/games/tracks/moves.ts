/**
 * Tracks move application, the flip predicates, and the drag/diff helpers.
 * Kept out of `index.ts` so both `index.ts` (interpretMove) and `render.ts`
 * (which reflects an in-progress drag) can import them without a cycle
 * (playbook §3.2).
 */
import {
  type Board,
  checkCompletion,
  DX,
  DY,
  E_NOTRACK,
  E_TRACK,
  inGrid,
  S_CLUE,
  S_NOTRACK,
  S_TRACK,
  sEClear,
  sECount,
  sEDirs,
  sEFlags,
  sESet,
  stateToBoard,
  type TracksMove,
  type TracksOp,
  type TracksState,
  type TracksUi,
} from "./state.ts";

/** Whether a square's track/no-track can be flipped (upstream
 * `ui_can_flip_square`). */
export function uiCanFlipSquare(
  b: Board,
  x: number,
  y: number,
  notrack: boolean,
): boolean {
  if (!inGrid(b, x, y)) return false;
  const sf = b.sflags[y * b.w + x];
  const trackc = sECount(b, x, y, E_TRACK);
  if (sf & S_CLUE) return false;
  if (notrack) {
    if (!(sf & S_NOTRACK) && (sf & S_TRACK || trackc > 0)) return false;
  } else {
    if (!(sf & S_TRACK) && sf & S_NOTRACK) return false;
  }
  return true;
}

/** Whether an edge's track/no-track can be flipped (upstream
 * `ui_can_flip_edge`). */
export function uiCanFlipEdge(
  b: Board,
  x: number,
  y: number,
  dir: number,
  notrack: boolean,
): boolean {
  const x2 = x + DX(dir);
  const y2 = y + DY(dir);
  if (!inGrid(b, x, y) || !inGrid(b, x2, y2)) return false;
  const sf1 = b.sflags[y * b.w + x];
  const sf2 = b.sflags[y2 * b.w + x2];
  if (!notrack && (sf1 & S_CLUE || sf2 & S_CLUE)) return false;
  const ef = sEFlags(b, x, y, dir);
  if (notrack) {
    if (!(ef & E_NOTRACK) && ef & E_TRACK) return false;
  } else {
    if (!(ef & E_TRACK)) {
      if (sf1 & S_NOTRACK || sf2 & S_NOTRACK || ef & E_NOTRACK) return false;
      if (sECount(b, x, y, E_TRACK) >= 2 || sECount(b, x2, y2, E_TRACK) >= 2)
        return false;
    }
  }
  return true;
}

/** A copy of the board with the drag rectangle's squares toggled (upstream
 * `copy_and_apply_drag`). The drag is always a single row or column. */
export function copyAndApplyDrag(b: Board, ui: TracksUi): Board {
  const { w } = b;
  const after: Board = { ...b, sflags: Int32Array.from(b.sflags) };
  const f = ui.notrack ? S_NOTRACK : S_TRACK;
  const x1 = Math.min(ui.dragSx, ui.dragEx);
  const x2 = Math.max(ui.dragSx, ui.dragEx);
  const y1 = Math.min(ui.dragSy, ui.dragEy);
  const y2 = Math.max(ui.dragSy, ui.dragEy);
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      const ff = b.sflags[y * w + x];
      if (ui.clearing && !(ff & f)) continue;
      if (!ui.clearing && ff & f) continue;
      if (uiCanFlipSquare(b, x, y, ui.notrack)) after.sflags[y * w + x] ^= f;
    }
  }
  return after;
}

/** The op list turning `before` into `after` (upstream `move_string_diff`). */
export function moveDiff(before: Board, after: Board, solve: boolean): TracksMove {
  const { w, h } = before;
  const ops: TracksOp[] = [];
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    const otf = sEDirs(before, x, y, E_TRACK);
    const ntf = sEDirs(after, x, y, E_TRACK);
    const onf = sEDirs(before, x, y, E_NOTRACK);
    const nnf = sEDirs(after, x, y, E_NOTRACK);
    for (let j = 0; j < 4; j++) {
      const df = 1 << j;
      if ((otf & df) !== (ntf & df)) {
        ops.push({ kind: "edge", x, y, dir: df, track: true, set: (ntf & df) !== 0 });
      }
      if ((onf & df) !== (nnf & df)) {
        ops.push({ kind: "edge", x, y, dir: df, track: false, set: (nnf & df) !== 0 });
      }
    }
    if ((before.sflags[i] & S_NOTRACK) !== (after.sflags[i] & S_NOTRACK)) {
      ops.push({
        kind: "square",
        x,
        y,
        track: false,
        set: (after.sflags[i] & S_NOTRACK) !== 0,
      });
    }
    if ((before.sflags[i] & S_TRACK) !== (after.sflags[i] & S_TRACK)) {
      ops.push({
        kind: "square",
        x,
        y,
        track: true,
        set: (after.sflags[i] & S_TRACK) !== 0,
      });
    }
  }
  return { ops, solve };
}

/** Apply a move (upstream `execute_move`): each op is guarded by the flip
 * predicate unless the move is a solve; then live errors + completion are
 * recomputed. Throws on an illegal (non-solve) op, faithful to `badmove`. */
export function executeMove(state: TracksState, move: TracksMove): TracksState {
  const b = stateToBoard(state);
  const isSolve = move.solve === true;
  for (const op of move.ops) {
    const notrack = !op.track;
    if (op.kind === "square") {
      if (!isSolve && !uiCanFlipSquare(b, op.x, op.y, notrack)) {
        throw new Error("Illegal tracks move");
      }
      const f = op.track ? S_TRACK : S_NOTRACK;
      if (op.set) b.sflags[op.y * b.w + op.x] |= f;
      else b.sflags[op.y * b.w + op.x] &= ~f;
    } else {
      const dir = op.dir ?? 0;
      if (!isSolve && !uiCanFlipEdge(b, op.x, op.y, dir, notrack)) {
        throw new Error("Illegal tracks move");
      }
      const f = op.track ? E_TRACK : E_NOTRACK;
      if (op.set) sESet(b, op.x, op.y, dir, f);
      else sEClear(b, op.x, op.y, dir, f);
    }
  }
  const completed = checkCompletion(b, true);
  return {
    ...state,
    sflags: b.sflags,
    numErrors: b.numErrors,
    completed,
    usedSolve: state.usedSolve || isSolve,
  };
}
