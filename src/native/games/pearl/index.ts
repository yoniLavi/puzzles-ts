/**
 * Pearl (Masyu) — native TS port of `pearl.c`. Draw one closed loop through
 * grid cells that turns a right angle at every black pearl (going straight on
 * at least one cell each side) and passes straight through every white pearl
 * (turning immediately before or after).
 *
 * Left-drag traces a loop path along grid edges (committed as line flips);
 * a left-click near an edge toggles that segment; a right-click / right-drag
 * marks "no-line" crosses; a keyboard cursor draws lines (Ctrl) or marks
 * (Shift). `H` autosolves in place. This is the first consumer of the shared
 * `engine/grid.ts` + `engine/loopgen.ts` leaves (square tiling only).
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import type { Game, GamePref, SolveResult, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MIDDLE_BUTTON,
  MIDDLE_RELEASE,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { newDesc } from "./generator.ts";
import { executeMove, interpretUiDrag, updateUiDrag } from "./moves.ts";
import {
  centeredCoord,
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  GUI_MASYU,
  metrics,
  newDrawState,
  type PearlDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
} from "./render.ts";
import { pearlSolve } from "./solver.ts";
import {
  D,
  DIFF_COUNT,
  DIFF_NAMES,
  DX,
  DY,
  decodeParams,
  defaultParams,
  encodeParams,
  F,
  inGrid,
  L,
  newState,
  type PearlMove,
  type PearlOp,
  type PearlParams,
  type PearlState,
  type PearlUi,
  presets,
  R,
  status,
  textFormat,
  U,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A wrong loop segment surfaced by `findMistakes` (a player line the unique
 * solution does not contain). */
export interface PearlMistake {
  x: number;
  y: number;
  dir: number;
}

function newUi(state: PearlState): PearlUi {
  return {
    dragcoords: new Array<number>(state.w * state.h).fill(0),
    ndragcoords: -1,
    clickx: 0,
    clicky: 0,
    curx: 0,
    cury: 0,
    cursorActive: false,
    guiStyle: GUI_MASYU,
  };
}

const KEY_DIRECTION = (button: number): number => {
  const d = cursorDelta(button);
  if (!d) return R;
  return d.dy > 0 ? D : d.dy < 0 ? U : d.dx < 0 ? L : R;
};

/** Lay a line ('F', primary) or a no-line mark ('M', secondary) in the given
 * direction from `(x, y)`, refusing to lay one over the other (upstream
 * `mark_in_direction`). Returns the move, or `UI_UPDATE` when blocked. */
function markInDirection(
  state: PearlState,
  x: number,
  y: number,
  dir: number,
  primary: boolean,
): PearlMove | UiUpdate {
  const w = state.w;
  const x2 = x + DX(dir);
  const y2 = y + DY(dir);
  const dir2 = F(dir);
  if (!inGrid(state, x, y) || !inGrid(state, x2, y2)) return UI_UPDATE;
  // Disallow laying a mark over a line, or a line over a mark.
  const other = primary ? state.marks : state.lines;
  if (other[y * w + x] & dir || other[y2 * w + x2] & dir2) return UI_UPDATE;
  const kind = primary ? "flip" : "mark";
  return {
    ops: [
      { kind, l: dir, x, y },
      { kind, l: dir2, x: x2, y: y2 },
    ],
  };
}

