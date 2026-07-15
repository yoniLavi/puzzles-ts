/**
 * Net — Simon Tatham's original wire-rotation puzzle, native TS port.
 *
 * A `w × h` grid of wire tiles whose solved form is a spanning tree rooted at a
 * movable source; the player rotates each tile until every tile is powered. The
 * model (direction algebra, desc codec, spanning-tree generator, power flood)
 * lives in `engine/wires.ts`, shared with Netslide; this file is the glue —
 * input, moves, solve, preferences, and the game object.
 */

import type { ConfigValues, GameStatus, Point, Size } from "../../../puzzle/types.ts";
import type { Game, GamePref, SolveResult } from "../../engine/game.ts";
import { UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  isCursorMove,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { anticlockwise, clockwise, D, L, offset, opposite, R, U } from "../../engine/wires.ts";
import type { RandomState } from "../../random/index.ts";
import { randomUpto } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { netSolver, SOLVER_INCONSISTENT } from "./solver.ts";
import {
  ANIM_TIME,
  colours,
  computeSize,
  FLASH_FRAME,
  lineThick,
  type NetDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
  WINDOW_OFFSET,
} from "./render.ts";
import {
  atof,
  cloneState,
  computeActive,
  decodeParams,
  defaultParams,
  encodeParams,
  formatG,
  isComplete,
  LOCKED,
  type NetMove,
  type NetOp,
  type NetParams,
  type NetState,
  type NetUi,
  newState,
  newUi,
  validateDesc,
  validateParams,
} from "./state.ts";

/* ----------------------------------------------------------------------
 * Presets.
 *
 * All ten upstream presets. The web build defines `NARROW_BORDERS` but *not*
 * `SMALL_SCREEN`, so the two 13×11 presets the `#ifndef SMALL_SCREEN` guards are
 * included — matching what the C web build actually shows.
 */
const PRESETS: NetParams[] = [
  { w: 5, h: 5, wrapping: false, unique: true, barrierProbability: 0 },
  { w: 7, h: 7, wrapping: false, unique: true, barrierProbability: 0 },
  { w: 9, h: 9, wrapping: false, unique: true, barrierProbability: 0 },
  { w: 11, h: 11, wrapping: false, unique: true, barrierProbability: 0 },
  { w: 13, h: 11, wrapping: false, unique: true, barrierProbability: 0 },
  { w: 5, h: 5, wrapping: true, unique: true, barrierProbability: 0 },
  { w: 7, h: 7, wrapping: true, unique: true, barrierProbability: 0 },
  { w: 9, h: 9, wrapping: true, unique: true, barrierProbability: 0 },
  { w: 11, h: 11, wrapping: true, unique: true, barrierProbability: 0 },
  { w: 13, h: 11, wrapping: true, unique: true, barrierProbability: 0 },
];

const presetTitle = (p: NetParams): string =>
  `${p.w}x${p.h}${p.wrapping ? " wrapping" : ""}`;

/* ----------------------------------------------------------------------
 * Moves.
 */

/** Apply one A/C/F rotation to a wire mask (keeping the LOCKED bit). */
function rotateTile(op: "A" | "C" | "F", tile: number): number {
  const wires = tile & 0xf;
  const rotated =
    op === "A" ? anticlockwise(wires) : op === "C" ? clockwise(wires) : opposite(wires);
  return rotated | (tile & LOCKED);
}

function applyOp(tiles: Uint8Array, w: number, o: NetOp): void {
  const i = o.y * w + o.x;
  if (o.op === "L") tiles[i] ^= LOCKED;
  else tiles[i] = rotateTile(o.op, tiles[i]);
}

function executeMove(s: NetState, m: NetMove): NetState {
  const next = cloneState(s);
  let lastRotateX = 0;
  let lastRotateY = 0;
  let lastRotateDir = 0;
  let usedSolve = s.usedSolve;

  switch (m.type) {
    case "rotate": {
      next.tiles[m.y * s.w + m.x] = rotateTile(m.op, next.tiles[m.y * s.w + m.x]);
      lastRotateX = m.x;
      lastRotateY = m.y;
      lastRotateDir = m.op === "A" ? 1 : m.op === "C" ? -1 : 2;
      break;
    }
    case "lock": {
      next.tiles[m.y * s.w + m.x] ^= LOCKED;
      // A lock commits with no animation (dir stays 0) but still records the
      // tile, matching upstream's `!noanim` tail.
      lastRotateX = m.x;
      lastRotateY = m.y;
      break;
    }
    case "jumble":
    case "solve": {
      for (const o of m.ops) applyOp(next.tiles, s.w, o);
      if (m.type === "solve") usedSolve = true;
      break;
    }
  }

  const tiled: NetState = {
    ...next,
    usedSolve,
    lastRotateX,
    lastRotateY,
    lastRotateDir,
  };
  // `completed` is monotonic (upstream only ever sets it true).
  return s.completed ? tiled : { ...tiled, completed: isComplete(tiled) };
}

function interpretMove(
  s: NetState,
  ui: NetUi,
  ds: NetDrawState | null,
  p: Point,
  rawButton: number,
): NetMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const shift = (rawButton & MOD_SHFT) !== 0;
  const ctrl = (rawButton & MOD_CTRL) !== 0;

  let nullret: null | UiUpdate = null;
  let tx = -1;
  let ty = -1;
  let dirBit = 0;
  type Action =
    | "none"
    | "rotateLeft"
    | "rotate180"
    | "rotateRight"
    | "toggleLock"
    | "jumble"
    | "moveOrigin"
    | "moveSource"
    | "moveOriginAndSource"
    | "moveCursor";
  let action: Action = "none";

  if (
    button === LEFT_BUTTON ||
    button === MIDDLE_BUTTON ||
    button === RIGHT_BUTTON
  ) {
    if (ui.curVisible) {
      ui.curVisible = false;
      nullret = UI_UPDATE;
    }

    // Pixel → tile. (No stylus branch: the midend strips MOD_STYLUS for us, so a
    // touch tap rotates left and a long-press right — deliberate divergence,
    // playbook §3.8b. Lock stays on the middle button / `s`.)
    const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
    const lt = lineThick(ts);
    const px = Math.floor(p.x) - WINDOW_OFFSET - lt;
    const py = Math.floor(p.y) - WINDOW_OFFSET - lt;
    tx = Math.floor(px / ts);
    ty = Math.floor(py / ts);
    if (px < 0 || py < 0 || tx >= s.w || ty >= s.h) return nullret;
    tx = (tx + ui.orgX) % s.w;
    ty = (ty + ui.orgY) % s.h;
    if (px % ts >= ts - lt || py % ts >= ts - lt) return nullret; // in the gutter

    action =
      button === LEFT_BUTTON
        ? "rotateLeft"
        : button === RIGHT_BUTTON
          ? "rotateRight"
          : "toggleLock";
  } else if (isCursorMove(button)) {
    dirBit =
      button === CURSOR_UP
        ? U
        : button === CURSOR_DOWN
          ? D
          : button === CURSOR_LEFT
            ? L
            : R;
    action =
      shift && ctrl
        ? "moveOriginAndSource"
        : shift
          ? "moveOrigin"
          : ctrl
            ? "moveSource"
            : "moveCursor";
  } else if (
    button === 0x61 || // a
    button === 0x41 || // A
    button === 0x73 || // s
    button === 0x53 || // S
    button === 0x64 || // d
    button === 0x44 || // D
    button === 0x66 || // f
    button === 0x46 || // F
    button === CURSOR_SELECT ||
    button === CURSOR_SELECT2
  ) {
    tx = ui.curX;
    ty = ui.curY;
    if (button === 0x61 || button === 0x41 || button === CURSOR_SELECT) {
      action = "rotateLeft";
    } else if (button === 0x73 || button === 0x53 || button === CURSOR_SELECT2) {
      action = "toggleLock";
    } else if (button === 0x64 || button === 0x44) {
      action = "rotateRight";
    } else {
      action = "rotate180";
    }
    ui.curVisible = true;
  } else if (button === 0x6a || button === 0x4a) {
    action = "jumble";
  } else {
    return nullret;
  }

  if (action === "toggleLock") {
    return { type: "lock", x: tx, y: ty };
  }

  if (action === "rotateLeft" || action === "rotateRight" || action === "rotate180") {
    // A rotation has no effect on a locked tile.
    if (s.tiles[ty * s.w + tx] & LOCKED) return nullret;
    const op = action === "rotateLeft" ? "A" : action === "rotateRight" ? "C" : "F";
    return { type: "rotate", op, x: tx, y: ty };
  }

  if (action === "jumble") {
    // Rotate every unlocked tile a random amount, expanded into an explicit op
    // list so replay is deterministic (design D4).
    const ops: NetOp[] = [];
    for (let jy = 0; jy < s.h; jy++) {
      for (let jx = 0; jx < s.w; jx++) {
        if (!(s.tiles[jy * s.w + jx] & LOCKED)) {
          const r = randomUpto(ui.rs, 4);
          if (r) ops.push({ op: (["A", "F", "C"] as const)[r - 1], x: jx, y: jy });
        }
      }
    }
    return { type: "jumble", ops };
  }

  // The remaining actions are all cursor/origin/source transforms — UI-only.
  if (action === "moveOrigin" || action === "moveOriginAndSource") {
    if (!s.wrapping) return nullret; // origin shift is meaningless when bounded
    const o = offset(ui.orgX, ui.orgY, dirBit, s.w, s.h);
    ui.orgX = o.x;
    ui.orgY = o.y;
  }
  if (action === "moveSource" || action === "moveOriginAndSource") {
    const o = offset(ui.cx, ui.cy, dirBit, s.w, s.h);
    ui.cx = o.x;
    ui.cy = o.y;
  }
  if (action === "moveCursor") {
    const o = offset(ui.curX, ui.curY, dirBit, s.w, s.h);
    ui.curX = o.x;
    ui.curY = o.y;
    ui.curVisible = true;
  }
  return UI_UPDATE;
}

