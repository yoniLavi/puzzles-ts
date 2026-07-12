/**
 * Bridges (Hashiwokakero) — native TS port of `puzzles/bridges.c`.
 *
 * Connect the numbered islands with horizontal/vertical bridges so every island
 * carries its number of bridge-ends, at most `maxb` join any pair, bridges never
 * cross, and all islands form one connected group.
 */
import type { Colour, GameStatus, Point, Size } from "../../../puzzle/types.ts";
import {
  type Game,
  type GamePref,
  type HintStep,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newBridgesDesc } from "./generator.ts";
import {
  type BridgesDrawState,
  border,
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redrawBridges,
  setTileSize,
  toCoord,
} from "./render.ts";
import { runMapCheck, solveFromScratch } from "./solver.ts";
import {
  BRIDGES_PRESETS,
  type BridgesMistake,
  type BridgesMove,
  type BridgesOp,
  type BridgesParams,
  type BridgesState,
  type BridgesUi,
  DIFFICULTY_NAMES,
  decodeParams,
  defaultParams,
  encodeParams,
  G_ISLAND,
  G_LINEH,
  G_LINEV,
  G_MARK,
  G_MARKH,
  G_MARKV,
  G_NOLINEH,
  G_NOLINEV,
  newStateFromDesc,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(state: BridgesState): BridgesUi {
  const first = state.islands[0];
  return {
    dragxSrc: -1,
    dragySrc: -1,
    dragxDst: -1,
    dragyDst: -1,
    todraw: 0,
    dragging: false,
    dragIsNoline: false,
    nlines: 0,
    curX: first ? first.x : 0,
    curY: first ? first.y : 0,
    curVisible: false,
    showHints: false,
  };
}

const prefs: GamePref<BridgesUi>[] = [
  {
    kw: "show-hints",
    name: "Show possible bridge locations",
    type: "boolean",
    get: (ui) => ui.showHints,
    set: (ui, v) => {
      ui.showHints = v;
    },
  },
];

// --- Drag model (bridges.c ui_cancel_drag / update_drag_dst / finish_drag) ---

function uiCancelDrag(ui: BridgesUi): UiUpdate {
  ui.dragxSrc = -1;
  ui.dragySrc = -1;
  ui.dragxDst = -1;
  ui.dragyDst = -1;
  ui.dragging = false;
  return UI_UPDATE;
}

/** Work out which orthogonal island the drag from (dragxSrc,dragySrc) toward
 * pixel (nx,ny) targets, and how many bridges the release would set. Mutates
 * `ui` in place; always a UI-only update. */
function updateDragDst(
  s: BridgesState,
  ui: BridgesUi,
  ts: number,
  b: number,
  nx: number,
  ny: number,
): UiUpdate | null {
  if (ui.dragxSrc === -1 || ui.dragySrc === -1) return null;
  ui.dragxDst = -1;
  ui.dragyDst = -1;

  const half = Math.trunc(ts / 2);
  const ox = toCoord(ui.dragxSrc, ts, b) + half;
  const oy = toCoord(ui.dragySrc, ts, b) + half;

  let dx: number;
  let dy: number;
  let gtype: number;
  let ntype: number;
  let mtype: number;
  let maxb: number;
  if (Math.abs(nx - ox) < Math.abs(ny - oy)) {
    dx = 0;
    dy = ny - oy < 0 ? -1 : 1;
    if (!s.inGrid(ui.dragxSrc + dx, ui.dragySrc + dy)) return UI_UPDATE;
    gtype = G_LINEV;
    ntype = G_NOLINEV;
    mtype = G_MARKV;
    maxb = s.maxv[s.idx(ui.dragxSrc + dx, ui.dragySrc + dy)];
  } else {
    dy = 0;
    dx = nx - ox < 0 ? -1 : 1;
    if (!s.inGrid(ui.dragxSrc + dx, ui.dragySrc + dy)) return UI_UPDATE;
    gtype = G_LINEH;
    ntype = G_NOLINEH;
    mtype = G_MARKH;
    maxb = s.maxh[s.idx(ui.dragxSrc + dx, ui.dragySrc + dy)];
  }

  if (ui.dragIsNoline) {
    ui.todraw = ntype;
  } else {
    const nc = s.idx(ui.dragxSrc + dx, ui.dragySrc + dy);
    const curr = s.grid[nc];
    const currl = s.lines[nc];
    if (curr & gtype) {
      if (currl === maxb) {
        ui.todraw = 0;
        ui.nlines = 0;
      } else {
        ui.todraw = gtype;
        ui.nlines = currl + 1;
      }
    } else {
      ui.todraw = gtype;
      ui.nlines = 1;
    }
  }

  const is = s.islandAt(ui.dragxSrc, ui.dragySrc);
  if (!is) return UI_UPDATE;
  const nb = s.idx(is.x + dx, is.y + dy);
  const currNb = s.grid[nb];
  for (const pt of is.points) {
    if (pt.off === 0) continue;
    if (currNb & mtype) continue; // don't change marked lines
    if (ui.dragIsNoline) {
      if (currNb & gtype) continue; // no no-line where a line already is
    } else {
      if (s.possibles(dx, is.x + dx, is.y + dy) === 0) continue; // not possible
      if (currNb & ntype) continue; // no bridge over a no-line
    }
    if (pt.dx === dx && pt.dy === dy) {
      ui.dragxDst = is.x + pt.off * pt.dx;
      ui.dragyDst = is.y + pt.off * pt.dy;
    }
  }
  return UI_UPDATE;
}

function finishDrag(ui: BridgesUi): BridgesMove | UiUpdate | null {
  if (ui.dragxSrc === -1 || ui.dragySrc === -1) return null;
  if (ui.dragxDst === -1 || ui.dragyDst === -1) return uiCancelDrag(ui);
  const op: BridgesOp = ui.dragIsNoline
    ? { op: "N", x1: ui.dragxSrc, y1: ui.dragySrc, x2: ui.dragxDst, y2: ui.dragyDst }
    : {
        op: "L",
        x1: ui.dragxSrc,
        y1: ui.dragySrc,
        x2: ui.dragxDst,
        y2: ui.dragyDst,
        n: ui.nlines,
      };
  uiCancelDrag(ui);
  return { ops: [op] };
}

function interpretMove(
  s: BridgesState,
  ui: BridgesUi,
  ds: BridgesDrawState | null,
  p: Point,
  button: number,
): BridgesMove | null | UiUpdate {
  const ts = ds?.tileSize ?? PREFERRED_TILE_SIZE;
  const b = border(ts);
  const gx = fromCoord(p.x, ts, b);
  const gy = fromCoord(p.y, ts, b);
  const ggrid = s.inGrid(gx, gy) ? s.gridAt(gx, gy) : 0;
  const shift = (button & MOD_SHFT) !== 0;
  const control = (button & MOD_CTRL) !== 0;
  const btn = stripModifiers(button);

  if (btn === LEFT_BUTTON || btn === RIGHT_BUTTON) {
    if (!s.inGrid(gx, gy)) return null;
    ui.curVisible = false;
    if (ggrid & G_ISLAND) {
      ui.dragxSrc = gx;
      ui.dragySrc = gy;
      return UI_UPDATE;
    }
    return uiCancelDrag(ui);
  }

  if (btn === LEFT_DRAG || btn === RIGHT_DRAG) {
    if (
      s.inGrid(ui.dragxSrc, ui.dragySrc) &&
      (gx !== ui.dragxSrc || gy !== ui.dragySrc) &&
      !(s.gridAt(ui.dragxSrc, ui.dragySrc) & G_MARK)
    ) {
      ui.dragging = true;
      ui.dragIsNoline = btn === RIGHT_DRAG;
      return updateDragDst(s, ui, ts, b, p.x, p.y);
    }
    ui.dragxDst = -1;
    ui.dragyDst = -1;
    return UI_UPDATE;
  }

  if (btn === LEFT_RELEASE || btn === RIGHT_RELEASE) {
    if (ui.dragging) return finishDrag(ui);
    if (
      !s.inGrid(ui.dragxSrc, ui.dragySrc) ||
      gx !== ui.dragxSrc ||
      gy !== ui.dragySrc
    ) {
      return uiCancelDrag(ui);
    }
    uiCancelDrag(ui);
    if (!s.inGrid(gx, gy)) return null;
    if (!(s.gridAt(gx, gy) & G_ISLAND)) return null;
    return { ops: [{ op: "M", x: gx, y: gy }] };
  }

  if (isCursorMove(btn)) {
    ui.curVisible = true;
    if (control || shift) {
      ui.dragxSrc = ui.curX;
      ui.dragySrc = ui.curY;
      ui.dragging = true;
      ui.dragIsNoline = !control;
    }
    if (ui.dragging) {
      const moved = gridCursorMove(btn, ui.curX, ui.curY, s.w, s.h, false);
      if (!moved) return null;
      const half = Math.trunc(ts / 2);
      updateDragDst(
        s,
        ui,
        ts,
        b,
        toCoord(moved.x, ts, b) + half,
        toCoord(moved.y, ts, b) + half,
      );
      return finishDrag(ui);
    }
    // Not dragging: cone-search for the next island in the pressed direction.
    const dx = btn === CURSOR_RIGHT ? 1 : btn === CURSOR_LEFT ? -1 : 0;
    const dy = btn === CURSOR_DOWN ? 1 : btn === CURSOR_UP ? -1 : 0;
    const dorthx = 1 - Math.abs(dx);
    const dorthy = 1 - Math.abs(dy);
    // orthorder tweak so LEFT after a stray upward RIGHT tends back downward.
    const orthorder = btn === CURSOR_LEFT || btn === CURSOR_UP ? 1 : -1;
    for (let orth = 0; ; orth++) {
      let oingrid = false;
      for (let dir = 1; ; dir++) {
        let dingrid = false;
        if (orth > dir) continue; // search in an outward cone only
        let nx = ui.curX + dir * dx + orth * dorthx * orthorder;
        let ny = ui.curY + dir * dy + orth * dorthy * orthorder;
        if (s.inGrid(nx, ny)) {
          dingrid = true;
          oingrid = true;
          if (s.gridAt(nx, ny) & G_ISLAND) {
            ui.curX = nx;
            ui.curY = ny;
            return UI_UPDATE;
          }
        }
        nx = ui.curX + dir * dx - orth * dorthx * orthorder;
        ny = ui.curY + dir * dy - orth * dorthy * orthorder;
        if (s.inGrid(nx, ny)) {
          dingrid = true;
          oingrid = true;
          if (s.gridAt(nx, ny) & G_ISLAND) {
            ui.curX = nx;
            ui.curY = ny;
            return UI_UPDATE;
          }
        }
        if (!dingrid) break;
      }
      if (!oingrid) return UI_UPDATE;
    }
  }

  if (btn === CURSOR_SELECT || btn === CURSOR_SELECT2) {
    if (!ui.curVisible) {
      ui.curVisible = true;
      return UI_UPDATE;
    }
    if (ui.dragging || btn === CURSOR_SELECT2) {
      // ui_cancel_drag clears dragxDst, so C always toggles the island mark.
      uiCancelDrag(ui);
      return { ops: [{ op: "M", x: ui.curX, y: ui.curY }] };
    }
    const v = s.gridAt(ui.curX, ui.curY);
    if (v & G_ISLAND) {
      ui.dragging = true;
      ui.dragxSrc = ui.curX;
      ui.dragySrc = ui.curY;
      ui.dragxDst = -1;
      ui.dragyDst = -1;
      // Reached only on a plain CURSOR_SELECT (SELECT2 returned above), so this
      // is always a bridge drag, never a no-line drag.
      ui.dragIsNoline = false;
      return UI_UPDATE;
    }
    return null;
  }

  // Digit / hex letter: jump the cursor to the nearest island with that clue.
  if (
    (btn >= 0x30 && btn <= 0x39) ||
    (btn >= 0x61 && btn <= 0x66) ||
    (btn >= 0x41 && btn <= 0x46)
  ) {
    let number: number;
    if (btn >= 0x30 && btn <= 0x39) number = btn === 0x30 ? 16 : btn - 0x30;
    else if (btn >= 0x61 && btn <= 0x66) number = 10 + btn - 0x61;
    else number = 10 + btn - 0x41;

    if (!ui.curVisible) {
      ui.curVisible = true;
      return UI_UPDATE;
    }
    let bestX = -1;
    let bestY = -1;
    let bestSq = -1;
    for (const is of s.islands) {
      if (is.count !== number) continue;
      if (is.x === ui.curX && is.y === ui.curY) continue;
      const ddx = is.x - ui.curX;
      const ddy = is.y - ui.curY;
      const sq = ddx * ddx + ddy * ddy;
      if (bestSq === -1 || sq < bestSq) {
        bestX = is.x;
        bestY = is.y;
        bestSq = sq;
      }
    }
    if (bestX !== -1) {
      ui.curX = bestX;
      ui.curY = bestY;
      return UI_UPDATE;
    }
    return null;
  }

  // 'g'/'G' toggles the possible-bridge hint overlay.
  if (btn === 0x67 || btn === 0x47) {
    ui.showHints = !ui.showHints;
    return UI_UPDATE;
  }

  return null;
}

// --- executeMove (bridges.c execute_move) ---

function executeMove(s: BridgesState, m: BridgesMove): BridgesState {
  const ret = s.clone();
  for (const op of m.ops) {
    if (op.op === "S") {
      ret.solved = true;
    } else if (op.op === "L") {
      if (!ret.inGrid(op.x1, op.y1) || !ret.inGrid(op.x2, op.y2))
        throw new Error("bridges executeMove: L endpoint off-grid");
      if ((op.x1 !== op.x2 ? 1 : 0) + (op.y1 !== op.y2 ? 1 : 0) !== 1)
        throw new Error("bridges executeMove: L not orthogonal");
      const is1 = ret.islandAt(op.x1, op.y1);
      const is2 = ret.islandAt(op.x2, op.y2);
      if (!is1 || !is2)
        throw new Error("bridges executeMove: L endpoint not an island");
      if (op.n < 0 || op.n > ret.maxb)
        throw new Error("bridges executeMove: L count out of range");
      ret.islandJoin(is1, is2, op.n, false);
    } else if (op.op === "N") {
      if (!ret.inGrid(op.x1, op.y1) || !ret.inGrid(op.x2, op.y2))
        throw new Error("bridges executeMove: N endpoint off-grid");
      if ((op.x1 !== op.x2 ? 1 : 0) + (op.y1 !== op.y2 ? 1 : 0) !== 1)
        throw new Error("bridges executeMove: N not orthogonal");
      const is1 = ret.islandAt(op.x1, op.y1);
      const is2 = ret.islandAt(op.x2, op.y2);
      if (!is1 || !is2)
        throw new Error("bridges executeMove: N endpoint not an island");
      ret.islandJoin(is1, is2, -1, false);
    } else {
      // op.op === "M"
      if (!ret.inGrid(op.x, op.y)) throw new Error("bridges executeMove: M off-grid");
      const is1 = ret.islandAt(op.x, op.y);
      if (!is1) throw new Error("bridges executeMove: M not an island");
      ret.islandTogglemark(is1);
    }
  }
  ret.mapUpdatePossibles();
  if (runMapCheck(ret)) ret.completed = true;
  return ret;
}

// --- solve (bridges.c game_state_diff over a from-scratch solution) ---

function stateDiff(src: BridgesState, dest: BridgesState): BridgesOp[] {
  const ops: BridgesOp[] = [{ op: "S" }];
  for (let i = 0; i < src.islands.length; i++) {
    const isS = src.islands[i];
    const isD = dest.islands[i];
    for (let d = 0; d < isS.points.length; d++) {
      const pt = isS.points[d];
      if (pt.dx === -1 || pt.dy === -1) continue; // right/down only
      const x = pt.x;
      const y = pt.y;
      const gline = pt.dx ? G_LINEH : G_LINEV;
      const nline = pt.dx ? G_NOLINEH : G_NOLINEV;
      const orth = dest.islandAt(dest.islandOrthX(isD, d), dest.islandOrthY(isD, d));
      if (src.gridCount(x, y, gline) !== dest.gridCount(x, y, gline)) {
        if (orth)
          ops.push({
            op: "L",
            x1: isS.x,
            y1: isS.y,
            x2: orth.x,
            y2: orth.y,
            n: dest.gridCount(x, y, gline),
          });
      }
      if ((src.gridAt(x, y) & nline) !== (dest.gridAt(x, y) & nline)) {
        if (orth) ops.push({ op: "N", x1: isS.x, y1: isS.y, x2: orth.x, y2: orth.y });
      }
    }
    if ((src.gridAt(isS.x, isS.y) & G_MARK) !== (dest.gridAt(isD.x, isD.y) & G_MARK)) {
      ops.push({ op: "M", x: isS.x, y: isS.y });
    }
  }
  return ops;
}

function solve(orig: BridgesState, curr: BridgesState): SolveResult<BridgesMove> {
  const solved = orig.workingCopy();
  if (solveFromScratch(solved, 10) === 0) {
    return { ok: false, error: "Puzzle is not solvable by the deductive solver." };
  }
  return { ok: true, move: { ops: stateDiff(curr, solved) } };
}

// --- findMistakes: flag player bridges the unique solution can't support ---

function findMistakes(state: BridgesState): readonly BridgesMistake[] {
  const solved = state.workingCopy();
  if (solveFromScratch(solved, 10) === 0) return [];
  const out: BridgesMistake[] = [];
  for (const is of state.islands) {
    for (let d = 0; d < is.points.length; d++) {
      const pt = is.points[d];
      if (pt.dx === -1 || pt.dy === -1) continue; // span once (right/down)
      if (pt.off === 0) continue;
      const gline = pt.dx ? G_LINEH : G_LINEV;
      const playerCount = state.gridCount(pt.x, pt.y, gline);
      const solvedCount = solved.gridCount(pt.x, pt.y, gline);
      // The player has more bridges here than the unique solution supports.
      if (playerCount > solvedCount) {
        out.push({
          x1: is.x,
          y1: is.y,
          x2: is.x + pt.off * pt.dx,
          y2: is.y + pt.off * pt.dy,
        });
      }
    }
  }
  return out;
}

export const bridgesGame: Game<
  BridgesParams,
  BridgesState,
  BridgesMove,
  BridgesUi,
  BridgesDrawState,
  BridgesMistake
> = {
  id: "bridges",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  needsRightButton: true,
  preferredTileSize: PREFERRED_TILE_SIZE,

  defaultParams,
  presets(): PresetMenu<BridgesParams> {
    return {
      title: "Type",
      submenu: BRIDGES_PRESETS.map((p) => ({
        title: `${p.w}x${p.h} ${DIFFICULTY_NAMES[p.difficulty]}`,
        params: { ...p },
      })),
    };
  },
  encodeParams,
  decodeParams,
  validateParams,

  // Type-summary keys must match the augmentation template (augmentation.ts).
  describeParams: (p) => ({
    difficulty: p.difficulty,
    "allow-loops": p.allowloops,
    "max-bridges-per-direction": p.maxb - 1,
    "percentage-of-island-squares": p.islands / 5 - 1,
    "expansion-factor": p.expansion / 10,
  }),

  // Custom "Type…" dialog — index-for-index with bridges.c game_configure.
  paramConfig: [
    ...dimensionParamConfig<BridgesParams>(),
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: ["Easy", "Medium", "Hard"],
      get: (p) => p.difficulty,
      set: (p, v) => {
        p.difficulty = v;
      },
    },
    {
      kw: "allow-loops",
      name: "Allow loops",
      type: "boolean",
      get: (p) => p.allowloops,
      set: (p, v) => {
        p.allowloops = v;
      },
    },
    {
      kw: "max-bridges-per-direction",
      name: "Max. bridges per direction",
      type: "choices",
      choices: ["1", "2", "3", "4"],
      get: (p) => p.maxb - 1,
      set: (p, v) => {
        p.maxb = v + 1;
      },
    },
    {
      kw: "percentage-of-island-squares",
      name: "%age of island squares",
      type: "choices",
      choices: ["5%", "10%", "15%", "20%", "25%", "30%"],
      get: (p) => Math.trunc(p.islands / 5) - 1,
      set: (p, v) => {
        p.islands = (v + 1) * 5;
      },
    },
    {
      kw: "expansion-factor",
      name: "Expansion factor (%age)",
      type: "choices",
      choices: ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%", "100%"],
      get: (p) => Math.trunc(p.expansion / 10),
      set: (p, v) => {
        p.expansion = v * 10;
      },
    },
  ],

  newDesc(p: BridgesParams, rng: RandomState): { desc: string; aux?: string } {
    return newBridgesDesc(p, rng);
  },
  validateDesc,
  newState(p: BridgesParams, desc: string): BridgesState {
    return newStateFromDesc(p, desc);
  },
  newUi,

  interpretMove,
  executeMove,

  status(s: BridgesState): GameStatus {
    return s.completed ? "solved" : "ongoing";
  },

  solve,
  findMistakes,

  textFormat,
  prefs,

  colours(defaultBackground: Colour): Colour[] {
    return colours(defaultBackground);
  },
  computeSize(p: BridgesParams, tileSize: number): Size {
    return computeSize(p, tileSize);
  },
  setTileSize(ds: BridgesDrawState, tileSize: number): void {
    setTileSize(ds, tileSize);
  },
  newDrawState,
  redraw(
    dr,
    ds,
    prev,
    s,
    _dir,
    ui,
    _animTime,
    flashTime,
    _hint?: HintStep<BridgesMove>,
    mistakes?: readonly BridgesMistake[],
  ): void {
    redrawBridges(dr, ds, prev, s, ui, flashTime, mistakes);
  },
  animLength(): number {
    return 0;
  },
  flashLength(a: BridgesState, b: BridgesState): number {
    if (!a.completed && b.completed && !a.solved && !b.solved) return FLASH_TIME;
    return 0;
  },
};

registerGame(bridgesGame);