function interpretMove(
  state: PearlState,
  ui: PearlUi,
  ds: PearlDrawState | null,
  p: Point,
  rawButton: number,
): PearlMove | null | UiUpdate {
  const w = state.w;
  const h = state.h;
  const m = metrics(ds?.tileSize ?? PREFERRED_TILE_SIZE);
  let x = p.x;
  let y = p.y;
  let gx = fromCoord(x, m);
  let gy = fromCoord(y, m);

  const shift = rawButton & MOD_SHFT;
  const control = rawButton & MOD_CTRL;
  const button = stripModifiers(rawButton);

  const isMouseDown =
    button === LEFT_BUTTON || button === MIDDLE_BUTTON || button === RIGHT_BUTTON;
  const isMouseRelease =
    button === LEFT_RELEASE || button === MIDDLE_RELEASE || button === RIGHT_RELEASE;

  if (isMouseDown) {
    ui.cursorActive = false;
    if (!inGrid(state, gx, gy)) {
      ui.ndragcoords = -1;
      return UI_UPDATE;
    }
    ui.clickx = x;
    ui.clicky = y;
    ui.dragcoords[0] = gy * w + gx;
    ui.ndragcoords = 0; // will be 1 once the drag is confirmed
    return UI_UPDATE;
  }

  if (button === LEFT_DRAG && ui.ndragcoords >= 0) {
    updateUiDrag(state, ui, gx, gy);
    return UI_UPDATE;
  }

  let release = false;
  if (isMouseRelease) release = true;

  if (isCursorMove(button)) {
    if (!ui.cursorActive) {
      ui.cursorActive = true;
    } else if (control || shift) {
      if (ui.ndragcoords > 0) return null;
      ui.ndragcoords = -1;
      const move = markInDirection(
        state,
        ui.curx,
        ui.cury,
        KEY_DIRECTION(button),
        control !== 0,
      );
      if (control && !shift && move !== UI_UPDATE) {
        const d = cursorDelta(button);
        if (d) {
          ui.curx = Math.max(0, Math.min(w - 1, ui.curx + d.dx));
          ui.cury = Math.max(0, Math.min(h - 1, ui.cury + d.dy));
        }
      }
      return move;
    } else {
      const d = cursorDelta(button);
      if (d) {
        ui.curx = Math.max(0, Math.min(w - 1, ui.curx + d.dx));
        ui.cury = Math.max(0, Math.min(h - 1, ui.cury + d.dy));
      }
      if (ui.ndragcoords >= 0) updateUiDrag(state, ui, ui.curx, ui.cury);
    }
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!ui.cursorActive) {
      ui.cursorActive = true;
      return UI_UPDATE;
    }
    if (button === CURSOR_SELECT) {
      if (ui.ndragcoords === -1) {
        ui.ndragcoords = 0;
        ui.dragcoords[0] = ui.cury * w + ui.curx;
        ui.clickx = centeredCoord(ui.curx, m);
        ui.clicky = centeredCoord(ui.cury, m);
        return UI_UPDATE;
      }
      release = true;
    } else {
      // CURSOR_SELECT2
      if (ui.ndragcoords >= 0) {
        ui.ndragcoords = -1;
        return UI_UPDATE;
      }
      return null;
    }
  }

  if (button === 27 || button === 8) {
    // Escape / backspace: cancel a drag.
    if (ui.ndragcoords >= 0) {
      ui.ndragcoords = -1;
      return UI_UPDATE;
    }
    return null;
  }

  if (release) {
    if (ui.ndragcoords > 0) {
      // End of a drag: emit a line flip for every leg that changed.
      const ops: PearlOp[] = [];
      const clearing = { v: true };
      for (let i = 0; i < ui.ndragcoords - 1; i++) {
        const leg = interpretUiDrag(state, ui.dragcoords, clearing, i);
        if (leg.oldstate !== leg.newstate) {
          ops.push({ kind: "flip", l: leg.dir, x: leg.sx, y: leg.sy });
          ops.push({ kind: "flip", l: F(leg.dir), x: leg.dx, y: leg.dy });
        }
      }
      ui.ndragcoords = -1;
      return ops.length > 0 ? { ops } : UI_UPDATE;
    }
    if (ui.ndragcoords === 0) {
      // Click (or tiny drag): find the closest edge (based on the click-down
      // location, which is more controllable than the release).
      ui.ndragcoords = -1;
      x = ui.clickx;
      y = ui.clicky;
      gx = fromCoord(x, m);
      gy = fromCoord(y, m);
      const cx = centeredCoord(gx, m);
      const cy = centeredCoord(gy, m);
      if (!inGrid(state, gx, gy)) return UI_UPDATE;
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) < m.tile / 4) {
        // Near the centre: a cell click, which does nothing (upstream TODO).
        return UI_UPDATE;
      }
      const direction =
        Math.abs(x - cx) < Math.abs(y - cy) ? (y < cy ? U : D) : x < cx ? L : R;
      return markInDirection(state, gx, gy, direction, button === LEFT_RELEASE);
    }
  }

  if (button === 72 || button === 104) return { ops: [{ kind: "hint" }] }; // 'H' / 'h'

  return null;
}