/* ----------------------------------------------------------------------
 * Solve.
 */

function solve(_orig: NetState, curr: NetState, aux?: string): SolveResult<NetMove> {
  const { w, h } = curr;
  const n = w * h;
  const target = new Uint8Array(n);

  if (aux) {
    for (let i = 0; i < n; i++) target[i] = Number.parseInt(aux[i], 16) | LOCKED;
  } else {
    const tiles = new Uint8Array(curr.tiles);
    const result = netSolver(w, h, tiles, curr.barriers, curr.wrapping);
    if (result === SOLVER_INCONSISTENT) {
      return { ok: false, error: "No solution exists for this puzzle" };
    }
    target.set(tiles); // determined tiles now carry their orientation | LOCKED
  }

  // Build the op list transforming the current grid into the target: unlock,
  // rotate the shortest way, then lock, per tile that differs.
  const ops: NetOp[] = [];
  for (let i = 0; i < n; i++) {
    const from = curr.tiles[i];
    const to = target[i];
    if (from === to) continue;
    const ft = from & 0xf;
    const tt = to & 0xf;
    const x = i % w;
    const y = Math.floor(i / w);

    if (from & LOCKED) ops.push({ op: "L", x, y });
    if (tt === anticlockwise(ft)) ops.push({ op: "A", x, y });
    else if (tt === clockwise(ft)) ops.push({ op: "C", x, y });
    else if (tt === opposite(ft)) ops.push({ op: "F", x, y });
    if (to & LOCKED) ops.push({ op: "L", x, y });
  }

  return { ok: true, move: { type: "solve", ops } };
}

