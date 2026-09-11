/**
 * Net — Simon Tatham's original wire-rotation puzzle.
 *
 * A `w × h` grid of wire tiles whose solved form is a spanning tree rooted at a
 * movable source; the player rotates each tile until every tile is powered. The
 * model (direction algebra, desc codec, spanning-tree generator, power flood)
 * lives in `engine/wires.ts`, shared with Netslide; this file is the glue —
 * input, moves, solve, preferences, and the game object.
 */

import { assertNever } from "../../engine/assert-never.ts";
import type { Game, GamePref, SolveResult } from "../../engine/game.ts";
import { UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import { atof, dimensionParamConfig, formatG } from "../../engine/params.ts";
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
import { randomUpto } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type { ConfigValues, GameStatus, Point } from "../../engine/types.ts";
import {
  anticlockwise,
  clockwise,
  D,
  L,
  offset,
  opposite,
  R,
  U,
} from "../../engine/wires.ts";
import { newDesc } from "./generator.ts";
import {
  colors,
  computeSize,
  FLASH_FRAME,
  lineThick,
  type NetDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  ROTATE_TIME,
  redraw,
  setTileSize,
} from "./render.ts";
import { netSolver, SOLVER_INCONSISTENT } from "./solver.ts";
import {
  computeActive,
  decodeParams,
  defaultParams,
  encodeParams,
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
 * Presets: upstream's ten, including the two 13×11 ones its `SMALL_SCREEN`
 * build leaves out (the web build showed them).
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

/** Each rotation's animation direction (see `NetState.lastRotateDir`). */
const ROTATE_DIR = { A: 1, C: -1, F: 2 } as const;

function executeMove(s: NetState, m: NetMove): NetState {
  const tiles = new Uint8Array(s.tiles);
  let lastRotateX = 0;
  let lastRotateY = 0;
  let lastRotateDir = 0;

  switch (m.type) {
    case "rotate":
      applyOp(tiles, s.w, m);
      lastRotateX = m.x;
      lastRotateY = m.y;
      lastRotateDir = ROTATE_DIR[m.op];
      break;
    case "lock":
      tiles[m.y * s.w + m.x] ^= LOCKED;
      // A lock records its tile but does not animate, matching upstream's
      // `!noanim` tail.
      lastRotateX = m.x;
      lastRotateY = m.y;
      break;
    case "jumble":
    case "solve":
      for (const o of m.ops) applyOp(tiles, s.w, o);
      break;
    default:
      return assertNever(m, "net: executeMove");
  }

  const next: NetState = {
    ...s,
    tiles,
    cheated: s.cheated || m.type === "solve",
    lastRotateX,
    lastRotateY,
    lastRotateDir,
  };
  // `completed` is monotonic (upstream only ever sets it true).
  return s.completed ? next : { ...next, completed: isComplete(next) };
}

/** Rotate the tile at `(x, y)`, or nothing: a locked tile does not turn. */
function rotateMove(s: NetState, op: "A" | "C" | "F", x: number, y: number) {
  return s.tiles[y * s.w + x] & LOCKED ? null : ({ type: "rotate", op, x, y } as const);
}

function interpretMove(
  s: NetState,
  ui: NetUi,
  ds: NetDrawState,
  p: Point,
  rawButton: number,
): NetMove | null | UiUpdate {
  const button = stripModifiers(rawButton);

  if (button === LEFT_BUTTON || button === MIDDLE_BUTTON || button === RIGHT_BUTTON) {
    const nullret = ui.cursor.visible ? UI_UPDATE : null;
    ui.cursor.visible = false;

    // Pixel → tile. (No stylus branch: the midend strips MOD_STYLUS for us, so a
    // touch tap rotates left and a long-press right — deliberate divergence,
    // docs/games/input.md § "Touch is stripped for you". Lock stays on the middle button / `s`.)
    const ts = ds.tilesize;
    const lt = lineThick(ts);
    const px = Math.floor(p.x) - lt;
    const py = Math.floor(p.y) - lt;
    const tx = Math.floor(px / ts);
    const ty = Math.floor(py / ts);
    if (px < 0 || py < 0 || tx >= s.w || ty >= s.h) return nullret;
    if (px % ts >= ts - lt || py % ts >= ts - lt) return nullret; // in the gutter
    const x = (tx + ui.orgX) % s.w;
    const y = (ty + ui.orgY) % s.h;
    if (button === MIDDLE_BUTTON) return { type: "lock", x, y };
    return rotateMove(s, button === LEFT_BUTTON ? "A" : "C", x, y) ?? nullret;
  }

  if (isCursorMove(button)) {
    const dir =
      button === CURSOR_UP
        ? U
        : button === CURSOR_DOWN
          ? D
          : button === CURSOR_LEFT
            ? L
            : R;
    // Shift moves the origin, Ctrl the source, both together moves both, and
    // a bare arrow moves the cursor. All are UI-only.
    const shift = (rawButton & MOD_SHFT) !== 0;
    const ctrl = (rawButton & MOD_CTRL) !== 0;
    if (shift) {
      if (!s.wrapping) return null; // origin shift is meaningless when bounded
      const o = offset(ui.orgX, ui.orgY, dir, s.w, s.h);
      ui.orgX = o.x;
      ui.orgY = o.y;
    }
    if (ctrl) {
      const o = offset(ui.cx, ui.cy, dir, s.w, s.h);
      ui.cx = o.x;
      ui.cy = o.y;
    }
    if (!shift && !ctrl) {
      const o = offset(ui.cursor.x, ui.cursor.y, dir, s.w, s.h);
      ui.cursor.x = o.x;
      ui.cursor.y = o.y;
      ui.cursor.visible = true;
    }
    return UI_UPDATE;
  }

  // Keys act on the cursor's tile: `a` `d` `f` rotate it anticlockwise,
  // clockwise and 180°, and `s` locks it.
  let op: NetOp["op"] | null = null;
  if (button === 0x61 || button === 0x41 || button === CURSOR_SELECT) op = "A";
  else if (button === 0x64 || button === 0x44) op = "C";
  else if (button === 0x66 || button === 0x46) op = "F";
  else if (button === 0x73 || button === 0x53 || button === CURSOR_SELECT2) op = "L";
  if (op) {
    const { x, y } = ui.cursor;
    ui.cursor.visible = true;
    return op === "L" ? { type: "lock", x, y } : rotateMove(s, op, x, y);
  }

  if (button === 0x6a || button === 0x4a) {
    // j: rotate every unlocked tile a random amount, expanded into an explicit
    // op list so replay is deterministic.
    const ops: NetOp[] = [];
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        if (s.tiles[y * s.w + x] & LOCKED) continue;
        const r = randomUpto(ui.rs, 4);
        if (r) ops.push({ op: (["A", "F", "C"] as const)[r - 1], x, y });
      }
    }
    return { type: "jumble", ops };
  }

  return null;
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
    // The solver leaves every determined tile at its orientation | LOCKED.
    target.set(curr.tiles);
    if (netSolver(w, h, target, curr.barriers, curr.wrapping) === SOLVER_INCONSISTENT) {
      return { ok: false, error: "No solution exists for this puzzle" };
    }
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
  // Upstream also range-checks each pair against the grid; this hook gets no
  // state to check against, so it rejects only a pair that is not an integer.
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
  const complete = s.cheated || s.completed;
  let text = "";
  if (s.cheated) text = "Auto-solved. ";
  else if (s.completed) text = "COMPLETED! ";

  // Omit the counter when the source tile is empty (it would always read 1).
  if (s.tiles[ui.cy * s.w + ui.cx] & 0xf) {
    const active = computeActive(s, ui.cx, ui.cy);
    let powered = 0;
    let wired = 0;
    for (let i = 0; i < s.w * s.h; i++) {
      if (active[i]) powered++;
      if (s.tiles[i] & 0xf) wired++;
    }
    if (!complete || powered < wired) text += `Active: ${powered}/${wired}`;
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

  newDesc,
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

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: (a, b, dir) => ((dir === -1 ? a : b).lastRotateDir ? ROTATE_TIME : 0),

  flashLength: (a, b) => {
    // Flash on completion, unless it was auto-solved.
    if (a.completed || !b.completed || a.cheated || b.cheated) return 0;
    return FLASH_FRAME * (Math.max(b.w, b.h) + 4);
  },
};

registerGame(netGame);