function flashLength(
  oldState: PearlState,
  newState: PearlState,
  _dir: number,
  _ui: PearlUi,
): number {
  return !oldState.completed &&
    newState.completed &&
    !oldState.usedSolve &&
    !newState.usedSolve
    ? FLASH_TIME
    : 0;
}

function solve(
  orig: PearlState,
  curr: PearlState,
  aux?: string,
): SolveResult<PearlMove> {
  const w = curr.w;
  const h = curr.h;
  const sz = w * h;
  const solvedLines = orig.lines.slice();

  if (aux) {
    for (let i = 0; i < sz; i++) {
      const ch = aux.charCodeAt(i);
      if (ch >= 48 && ch <= 57) solvedLines[i] = ch - 48;
      else if (ch >= 65 && ch <= 70) solvedLines[i] = ch - 65 + 10;
      else return { ok: false, error: "invalid char in aux" };
    }
  } else {
    let ret = pearlSolve(w, h, curr.clues, solvedLines, DIFF_COUNT, false);
    if (ret < 1) {
      solvedLines.set(orig.lines);
      ret = pearlSolve(orig.w, orig.h, orig.clues, solvedLines, DIFF_COUNT, false);
    }
    if (ret < 1) return { ok: false, error: "Unable to find a solution" };
  }

  const ops: PearlOp[] = [{ kind: "solve" }];
  for (let i = 0; i < sz; i++)
    if (curr.lines[i] !== solvedLines[i])
      ops.push({ kind: "replace", l: solvedLines[i], x: i % w, y: (i / w) | 0 });
  return { ok: true, move: { ops } };
}

/** Boards are uniquely solvable by default: re-solve from the clues and flag
 * every player line segment the unique solution does not contain (a definite
 * mistake). A non-uniquely-solvable board yields no mistakes. */
function findMistakes(state: PearlState): readonly PearlMistake[] {
  const { w, h } = state;
  const sol = new Uint8Array(w * h);
  if (pearlSolve(w, h, state.clues, sol, DIFF_COUNT, false) !== 1) return [];
  const out: PearlMistake[] = [];
  for (let i = 0; i < w * h; i++) {
    const extra = state.lines[i] & ~sol[i] & (R | U | L | D);
    if (extra)
      for (let d = 1; d <= 8; d += d)
        if (extra & d) out.push({ x: i % w, y: (i / w) | 0, dir: d });
  }
  return out;
}

const prefs: GamePref<PearlUi>[] = [
  {
    kw: "appearance",
    name: "Puzzle appearance",
    type: "choices",
    choices: ["Traditional", "Loopy-style"],
    get: (ui) => ui.guiStyle,
    set: (ui, v) => {
      ui.guiStyle = v;
    },
  },
];

export const pearlGame: Game<
  PearlParams,
  PearlState,
  PearlMove,
  PearlUi,
  PearlDrawState,
  PearlMistake
> = {
  id: "pearl",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    ...dimensionParamConfig<PearlParams>(),
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: [...DIFF_NAMES],
      get: (p) => p.difficulty,
      set: (p, v) => {
        p.difficulty = v;
      },
    },
    {
      kw: "allow-unsoluble",
      name: "Allow unsoluble",
      type: "boolean",
      get: (p) => p.nosolve,
      set: (p, v) => {
        p.nosolve = v;
      },
    },
  ],
  describeParams: (p) => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: p.difficulty,
    "allow-unsoluble": p.nosolve ? 1 : 0,
  }),

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,

  textFormat,

  prefs,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: PearlParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tileSize = ts;
  },
  newDrawState,
  redraw,

  flashLength,
};

registerGame(pearlGame);