/* ----------------------------------------------------------------------
 * Preferences + saved UI.
 */

const prefs: GamePref<NetUi>[] = [
  {
    kw: "unlocked-loops",
    name: "Highlight loops involving unlocked squares",
    type: "boolean",
    get: (ui) => ui.unlockedLoops,
    set: (ui, v) => {
      ui.unlockedLoops = v;
    },
  },
];

function encodeUi(ui: NetUi): string {
  return `O${ui.orgX},${ui.orgY};C${ui.cx},${ui.cy}`;
}

function decodeUi(ui: NetUi, encoded: string): void {
  const m = /^O(-?\d+),(-?\d+);C(-?\d+),(-?\d+)/.exec(encoded);
  if (!m) return;
  const [orgX, orgY, cx, cy] = m.slice(1).map(Number);
  // Bounds-check as upstream; the grid dimensions come from the current ui's
  // source, which newUi seeded from the state.
  if (Number.isInteger(orgX) && Number.isInteger(orgY)) {
    ui.orgX = orgX;
    ui.orgY = orgY;
  }
  if (Number.isInteger(cx) && Number.isInteger(cy)) {
    ui.cx = cx;
    ui.cy = cy;
  }
}

/* ----------------------------------------------------------------------
 * Status bar.
 */

function statusbarText(s: NetState, ui: NetUi): string {
  let text = "";
  let complete = false;
  if (s.usedSolve) {
    text = "Auto-solved. ";
    complete = true;
  } else if (s.completed) {
    text = "COMPLETED! ";
    complete = true;
  }

  // Omit the counter when the source tile is empty (it would always read 1).
  if (s.tiles[ui.cy * s.w + ui.cx] & 0xf) {
    const active = computeActive(s, ui.cx, ui.cy);
    let a = 0;
    let n2 = 0;
    for (let i = 0; i < s.w * s.h; i++) {
      if (active[i]) a++;
      if (s.tiles[i] & 0xf) n2++;
    }
    if (!complete || a < n2) text += `Active: ${a}/${n2}`;
  }

  return text;
}

/* ----------------------------------------------------------------------
 * The Game.
 */

export const netGame: Game<NetParams, NetState, NetMove, NetUi, NetDrawState> = {
  id: "net",
  wantsStatusbar: true,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,

  defaultParams,
  presets: () => ({
    title: "Net",
    submenu: PRESETS.map((p) => ({ title: presetTitle(p), params: { ...p } })),
  }),
  encodeParams,
  decodeParams,
  validateParams,

  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    "walls-wrap-around": p.wrapping,
    "barrier-probability": p.barrierProbability,
    // The template's `{…:, ambiguous|}` reads a numeric index: 0 = ", ambiguous"
    // (non-unique), 1 = "" (unique).
    "ensure-unique-solution": p.unique ? 1 : 0,
  }),

  paramConfig: [
    ...dimensionParamConfig<NetParams>(),
    {
      kw: "walls-wrap-around",
      name: "Walls wrap around",
      type: "boolean",
      get: (p) => p.wrapping,
      set: (p, v) => {
        p.wrapping = v;
      },
    },
    {
      kw: "barrier-probability",
      name: "Barrier probability",
      type: "string",
      get: (p) => formatG(p.barrierProbability),
      set: (p, v) => {
        p.barrierProbability = Math.fround(atof(v));
      },
    },
    {
      kw: "ensure-unique-solution",
      name: "Ensure unique solution",
      type: "boolean",
      get: (p) => p.unique,
      set: (p, v) => {
        p.unique = v;
      },
    },
  ],

  newDesc: (p: NetParams, rng: RandomState) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,

  status: (s): GameStatus => (s.completed ? "solved" : "ongoing"),

  solve,

  prefs,
  encodeUi,
  decodeUi,

  statusbarText,

  colours,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p, ts): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: (a, b, dir) => {
    const lastRotateDir = dir === -1 ? a.lastRotateDir : b.lastRotateDir;
    return lastRotateDir ? ANIM_TIME : 0;
  },

  flashLength: (a, b) => {
    // Flash on completion, unless it was auto-solved.
    if (a.completed || !b.completed || a.usedSolve || b.usedSolve) return 0;
    const size = Math.max(b.w, b.h);
    return FLASH_FRAME * (size + 4);
  },
};

registerGame(netGame);
